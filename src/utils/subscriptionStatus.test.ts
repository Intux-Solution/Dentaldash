import { describe, it, expect } from 'vitest';
import { evaluateExpiry, GRACE_DAYS } from './subscriptionStatus';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-20T12:00:00Z').getTime();

/** ISO de un instante desplazado `days` respecto de NOW. */
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

describe('evaluateExpiry — trial', () => {
  it('no expira mientras queden días de prueba', () => {
    const r = evaluateExpiry(
      { status: 'trial', trialEndsAt: at(5), currentPeriodEnd: null },
      NOW
    );
    expect(r.isExpired).toBe(false);
    expect(r.daysLeft).toBe(5);
  });

  it('expira cuando el trial ya venció', () => {
    const r = evaluateExpiry(
      { status: 'trial', trialEndsAt: at(-1), currentPeriodEnd: null },
      NOW
    );
    expect(r.isExpired).toBe(true);
    expect(r.daysLeft).toBe(0);
  });

  // El trial no tiene gracia: es una prueba, no un cobro que puede demorar.
  it('un trial vencido expira aunque haya un current_period_end vigente', () => {
    const r = evaluateExpiry(
      { status: 'trial', trialEndsAt: at(-1), currentPeriodEnd: at(20) },
      NOW
    );
    expect(r.isExpired).toBe(true);
  });
});

describe('evaluateExpiry — período pagado', () => {
  it('no expira con el período al día', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: at(-40), currentPeriodEnd: at(12) },
      NOW
    );
    expect(r.isExpired).toBe(false);
    expect(r.inGracePeriod).toBe(false);
    // Faltando 12 días para renovar no hay nada que avisar.
    expect(r.daysUntilCutoff).toBeNull();
  });

  it('no expira dentro de la gracia y avisa cuántos días quedan', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: at(-40), currentPeriodEnd: at(-2) },
      NOW
    );
    expect(r.isExpired).toBe(false);
    expect(r.inGracePeriod).toBe(true);
    expect(r.daysUntilCutoff).toBe(GRACE_DAYS - 2);
  });

  it('expira pasada la gracia', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: at(-40), currentPeriodEnd: at(-(GRACE_DAYS + 1)) },
      NOW
    );
    expect(r.isExpired).toBe(true);
    expect(r.inGracePeriod).toBe(false);
  });

  // Este es el caso que motivó todo: un trial ya consumido (trial_ends_at
  // queda fijado en now() al activar el plan) no debe arrastrar a un usuario
  // que está pagando y tiene período vigente.
  it('un active con trial_ends_at pasado NO expira si el período está vigente', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: at(-15), currentPeriodEnd: at(16) },
      NOW
    );
    expect(r.isExpired).toBe(false);
    expect(r.daysLeft).toBeNull();
  });

  it('past_due sigue adentro durante la gracia', () => {
    const r = evaluateExpiry(
      { status: 'past_due', trialEndsAt: null, currentPeriodEnd: at(-1) },
      NOW
    );
    expect(r.isExpired).toBe(false);
    expect(r.inGracePeriod).toBe(true);
  });

  it('past_due expira pasada la gracia — antes conservaba acceso para siempre', () => {
    const r = evaluateExpiry(
      { status: 'past_due', trialEndsAt: null, currentPeriodEnd: at(-30) },
      NOW
    );
    expect(r.isExpired).toBe(true);
  });
});

describe('evaluateExpiry — casos que no deben bloquear', () => {
  it('free nunca expira, ni con período vencido', () => {
    const r = evaluateExpiry(
      { status: 'free', trialEndsAt: at(-100), currentPeriodEnd: at(-100) },
      NOW
    );
    expect(r.isExpired).toBe(false);
  });

  it('active sin current_period_end no expira', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: null, currentPeriodEnd: null },
      NOW
    );
    expect(r.isExpired).toBe(false);
  });

  it('sin suscripción no expira: de eso se ocupa el guard, no esta función', () => {
    const r = evaluateExpiry(
      { status: null, trialEndsAt: null, currentPeriodEnd: null },
      NOW
    );
    expect(r.isExpired).toBe(false);
  });

  it('una fecha corrupta se ignora en vez de bloquear', () => {
    const r = evaluateExpiry(
      { status: 'active', trialEndsAt: 'no-es-una-fecha', currentPeriodEnd: 'tampoco' },
      NOW
    );
    expect(r.isExpired).toBe(false);
  });

  // `cancelled` lo bloquea ProtectedRoute por su cuenta; acá solo importa que
  // no se cuele por el camino del período.
  it('cancelled no depende de esta función para bloquear', () => {
    const r = evaluateExpiry(
      { status: 'cancelled', trialEndsAt: null, currentPeriodEnd: at(-100) },
      NOW
    );
    expect(r.isExpired).toBe(false);
  });
});
