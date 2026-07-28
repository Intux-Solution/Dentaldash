import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppointmentService } from './AppointmentService';
import { supabase } from '../config/supabaseClient';
import { CalendarSyncService } from './CalendarSyncService';

// Mock dependencies
vi.mock('../config/supabaseClient', () => {
    return {
        supabase: {
            from: vi.fn()
        }
    };
});

// Las franjas ocupadas de Google las resuelve la Edge Function `calendar-sync`.
vi.mock('./CalendarSyncService', () => {
    return {
        CalendarSyncService: {
            getBusy: vi.fn(),
            pushAppointment: vi.fn(),
            deleteEvent: vi.fn()
        }
    };
});

/**
 * Construye un instante a partir de una hora de pared argentina.
 * Los slots se calculan siempre en AR, así que el test no puede depender de la
 * zona horaria de la máquina que lo corre.
 */
const arTime = (dateStr: string, time: string) => new Date(`${dateStr}T${time}:00.000-03:00`);

describe('AppointmentService - getAvailableSlots', () => {

    beforeEach(() => {
        // Fix system time so "minTimeForAppt" (now + 30 min) check doesn't block future requested dates
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-24T00:00:00.000Z'));
        // Por defecto: Google conectado y sin nada ocupado.
        (CalendarSyncService.getBusy as any).mockResolvedValue({ synced: true, busy: [] });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    const mockSchedules = [
        {
            start_time: '09:00:00',
            end_time: '18:00:00',
        }
    ];

    // Helper to mock the chained supabase calls
    const setupSupabaseMock = (appointmentsData: any[] = []) => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'schedules') {
                const scheduleChain: any = {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockImplementation((field: string) => {
                        if (field === 'is_active') {
                            return Promise.resolve({ data: mockSchedules, error: null });
                        }
                        return scheduleChain;
                    })
                };
                return scheduleChain;
            }
            if (table === 'appointments') {
                const appointmentChain: any = {
                    select: vi.fn().mockReturnThis(),
                    gte: vi.fn().mockReturnThis(),
                    lte: vi.fn().mockReturnThis(),
                    neq: vi.fn().mockImplementation(() => {
                        return Promise.resolve({ data: appointmentsData, error: null });
                    })
                };
                return appointmentChain;
            }
        });
    };

    it('Scenario 1: Given no appointments, should return all daily slots', async () => {
        setupSupabaseMock([]); // 0 local appts

        // Fetch for Wednesday
        const { slots } = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 09:00 to 18:00 at 30 min intervals = 18 slots
        expect(slots.length).toBe(18);
        expect(slots[0]).toBe('09:00');
        expect(slots[slots.length - 1]).toBe('17:30');
    });

    it('Scenario 2: Given a Supabase appointment at 10:00 AM, should block that slot', async () => {
        const mockAppointments = [
            {
                id: 'supabase-app-1',
                start_time: arTime('2026-02-25', '10:00').toISOString(),
                end_time: arTime('2026-02-25', '10:30').toISOString(),
            }
        ];

        setupSupabaseMock(mockAppointments);

        const { slots } = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 1 slot removed
        expect(slots.length).toBe(17);
        expect(slots.includes('10:00')).toBe(false);
        // Ensure neighboring slots are intact
        expect(slots.includes('09:30')).toBe(true);
        expect(slots.includes('10:30')).toBe(true);
    });

    it('Scenario 3: Given a Google Calendar appointment at 15:00 PM, should block that slot', async () => {
        setupSupabaseMock([]);

        (CalendarSyncService.getBusy as any).mockResolvedValue({
            synced: true,
            busy: [
                {
                    start: arTime('2026-02-25', '15:00').toISOString(),
                    end: arTime('2026-02-25', '15:30').toISOString(),
                }
            ]
        });

        const { slots } = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 1 slot removed
        expect(slots.length).toBe(17);
        expect(slots.includes('15:00')).toBe(false);
        // Ensure neighboring slots are intact
        expect(slots.includes('14:30')).toBe(true);
        expect(slots.includes('15:30')).toBe(true);
    });

    it('Scenario 4: Given Google is not connected, slots are still returned without warning', async () => {
        setupSupabaseMock([]);
        (CalendarSyncService.getBusy as any).mockResolvedValue({
            synced: false,
            reason: 'not_connected',
            busy: []
        });

        const { slots, calendarUnavailable } = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // Los slots locales se calculan igual...
        expect(slots.length).toBe(18);
        // ...y "no conectado" no es una advertencia: es un estado válido.
        expect(calendarUnavailable).toBe(false);
    });

    it('Scenario 5: Given the Google query fails, it flags the slot list as unverified', async () => {
        setupSupabaseMock([]);
        (CalendarSyncService.getBusy as any).mockResolvedValue({
            synced: false,
            reason: 'api_error',
            busy: []
        });

        const { slots, calendarUnavailable } = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // Los horarios se devuelven igual, pero marcados como no verificados: sin esto
        // una reunión de Google se ofrecía como disponible y nadie se enteraba.
        expect(slots.length).toBe(18);
        expect(calendarUnavailable).toBe(true);
    });
});
