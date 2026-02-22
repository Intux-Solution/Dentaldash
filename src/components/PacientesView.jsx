import React, { useMemo, useState, useEffect } from 'react';
import { norm } from '../utils/helpers';
import SearchInput from './SearchInput';
import PatientTable from './PatientTable';
import { PatientService } from '../services/PatientService';

export default function PacientesView({
  searchTerm,
  setSearchTerm,
  statusFilter = 'Todos',
  setStatusFilter,
  onAddPatient,
  onViewPatient,
  onOpenRecord,
  onDeletePatient,
  patients = [],
  loading = false
}) {
  const collator = useMemo(() => new Intl.Collator('es', { sensitivity: 'base' }), []);

  const [localPatients, setLocalPatients] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchTerm) {
      setLocalPatients(patients);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await PatientService.searchPatients(searchTerm);
        setLocalPatients(results);
      } catch (err) {
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
              onChange={(e) => setStatusFilter?.(e.target.value)}
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
              onChange={(e) => setSearchTerm?.(e.target.value)}
              placeholder="Buscar paciente"
            />
            <button
              onClick={onAddPatient}
              disabled={loading}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>
        </div>

        {(loading || isSearching) ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
            <p className="mt-2 text-gray-500">Cargando pacientes...</p>
          </div>
        ) : (
          <PatientTable
            patients={filteredPacientes}
            onView={onViewPatient}
            onOpenRecord={onOpenRecord}
            onDelete={onDeletePatient}
            showActions={false}
          />
        )}
      </div>
    </div>
  );
}
