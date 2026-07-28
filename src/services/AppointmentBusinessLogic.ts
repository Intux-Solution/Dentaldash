import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { CalendarSyncService } from './CalendarSyncService';
import { WORK_HOURS } from '../config/appointments';
import { addMinutes, isBefore } from 'date-fns';
import { createLocalMidday, getDayBounds, formatTimeAR, isSlotWithinRange, createARDateTime } from '../utils/dateUtils';

export interface AvailableSlotsResult {
    slots: string[];
    /**
     * `true` cuando el usuario tiene Google Calendar conectado pero no se pudo leer su
     * agenda. Los horarios devueltos pueden incluir alguno realmente ocupado, así que
     * la UI debe avisarlo en vez de mostrarlos como si estuvieran verificados.
     */
    calendarUnavailable: boolean;
}

export class AppointmentBusinessLogic {
    static async getAvailableSlots(
        date: string,
        durationMinutes: number,
        excludeId: string | null = null,
        _session: any = null
    ): Promise<AvailableSlotsResult> {
        try {
            const [yStr, mStr, dStr] = date.split('-');
            const inputDate = createLocalMidday(yStr, mStr, dStr);
            const dayOfWeek = inputDate.getDay();

            const daySchedules = await AppointmentRepository.getActiveSchedules(dayOfWeek);
            if (!daySchedules || daySchedules.length === 0) {
                return { slots: [], calendarUnavailable: false };
            }

            const dayBounds = getDayBounds(inputDate);
            const existing = await AppointmentRepository.getAppointmentsForDay(
                dayBounds.start.toISOString(),
                dayBounds.end.toISOString()
            );

            // Las franjas ocupadas de Google las resuelve la Edge Function `calendar-sync`
            // con el refresh token guardado en `profiles`, consultando TODOS los
            // calendarios del usuario. Mirar solo `primary` desde el navegador dejaba
            // pasar reuniones de calendarios secundarios, y cualquier fallo de token
            // devolvía una lista vacía sin avisar: el horario ocupado se ofrecía igual.
            const busyResult = await CalendarSyncService.getBusy(dayBounds.start, dayBounds.end);
            let googleBusy = busyResult.busy.map(interval => ({
                start: new Date(interval.start),
                end: new Date(interval.end),
            }));

            // Al editar un turno, su propio evento de Google aparece como ocupado y
            // bloquearía el horario que el turno ya tiene. freeBusy no devuelve ids, así
            // que se descarta por coincidencia de franja (tolerancia de un minuto).
            if (excludeId) {
                const excluded = existing.find((app: any) => app.id === excludeId);
                if (excluded) {
                    const exStart = new Date(excluded.start_time).getTime();
                    const exEnd = new Date(excluded.end_time).getTime();
                    const TOLERANCE_MS = 60 * 1000;
                    googleBusy = googleBusy.filter(
                        (interval) =>
                            Math.abs(interval.start.getTime() - exStart) > TOLERANCE_MS ||
                            Math.abs(interval.end.getTime() - exEnd) > TOLERANCE_MS
                    );
                }
            }

            // "No conectado" es un estado válido y silencioso; un fallo real de la
            // consulta sí tiene que llegar a la UI.
            const calendarUnavailable =
                !busyResult.synced &&
                busyResult.reason !== 'not_connected' &&
                busyResult.reason !== 'not_configured';

            const nowTime = new Date();
            const minTimeForAppt = addMinutes(nowTime, 30);
            const slots: string[] = [];

            for (const schedule of daySchedules) {
                // Los horarios laborales son hora de pared del consultorio (AR),
                // no de la zona horaria del equipo que abre la app.
                const rangeStart = createARDateTime(inputDate, schedule.start_time);
                const rangeEnd = createARDateTime(inputDate, schedule.end_time);

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

                    // freeBusy ya descarta los eventos marcados como "disponible"
                    // (transparency: transparent), así que todo lo que llega bloquea.
                    const isOccupiedGoogle = googleBusy.some(
                        (interval) => slotStart < interval.end && slotEnd > interval.start
                    );

                    if (!isOccupiedLocal && !isOccupiedGoogle) {
                        slots.push(formatTimeAR(slotStart));
                    }

                    current = addMinutes(current, WORK_HOURS.interval);
                }
            }

            return {
                slots: Array.from(new Set(slots)).sort(),
                calendarUnavailable,
            };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error in Business Logic getting available slots:', error);
            return { slots: [], calendarUnavailable: false };
        }
    }
}
