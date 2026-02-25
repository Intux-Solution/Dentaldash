import React, { useMemo, useState, useCallback, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

const DashboardView = React.lazy(() => import('../components/DashboardView'));
const PacientesView = React.lazy(() => import('../components/PacientesView'));
const TurnosView = React.lazy(() => import('../components/TurnosView'));
const SettingsView = React.lazy(() => import('../components/SettingsView'));
const OdontogramView = React.lazy(() => import('../components/OdontogramView'));

import { useModals } from '../hooks/useModals';
import { PatientService } from '../services/PatientService';
import ProtectedRoute from './ProtectedRoute';

const GlobalLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
    <Loader className="h-10 w-10 animate-spin text-teal-600" />
  </div>
);

export default function AppRoutes({ normalizedPatients = [], loading = false, refreshPatients, session }) {
  const {
    openAddPatient,
    onViewPatient,
    onOpenRecord,
    openBookingModal,
    onViewTurno,
  } = useModals();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState('Todos');
  const [locallyDeleted, setLocallyDeleted] = useState([]);

  const patientsForViews = useMemo(() => (
    (Array.isArray(normalizedPatients) ? normalizedPatients : []).filter(p => {
      const key = p?.id || p?._id || p?.dni;
      return key && !locallyDeleted.includes(key);
    })
  ), [normalizedPatients, locallyDeleted]);

  const latestPatients = useMemo(() => {
    return patientsForViews
      .filter(p => p?.estado !== 'Inactivo')
      .slice(0, 4);
  }, [patientsForViews]);

  const handleDeletePatient = useCallback(async (patientData) => {
    try {
      const patient = typeof patientData === 'string'
        ? patientsForViews.find(p =>
          p?.id === patientData || p?._id === patientData || p?.dni === patientData
        )
        : patientData;

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
    <Suspense fallback={<GlobalLoader />}>
      <Routes>
        {/* ── Rutas privadas protegidas ────────────────────────────────── */}
        <Route element={<ProtectedRoute session={session} />}>
          <Route
            path="/"
            element={(
              <DashboardView
                dashboardSearchTerm={dashboardSearchTerm}
                setDashboardSearchTerm={setDashboardSearchTerm}
                statusFilter={dashboardStatusFilter}
                setStatusFilter={setDashboardStatusFilter}
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
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                onAddPatient={openAddPatient}
                onViewPatient={onViewPatient}
                onOpenRecord={onOpenRecord}
                patients={patientsForViews}
                loading={loading}
                onDeletePatient={handleDeletePatient}
              />
            )}
          />
          <Route path="/configuracion" element={<SettingsView session={session} />} />
          <Route path="/pacientes/:id/odontograma" element={<OdontogramView />} />
        </Route>

        {/* ── Rutas de utilidad / fallback ────────────────────────────── */}
        <Route path="/update-password" element={<Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
