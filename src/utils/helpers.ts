// src/utils/helpers.ts
import { parseLocalYMD, createARDateTime } from './dateUtils';

export const initials = (name = '') =>
  name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

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
  const localDate = parseLocalYMD(dateStr);
  if (!localDate) return null;
  const date = createARDateTime(localDate, timeStr);
  return isNaN(date.getTime()) ? null : date.toISOString();
};
