import { URL_GET_PATIENTS, URL_CREATE_PATIENT, URL_UPDATE_PATIENT } from '../config/n8n.js';
import { apiFetch } from '../utils/api';

/**
 * Servicio para gestionar pacientes desde n8n
 */
export class PatientService {
  
  /**
   * Obtener todos los pacientes desde n8n
   * @returns {Promise<Array>} Lista de pacientes
   */
  static async fetchAllPatients() {
    try {
      
      
      const response = await apiFetch(URL_GET_PATIENTS, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // El webhook debería devolver: { patients: [...] }
      const patients = data.patients || [];
      
      
      return patients;
    } catch (error) {
      
      throw error;
    }
  }

  /**
   * Crear un nuevo paciente
   * *** ACTUALIZADO: Ahora soporta archivos ***
   * @param {Object} patientData - Datos del paciente (puede incluir historiaClinicaFile)
   * @returns {Promise<Object>} Paciente creado
   */
  static async createPatient(patientData) {
    try {
      

      let requestOptions;

      // *** LÓGICA CONDICIONAL: ARCHIVO vs JSON ***
      if (patientData.historiaClinicaFile) {
        // Si hay archivo, usar FormData
        
        
        const formData = new FormData();
        formData.append('nombre', patientData.nombre || '');
        formData.append('dni', patientData.dni || '');
        formData.append('telefono', patientData.telefono || '');
        formData.append('email', patientData.email || '');
        formData.append('obraSocial', patientData.obraSocial || '');
        formData.append('numeroafiliado', patientData.numeroAfiliado || ''); // lowercase para N8N
        formData.append('alergias', patientData.alergias || patientData.alergia || 'Ninguna');
        formData.append('antecedentes', patientData.antecedentes || 'Ninguno');
        formData.append('notas', patientData.notas || '');
        formData.append('clinicalRecord', patientData.historiaClinicaFile); // el archivo

        requestOptions = {
          method: 'POST',
          body: formData,
          // NO ponemos Content-Type, el navegador lo hace automáticamente para FormData
        };

      } else {
        // Sin archivo, usar JSON normal
        
        
        requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nombre: patientData.nombre || '',
            dni: patientData.dni || '',
            telefono: patientData.telefono || '',
            email: patientData.email || '',
            obraSocial: patientData.obraSocial || '',
            numeroAfiliado: patientData.numeroAfiliado || '',
            alergias: patientData.alergias || patientData.alergia || 'Ninguna',
            antecedentes: patientData.antecedentes || 'Ninguno',
            notas: patientData.notas || '',
          })
        };
      }

      // *** ÚNICA LLAMADA A N8N ***
      const response = await apiFetch(URL_CREATE_PATIENT, requestOptions);

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      

      // Normalizar la respuesta de N8N
      const normalizedPatient = {
        id: responseData.id || responseData._id || patientData.id || patientData._id || patientData.dni,
        nombre: responseData.nombre || responseData.name || patientData.nombre,
        dni: responseData.dni || responseData.DNI || patientData.dni,
        telefono: responseData.telefono || responseData.phone || patientData.telefono,
        email: responseData.email || patientData.email,
        obraSocial:
          responseData.obraSocial ||
          responseData.obra_social ||
          responseData['Obra Social'] ||
          responseData.insurance ||
          patientData.obraSocial,
        numeroAfiliado:
          responseData.numeroAfiliado ||
          responseData.numeroafiliado ||
          responseData.numero_afiliado ||
          responseData['Numero Afiliado'] ||
          responseData.affiliateNumber ||
          patientData.numeroAfiliado,
        fechaNacimiento: responseData.fechaNacimiento || responseData.birthDate || patientData.fechaNacimiento,
        alergias: responseData.alergias || responseData.allergies || patientData.alergias || 'Ninguna',
        notas: responseData.notas || responseData.notes || patientData.notas,
        historiaClinica: responseData.historiaClinica || responseData.clinicalRecord || '',
        ultimaVisita: responseData.ultimaVisita || responseData.lastVisit || '',
        // Mantener información del archivo si estaba presente
        hasFile: !!patientData.historiaClinicaFile,
        fileName: patientData.fileName,
      };

      
      return normalizedPatient;

    } catch (error) {
      throw error;
    }
  }

  /**
 * Actualizar un paciente existente
 * *** MEJORADO: Ahora soporta archivos ***
 * @param {Object} patientData - Datos del paciente (usar id o dni)
 * @returns {Promise<Object>} Paciente actualizado
 */
  static async updatePatient(patientData) {
  try {
  

    let requestOptions;

    // *** LÓGICA CONDICIONAL: ARCHIVO vs JSON ***
    if (patientData.historiaClinicaFile) {
      // Si hay archivo, usar FormData
      
      
      const formData = new FormData();
      const appended = new Set();

      // Normaliza arrays (vienen así desde n8n) a su primer valor
      const normalizeValue = (value) => {
        if (value == null) return '';
        if (Array.isArray(value)) return value[0] ?? '';
        return value;
      };

      // Evita duplicar campos (dni/id) que generan arrays en n8n
      const appendOnce = (key, value) => {
        if (appended.has(key)) return;
        const normalized = normalizeValue(value);
        if (normalized === '' || normalized === undefined) return;
        // Si es archivo, adjuntarlo tal cual; si no, enviarlo como string
        const isBlob = typeof Blob !== 'undefined' && normalized instanceof Blob;
        formData.append(key, isBlob ? normalized : String(normalized));
        appended.add(key);
      };

      // Identificador: usar DNI o id si existe
      if (patientData.dni) appendOnce('dni', patientData.dni);
      else if (patientData.id || patientData._id) appendOnce('id', patientData.id || patientData._id);
      
      // Agregar todos los campos del formulario (sin duplicar dni/id ni el archivo)
      Object.entries(patientData).forEach(([key, value]) => {
        if (key === 'historiaClinicaFile' || key === 'fechaNacimiento') return;
        appendOnce(key, value);
      });
      
      // Agregar el archivo con el nombre esperado por n8n
      appendOnce('historiaClinica', patientData.historiaClinicaFile);

      requestOptions = {
        method: 'POST',
        body: formData,
        // NO ponemos Content-Type, el navegador lo setea automáticamente
      };
    } else {
      // Sin archivo, usar JSON normal
      
      
      const sanitized = { ...patientData };
      // Normalizar arrays a strings para evitar que n8n reciba listas
      Object.entries(sanitized).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          sanitized[key] = value[0] ?? '';
        }
      });
      delete sanitized.fechaNacimiento;

      requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitized)
      };
    }

    const response = await apiFetch(URL_UPDATE_PATIENT, requestOptions);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Normalizar respuesta
    const updatedPatient = {
      ...patientData,
      ...result,
      ...(result.data || {}),
    };

    
    return updatedPatient;

  } catch (error) {
    throw error;
  }
  }
}
