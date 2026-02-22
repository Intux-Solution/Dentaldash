// src/App.js - UPDATED 2026-02-16 - Google Auth & Legal Pages
import React, { useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';

export default function App() {
  const [session, setSession] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const lastSessionId = React.useRef(null);

  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const newId = newSession?.user?.id || null;

      // Evitar actualizaciones de estado si el ID de usuario no ha cambiado (evita bucles)
      if (newId === lastSessionId.current && event !== 'SIGNED_OUT') {
        setLoading(false);
        return;
      }

      lastSessionId.current = newId;

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(newSession);
      setLoading(false);

      // Sincronización del token de Google (solo en eventos clave)
      if (newSession.provider_refresh_token && newSession.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        supabase.from('profiles')
          .upsert({ id: newSession.user.id, google_refresh_token: newSession.provider_refresh_token })
          .then(({ error }) => {
            if (error) console.error("App: Error syncing refresh token:", error);
          });
      }
    });

    return () => {
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
