import { useState, useMemo, useEffect } from 'react';
import { useTurnos } from './useTurnos';
import { useAuth } from '../context/AuthContext';

export function groupByDate(events: any[]) {
    const by: Record<string, any[]> = {};
    for (const ev of events) {
        const dayKey = (ev.start || ev.startTime || ev.startDate || ev.start_at);
        if (!dayKey) continue;

        const d = new Date(dayKey);
        if (isNaN(d.getTime())) continue;

        const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        if (!by[key]) by[key] = [];
        by[key].push(ev);
    }

    for (const k of Object.keys(by)) {
        by[k].sort((a, b) => {
            const startA = new Date(a.start || a.startTime).getTime();
            const startB = new Date(b.start || b.startTime).getTime();
            return startA - startB;
        });
    }
    return Object.keys(by).sort().map(k => ({ date: new Date(k), items: by[k] }));
}

export const formatDateForInput = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const getDefaultDates = () => {
    const today = new Date();
    const next7Days = new Date();
    next7Days.setDate(today.getDate() + 7);
    return {
        from: formatDateForInput(today),
        to: formatDateForInput(next7Days),
    };
};

export function useTurnosView() {
    const defaultDates = useMemo(() => getDefaultDates(), []);

    const [dateFrom, setDateFrom] = useState(defaultDates.from);
    const [dateTo, setDateTo] = useState(defaultDates.to);

    const { session } = useAuth();
    const { turnos: events, loading, error, refreshTurnos } = useTurnos(dateFrom, dateTo, session);

    const grouped = useMemo(() => groupByDate(events), [events]);

    const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFromDate = e.target.value;
        setDateFrom(newFromDate);

        if (newFromDate && dateTo && new Date(newFromDate) > new Date(dateTo)) {
            setDateTo(newFromDate);
        }
    };

    const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newToDate = e.target.value;
        setDateTo(newToDate);

        if (newToDate && dateFrom && new Date(newToDate) < new Date(dateFrom)) {
            setDateFrom(newToDate);
        }
    };

    const handleRefresh = () => {
        refreshTurnos();
    };

    const applyPresetToday = () => {
        const todayStr = formatDateForInput(new Date());
        setDateFrom(todayStr);
        setDateTo(todayStr);
    };

    const applyPresetTomorrow = () => {
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        const tmrStr = formatDateForInput(tmr);
        setDateFrom(tmrStr);
        setDateTo(tmrStr);
    };

    const applyPresetNext7Days = () => {
        const def = getDefaultDates();
        setDateFrom(def.from);
        setDateTo(def.to);
    };

    useEffect(() => {
        const handler = () => refreshTurnos();
        window.addEventListener('turnos:refresh', handler);
        return () => window.removeEventListener('turnos:refresh', handler);
    }, [refreshTurnos, dateFrom, dateTo]);

    return {
        events,
        loading,
        error,
        dateFrom,
        dateTo,
        grouped,
        handleDateFromChange,
        handleDateToChange,
        handleRefresh,
        applyPresetToday,
        applyPresetTomorrow,
        applyPresetNext7Days
    };
}
