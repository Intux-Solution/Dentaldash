// src/utils/helpers.js
export const initials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export const cls = (...a) => a.filter(Boolean).join(' ');

// Accent-insensitive, case-insensitive normalization for search
export const norm = (str = '') =>
  String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
