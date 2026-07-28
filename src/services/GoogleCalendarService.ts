import { supabase } from '../config/supabaseClient';

// Module-level cache for the token (persists while the page is open)
let cachedToken: string | null = null;

const EVENT_TIMEZONE = 'America/Argentina/Buenos_Aires';

// Cache del estado de conexion, para no consultar profiles en cada slot lookup.
// null = todavia no resuelto.
let cachedIsConnected: boolean | null = null;
let inFlightConnectionCheck: Promise<boolean> | null = null;
// Se incrementa en cada clearTokenCache() para descartar el resultado de un
// chequeo que ya estaba en vuelo cuando el usuario desconectó.
let cacheGeneration = 0;

// Logger de debug: solo escribe en desarrollo (evita ensuciar logs de produccion).
const devLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
};

export class GoogleCalendarService {

    /**
     * Get the provider token from the current session or cache.
     */
    static getProviderToken(session: any) {
        if (cachedToken) return cachedToken;
        return session?.provider_token;
    }

    /**
     * Get the refresh token from the session.
     */
    static getRefreshToken(session: any) {
        return session?.provider_refresh_token;
    }

    /**
     * Resuelve el refresh token: primero la sesión efímera, luego la DB
     * (persistido por AuthContext al volver del redirect de OAuth).
     */
    private static async resolveRefreshToken(session: any): Promise<string | null> {
        const fromSession = this.getRefreshToken(session);
        if (fromSession) return fromSession;

        if (!session?.user?.id) return null;

        devLog("[GoogleCalendarService] Attempting to fetch refresh_token from DB for user", session.user.id);
        const { data, error } = await supabase
            .from('profiles')
            .select('google_refresh_token')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error("[GoogleCalendarService] DB Error fetching refresh token:", error);
            return null;
        }

