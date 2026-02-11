import React, { useState, useEffect } from 'react';
import { Eye, XCircle } from 'lucide-react';

export default React.memo(function PatientTable({ patients, onView, onOpenRecord, onDelete, showActions = false }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (pendingDelete && !patients.find(p => p.id === pendingDelete.id)) {
      setPendingDelete(null);
      setIsDeleting(false);
    }
  }, [patients, pendingDelete]);

  async function confirmDelete() {
    if (!pendingDelete || !onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-3 lg:p-4 text-sm font-medium text-gray-700 whitespace-nowrap">Nombre</th>
            <th className="text-left p-3 lg:p-4 text-sm font-medium text-gray-700 whitespace-nowrap">Obra Social</th>
            <th className="text-left p-3 lg:p-4 text-sm font-medium text-gray-700 whitespace-nowrap">Historia Clínica</th>
            <th className="text-left p-3 lg:p-4 text-sm font-medium text-gray-700 whitespace-nowrap">Telefono</th>
            {showActions && (
              <th className="text-right p-3 lg:p-4 text-sm font-medium text-gray-700 whitespace-nowrap">Acciones</th>
            )}
          </tr>
        </thead>
        <tbody>
          {patients.map((paciente) => (
            <tr key={paciente.id} className="group border-b hover:bg-gray-50">
              <td className="p-3 lg:p-4 text-sm whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onView && onView(paciente)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView && onView(paciente); } }}
                  className="p-0 m-0 bg-transparent text-left text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-sm cursor-pointer"
                  aria-label={`Ver perfil de ${paciente.nombre}`}
                >
                  {paciente.nombre}
                </button>
              </td>

              <td className="p-3 lg:p-4 text-sm text-blue-600 whitespace-nowrap">{paciente.obraSocial}</td>

              <td className="p-3 lg:p-4 text-sm whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onOpenRecord && onOpenRecord({
                    ...paciente,
                    historiaUrl: paciente.historiaClinica || paciente.historiaClinicaUrl || paciente.odontogramaUrl || paciente.historiaUrl || ''
                  })}
                  className="text-teal-600 hover:underline font-medium"
                  aria-label={`Abrir historia clínica de ${paciente.nombre}`}
                >
                  Abrir
                </button>
              </td>

              <td className="p-3 lg:p-4 text-sm text-gray-900 whitespace-nowrap">{paciente.telefono || '—'}</td>

              {showActions && (
                <td className="p-3 lg:p-4">
                  <div className="flex justify-end items-center gap-2 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      className="inline-flex items-center rounded-md p-1.5 text-gray-600 hover:text-green-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300"
                      onClick={() => onView && onView(paciente)}
                      aria-label={`Ver perfil de ${paciente.nombre}`}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="inline-flex items-center rounded-md p-1.5 text-gray-600 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-300"
                      onClick={() => setPendingDelete(paciente)}
                      aria-label={`Eliminar ${paciente.nombre}`}
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-center text-red-600 mb-3">
              <XCircle size={40} />
            </div>
            <h3 className="text-center text-gray-900 font-semibold mb-2">¿Eliminar paciente?</h3>
            <p className="text-center text-gray-600 text-sm mb-6">
              ¿Estás seguro de eliminar a <span className="font-medium">{pendingDelete?.nombre}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setPendingDelete(null); setIsDeleting(false); }}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={isDeleting}
              >
                No, cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
