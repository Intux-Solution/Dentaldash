/**
 * Claves de funcionalidad del sistema. Fuente de verdad para las Edge Functions.
 *
 * Estaba duplicada literalmente en `admin-api` y `mp-webhook`: agregar una feature
 * exigía tocar ambas y recordar redeployar las dos, y si alguna quedaba atrás el
 * usuario recibía permisos incompletos según qué camino disparó la actualización
 * (asignación manual del admin o webhook de pago).
 *
 * Debe mantenerse en sync con:
 *   - `src/config/featureKeys.ts` (frontend, incluye los labels de la UI)
 *   - `apply_pending_plan_changes()` (SQL), que ahora las deriva de
 *     `subscription_plans.feature_keys` en vez de tener su propia copia.
 *
 * Eran once. Seis no bloqueaban nada — se escribian en la base en cada cambio de
 * plan y no las leia nadie — asi que se retiraron: `appointments`, `odontogram`,
 * `clinical_records` y `consent_forms` (son el producto base, no un extra),
 * `patients_unlimited` (nunca hubo limite implementado) y `google_calendar`
 * (ambos planes vigentes ya lo otorgan). Ver src/config/featureKeys.ts.
 */
export const ALL_FEATURES = [
  "insurance_management",
  "services_config",
  "export_data",
  "whatsapp_bot",
  "faqs_config",
] as const;

export type FeatureKey = typeof ALL_FEATURES[number];

export interface PermissionRow {
  user_id: string;
  feature_key: string;
  enabled: boolean;
  updated_at: string;
}

/**
 * Construye el upsert COMPLETO de `feature_permissions` para un usuario: una fila
 * por cada feature del sistema, con `enabled` según si está en `enabledKeys`.
 *
 * Devolver todas las claves (y no solo las habilitadas) es lo que hace que un
 * downgrade revoque de verdad: un upsert parcial dejaría las viejas en `true`.
 *
 * Usar con `{ onConflict: "user_id,feature_key" }`.
 */
export function buildPermissionRows(
  userId: string,
  enabledKeys: readonly string[],
  now = new Date().toISOString(),
): PermissionRow[] {
  return ALL_FEATURES.map((key) => ({
    user_id: userId,
    feature_key: key,
    enabled: enabledKeys.includes(key),
    updated_at: now,
  }));
}
