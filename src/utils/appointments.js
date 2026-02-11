// src/utils/appointments.js
// Utilidades relacionadas a turnos

export function combineDateTimeToISO(fecha, hora, tz = 'America/Argentina/Buenos_Aires') {
  if (!fecha || !hora) return null;
  try {
    // Parsear fecha como LOCAL (evitar new Date('YYYY-MM-DD') que asume UTC)
    const [yStr, mStr, dStr] = String(fecha).split('-');
    // Normalizar hora a 24h por si viene con AM/PM
    const normalizedTime = to24h(String(hora));
    const [hhStr = '00', mmStr = '00'] = String(normalizedTime).split(':');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1; // 0-based
    const d = parseInt(dStr, 10);
    const hh = parseInt(hhStr, 10) || 0;
    const mm = parseInt(mmStr, 10) || 0;
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const local = new Date(y, m, d, hh, mm, 0, 0);
    // Devolvemos ISO en UTC. El backend puede usar 'timezone' si lo requiere.
    return local.toISOString();
  } catch {
    return null;
  }
}

export function formatDate(dateLike, opts) {
  if (!dateLike) return 'Sin fecha';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return 'Fecha inválida';
  const formatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    ...(opts || {}),
  };
  return d.toLocaleDateString('es-AR', formatOptions);
}

export function formatTime(dateLike, opts) {
  if (!dateLike) return 'Sin hora';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return 'Hora inválida';
  const formatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(opts || {}),
  };
  return d.toLocaleTimeString('es-AR', formatOptions);
}

// Normaliza distintos formatos de objetos de turno a un esquema común
export function normalizeTurno(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const turno = { ...raw };
  const normalized = {
    id: turno.id || turno._id || turno.eventId || null,
    title: turno.title || turno.summary || turno.tipoTurnoNombre || 'Consulta',
    start: turno.start || turno.startTime || null,
    end: turno.end || turno.endTime || null,
    description: turno.description || turno.notas || '',
    location: turno.location || turno.ubicacion || '',
    status: turno.status || turno.estado || 'pending',

    patientName: turno.patientName || turno.paciente || turno.nombre || '',
    patientPhone: turno.patientPhone || turno.telefono || turno.phone || '',
    patientDni: turno.patientDni || turno.dni || '',

    obraSocial: turno.obraSocial || '',
    numeroAfiliado: turno.numeroAfiliado || '',
    alergias: turno.alergias || '',
    antecedentes: turno.antecedentes || '',
  };
  return normalized;
}

// Convierte una hora (posible 12h con AM/PM) a formato 24h HH:MM
export function to24h(timeStr) {
  if (timeStr == null) return '';
  const s = String(timeStr).trim();
  if (!s) return '';

  const m = s.match(/^\s*(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)?\s*$/);
  if (m) {
    let h = parseInt(m[1], 10);
    let min = m[2] != null ? parseInt(m[2], 10) : 0;
    const mer = m[3] ? m[3].toLowerCase() : '';
    if (Number.isNaN(h) || Number.isNaN(min)) return s;
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, min))).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // Intento simple HH:MM
  const m2 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m2) {
    const h = String(Math.max(0, Math.min(23, parseInt(m2[1], 10)))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, parseInt(m2[2], 10)))).padStart(2, '0');
    return `${h}:${mm}`;
  }

  // Solo hora (ej: "9") => 09:00
  const m3 = s.match(/^(\d{1,2})$/);
  if (m3) {
    const h = String(Math.max(0, Math.min(23, parseInt(m3[1], 10)))).padStart(2, '0');
    return `${h}:00`;
  }

  // Si no se puede parsear, devolver original
  return s;
}
