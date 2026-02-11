import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar, Clock, User, Phone, CreditCard, MapPin, FileText, Edit, Trash2, Loader, AlertCircle } from 'lucide-react';
import { N8N_ENDPOINTS } from '../config/n8n';
import { apiFetch } from '../utils/api';

export default function TurnoDetailsModal({ open, turno, onClose, onEdit, onDelete }) {
  if (!open || !turno) return null;

  const [showConfirm, setShowConfirm] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [patient, setPatient] = useState(null);

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return { date: 'Sin fecha', time: 'Sin hora' };
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return { date: 'Fecha inválida', time: 'Hora inválida' };
    const dateFormatted = date.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
    const timeFormatted = date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return { date: dateFormatted, time: timeFormatted };
  };

  const getDuration = () => {
    if (!turno.start || !turno.end) return null;
    const start = new Date(turno.start);
    const end = new Date(turno.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    if (diffMinutes < 60) return `${diffMinutes} min`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  };

  const { date, time } = formatDateTime(turno.start || turno.startTime);
  const duration = getDuration();

  // Extract DNI from event data (field or description text)
  const dni = useMemo(() => {
    // Prefer explicit fields from the event
    const explicit = turno.patientDni || turno.dni;
    if (explicit) return String(explicit).replace(/\D/g, '');

    // Robust parsing from description
    const text = String(turno.description || '');
    // 1) Look for "dni: 12.345.678" or "dni 12345678" (case-insensitive)
    const m1 = text.match(/dni\s*[:\-]?\s*([0-9\.\s]+)/i);
    if (m1 && m1[1]) {
      const onlyDigits = String(m1[1]).replace(/\D/g, '');
      if (onlyDigits.length >= 7 && onlyDigits.length <= 9) return onlyDigits;
    }
    // 2) Last resort: any 7–9 digit chunk not part of a longer number
    const m2 = text.match(/(^|\D)(\d{7,9})(?!\d)/);
    if (m2 && m2[2]) return m2[2];

    return '';
  }, [turno]);

  // Extract patient name from description as a fallback (e.g., "Paciente: Juan Pérez Dni: ...")
  const nameFromDescription = useMemo(() => {
    const text = String(turno.description || '');
    // Try to capture between "Paciente:" and "DNI"/"Dni" or end of string
    const m = text.match(/Paciente\s*[:\-]?\s*(.+?)(?=\s*(DNI|Dni|dni)\b|$)/);
    if (m && m[1]) return m[1].trim();
    return '';
  }, [turno]);

  // Fetch patient details by DNI when modal opens
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!open) return;
      if (!dni || dni.length < 7) {
        setPatient(null);
        setPatientError('');
        return;
      }
      setPatientLoading(true);
      setPatientError('');
      try {
        const resp = await apiFetch(`${N8N_ENDPOINTS.CHECK_PATIENT}?dni=${encodeURIComponent(dni)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!aborted) {
          if (data && data.found && data.patient) {
            setPatient(data.patient);
          } else {
            setPatient(null);
          }
        }
      } catch (err) {
        if (!aborted) {
          setPatientError('No se pudo obtener el paciente');
          setPatient(null);
        }
      } finally {
        if (!aborted) setPatientLoading(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [open, dni]);

  const display = useMemo(() => {
    const safe = (v) => (v == null || v === '' ? null : String(v));
    return {
      name: safe(
        patient?.nombre ||
          patient?.name ||
          turno.patientName ||
          turno.paciente ||
          nameFromDescription
      ),
      phone: safe(patient?.telefono || patient?.phone || turno.patientPhone),
      email: safe(patient?.email || turno.patientEmail || turno.email),
      dni: safe(dni),
      obraSocial: safe(patient?.obraSocial || patient?.insurance || turno.obraSocial),
      numeroAfiliado: safe(patient?.numeroAfiliado || patient?.affiliateNumber || turno.numeroAfiliado),
      alergias: safe(patient?.alergias || patient?.allergies || turno.alergias),
      antecedentes: safe(patient?.antecedentes || patient?.background || turno.antecedentes),
    };
  }, [patient, turno, dni, nameFromDescription]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4 overflow-hidden">
        <div className="relative bg-white rounded-2xl shadow-2xl border max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {/* Header */}
          <div className="sticky top-0 z-[1] bg-white/80 backdrop-blur border-b px-6 min-h-[120px] py-10 flex items-center relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-900 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="pr-12">
              <h2 className="text-xl font-semibold text-gray-900">Detalles del Turno</h2>
              {/* Info en una sola línea */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-gray-700 min-w-0 text-sm">
                <div className="flex items-center gap-2 min-w-0 max-w-full bg-[#F5F5F5] rounded-full px-3 py-1">
                  <Calendar size={14} />
                  <span className="capitalize truncate">{date}</span>
                </div>
                <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-full px-3 py-1">
                  <Clock size={14} />
                  <span>{time} hs</span>
                </div>
                {duration && (
                  <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-full px-3 py-1">
                    <span>({duration})</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-6">
            {/* Información Principal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Paciente */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Información del Paciente</h3>

                {patientLoading && (
                  <div className="flex items-start gap-3 text-gray-500 text-sm">
                    <Loader className="mt-0.5 animate-spin" size={16} />
                    Buscando paciente por DNI...
                  </div>
                )}

                {!patientLoading && patientError && (
                  <div className="flex items-start gap-2 text-red-600 text-sm">
                    <AlertCircle size={16} />
                    {patientError}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <User className="text-gray-400 mt-1" size={16} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {display.name || 'Sin nombre'}
                    </p>
                    <p className="text-sm text-gray-500">Paciente</p>
                  </div>
                </div>

                {display.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="text-gray-400 mt-1" size={16} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{display.phone}</p>
                      <p className="text-sm text-gray-500">Teléfono</p>
                    </div>
                  </div>
                )}

                {display.dni && (
                  <div className="flex items-start gap-3">
                    <CreditCard className="text-gray-400 mt-1" size={16} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{display.dni}</p>
                      <p className="text-sm text-gray-500">DNI</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Turno */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Información del Turno</h3>

                <div className="flex items-start gap-3">
                  <div className="w-6 flex-shrink-0 flex justify-center">
                    <Calendar className="text-gray-400 mt-1" size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {turno.title || turno.summary || turno.tipoTurnoNombre || 'Consulta'}
                    </p>
                    <p className="text-sm text-gray-500">Tipo de consulta</p>
                  </div>
                </div>

                {turno.location && (
                  <div className="flex items-start gap-3">
                    <div className="w-6 flex-shrink-0 flex justify-center">
                      <MapPin className="text-gray-400 mt-1" size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{turno.location}</p>
                      <p className="text-sm text-gray-500">Ubicación</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-6 flex-shrink-0 flex justify-center">
                    <div
                      className={`w-2.5 h-2.5 mt-2 rounded-full ${
                        turno.status === 'confirmed' ? 'bg-teal-600' : 'bg-yellow-500'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {turno.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                    </p>
                    <p className="text-sm text-gray-500">Estado</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Descripción/Notas */}
            {turno.description && (
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2 mb-4">Notas</h3>
                <div className="bg-[#F5F5F5] rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="text-gray-400 mt-1" size={16} />
                    <p className="text-sm text-gray-700 leading-relaxed">{turno.description}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Información Médica */}
            {(turno.alergias || turno.antecedentes || turno.obraSocial) && (
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2 mb-4">Información Médica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {turno.alergias && (
                    <div className="bg-[#F5F5F5] rounded-xl p-3">
                      <p className="text-sm font-medium text-gray-800">Alergias</p>
                      <p className="text-sm text-gray-700">{turno.alergias}</p>
                    </div>
                  )}
                  {turno.antecedentes && (
                    <div className="bg-[#F5F5F5] rounded-xl p-3">
                      <p className="text-sm font-medium text-gray-800">Antecedentes</p>
                      <p className="text-sm text-gray-700">{turno.antecedentes}</p>
                    </div>
                  )}
                  {turno.obraSocial && (
                    <div className="bg-[#F5F5F5] rounded-xl p-3 md:col-span-2">
                      <p className="text-sm font-medium text-gray-800">Obra Social</p>
                      <p className="text-sm text-gray-700">
                        {turno.obraSocial}
                        {turno.numeroAfiliado && ` - N° ${turno.numeroAfiliado}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
              <button
                onClick={() => setShowConfirm(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl transition-colors"
              >
                <Trash2 size={16} />
                Cancelar
              </button>
              <button
                onClick={() => onEdit && onEdit(turno)}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl transition-colors"
              >
                <Edit size={16} />
                Editar Turno
              </button>
            </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancelar turno</h3>
            <p className="text-sm text-gray-600 mb-6">¿Confirmás la cancelación de este turno? Esta acción no se puede deshacer.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={() => { setShowConfirm(false); onDelete && onDelete(turno); }}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Cancelar turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
