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
  const publicUrl = p.historia_clinica_url ?? p.historia_clinica ?? null;

  return {
    ...(p as unknown as Patient),
    obraSocial: p.obra_social,
    numeroAfiliado: p.numero_afiliado,
    fechaNacimiento: p.fecha_nacimiento,
    historiaClinica: publicUrl ?? undefined,
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
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const uploadedPath = await StorageService.uploadFile(file, 'clinical-records', filePath);
    if (!uploadedPath) throw new Error('No se pudo completar la subida del archivo');

    return uploadedPath;
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
      .insert([(() => {
        const { patient_id: _rp, user_id: _ru, odontogram_state, ...rest } = record as any;
        return {
          ...rest,
          patient_id: patientId,
          user_id: userId,
          odontogram_state: odontogram_state
            ? JSON.stringify(odontogram_state)
            : null,
        };
      })()])
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

      // — 4. Soft Delete Restoration Logic —
      let existingPatient = null;
      if (newPatient.dni) {
        let attempt = 0;
        let searchSuccess = false;

        while (attempt < 3 && !searchSuccess) {
          try {
            const { data: searchData, error: searchError } = await supabase
              .from('patients')
              .select('id')
              .eq('dni', newPatient.dni)
              .maybeSingle();

            if (searchError && searchError.code !== 'PGRST116') {
              throw searchError;
            }
            existingPatient = searchData;
            searchSuccess = true;
          } catch (e: any) {
            attempt++;
            if (attempt >= 3) {
              console.error(`Patient DNI search failed after 3 attempts`, e);
              // Force throw to abort if network is truly down
              throw new Error(`Error de red al buscar el paciente (Intento ${attempt}): ${e.message || JSON.stringify(e)}`);
            }
            // Wait 500ms before retrying network closures
            await new Promise(res => setTimeout(res, 500));
          }
        }
      }

      let response;

      if (existingPatient) {
        // Restauración (Update)
        response = await supabase
          .from('patients')
          .update({
            ...newPatient,
            estado: 'Activo',
            deleted_at: null
          })
          .eq('id', existingPatient.id)
          .select()
          .single();
      } else {
        // Inserción (Nuevo paciente)
        response = await supabase
          .from('patients')
          .insert([newPatient])
          .select()
          .single();
      }

      const { data, error } = response;

      if (error) throw error;
      return mapDbPatient(data);

    } catch (errorUnknown: any) {
      const errorMessage = errorUnknown?.message
        ? errorUnknown.message
        : (typeof errorUnknown === 'object' ? JSON.stringify(errorUnknown) : String(errorUnknown));
      const finalError = new Error(errorMessage || 'Ocurrió un error inesperado de red.');

      // Rollback: Si subimos un archivo pero la DB falló, borramos el archivo
      if (historiaClinicaPath) {
        try {
          await StorageService.deleteFile(historiaClinicaPath, 'clinical-records');
        } catch (cleanupErrorUnknown: unknown) {
          const cleanupError = cleanupErrorUnknown instanceof Error ? cleanupErrorUnknown : new Error(String(cleanupErrorUnknown) || "Ocurrió un error inesperado.");
          console.error('CRITICAL: Failed to rollback file in storage', cleanupError);
        }
      }
      throw finalError;
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

    } catch (errorUnknown: unknown) {
      const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
      console.error('Error updating patient:', error);
      // Rollback en caso de fallo en DB tras subir archivo
      if (newlyUploadedPath) {
        console.warn('Rolling back newly uploaded file during update...');
        try {
          await StorageService.deleteFile(newlyUploadedPath, 'clinical-records');
        } catch (cleanupErrorUnknown: unknown) {
          const cleanupError = cleanupErrorUnknown instanceof Error ? cleanupErrorUnknown : new Error(String(cleanupErrorUnknown) || "Ocurrió un error inesperado.");
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
        .filter((val: unknown): val is string => typeof val === 'string' && val.trim() !== '');

      const combined = [...new Set([...profileInsurances, ...patientInsurances])];
      return combined.sort((a, b) => a.localeCompare(b));

    } catch (errorUnknown: unknown) {
      const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
      console.error('Error fetching unique insurances:', error);
      return [];
    }
  }
}
