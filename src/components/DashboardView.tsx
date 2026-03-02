import React, { useCallback } from 'react';
import { Eye, ArrowRight, Calendar, RefreshCcw, User } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { useModals } from '../hooks/useModals';
import { useAppStore } from '../store/useAppStore';
import { useTurnos } from '../hooks/useTurnos';
import { useAuth } from '../context/AuthContext';
import { usePatients } from '../hooks/usePatients';
import StatsCard from './StatsCard';
import SearchInput from './SearchInput';
import PatientTable from './PatientTable';
import { Link } from 'react-router-dom';

export default function DashboardView() {
    const {
        openAddPatient,
        onViewPatient,
        onOpenRecord,
        openBookingModal,
        onViewTurno
    } = useModals();

    const dashboardSearchTerm = useAppStore(state => state.dashboardSearchTerm);
    const setDashboardSearchTerm = useAppStore(state => state.setDashboardSearchTerm);
    const dashboardStatusFilter = useAppStore(state => state.dashboardStatusFilter);
    const setDashboardStatusFilter = useAppStore(state => state.setDashboardStatusFilter);

    const { session } = useAuth();
    const { turnos, loading: turnosIsLoading, error: turnosError } = useTurnos(null, null, session);

    const { patients: latestPatients, loading: patientsLoading } = usePatients(
        null,
        1,
        4,
        dashboardSearchTerm,
        dashboardStatusFilter
    );

    const {
        turnosHoy,
        turnosSemana,
        nextTurnos,
        loadingStats
    } = useDashboardData(
        turnos,
        turnosIsLoading
    );

    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => setDashboardSearchTerm(e.target.value),
        [setDashboardSearchTerm]
    );

    const showViewAll = !(dashboardSearchTerm || '').trim() && latestPatients.length > 0;

    return (
        <div className="p-4 lg:p-8 bg-gray-50 min-h-screen">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
                <StatsCard
                    title="Turnos de Hoy"
                    value={loadingStats ? "..." : turnosHoy}
                    color="text-teal-600"
                />
                <StatsCard
                    title="Turnos esta Semana"
                    value={loadingStats ? "..." : turnosSemana}
                    color="text-teal-600"
                />
            </div>

            <div className="space-y-6 lg:space-y-8">
                {/* Próximos Turnos */}
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-4 lg:p-6 border-b flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-800">Próximos Turnos</h2>
                            <Link
                                to="/turnos"
                                className="inline-flex items-center text-teal-600 hover:text-teal-700 text-sm font-medium"
                            >
                                Ver todos
                                <ArrowRight size={16} className="ml-1" />
                            </Link>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={openBookingModal}
                                className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Calendar size={14} />
                                Nuevo
                            </button>
                        </div>
                    </div>

                    <div className="p-4 lg:p-6">
                        {loadingStats && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                                <RefreshCcw size={16} className="animate-spin" />
                                Cargando turnos...
                            </div>
                        )}

                        {!loadingStats && turnosError && (
                            <div className="p-4 rounded-lg border text-sm bg-red-50 text-red-900 border-red-200 mb-4">
                                {String(turnosError)}
                            </div>
                        )}

                        {!loadingStats && !turnosError && nextTurnos.length === 0 && (
                            <div className="text-center py-6 text-gray-600">
                                <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No hay turnos programados para los próximos días</p>
                                <button
                                    onClick={openBookingModal}
                                    className="inline-flex items-center gap-1 mt-2 text-teal-600 hover:text-teal-700 text-sm"
                                >
                                    <Calendar size={14} />
                                    Agendar turno
                                </button>
                            </div>
                        )}

                        {!loadingStats && nextTurnos.length > 0 && (
                            <div className="space-y-4">
                                {nextTurnos.map((turno) => (
                                    <div key={turno.id} className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 py-3 border-b border-gray-100 last:border-b-0">
                                        <div className="flex items-center space-x-4">
                                            <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0" />
                                            <div>
                                                <p className="text-sm text-gray-500 capitalize">{turno.fecha}</p>
                                                <p className="text-sm text-gray-500">{turno.hora}</p>
                                            </div>
                                        </div>
                                        <div className="flex-1 sm:ml-4">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-gray-900">{turno.titulo}</p>
                                                {turno.raw?.notes?.toLowerCase().includes('whatsapp') && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4ade80] text-white tracking-wide">
                                                        WhatsApp
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500">{turno.descripcion}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="text-gray-400 hover:text-gray-600"
                                                onClick={() => onViewTurno?.(turno.raw)}
                                                title="Ver detalles del turno"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Últimos Pacientes */}
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-4 lg:p-6 border-b flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-800">
                                Últimos pacientes
                            </h2>
                            {showViewAll && (
                                <Link
                                    to="/pacientes"
                                    className="inline-flex items-center text-teal-600 hover:text-teal-700 text-sm font-medium"
                                >
                                    Ver todos
                                    <ArrowRight size={16} className="ml-1" />
                                </Link>
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                            <select
                                value={dashboardStatusFilter}
                                onChange={(e) => setDashboardStatusFilter(e.target.value)}
                                className="rounded-xl border border-transparent bg-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent min-w-[120px]"
                            >
                                <option value="Todos">Todos</option>
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                                <option value="En Tratamiento">En Tratamiento</option>
                                <option value="Alta">Alta</option>
                            </select>
                            <SearchInput
                                value={dashboardSearchTerm}
                                onChange={handleSearchChange}
                                placeholder="Buscar paciente"
                            />
                            <button
                                onClick={openAddPatient}
                                disabled={patientsLoading}
                                className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <User size={14} />
                                Nuevo
                            </button>
                        </div>
                    </div>

                    {patientsLoading ? (
                        <div className="p-8 text-center">
                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
                        </div>
                    ) : (
                        <PatientTable
                            patients={latestPatients}
                            onView={onViewPatient}
                            onOpenRecord={onOpenRecord}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
