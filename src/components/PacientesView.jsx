import React, { useMemo } from 'react';
import { norm } from '../utils/helpers';
import SearchInput from './SearchInput';
import PatientTable from './PatientTable';

export default function PacientesView({
  searchTerm,
  setSearchTerm,
  onAddPatient,
  onViewPatient,
  onOpenRecord,
  onDeletePatient,
  patients = [],
  loading = false
}) {
  const collator = useMemo(() => new Intl.Collator('es', { sensitivity: 'base' }), []);
  const filteredPacientes = useMemo(() => {
    const term = norm(searchTerm || '');
    return patients
      .filter((p) => norm(p?.nombre || '').includes(term))
      .slice()
      .sort((a, b) => collator.compare(a?.nombre || '', b?.nombre || ''));
  }, [searchTerm, patients, collator]);

  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 lg:p-6 border-b flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
          <h2 className="text-lg font-semibold text-gray-800">
            Pacientes
          </h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
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
        
        {loading ? (
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
