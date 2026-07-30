import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { AppointmentService } from '../services/AppointmentService';
import { parseLocalYMD, getDayBounds } from '../utils/dateUtils';
import { addDays, isAfter } from 'date-fns';
import { supabase } from '../config/supabaseClient';
import { devLog } from '../utils/devLog';

export const turnosQueryKey = (fromDate: string | null = null, toDate: string | null = null) => {
    return ['turnos', fromDate, toDate];
};

// Sincronización de rezagados con Google Calendar: antes corría en CADA ejecución
// del queryFn (montaje de vista, invalidación tras mutación, evento de realtime),
// recorriendo una y otra vez el mismo conjunto de turnos. El estado es de módulo
// porque el freno debe valer para todas las instancias del hook, no por componente.
const PENDING_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastPendingSyncAt = 0;

export function useAppointmentsQuery(fromDate: string | null = null, toDate: string | null = null, session: Session | null = null) {
    const queryClient = useQueryClient();

    const { data: turnos = [], isLoading: loading, error, refetch } = useQuery({
        queryKey: turnosQueryKey(fromDate, toDate),
        staleTime: 5000,
        queryFn: async () => {
            let fromISO, toISO;
            if (fromDate && toDate) {
                const startDate = parseLocalYMD(fromDate);
                const endDate = parseLocalYMD(toDate);

                if (startDate && endDate) {
                    let startBounds = getDayBounds(startDate);
                    let endBounds = getDayBounds(endDate);

                    if (isAfter(startBounds.start, endBounds.start)) {
                        const tmp = startBounds;
                        startBounds = endBounds;
                        endBounds = tmp;
                    }
                    fromISO = startBounds.start.toISOString();
                    toISO = endBounds.end.toISOString();
                }
            }

            if (!fromISO || !toISO) {
                const today = new Date();
                const startBounds = getDayBounds(today);
                const endBounds = getDayBounds(addDays(today, 7));
                fromISO = startBounds.start.toISOString();
                toISO = endBounds.end.toISOString();
            }

            const events = await AppointmentService.getAppointments(fromISO, toISO, session);

            // Sincronización de rezagados: a lo sumo una vez cada 5 minutos.
            if (session?.user?.id && Date.now() - lastPendingSyncAt > PENDING_SYNC_INTERVAL_MS) {
                lastPendingSyncAt = Date.now();
                AppointmentService.syncPendingAppointments(session)
                    .catch(e => console.error("Background sync error:", e));
            }

            const normalized = Array.isArray(events) ? events : [];
            // Remove cancelled from UI
            return normalized.filter((ev: any) => (ev?.status || '').toLowerCase() !== 'cancelled' && (ev?.status || '').toLowerCase() !== 'canceled');
        },
    });

    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;

        // Suscripción al canal de realtime para la tabla appointments.
        // Dep: userId (string) — NOT the whole session object, to avoid
        // tearing down the WebSocket on every silent JWT refresh.
        const channel = supabase
            .channel(`appointments-realtime-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    devLog('Cambio detectado vía Supabase Realtime:', payload);
                    // Invalidamos la query principal para forzar un refetch silencioso
                    queryClient.invalidateQueries({ queryKey: ['turnos'] });
                }
            )
            .subscribe();

        // Limpieza de la suscripción al desmontar
        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient, session?.user?.id]);

    const refreshTurnos = useCallback(() => {
        refetch();
    }, [refetch]);

    // Acá había un listener de `turnos:refresh`. Los emisores (`useEditTurnoModal`,
    // `useAppointmentModals`) ahora invalidan la key `['turnos']`, que por prefijo
    // alcanza todos los rangos cacheados — incluido el que esta instancia observa.

    return {
        turnos,
        loading,
        error: error ? (error as Error).message : '',
        refreshTurnos,
        fetchTurnos: refetch
    };
}
