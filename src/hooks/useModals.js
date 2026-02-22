import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { AppointmentService } from '../services/AppointmentService';

const ModalsContext = createContext(null);

export function ModalsProvider({ children, patients = [], turnos = [], addPatient, updatePatient, refreshTurnos, refreshPatients }) {
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
  const closeRecordModal = useCallback(() => {
    setShowRecordModal(false);
  }, []);

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
    // Si se creó un paciente nuevo en el proceso, necesitamos refrescar la lista de pacientes también
    if (typeof refreshPatients === 'function') {
      refreshPatients();
    }
    // Notificar globalmente para que otras vistas con su propio hook se refresquen
    try {
      window.dispatchEvent(new CustomEvent('turnos:refresh'));
      window.dispatchEvent(new CustomEvent('patients:refresh'));
    } catch { }
    closeBookingModal();
  }, [refreshTurnos, refreshPatients, closeBookingModal]);

  const onTurnoSaved = useCallback((updatedTurno) => {
    if (typeof refreshTurnos === 'function') refreshTurnos();
    // Notificar globalmente (Dashboard y otras vistas con su propio hook)
    try {
      window.dispatchEvent(new CustomEvent('turnos:refresh'));
    } catch { }
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
    } catch { }
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
      await AppointmentService.deleteAppointment(id);
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
      // Notificar a otros posibles escuchas
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      return created;
    } catch (err) {
      alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
      throw err;
    }
  }, [addPatient, refreshPatients]);

  // Sincronizar selectedPatient con la lista actualizada de pacientes
  React.useEffect(() => {
    if (selectedPatient && Array.isArray(patients)) {
      const updated = patients.find(p => (p.id || p._id) === (selectedPatient.id || selectedPatient._id));
      if (updated) {
        // Evitar loop infinito: solo actualizar si los datos (sin historiaUrl) han cambiado realmente
        const { historiaUrl: currentUrl, ...currentRest } = selectedPatient;
        const { historiaUrl: newUrl, ...newRest } = updated;

        if (JSON.stringify(currentRest) !== JSON.stringify(newRest)) {
          // Mantener la URL firmada si ya la tenemos y los IDs coinciden, 
          // pero actualizar el resto de los datos
          setSelectedPatient(prev => ({ ...updated, historiaUrl: prev?.historiaUrl }));
        }
      }
    }
  }, [selectedPatient, patients]);

  // Sincronizar selectedTurno con la lista actualizada de turnos
  React.useEffect(() => {
    if (selectedTurno && Array.isArray(turnos)) {
      const idSearch = selectedTurno.id || selectedTurno.eventId || selectedTurno._id;
      const updated = turnos.find(t => (t.id || t.eventId || t._id) === idSearch);
      if (updated) {
        // Evitar loop infinito
        if (JSON.stringify(selectedTurno) !== JSON.stringify(updated)) {
          setSelectedTurno(updated);
        }
      }
    }
  }, [selectedTurno, turnos]);

  // Escuchar eventos de refresco
  React.useEffect(() => {
    const handleRefresh = () => {
      if (typeof refreshPatients === 'function') refreshPatients();
    };
    window.addEventListener('patients:refresh', handleRefresh);
    return () => window.removeEventListener('patients:refresh', handleRefresh);
  }, [refreshPatients]);

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
