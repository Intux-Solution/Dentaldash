// src/utils/auth.js - SUPABASE AUTH
import { supabase } from '../config/supabaseClient';

// SignIn y Logout permanecen igual ya que son acciones interactivas del usuario.
const signIn = async (email, password) => {
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

export default {
  signIn,
  logout
};
