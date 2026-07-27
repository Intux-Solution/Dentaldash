// src/utils/avatar.ts
import { supabase } from '../config/supabaseClient';

/**
 * Convierte lo que guarda `profiles.avatar_url` en una URL usable por un <img>.
 *  - '' | null | undefined  → null (sin foto, se cae al avatar de iniciales)
 *  - 'http(s)://...'        → tal cual (avatar de Google OAuth)
 *  - '{uuid}-{rand}.jpg'    → public URL del bucket `avatars`
 */
export const resolveAvatarUrl = (raw?: string | null): string | null => {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const { data } = supabase.storage.from('avatars').getPublicUrl(value);
  return data?.publicUrl || null;
};

// Clases estáticas: Tailwind purga lo que no aparezca literal en el código.
const AVATAR_COLORS = [
  'bg-teal-600',
  'bg-indigo-600',
  'bg-rose-500',
  'bg-amber-600',
  'bg-slate-600',
  'bg-emerald-600',
];

/** Color determinístico a partir del nombre: el mismo nombre siempre da el mismo color. */
export const avatarColor = (name?: string | null): string => {
  const value = name ?? '';
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
