/**
 * useModals (legacy bridge)
 *
 * This file exposes a backward-compatible `useModals` hook that composes the two
 * specialized contexts (usePatientModals + useAppointmentModals) into a single
 * object — preserving compatibility with any consumer that has not yet been
 * migrated to the individual hooks.
 *
 * New code should prefer using usePatientModals / useAppointmentModals directly.
 *
 * ModalsProvider is kept as a re-export of the paired providers for App-level wiring.
 */

import React from 'react';
import { usePatientModals, PatientModalsProvider } from './usePatientModals';
import { useAppointmentModals, AppointmentModalsProvider } from './useAppointmentModals';

export { PatientModalsProvider, AppointmentModalsProvider };

/** @deprecated Use usePatientModals or useAppointmentModals instead */
export function useModals() {
  const patient = usePatientModals();
  const appointment = useAppointmentModals();

  return {
    ...patient,
    ...appointment,
  };
}

/**
 * Legacy ModalsProvider — wraps both specialized providers.
 * Prefer using PatientModalsProvider and AppointmentModalsProvider directly (as done in AuthedApp).
 * @deprecated
 */
export function ModalsProvider({ children, patients, turnos, addPatient, updatePatient, refreshTurnos, refreshPatients }: any) {
  return (
    <PatientModalsProvider
      patients={patients}
      addPatient={addPatient}
      updatePatient={updatePatient}
      refreshPatients={refreshPatients}
    >
      <AppointmentModalsProvider
        turnos={turnos}
        refreshTurnos={refreshTurnos}
        refreshPatients={refreshPatients}
      >
        {children}
      </AppointmentModalsProvider>
    </PatientModalsProvider>
  );
}
