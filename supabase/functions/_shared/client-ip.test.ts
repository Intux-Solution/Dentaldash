import { describe, it, expect } from 'vitest';
import { clientIp } from './client-ip.ts';

const withXff = (value?: string) =>
  new Headers(value === undefined ? {} : { 'x-forwarded-for': value });

describe('clientIp', () => {
  it('devuelve la única IP cuando no hay cadena', () => {
    expect(clientIp(withXff('203.0.113.7'))).toBe('203.0.113.7');
  });

  // El caso que importa: el cliente puede escribir lo que quiera a la izquierda,
  // pero el proxy de Supabase siempre agrega la IP real al final.
  it('ignora la IP falsificada por el cliente y toma la que agregó el proxy', () => {
    expect(clientIp(withXff('1.2.3.4, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('resiste una cadena larga de valores inventados', () => {
    const spoofed = '9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7';
    expect(clientIp(withXff(spoofed))).toBe('203.0.113.7');
  });

  it('dos requests con XFF falsificado distinto resuelven a la misma IP', () => {
    const a = clientIp(withXff('1.1.1.1, 203.0.113.7'));
    const b = clientIp(withXff('2.2.2.2, 203.0.113.7'));
    // Si estos difirieran, cada request contaría como un visitante nuevo y el
    // rate limit por IP no limitaría nada.
    expect(a).toBe(b);
  });

  it('tolera espacios y elementos vacíos', () => {
    expect(clientIp(withXff('  1.2.3.4 ,, 203.0.113.7  '))).toBe('203.0.113.7');
  });

  it('devuelve "unknown" sin header', () => {
    expect(clientIp(withXff())).toBe('unknown');
  });

  it('devuelve "unknown" con un header vacío o solo comas', () => {
    expect(clientIp(withXff(''))).toBe('unknown');
    expect(clientIp(withXff(' , , '))).toBe('unknown');
  });
});
