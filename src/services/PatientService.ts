import { supabase } from '../config/supabaseClient';
import { StorageService } from './StorageService';
import { Patient } from '../types/database.types';
import { AddPatientSchema, UpdatePatientSchema } from '../schemas/patient.schema';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PatientPayload {
  /** UUID de PostgreSQL — fuente única de verdad, nunca usar _id */
  id?: string;
  user_id?: string;
  nombre?: string;
  dni?: string;
  telefono?: string;
  email?: string;
  obraSocial?: string;
  numeroAfiliado?: string;
  fechaNacimiento?: string;
  alergias?: string | string[];
  antecedentes?: string;
  notas?: string;
  estado?: string;
  historiaClinicaFile?: File;
  historiaClinica?: string | null;
  historia_clinica_url?: string | null;
}

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  user_id: string;
  fecha: string;
  diagnostico: string;
  tratamiento: string;
  odontogram_state: Record<string, unknown> | null;
  archivo_url?: string;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Helper: Normalizar DNI ───────────────────────────────────────────────────
/**
 * Elimina puntos, guiones y espacios del DNI antes de persistirlo.
 * Ejemplo: "12.345-678 A" → "12345678A"
 */
const sanitizeDni = (dni: string): string =>
  dni.replace(/[\.\-\s]/g, '').trim();

// ─── Helper: mapDbPatient ─────────────────────────────────────────────────────
/**
 * Función centralizada que transforma una fila de PostgreSQL (snake_case)
 * al modelo camelCase que usa la UI.
 */
const mapDbPatient = (p: any): Patient => ({
  ...p,
  obraSocial: p.obra_social,
  numeroAfiliado: p.numero_afiliado,
  fechaNacimiento: p.fecha_nacimiento,
  historiaClinica: p.historia_clinica_url ?? p.historia_clinica ?? null,
  ultimaVisita: p.ultima_visita,
  estado: p.estado ?? 'Activo',
});

// ─── PatientService ───────────────────────────────────────────────────────────

export class PatientService {

  /**
   * Obtener todos los pacientes (límite 300, sin paginación).
   * Para paginación real, ver fetchPatientsPaginated.
   */
  static async fetchAllPatients(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    return (data ?? []).map(mapDbPatient);
  }

