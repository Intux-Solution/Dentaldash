// src/hooks/useNormalizedPatients.js
import { useMemo } from 'react';

function parseFechaToMs(raw) {
  if (!raw) return 0;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return iso;
    const m = raw.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const y = parseInt(m[3].length === 2 ? `20${m[3]}` : m[3], 10);
      const hh = m[4] ? parseInt(m[4], 10) : 0;
      const mm = m[5] ? parseInt(m[5], 10) : 0;
      const ss = m[6] ? parseInt(m[6], 10) : 0;
      return new Date(y, mo, d, hh, mm, ss).getTime();
    }
  }
  return 0;
}

export function useNormalizedPatients(patients) {
  const normalizedPatients = useMemo(() => {
    const list = Array.isArray(patients) ? patients : [];

    const getField = (obj, fieldNames, defaultValue = '') => {
      for (const fieldName of fieldNames) {
        let value = obj?.[fieldName] || obj?.fields?.[fieldName];
        
        // Si es un array, tomar el primer elemento
        if (Array.isArray(value)) {
          value = value[0];
        }
        
        if (value != null && value !== '') return String(value);
      }
      return defaultValue;
    };

    return list
      .map((p) => {
        const dniValue = getField(p, ['dni', 'DNI', 'Dni']);

        return {
          id: p?.id || p?._id || dniValue || '',
          nombre: getField(p, ['nombre', 'name'], 'Sin nombre'),
          dni: dniValue,
          telefono: getField(p, ['telefono', 'phone', 'Telefono']),
          obraSocial: getField(p, ['obraSocial', 'obra_social', 'ObraSocial', 'Obra Social']),
          numeroAfiliado: getField(p, ['numeroAfiliado', 'Numero Afiliado', 'Nσero Afiliado', 'numero_afiliado', 'numeroafiliado']),
          email: getField(p, ['email', 'Email', 'correo']),
          direccion: getField(p, ['direccion', 'Direccion', 'address']),
          fechaNacimiento: getField(p, ['fechaNacimiento', 'Fecha Nacimiento', 'birthDate']),
          estado: getField(p, ['estado', 'Estado', 'status'], 'Activo'),
          ultimaVisita: getField(p, ['ultimaVisita', 'Ultima Visita', 'lastVisit'], '-'),
          proximoTurno: getField(p, ['proximoTurno', 'Proximo Turno', 'nextAppointment'], '-'),
          alergias: getField(p, ['alergias', 'alergia', 'Alergia', 'allergies'], 'Ninguna'),
          antecedentes: getField(p, ['antecedentes', 'Antecedentes', 'medicalHistory'], 'Ninguno'),
          notas: getField(p, ['notas', 'Notas', 'notes']),
          historiaClinicaUrl: getField(p, ['historiaClinicaUrl', 'historia_clinica', 'Historia Clinica']),
          fechaCreacion: getField(
            p,
            ['fechaCreacion', 'Fecha Creacion', 'createdAt', 'createdTime'],
            new Date().toISOString().slice(0, 10)
          ),
          _createdAt: parseFechaToMs(p?._createdAt || p?.createdTime || p?.fechaCreacion || Date.now()),
        };
      })
      .sort((a, b) => b._createdAt - a._createdAt);
  }, [patients]);

  const latestPatients = useMemo(() => normalizedPatients.slice(0, 4), [normalizedPatients]);

  return { normalizedPatients, latestPatients };
}
