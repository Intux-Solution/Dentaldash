import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { AppointmentService } from '../services/AppointmentService';
import { parseLocalYMD, getDayBounds } from '../utils/dateUtils';
import { addDays, isAfter } from 'date-fns';
import { Appointment } from '../types/appointments';
import { supabase } from '../config/supabaseClient';

export const turnosQueryKey = (fromDate: string | null = null, toDate: string | null = null) => {
    return ['turnos', fromDate, toDate];
};

export function useAppointmentsQuery(fromDate: string | null = null, toDate: string | null = null, session: Session | null = null) {
    const queryClient = useQueryClient();

    const { data: turnos = [], isLoading: loading, error, refetch } = useQuery({
        queryKey: turnosQueryKey(fromDate, toDate),
        staleTime: 5000,
        queryFn: async () => {
            let fromISO, toISO;
            if (fromDate && toDate) {
                let startDate = parseLocalYMD(fromDate);
                let endDate = parseLocalYMD(toDate);

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

            // Trigger background sync for any unsynced confirmed appointments
            if (session?.user?.id) {
                AppointmentService.syncPendingAppointments(session).catch(e => console.error("Background sync error:", e));
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
                    console.log('Cambio detectado vía Supabase Realtime:', payload);
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

    useEffect(() => {
        const handleWebhookMutation = (e: Event) => {
            const detail = (e as CustomEvent<{ method?: string; url?: string }>).detail;
            const method = String(detail?.method || '').toUpperCase();
            if (method === 'GET') return;
            const url = String(detail?.url || '');
            const touchesTurnos = !url || /appointment|turno|calendar/i.test(url);
            if (!touchesTurnos) return;
            refetch();
        };

        window.addEventListener('webhook:mutated', handleWebhookMutation);
        const triggerRefresh = () => refetch();
        window.addEventListener('turnos:refresh', triggerRefresh);

        return () => {
            window.removeEventListener('webhook:mutated', handleWebhookMutation);
            window.removeEventListener('turnos:refresh', triggerRefresh);
        };
    }, [refetch]);

    return {
        turnos,
        loading,
        error: error ? (error as Error).message : '',
        refreshTurnos,
        fetchTurnos: refetch
    };
}
