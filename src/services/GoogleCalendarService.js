import { supabase } from '../config/supabaseClient';

export class GoogleCalendarService {

    /**
     * Get the provider token from the current session.
     */
    static async getProviderToken() {
        const { data: { session } } = await supabase.auth.getSession();
        // provider_token is exposed if the user signed in with an OAuth provider
        // and we requested the scopes.
        return session?.provider_token;
    }

    /**
     * List events from the primary calendar.
     */
    static async listEvents(timeMin, timeMax) {
        const token = await this.getProviderToken();
        if (!token) return [];

        try {
            const params = new URLSearchParams({
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
            });

            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
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
        const token = await this.getProviderToken();
        if (!token) {
            console.warn('No Google provider token found. Cannot sync with Calendar.');
            return null;
        }

        const event = {
            summary: appointment.title,
            description: appointment.notes || '',
            start: {
                dateTime: appointment.start_time, // ISO string
                timeZone: 'America/Argentina/Buenos_Aires', // Will be ignored by Google if dateTime has offset, but good practice
            },
            end: {
                dateTime: appointment.end_time,
                timeZone: 'America/Argentina/Buenos_Aires',
            },
            // Check if we have patient email to add as attendee
            attendees: appointment.patientEmail ? [{ email: appointment.patientEmail }] : [],
        };

        try {
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Google Calendar API Error:', errorData);
                throw new Error(`Google Calendar Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return data; // Contains .id (the Google Event ID)
        } catch (error) {
            console.error('Error creating Google Calendar event:', error);
            // Don't block the app flow if sync fails, just log it.
            return null;
        }
    }

    /**
     * Update an existing event.
     */
    static async updateEvent(googleEventId, appointment) {
        if (!googleEventId) return null;

        const token = await this.getProviderToken();
        if (!token) return null;

        const event = {
            summary: appointment.title,
            description: appointment.notes || '',
            start: {
                dateTime: appointment.start_time,
            },
            end: {
                dateTime: appointment.end_time,
            },
            // Note: Updating attendees might send emails again depending on settings
            attendees: appointment.patientEmail ? [{ email: appointment.patientEmail }] : [],
        };

        try {
            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
                method: 'PUT', // or PATCH
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
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

        const token = await this.getProviderToken();
        if (!token) return;

        try {
            await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
        } catch (error) {
            console.error('Error deleting Google Calendar event:', error);
        }
    }
}
