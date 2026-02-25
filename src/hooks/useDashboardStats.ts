import { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardStats {
    totalPacientes: number;
    ingresosMensuales: number;
    turnosHoy: number;
    isLoading: boolean;
    error: string | null;
}

export function useDashboardStats(): DashboardStats {
    const [stats, setStats] = useState<DashboardStats>({
        totalPacientes: 0,
        ingresosMensuales: 0,
        turnosHoy: 0,
        isLoading: true,
        error: null
    });

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async () => {
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

    return stats;
}
