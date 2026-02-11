// src/config/n8n.js
export const N8N_BASE = process.env.REACT_APP_N8N_BASE || 'https://n8n-automation.chilldigital.tech';
export const URL_UPDATE_PATIENT = `${N8N_BASE}/webhook/update-patient`;
export const URL_SEND_MESSAGE = `${N8N_BASE}/webhook/send-message`;
export const URL_CREATE_PATIENT = `${N8N_BASE}/webhook/create-patient`;
export const URL_GET_PATIENTS = `${N8N_BASE}/webhook/get-patients`;
export const URL_DELETE_PATIENT = `${N8N_BASE}/webhook/delete-patient`;

// ✨ Endpoint de turnos (usando tu path actual)
export const URL_CALENDAR_EVENTS = `${N8N_BASE}/webhook/turnos-hoy`;

// Webhooks faltantes para BookingForm
export const URL_CHECK_PATIENT = `${N8N_BASE}/webhook/check-patient`;
export const URL_CREATE_APPOINTMENT = `${N8N_BASE}/webhook/create-appointment`;
export const URL_GET_AVAILABILITY = `${N8N_BASE}/webhook/get-availability`;
export const URL_UPDATE_APPOINTMENT = `${N8N_BASE}/webhook/update-appointment`;
export const URL_DELETE_APPOINTMENT = `${N8N_BASE}/webhook/delete-appointment`;

// Objeto con todas las rutas de N8N
export const N8N_ENDPOINTS = {
  // Pacientes
  UPDATE_PATIENT: URL_UPDATE_PATIENT,
  SEND_MESSAGE: URL_SEND_MESSAGE,
  CREATE_PATIENT: URL_CREATE_PATIENT,
  GET_PATIENTS: URL_GET_PATIENTS,
  DELETE_PATIENT: URL_DELETE_PATIENT,

  // Turnos / Calendario
  CALENDAR_EVENTS: URL_CALENDAR_EVENTS,

  // Booking
  CHECK_PATIENT: URL_CHECK_PATIENT,
  CREATE_APPOINTMENT: URL_CREATE_APPOINTMENT,
  GET_AVAILABILITY: URL_GET_AVAILABILITY,
  UPDATE_APPOINTMENT: URL_UPDATE_APPOINTMENT,
  DELETE_APPOINTMENT: URL_DELETE_APPOINTMENT,
};
