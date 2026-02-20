import { supabase } from '../config/supabaseClient';

// Module-level cache for the token (persists while the page is open)
let cachedToken = null;

export class GoogleCalendarService {

    /**
     * Get the provider token from the current session or cache.
     */
    static async getProviderToken() {
        if (cachedToken) return cachedToken;
        const { data: { session } } = await supabase.auth.getSession();
        return session?.provider_token;
    }

    /**
     * Get the refresh token from the session.
     */
    static async getRefreshToken() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.provider_refresh_token;
    }

    /**
     * Refresh the Google Access Token using our Edge Function
     */
    static async refreshGoogleToken() {
        try {
            const refreshToken = await this.getRefreshToken();
            if (!refreshToken) {
                console.warn("No refresh token available in session. User might need to re-login with offline access.");
                return null;
            }

            console.log("Refreshing Google Token via Edge Function...");
            const { data, error } = await supabase.functions.invoke('google-token-refresh', {
                body: { refresh_token: refreshToken }
            });

            if (error) {
                console.error("Edge Function Error:", error);
                return null;
            }

            if (data?.access_token) {
                cachedToken = data.access_token;
                console.log("Google Token refreshed successfully.");
                return data.access_token;
            }

            console.error("Failed to refresh token:", data);
            return null;

        } catch (e) {
            console.error("refreshGoogleToken Exception:", e);
            return null;
        }
    }

    /**
     * Middleware fetching function that handles auth and 401 retries
     */
    static async fetchWithAuth(url, options = {}) {
        let token = await this.getProviderToken();
        if (!token) return { ok: false, status: 401, statusText: 'No token available' }; // Mock response-like object if no token

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        try {
            let response = await fetch(url, { ...options, headers });

            // If 401 Unauthorized, try to refresh and retry
            if (response.status === 401) {
                console.warn("Google API 401. Attempting token refresh...");
                const newToken = await this.refreshGoogleToken();

                if (newToken) {
                    // Update header with new token
                    headers['Authorization'] = `Bearer ${newToken}`;
                    // Retry request
                    response = await fetch(url, { ...options, headers });
                } else {
                    console.error("Token refresh failed. Aborting request.");
                    // Optionally notify global error handler here
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
    static async listEvents(timeMin, timeMax) {
        try {
            const params = new URLSearchParams({
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
            });

            const response = await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);

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
    static async createEvent(appointment) {
        const event = {
            summary: appointment.title,
            description: appointment.notes || '',
            start: {
                dateTime: appointment.start_time, // ISO string
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
            });

            if (!response.ok) {
                const errorData = response.json ? await response.json().catch(() => ({})) : {};
                console.error('Google Calendar API Error (Create):', errorData);
                throw new Error(`Google Calendar Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return data; // Contains .id
        } catch (error) {
            console.error('Error creating Google Calendar event:', error);
            return null;
        }
    }

    /**
     * Update an existing event.
     */
    static async updateEvent(googleEventId, appointment) {
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
            });

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
    static async deleteEvent(googleEventId) {
        if (!googleEventId) return;

        try {
            await this.fetchWithAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
                method: 'DELETE',
            });
        } catch (error) {
            console.error('Error deleting Google Calendar event:', error);
        }
    }
}
