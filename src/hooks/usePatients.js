import { useState, useEffect, useCallback } from 'react';
import { PatientService } from '../services/PatientService';

/** Helper: parse ISO/date-like string to ms */
const toMs = (v) => {
  if (!v) return 0;
  const n = Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
};

/** Ensure each patient carries createdTime (ISO) and _createdAt (ms) */
const normalizePatient = (p) => {
  if (!p) return p;
  const createdIso =
    p.createdTime ??
    p.fechaCreacion ??
    p.fechaRegistro ??
    p.FechaRegistro ??
    p['Fecha Registro'] ??
    p.created_at ??
    p.createdAt ??
    '';

  const createdTime = p.createdTime ?? createdIso ?? '';
  const createdMs = toMs(createdTime) || (typeof p._createdAt === 'number' ? p._createdAt : Date.now());

  // Normalización básica para evitar inconsistencias en el estado local después de un UPDATE
  return {
    ...p,
    id: p.id || p._id || p.dni,
    nombre: p.nombre || p.name,
    obraSocial: p.obraSocial || p.obra_social,
    numeroAfiliado: p.numeroAfiliado || p.numero_afiliado,
    historiaClinica: p.historiaClinica || p.historia_clinica_url || p.historia_clinica,
    estado: p.estado || p.Estado || 'Activo',
    createdTime,
    _createdAt: createdMs,
  };
};

/**
 * Hook personalizado para gestionar el estado de los pacientes
 * @returns {Object} Estado y funciones para manejar pacientes
 */
export function usePatients(session = null) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const userId = session?.user?.id;

  /**
   * Cargar todos los pacientes desde n8n
   */
  const loadPatients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fetchedPatients = await PatientService.fetchAllPatients();
      const normalized = Array.isArray(fetchedPatients)
        ? fetchedPatients.map(normalizePatient)
        : [];
      setPatients(normalized);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Agregar un nuevo paciente
   * @param {Object} patientData - Datos del paciente
   */
  const addPatient = useCallback(async (patientData) => {
    setLoading(true);
    setError(null);

    try {
      // Inyectamos userId si está disponible en la sesión
      const dataToSave = userId ? { ...patientData, user_id: userId } : patientData;
      const newPatientRaw = await PatientService.createPatient(dataToSave, userId);
      const newPatient = (Array.isArray(newPatientRaw) ? newPatientRaw[0]?.patient : newPatientRaw?.patient) || newPatientRaw || {};

      const createdTime =
        newPatient?.data?.createdTime ||
        newPatient?.createdTime ||
        patientData?.createdTime ||
        new Date().toISOString();

      const normalized = normalizePatient({ ...newPatient, createdTime });
      setPatients((prevPatients) => [...prevPatients, normalized]);

      return normalized;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Actualizar un paciente existente
   * @param {Object} patientData - Datos del paciente (usar id o dni)
   */
  const updatePatient = useCallback(async (patientData) => {
    setLoading(true);
    setError(null);

    try {
      const updatedRaw = await PatientService.updatePatient(patientData, userId);
      const updatedPatient = (Array.isArray(updatedRaw) ? updatedRaw[0]?.patient : updatedRaw?.patient) || updatedRaw || {};

      setPatients((prevPatients) => {
        const targetKey = patientData?.id || patientData?._id || patientData?.dni;
        return prevPatients.map((patient) => {
          const pKey = patient?.id || patient?._id || patient?.dni;
          return targetKey && pKey === targetKey
            ? normalizePatient({ ...patient, ...updatedPatient })
            : patient;
        });
      });

      return updatedPatient;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refrescar la lista de pacientes
   */
  const refreshPatients = useCallback(() => {
    loadPatients();
  }, [loadPatients]);

  // Cargar pacientes al montar el componente
  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Refrescar automáticamente cuando un webhook mutador de pacientes finaliza
  useEffect(() => {
    const handleWebhookMutation = (e) => {
      const method = String(e?.detail?.method || '').toUpperCase();
      if (method === 'GET') return;
      const url = String(e?.detail?.url || '');
      const touchesPatients = !url || /patient/i.test(url);
      if (!touchesPatients) return;
      loadPatients();
    };
    const handleRefresh = () => loadPatients();

    window.addEventListener('webhook:mutated', handleWebhookMutation);
    window.addEventListener('patients:refresh', handleRefresh);
    return () => {
      window.removeEventListener('webhook:mutated', handleWebhookMutation);
      window.removeEventListener('patients:refresh', handleRefresh);
    };
  }, [loadPatients]);

  return {
    patients,
    loading,
    error,
    loadPatients,
    addPatient,
    updatePatient,
    refreshPatients,
  };
}
