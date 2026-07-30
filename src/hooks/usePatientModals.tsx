import { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePatients } from './usePatients';
import { useAuth } from '../context/AuthContext';
import { PatientService } from '../services/PatientService';
import { queryKeys } from '../lib/queryKeys';

const PatientModalsContext = createContext<any>(null);

export function PatientModalsProvider({
    children,
    patients = [],
    addPatient,
    updatePatient,
}: any) {
    const { session } = useAuth();
    const { deletePatient } = usePatients(session);
    const queryClient = useQueryClient();

    /** Paciente elegido en la UI. La versión fresca la trae la query de abajo. */
    const [selectedPatientBase, setSelectedPatient] = useState<any>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [showConsentModal, setShowConsentModal] = useState(false);

    const closeProfile = useCallback(() => {
        setShowProfileModal(false);
        setSelectedPatient(null);
    }, []);

    const onViewPatient = useCallback((patient: any) => {
        setSelectedPatient(patient);
        setShowProfileModal(true);
    }, []);

    const onEditFromProfile = useCallback((patient: any) => {
        setSelectedPatient(patient);
        setShowProfileModal(false);
        setShowEditModal(true);
    }, []);

    const openAddPatient = useCallback(() => setShowAddModal(true), []);
    const closeAddPatient = useCallback(() => setShowAddModal(false), []);
    const closeEditPatient = useCallback(() => setShowEditModal(false), []);

    const closeRecordModal = useCallback(() => setShowRecordModal(false), []);

    const closeConsentModal = useCallback(() => setShowConsentModal(false), []);

    const onOpenConsent = useCallback((p: any) => {
        setSelectedPatient(p);
        setShowConsentModal(true);
    }, []);

    const onOpenRecord = useCallback((p: any) => {
        const historiaUrl =
            p?.historiaUrl || p?.historiaClinica || p?.historiaClinicaUrl || p?.odontogramaUrl || '';
        setSelectedPatient({ ...p, historiaUrl });
        setShowRecordModal(true);
    }, []);

    const handleDeletePatient = useCallback(async (patientData: any) => {
        try {
            const patient =
                typeof patientData === 'string'
                    ? patients.find(
                        (p: any) =>
                            p?.id === patientData ||
                            p?._id === patientData ||
                            p?.dni === patientData
                    )
                    : patientData;

            if (!patient) throw new Error('No se pudo encontrar el paciente');

            const id = patient?.id || patient?._id;
            if (!id) throw new Error('No se pudo identificar el paciente (falta ID)');

            await deletePatient(id);
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            throw err;
        }
    }, [patients, deletePatient]);

    const onSavedPatient = useCallback(async (updatedPatientData: any) => {
        try {
            if (typeof updatePatient === 'function') await updatePatient(updatedPatientData);
            // Por prefijo: alcanza las listas paginadas y el detalle del modal.
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            setShowEditModal(false);
            setSelectedPatient(null);
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            alert(`Error: ${err.message || 'No se pudo actualizar el paciente'}`);
        }
    }, [updatePatient, queryClient]);

    const onCreatedPatient = useCallback(async (patientData: any) => {
        try {
            const res = typeof addPatient === 'function' ? await addPatient(patientData) : null;
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            return res;
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
            throw err;
        }
    }, [addPatient, queryClient]);

    // El paciente abierto en un modal es una query propia, no estado local copiado
    // de la lista. Un `invalidateQueries(['patients'])` alcanza a esta key por
    // prefijo, así que la fila del modal se refresca junto con la tabla.
    //
    // Esto reemplaza a ~45 líneas: un listener de `patients:refresh` que hacía su
    // propio `getPatientById`, un ref para leer el paciente sin re-suscribirse, y un
    // efecto que copiaba desde la lista con un merge defensivo sobre las cuatro URLs
    // de documentos para que una lista stale no borrara el archivo recién subido.
    const selectedPatientId: string | null = selectedPatientBase?.id ?? selectedPatientBase?._id ?? null;

    const { data: fetchedPatient } = useQuery({
        queryKey: queryKeys.patients.detail(selectedPatientId ?? ''),
        queryFn: () => PatientService.getPatientById(selectedPatientId!),
        enabled: !!selectedPatientId,
    });

    // La versión del servidor manda, pero se preservan los overrides que inyecta
    // `onOpenRecord` (p. ej. `historiaUrl` normalizada) mientras la query resuelve.
    const selectedPatient = useMemo(() => {
        if (!selectedPatientBase) return null;
        return fetchedPatient ? { ...selectedPatientBase, ...fetchedPatient } : selectedPatientBase;
    }, [selectedPatientBase, fetchedPatient]);

    const value = useMemo(() => ({
        selectedPatient,
        showProfileModal,
        showEditModal,
        showAddModal,
        showRecordModal,
        showConsentModal,
        session,
        patientsLoading: false,
        closeProfile,
        onViewPatient,
        onEditFromProfile,
        openAddPatient,
        closeAddPatient,
        closeEditPatient,
        onOpenRecord,
        closeRecordModal,
        onOpenConsent,
        closeConsentModal,
        onSavedPatient,
        onCreatedPatient,
        handleDeletePatient,
    }), [
        selectedPatient, showProfileModal, showEditModal, showAddModal, showRecordModal,
        showConsentModal, session, closeProfile, onViewPatient, onEditFromProfile, openAddPatient,
        closeAddPatient, closeEditPatient, onOpenRecord, closeRecordModal, onOpenConsent,
        closeConsentModal, onSavedPatient, onCreatedPatient, handleDeletePatient,
    ]);

    return (
        <PatientModalsContext.Provider value={value}>
            {children}
        </PatientModalsContext.Provider>
    );
}

export function usePatientModals() {
    const ctx = useContext(PatientModalsContext);
    if (!ctx) throw new Error('usePatientModals must be used within a PatientModalsProvider');
    return ctx;
}
