import React, { useEffect, useState } from 'react';
import ModalShell from './ModalShell';
import { User, Hash, Phone, Building2, FileText, AlertTriangle, Activity, Stethoscope } from 'lucide-react';
import { initials } from '../utils/helpers';

export default function PatientProfileModal({ open, patient, onClose, onEdit, onDelete, onMessage }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Limpiar estados cuando se cierra el modal
    if (!open) {
      setShowConfirm(false);
      setDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showConfirm) {
          setShowConfirm(false);
          setDeleting(false);
        } else {
          onClose();
        }
      }
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, showConfirm]);

  if (!open || !patient) return null;

  // Helper para obtener campos con múltiples posibles nombres
  const getField = (p, fieldNames, defaultValue = '-') => {
    if (!p) return defaultValue;
    for (const fieldName of fieldNames) {
      const value = p[fieldName] ?? p.fields?.[fieldName];
      if (value != null && value !== '') return String(value);
    }
    return defaultValue;
  };

  // Obtener todos los campos normalizados
  const nombre = getField(patient, ['nombre', 'name'], 'Sin nombre');
  const dni = getField(patient, ['dni', 'DNI', 'Dni']);
  const telefono = getField(patient, ['telefono', 'phone', 'Telefono']);
  const email = getField(patient, ['email', 'Email', 'correo', 'mail'], '-');
  const obraSocial = getField(patient, ['obraSocial', 'obra_social', 'ObraSocial', 'Obra Social']);
  const numeroAfiliado = getField(patient, ['numeroAfiliado', 'Numero Afiliado', 'Número Afiliado', 'numero_afiliado']);
  const alergias = getField(patient, ['alergias', 'alergia', 'Alergias', 'allergies'], 'Ninguna');
  const antecedentes = getField(patient, ['antecedentes', 'Antecedentes', 'medical_history'], 'Ninguno');
  const historiaClinicaUrl = getField(patient, ['historiaClinicaUrl', 'historia_clinica', 'Historia Clinica'], 'Sin archivo');
  const estado = getField(patient, ['estado', 'Estado', 'status'], 'Activo');
  const notas = getField(patient, ['notas', 'Notas', 'notes', 'observaciones'], 'Sin notas');

  // Estado con colores
  const getEstadoColor = (estado) => {
    const estadoLower = estado.toLowerCase();
    if (estadoLower.includes('activo')) return 'bg-green-100 text-green-800';
    if (estadoLower.includes('tratamiento')) return 'bg-blue-100 text-blue-800';
    if (estadoLower.includes('alta')) return 'bg-purple-100 text-purple-800';
    if (estadoLower.includes('inactivo')) return 'bg-gray-100 text-gray-800';
    return 'bg-gray-100 text-gray-800';
  };

  function handleDeleteClick() {
    setShowConfirm(true);
  }

  async function confirmDelete() {
    if (!onDelete || !patient || deleting) return;
    
    try {
      setDeleting(true);
      await onDelete(patient);
      setShowConfirm(false);
      setDeleting(false);
      onClose?.();
    } catch (e) {
      setDeleting(false);
      alert(`Error al eliminar: ${e.message || 'Intente nuevamente'}`);
    }
  }

  const InfoRow = ({ icon: Icon, label, value, className = '' }) => (
    <div className="flex items-start py-2 gap-3">
      <div className="flex items-center min-w-[120px] text-sm font-medium text-gray-600">
        <Icon size={16} className="mr-2 text-gray-500" />
        {label}:
      </div>
      <div className={`text-sm text-gray-900 break-words min-w-0 ${className}`}>
        {value}
      </div>
    </div>
  );

  // Render link label for Historia Clínica (avoid long URL overflow)
  const historiaClinicaValue = (() => {
    const url = historiaClinicaUrl;
    const invalid = !url || url === '-' || url === 'Sin archivo';
    if (invalid) return 'Sin archivo';
    // If it doesn't look like a URL, just show the text as fallback
    const looksLikeUrl = /^https?:\/\//i.test(url);
    if (!looksLikeUrl) return url;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-600 underline hover:text-emerald-700"
      >
        Enlace
      </a>
    );
  })();

  if (showConfirm) {
    return (
      <ModalShell title="Confirmar Eliminación" onClose={() => setShowConfirm(false)}>
        <div className="py-4">
          <p className="text-gray-700 mb-4">
            ¿Estás seguro de que deseas eliminar a <strong>{nombre}</strong>?
          </p>
          <p className="text-sm text-red-600 mb-6">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Perfil del Paciente"
      onClose={onClose}
      footer={(
        <div className="flex gap-3">
          {onMessage && (
            <button
              type="button"
              className="hidden sm:flex items-center justify-center h-12 px-6 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-base"
              onClick={() => onMessage && onMessage(patient)}
            >
              Mensaje
            </button>
          )}
          <button
            type="button"
            className="flex-1 h-12 px-6 rounded-xl bg-red-600 text-white hover:bg-red-700 text-base font-semibold"
            onClick={handleDeleteClick}
          >
            Eliminar
          </button>
          <button
            className="flex-1 h-12 px-6 rounded-xl bg-teal-600 text-white hover:bg-emerald-700 text-base font-semibold"
            onClick={() => onEdit && onEdit(patient)}
          >
            Editar
          </button>
        </div>
      )}
    >
      <div className="py-6 overflow-x-hidden">
        
        {/* Header con avatar y nombre */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-28 h-28 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-600 text-2xl font-semibold mb-4">
            {initials(nombre)}
          </div>
          <div className="text-xl font-semibold text-gray-900">{nombre}</div>
          <div className="text-sm text-gray-500">{obraSocial}</div>
          <div className="mt-2">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getEstadoColor(estado)}`}>
              {estado}
            </span>
          </div>
        </div>

        <hr className="my-6" />

        {/* Información del paciente */}
        <div className="space-y-1">
          
          {/* 1. Nombre */}
          <InfoRow 
            icon={User} 
            label="Nombre" 
            value={nombre} 
          />

          {/* 2. DNI */}
          <InfoRow 
            icon={Hash} 
            label="DNI" 
            value={dni} 
          />

          {/* 3. Teléfono */}
          <InfoRow 
            icon={Phone} 
            label="Teléfono" 
            value={telefono} 
          />

          {/* 3b. Email */}
          <InfoRow 
            icon={FileText} 
            label="Email" 
            value={email} 
          />

          {/* 4. Obra Social */}
          <InfoRow 
            icon={Building2} 
            label="Obra Social" 
            value={obraSocial} 
          />

          {/* 5. Número de Afiliado */}
          <InfoRow 
            icon={Hash} 
            label="N° de Afiliado" 
            value={numeroAfiliado} 
          />

          {/* 6. Alergias */}
          <InfoRow 
            icon={AlertTriangle} 
            label="Alergias" 
            value={alergias} 
            className={alergias !== 'Ninguna' && alergias !== '-' ? 'text-red-600 font-medium' : ''}
          />

          {/* 7. Antecedentes */}
          <InfoRow 
            icon={Stethoscope} 
            label="Antecedentes" 
            value={antecedentes} 
          />

          {/* 8. Historia Clínica */}
          <InfoRow 
            icon={FileText} 
            label="Historia Clínica" 
            value={historiaClinicaValue} 
          />

          {/* 9. Estado */}
          <InfoRow 
            icon={Activity} 
            label="Estado" 
            value={
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getEstadoColor(estado)}`}>
                {estado}
              </span>
            } 
          />

          {/* 10. Notas */}
          {notas && notas !== '-' && notas !== 'Sin notas' && (
            <div className="pt-4 border-t mt-4">
              <div className="flex items-start">
                <div className="flex items-center min-w-[120px] text-sm font-medium text-gray-600">
                  <FileText size={16} className="mr-2 text-gray-500" />
                  Notas:
                </div>
              </div>
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                {notas}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
