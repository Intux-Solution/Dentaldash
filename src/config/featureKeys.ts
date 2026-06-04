export const ALL_FEATURE_KEYS = [
  { key: 'appointments', label: 'Turnos' },
  { key: 'odontogram', label: 'Odontograma' },
  { key: 'clinical_records', label: 'Historial Clínico' },
  { key: 'consent_forms', label: 'Consentimientos' },
  { key: 'patients_unlimited', label: 'Pacientes ilimitados' },
  { key: 'insurance_management', label: 'Gestión de Obras Sociales' },
  { key: 'services_config', label: 'Configuración de Servicios' },
  { key: 'export_data', label: 'Exportar datos' },
  { key: 'whatsapp_bot', label: 'Bot WhatsApp' },
  { key: 'google_calendar', label: 'Google Calendar' },
  { key: 'faqs_config', label: 'Preguntas Frecuentes' },
] as const;

export const ALL_FEATURE_KEY_STRINGS = ALL_FEATURE_KEYS.map((f) => f.key);
