import { supabase } from '../config/supabaseClient';

/**
 * Notificaciones por email de turnos.
 *
 * El envío vive en la Edge Function `notify-appointment`: el navegador no puede
 * tener la API key del proveedor de email ni leer el email del dentista desde
 * `auth.users`.
 */
export const NotificationService = {
    /**
     * Avisa por email al paciente y al dentista de un turno recién creado.
     * Nunca lanza: el turno ya existe y un mail que no sale no debe romper el alta.
     */
    async notifyAppointmentCreated(appointmentId: string): Promise<boolean> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return false;

            const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-appointment`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ appointment_id: appointmentId }),
                }
            );

            if (!res.ok) {
                console.warn('[NotificationService] No se pudo notificar el turno:', res.status);
                return false;
            }
            return true;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown));
            console.warn('[NotificationService] notifyAppointmentCreated:', error.message);
            return false;
        }
    },
};
