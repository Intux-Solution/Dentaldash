// src/components/AuthedApp.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Header from './Header';
import ModalsRoot from './ModalsRoot';
import AppRoutes from '../router/AppRoutes';
import ErrorBoundary from './ErrorBoundary'; // <--- NEW IMPORT
import { AppointmentService } from '../services/AppointmentService';
import { message } from 'antd';

import { usePatients } from '../hooks/usePatients';
import { useTurnos } from '../hooks/useTurnos';
import { ModalsProvider } from '../hooks/useModals';
import { useNormalizedPatients } from '../hooks/useNormalizedPatients';

const titleByPath = (pathname) => {
  if (pathname.startsWith('/pacientes')) return 'Pacientes';
  if (pathname.startsWith('/turnos')) return 'Turnos';
  return 'Dashboard';
};

export default function AuthedApp({ onLogout, justLoggedIn, onConsumedLogin, session }: { onLogout: any, justLoggedIn: any, onConsumedLogin?: any, session: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navegar a home tras login
  useEffect(() => {
    if (justLoggedIn) {
      navigate('/', { replace: true });
      if (onConsumedLogin) onConsumedLogin();
    }
  }, [justLoggedIn, navigate, onConsumedLogin]);



  // ─── Datos ────────────────────────────────────────────────────────────────
  const { patients, loading, error, addPatient, updatePatient, refreshPatients } = usePatients(session);
  const { turnos, refreshTurnos } = useTurnos(null, null, session);
  const { normalizedPatients } = useNormalizedPatients(patients);

  const headerTitle = titleByPath(location.pathname);

  return (
    <ModalsProvider
      patients={normalizedPatients}
      turnos={turnos}
      addPatient={addPatient}
      updatePatient={updatePatient}
      refreshTurnos={refreshTurnos}
      refreshPatients={refreshPatients}
      session={session}
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
            <ErrorBoundary fallbackMessage="Ocurrió un error inesperado cargando esta vista.">
              <AppRoutes
                normalizedPatients={normalizedPatients}
                loading={loading}
                refreshPatients={refreshPatients}
                session={session}
              />
            </ErrorBoundary>
          </main>
        </div>

        {/* Sin props — todo llega por contexto */}
        <ModalsRoot />
      </div>
    </ModalsProvider>
  );
}
