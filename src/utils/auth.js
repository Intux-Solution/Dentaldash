// src/utils/auth.js - UTILIDADES DE AUTENTICACIÓN
import React from 'react';

// Obtener token del localStorage
export const getAuthToken = () => {
  try {
    return localStorage.getItem('token');
  } catch (e) {
    return null;
  }
};

// Obtener datos del usuario
export const getUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
};

// Decodificar payload del token JWT
export const decodeToken = (token) => {
  try {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) {
    return null;
  }
};

// Verificar si está autenticado y token válido
export const isAuthenticated = () => {
  const token = getAuthToken();
  if (!token || token === 'temp_token') {
    return token === 'temp_token'; // Permitir token temporal en desarrollo
  }

  try {
    const payload = decodeToken(token);
    if (!payload) return false;

    // Verificar si el token no ha expirado
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  } catch (e) {
    return false;
  }
};

// Obtener tiempo restante del token
export const getTokenTimeRemaining = () => {
  const token = getAuthToken();
  if (!token || token === 'temp_token') return null;

  try {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    const remaining = payload.exp - now;

    return remaining > 0 ? remaining : 0;
  } catch (e) {
    return null;
  }
};

// Crear headers con autenticación
export const getAuthHeaders = (additionalHeaders = {}) => {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  if (token && token !== 'temp_token') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// Función fetch segura con manejo automático de tokens
export const secureApiCall = async (url, options = {}) => {
  const token = getAuthToken();
  const method = (options.method || 'GET').toUpperCase();

  // En desarrollo, permitir llamadas sin token si es temp_token
  if (!token && process.env.NODE_ENV !== 'development') {
    throw new AuthError('No hay token de autenticación');
  }

  const headers = getAuthHeaders(options.headers);
  const apiKey = process.env.REACT_APP_API_KEY;
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Si es 401, el token expiró o es inválido
    if (response.status === 401) {
      clearAuth();
      // Si estamos en una página que requiere auth, redirigir
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new AuthError('Token expirado');
    }

    // Emitir evento global para mantener datos sincronizados tras webhooks mutadores
    const isMutation = response.ok && method !== 'GET';
    const looksLikeWebhook = typeof url === 'string' && url.includes('/webhook/');
    if (typeof window !== 'undefined' && isMutation && looksLikeWebhook) {
      try {
        window.dispatchEvent(
          new CustomEvent('webhook:mutated', {
            detail: { url, method, status: response.status }
          })
        );
      } catch {
        // No-op en entornos sin window
      }
    }

    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new Error(`Error de conexión: ${error.message}`);
  }
};

// Limpiar datos de autenticación
export const clearAuth = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (e) {}
};

// Guardar datos de autenticación
export const saveAuth = (token, user = null) => {
  try {
    localStorage.setItem('token', token);
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  } catch (e) {}
};

// Logout completo
export const logout = () => {
  clearAuth();

  // Redirigir a login
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Verificar y refrescar token si es necesario
export const checkTokenExpiry = () => {
  if (!isAuthenticated()) {
    return false;
  }

  const remaining = getTokenTimeRemaining();
  if (remaining === null) return true; // temp_token o sin expiración

  // Si queda menos de 1 hora
  if (remaining < 3600) {
    // Si queda menos de 5 minutos, logout automático
    if (remaining < 300) {
      logout();
      return false;
    }
  }

  return true;
};

// Clase de error personalizada
export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

// Debug: Info del token actual
export const getTokenInfo = () => {
  const token = getAuthToken();
  if (!token) return { hasToken: false };

  if (token === 'temp_token') {
    return {
      hasToken: true,
      isTemp: true,
      type: 'temporary',
    };
  }

  const payload = decodeToken(token);
  const remaining = getTokenTimeRemaining();

  return {
    hasToken: true,
    isTemp: false,
    isValid: isAuthenticated(),
    user: payload?.name || payload?.sub || 'Unknown',
    role: payload?.role || 'user',
    expiresAt: payload?.exp ? new Date(payload.exp * 1000).toLocaleString() : 'Never',
    timeRemaining: remaining,
    timeRemainingHuman: remaining
      ? `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`
      : 'N/A',
  };
};

// Hook personalizado para usar en componentes React
export const useAuth = () => {
  const [authInfo, setAuthInfo] = React.useState(() => ({
    isAuthenticated: isAuthenticated(),
    user: getUser(),
    token: getAuthToken(),
  }));

  const refreshAuth = () => {
    setAuthInfo({
      isAuthenticated: isAuthenticated(),
      user: getUser(),
      token: getAuthToken(),
    });
  };

  const handleLogin = (token, user) => {
    saveAuth(token, user);
    refreshAuth();
  };

  const handleLogout = () => {
    logout();
    refreshAuth();
  };

  return {
    ...authInfo,
    login: handleLogin,
    logout: handleLogout,
    refresh: refreshAuth,
    tokenInfo: getTokenInfo(),
  };
};

// Exportar todas las funciones
export default {
  getAuthToken,
  getUser,
  isAuthenticated,
  getAuthHeaders,
  secureApiCall,
  clearAuth,
  saveAuth,
  logout,
  checkTokenExpiry,
  getTokenInfo,
  useAuth,
};
