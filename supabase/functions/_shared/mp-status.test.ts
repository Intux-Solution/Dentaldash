import { describe, it, expect } from 'vitest';
import { mapMpStatus } from './mp-status.ts';

describe('mapMpStatus — estados que activan', () => {
  it('authorized activa la suscripción', () => {
    expect(mapMpStatus('authorized')).toBe('active');
  });

  it('charged activa la suscripción', () => {
    expect(mapMpStatus('charged')).toBe('active');
  });
});

describe('mapMpStatus — estados que cortan', () => {
  it('cancelled cancela', () => {
    expect(mapMpStatus('cancelled')).toBe('cancelled');
  });

  it('paused cancela: para nosotros deja de cobrar igual', () => {
    expect(mapMpStatus('paused')).toBe('cancelled');
  });

  it('payment_failed pasa a past_due', () => {
    expect(mapMpStatus('payment_failed')).toBe('past_due');
  });
});

describe('mapMpStatus — lo que NO debe degradar', () => {
  // Este es el bug que dejaba afuera a clientes que ya habían pagado:
  // create-checkout crea el preapproval en "pending" y MercadoPago avisa de esa
  // creación. Ese evento no puede significar "volvé al trial".
  it('pending no impone ningún estado', () => {
    expect(mapMpStatus('pending')).toBeNull();
  });

  it('un estado desconocido no impone ningún estado', () => {
    expect(mapMpStatus('algo_que_mercadopago_invente_mañana')).toBeNull();
  });

  it('null y undefined no imponen ningún estado', () => {
    expect(mapMpStatus(null)).toBeNull();
    expect(mapMpStatus(undefined)).toBeNull();
  });

  it('nunca devuelve "trial": ese estado solo lo asigna el trigger de alta', () => {
    const entradas = [
      'authorized', 'charged', 'cancelled', 'paused', 'payment_failed',
      'pending', 'rejected', '', 'TRIAL', 'trial', null, undefined,
    ];
    for (const entrada of entradas) {
      expect(mapMpStatus(entrada)).not.toBe('trial');
    }
  });
});
