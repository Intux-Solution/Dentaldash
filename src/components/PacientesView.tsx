import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { norm } from '../utils/helpers';
import SearchInput from './SearchInput';
import PatientTable from './PatientTable';
import { PatientService } from '../services/PatientService';
import { ExportService } from '../services/ExportService';
import { usePatients } from '../hooks/usePatients';
import { useModals } from '../hooks/useModals';
import { useSubscription } from '../context/SubscriptionContext';

export default function PacientesView() {
    const { patients, loading: patientsLoading, deletePatient } = usePatients();
    const { openAddPatient, onViewPatient, onOpenRecord } = useModals();
    const { canUse } = useSubscription();

    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get('q') || '';
    const statusFilter = searchParams.get('status') || 'Todos';

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

    const [localPatients, setLocalPatients] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!searchTerm) {
            setLocalPatients(Array.isArray(patients) ? patients : []);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await PatientService.searchPatients(searchTerm);
                setLocalPatients(results);
            } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
                console.error("Error searching patients:", err);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, patients]);

    const filteredPacientes = useMemo(() => {
        const term = norm(searchTerm || '');
        return localPatients
            .filter((p) => {
                const matchesSearch = term ? (norm(p?.nombre || '').includes(term) || norm(String(p?.dni || '')).includes(term)) : true;
                const matchesStatus = statusFilter === 'Todos'
                    ? (p?.estado !== 'Inactivo')
                    : (p?.estado === statusFilter);
                return matchesSearch && matchesStatus;
            })
            .slice()
            .sort((a, b) => collator.compare(a?.nombre || '', b?.nombre || ''));
    }, [searchTerm, statusFilter, localPatients, collator]);

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
                                onClick={() => ExportService.exportPatientsCSV(filteredPacientes)}
                                disabled={patientsLoading || filteredPacientes.length === 0}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                            >
                                Exportar CSV
                            </button>
                        )}
                        <button
                            onClick={openAddPatient}
                            disabled={patientsLoading || isSearching}
                            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Agregar
                        </button>
                    </div>
                </div>

                {(patientsLoading || isSearching) ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
                        <p className="mt-2 text-gray-500">Cargando pacientes...</p>
                    </div>
                ) : (
                    <PatientTable
                        patients={filteredPacientes}
                        onView={onViewPatient}
                        onOpenRecord={onOpenRecord}
                        onDelete={deletePatient}
                        showActions={false}
                    />
                )}
            </div>
        </div>
    );
}
