import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PatientService } from '../services/PatientService';

// ─── Query Key ────────────────────────────────────────────────────────────────
export const PATIENTS_KEY = ['patients'];

// ─── Helper local (sólo para normalización defensiva en este hook) ────────────
const toMs = (v) => {
  if (!v) return 0;
  const n = Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
};

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
  const createdMs =
    toMs(createdTime) || (typeof p._createdAt === 'number' ? p._createdAt : Date.now());

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
 * Hook de pacientes — powered by TanStack Query.
 *
 * Expone exactamente la misma interfaz que la versión anterior para que
 * AuthedApp y useModals no necesiten cambios.
 *
 * @param {Object|null} session - Sesión de Supabase
 * @param {number} page - Página actual (base 1), default 1
 * @param {number} pageSize - Registros por página, default 300 (retrocompat)
 */
export function usePatients(session = null, page = 1, pageSize = 300) {
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();

  // ── Invalidar queries manualmente (para eventos de window) ────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });

  // ── Escuchar eventos globales de refresco ─────────────────────────────────
  useEffect(() => {
    const handleWebhookMutation = (e) => {
      const method = String(e?.detail?.method || '').toUpperCase();
      if (method === 'GET') return;
      const url = String(e?.detail?.url || '');
      if (!url || /patient/i.test(url)) invalidate();
    };

    window.addEventListener('webhook:mutated', handleWebhookMutation);
    window.addEventListener('patients:refresh', invalidate);
    return () => {
      window.removeEventListener('webhook:mutated', handleWebhookMutation);
      window.removeEventListener('patients:refresh', invalidate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── useQuery: carga y caché de pacientes ──────────────────────────────────
  const {
    data: paginatedResult,
    isLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [...PATIENTS_KEY, page, pageSize],
    queryFn: () => PatientService.fetchPatientsPaginated(page, pageSize),
    select: (result) => ({
      ...result,
      data: result.data.map(normalizePatient),
    }),
  });

  // ── useMutation: crear paciente ───────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (patientData) => PatientService.createPatient(patientData, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
      window.dispatchEvent(new CustomEvent('patients:refresh'));
    },
  });

  // ── useMutation: actualizar paciente ─────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (patientData) => PatientService.updatePatient(patientData, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
      window.dispatchEvent(new CustomEvent('patients:refresh'));
    },
  });

  // ── useMutation: eliminar paciente ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => PatientService.deletePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
    },
  });

  // ── API pública (retrocompatible con la versión anterior del hook) ─────────
  const patients = paginatedResult?.data ?? [];
  const loading = isLoading || addMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const error = isError ? (queryError?.message ?? 'Error desconocido') : null;

  const addPatient = async (patientData) => {
    const dataToSave = userId ? { ...patientData, user_id: userId } : patientData;
    return addMutation.mutateAsync(dataToSave);
  };

  const updatePatient = async (patientData) => {
    return updateMutation.mutateAsync(patientData);
  };

  const deletePatient = async (id) => {
    return deleteMutation.mutateAsync(id);
  };

  const refreshPatients = () => {
    queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
  };

  const loadPatients = refreshPatients;

  return {
    patients,
    loading,
    error,
    // paginación (nueva API)
    pagination: {
      total: paginatedResult?.total ?? 0,
      totalPages: paginatedResult?.totalPages ?? 1,
      page,
      pageSize,
    },
    // acciones (misma API que antes)
    addPatient,
    updatePatient,
    deletePatient,
    refreshPatients,
    loadPatients,
  };
}
