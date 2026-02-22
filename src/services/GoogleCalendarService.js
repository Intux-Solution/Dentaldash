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
        try {
            const refreshToken = this.getRefreshToken(session);
            if (!refreshToken) return null;

            const { data, error } = await supabase.functions.invoke('google-token-refresh', {
                body: { refresh_token: refreshToken }
            });

            if (error) return null;

            if (data?.access_token) {
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
    static async fetchWithAuth(url, options = {}, session) {
        let token = this.getProviderToken(session);
        if (!token) return { ok: false, status: 401, statusText: 'No token available' };

        // Prepare headers
        const headers = {
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
    static async listEvents(timeMin, timeMax, session) {
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
    static async createEvent(appointment, session) {
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
    static async updateEvent(googleEventId, appointment, session) {
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
    static async deleteEvent(googleEventId, session) {
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
