import { supabase } from '../config/supabaseClient';

// Module-level cache for the token (persists while the page is open)
let cachedToken = null;

export class GoogleCalendarService {

    /**
     * Get the provider token from the current session or cache.
     */
    static getProviderToken(session) {
        if (cachedToken) return cachedToken;
        return session?.provider_token;
    }

    /**
     * Get the refresh token from the session.
     */
    static getRefreshToken(session) {
        return session?.provider_refresh_token;
    }

    /**
     * Refresh the Google Access Token using our Edge Function
     */
    static async refreshGoogleToken(session) {
        console.log("[GoogleCalendarService] refreshGoogleToken called with session user ID:", session?.user?.id);
        try {
            let refreshToken = this.getRefreshToken(session);
            console.log("[GoogleCalendarService] Refresh token from session object:", refreshToken ? "Yes" : "No");

            // Si el token no está en la sesión efímera (por ej. recarga F5), 
            // lo buscamos en la base de datos (guardado previamente por AuthContext)
            if (!refreshToken && session?.user?.id) {
                console.log("[GoogleCalendarService] Attempting to fetch refresh_token from DB for user", session.user.id);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('google_refresh_token')
                    .eq('id', session.user.id)
                    .single();

                if (error) {
                    console.error("[GoogleCalendarService] DB Error fetching refresh token:", error);
                }

                if (!error && data?.google_refresh_token) {
                    console.log("[GoogleCalendarService] Successfully retrieved refresh_token from DB");
                    refreshToken = data.google_refresh_token;
                }
            }

            if (!refreshToken) {
                console.warn("[GoogleCalendarService] No refresh token available in session or DB.");
                return null;
            }

            console.log("[GoogleCalendarService] Invoking google-token-refresh edge function...");

            const { data, error } = await supabase.functions.invoke('google-token-refresh', {
                body: { refresh_token: refreshToken }
            });

            if (error) {
                console.error("[GoogleCalendarService] Edge function error:", error);
                return null;
            }

            if (data?.access_token) {
                console.log("[GoogleCalendarService] Edge function successfully returned new access_token");
                cachedToken = data.access_token;
                return data.access_token;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Middleware fetching function that handles auth and 401 retries
     */
    static async fetchWithAuth(url: string, options: any = {}, session: any = null): Promise<Response> {
        console.log(`[GoogleCalendarService] fetchWithAuth to ${url}`);
        console.log(`[GoogleCalendarService] fetchWithAuth received session object:`, session ? `Yes (ID: ${session?.user?.id})` : "No (null/undefined)");

        let token = this.getProviderToken(session);

        // Si el token es null (ej: F5 o sesión restaurada), intentamos refrescar proactivamente
        if (!token && session) {
            console.log("[GoogleCalendarService] Token efímero no encontrado. Intentando refrescar proactivamente...");
            token = await this.refreshGoogleToken(session);
        }

        if (!token) {
            console.error("[GoogleCalendarService] Fatal: No fue posible obtener un token. El usuario debe reautenticar.");
            return new Response(
                JSON.stringify({ error: { message: 'No token available. Please re-authenticate with Google.' } }),
                { status: 401, statusText: 'No token available', headers: { 'Content-Type': 'application/json' } }
            );
        }

        console.log("[GoogleCalendarService] Token acquired successfully. Proceeding with fetch...");

        // Prepare headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        try {
            let response = await fetch(url, { ...options, headers });

            // If 401 Unauthorized, try to refresh and retry
            if (response.status === 401 && session) {
                console.warn("Google API 401. Attempting token refresh...");
                const newToken = await this.refreshGoogleToken(session);

                if (newToken) {
                    headers['Authorization'] = `Bearer ${newToken}`;
                    response = await fetch(url, { ...options, headers });
                }
            }

            return response;
        } catch (error) {
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
                console.error('Google Calendar list error:', response.status, err);
                return [];
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
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
            start: {
                dateTime: appointment.start_time,
                timeZone: 'America/Argentina/Buenos_Aires',
            },
            end: {
                dateTime: appointment.end_time,
                timeZone: 'America/Argentina/Buenos_Aires',
            },
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
        } catch (error) {
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
            start: { dateTime: appointment.start_time },
            end: { dateTime: appointment.end_time },
            attendees: appointment.patientEmail ? [{ email: appointment.patientEmail }] : [],
        };

        try {
            const response = await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
                method: 'PUT',
                body: JSON.stringify(event),
            }, session);

            if (!response.ok) throw new Error('Failed to update Google Event');
            return await response.json();
        } catch (error) {
            console.error('Error updating Google Calendar event:', error);
            return null;
        }
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
        } catch (error) {
            console.error('Error deleting Google Calendar event:', error);
        }
    }
}
