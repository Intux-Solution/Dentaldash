
import { supabase } from '../config/supabaseClient';
import { StorageService } from './StorageService';

/**
 * Servicio para gestionar pacientes con Supabase
 */
export class PatientService {

  /**
   * Obtener todos los pacientes
   * @returns {Promise<Array>} Lista de pacientes
   */
  static async fetchAllPatients() {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Normalizar para que coincida con el frontend
      return data.map(p => ({
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
   * Buscar paciente por ID
   */
  static async getPatientById(id) {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
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

  /**
   * Subir archivo a Storage y retornar PATH (no URL pública)
   */
  static async uploadClinicalRecord(file, patientName) {
    if (!file) return null;

    try {
      // Generar un nombre de archivo único: timestamp_nombreoriginal
      const fileExt = file.name.split('.').pop();
      // Sanitizar nombre de paciente para usar en nombre de archivo if needed, 
      // pero para simplificar usamos random id + timestamp
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Sube el archivo y retorna el PATH (ej: "12345_imagen.jpg")
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
  static async createPatient(patientData) {
    try {
      let historiaClinicaPath = null;
      if (patientData.historiaClinicaFile) {
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
        historia_clinica_url: historiaClinicaPath, // Guardamos el PATH
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
      throw error;
    }
  }

  /**
   * Actualizar un paciente existente
   */
  static async updatePatient(patientData) {
    try {
      const id = patientData.id || patientData._id; // Supabase uses UUID as 'id'
      if (!id) throw new Error("Patient ID is required for update");

      const updates = {
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

      if (patientData.historiaClinicaFile) {
        updates.historia_clinica_url = await this.uploadClinicalRecord(patientData.historiaClinicaFile, patientData.nombre);
      } else if (patientData.historiaClinica === null || patientData.historia_clinica_url === null) {
        // Explicitly clear history URL if requested
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
      throw error;
    }
  }

  /**
   * Eliminar la historia clínica de un paciente (Archivo y URL)
   */
  static async deleteClinicalRecord(patientId, filePath) {
    try {
      if (!patientId) throw new Error("ID de paciente requerido");

      // 1. Borrar de Storage si hay un path
      if (filePath && !filePath.startsWith('http')) {
        await StorageService.deleteFile(filePath, 'clinical-records');
      }

      // 2. Limpiar el campo en la BD
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
  static async deletePatient(id) {
    try {
      // Opcional: Podríamos borrar el archivo de historia clínica antes del paciente
      // Pero primero hagamos el delete simple de la tabla.
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
  static async getAllUniqueInsurances() {
    try {
      // 1. Obtener de la configuración del profesional (profiles)
      const { data: { session } } = await supabase.auth.getSession();
      let profileInsurances = [];

      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('accepted_insurances')
          .eq('id', session.user.id)
          .single();
        if (profile?.accepted_insurances) {
          profileInsurances = profile.accepted_insurances;
        }
      }

      // 2. Obtener de los pacientes ya registrados
      const { data: patientData, error } = await supabase
        .from('patients')
        .select('obra_social');

      if (error) throw error;

      const patientInsurances = patientData
        .map(p => p.obra_social)
        .filter(val => val && val.trim() !== '');

      // 3. Combinar y quitar duplicados (ignorado mayúsculas/minúsculas para el set)
      const combined = [...new Set([...profileInsurances, ...patientInsurances])];

      // Ordenar alfabéticamente
      return combined.sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.error('Error fetching unique insurances:', error);
      return [];
    }
  }
}
