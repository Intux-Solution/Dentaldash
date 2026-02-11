import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { N8N_ENDPOINTS } from '../config/n8n';
import { apiFetch } from '../utils/api';

const ModalsContext = createContext(null);

export function ModalsProvider({ children, addPatient, updatePatient, refreshTurnos, refreshPatients }) {
  // Pacientes
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);

  // Turnos
  const [selectedTurno, setSelectedTurno] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showTurnoDetailsModal, setShowTurnoDetailsModal] = useState(false);
  const [showEditTurnoModal, setShowEditTurnoModal] = useState(false);

  // Open/close helpers (Pacientes)
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
      p?.historiaUrl ||
      p?.historiaClinica ||
      p?.historiaClinicaUrl ||
      p?.odontogramaUrl ||
      '';
    setSelectedPatient({ ...p, historiaUrl });
    setShowRecordModal(true);
  }, []);

  // Open/close helpers (Turnos)
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

  // Cross actions that touch data sources
  const onBookingSuccess = useCallback(() => {
    if (typeof refreshTurnos === 'function') {
      refreshTurnos();
    }
    // Notificar globalmente para que otras vistas con su propio hook se refresquen
    try {
      window.dispatchEvent(new CustomEvent('turnos:refresh'));
    } catch {}
    closeBookingModal();
  }, [refreshTurnos, closeBookingModal]);

  const onTurnoSaved = useCallback((updatedTurno) => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    // Notificar globalmente (Dashboard y otras vistas con su propio hook)
    try {
      window.dispatchEvent(new CustomEvent('turnos:refresh'));
    } catch {}
    setShowEditTurnoModal(false);
    setSelectedTurno(null);
  }, [refreshTurnos]);

  const onTurnoDeleted = useCallback((deletedTurno) => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    // Notificar a otras vistas que usan su propio hook de turnos
    try {
      const id = deletedTurno?.id || deletedTurno?.eventId || deletedTurno?._id;
      window.dispatchEvent(new CustomEvent('turnos:refresh'));
      if (id) window.dispatchEvent(new CustomEvent('turnos:deleted', { detail: { id } }));
    } catch {}
    setShowEditTurnoModal(false);
    setShowTurnoDetailsModal(false);
    setSelectedTurno(null);
  }, [refreshTurnos]);

  const onDeleteTurnoFromDetails = useCallback(async (turno) => {
    const id = turno?.id || turno?.eventId || turno?._id;
    if (!id) {
      alert('No se pudo identificar el turno a cancelar');
      return;
    }
    try {
      const response = await apiFetch(N8N_ENDPOINTS.DELETE_APPOINTMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          reason: 'Cancelado desde Dashboard',
          canceledAt: new Date().toISOString()
        })
      });
      if (!response.ok) {
        let message = '';
        try {
          const data = await response.json();
          message = data?.message || '';
        } catch {}
        if (response.status === 404) {
          throw new Error('Webhook "/webhook/delete-appointment" no encontrado (404)');
        }
        throw new Error(message || `Error al cancelar el turno (HTTP ${response.status})`);
      }
      onTurnoDeleted({ ...turno, id });
    } catch (err) {
      alert(err.message || 'No se pudo cancelar el turno.');
    }
  }, [onTurnoDeleted]);

  const onSavedPatient = useCallback(async (updatedPatientData) => {
    try {
      if (typeof updatePatient === 'function') {
        await updatePatient(updatedPatientData);
      }
      if (typeof refreshPatients === 'function') {
        refreshPatients();
      }
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
      const createdFallback = {
        ...patientData,
        id: patientData?.id || patientData?._id || patientData?.dni || String(Date.now()),
        fechaCreacion: patientData?.fechaCreacion || patientData?.fechaRegistro || new Date().toISOString().slice(0, 10),
        _createdAt: typeof patientData?._createdAt === 'number' ? patientData._createdAt : Date.now(),
      };
      const created = (Array.isArray(res) ? res[0]?.patient : res?.patient) || res || createdFallback;
      if (typeof refreshPatients === 'function') {
        refreshPatients();
      }
      return created;
    } catch (err) {
      alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
      throw err;
    }
  }, [addPatient, refreshPatients]);

  const value = useMemo(() => ({
    // Paciente state
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    // Turno state
    selectedTurno,
    showBookingModal,
    showTurnoDetailsModal,
    showEditTurnoModal,
    // Paciente actions
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
    // Turno actions
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
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    selectedTurno,
    showBookingModal,
    showTurnoDetailsModal,
    showEditTurnoModal,
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
