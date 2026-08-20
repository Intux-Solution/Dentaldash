/**
 * Traduccion del estado de un preapproval de MercadoPago al estado interno de
 * la suscripcion.
 *
 * Vive en su propio modulo, sin un solo import, para poder testearlo desde
 * vitest: el resto de `mp-webhook` arrastra dependencias de Deno y de esm.sh
 * que no cargan fuera del runtime de Edge Functions. Es la funcion mas cara de
 * equivocar del sistema, asi que tiene que ser la mas facil de probar.
 */

/** Estados internos que un evento de MercadoPago puede imponer. */
export type InternalStatus = "active" | "cancelled" | "past_due";

/**
 * Devuelve `null` cuando MercadoPago informa un estado que no tiene un
 * significado definido para nosotros — y eso significa **no tocar el status**,
 * no degradarlo.
 *
 * ─── Por que importa tanto ────────────────────────────────────────────────
 *
 * Antes el `default` de este switch era `"trial"`. El camino que rompia es el
 * mas comun del sistema:
 *
 *   1. `create-checkout` crea el preapproval con `status: "pending"` (es
 *      obligatorio: es lo que genera el `init_point` del checkout).
 *   2. MercadoPago emite un `subscription_preapproval` por esa creacion, con
 *      el preapproval todavia en `pending`.
 *   3. Ese evento caia en el `default` y escribia `status = 'trial'` sobre la
 *      fila de alguien que ya estaba pagando.
 *   4. Como al activar un plan `trial_ends_at` queda fijado en `now()`, el
 *      usuario pasaba a estar en un trial vencido: `ProtectedRoute` lo echaba
 *      de su propia cuenta paga apenas abria el checkout de un upgrade. Si
 *      abandonaba el pago, no volvia a entrar nunca.
 *
 * Se verifico en produccion: habia una suscripcion con `current_period_end` a
 * un mes en el futuro, `mercadopago_sub_id` cargado y `status = 'trial'` con
 * `trial_ends_at` vencido. Habia pagado y estaba afuera.
 *
 * `trial` solo lo asigna el trigger de alta (`handle_new_user_subscription`).
 */
export function mapMpStatus(mpStatus: string | null | undefined): InternalStatus | null {
  switch (mpStatus) {
    case "authorized":
    case "charged":
      return "active";
    case "cancelled":
    case "paused":
      return "cancelled";
    case "payment_failed":
      return "past_due";
    default:
      // "pending" y cualquier estado que MercadoPago agregue en el futuro.
      return null;
  }
}
