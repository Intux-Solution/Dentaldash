import { useAppointmentsQuery } from './useAppointmentsQuery';
import { useAppointmentsMutations } from './useAppointmentsMutations';
import { Session } from '@supabase/supabase-js';

export function useTurnos(fromDate: string | null = null, toDate: string | null = null, session: Session | null = null) {
    const {
        turnos,
        loading: queryLoading,
        error: queryError,
        refreshTurnos,
        fetchTurnos
    } = useAppointmentsQuery(fromDate, toDate, session);

    const {
        addTurno,
        updateTurno,
        deleteTurno,
        isAdding,
        isUpdating,
        isDeleting
    } = useAppointmentsMutations(fromDate, toDate);

    return {
        turnos,
        loading: queryLoading || isAdding || isUpdating || isDeleting,
        error: queryError,
        refreshTurnos,
        fetchTurnos,
        addTurno,
        updateTurno,
        deleteTurno,
    };
}
