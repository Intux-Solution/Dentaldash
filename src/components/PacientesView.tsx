import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchInput from './SearchInput';
import PatientTable from './PatientTable';
import { ExportService } from '../services/ExportService';
import { usePatients } from '../hooks/usePatients';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePatientModals } from '../hooks/usePatientModals';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

/**
 * Ventana de resultados. Con el filtrado resuelto en el servidor el tope aplica
 * por filtro, no sobre el total de pacientes del consultorio.
 */
const PAGE_SIZE = 300;

export default function PacientesView() {
    const { session } = useAuth();
    const { openAddPatient, onViewPatient, onOpenRecord, handleDeletePatient } = usePatientModals();
    const { canUse } = useSubscription();

    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get('q') || '';
    const statusFilter = searchParams.get('status') || 'Todos';

    // Solo se retrasa el valor que alimenta el queryKey: la URL y el input se
    // actualizan en cada tecla. `statusFilter` viene de un <select>, donde cada
    // cambio es una intención completa y no necesita debounce.
    const debouncedSearch = useDebouncedValue(searchTerm, 400);

    // El filtrado (búsqueda por nombre/DNI y estado) lo resuelve el servidor en
    // `PatientService.fetchPatientsPaginated`. Antes se hacía dos veces —una en la
    // DB y otra en el cliente— con criterios distintos, lo que hacía imposible,
    // por ejemplo, encontrar un paciente inactivo.
    const { patients, loading, isFetching, pagination } = usePatients(
        session,
        1,
        PAGE_SIZE,
        debouncedSearch.trim(),
        statusFilter
    );

    const setSearchTerm = (term: string) => {
        setSearchParams(prev => {
            if (term) prev.set('q', term);
            else prev.delete('q');
            return prev;
        }, { replace: true });
    };

    const setStatusFilter = (status: string) => {
        setSearchParams(prev => {
            if (status !== 'Todos') prev.set('status', status);
            else prev.delete('status');
            return prev;
        }, { replace: true });
    };

    const collator = useMemo(() => new Intl.Collator('es', { sensitivity: 'base' }), []);

    // Único trabajo que queda del lado del cliente: el servidor ordena por
    // `created_at desc`, que no es un orden útil para una tabla de nombres.
    const sortedPacientes = useMemo(
        () => [...patients].sort((a, b) => collator.compare(a?.nombre || '', b?.nombre || '')),
        [patients, collator]
    );

    return (
        <div className="p-4 lg:p-8 bg-gray-50 min-h-screen">
            <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 lg:p-6 border-b flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Pacientes
                    </h2>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="rounded-xl border border-transparent bg-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent mr-2 min-w-[120px]"
                        >
                            <option value="Todos">Todos</option>
                            <option value="Activo">Activo</option>
                            <option value="Inactivo">Inactivo</option>
                            <option value="En Tratamiento">En Tratamiento</option>
                            <option value="Alta">Alta</option>
                        </select>
                        <SearchInput
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar paciente"
                        />
                        {canUse('export_data') && (
                            <button
                                onClick={() => ExportService.exportPatientsCSV(sortedPacientes)}
                                disabled={loading || sortedPacientes.length === 0}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                            >
                                Exportar CSV
                            </button>
                        )}
                        <button
                            onClick={openAddPatient}
                            disabled={loading}
                            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Agregar
                        </button>
                    </div>
                </div>

                {/*
                  Solo la carga inicial reemplaza la tabla por el spinner. Los
                  refetches (cambio de filtro, invalidación tras una mutación)
                  atenúan la tabla pero no la desmontan: `PatientTable` guarda en
                  estado local el diálogo de confirmación de borrado.
                */}
                {loading && sortedPacientes.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
                        <p className="mt-2 text-gray-500">Cargando pacientes...</p>
                    </div>
                ) : (
                    <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                        <PatientTable
                            patients={sortedPacientes}
                            onView={onViewPatient}
                            onOpenRecord={onOpenRecord}
                            onDelete={handleDeletePatient}
                            showActions={false}
                        />
                        {pagination.total > sortedPacientes.length && (
                            <p className="px-4 py-3 text-xs text-gray-500 border-t">
                                Mostrando {sortedPacientes.length} de {pagination.total}. Refiná la búsqueda para ver el resto.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
