import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Header from './Header';
import ModalsRoot from './ModalsRoot';
import AppRoutes from '../router/AppRoutes';
import ErrorBoundary from './ErrorBoundary';
import { AppointmentService } from '../services/AppointmentService';
import { message } from 'antd';

import { usePatients } from '../hooks/usePatients';
import { useTurnos } from '../hooks/useTurnos';
import { ModalsProvider } from '../hooks/useModals';
import { useNormalizedPatients } from '../hooks/useNormalizedPatients';
import { useAuth } from '../context/AuthContext';

const titleByPath = (pathname: string) => {
  if (pathname.startsWith('/pacientes')) return 'Pacientes';
  if (pathname.startsWith('/turnos')) return 'Turnos';
  return 'Dashboard';
};

interface AuthedAppProps {
  onLogout: () => void;
}

export default function AuthedApp({ onLogout }: AuthedAppProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── Datos ────────────────────────────────────────────────────────────────
  const { patients, loading, error, addPatient, updatePatient, refreshPatients } = usePatients();
  const { turnos, refreshTurnos } = useTurnos(null, null);
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
    >
      <div className="flex h-screen bg-gray-100">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={onLogout} />

        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
          <Header title={headerTitle} setSidebarOpen={setSidebarOpen} onLogout={onLogout} />

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
              <AppRoutes />
            </ErrorBoundary>
          </main>
        </div>

        {/* Sin props — todo llega por contexto */}
        <ModalsRoot />
      </div>
    </ModalsProvider>
  );
}
