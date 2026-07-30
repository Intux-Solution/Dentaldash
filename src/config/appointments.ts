// src/config/appointments.ts
//
// Los horarios laborales reales viven en la tabla `schedules` (por usuario y día),
// y los tipos de turno en `profiles.services`. Acá solo queda la granularidad con
// la que se generan los slots que se le ofrecen al paciente.

/** Paso entre inicios de slot, en minutos. */
export const SLOT_INTERVAL_MINUTES = 30;
