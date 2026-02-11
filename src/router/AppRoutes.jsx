import React, { useMemo, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import DashboardView from '../components/DashboardView';
import PacientesView from '../components/PacientesView';
import TurnosView from '../components/TurnosView';

import { useModals } from '../hooks/useModals';
import { PatientService } from '../services/PatientService';

export default function AppRoutes({ normalizedPatients = [], loading = false, refreshPatients }) {
  const navigate = useNavigate();
  const {
    openAddPatient,
    onViewPatient,
    onOpenRecord,
    openBookingModal,
    onViewTurno,
  } = useModals();

  // Local UI state moved from App.js
  const [searchTerm, setSearchTerm] = useState('');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [locallyDeleted, setLocallyDeleted] = useState([]);

  const patientsForViews = useMemo(() => (
    (Array.isArray(normalizedPatients) ? normalizedPatients : []).filter(p => {
      const key = p?.id || p?._id || p?.dni;
      return key && !locallyDeleted.includes(key);
    })
  ), [normalizedPatients, locallyDeleted]);

  const latestPatients = useMemo(() => patientsForViews.slice(0, 4), [patientsForViews]);

  const handleDeletePatient = useCallback(async (patientData) => {
    try {
      const patient = typeof patientData === 'string' ?
        patientsForViews.find(p =>
          p?.id === patientData || p?._id === patientData || p?.dni === patientData
        ) : patientData;

      if (!patient) throw new Error('No se pudo encontrar el paciente');

      const id = patient?.id || patient?._id;
      if (!id) throw new Error('No se pudo identificar el paciente (falta ID)');

      if (id) setLocallyDeleted(prev => [...prev, id]);

      await PatientService.deletePatient(id);

      await refreshPatients?.();
      if (id) setLocallyDeleted(prev => prev.filter(k => k !== id));
    } catch (err) {
      const id = typeof patientData === 'string' ? patientData : (patientData?.id || patientData?._id);
      if (id) setLocallyDeleted(prev => prev.filter(k => k !== id));
      throw err;
    }
  }, [refreshPatients, patientsForViews]);

  return (
    <Routes>
      <Route
        path="/"
        element={(
          <DashboardView
            dashboardSearchTerm={dashboardSearchTerm}
            setDashboardSearchTerm={setDashboardSearchTerm}
            onAddPatient={openAddPatient}
            onViewPatient={onViewPatient}
            onOpenRecord={onOpenRecord}
            onOpenBooking={openBookingModal}
            onViewTurno={onViewTurno}
            patients={patientsForViews}
            latestPatients={latestPatients}
            loading={loading}
          />
        )}
      />
      <Route
        path="/turnos"
        element={<TurnosView onOpenBooking={openBookingModal} onViewTurno={onViewTurno} />}
      />
      <Route
        path="/pacientes"
        element={(
          <PacientesView
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddPatient={openAddPatient}
            onViewPatient={onViewPatient}
            onOpenRecord={onOpenRecord}
            patients={patientsForViews}
            loading={loading}
            onDeletePatient={handleDeletePatient}
          />
        )}
      />
      <Route
        path="/pacientes"
        element={(
          <PacientesView
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddPatient={openAddPatient}
            onViewPatient={onViewPatient}
            onOpenRecord={onOpenRecord}
            patients={patientsForViews}
            loading={loading}
            onDeletePatient={handleDeletePatient}
          />
        )}
      />
      <Route path="/update-password" element={<Navigate to="/" replace />} /> {/* Handled in App.js usually, but good to have explicit just in case, though usually it's public */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