        return data?.google_refresh_token ?? null;
    }

    /**
     * ¿El usuario tiene Google Calendar conectado?
     *
     * Se resuelve una sola vez por carga de página para no pegarle a `profiles`
     * en cada búsqueda de slots. Permite a los llamadores evitar por completo
     * la ida a la API de Google cuando no hay integración configurada.
     */
    static async isConnected(session: any): Promise<boolean> {
        if (cachedIsConnected !== null) return cachedIsConnected;
        if (cachedToken) return true;
        if (!session) return false;

        // Deduplica chequeos concurrentes (varios slot lookups en paralelo).
        if (!inFlightConnectionCheck) {
            const generation = cacheGeneration;
            inFlightConnectionCheck = this.resolveRefreshToken(session)
                .then((token) => {
                    const connected = !!token;
                    // Si hubo un clearTokenCache() mientras esto estaba en vuelo,
                    // el resultado es obsoleto: no lo cacheamos.
                    if (generation === cacheGeneration) cachedIsConnected = connected;
                    return connected;
                })
                .catch((e) => {
                    // Nunca rechazamos: los llamadores tratan "no conectado" como
                    // un estado válido y no deben romperse por un fallo de red.
                    console.error("[GoogleCalendarService] Error comprobando la conexión con Google:", e);
                    return false;
                })
                .finally(() => { inFlightConnectionCheck = null; });
        }

        return inFlightConnectionCheck;
    }

    /**
     * Invalida los caches de token y de estado de conexión.
     * Debe llamarse al desconectar Google o al cerrar sesión, para que la app
     * no siga usando el access token del usuario anterior.
     */
    static clearTokenCache() {
        cachedToken = null;
        cachedIsConnected = null;
        inFlightConnectionCheck = null;
        cacheGeneration++;
    }

    /**
     * Refresh the Google Access Token using our Edge Function
     */
    static async refreshGoogleToken(session: any) {
        devLog("[GoogleCalendarService] refreshGoogleToken called with session user ID:", session?.user?.id);
        try {
            const refreshToken = await this.resolveRefreshToken(session);
            devLog("[GoogleCalendarService] Refresh token resolved:", refreshToken ? "Yes" : "No");

            if (!refreshToken) {
                // Estado esperado para quien no usa la integración: no es un error.
                cachedIsConnected = false;
                devLog("[GoogleCalendarService] No refresh token available in session or DB.");
                return null;
            }

            devLog("[GoogleCalendarService] Invoking google-token-refresh edge function...");

            // El JWT viaja automático en el invoke; el refresh token se resuelve
            // server-side por user.id (ver google-token-refresh/index.ts) — ya no
            // se manda en el body, evita usar la app como proxy OAuth de tokens ajenos.
            const { data, error } = await supabase.functions.invoke('google-token-refresh');

            if (error) {
                // supabase-js expone el status en `context.status` (FunctionsHttpError);
                // algunas versiones tambien lo copian a `error.status`.
                const status = (error as any).status ?? (error as any).context?.status;

                if (status === 400 || status === 401) {
                    // invalid_grant: el refresh token ya no sirve (revocado, o app
                    // OAuth en modo Testing). Marcamos desconectado para no reintentar
                    // en bucle: el usuario tiene que reconectar desde Configuración.
                    cachedIsConnected = false;
                    console.error(
                        "[GoogleCalendarService] El refresh token de Google ya no es válido. " +
                        "Reconectá Google Calendar desde Configuración.", error
                    );
                } else {
                    console.error("[GoogleCalendarService] Edge function error:", error);
                }
                return null;
            }

            if (data?.access_token) {
                devLog("[GoogleCalendarService] Edge function successfully returned new access_token");
                cachedToken = data.access_token;
                cachedIsConnected = true;
                return data.access_token;
            }

            return null;
        } catch (eUnknown: unknown) {
            const e = eUnknown instanceof Error ? eUnknown : new Error(String(eUnknown) || "Ocurrió un error inesperado.");
            // Fallo genuino (Edge Function caída, invalid_grant, red): hay que verlo.
            console.error("[GoogleCalendarService] Error refreshing Google token:", e);
            return null;
        }
    }

    /**
     * Middleware fetching function that handles auth and 401 retries
     */
    static async fetchWithAuth(url: string, options: any = {}, session: any = null): Promise<Response> {
        devLog(`[GoogleCalendarService] fetchWithAuth to ${url}`);
        devLog(`[GoogleCalendarService] fetchWithAuth received session object:`, session ? `Yes (ID: ${session?.user?.id})` : "No (null/undefined)");

        let token = this.getProviderToken(session);

        // Si el token es null (ej: F5 o sesión restaurada), intentamos refrescar proactivamente
        if (!token && session) {
            devLog("[GoogleCalendarService] Token efímero no encontrado. Intentando refrescar proactivamente...");
            token = await this.refreshGoogleToken(session);
        }

        if (!token) {
            // Sin token: puede ser simplemente que el usuario no usa la integración.
            // La causa real (si la hay) ya se logueó en refreshGoogleToken.
            devLog("[GoogleCalendarService] No hay token disponible; se omite la llamada a Google.");
            return new Response(
                JSON.stringify({ error: { message: 'El usuario debe reautenticar (permisos revocados o token inválido)' } }),
                { status: 401, statusText: 'No token available', headers: { 'Content-Type': 'application/json' } }
            );
        }

        devLog("[GoogleCalendarService] Token acquired successfully. Proceeding with fetch...");

        // Prepare headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        try {
            let response = await fetch(url, { ...options, headers });

            // If 401 Unauthorized, try to refresh and retry ONCE
            if (response.status === 401 && session) {
                devLog("[GoogleCalendarService] Google API 401. Attempting token refresh...");
                // El token cacheado ya no sirve; si el refresh falla no queremos
                // seguir reusandolo en las proximas llamadas.
                cachedToken = null;

                const newToken = await this.refreshGoogleToken(session);
                if (newToken) {
                    headers['Authorization'] = `Bearer ${newToken}`;
                    response = await fetch(url, { ...options, headers });
                }
            }

            return response;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error("FetchWithAuth Network Error:", error);
            throw error;
        }
    }

    /**
     * List events from the primary calendar.
     */
    static async listEvents(timeMin: Date, timeMax: Date, session: any = null) {
        try {
            const params = new URLSearchParams({
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
            });

            const response = await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {}, session);

            if (!response.ok) {
                const err = response.json ? await response.json().catch(() => ({})) : {};
                // Un 401 acá significa "sin credenciales de Google"; la causa real
                // ya se logueó en refreshGoogleToken. No lo repetimos como error.
                if (response.status === 401) {
                    devLog('[GoogleCalendarService] listEvents omitido: sin credenciales de Google.');
                } else {
                    console.error('Google Calendar list error:', response.status, err);
                }
                return [];
            }

            const data = await response.json();
            return data.items || [];
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error listing Google Calendar events:', error);
            return [];
        }
    }

    /**
     * Create an event in the primary calendar.
     */
    static async createEvent(appointment: any, session: any = null) {
        const event = {
            summary: appointment.title,
            description: appointment.notes || '',
            start: { dateTime: appointment.start_time, timeZone: EVENT_TIMEZONE },
            end: { dateTime: appointment.end_time, timeZone: EVENT_TIMEZONE },
            attendees: appointment.patientEmail ? [{ email: appointment.patientEmail }] : [],
        };

        try {
            const response = await this.fetchWithAuth('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                body: JSON.stringify(event),
            }, session);

            if (!response.ok) {
                const errorData = response.json ? await response.json().catch(() => ({})) : {};
                console.error('Google Calendar API Error (Create):', errorData);
                throw new Error(`Google Calendar Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error creating Google Calendar event:', error);
            return null;
        }
    }

    /**
     * Update an existing event.
     */
    static async updateEvent(googleEventId: string, appointment: any, session: any = null) {
        if (!googleEventId) return null;

        const event = {
            summary: appointment.title,
            description: appointment.notes || '',
            start: { dateTime: appointment.start_time, timeZone: EVENT_TIMEZONE },
            end: { dateTime: appointment.end_time, timeZone: EVENT_TIMEZONE },
            attendees: appointment.patientEmail ? [{ email: appointment.patientEmail }] : [],
        };

        // A diferencia de createEvent, propagamos el error: el llamador decide
        // qué hacer. Tragarlo acá dejaba el fallo invisible.
        const response = await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
            method: 'PUT',
            body: JSON.stringify(event),
        }, session);

        if (!response.ok) {
            const errorData = response.json ? await response.json().catch(() => ({})) : {};
            throw new Error(errorData?.error?.message || `Google Calendar respondió ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Delete an event.
     */
    static async deleteEvent(googleEventId: string, session: any = null) {
        if (!googleEventId) return;

        try {
            await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
                method: 'DELETE',
            }, session);
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error deleting Google Calendar event:', error);
        }
    }
}
