// src/components/AuthedApp.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Header from './Header';
import ModalsRoot from './ModalsRoot';
import AppRoutes from '../router/AppRoutes';

import { usePatients } from '../hooks/usePatients';
import { useTurnos } from '../hooks/useTurnos';
import { ModalsProvider } from '../hooks/useModals';
import { useNormalizedPatients } from '../hooks/useNormalizedPatients';

import { checkTokenExpiry, getTokenInfo } from '../utils/auth';
import { URL_DELETE_PATIENT } from '../config/n8n';
import { apiFetch } from '../utils/api';

const titleByPath = (pathname) => {
  if (pathname.startsWith('/pacientes')) return 'Pacientes';
  if (pathname.startsWith('/turnos')) return 'Turnos';
  return 'Dashboard';
};

export default function AuthedApp({ onLogout, justLoggedIn, onConsumedLogin }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Verificar token periódicamente
  useEffect(() => {
    if (!checkTokenExpiry()) {
      onLogout();
      return;
    }

    const tokenCheckInterval = setInterval(() => {
      if (!checkTokenExpiry()) {
        onLogout();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(tokenCheckInterval);
  }, [onLogout]);

  // Navegar a home después del login
  useEffect(() => {
    if (justLoggedIn) {
      navigate('/', { replace: true });
      if (onConsumedLogin) onConsumedLogin();
    }
  }, [justLoggedIn, navigate, onConsumedLogin]);

  // Debug: Mostrar info del token en desarrollo
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Debug deshabilitado: evitar logs en consola
      void getTokenInfo();
    }
  }, []);

  const { patients, loading, error, addPatient, updatePatient, refreshPatients } = usePatients();
  const { refreshTurnos } = useTurnos();

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

        const dni = patient?.dni || '';
        if (!dni) throw new Error('No se pudo identificar el paciente (falta DNI)');

        const response = await apiFetch(URL_DELETE_PATIENT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dni, timestamp: new Date().toISOString() }),
        });
        if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

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
                <button onClick={refreshPatients} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-auto">
            <AppRoutes normalizedPatients={normalizedPatients} loading={loading} refreshPatients={refreshPatients} />
          </main>
        </div>

        <ModalsRoot patientsLoading={loading} onDeletePatient={handleDeletePatient} />
      </div>
    </ModalsProvider>
  );
}

