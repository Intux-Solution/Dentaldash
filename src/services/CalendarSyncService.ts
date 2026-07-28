import { supabase } from '../config/supabaseClient';

/**
 * Cliente de la Edge Function `calendar-sync`.
 *
 * La sincronización con Google Calendar vive en el servidor y no en el navegador:
 * el `provider_token` de la sesión es efímero (se pierde al recargar) y solo existe
 * si el usuario entró por el redirect de Google, así que hacerlo desde el front
 * dejaba turnos sin `google_event_id` y reuniones sin bloquear, siempre en silencio.
 * La Edge Function usa el `google_refresh_token` persistido en `profiles`.
 */

/** Motivo por el que no se sincronizó. `not_connected` es un estado válido, no un error. */
export type SyncFailureReason = 'not_connected' | 'not_configured' | 'auth_failed' | 'api_error';

export interface SyncResult {
    synced: boolean;
    reason?: SyncFailureReason;
    google_event_id?: string;
}

export interface BusyInterval {
    start: string;
    end: string;
}

export interface BusyResult {
    synced: boolean;
    reason?: SyncFailureReason;
    busy: BusyInterval[];
}

async function callCalendarSync(body: Record<string, unknown>): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa.');

    const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-sync`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(body),
        }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok && !json?.reason) {
        throw new Error(json?.error ?? 'Error al sincronizar con Google Calendar.');
    }
    return json;
}

export const CalendarSyncService = {
    /**
     * Crea o actualiza el evento de Google Calendar de un turno.
     * Nunca lanza: la DB local es la fuente de verdad y Google es best-effort.
     */
    async pushAppointment(
        appointmentId: string,
        options: { description?: string | null; attendeeEmail?: string | null } = {}
    ): Promise<SyncResult> {
        try {
            const json = await callCalendarSync({
                action: 'push_appointment',
                appointment_id: appointmentId,
                description: options.description ?? null,
                attendee_email: options.attendeeEmail ?? null,
            });
            return {
                synced: !!json?.synced,
                reason: json?.reason,
                google_event_id: json?.google_event_id,
            };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown));
            console.error('[CalendarSyncService] pushAppointment:', error.message);
            return { synced: false, reason: 'api_error' };
        }
    },

    /** Borra el evento de Google Calendar de un turno. Nunca lanza. */
    async deleteEvent(googleEventId: string): Promise<SyncResult> {
        try {
            const json = await callCalendarSync({
                action: 'delete_event',
                google_event_id: googleEventId,
            });
            return { synced: !!json?.synced, reason: json?.reason };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown));
            console.error('[CalendarSyncService] deleteEvent:', error.message);
            return { synced: false, reason: 'api_error' };
        }
    },

    /**
     * Franjas ocupadas del usuario en Google Calendar, mirando todos sus calendarios.
     *
     * Nunca lanza, pero SÍ distingue "no conectado" de "falló la consulta": quien
     * calcula los horarios necesita saber cuándo la lista de ocupados puede estar
     * incompleta, para no ofrecer un horario que en realidad está tomado.
     */
    async getBusy(timeMin: Date, timeMax: Date): Promise<BusyResult> {
        try {
            const json = await callCalendarSync({
                action: 'busy',
                time_min: timeMin.toISOString(),
                time_max: timeMax.toISOString(),
            });
            return {
                synced: !!json?.synced,
                reason: json?.reason,
                busy: Array.isArray(json?.busy) ? json.busy : [],
            };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown));
            console.error('[CalendarSyncService] getBusy:', error.message);
            return { synced: false, reason: 'api_error', busy: [] };
        }
    },
};
