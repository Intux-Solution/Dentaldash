import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { useTurnos } from './useTurnos';
import { useAuth } from '../context/AuthContext';

const AppointmentModalsContext = createContext<any>(null);

export function AppointmentModalsProvider({
    children,
    turnos = [],
    refreshTurnos,
    refreshPatients,
}: any) {
    const { session } = useAuth();
    const { deleteTurno } = useTurnos(null, null, session);

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

    const onBookingSuccess = useCallback(() => {
        if (typeof refreshTurnos === 'function') refreshTurnos();
        if (typeof refreshPatients === 'function') refreshPatients();
        window.dispatchEvent(new CustomEvent('patients:refresh'));
        closeBookingModal();
    }, [refreshTurnos, refreshPatients, closeBookingModal]);

    const onTurnoSaved = useCallback(() => {
        if (typeof refreshTurnos === 'function') refreshTurnos();
        setShowEditTurnoModal(false);
        setSelectedTurno(null);
    }, [refreshTurnos]);

    const onTurnoDeleted = useCallback((deletedTurno: any) => {
        if (typeof refreshTurnos === 'function') refreshTurnos();
        setShowEditTurnoModal(false);
        setShowTurnoDetailsModal(false);
        setSelectedTurno(null);
    }, [refreshTurnos]);

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
