import { useState, useMemo, useEffect } from 'react';
import { Calendar, RefreshCcw, Plus, Eye, List } from 'lucide-react';
import { useAppointmentModals } from '../hooks/useAppointmentModals';
import { useTurnosView, formatDateForInput } from '../hooks/useTurnosView';
import { ExportService } from '../services/ExportService';
import { useSubscription } from '../context/SubscriptionContext';

const GROUPS_PER_PAGE = 7;
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const fmtDay = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

function buildMonthGrid(year: number, month: number): (Date | null)[] {
    const first = new Date(year, month, 1);
    // ES locale: week starts on Monday (0=Mon ... 6=Sun)
    const startDow = (first.getDay() + 6) % 7; // 0=Mon
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

export default function TurnosView() {
    const { openBookingModal: onOpenBooking, onViewTurno } = useAppointmentModals();
    const { canUse } = useSubscription();
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'list' | 'month'>('list');

    const today = new Date();
    const [calMonth, setCalMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

    const {
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
        applyPresetNext7Days,
    } = useTurnosView();

    // Sync date range when calendar month changes
    useEffect(() => {
        if (viewMode !== 'month') return;
        const first = new Date(calMonth.year, calMonth.month, 1);
        const last = new Date(calMonth.year, calMonth.month + 1, 0);
        handleDateFromChange({ target: { value: formatDateForInput(first) } } as any);
        handleDateToChange({ target: { value: formatDateForInput(last) } } as any);
    }, [viewMode, calMonth.year, calMonth.month]); // eslint-disable-line react-hooks/exhaustive-deps

    // Count events per day (YYYY-MM-DD key)
    const countByDay = useMemo(() => {
        const map: Record<string, number> = {};
        for (const ev of events) {
            // `start_time` es el nombre crudo de la columna: llega en turnos que no
            // pasaron por el mapeo del repositorio.
            const d = new Date(ev.start || (ev as { start_time?: string }).start_time || '');
            if (isNaN(d.getTime())) continue;
            const key = formatDateForInput(d);
            map[key] = (map[key] || 0) + 1;
        }
        return map;
    }, [events]);

    const monthGrid = useMemo(() => buildMonthGrid(calMonth.year, calMonth.month), [calMonth]);

    const totalPages = Math.ceil(grouped.length / GROUPS_PER_PAGE);
    const paginatedGroups = useMemo(() => {
        const start = (currentPage - 1) * GROUPS_PER_PAGE;
        return grouped.slice(start, start + GROUPS_PER_PAGE);
    }, [grouped, currentPage]);

    const handlePreset = (fn: () => void) => { fn(); setCurrentPage(1); };

    const selectDay = (d: Date) => {
        const str = formatDateForInput(d);
        handleDateFromChange({ target: { value: str } } as any);
        handleDateToChange({ target: { value: str } } as any);
        setViewMode('list');
        setCurrentPage(1);
    };

    const prevMonth = () => setCalMonth(prev => {
        const m = prev.month === 0 ? 11 : prev.month - 1;
        const y = prev.month === 0 ? prev.year - 1 : prev.year;
        return { year: y, month: m };
    });
    const nextMonth = () => setCalMonth(prev => {
        const m = prev.month === 11 ? 0 : prev.month + 1;
        const y = prev.month === 11 ? prev.year + 1 : prev.year;
        return { year: y, month: m };
    });

    return (
        <div className="p-4 lg:p-8 bg-gray-50 min-h-screen">
            <div className="bg-white rounded-lg shadow-sm border">
                {/* ── Toolbar ── */}
                <div className="p-4 lg:p-6 border-b">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Calendar className="text-teal-600" size={20} />
                            <h2 className="text-lg font-semibold text-gray-800">Calendario de Turnos</h2>
                            {process.env.NODE_ENV === 'development' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                    {events.length} eventos
                                </span>
                            )}
                        </div>
                        {/* Vista toggle */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-start lg:self-auto">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <List size={15} /> Lista
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'month' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Calendar size={15} /> Mes
                            </button>
                        </div>
                    </div>

                    {viewMode === 'list' && (
                        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow max-w-xl">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Desde</label>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={handleDateFromChange}
                                        className="w-full h-10 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Hasta</label>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={handleDateToChange}
                                        className="w-full h-10 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-grow items-end">
                                <button onClick={() => handlePreset(applyPresetToday)} className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200">Hoy</button>
                                <button onClick={() => handlePreset(applyPresetTomorrow)} className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200">Mañana</button>
                                <button onClick={() => handlePreset(applyPresetNext7Days)} className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200">Próximos Turnos</button>
                                <button onClick={onOpenBooking} className="w-full h-10 inline-flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm">
                                    <Plus size={16} /> <span className="hidden sm:inline">Nuevo turno</span><span className="sm:hidden">Nuevo</span>
                                </button>
                            </div>
                            {canUse('export_data') && events.length > 0 && (
                                <button onClick={() => ExportService.exportAppointmentsCSV(events)} className="h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200">
                                    Exportar CSV
                                </button>
                            )}
                        </div>
                    )}

                    {viewMode === 'month' && (
                        <div className="flex items-center justify-between">
                            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">←</button>
                            <span className="font-semibold text-gray-800">
                                {MONTHS_ES[calMonth.month]} {calMonth.year}
                            </span>
                            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">→</button>
                        </div>
                    )}
                </div>

                {/* ── Content ── */}
                <div className="p-4 lg:p-6">
                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                            <RefreshCcw size={16} className="animate-spin" />
                            Cargando turnos...
                        </div>
                    )}

                    {!loading && error && (
                        <div className="p-4 rounded-lg border text-sm bg-red-50 text-red-900 border-red-200 mb-4">
                            {error}
                            <button onClick={handleRefresh} className="ml-2 underline hover:no-underline">Reintentar</button>
                        </div>
                    )}

                    {/* ── Vista Mes ── */}
                    {viewMode === 'month' && !loading && !error && (
                        <div>
                            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-xs">
                                {DAYS_ES.map(d => (
                                    <div key={d} className="bg-gray-50 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide">{d}</div>
                                ))}
                                {monthGrid.map((day, i) => {
                                    if (!day) return <div key={`empty-${i}`} className="bg-white min-h-[70px]" />;
                                    const key = formatDateForInput(day);
                                    const count = countByDay[key] || 0;
                                    const isToday = key === formatDateForInput(new Date());
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => selectDay(day)}
                                            className={`bg-white min-h-[70px] p-2 text-left hover:bg-teal-50 transition-colors flex flex-col ${isToday ? 'ring-2 ring-inset ring-teal-500' : ''}`}
                                        >
                                            <span className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-600 text-white' : 'text-gray-700'}`}>
                                                {day.getDate()}
                                            </span>
                                            {count > 0 && (
                                                <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700">
                                                    {count} turno{count !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-gray-400 mt-3 text-center">Hacé click en un día para ver los turnos</p>
                        </div>
                    )}

                    {/* ── Vista Lista ── */}
                    {viewMode === 'list' && !loading && !error && grouped.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            <Calendar size={48} className="mx-auto mb-4 opacity-50" />
                            {dateFrom === dateTo && dateFrom === formatDateForInput(new Date()) ? (
                                <>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay turnos en el día de hoy</h3>
                                    <p className="text-sm mb-4">No se registran turnos para la fecha seleccionada.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay turnos programados</h3>
                                    <p className="text-sm mb-4">No se encontraron turnos para el período seleccionado ({dateFrom} al {dateTo}).</p>
                                </>
                            )}
                            <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
                                <button onClick={onOpenBooking} className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-700 transition-colors">
                                    <Plus size={16} /> Programar turno
                                </button>
                                <button onClick={handleRefresh} className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 text-sm">
                                    <RefreshCcw size={16} /> Actualizar
                                </button>
                            </div>
                        </div>
                    )}

                    {viewMode === 'list' && !loading && !error && paginatedGroups.map(({ date, items }) => (
                        <div key={date.toISOString()} className="mb-6">
                            <div className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-3 pb-2 border-b border-gray-100">
                                <Calendar size={18} className="text-teal-600" />
                                {fmtDay.format(date)}
                                <span className="bg-teal-100 text-teal-700 px-2 py-1 rounded-full text-xs font-medium">
                                    {items.length} turno{items.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {items.map(ev => {
                                    const start = new Date(ev.start || ev.startTime);
                                    const end = ev.end ? new Date(ev.end) : null;
                                    const title = ev.title || ev.summary || 'Turno';
                                    const who = ev.patientName || ev.paciente || '';
                                    const small = ev.description || ev.location || '';

                                    if (isNaN(start.getTime())) return null;

                                    return (
                                        <div key={ev.id || `${start.toISOString()}-${title}`} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-3 flex-1">
                                                    <div className="mt-1.5 w-3 h-3 rounded-full bg-teal-500 flex-shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium text-teal-700">
                                                                {fmtTime.format(start)}
                                                                {end && !isNaN(end.getTime()) ? ` - ${fmtTime.format(end)}` : ''}
                                                            </span>
                                                            <span className="text-gray-400">-</span>
                                                            <span className="font-medium text-gray-900">{title}</span>
                                                            {ev.notes?.toLowerCase().includes('whatsapp') && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4ade80] text-white tracking-wide">
                                                                    WhatsApp
                                                                </span>
                                                            )}
                                                        </div>
                                                        {who && <div className="text-gray-700 font-medium mb-1">{who}</div>}
                                                        {small && <div className="text-sm text-gray-600">{small}</div>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                                    <button
                                                        onClick={() => onViewTurno?.(ev)}
                                                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                                                        title="Ver detalles del turno"
                                                    >
                                                        <Eye size={16} />
                                                        <span className="hidden sm:inline">Ver</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {viewMode === 'list' && !loading && !error && totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-100 mt-4">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                ← Anterior
                            </button>
                            <span className="text-sm text-gray-500">Página {currentPage} de {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Siguiente →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
