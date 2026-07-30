import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTurnos } from './useTurnos';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryKeys';

const AppointmentModalsContext = createContext<any>(null);

export function AppointmentModalsProvider({
    children,
    turnos = [],
}: any) {
    const { session } = useAuth();
    const { deleteTurno } = useTurnos(null, null, session);
    const queryClient = useQueryClient();

    const [selectedTurno, setSelectedTurno] = useState<any>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [showTurnoDetailsModal, setShowTurnoDetailsModal] = useState(false);
    const [showEditTurnoModal, setShowEditTurnoModal] = useState(false);

    const openBookingModal = useCallback(() => setShowBookingModal(true), []);
    const closeBookingModal = useCallback(() => setShowBookingModal(false), []);

    const onViewTurno = useCallback((turno: any) => {
        setSelectedTurno(turno);
        setShowTurnoDetailsModal(true);
    }, []);

    const onEditTurnoFromDetails = useCallback((turno: any) => {
        setSelectedTurno(turno);
        setShowTurnoDetailsModal(false);
        setShowEditTurnoModal(true);
    }, []);

    const closeTurnoDetails = useCallback(() => {
        setShowTurnoDetailsModal(false);
        setSelectedTurno(null);
    }, []);

    const closeEditTurno = useCallback(() => {
        setShowEditTurnoModal(false);
        setSelectedTurno(null);
    }, []);

    // Invalidar por prefijo en vez de llamar a `refreshTurnos`: ese refetch solo
    // alcanza la key `['turnos', null, null]` de AuthedApp, no la que observa
    // TurnosView (que lleva el rango de fechas seleccionado).
    const invalidateTurnos = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.turnos.all });
    }, [queryClient]);

    const onBookingSuccess = useCallback(() => {
        invalidateTurnos();
        // Reservar puede crear un paciente nuevo: la lista también cambia.
        queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
        closeBookingModal();
    }, [invalidateTurnos, queryClient, closeBookingModal]);

    const onTurnoSaved = useCallback(() => {
        invalidateTurnos();
        setShowEditTurnoModal(false);
        setSelectedTurno(null);
    }, [invalidateTurnos]);

    const onTurnoDeleted = useCallback((_deletedTurno: any) => {
        invalidateTurnos();
        setShowEditTurnoModal(false);
        setShowTurnoDetailsModal(false);
        setSelectedTurno(null);
    }, [invalidateTurnos]);

    const onDeleteTurnoFromDetails = useCallback(async (turno: any) => {
        const id = turno?.id || turno?.eventId || turno?._id;
        if (!id) { alert('No se pudo identificar el turno a cancelar'); return; }
        try {
            await deleteTurno(id);
            onTurnoDeleted({ ...turno, id });
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            alert(err.message || 'No se pudo cancelar el turno.');
        }
    }, [onTurnoDeleted, deleteTurno]);

    React.useEffect(() => {
        if (selectedTurno && Array.isArray(turnos)) {
            const idSearch = selectedTurno.id || selectedTurno.eventId || selectedTurno._id;
            const updated = turnos.find((t: any) => (t.id || t.eventId || t._id) === idSearch);
            if (updated && JSON.stringify(selectedTurno) !== JSON.stringify(updated)) {
                setSelectedTurno(updated);
            }
        }
    }, [selectedTurno, turnos]);

    const value = useMemo(() => ({
        selectedTurno,
        showBookingModal,
        showTurnoDetailsModal,
        showEditTurnoModal,
        openBookingModal,
        closeBookingModal,
        onViewTurno,
        onEditTurnoFromDetails,
        onDeleteTurnoFromDetails,
        closeTurnoDetails,
        closeEditTurno,
        onBookingSuccess,
        onTurnoSaved,
        onTurnoDeleted,
        session,
    }), [
        selectedTurno, showBookingModal, showTurnoDetailsModal, showEditTurnoModal,
        openBookingModal, closeBookingModal, onViewTurno, onEditTurnoFromDetails,
        onDeleteTurnoFromDetails, closeTurnoDetails, closeEditTurno,
        onBookingSuccess, onTurnoSaved, onTurnoDeleted, session
    ]);

    return (
        <AppointmentModalsContext.Provider value={value}>
            {children}
        </AppointmentModalsContext.Provider>
    );
}

export function useAppointmentModals() {
    const ctx = useContext(AppointmentModalsContext);
    if (!ctx) throw new Error('useAppointmentModals must be used within a AppointmentModalsProvider');
    return ctx;
}
