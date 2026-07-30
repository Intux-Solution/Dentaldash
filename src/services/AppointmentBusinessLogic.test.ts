import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppointmentBusinessLogic } from './AppointmentBusinessLogic';
import { supabase } from '../config/supabaseClient';
import { CalendarSyncService } from './CalendarSyncService';

vi.mock('../config/supabaseClient', () => ({
    supabase: { from: vi.fn() },
}));

vi.mock('./CalendarSyncService', () => ({
    CalendarSyncService: {
        getBusy: vi.fn(),
        pushAppointment: vi.fn(),
        deleteEvent: vi.fn(),
    },
}));

/**
 * Instante a partir de una hora de pared argentina. Los slots se calculan siempre
 * en AR, así que el test no puede depender del TZ de la máquina que lo corre.
 */
const arTime = (dateStr: string, time: string) => new Date(`${dateStr}T${time}:00.000-03:00`);

/**
 * Casos de borde del cálculo de slots que los escenarios de `AppointmentService`
 * no cubren: duraciones que no son múltiplos del intervalo, franjas partidas,
 * exclusión del turno que se está editando y el corte de "no antes de ahora + 30".
 */
describe('AppointmentBusinessLogic.getAvailableSlots — casos de borde', () => {
    // 2026-02-25 es miércoles. La hora fija queda muy antes del horario laboral
    // para que el filtro de "now + 30 min" no interfiera salvo cuando se lo prueba.
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-24T00:00:00.000Z'));
        (CalendarSyncService.getBusy as any).mockResolvedValue({ synced: true, busy: [] });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    /** Mockea las cadenas de supabase para schedules y appointments. */
    const setupMock = (
        schedules: Array<{ start_time: string; end_time: string }>,
        appointments: any[] = []
    ) => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'schedules') {
                const chain: any = {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockImplementation((field: string) =>
                        field === 'is_active'
                            ? Promise.resolve({ data: schedules, error: null })
                            : chain
                    ),
                };
                return chain;
            }
            if (table === 'appointments') {
                const chain: any = {
                    select: vi.fn().mockReturnThis(),
                    gte: vi.fn().mockReturnThis(),
                    lte: vi.fn().mockReturnThis(),
                    neq: vi.fn().mockResolvedValue({ data: appointments, error: null }),
                };
                return chain;
            }
        });
    };

    const FULL_DAY = [{ start_time: '09:00:00', end_time: '18:00:00' }];

    it('devuelve un objeto { slots, calendarUnavailable }, no un array', async () => {
        setupMock(FULL_DAY);
        const result = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        expect(Array.isArray(result)).toBe(false);
        expect(result).toHaveProperty('slots');
        expect(result).toHaveProperty('calendarUnavailable');
    });

    it('sin horarios laborales configurados no ofrece ningún slot', async () => {
        setupMock([]);
        const { slots, calendarUnavailable } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        expect(slots).toEqual([]);
        // No se llegó a consultar Google: no hay nada que advertir.
        expect(calendarUnavailable).toBe(false);
    });

    it('un turno de 60 min no puede empezar a las 17:30: no cabe antes del cierre', async () => {
        setupMock(FULL_DAY);
        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 60);

        expect(slots).toContain('17:00');
        expect(slots).not.toContain('17:30');
    });

    it('el paso entre slots sigue siendo de 30 min aunque la duración sea 60', async () => {
        setupMock(FULL_DAY);
        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 60);

        // 09:00 → 17:00 cada 30 min = 17 slots.
        expect(slots.length).toBe(17);
        expect(slots.slice(0, 3)).toEqual(['09:00', '09:30', '10:00']);
    });

    it('respeta dos franjas separadas y no ofrece nada en el hueco del mediodía', async () => {
        setupMock([
            { start_time: '09:00:00', end_time: '12:00:00' },
            { start_time: '16:00:00', end_time: '18:00:00' },
        ]);
        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        // 6 slots por la mañana (09:00–11:30) + 4 por la tarde (16:00–17:30).
        expect(slots.length).toBe(10);
        expect(slots).toContain('11:30');
        expect(slots).not.toContain('12:00');
        expect(slots).not.toContain('13:00');
        expect(slots).toContain('16:00');
    });

    it('un turno desalineado con la grilla bloquea los dos slots que solapa', async () => {
        setupMock(FULL_DAY, [
            {
                id: 'a1',
                start_time: arTime('2026-02-25', '10:15').toISOString(),
                end_time: arTime('2026-02-25', '10:45').toISOString(),
            },
        ]);
        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        // 10:00–10:30 y 10:30–11:00 ambos solapan con 10:15–10:45.
        expect(slots).not.toContain('10:00');
        expect(slots).not.toContain('10:30');
        expect(slots).toContain('09:30');
        expect(slots).toContain('11:00');
    });

    it('al editar un turno, su propio horario vuelve a estar disponible', async () => {
        const editando = {
            id: 'editando',
            start_time: arTime('2026-02-25', '11:00').toISOString(),
            end_time: arTime('2026-02-25', '11:30').toISOString(),
        };
        setupMock(FULL_DAY, [editando]);

        const sinExcluir = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);
        expect(sinExcluir.slots).not.toContain('11:00');

        const excluyendo = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30, 'editando');
        expect(excluyendo.slots).toContain('11:00');
    });

    it('al editar, el evento de Google del propio turno tampoco bloquea su horario', async () => {
        const editando = {
            id: 'editando',
            start_time: arTime('2026-02-25', '11:00').toISOString(),
            end_time: arTime('2026-02-25', '11:30').toISOString(),
        };
        setupMock(FULL_DAY, [editando]);

        // freeBusy no devuelve ids: el evento espejo se descarta por coincidencia
        // de franja con una tolerancia de un minuto.
        (CalendarSyncService.getBusy as any).mockResolvedValue({
            synced: true,
            busy: [{ start: editando.start_time, end: editando.end_time }],
        });

        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30, 'editando');
        expect(slots).toContain('11:00');
    });

    it('un evento de Google que NO es el del turno editado sigue bloqueando', async () => {
        const editando = {
            id: 'editando',
            start_time: arTime('2026-02-25', '11:00').toISOString(),
            end_time: arTime('2026-02-25', '11:30').toISOString(),
        };
        setupMock(FULL_DAY, [editando]);

        (CalendarSyncService.getBusy as any).mockResolvedValue({
            synced: true,
            busy: [
                { start: editando.start_time, end: editando.end_time },
                {
                    start: arTime('2026-02-25', '14:00').toISOString(),
                    end: arTime('2026-02-25', '14:30').toISOString(),
                },
            ],
        });

        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30, 'editando');
        expect(slots).toContain('11:00');
        expect(slots).not.toContain('14:00');
    });

    it('no ofrece horarios que ya pasaron ni los de los próximos 30 minutos', async () => {
        setupMock(FULL_DAY);
        // 2026-02-25 13:10 AR: el corte queda en 13:40, así que 13:30 no entra.
        vi.setSystemTime(arTime('2026-02-25', '13:10'));

        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        expect(slots).not.toContain('09:00');
        expect(slots).not.toContain('13:00');
        expect(slots).not.toContain('13:30');
        expect(slots).toContain('14:00');
    });

    it('devuelve los slots ordenados y sin duplicados aunque las franjas se solapen', async () => {
        setupMock([
            { start_time: '09:00:00', end_time: '11:00:00' },
            { start_time: '10:00:00', end_time: '12:00:00' },
        ]);
        const { slots } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        expect(slots).toEqual([...slots].sort());
        expect(new Set(slots).size).toBe(slots.length);
        // Unión de 09:00–12:00 en pasos de 30 min = 6 slots.
        expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
    });

    it('un error al leer los horarios no propaga: devuelve vacío sin advertencia', async () => {
        (supabase.from as any).mockImplementation(() => {
            throw new Error('conexión caída');
        });

        const { slots, calendarUnavailable } = await AppointmentBusinessLogic.getAvailableSlots('2026-02-25', 30);

        expect(slots).toEqual([]);
        expect(calendarUnavailable).toBe(false);
    });
});
