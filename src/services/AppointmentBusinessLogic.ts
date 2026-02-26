import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { GoogleCalendarService } from '../services/GoogleCalendarService';
import { WORK_HOURS } from '../config/appointments';
import { addMinutes, isAfter, isBefore } from 'date-fns';
import { createLocalMidday, getDayBounds, formatTimeAR, isSlotWithinRange } from '../utils/date-manager';

export class AppointmentBusinessLogic {
    static async getAvailableSlots(date: string, durationMinutes: number, excludeId: string | null = null) {
        try {
            const [yStr, mStr, dStr] = date.split('-');
            const inputDate = createLocalMidday(yStr, mStr, dStr);
            const dayOfWeek = inputDate.getDay();

            const daySchedules = await AppointmentRepository.getActiveSchedules(dayOfWeek);
            if (!daySchedules || daySchedules.length === 0) return [];

            const dayBounds = getDayBounds(inputDate);
            const existing = await AppointmentRepository.getAppointmentsForDay(
                dayBounds.start.toISOString(),
                dayBounds.end.toISOString()
            );

            const googleEvents = await GoogleCalendarService.listEvents(dayBounds.start, dayBounds.end);

            const nowTime = new Date();
            const minTimeForAppt = addMinutes(nowTime, 30);
            const slots: string[] = [];

            for (const schedule of daySchedules) {
                const [startHour, startMinute] = schedule.start_time.split(':');
                const [endHour, endMinute] = schedule.end_time.split(':');

                const rangeStart = new Date(inputDate);
                rangeStart.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);

                const rangeEnd = new Date(inputDate);
                rangeEnd.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

                let current = new Date(rangeStart);

                while (current < rangeEnd) {
                    const slotStart = new Date(current);
                    const slotEnd = addMinutes(current, durationMinutes);

                    if (!isSlotWithinRange(slotStart, slotEnd, rangeEnd)) break;
                    if (isBefore(slotStart, minTimeForAppt)) {
                        current = addMinutes(current, WORK_HOURS.interval);
                        continue;
                    }

                    const isOccupiedLocal = existing.some((app: any) => {
                        if (excludeId && app.id === excludeId) return false;
                        return (slotStart < new Date(app.end_time) && slotEnd > new Date(app.start_time));
                    });

                    const isOccupiedGoogle = googleEvents.some((event: any) => {
                        if (event.transparency === 'transparent') return false;

                        let eventStart, eventEnd;
                        if (event.start.date) {
                            const [sY, sM, sD] = event.start.date.split('-').map(Number);
                            eventStart = new Date(sY, sM - 1, sD, 0, 0, 0);
                            const [eY, eM, eD] = event.end.date.split('-').map(Number);
                            eventEnd = new Date(eY, eM - 1, eD, 0, 0, 0);
                        } else {
                            eventStart = new Date(event.start.dateTime);
                            eventEnd = new Date(event.end.dateTime);
                        }
                        return (slotStart < eventEnd && slotEnd > eventStart);
                    });

                    if (!isOccupiedLocal && !isOccupiedGoogle) {
                        slots.push(formatTimeAR(slotStart));
                    }

                    current = addMinutes(current, WORK_HOURS.interval);
                }
            }

            return Array.from(new Set(slots)).sort();
        } catch (error) {
            console.error('Error in Business Logic getting available slots:', error);
            return [];
        }
    }
}
