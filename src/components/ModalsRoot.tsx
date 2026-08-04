import { usePatientModals } from '../hooks/usePatientModals';
import { useAppointmentModals } from '../hooks/useAppointmentModals';

import PatientProfileModal from './PatientProfileModal';
import EditPatientModal from './EditPatientModal';
import AddPatientModal from './AddPatientModal';
import PatientDocumentModal from './PatientDocumentModal';
import { CLINICAL_RECORD_DOC, CONSENT_DOC } from '../config/patientDocuments';
import BookingModal from './BookingModal';
import TurnoDetailsModal from './TurnoDetailsModal';
import EditTurnoModal from './EditTurnoModal';

/**
 * Raíz de todos los modales globales de la aplicación.
 * No recibe props — consume el estado desde los contextos de modales especializados.
 */
export default function ModalsRoot() {
  const {
    selectedPatient,
    showProfileModal,
    showEditModal,
    showAddModal,
    showRecordModal,
    showConsentModal,
    session,
    closeProfile,
    onEditFromProfile,
    onViewPatient,
    onSavedPatient,
    onCreatedPatient,
    handleDeletePatient,
    closeAddPatient,
    closeEditPatient,
    closeRecordModal,
    onOpenRecord,
    onOpenConsent,
    closeConsentModal,
  } = usePatientModals();

  const {
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
  } = useAppointmentModals();

  return (
    <>
      <PatientProfileModal
        open={showProfileModal}
        patient={selectedPatient}
        onClose={closeProfile}
        onEdit={onEditFromProfile}
        onDelete={handleDeletePatient}
        onOpenRecord={onOpenRecord}
        onOpenConsent={onOpenConsent}
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

      <PatientDocumentModal
        config={CLINICAL_RECORD_DOC}
        open={showRecordModal}
        patient={selectedPatient}
        onClose={closeRecordModal}
        session={session}
      />

      <PatientDocumentModal
        config={CONSENT_DOC}
        open={showConsentModal}
        patient={selectedPatient}
        onClose={closeConsentModal}
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
        onOpenPatient={(patient) => {
          // Ambos modales usan z-50: hay que cerrar el detalle antes de abrir la ficha.
          closeTurnoDetails();
          onViewPatient(patient);
        }}
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
