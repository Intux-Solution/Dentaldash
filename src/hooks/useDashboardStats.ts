import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, isAfter, isSameDay, parseISO, isValid } from 'date-fns';
import { usePatients } from './usePatients';
import { useTurnos } from './useTurnos';
import { useAppStore } from '../store/useAppStore';

interface DashboardStats {
    totalPacientes: number;
    ingresosMensuales: number;
    turnosHoy: number;
    isLoading: boolean;
    error: string | null;
}

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>({
        totalPacientes: 0,
        ingresosMensuales: 0,
        turnosHoy: 0,
        isLoading: true,
        error: null
    });

    const { turnos: events, loading: turnosLoading, error: turnosError } = useTurnos();
    const { patients, loading: patientsLoading } = usePatients();

    const dashboardSearchTerm = useAppStore(state => state.dashboardSearchTerm);
    const dashboardStatusFilter = useAppStore(state => state.dashboardStatusFilter);

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async () => {
            // ... fetch logic exactly as before for the numbers
            try {
                const now = new Date();

                // 1. Total Pacientes Activos
                const { count: totalPacientes, error: pacientesErr } = await supabase
                    .from('patients')
                    .select('*', { count: 'exact', head: true })
                    .eq('estado', 'Activo');

                if (pacientesErr) throw pacientesErr;

                // 2. Turnos de Hoy
                const todayStart = startOfDay(now).toISOString();
                const todayEnd = endOfDay(now).toISOString();

                const { count: turnosHoy, error: turnosErr } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .gte('start_time', todayStart)
                    .lte('start_time', todayEnd)
                    .neq('status', 'Cancelado');

                if (turnosErr) throw turnosErr;

                // 3. Ingresos del Mes (Sumatoria)
                const monthStart = startOfMonth(now).toISOString();
                const monthEnd = endOfMonth(now).toISOString();

                // Fallback a tabla payments si existe, sumando el amount
                let ingresosMensuales = 0;
                const { data: payments, error: paymentsErr } = await supabase
                    .from('payments')
                    .select('amount, monto')
                    .gte('fecha', monthStart)
                    .lte('fecha', monthEnd);

                if (!paymentsErr && payments) {
                    ingresosMensuales = payments.reduce((acc, curr) => {
                        const val = Number(curr.amount || curr.monto) || 0;
                        return acc + val;
                    }, 0);
                }

                if (isMounted) {
                    setStats({
                        totalPacientes: totalPacientes || 0,
                        turnosHoy: turnosHoy || 0,
                        ingresosMensuales,
                        isLoading: false,
                        error: null
                    });
                }
            } catch (err: any) {
                if (isMounted) {
                    setStats(prev => ({
                        ...prev,
                        isLoading: false,
                        error: err.message || 'Error al obtener estadísticas del dashboard'
                    }));
                }
            }
        };

        fetchStats();

        return () => {
            isMounted = false;
        };
    }, []);

    // --- Complex logic from DashboardView ---

    const upcomingAppointments = useMemo(() => {
        const today = startOfDay(new Date());

        return (events as any[])
            .filter(event => {
                const startDateStr = event.start || event.startTime;
                if (!startDateStr) return false;

                const startDate = typeof startDateStr === 'string' ? parseISO(startDateStr) : new Date(startDateStr);
                return isValid(startDate) && (isSameDay(startDate, today) || isAfter(startDate, today));
            })
            .map(event => {
                const startStr = event.start || event.startTime;
                const start = typeof startStr === 'string' ? parseISO(startStr) : new Date(startStr);

                const endStr = event.end;
                const end = endStr ? (typeof endStr === 'string' ? parseISO(endStr) : new Date(endStr)) : null;

                const fmtDate = new Intl.DateTimeFormat('es-AR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long'
                });
                const fmtTime = new Intl.DateTimeFormat('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                });

                const rawSummary = event.summary || event.title || '';
                const pacienteFromEvent = event.patientName || event.paciente || '';
                const [summaryTipo, summaryPaciente] = rawSummary.includes(' - ')
                    ? rawSummary.split(' - ')
                    : [rawSummary, ''];
                const tipo = event.tipoTurnoNombre || summaryTipo || event.title || 'Consulta';
                const paciente = pacienteFromEvent || summaryPaciente || 'Sin nombre';
                const titulo = rawSummary || `${tipo}${paciente ? ` - ${paciente}` : ''}`;
                const descripcion = event.description || event.location || '';

                return {
                    id: event.id,
                    fecha: fmtDate.format(start),
                    hora: `${fmtTime.format(start)} hs${end && isValid(end) ? ` - ${fmtTime.format(end)} hs` : ''}`,
                    titulo,
                    descripcion,
                    startDate: start,
                    htmlLink: event.htmlLink,
                    raw: event
                };
            })
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
            .slice(0, 3);
    }, [events]);

    const latestPatients = useMemo(() => {
        const term = (dashboardSearchTerm || '').trim().toLowerCase();

        // Helper to safely parse dates across browsers without regex hacks
        const safeGetDate = (p: any): number => {
            if (!p) return 0;
            // _createdAt is injected securely by usePatients normalize flow now
            if (p._createdAt) return p._createdAt;

            const raw = p.fechaRegistro || p['Fecha Registro'] || p.createdTime || p.created_at || p.createdAt;
            if (!raw) return 0;

            const date = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
            return isValid(date) ? date.getTime() : 0;
        };

        const base = [...patients];

        if (!term && (!dashboardStatusFilter || dashboardStatusFilter === 'Todos')) {
            return base.sort((a, b) => safeGetDate(b) - safeGetDate(a)).slice(0, 4);
        }

        return base
            .filter((p) => {
                const normalizedName = (p.nombre || '').toLowerCase();
                const matchesSearch = normalizedName.includes(term);
                const matchesStatus = dashboardStatusFilter === 'Todos'
                    ? (p.estado !== 'Inactivo')
                    : (p.estado === dashboardStatusFilter);
                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => safeGetDate(b) - safeGetDate(a))
            .slice(0, 4);
    }, [patients, dashboardSearchTerm, dashboardStatusFilter]);

    return {
        ...stats,
        upcomingAppointments,
        turnosLoading,
        turnosError,
        latestPatients,
        patientsLoading
    };
}
