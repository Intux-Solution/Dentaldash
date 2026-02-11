// src/utils/auth.js - SUPABASE AUTH
import { supabase } from '../config/supabaseClient';

// Get current session
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
};

// Get current user
export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Check if authenticated (synchronous check not possible with Supabase async nature without state)
// But we can check if a session exists in storage (handled by supabase client)
export const isAuthenticated = async () => {
  const session = await getSession();
  return !!session;
};

// Sign In
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

// Sign Out
export const logout = async () => {
  await supabase.auth.signOut();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Utils for compatibility
export const getToken = async () => {
  const session = await getSession();
  return session?.access_token;
};

// Alias for compatibility with api.js (ASYNC NOW)
export const getAuthToken = getToken;

// Dummy for compatibility (Supabase handles this)
export const checkTokenExpiry = () => true;

export default {
  getSession,
  getUser,
  isAuthenticated,
  signIn,
  logout,
  getToken,
  getAuthToken,
  checkTokenExpiry,
};
