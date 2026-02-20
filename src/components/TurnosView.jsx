// src/components/TurnosView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, RefreshCcw, Plus, Eye } from 'lucide-react';
import { useTurnos } from '../hooks/useTurnos';

const fmtDay = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

function groupByDate(events) {
  const by = {};
  for (const ev of events) {
    const dayKey = (ev.start || ev.startTime || ev.startDate || ev.start_at);
    if (!dayKey) continue; // Skip events without start time

    const d = new Date(dayKey);
    if (isNaN(d.getTime())) continue; // Skip invalid dates

    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    if (!by[key]) by[key] = [];
    by[key].push(ev);
  }
  // ordenar por hora
  for (const k of Object.keys(by)) {
    by[k].sort((a, b) => {
      const startA = new Date(a.start || a.startTime);
      const startB = new Date(b.start || b.startTime);
      return startA - startB;
    });
  }
  return Object.keys(by).sort().map(k => ({ date: new Date(k), items: by[k] }));
}

// Función helper para formatear fecha local a YYYY-MM-DD (input type="date")
const formatDateForInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Fechas por defecto: hoy hasta 7 días después
const getDefaultDates = () => {
  const today = new Date();
  const next7Days = new Date();
  next7Days.setDate(today.getDate() + 7);
  return {
    from: formatDateForInput(today),
    to: formatDateForInput(next7Days),
  };
};

export default function TurnosView({ onOpenBooking, onViewTurno }) {
  // Fechas por defecto (2 semanas desde el lunes de esta semana)
  const defaultDates = useMemo(() => getDefaultDates(), []);

  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);

  // Usar el hook de turnos con las fechas seleccionadas
  const { turnos: events, loading, error, refreshTurnos } = useTurnos(dateFrom, dateTo);

  const grouped = useMemo(() => groupByDate(events), [events]);

  const handleDateFromChange = (e) => {
    const newFromDate = e.target.value;
    setDateFrom(newFromDate);

    // Si la fecha "desde" es posterior a "hasta", ajustar "hasta"
    if (newFromDate && dateTo && new Date(newFromDate) > new Date(dateTo)) {
      setDateTo(newFromDate); // Alinear a la misma fecha
    }
  };

  const handleDateToChange = (e) => {
    const newToDate = e.target.value;
    setDateTo(newToDate);

    // Si la fecha "hasta" es anterior a "desde", ajustar "desde"
    if (newToDate && dateFrom && new Date(newToDate) < new Date(dateFrom)) {
      setDateFrom(newToDate); // Alinear a la misma fecha
    }
  };

  const handleRefresh = () => {
    refreshTurnos(dateFrom, dateTo);
  };

  // Presets
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

  // Escuchar pedido global de refresco (ej. después de cancelar turno desde otro modal)
  useEffect(() => {
    const handler = () => refreshTurnos(dateFrom, dateTo);
    window.addEventListener('turnos:refresh', handler);
    return () => window.removeEventListener('turnos:refresh', handler);
  }, [refreshTurnos, dateFrom, dateTo]);

  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border">
        {/* Header */}
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
          </div>

          {/* Filtros de fecha y Botones */}
          <div className="flex flex-col xl:flex-row xl:items-end gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 flex-grow max-w-xl">
              {/* Desde */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={handleDateFromChange}
                  className="w-full h-10 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Hasta */}
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

            {/* Fila de botones con mismo tamaño */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-grow items-end">
              <button
                onClick={applyPresetToday}
                className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200"
              >
                Hoy
              </button>
              <button
                onClick={applyPresetTomorrow}
                className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200"
              >
                Mañana
              </button>
              <button
                onClick={applyPresetNext7Days}
                className="w-full h-10 inline-flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors font-medium border border-gray-200"
              >
                Próximos Turnos
              </button>
              <button
                onClick={onOpenBooking}
                className="w-full h-10 inline-flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nuevo turno</span><span className="sm:hidden">Nuevo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-4 lg:p-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
              <RefreshCcw size={16} className="animate-spin" />
              Cargando turnos del {dateFrom} al {dateTo}...
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-lg border text-sm bg-red-50 text-red-900 border-red-200 mb-4">
              {error}
              <button
                onClick={handleRefresh}
                className="ml-2 underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && grouped.length === 0 && (
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
                <button
                  onClick={onOpenBooking}
                  className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-700 transition-colors"
                >
                  <Plus size={16} /> Programar turno
                </button>
                <button
                  onClick={handleRefresh}
                  className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 text-sm"
                >
                  <RefreshCcw size={16} /> Actualizar
                </button>
              </div>
            </div>
          )}

          {!loading && !error && grouped.map(({ date, items }) => (
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

                  // Validar que la fecha sea válida
                  if (isNaN(start.getTime())) {
                    return null;
                  }

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
                            {who && (
                              <div className="text-gray-700 font-medium mb-1">{who}</div>
                            )}
                            {small && (
                              <div className="text-sm text-gray-600">{small}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                          <button
                            onClick={() => onViewTurno && onViewTurno(ev)}
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
        </div>
      </div>
    </div>
  );
}
