import { supabase } from '../config/supabaseClient';
import { StorageService } from './StorageService';
import { Patient } from '../types/database.types';

// Omitted type definitions for the internal payload mapping for brevity, but we use 'Partial<Patient>' heavily
export interface PatientPayload {
  id?: string;
  _id?: string;
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

/**
 * Servicio para gestionar pacientes con Supabase
 */
export class PatientService {

  /**
   * Obtener todos los pacientes
   * @returns {Promise<any[]>} Lista de pacientes
   */
  static async fetchAllPatients(): Promise<any[]> {
    try {
      // Eliminamos el getSession() innecesario que estaba causando un Deadlock en Supabase JS client.

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        obraSocial: p.obra_social,
        numeroAfiliado: p.numero_afiliado,
        fechaNacimiento: p.fecha_nacimiento,
        historiaClinica: p.historia_clinica_url || p.historia_clinica,
        ultimaVisita: p.ultima_visita,
        estado: p.estado || 'Activo',
      }));
    } catch (error) {
      console.error('Error fetching patients:', error);
      throw error;
    }
  }

  /**
   * Buscar paciente dinámicamente para la vista de listado
   */
  static async searchPatients(term: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .or(`nombre.ilike.%${term}%,dni.ilike.%${term}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        obraSocial: p.obra_social,
        numeroAfiliado: p.numero_afiliado,
        fechaNacimiento: p.fecha_nacimiento,
        historiaClinica: p.historia_clinica_url || p.historia_clinica,
        ultimaVisita: p.ultima_visita,
        estado: p.estado || 'Activo',
      }));
    } catch (error) {
      console.error('Error searching patients:', error);
      throw error;
    }
  }

  /**
   * Buscar paciente por ID
   */
  static async getPatientById(id: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return {
        ...data,
        obraSocial: data.obra_social,
        numeroAfiliado: data.numero_afiliado,
        fechaNacimiento: data.fecha_nacimiento,
        historiaClinica: data.historia_clinica_url || data.historia_clinica,
        estado: data.estado || 'Activo',
      };
    } catch (error) {
      console.error('Error getting patient by ID:', error);
      throw error;
    }
  }

  /**
   * Buscar paciente por DNI
   */
  static async getPatientByDni(dni: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('dni', dni)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      if (!data) return null;

      return {
        ...data,
        obraSocial: data.obra_social,
        numeroAfiliado: data.numero_afiliado,
        fechaNacimiento: data.fecha_nacimiento,
        historiaClinica: data.historia_clinica_url || data.historia_clinica,
        estado: data.estado || 'Activo',
      };
    } catch (error) {
      console.error('Error getting patient by DNI:', error);
      throw error;
    }
  }

  /**
   * Subir archivo a Storage y retornar PATH (no URL pública)
   */
  static async uploadClinicalRecord(file: File, patientName: string): Promise<string | null> {
    if (!file) return null;

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) throw new Error("No active session found");

      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}/${crypto.randomUUID()}.${fileExt}`;

      const path = await StorageService.uploadFile(file, 'clinical-records', fileName);
      return path;
    } catch (error) {
      console.error('Error uploading clinical record:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo paciente
   */
  static async createPatient(patientData: PatientPayload): Promise<any> {
    let historiaClinicaPath: string | null = null;
    try {
      if (patientData.historiaClinicaFile && patientData.nombre) {
        historiaClinicaPath = await this.uploadClinicalRecord(patientData.historiaClinicaFile, patientData.nombre);
      }

      const newPatient = {
        nombre: patientData.nombre,
        dni: patientData.dni,
        telefono: patientData.telefono,
        email: patientData.email,
        obra_social: patientData.obraSocial,
        numero_afiliado: patientData.numeroAfiliado,
        fecha_nacimiento: patientData.fechaNacimiento || null,
        alergias: patientData.alergias || 'Ninguna',
        antecedentes: patientData.antecedentes || 'Ninguno',
        notas: patientData.notas,
        estado: patientData.estado || 'Activo',
        historia_clinica_url: historiaClinicaPath,
        ultima_visita: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('patients')
        .insert([newPatient])
        .select()
        .single();

      if (error) throw error;

      return {
        ...data,
        obraSocial: data.obra_social,
        numeroAfiliado: data.numero_afiliado,
        fechaNacimiento: data.fecha_nacimiento,
        historiaClinica: data.historia_clinica_url || data.historia_clinica,
      };

    } catch (error) {
      console.error('Error creating patient:', error);
      // Rollback: Si subimos un archivo a Storage pero la DB falló, purgamos la imagen subida.
      if (historiaClinicaPath) {
        console.warn('Rolling back newly uploaded file due to DB failure...');
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
   * Actualizar un paciente existente
   */
  static async updatePatient(patientData: PatientPayload): Promise<any> {
    let newlyUploadedPath: string | null = null;
    try {
      const id = patientData.id || patientData._id;
      if (!id) throw new Error("Patient ID is required for update");

      const updates: any = {
        nombre: patientData.nombre,
        dni: patientData.dni,
        telefono: patientData.telefono,
        email: patientData.email,
        obra_social: patientData.obraSocial,
        numero_afiliado: patientData.numeroAfiliado,
        fecha_nacimiento: patientData.fechaNacimiento || null,
        alergias: patientData.alergias,
        antecedentes: patientData.antecedentes,
        notas: patientData.notas,
        estado: patientData.estado,
      };

      if (patientData.historiaClinicaFile && patientData.nombre) {
        newlyUploadedPath = await this.uploadClinicalRecord(patientData.historiaClinicaFile, patientData.nombre);
        updates.historia_clinica_url = newlyUploadedPath;
      } else if (patientData.historiaClinica === null || patientData.historia_clinica_url === null) {
        updates.historia_clinica_url = null;
      }

      const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        ...data,
        obraSocial: data.obra_social,
        numeroAfiliado: data.numero_afiliado,
        fechaNacimiento: data.fecha_nacimiento,
        historiaClinica: data.historia_clinica_url || data.historia_clinica,
        estado: data.estado,
      };
    } catch (error) {
      console.error('Error updating patient:', error);
      // Rollback: En actualizaciones también resguardamos la operación
      if (newlyUploadedPath) {
        console.warn('Rolling back newly uploaded file during update due to DB failure...');
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
   * Eliminar la historia clínica de un paciente (Archivo y URL)
   */
  static async deleteClinicalRecord(patientId: string, filePath: string): Promise<boolean> {
    try {
      if (!patientId) throw new Error("ID de paciente requerido");

      if (filePath && !filePath.startsWith('http')) {
        await StorageService.deleteFile(filePath, 'clinical-records');
      }

      const { error } = await supabase
        .from('patients')
        .update({ historia_clinica_url: null })
        .eq('id', patientId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting clinical record:', error);
      throw error;
    }
  }

  /**
   * Eliminar un paciente
   */
  static async deletePatient(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting patient:', error);
      throw error;
    }
  }

  /**
   * Obtener lista única de todas las obras sociales registradas (en perfil y en pacientes)
   */
  static async getAllUniqueInsurances(): Promise<string[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let profileInsurances: string[] = [];

      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('accepted_insurances')
          .eq('id', user.id)
          .single();
        if (profile?.accepted_insurances) {
          profileInsurances = profile.accepted_insurances;
        }
      }

      const { data: patientData, error } = await supabase
        .from('patients')
        .select('obra_social');

      if (error) throw error;

      const patientInsurances = patientData
        .map(p => p.obra_social)
        .filter(val => val && val.trim() !== '');

      const combined = [...new Set([...profileInsurances, ...patientInsurances])];

      return combined.sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.error('Error fetching unique insurances:', error);
      return [];
    }
  }
}
