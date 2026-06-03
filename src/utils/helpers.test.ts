import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateAge, initials, norm } from './helpers';

describe('calculateAge', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-03T00:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('devuelve null para valores nulos/vacíos', () => {
        expect(calculateAge(null)).toBeNull();
        expect(calculateAge(undefined)).toBeNull();
        expect(calculateAge('')).toBeNull();
    });

    it('devuelve null para fechas inválidas', () => {
        expect(calculateAge('not-a-date')).toBeNull();
    });

    it('calcula correctamente la edad cuando el cumpleaños ya pasó este año', () => {
        // Nació el 1 de enero de 1990 → 36 años en junio 2026
        expect(calculateAge('1990-01-01')).toBe(36);
    });

    it('calcula correctamente la edad cuando el cumpleaños aún no llegó este año', () => {
        // Nació el 31 de diciembre de 1990 → 35 años en junio 2026
        expect(calculateAge('1990-12-31')).toBe(35);
    });

    it('devuelve 0 para un bebé recién nacido hoy', () => {
        expect(calculateAge('2026-06-03')).toBe(0);
    });

    it('calcula correctamente edad exacta en el cumpleaños', () => {
        // Nació el 3 de junio de 2000 → 26 años exactos hoy
        expect(calculateAge('2000-06-03')).toBe(26);
    });
});

describe('initials', () => {
    it('devuelve las iniciales de un nombre', () => {
        expect(initials('Juan García')).toBe('JG');
        expect(initials('María')).toBe('M');
        expect(initials('')).toBe('');
    });
});

describe('norm', () => {
    it('normaliza acentos y mayúsculas', () => {
        expect(norm('Martínez')).toBe('martinez');
        expect(norm('GARCÍA')).toBe('garcia');
        expect(norm('niño')).toBe('nino');
    });
});
