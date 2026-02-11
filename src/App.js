// src/App.js - App simplificada con Auth + Router
import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router } from 'react-router-dom';

import { isAuthenticated, saveAuth, clearAuth, getTokenInfo } from './utils/auth';
import LoginView from './components/LoginView';
import AuthedApp from './components/AuthedApp.jsx';

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const handleLoginSuccess = useCallback((token, user) => {
    try {
      saveAuth(token, user);
      setAuthed(true);
      setJustLoggedIn(true);
    } catch (e) {
      setAuthed(true);
      setJustLoggedIn(true);
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthed(false);
    setJustLoggedIn(false);
  }, []);

  const handleConsumedLogin = useCallback(() => {
    setJustLoggedIn(false);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Debug deshabilitado: evitar logs en consola
    }
  }, [authed, justLoggedIn]);

  if (!authed) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  return (
    <Router>
      <AuthedApp onLogout={handleLogout} justLoggedIn={justLoggedIn} onConsumedLogin={handleConsumedLogin} />
    </Router>
  );
}
