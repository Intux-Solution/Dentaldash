import React, { useMemo, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import DashboardView from '../components/DashboardView';
import PacientesView from '../components/PacientesView';
import TurnosView from '../components/TurnosView';

import { useModals } from '../hooks/useModals';
import { URL_DELETE_PATIENT } from '../config/n8n';
import { apiFetch } from '../utils/api';

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

      const key = patient?.id || patient?._id || patient?.dni;
      const dni = patient?.dni || '';
      if (!dni) throw new Error('No se pudo identificar el paciente (falta DNI)');

      if (key) setLocallyDeleted(prev => [...prev, key]);

      const response = await apiFetch(URL_DELETE_PATIENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, timestamp: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

      await refreshPatients?.();
      if (key) setLocallyDeleted(prev => prev.filter(k => k !== key));
    } catch (err) {
      const key = typeof patientData === 'string' ? patientData : (patientData?.id || patientData?._id || patientData?.dni);
      if (key) setLocallyDeleted(prev => prev.filter(k => k !== key));
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
