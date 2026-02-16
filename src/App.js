// src/App.js - UPDATED 2026-02-16 - Google Auth Only
import React, { useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { supabase } from './config/supabaseClient';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
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
