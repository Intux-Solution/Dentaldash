/**
 * Validacion server-side de las funcionalidades que se cobran.
 *
 * Hasta ahora el feature gating vivia solo en React: `SettingsView` mostraba un
 * `UpgradePrompt` en lugar del tab, y ahi terminaba el control. Ninguna Edge
 * Function consultaba `feature_permissions`, asi que llamar a la funcion
 * directamente con un JWT valido alcanzaba para usar una feature de un plan que
 * el usuario no pagaba.
 *
 * El aislamiento de DATOS nunca dependio de esto — eso lo da RLS por `user_id` y
 * sigue intacto. Lo que faltaba era el control de acceso a FUNCIONES pagas.
 */

/** Resultado de la consulta. `reason` solo viene cuando `allowed` es false. */
export interface FeatureCheck {
  allowed: boolean;
  reason?: "no_subscription" | "not_in_plan";
}

/**
 * Determina si un usuario puede usar una feature.
 *
 * Espeja exactamente la logica de `canUse()` en `SubscriptionContext`, para que
 * la UI y el servidor nunca discrepen sobre quien puede hacer que:
 *
 *   1. Los admins pasan siempre.
 *   2. Los usuarios `free` (acceso otorgado a mano por un admin) pasan siempre.
 *   3. El resto, segun `feature_permissions.enabled`.
 *
 * Requiere un cliente con service role: lee `admin_users`, que no es accesible
 * con la anon key.
 *
 * Ante un error de base devuelve `allowed: true`. Es deliberado: una falla
 * transitoria de Supabase no debe cortarle una feature a alguien que la pago.
 * El costo de equivocarse hacia el otro lado (dejar pasar de mas por un error
 * puntual) es mucho menor que el de bloquear a un cliente al dia.
 */
export async function checkFeature(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  featureKey: string,
): Promise<FeatureCheck> {
  try {
    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminRow) return { allowed: true };

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (sub?.status === "free") return { allowed: true };

    const { data: perm } = await supabase
      .from("feature_permissions")
      .select("enabled")
      .eq("user_id", userId)
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (perm?.enabled === true) return { allowed: true };
    return { allowed: false, reason: perm ? "not_in_plan" : "no_subscription" };
  } catch (err) {
    console.error(`checkFeature(${featureKey}) fallo, se deja pasar:`, err);
    return { allowed: true };
  }
}

/** Azucar para los caminos que solo necesitan el booleano. */
export async function hasFeature(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  featureKey: string,
): Promise<boolean> {
  return (await checkFeature(supabase, userId, featureKey)).allowed;
}
