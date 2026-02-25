import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppointmentService } from '../services/AppointmentService';
import { startOfDay, endOfDay, addDays, isAfter } from 'date-fns';

export const turnosQueryKey = (fromDate: string | null = null, toDate: string | null = null) => {
    return ['turnos', fromDate, toDate];
};

export function useTurnos(fromDate: string | null = null, toDate: string | null = null, session: any = null) {
    const queryClient = useQueryClient();

    const parseYMD = (s: string | null) => {
        if (!s) return null;
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return new Date(s);
    };

    const { data: turnos = [], isLoading: loading, error, refetch } = useQuery({
        queryKey: turnosQueryKey(fromDate, toDate),
        queryFn: async () => {
            let fromISO, toISO;
            if (fromDate && toDate) {
                let startDate = parseYMD(fromDate);
                let endDate = parseYMD(toDate);
                if (startDate && endDate) {
                    startDate = startOfDay(startDate);
                    endDate = endOfDay(endDate);
                    if (isAfter(startDate, endDate)) {
                        const tmp = startDate;
                        startDate = endDate;
                        endDate = tmp;
                    }
                    fromISO = startDate.toISOString();
                    toISO = endDate.toISOString();
                }
            } else {
                const today = new Date();
                const startDate = startOfDay(today);
                const endDate = endOfDay(addDays(today, 7));
                fromISO = startDate.toISOString();
                toISO = endDate.toISOString();
            }

            const events = await AppointmentService.getAppointments(fromISO, toISO, session);
            const normalized = Array.isArray(events) ? events : [];
            return normalized.filter((ev: any) => (ev?.status || '').toLowerCase() !== 'cancelled' && (ev?.status || '').toLowerCase() !== 'canceled');
        },
    });

    const addMutation = useMutation({
        mutationFn: async (data: any) => {
            return await AppointmentService.createAppointment(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string, data: any }) => {
            return await AppointmentService.updateAppointment(id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return await AppointmentService.deleteAppointment(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

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
        // Optional retrocompatibility listeners
        const triggerRefresh = () => refetch();
        window.addEventListener('turnos:refresh', triggerRefresh);

        return () => {
            window.removeEventListener('webhook:mutated', handleWebhookMutation);
            window.removeEventListener('turnos:refresh', triggerRefresh);
        };
    }, [refetch]);

    const addTurno = async (data: any) => {
        return await addMutation.mutateAsync(data);
    };

    const updateTurno = async (id: string, data: any) => {
        return await updateMutation.mutateAsync({ id, data });
    };

    const deleteTurno = async (id: string) => {
        return await deleteMutation.mutateAsync(id);
    };

    return {
        turnos,
        loading: loading || addMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
        error: error ? (error as Error).message : '',
        refreshTurnos,
        fetchTurnos: refetch,
        addTurno,
        updateTurno,
        deleteTurno,
    };
}
