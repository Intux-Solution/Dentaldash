// src/components/AuthedApp.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, Users, LogOut, Menu, X, Settings } from 'lucide-react';

import Sidebar from './Sidebar';
import Header from './Header';
import ModalsRoot from './ModalsRoot';
import AppRoutes from '../router/AppRoutes';

import { usePatients } from '../hooks/usePatients';
import { useTurnos } from '../hooks/useTurnos';
import { ModalsProvider } from '../hooks/useModals';
import { useNormalizedPatients } from '../hooks/useNormalizedPatients';

import { PatientService } from '../services/PatientService';
import { AppointmentService } from '../services/AppointmentService';


const titleByPath = (pathname) => {
  if (pathname.startsWith('/pacientes')) return 'Pacientes';
  if (pathname.startsWith('/turnos')) return 'Turnos';
  return 'Dashboard';
};

export default function AuthedApp({ onLogout, justLoggedIn, onConsumedLogin, session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navegar a home después del login
  useEffect(() => {
    if (justLoggedIn) {
      navigate('/', { replace: true });
      if (onConsumedLogin) onConsumedLogin();
    }
  }, [justLoggedIn, navigate, onConsumedLogin]);

  // Sync pendientes con Google Calendar al iniciar y periódicamente
  useEffect(() => {
    const runSync = async () => {
      try {
        await AppointmentService.syncPendingAppointments(session);
      } catch (e) {
        console.error("Auto-Sync failed:", e);
      }
    };

    // 1. Ejecutar al inicio (con delay)
    const initialTimer = setTimeout(runSync, 2000);

    // 2. Ejecutar cada 5 minutos (300000 ms)
    const interval = setInterval(runSync, 300000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const { patients, loading, error, addPatient, updatePatient, refreshPatients } = usePatients(session);
  const { turnos, refreshTurnos } = useTurnos(null, null, session);

  const { normalizedPatients } = useNormalizedPatients(patients);

  // Eliminar paciente (para usar en ModalsRoot)
  const handleDeletePatient = useCallback(
    async (patientData) => {
      try {
        const patient =
          typeof patientData === 'string'
            ? normalizedPatients.find(
              (p) =>
                p?.id === patientData ||
                p?._id === patientData ||
                p?.dni === patientData
            )
            : patientData;

        if (!patient) throw new Error('No se pudo encontrar el paciente');

        const id = patient?.id || patient?._id;
        if (!id) throw new Error('No se pudo identificar el paciente (falta ID)');

        await PatientService.deletePatient(id);
        await refreshPatients();
      } catch (err) {
        throw err;
      }
    },
    [refreshPatients, normalizedPatients]
  );

  const headerTitle = titleByPath(location.pathname);

  return (
    <ModalsProvider
      patients={normalizedPatients}
      turnos={turnos}
      addPatient={addPatient}
      updatePatient={updatePatient}
      refreshTurnos={refreshTurnos}
      refreshPatients={refreshPatients}
    >
      <div className="flex h-screen bg-gray-100">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={onLogout} />

        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
          <Header title={headerTitle} setSidebarOpen={setSidebarOpen} onLogout={onLogout} session={session} />

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mx-4 mt-4 rounded">
              <div className="flex justify-between items-center">
                <span>Error cargando pacientes: {error}</span>
                <button onClick={refreshPatients} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-auto">
            <AppRoutes normalizedPatients={normalizedPatients} loading={loading} refreshPatients={refreshPatients} session={session} />
          </main>
        </div>
        <ModalsRoot patientsLoading={loading} onDeletePatient={handleDeletePatient} session={session} />
      </div>
    </ModalsProvider>
  );
}
