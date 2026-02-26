import { useMemo } from 'react';
import { isToday, isSameWeek, isSameDay, isAfter, parseISO, isValid, startOfDay } from 'date-fns';

export function useDashboardData(
    turnosCrudos: any[],
    turnosLoading: boolean
) {
    return useMemo(() => {
        let turnosHoy = 0;
        let turnosSemana = 0;
        const nextTurnos: any[] = [];

        const now = new Date();
        const todayStart = startOfDay(now);

        if (turnosCrudos && turnosCrudos.length > 0) {
            turnosCrudos.forEach(event => {
                const startStr = event.start || event.startTime;
                if (!startStr) return;

                const startDate = typeof startStr === 'string' ? parseISO(startStr) : new Date(startStr);
                if (!isValid(startDate)) return;

                if (isToday(startDate)) {
                    turnosHoy++;
                }

                if (isSameWeek(startDate, now, { weekStartsOn: 1 })) {
                    turnosSemana++;
                }

                if (isSameDay(startDate, todayStart) || isAfter(startDate, todayStart)) {
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

                    const endStr = event.end;
                    const end = endStr ? (typeof endStr === 'string' ? parseISO(endStr) : new Date(endStr)) : null;

                    const rawSummary = event.summary || event.title || '';
                    const pacienteFromEvent = event.patientName || event.paciente || '';
                    const [summaryTipo, summaryPaciente] = rawSummary.includes(' - ')
                        ? rawSummary.split(' - ')
                        : [rawSummary, ''];
                    const tipo = event.tipoTurnoNombre || summaryTipo || event.title || 'Consulta';
                    const paciente = pacienteFromEvent || summaryPaciente || 'Sin nombre';
                    const titulo = rawSummary || `${tipo}${paciente ? ` - ${paciente}` : ''}`;
                    const descripcion = event.description || event.location || '';

                    nextTurnos.push({
                        id: event.id,
                        fecha: fmtDate.format(startDate),
                        hora: `${fmtTime.format(startDate)} hs${end && isValid(end) ? ` - ${fmtTime.format(end)} hs` : ''}`,
                        titulo,
                        descripcion,
                        startDate: startDate,
                        htmlLink: event.htmlLink,
                        raw: event
                    });
                }
            });

            nextTurnos.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        }

        return {
            turnosHoy,
            turnosSemana,
            nextTurnos: nextTurnos.slice(0, 3),
            loadingStats: turnosLoading
        };
    }, [turnosCrudos, turnosLoading]);
}
