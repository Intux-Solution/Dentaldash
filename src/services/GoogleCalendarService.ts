/**
 * Estado de conexión con Google Calendar en el cliente.
 *
 * Toda la sincronización real vive en la Edge Function `calendar-sync`
 * (ver `CalendarSyncService`): corre server-side con el `google_refresh_token` de
 * `profiles`. Este módulo solo conserva el caché de "conectado / no conectado"
 * que la UI necesita invalidar al conectar o desconectar la integración.
 *
 * Antes había acá ~330 líneas más (`listEvents`, `createEvent`, `updateEvent`,
 * `deleteEvent`, `fetchWithAuth`, `refreshGoogleToken`) que pegaban directo a
 * `googleapis.com` desde el navegador con el `provider_token` efímero de la
 * sesión. Ese es el camino roto que `calendar-sync` vino a reemplazar: fallaba en
 * silencio, los turnos quedaban sin `google_event_id` y las reuniones de Google
 * no bloqueaban horarios. Ningún consumidor las usaba ya.
 */
import { supabase } from '../config/supabaseClient';
import { devLog } from '../utils/devLog';

// Estado de conexión cacheado. null = todavía no resuelto.
let cachedIsConnected: boolean | null = null;
let inFlightConnectionCheck: Promise<boolean> | null = null;
// Se incrementa en cada clearTokenCache() para descartar el resultado de un
// chequeo que ya estaba en vuelo cuando el usuario desconectó.
let cacheGeneration = 0;

export class GoogleCalendarService {

    /**
     * ¿El usuario tiene Google Calendar conectado?
     *
     * Se resuelve una sola vez por carga de página para no pegarle a `profiles`
     * en cada búsqueda de slots.
     */
    static async isConnected(session: { user?: { id?: string } } | null): Promise<boolean> {
        if (cachedIsConnected !== null) return cachedIsConnected;

        const userId = session?.user?.id;
        if (!userId) return false;

        // Deduplica chequeos concurrentes (varios slot lookups en paralelo).
        if (!inFlightConnectionCheck) {
            const generation = cacheGeneration;
            inFlightConnectionCheck = this.hasRefreshToken(userId)
                .then((connected) => {
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
     * Invalida el estado de conexión cacheado.
     * Debe llamarse al desconectar Google o al cerrar sesión.
     */
    static clearTokenCache(): void {
        cachedIsConnected = null;
        inFlightConnectionCheck = null;
        cacheGeneration++;
    }

    /**
     * ¿Hay un `google_refresh_token` persistido para este usuario?
     * Lo escribe `AuthContext` al volver del redirect de OAuth.
     */
    private static async hasRefreshToken(userId: string): Promise<boolean> {
        devLog("[GoogleCalendarService] Comprobando google_refresh_token para", userId);

        const { data, error } = await supabase
            .from('profiles')
            .select('google_refresh_token')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("[GoogleCalendarService] Error leyendo el refresh token:", error);
            return false;
        }

        return !!data?.google_refresh_token;
    }
}
