import { describe, it, expect } from 'vitest';
import {
    createARDateTime,
    createLocalMidday,
    getDayBounds,
    formatTimeAR,
    isSlotWithinRange,
    parseLocalYMD,
} from './dateUtils';

/**
 * Los horarios del consultorio son hora de pared argentina (UTC-3, sin DST).
 * Estos tests fijan ese contrato: la auditoría encontró varios bugs de zona
 * horaria justamente acá, y todos venían de interpretar una hora de pared en la
 * zona del navegador.
 *
 * Todas las expectativas se escriben en UTC (`toISOString`) a propósito: es la
 * única forma de verificar el instante real sin depender del TZ del equipo que
 * corre los tests.
 */
describe('dateUtils — anclaje a hora argentina', () => {
    describe('createARDateTime', () => {
        it('interpreta la hora como hora de pared AR (UTC-3)', () => {
            const day = new Date('2026-08-05T15:00:00.000Z');
            expect(createARDateTime(day, '09:00:00').toISOString()).toBe('2026-08-05T12:00:00.000Z');
        });

        it('acepta "HH:mm" sin segundos', () => {
            const day = new Date('2026-08-05T15:00:00.000Z');
            expect(createARDateTime(day, '14:30').toISOString()).toBe('2026-08-05T17:30:00.000Z');
        });

        it('rellena con ceros las horas de un solo dígito', () => {
            const day = new Date('2026-08-05T15:00:00.000Z');
            expect(createARDateTime(day, '9:5').toISOString()).toBe('2026-08-05T12:05:00.000Z');
        });

        it('toma el día EN AR, no en UTC: un instante UTC del día siguiente sigue siendo hoy en AR', () => {
            // 2026-08-06T01:00Z es todavía el 5 de agosto a las 22:00 en Argentina.
            const lateNight = new Date('2026-08-06T01:00:00.000Z');
            expect(createARDateTime(lateNight, '09:00').toISOString()).toBe('2026-08-05T12:00:00.000Z');
        });

        it('no aplica horario de verano: enero y julio usan el mismo offset', () => {
            const enero = createARDateTime(new Date('2026-01-15T15:00:00.000Z'), '09:00');
            const julio = createARDateTime(new Date('2026-07-15T15:00:00.000Z'), '09:00');
            expect(enero.toISOString()).toBe('2026-01-15T12:00:00.000Z');
            expect(julio.toISOString()).toBe('2026-07-15T12:00:00.000Z');
        });
    });

    describe('getDayBounds', () => {
        it('cubre el día completo en AR, no en UTC', () => {
            const { start, end } = getDayBounds(new Date('2026-08-05T15:00:00.000Z'));
            expect(start.toISOString()).toBe('2026-08-05T03:00:00.000Z');
            expect(end.toISOString()).toBe('2026-08-06T02:59:59.999Z');
        });

        it('un turno de 23:45 AR cae dentro de los límites de su día', () => {
            const { start, end } = getDayBounds(new Date('2026-08-05T15:00:00.000Z'));
            const turno = createARDateTime(new Date('2026-08-05T15:00:00.000Z'), '23:45');
            expect(turno.getTime()).toBeGreaterThanOrEqual(start.getTime());
            expect(turno.getTime()).toBeLessThanOrEqual(end.getTime());
        });
    });

    describe('parseLocalYMD', () => {
        it('no corre la fecha un día', () => {
            expect(parseLocalYMD('2026-08-05')!.toISOString()).toBe('2026-08-05T03:00:00.000Z');
        });

        it('devuelve null para entrada vacía', () => {
            expect(parseLocalYMD(null)).toBeNull();
            expect(parseLocalYMD('')).toBeNull();
        });

        it('devuelve null para una fecha inválida', () => {
            expect(parseLocalYMD('no-es-una-fecha')).toBeNull();
        });

        it('acepta un ISO completo como fallback', () => {
            expect(parseLocalYMD('2026-08-05T12:00:00.000Z')!.toISOString())
                .toBe('2026-08-05T12:00:00.000Z');
        });
    });

    describe('formatTimeAR', () => {
        it('devuelve la hora de pared del consultorio', () => {
            expect(formatTimeAR(new Date('2026-08-05T12:00:00.000Z'))).toBe('09:00');
        });

        it('es la inversa de createARDateTime', () => {
            const day = new Date('2026-08-05T15:00:00.000Z');
            for (const time of ['08:00', '13:30', '23:45']) {
                expect(formatTimeAR(createARDateTime(day, time))).toBe(time);
            }
        });
    });

    describe('createLocalMidday', () => {
        it('ancla al mediodía AR y tolera componentes sin cero a la izquierda', () => {
            expect(createLocalMidday('2026', '8', '5').toISOString()).toBe('2026-08-05T15:00:00.000Z');
        });
    });

    describe('isSlotWithinRange', () => {
        const day = new Date('2026-08-05T15:00:00.000Z');
        const cierre = createARDateTime(day, '18:00');

        it('acepta un slot que termina justo en el cierre', () => {
            const start = createARDateTime(day, '17:30');
            expect(isSlotWithinRange(start, cierre, cierre)).toBe(true);
        });

        it('rechaza un slot que se pasa del cierre', () => {
            const start = createARDateTime(day, '17:45');
            const end = createARDateTime(day, '18:15');
            expect(isSlotWithinRange(start, end, cierre)).toBe(false);
        });

        it('rechaza un slot que empieza en el cierre', () => {
            const end = createARDateTime(day, '18:30');
            expect(isSlotWithinRange(cierre, end, cierre)).toBe(false);
        });
    });
});