  /**
   * Obtener pacientes con paginación real usando .range().
   * @param page - Número de página (base 1)
   * @param pageSize - Cantidad de registros por página
   */
  static async fetchPatientsPaginated(
    page: number,
    pageSize: number = 20
  ): Promise<PaginatedResult<Patient>> {
    // .range() es 0-indexed e inclusivo en ambos extremos
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('patients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const total = count ?? 0;
    return {
      data: (data ?? []).map(mapDbPatient),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Buscar pacientes por nombre o DNI.
   */
  static async searchPatients(term: string): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .or(`nombre.ilike.%${term}%,dni.ilike.%${term}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return (data ?? []).map(mapDbPatient);
  }

  /**
   * Obtener un paciente por ID.
   */
  static async getPatientById(id: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return mapDbPatient(data);
  }

  /**
   * Obtener un paciente por DNI.
   */
  static async getPatientByDni(dni: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('dni', dni)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data ? mapDbPatient(data) : null;
  }

  /**
   * Subir un archivo de historia clínica al Storage.
   * Retorna el PATH relativo dentro del bucket (no la URL pública).
   */
  static async uploadClinicalRecord(file: File, userId: string): Promise<string> {
    if (!userId) throw new Error('Authentication session missing or expired.');

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('clinical-records')
      .upload(filePath, file);

    if (uploadError) throw uploadError;
    return filePath;
  }

  /**
   * Añadir un nuevo registro clínico.
   */
  static async addClinicalRecord(
    patientId: string,
    record: Omit<ClinicalRecord, 'id' | 'created_at'>,
    userId: string
  ): Promise<ClinicalRecord> {
    const { data, error } = await supabase
      .from('treatment_history')
      .insert([{
        patient_id: patientId,
        user_id: userId,
        ...record,
        odontogram_state: record.odontogram_state
          ? JSON.stringify(record.odontogram_state)
          : null,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Crear un nuevo paciente.
   * Valida con Zod y sanitiza el DNI antes de persistir.
   */
  static async createPatient(patientData: PatientPayload, userId: string): Promise<Patient> {
    // — 1. Validación con Zod —
    const parsed = AddPatientSchema.safeParse(patientData);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(' | ');
      throw new Error(`Datos de paciente inválidos: ${message}`);
    }

    let historiaClinicaPath: string | null = null;
    try {
      // — 2. Subir archivo clínico si viene —
      if (patientData.historiaClinicaFile && userId) {
        historiaClinicaPath = await this.uploadClinicalRecord(
          patientData.historiaClinicaFile,
          userId
        );
      }

      // — 3. Construir payload para DB (con DNI sanitizado) —
      const newPatient = {
        nombre: patientData.nombre,
        dni: patientData.dni ? sanitizeDni(patientData.dni) : patientData.dni,
        telefono: patientData.telefono,
        email: patientData.email || null,
        obra_social: patientData.obraSocial,
        numero_afiliado: patientData.numeroAfiliado,
        fecha_nacimiento: patientData.fechaNacimiento || null,
        alergias: patientData.alergias ?? 'Ninguna',
        antecedentes: patientData.antecedentes ?? 'Ninguno',
        notas: patientData.notas,
        estado: patientData.estado ?? 'Activo',
        historia_clinica_url: historiaClinicaPath,
        ultima_visita: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('patients')
        .insert([newPatient])
        .select()
        .single();

      if (error) throw error;
      return mapDbPatient(data);

    } catch (error) {
      // Rollback: Si subimos un archivo pero la DB falló, borramos el archivo
      if (historiaClinicaPath) {
        try {
          await StorageService.deleteFile(historiaClinicaPath, 'clinical-records');
        } catch (cleanupError) {
          console.error('CRITICAL: Failed to rollback file in storage', cleanupError);
        }
      }
      throw error;
    }
  }

  /**
   * Actualizar un paciente existente.
   * Valida con Zod y sanitiza el DNI antes de persistir.
   */
  static async updatePatient(patientData: PatientPayload, userId: string): Promise<Patient> {
    // — 1. Validación con Zod —
    const parsed = UpdatePatientSchema.safeParse(patientData);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(' | ');
      throw new Error(`Datos de paciente inválidos: ${message}`);
    }

    const id = patientData.id;
    if (!id) throw new Error('Patient ID is required for update');

    let newlyUploadedPath: string | null = null;
    try {
      // — 2. Construir payload de actualización (con DNI sanitizado) —
      const updates: Record<string, any> = {
        nombre: patientData.nombre,
        dni: patientData.dni ? sanitizeDni(patientData.dni) : patientData.dni,
        telefono: patientData.telefono,
        email: patientData.email || null,
        obra_social: patientData.obraSocial,
        numero_afiliado: patientData.numeroAfiliado,
        fecha_nacimiento: patientData.fechaNacimiento || null,
        alergias: patientData.alergias,
        antecedentes: patientData.antecedentes,
        notas: patientData.notas,
        estado: patientData.estado,
      };

      // — 3. Manejo de archivo clínico —
      if (patientData.historiaClinicaFile && userId) {
        newlyUploadedPath = await this.uploadClinicalRecord(
          patientData.historiaClinicaFile,
          userId
        );
        updates.historia_clinica_url = newlyUploadedPath;
      } else if (
        patientData.historiaClinica === null ||
        patientData.historia_clinica_url === null
      ) {
        updates.historia_clinica_url = null;
      }

      const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return mapDbPatient(data);

    } catch (error) {
      console.error('Error updating patient:', error);
      // Rollback en caso de fallo en DB tras subir archivo
      if (newlyUploadedPath) {
        console.warn('Rolling back newly uploaded file during update...');
        try {
          await StorageService.deleteFile(newlyUploadedPath, 'clinical-records');
        } catch (cleanupError) {
          console.error('CRITICAL: Failed to rollback file in storage', cleanupError);
        }
      }
      throw error;
    }
  }

  /**
   * Eliminar la historia clínica de un paciente (Storage + DB).
   */
  static async deleteClinicalRecord(patientId: string, filePath: string): Promise<boolean> {
    if (!patientId) throw new Error('ID de paciente requerido');

    if (filePath && !filePath.startsWith('http')) {
      await StorageService.deleteFile(filePath, 'clinical-records');
    } else if (filePath && filePath.startsWith('http')) {
      const publicUrlBase = supabase.storage
        .from('clinical-records')
        .getPublicUrl('').data.publicUrl;
      const pathInBucket = filePath.substring(publicUrlBase.length);
      await StorageService.deleteFile(pathInBucket, 'clinical-records');
    }

    const { error } = await supabase
      .from('patients')
      .update({ historia_clinica_url: null })
      .eq('id', patientId);

    if (error) throw error;
    return true;
  }

  /**
   * Eliminar un paciente.
   */
  static async deletePatient(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  /**
   * Obtener lista única de todas las obras sociales registradas.
   */
  static async getAllUniqueInsurances(userId: string | null = null): Promise<string[]> {
    try {
      let profileInsurances: string[] = [];
      let uid = userId;

      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id ?? null;
      }

      if (uid) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('accepted_insurances')
          .eq('id', uid)
          .single();
        if (profile?.accepted_insurances) {
          profileInsurances = profile.accepted_insurances;
        }
      }

      const { data: patientData, error } = await supabase
        .from('patients')
        .select('obra_social');

      if (error) throw error;

      const patientInsurances = (patientData ?? [])
        .map((p) => p.obra_social)
        .filter((val): val is string => !!val && val.trim() !== '');

      const combined = [...new Set([...profileInsurances, ...patientInsurances])];
      return combined.sort((a, b) => a.localeCompare(b));

    } catch (error) {
      console.error('Error fetching unique insurances:', error);
      return [];
    }
  }
}
