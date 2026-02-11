import React from 'react';
import { useModals } from '../hooks/useModals';

import PatientProfileModal from './PatientProfileModal';
import EditPatientModal from './EditPatientModal';
import AddPatientModal from './AddPatientModal';
import ClinicalRecordModal from './ClinicalRecordModal';
import BookingModal from './BookingModal';
import TurnoDetailsModal from './TurnoDetailsModal';
import EditTurnoModal from './EditTurnoModal';

export default function ModalsRoot({ patientsLoading = false, onDeletePatient }) {
  const {
    // Paciente
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    closeProfile,
  onEditFromProfile,
  onViewPatient,
    onSavedPatient,
    onCreatedPatient,

    // Turno
    selectedTurno,
    showBookingModal,
    showTurnoDetailsModal,
    showEditTurnoModal,
    openBookingModal, // not used here, but kept for parity
    closeBookingModal,
    onBookingSuccess,
    onViewTurno, // not used here
    onEditTurnoFromDetails,
    onDeleteTurnoFromDetails,
    closeTurnoDetails,
    closeEditTurno,
    onTurnoSaved,
    onTurnoDeleted,
    // extra closers
    closeAddPatient,
    closeEditPatient,
    closeRecordModal,
  } = useModals();

  return (
    <>
      <PatientProfileModal
        open={showProfileModal}
        patient={selectedPatient}
        onClose={closeProfile}
        onEdit={onEditFromProfile}
        onDelete={onDeletePatient}
      />

      <EditPatientModal
        open={showEditModal}
        patient={selectedPatient}
        onClose={closeEditPatient}
        onSaved={onSavedPatient}
        onBack={() => {
          closeEditPatient();
          if (selectedPatient) {
            onViewPatient(selectedPatient);
          }
        }}
        loading={patientsLoading}
      />

      <AddPatientModal
        open={showAddModal}
        onClose={closeAddPatient}
        onCreate={onCreatedPatient}
        loading={patientsLoading}
      />

      <ClinicalRecordModal
        open={showRecordModal}
        patient={selectedPatient}
        onClose={closeRecordModal}
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
          // Usar el método del hook para abrir el modal de detalles
          if (selectedTurno) {
            onViewTurno(selectedTurno);
          }
        }}
      />
    </>
  );
}
