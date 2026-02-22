// src/App.js - UPDATED 2026-02-16 - Google Auth & Legal Pages
import React, { useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp.jsx';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track re-mounts within the same page session
    window._appMountCount = (window._appMountCount || 0) + 1;
    console.log(`[DEBUG] App.js mount #${window._appMountCount} - Navigation Type: ${performance.navigation.type}`);

    // Solo usamos onAuthStateChange para capturar la sesión inicial y cambios.
    // getSession() es redundante y causa deadlocks al ejecutarse en paralelo con el listener interno de Supabase.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("AuthStateChange event:", event, "Session exists?", !!session);

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setLoading(false);
        return;
      }

      // Si hay una sesión, la guardamos.
      if (session) {
        setSession(session);
        setLoading(false);

        // Registro de actividad/refresh token (opcional, solo en eventos relevantes)
        if (session.provider_refresh_token && session.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          console.log("Syncing provider token...");
          supabase.from('profiles')
            .upsert({ id: session.user.id, google_refresh_token: session.provider_refresh_token })
            .then(({ error }) => {
              if (error) console.error("Error syncing refresh token:", error);
            });
        }
      } else {
        // No hay sesión
        setSession(null);
        setLoading(false);
      }
    });

    return () => {
      console.log(`App.js unmount #${window._appMountCount}`);
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    console.log("Manual logout triggered");
    try {
      // Intentamos cerrar la sesión de forma controlada con un timeout máximo de 3 segundos
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SignOut Timeout')), 3000));
      const { error } = await Promise.race([signOutPromise, timeoutPromise]);

      if (error) console.error("Supabase signOut threw an error, forcing local clear:", error);
    } catch (err) {
      console.error("Logout caught error or timeout:", err);
    } finally {
      console.log("Forcing local storage and session clear...");
      localStorage.clear();
      sessionStorage.clear();
      setSession(null);
      window.location.href = '/';
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">Cargando sesión...</div>;
  }

  return (
    <Router>
      <Routes>
        {/* Public Legal Routes */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* Auth-protected Routes logic */}
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
  );
}
