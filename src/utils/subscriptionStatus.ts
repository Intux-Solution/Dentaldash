/**
 * Reglas de vencimiento de la suscripción.
 *
 * Vive fuera de `SubscriptionContext` para poder testearlas sin montar React:
 * son las reglas que deciden si alguien entra o no a la app, así que un error
 * acá deja afuera a un cliente que paga (o le regala el servicio).
 */

/**
 * Días de tolerancia después de que vence el período pagado.
 *
 * MercadoPago no cobra la cuota exactamente el día de la renovación: reintenta
 * durante un tiempo si la tarjeta rechaza. Cortar el acceso el mismo día dejaría
 * afuera a gente que sí está pagando y cuyo cobro está en curso.
 */
export const GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'free';

export interface ExpiryInput {
  status: SubscriptionStatus | null;
  /** Fin del período de prueba. Solo aplica a `trial`. */
  trialEndsAt: string | null;
  /** Fin del período pagado, tal como lo informó MercadoPago. */
  currentPeriodEnd: string | null;
}

export interface ExpiryResult {
  /** `true` = el guard debe bloquear el acceso. */
  isExpired: boolean;
  /** Días restantes de trial. `null` si no está en trial. */
  daysLeft: number | null;
  /**
   * `true` cuando el período pagado ya venció pero todavía corre la gracia. Es
   * el momento de avisar: el acceso sigue, y falta poco para que no siga.
   */
  inGracePeriod: boolean;
  /**
   * Días hasta que se corte el acceso. Solo se informa durante la gracia
   * (`inGracePeriod`); fuera de ella es `null`, porque faltar 28 días para la
   * próxima renovación no es algo que haya que avisarle a nadie.
   */
  daysUntilCutoff: number | null;
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Decide si una suscripción está vencida.
 *
 * Dos caminos independientes:
 *
 * 1. **Trial agotado** — `trial` con `trial_ends_at` en el pasado.
 * 2. **Período pagado vencido** — `active` o `past_due` con `current_period_end`
 *    vencido hace más de `GRACE_DAYS`.
 *
 * El segundo no existía: un `past_due` (tarjeta rechazada) conservaba acceso
 * completo para siempre, y un `active` cuyo cobro dejó de entrar también. Se
 * volvió imprescindible al arreglar el mapeo de estados del webhook: abandonar
 * un checkout de upgrade deja al usuario en `active` con el preapproval viejo ya
 * cancelado, o sea sin que nadie le cobre nunca más.
 *
 * `free` (acceso otorgado por el admin) nunca vence: no tiene período.
 */
export function evaluateExpiry(input: ExpiryInput, now: number = Date.now()): ExpiryResult {
  const { status, trialEndsAt, currentPeriodEnd } = input;

  const isTrial = status === 'trial';

  const trialEndMs = parseTime(trialEndsAt);
  const daysLeft = isTrial && trialEndMs !== null
    ? Math.max(0, Math.ceil((trialEndMs - now) / DAY_MS))
    : null;

  const trialExhausted = daysLeft !== null && daysLeft <= 0;

  // Solo los estados que dependen de un cobro recurrente miran el período.
  const billed = status === 'active' || status === 'past_due';
  const periodEndMs = parseTime(currentPeriodEnd);

  let periodLapsed = false;
  let inGracePeriod = false;
  let daysUntilCutoff: number | null = null;

  if (billed && periodEndMs !== null) {
    const cutoffMs = periodEndMs + GRACE_DAYS * DAY_MS;
    periodLapsed = now > cutoffMs;
    // La gracia solo empieza una vez vencido el período: antes de eso la
    // suscripción está simplemente al día y no hay nada que avisar.
    inGracePeriod = !periodLapsed && now > periodEndMs;
    if (inGracePeriod) {
      daysUntilCutoff = Math.max(0, Math.ceil((cutoffMs - now) / DAY_MS));
    }
  }

  return {
    isExpired: trialExhausted || periodLapsed,
    daysLeft,
    inGracePeriod,
    daysUntilCutoff,
  };
}
