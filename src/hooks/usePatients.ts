import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { PatientService, PatientPayload, PaginatedResult } from '../services/PatientService';
import type { Patient } from '../types/database.types';

// ─── Query Key ────────────────────────────────────────────────────────────────
export const PATIENTS_KEY = ['patients'] as const;

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface NormalizedPatient extends Patient {
    /** Timestamp en ms para ordenar por fecha de creación */
    _createdAt: number;
    createdTime: string;
}

/** Resultado de usePatients compatible con la API anterior del hook */
export interface UsePatientsResult {
    patients: NormalizedPatient[];
    loading: boolean;
    error: string | null;
    pagination: {
        total: number;
        totalPages: number;
        page: number;
        pageSize: number;
    };
    addPatient: (data: PatientPayload) => Promise<Patient>;
    updatePatient: (data: PatientPayload) => Promise<Patient>;
    deletePatient: (id: string) => Promise<void>;
    refreshPatients: () => void;
    /** Alias de refreshPatients para retrocompatibilidad */
    loadPatients: () => void;
}

// ─── Normalización defensiva ──────────────────────────────────────────────────
const toMs = (v: unknown): number => {
    if (!v) return 0;
    const n = Date.parse(String(v));
    return Number.isNaN(n) ? 0 : n;
};

const normalizePatient = (p: Patient): NormalizedPatient => {
    const createdIso = p.created_at ?? '';
    const createdTime = createdIso;
    const _createdAt = toMs(createdTime) || Date.now();

    return {
        ...p,
        id: p.id,
        // Prefer camelCase fields (already mapped by mapDbPatient),
        // fall back to snake_case originals, then legacy English fields.
        nombre: p.nombre ?? p.name,
        obraSocial: p.obraSocial ?? p.obra_social,
        numeroAfiliado: p.numeroAfiliado ?? p.numero_afiliado,
        historiaClinica: p.historiaClinica ?? p.historia_clinica_url,
        estado: p.estado ?? 'Activo',
        createdTime,
        _createdAt,
    };
};

/**
 * Hook de pacientes — powered by TanStack Query.
 *
 * API pública 100% retrocompatible con la versión anterior basada en useState.
 *
 * @param session - Sesión de Supabase (para obtener userId en mutaciones)
 * @param page    - Página actual (base 1), default 1
 * @param pageSize - Registros por página, default 300
 */
export function usePatients(
    session: Session | null = null,
    page = 1,
    pageSize = 300,
): UsePatientsResult {
    const userId = session?.user?.id ?? null;
    const queryClient = useQueryClient();

    // ── Invalidar la query manualmente (helper) ───────────────────────────────
    const invalidate = (): void => {
        queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
    };

    // ── Eventos globales → invalidación (compatibilidad con N8N webhooks) ──────
    // Sólo se mantienen porque algunos servicios externos hacen POST directamente
    // a Supabase y disparan estos eventos. NO se usan para polling.
    useEffect(() => {
        const handleWebhookMutation = (e: Event): void => {
            const detail = (e as CustomEvent<{ method?: string; url?: string }>).detail;
            const method = String(detail?.method ?? '').toUpperCase();
            if (method === 'GET') return;
            const url = String(detail?.url ?? '');
            if (!url || /patient/i.test(url)) invalidate();
        };

        window.addEventListener('webhook:mutated', handleWebhookMutation);
        window.addEventListener('patients:refresh', invalidate);
        return () => {
            window.removeEventListener('webhook:mutated', handleWebhookMutation);
            window.removeEventListener('patients:refresh', invalidate);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── useQuery: carga y caché ───────────────────────────────────────────────
    const {
        data: paginatedResult,
        isLoading,
        isError,
        error: queryError,
    } = useQuery<PaginatedResult<Patient>, Error>({
        queryKey: [...PATIENTS_KEY, page, pageSize],
        queryFn: () => PatientService.fetchPatientsPaginated(page, pageSize),
        select: (result): PaginatedResult<NormalizedPatient> => ({
            ...result,
            data: result.data.map(normalizePatient),
        }),
    });

    // ── useMutation: crear ────────────────────────────────────────────────────
    const addMutation = useMutation<Patient, Error, PatientPayload>({
        mutationFn: (data) => PatientService.createPatient(data, userId ?? ''),
        onSuccess: () => {
            invalidate();
        },
    });

    // ── useMutation: actualizar ───────────────────────────────────────────────
    const updateMutation = useMutation<Patient, Error, PatientPayload>({
        mutationFn: (data) => PatientService.updatePatient(data, userId ?? ''),
        onSuccess: () => {
            invalidate();
        },
    });

    // ── useMutation: eliminar ─────────────────────────────────────────────────
    const deleteMutation = useMutation<boolean, Error, string>({
        mutationFn: (id) => PatientService.deletePatient(id),
        onSuccess: () => {
            invalidate();
        },
    });

    // ── API pública ───────────────────────────────────────────────────────────
    const patients = (paginatedResult as PaginatedResult<NormalizedPatient> | undefined)?.data ?? [];
    const loading =
        isLoading ||
        addMutation.isPending ||
        updateMutation.isPending ||
        deleteMutation.isPending;
    const error = isError ? (queryError?.message ?? 'Error desconocido') : null;

    const addPatient = async (patientData: PatientPayload): Promise<Patient> => {
        const dataToSave: PatientPayload = userId
            ? { ...patientData, user_id: userId }
            : patientData;
        return addMutation.mutateAsync(dataToSave);
    };

    const updatePatient = async (patientData: PatientPayload): Promise<Patient> =>
        updateMutation.mutateAsync(patientData);

    const deletePatient = async (id: string): Promise<void> => {
        await deleteMutation.mutateAsync(id);
    };

    const refreshPatients = (): void => invalidate();

    return {
        patients,
        loading,
        error,
        pagination: {
            total: paginatedResult?.total ?? 0,
            totalPages: paginatedResult?.totalPages ?? 1,
            page,
            pageSize,
        },
        addPatient,
        updatePatient,
        deletePatient,
        refreshPatients,
        loadPatients: refreshPatients,
    };
}
