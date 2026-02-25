import React from 'react';
import { useModals } from '../hooks/useModals';

import PatientProfileModal from './PatientProfileModal';
import EditPatientModal from './EditPatientModal';
import AddPatientModal from './AddPatientModal';
import ClinicalRecordModal from './ClinicalRecordModal';
import BookingModal from './BookingModal';
import TurnoDetailsModal from './TurnoDetailsModal';
import EditTurnoModal from './EditTurnoModal';

/**
 * Raíz de todos los modales globales de la aplicación.
 * No recibe props — consume todo el estado y las acciones desde el contexto.
 */
export default function ModalsRoot() {
  const {
    // Paciente
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    session,
    closeProfile,
    onEditFromProfile,
    onViewPatient,
    onSavedPatient,
    onCreatedPatient,
    handleDeletePatient,
    // Turno
    selectedTurno,
    showBookingModal,
    showTurnoDetailsModal,
    showEditTurnoModal,
    closeBookingModal,
    onBookingSuccess,
    onViewTurno,
    onEditTurnoFromDetails,
    onDeleteTurnoFromDetails,
    closeTurnoDetails,
    closeEditTurno,
    onTurnoSaved,
    onTurnoDeleted,
    // Extra closers
    closeAddPatient,
    closeEditPatient,
    closeRecordModal,
    onOpenRecord,
  } = useModals();

  return (
    <>
      <PatientProfileModal
        open={showProfileModal}
        patient={selectedPatient}
        onClose={closeProfile}
        onEdit={onEditFromProfile}
        onDelete={handleDeletePatient}
        onOpenRecord={onOpenRecord}
        onMessage={() => { }}
      />

      <EditPatientModal
        open={showEditModal}
        patient={selectedPatient}
        onClose={closeEditPatient}
        onSaved={onSavedPatient}
        onBack={() => {
          closeEditPatient();
          if (selectedPatient) onViewPatient(selectedPatient);
        }}
      />

      <AddPatientModal
        open={showAddModal}
        onClose={closeAddPatient}
        onCreate={onCreatedPatient}
      />

      <ClinicalRecordModal
        open={showRecordModal}
        patient={selectedPatient}
        onClose={closeRecordModal}
        session={session}
      />

      <BookingModal
        open={showBookingModal}
        onClose={closeBookingModal}
        onSuccess={onBookingSuccess}
      />

      <TurnoDetailsModal
        open={showTurnoDetailsModal}
        turno={selectedTurno}
        onClose={closeTurnoDetails}
        onEdit={onEditTurnoFromDetails}
        onDelete={onDeleteTurnoFromDetails}
      />

      <EditTurnoModal
        open={showEditTurnoModal}
        turno={selectedTurno}
        onClose={closeEditTurno}
        onSaved={onTurnoSaved}
        onDeleted={onTurnoDeleted}
        onBack={() => {
          closeEditTurno();
          if (selectedTurno) onViewTurno(selectedTurno);
        }}
      />
    </>
  );
}
