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
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      // Guardar el token de refresh si existe
      if (session?.provider_refresh_token && session.user) {
        supabase.from('profiles').update({ google_refresh_token: session.provider_refresh_token }).eq('id', session.user.id).then();
      }
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.provider_refresh_token && session.user) {
        await supabase.from('profiles').update({ google_refresh_token: session.provider_refresh_token }).eq('id', session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">Cargando...</div>;
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
              <AuthedApp onLogout={handleLogout} justLoggedIn={false} />
            )
          }
        />
      </Routes>
    </Router>
  );
}
