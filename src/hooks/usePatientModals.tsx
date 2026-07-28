import React, { createContext, useContext, useCallback, useMemo, useState, useRef } from 'react';
import { usePatients } from './usePatients';
import { useAuth } from '../context/AuthContext';
import { PatientService } from '../services/PatientService';

const PatientModalsContext = createContext<any>(null);

export function PatientModalsProvider({
    children,
    patients = [],
    addPatient,
    updatePatient,
    refreshPatients,
}: any) {
    const { session } = useAuth();
    const { deletePatient } = usePatients(session);

    const [selectedPatient, setSelectedPatient] = useState<any>(null);
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
            if (typeof refreshPatients === 'function') refreshPatients();
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            setShowEditModal(false);
            setSelectedPatient(null);
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            alert(`Error: ${err.message || 'No se pudo actualizar el paciente'}`);
        }
    }, [updatePatient, refreshPatients]);

    const onCreatedPatient = useCallback(async (patientData: any) => {
        try {
            const res = typeof addPatient === 'function' ? await addPatient(patientData) : null;
            setShowAddModal(false);
            if (typeof refreshPatients === 'function') refreshPatients();
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            return res;
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
            throw err;
        }
    }, [addPatient, refreshPatients]);

    const selectedPatientRef = useRef<any>(null);
    React.useEffect(() => {
        selectedPatientRef.current = selectedPatient;
    }, [selectedPatient]);

    // Propaga al modal abierto los cambios que lleguen por la lista de React Query.
    //
    // Depende SOLO de `patients`: si tambien dependiera de `selectedPatient`, cada vez
    // que `handleRefresh` trae la fila fresca desde el servidor este efecto volveria a
    // correr contra la lista todavia stale (el invalidate no resolvio) y la pisaria con
    // la version vieja. Eso borraba el consentimiento/historia recien subidos de la UI.
    React.useEffect(() => {
        const current = selectedPatientRef.current;
        if (!current || !Array.isArray(patients)) return;

        const updated = patients.find(
            (p: any) => (p.id || p._id) === (current.id || current._id)
        );
        if (!updated || JSON.stringify(current) === JSON.stringify(updated)) return;

        // Las URLs de documentos nunca retroceden a vacio por una lista stale: el
        // borrado real de un adjunto siempre reemplaza el path, no lo deja en null.
        setSelectedPatient({
            ...updated,
            historia_clinica_url: updated.historia_clinica_url ?? current.historia_clinica_url,
            historiaClinicaUrl: updated.historiaClinicaUrl ?? current.historiaClinicaUrl,
            consentimiento_url: updated.consentimiento_url ?? current.consentimiento_url,
            consentimientoUrl: updated.consentimientoUrl ?? current.consentimientoUrl,
        });
    }, [patients]);

    React.useEffect(() => {
        const handleRefresh = async () => {
            if (typeof refreshPatients === 'function') refreshPatients();
            const current = selectedPatientRef.current;
            if (current?.id) {
                try {
                    const updated = await PatientService.getPatientById(current.id);
                    if (updated) setSelectedPatient(updated);
                } catch (_) {}
            }
        };
        window.addEventListener('patients:refresh', handleRefresh);
        return () => window.removeEventListener('patients:refresh', handleRefresh);
    }, [refreshPatients]);

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
