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
    console.log("App.js mount: Checking session...");

    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Error getting session on mount:", error);
      }
      console.log("Initial session check:", session ? "Found" : "Not found", session?.user?.email);
      setSession(session);
      setLoading(false);

      // Guardar el token de refresh si existe
      if (session?.provider_refresh_token && session.user) {
        supabase.from('profiles').upsert({ id: session.user.id, google_refresh_token: session.provider_refresh_token }).then();
      }
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("AuthStateChange event:", event, session ? "Session present" : "Session null");
      setSession(session);
      setLoading(false);

      if (event === 'SIGNED_OUT') {
        // Clear anything stuck in local state if needed
        setSession(null);
      }

      if (session?.provider_refresh_token && session.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        await supabase.from('profiles').upsert({ id: session.user.id, google_refresh_token: session.provider_refresh_token });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    console.log("Logging out...");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null); // Force clear state
      console.log("Logout successful");
    } catch (err) {
      console.error("Logout error:", err);
      // Fallback: Clear local storage and state manually if signOut fails
      localStorage.clear();
      setSession(null);
      window.location.href = '/';
    }
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
