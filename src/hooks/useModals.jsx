import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { AppointmentService } from '../services/AppointmentService';
import { usePatients } from './usePatients';
import { useTurnos } from './useTurnos';

const ModalsContext = createContext(null);

/**
 * Provider global de modales.
 *
 * Recibe `session` para poder ejecutar operaciones de datos (delete)
 * internamente, eliminando la necesidad de pasar callbacks desde AuthedApp.
 */
export function ModalsProvider({
  children,
  patients = [],
  turnos = [],
  addPatient,
  updatePatient,
  refreshTurnos,
  refreshPatients,
  session,
}) {
  // ─── Acceso a la mutation de delete via TanStack Query ────────────────────
  const { deletePatient } = usePatients(session);
  const { deleteTurno } = useTurnos(null, null, session);

  // ─── Estado: Pacientes ────────────────────────────────────────────────────
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);

  // ─── Estado: Turnos ───────────────────────────────────────────────────────
  const [selectedTurno, setSelectedTurno] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showTurnoDetailsModal, setShowTurnoDetailsModal] = useState(false);
  const [showEditTurnoModal, setShowEditTurnoModal] = useState(false);

  // ─── Helpers: Pacientes ───────────────────────────────────────────────────
  const closeProfile = useCallback(() => {
    setShowProfileModal(false);
    setSelectedPatient(null);
  }, []);

  const onViewPatient = useCallback((patient) => {
    setSelectedPatient(patient);
    setShowProfileModal(true);
  }, []);

  const onEditFromProfile = useCallback((patient) => {
    setSelectedPatient(patient);
    setShowProfileModal(false);
    setShowEditModal(true);
  }, []);

  const openAddPatient = useCallback(() => setShowAddModal(true), []);
  const closeAddPatient = useCallback(() => setShowAddModal(false), []);
  const closeEditPatient = useCallback(() => setShowEditModal(false), []);

  const closeRecordModal = useCallback(() => setShowRecordModal(false), []);

  const onOpenRecord = useCallback((p) => {
    const historiaUrl =
      p?.historiaUrl || p?.historiaClinica || p?.historiaClinicaUrl || p?.odontogramaUrl || '';
    setSelectedPatient({ ...p, historiaUrl });
    setShowRecordModal(true);
  }, []);

  // ─── Eliminar paciente (sin prop drilling — usa mutation interna) ─────────
  const handleDeletePatient = useCallback(async (patientData) => {
    try {
      const patient =
        typeof patientData === 'string'
          ? patients.find(
            (p) =>
              p?.id === patientData ||
              p?._id === patientData ||
              p?.dni === patientData
          )
          : patientData;

      if (!patient) throw new Error('No se pudo encontrar el paciente');

      const id = patient?.id || patient?._id;
      if (!id) throw new Error('No se pudo identificar el paciente (falta ID)');

      await deletePatient(id);
    } catch (err) {
      throw err;
    }
  }, [patients, deletePatient]);

  // ─── Helpers: Turnos ──────────────────────────────────────────────────────
  const openBookingModal = useCallback(() => setShowBookingModal(true), []);
  const closeBookingModal = useCallback(() => setShowBookingModal(false), []);

  const onViewTurno = useCallback((turno) => {
    setSelectedTurno(turno);
    setShowTurnoDetailsModal(true);
  }, []);

  const onEditTurnoFromDetails = useCallback((turno) => {
    setSelectedTurno(turno);
    setShowTurnoDetailsModal(false);
    setShowEditTurnoModal(true);
  }, []);

  const closeTurnoDetails = useCallback(() => {
    setShowTurnoDetailsModal(false);
    setSelectedTurno(null);
  }, []);

  const closeEditTurno = useCallback(() => {
    setShowEditTurnoModal(false);
    setSelectedTurno(null);
  }, []);

  // ─── Acciones cruzadas de datos ───────────────────────────────────────────
  const onBookingSuccess = useCallback(() => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    if (typeof refreshPatients === 'function') refreshPatients();
    closeBookingModal();
  }, [refreshTurnos, refreshPatients, closeBookingModal]);

  const onTurnoSaved = useCallback(() => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    setShowEditTurnoModal(false);
    setSelectedTurno(null);
  }, [refreshTurnos]);

  const onTurnoDeleted = useCallback((deletedTurno) => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    setShowEditTurnoModal(false);
    setShowTurnoDetailsModal(false);
    setSelectedTurno(null);
  }, [refreshTurnos]);

  const onDeleteTurnoFromDetails = useCallback(async (turno) => {
    const id = turno?.id || turno?.eventId || turno?._id;
    if (!id) { alert('No se pudo identificar el turno a cancelar'); return; }
    try {
      await deleteTurno(id);
      onTurnoDeleted({ ...turno, id });
    } catch (err) {
      alert(err.message || 'No se pudo cancelar el turno.');
    }
  }, [onTurnoDeleted, deleteTurno]);

  const onSavedPatient = useCallback(async (updatedPatientData) => {
    try {
      if (typeof updatePatient === 'function') await updatePatient(updatedPatientData);
      if (typeof refreshPatients === 'function') refreshPatients();
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      setShowEditModal(false);
      setSelectedPatient(null);
    } catch (err) {
      alert(`Error: ${err.message || 'No se pudo actualizar el paciente'}`);
    }
  }, [updatePatient, refreshPatients]);

  const onCreatedPatient = useCallback(async (patientData) => {
    try {
      const res = typeof addPatient === 'function' ? await addPatient(patientData) : null;
      setShowAddModal(false);
      if (typeof refreshPatients === 'function') refreshPatients();
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      return res;
    } catch (err) {
      alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
      throw err;
    }
  }, [addPatient, refreshPatients]);

  // ─── Sincronizar selectedPatient con lista actualizada ───────────────────
  React.useEffect(() => {
    if (selectedPatient && Array.isArray(patients)) {
      const updated = patients.find(
        (p) => (p.id || p._id) === (selectedPatient.id || selectedPatient._id)
      );
      if (updated) {
        const { historiaUrl: currentUrl, ...currentRest } = selectedPatient;
        const { historiaUrl: newUrl, ...newRest } = updated;
        if (JSON.stringify(currentRest) !== JSON.stringify(newRest)) {
          setSelectedPatient((prev) => ({ ...updated, historiaUrl: prev?.historiaUrl }));
        }
      }
    }
  }, [selectedPatient, patients]);

  // ─── Sincronizar selectedTurno con lista actualizada ────────────────────
  React.useEffect(() => {
    if (selectedTurno && Array.isArray(turnos)) {
      const idSearch = selectedTurno.id || selectedTurno.eventId || selectedTurno._id;
      const updated = turnos.find((t) => (t.id || t.eventId || t._id) === idSearch);
      if (updated && JSON.stringify(selectedTurno) !== JSON.stringify(updated)) {
        setSelectedTurno(updated);
      }
    }
  }, [selectedTurno, turnos]);

  // ─── Escuchar eventos globales de refresco ────────────────────────────────
  React.useEffect(() => {
    const handleRefresh = () => { if (typeof refreshPatients === 'function') refreshPatients(); };
    window.addEventListener('patients:refresh', handleRefresh);
    return () => window.removeEventListener('patients:refresh', handleRefresh);
  }, [refreshPatients]);

  // ─── Valor del contexto ───────────────────────────────────────────────────
  const value = useMemo(() => ({
    // Estado de pacientes
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    // Estado de turnos
    selectedTurno,
    showBookingModal,
    showTurnoDetailsModal,
    showEditTurnoModal,
    // Session (para componentes que la necesiten, ej. ClinicalRecordModal)
    session,
    // Loading de pacientes (para deshabilitar botones mientras se carga)
    patientsLoading: false,
    // Acciones de pacientes
    closeProfile,
    onViewPatient,
    onEditFromProfile,
    openAddPatient,
    closeAddPatient,
    closeEditPatient,
    onOpenRecord,
    closeRecordModal,
    onSavedPatient,
    onCreatedPatient,
    handleDeletePatient,
    // Acciones de turnos
    openBookingModal,
    closeBookingModal,
    onViewTurno,
    onEditTurnoFromDetails,
    onDeleteTurnoFromDetails,
    closeTurnoDetails,
    closeEditTurno,
    onBookingSuccess,
    onTurnoSaved,
    onTurnoDeleted,
  }), [
    selectedPatient, showProfileModal, showEditModal, showAddModal, showRecordModal,
    selectedTurno, showBookingModal, showTurnoDetailsModal, showEditTurnoModal,
    session,
    closeProfile, onViewPatient, onEditFromProfile, openAddPatient, closeAddPatient,
    closeEditPatient, onOpenRecord, closeRecordModal, onSavedPatient, onCreatedPatient,
    handleDeletePatient,
    openBookingModal, closeBookingModal, onViewTurno, onEditTurnoFromDetails,
    onDeleteTurnoFromDetails, closeTurnoDetails, closeEditTurno,
    onBookingSuccess, onTurnoSaved, onTurnoDeleted,
    refreshPatients,
  ]);

  return (
    <ModalsContext.Provider value={value}>
      {children}
    </ModalsContext.Provider>
  );
}

export function useModals() {
  const ctx = useContext(ModalsContext);
  if (!ctx) throw new Error('useModals must be used within a ModalsProvider');
  return ctx;
}
