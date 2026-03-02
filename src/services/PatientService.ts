import { supabase } from '../config/supabaseClient';
import { StorageService } from './StorageService';
import { Patient, PatientPayload, ClinicalRecord, DbPatientRow, PaginatedResult } from '../types/database.types';
import { AddPatientSchema, UpdatePatientSchema } from '../schemas/patient.schema';

// ─── Helper: Normalizar DNI ───────────────────────────────────────────────────
/**
 * Elimina puntos, guiones y espacios del DNI antes de persistirlo.
 * Ejemplo: "12.345-678 A" → "12345678A"
 */
const sanitizeDni = (dni: string): string =>
  dni.replace(/[\.\-\s]/g, '').trim();

// ─── Helper: mapDbPatient ─────────────────────────────────────────────────────

const mapDbPatient = (p: DbPatientRow): Patient => {
  let publicUrl = p.historia_clinica_url ?? p.historia_clinica ?? null;
  if (publicUrl && !publicUrl.startsWith('http')) {
    const { data } = supabase.storage.from('clinical-records').getPublicUrl(publicUrl);
    publicUrl = data.publicUrl;
  }

  return {
    ...(p as unknown as Patient),
    obraSocial: p.obra_social,
    numeroAfiliado: p.numero_afiliado,
    fechaNacimiento: p.fecha_nacimiento,
    historiaClinica: publicUrl,
    ultimaVisita: p.ultima_visita,
    estado: p.estado ?? 'Activo',
  };
};

// ─── Constantes y Validaciones ───────────────────────────────────────────────
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png'
];

// ─── PatientService ───────────────────────────────────────────────────────────

export class PatientService {


  /**
   * Obtener pacientes con paginación real usando .range() y filtrado server-side.
   * @param page - Número de página (base 1)
   * @param pageSize - Cantidad de registros por página
   * @param searchTerm - Término de búsqueda (nombre o dni)
   * @param statusFilter - Filtro de estado (ej: 'Activo', 'Todos')
   */
  static async fetchPatientsPaginated(
    page: number,
    pageSize: number = 20,
    searchTerm: string = '',
    statusFilter: string = 'Todos'
  ) {
    // .range() es 0-indexed e inclusivo en ambos extremos
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('patients')
      .select('*', { count: 'exact' });

    if (searchTerm.trim()) {
      query = query.or(`nombre.ilike.%${searchTerm.trim()}%,dni.ilike.%${searchTerm.trim()}%`);
    }

    if (statusFilter !== 'Todos') {
      query = query.eq('estado', statusFilter);
    } else {
      query = query.neq('estado', 'Inactivo');
    }

    query = query.is('deleted_at', null);

    const { data, error, count } = await query
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

  static async searchPatients(term: string): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .is('deleted_at', null)
      .neq('estado', 'Inactivo')
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

    // File Validation
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`El archivo excede el límite de 5MB.`);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`Tipo de archivo no permitido. Solo se permiten PDF, JPEG y PNG.`);
    }

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
      const updates: Record<string, unknown> = {
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
        .eq('user_id', userId)
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

  static async deleteClinicalRecord(patientId: string, filePath: string, userId: string): Promise<boolean> {
    if (!patientId) throw new Error('ID de paciente requerido');

    // Security check before deleting bucket data
    const { data: ownCheck, error: ownCheckError } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .eq('user_id', userId)
      .single();
    if (ownCheckError || !ownCheck) throw new Error("Unauthorized to update this patient.");

    if (filePath) {
      await StorageService.deleteFile(filePath, 'clinical-records');
    }

    const { error } = await supabase
      .from('patients')
      .update({ historia_clinica_url: null })
      .eq('id', patientId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  static async deletePatient(id: string, userId: string): Promise<boolean> {
    // Implementación de Soft Delete: Legal/Compliance.
    // Marcamos el paciente como inactivo y seteamos deleted_at.
    const { error } = await supabase
      .from('patients')
      .update({
        estado: 'Inactivo',
        deleted_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

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

      // V2: Optimizado vía RPC. Esto hace e SELECT DISTINCT en la BDD
      // previniendo cuellos de botella de memoria al enviar miles de filas al cliente.
      const { data: patientData, error } = await supabase
        .rpc('get_unique_insurances');

      if (error) throw error;

      const patientInsurances = (patientData ?? [])
        .map((p: any) => p.obra_social)
        .filter((val): val is string => !!val && val.trim() !== '');

      const combined = [...new Set([...profileInsurances, ...patientInsurances])];
      return combined.sort((a, b) => a.localeCompare(b));

    } catch (error) {
      console.error('Error fetching unique insurances:', error);
      return [];
    }
  }
}
