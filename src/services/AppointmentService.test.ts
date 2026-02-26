import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppointmentService } from './AppointmentService';
import { supabase } from '../config/supabaseClient';
import { GoogleCalendarService } from './GoogleCalendarService';

// Mock dependencies
vi.mock('../config/supabaseClient', () => {
    return {
        supabase: {
            from: vi.fn()
        }
    };
});

vi.mock('./GoogleCalendarService', () => {
    return {
        GoogleCalendarService: {
            listEvents: vi.fn()
        }
    };
});

describe('AppointmentService - getAvailableSlots', () => {

    beforeEach(() => {
        // Fix system time so "minTimeForAppt" (now + 30 min) check doesn't block future requested dates
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-24T00:00:00.000Z'));
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
        (GoogleCalendarService.listEvents as any).mockResolvedValue([]); // 0 Google appts

        // Fetch for Wednesday
        const availableSlots = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 09:00 to 18:00 at 30 min intervals = 18 slots
        expect(availableSlots.length).toBe(18);
        expect(availableSlots[0]).toBe('09:00');
        expect(availableSlots[availableSlots.length - 1]).toBe('17:30');
    });

    it('Scenario 2: Given a Supabase appointment at 10:00 AM, should block that slot', async () => {
        // We construct a local JS Date so that toISOString() guarantees it maps perfectly 
        // back to 10:00 AM local time inside the AppointmentService parser.
        const appDt = new Date('2026-02-25T12:00:00');
        appDt.setHours(10, 0, 0, 0);
        const startTimeStr = appDt.toISOString();
        appDt.setHours(10, 30, 0, 0);
        const endTimeStr = appDt.toISOString();

        const mockAppointments = [
            {
                id: 'supabase-app-1',
                start_time: startTimeStr,
                end_time: endTimeStr,
            }
        ];

        setupSupabaseMock(mockAppointments);
        (GoogleCalendarService.listEvents as any).mockResolvedValue([]);

        const availableSlots = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 1 slot removed
        expect(availableSlots.length).toBe(17);
        expect(availableSlots.includes('10:00')).toBe(false);
        // Ensure neighboring slots are intact
        expect(availableSlots.includes('09:30')).toBe(true);
        expect(availableSlots.includes('10:30')).toBe(true);
    });

    it('Scenario 3: Given a Google Calendar appointment at 15:00 PM, should block that slot', async () => {
        setupSupabaseMock([]);

        const appDt = new Date('2026-02-25T12:00:00');
        appDt.setHours(15, 0, 0, 0);
        const startTimeStr = appDt.toISOString();
        appDt.setHours(15, 30, 0, 0);
        const endTimeStr = appDt.toISOString();

        const mockGoogleEvents = [
            {
                transparency: 'opaque',
                start: { dateTime: startTimeStr },
                end: { dateTime: endTimeStr }
            }
        ];

        (GoogleCalendarService.listEvents as any).mockResolvedValue(mockGoogleEvents);

        const availableSlots = await AppointmentService.getAvailableSlots('2026-02-25', 30);

        // 1 slot removed
        expect(availableSlots.length).toBe(17);
        expect(availableSlots.includes('15:00')).toBe(false);
        // Ensure neighboring slots are intact
        expect(availableSlots.includes('14:30')).toBe(true);
        expect(availableSlots.includes('15:30')).toBe(true);
    });
});
