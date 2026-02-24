// src/App.js
import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';

// Instancia global de QueryClient, creada fuera del componente para evitar re-creaciones
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evitar refetch al volver a enfocar la ventana en desarrollo (opcional)
      refetchOnWindowFocus: false,
      // Reintentar 1 vez en caso de error antes de reportarlo
      retry: 1,
      // Datos frescos por 30 segundos
      staleTime: 30_000,
    },
  },
});

export default function App() {
  const [session, setSession] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const lastSessionId = React.useRef(null);

  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const newId = newSession?.user?.id || null;

      if (newId === lastSessionId.current && event !== 'SIGNED_OUT') {
        setLoading(false);
        return;
      }

      lastSessionId.current = newId;

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setLoading(false);
        // Limpiar caché de queries al cerrar sesión
        queryClient.clear();
        return;
      }

      setSession(newSession);
      setLoading(false);

      if (
        newSession.provider_refresh_token &&
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
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    console.log('Manual logout triggered');
    try {
      // 1. Asegurar cierre correcto en el backend sin condiciones de carrera
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error en Supabase durante signOut:', error);
      }
    } catch (err) {
      console.error('Excepción inesperada en logout:', err);
    } finally {
      // 2. Limpieza local exhaustiva siempre (incluso si hubo error de red)
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
      setSession(null);
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
        Cargando sesión...
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route
            path="/*"
            element={
              !session ? (
                <LoginView onSuccess={() => { }} />
              ) : (
                <AuthedApp onLogout={handleLogout} justLoggedIn={false} session={session} />
              )
            }
          />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
