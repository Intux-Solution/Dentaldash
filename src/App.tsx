// src/App.tsx
import React, { useEffect, useState } from 'react';
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { AppointmentService } from './services/AppointmentService';

// Instancia global de QueryClient, creada fuera del componente para evitar re-creaciones
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Hidratación inicial optimizada
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (!error) {
        setSession(initialSession);
      }
      setLoading(false);
    });

    // 2. Suscripción a cambios futuros
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);

      if (event === 'SIGNED_OUT' || !newSession) {
        queryClient.clear();
      }

      if (
        newSession?.provider_refresh_token &&
        newSession.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
      ) {
        supabase
          .from('profiles')
          .upsert({ id: newSession.user.id, google_refresh_token: newSession.provider_refresh_token })
          .then(({ error }) => {
            if (error) console.error('App: Error syncing refresh token:', error);
          });
      }

      if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        // Ejecutar sync global
        AppointmentService.syncPendingAppointments(newSession).catch(err => {
          console.error('Error in global background sync:', err);
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.error('Error during Supabase signOut:', error);
    } catch (err) {
      console.error('Unexpected exception during logout:', err);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
      setSession(null);
      // Let React Router handle navigation if needed or just drop session to render LoginView
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
        Cargando sesión...
      </div>
    );
  }

  // Se mueve la configuración del router aquí tras determinar la sesión
  const router = createBrowserRouter([
    { path: '/privacy', element: <PrivacyPolicy /> },
    { path: '/terms', element: <TermsOfService /> },
    {
      path: '/*',
      element: !session ? (
        <LoginView onSuccess={() => { }} />
      ) : (
        <AuthedApp onLogout={handleLogout} />
      ),
    }
  ]);

  return (
    <ErrorBoundary fallbackMessage="Ha ocurrido un error inesperado al cargar la aplicación principal. Por favor, intenta de nuevo.">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
