/**
 * Funcionalidades que un plan puede habilitar o no.
 *
 * Fuente de verdad del frontend. Debe mantenerse en sync con
 * `supabase/functions/_shared/feature-keys.ts` (Edge Functions). Del lado SQL no
 * hay copia: `apply_pending_plan_changes()` deriva el universo de claves de
 * `subscription_plans.feature_keys UNION feature_permissions`.
 *
 * ─── Por qué son cinco y no once ───────────────────────────────────────────
 *
 * Había once claves, y seis no bloqueaban absolutamente nada: se escribían en la
 * base en cada cambio de plan y no las consultaba nadie. La lista prometía un
 * control que no existía, que es peor que no tener la clave.
 *
 * Se retiraron:
 *   - `appointments`, `odontogram`, `clinical_records`, `consent_forms`: son el
 *     producto base. Un DentalDash que no puede agendar un turno no es un plan
 *     más barato, es un producto roto.
 *   - `patients_unlimited`: nunca hubo un límite de pacientes implementado en
 *     ningún lado (ni UI, ni RLS, ni Edge Function).
 *   - `google_calendar`: ambos planes vigentes ya lo otorgan, así que la clave
 *     no distinguía nada.
 *
 * Si mañana hace falta un plan gratuito con tope de pacientes, la clave vuelve
 * junto con el control que la haga cumplir — no antes.
 */
export const ALL_FEATURE_KEYS = [
  { key: 'insurance_management', label: 'Gestión de Obras Sociales' },
  { key: 'services_config', label: 'Configuración de Servicios' },
  { key: 'export_data', label: 'Exportar datos' },
  { key: 'whatsapp_bot', label: 'Bot WhatsApp' },
  { key: 'faqs_config', label: 'Preguntas Frecuentes' },
] as const;

export const ALL_FEATURE_KEY_STRINGS = ALL_FEATURE_KEYS.map((f) => f.key);
