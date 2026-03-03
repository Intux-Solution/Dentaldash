// src/App.tsx
import React from 'react';
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

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

const RootRoute = () => {
  const { session } = useAuth();

  if (!session) {
    return <LoginView onSuccess={() => { }} />;
  }

  return (
    <AuthedApp onLogout={async () => {
      try {
        await supabase.auth.signOut();
      } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
        console.error('Logout error:', err);
      } finally {
        queryClient.clear();
      }
    }} />
  );
};

const globalRouter = createBrowserRouter([
  { path: '/privacy', element: <PrivacyPolicy /> },
  { path: '/terms', element: <TermsOfService /> },
  {
    path: '/*',
    element: <RootRoute />
  }
]);

const AppContent = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
        Cargando sesión...
      </div>
    );
  }

  return <RouterProvider router={globalRouter} />;
};

export default function App() {
  return (
    <ErrorBoundary fallbackMessage="Ha ocurrido un error inesperado al cargar la aplicación principal. Por favor, intenta de nuevo.">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Toaster position="top-right" />
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
