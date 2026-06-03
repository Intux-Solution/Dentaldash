// src/utils/helpers.ts
export const initials = (name = '') =>
  name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

export const cls = (...a: (string | boolean | null | undefined)[]) => a.filter(Boolean).join(' ');

// Accent-insensitive, case-insensitive normalization for search
export const norm = (str = '') =>
  String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const calculateAge = (fechaNacimiento: string | undefined | null): number | null => {
  if (!fechaNacimiento) return null;
  const birth = new Date(fechaNacimiento);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export const combineDateTimeToISO = (dateStr: string, timeStr: string): string | null => {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.toISOString();
};
