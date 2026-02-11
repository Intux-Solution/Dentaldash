import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader, X, ArrowLeft } from 'lucide-react';
import { N8N_ENDPOINTS } from '../config/n8n';
import { apiFetch } from '../utils/api';
import './loader-spin.css';
import { APPOINTMENT_TYPES, WORK_DAYS } from '../config/appointments';
import { combineDateTimeToISO, to24h } from '../utils/appointments';

// ...existing code...

export default function EditTurnoModal({ open, turno, onClose, onSaved, onDeleted, onBack }) {
  const [formData, setFormData] = useState({
    id: '',
    dni: '',
    nombre: '',
    telefono: '',
    email: '',
    obraSocial: '',
    numeroAfiliado: '',
    alergias: '',
    antecedentes: '',
    tipoTurno: '',
    fecha: '',
    hora: '',
    notas: ''
  });

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkingPatient, setCheckingPatient] = useState(false);
  const [patientFound, setPatientFound] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Evita borrar el turno más de una vez al abrir el modal
  const freedRef = useRef(false);

  // Obtener horarios disponibles (puede excluir el turno actual)
  const getAvailableSlots = useCallback(async (fecha, tipoTurno, excludeId) => {
    if (!fecha || !tipoTurno) return;

    setLoadingAvailability(true);

    try {
      const appointmentType = APPOINTMENT_TYPES.find(t => t.id === tipoTurno);

      const params = new URLSearchParams({
        fecha,
        duration: String(appointmentType?.duration || 30),
      });

      const effectiveExclude = excludeId || formData.id;
      if (effectiveExclude) {
        const keys = ['excludeId', 'excludeEventId', 'exclude', 'ignoreId', 'ignoreEventId'];
        keys.forEach((k) => params.append(k, effectiveExclude));
      }

      const response = await apiFetch(`${N8N_ENDPOINTS.GET_AVAILABILITY}?${params.toString()}`);
      const data = await response.json();
      const raw = Array.isArray(data?.availableSlots) ? data.availableSlots : [];

      // Normalizar a 24h, quitar duplicados y ordenar
      const unique = Array.from(new Set(raw.map(to24h))).sort();
      setAvailableSlots(unique);
    } catch (err) {
      setAvailableSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  }, [formData.id]);

  // Inicializar formulario cuando se abre el modal
  useEffect(() => {
    if (open && turno) {

      const startDate = turno.start || turno.startTime;
      let fecha = '', hora = '';
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) {
          fecha = d.toISOString().split('T')[0];
          hora = d.toTimeString().slice(0, 5);
        }
      }

      const tipoTurno = (APPOINTMENT_TYPES.find(type =>
        (turno.title || '').toLowerCase().includes(type.name.toLowerCase()) ||
        (turno.summary || '').toLowerCase().includes(type.name.toLowerCase()) ||
        (turno.tipoTurnoNombre || '').toLowerCase().includes(type.name.toLowerCase())
      ) || {}).id || '';

      // Obtener DNI: usar campo explícito o parsear de la descripción
      let dniInicial = turno.patientDni || turno.dni || '';
      if (!dniInicial) {
        const text = String(turno.description || '');
        const m1 = text.match(/dni\s*[:\-]?\s*([0-9\.\s]+)/i);
        if (m1 && m1[1]) {
          dniInicial = String(m1[1]).replace(/\D/g, '');
        } else {
          const m2 = text.match(/(^|\D)(\d{7,9})(?!\d)/);
          if (m2 && m2[2]) dniInicial = m2[2];
        }
      }
      // Normalizar a solo dígitos
      dniInicial = String(dniInicial || '').replace(/\D/g, '');

      // Nombre desde descripción como fallback
      const nombreDesdeDescripcion = (() => {
        const text = String(turno.description || '');
        const m = text.match(/Paciente\s*[:\-]?\s*(.+?)(?=\s*(DNI|Dni|dni)\b|$)/);
        return m && m[1] ? m[1].trim() : '';
      })();

      const idTurno = turno.id || turno.eventId || turno._id || '';

      setFormData({
        id: idTurno,
        dni: dniInicial,
        nombre: turno.patientName || turno.paciente || nombreDesdeDescripcion || '',
        telefono: turno.patientPhone || turno.telefono || '',
        email: turno.patientEmail || turno.email || '',
        obraSocial: turno.obraSocial || '',
        numeroAfiliado: turno.numeroAfiliado || '',
        alergias: turno.alergias || '',
        antecedentes: turno.antecedentes || '',
        tipoTurno,
        fecha,
        hora,
        notas: turno.description || turno.notas || ''
      });

      // Aún no sabemos si existe en base; esperar resultado de checkPatient
      setPatientFound(false);
      setError('');

      // Traer datos del paciente automáticamente al abrir si hay DNI
      if (dniInicial) {
        checkPatient(dniInicial);
      }

      // Liberar turno actual solo una vez para que el horario quede disponible
      const freeAndLoad = async () => {
        if (idTurno && !freedRef.current) {
          try {
            await apiFetch(N8N_ENDPOINTS.DELETE_APPOINTMENT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: idTurno,
                reason: 'Liberado para reprogramar',
                canceledAt: new Date().toISOString(),
              }),
            });
            freedRef.current = true;
          } catch (e) {
            // Si falla el delete, continuamos pero avisamos
            console.error('No se pudo liberar el turno antes de reprogramar:', e);
          }
        }
        if (fecha && tipoTurno) {
          getAvailableSlots(fecha, tipoTurno, idTurno);
        }
      };

      freeAndLoad();
    }
  }, [open, turno, getAvailableSlots]);

  // Reset flag al cerrar el modal
  useEffect(() => {
    if (!open) {
      freedRef.current = false;
    }
  }, [open]);

  // Consultar paciente por DNI
  const checkPatient = async (dni) => {
    // Aceptar DNIs de 7 a 9 dígitos
    if (!dni || String(dni).replace(/\D/g, '').length < 7) {
      setPatientFound(false);
      return;
    }
    setCheckingPatient(true);
    setError('');
    try {
      const response = await apiFetch(`${N8N_ENDPOINTS.CHECK_PATIENT}?dni=${dni}`);
      if (!response.ok) throw new Error('Error al consultar paciente');
      const data = await response.json();
      if (data.found && data.patient) {
        setFormData(prev => ({
          ...prev,
          nombre: data.patient.nombre || data.patient.name || prev.nombre,
          telefono: data.patient.telefono || data.patient.phone || prev.telefono,
          email: data.patient.email || prev.email,
          obraSocial: data.patient.obraSocial || data.patient.insurance || prev.obraSocial,
          numeroAfiliado: data.patient.numeroAfiliado || data.patient.affiliateNumber || prev.numeroAfiliado,
          alergias: data.patient.alergias || data.patient.allergies || prev.alergias || 'Ninguna',
          antecedentes: data.patient.antecedentes || data.patient.background || prev.antecedentes || 'Ninguno',
        }));
        setPatientFound(true);
      } else {
        setPatientFound(false);
      }
    } catch (err) {
      setError('No se encontró el paciente.');
      setPatientFound(false);
    } finally {
      setCheckingPatient(false);
    }
  };

  // Fechas disponibles (próximas 2 semanas; incluir seleccionada)
  const availableDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isWorkDay = WORK_DAYS.includes(d.getDay());
      const value = d.toISOString().split('T')[0];
      if (isWorkDay || value === formData.fecha) {
        dates.push({
          value,
          label: d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }),
        });
      }
    }
    return dates;
  }, [formData.fecha]);

  const handleInputChange = (field, value) => {
    // Si cambia fecha o tipo, limpiar hora seleccionada para evitar inconsistencias
    if (field === 'fecha' || field === 'tipoTurno') {
      const next = { ...formData, [field]: value, hora: '' };
      setFormData(next);
      if (next.fecha && next.tipoTurno) {
        getAvailableSlots(next.fecha, next.tipoTurno, next.id || formData.id);
      }
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'dni') checkPatient(value);
  };

  // Prefetch de horarios apenas se abre el modal o cambia fecha/tipo
  useEffect(() => {
    if (!open) return;
    if (!formData.fecha || !formData.tipoTurno) return;
    getAvailableSlots(formData.fecha, formData.tipoTurno, formData.id);
  }, [open, formData.fecha, formData.tipoTurno, formData.id, getAvailableSlots]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const appointmentType = APPOINTMENT_TYPES.find(t => t.id === formData.tipoTurno);
      const appointmentISO = combineDateTimeToISO(formData.fecha, formData.hora, 'America/Argentina/Buenos_Aires');
      const basePayload = {
        dni: formData.dni,
        nombre: formData.nombre,
        telefono: formData.telefono,
        email: formData.email,
        obraSocial: formData.obraSocial,
        numeroAfiliado: formData.numeroAfiliado,
        alergias: formData.alergias || 'Ninguna',
        antecedentes: formData.antecedentes || 'Ninguno',
        tipoTurno: formData.tipoTurno,
        tipoTurnoNombre: appointmentType?.name || 'Consulta',
        duracion: appointmentType?.duration || 30,
        fechaHora: appointmentISO,
        timezone: 'America/Argentina/Buenos_Aires',
        notas: formData.notas,
        isNewPatient: !patientFound,
        updatedAt: new Date().toISOString(),
      };

      const endpoint = freedRef.current
        ? N8N_ENDPOINTS.CREATE_APPOINTMENT
        : N8N_ENDPOINTS.UPDATE_APPOINTMENT;

      const payload = freedRef.current
        ? basePayload
        : { ...basePayload, id: formData.id };

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al guardar el turno');
      }
      const result = await response.json().catch(() => ({}));
      const saved = result.appointment || result || payload;
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al actualizar el turno. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const response = await apiFetch(N8N_ENDPOINTS.DELETE_APPOINTMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id,
          reason: 'Cancelado por el odontólogo',
          canceledAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error('Webhook "/webhook/delete-appointment" no encontrado (404)');
        }
        throw new Error(errorData.message || `Error al cancelar el turno (HTTP ${response.status})`);
      }
      if (onDeleted) onDeleted(turno);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al cancelar el turno. Intenta nuevamente.');
    } finally {
      setDeleting(false);
    }
  };

  const isFormValid = () => {
    return (
      formData.dni && formData.nombre &&
      formData.tipoTurno && formData.fecha && formData.hora
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4 overflow-hidden">
        <div className="relative bg-white rounded-2xl shadow-2xl border max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-[1] bg-white/80 backdrop-blur border-b px-6 min-h-[75px] flex items-center relative">
            <div className="flex-1 flex items-center justify-start gap-1">
              {onBack && (
                <button
                  onClick={onBack}
                  className="mr-2 p-2 rounded-full hover:bg-gray-100 text-gray-900 transition-colors"
                  aria-label="Volver"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h2 className="text-xl font-semibold text-gray-900">Editar Turno</h2>
            </div>
            <button
              onClick={onClose}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100 text-gray-900 transition-colors"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] bg-white">
            <form id="edit-turno-form" onSubmit={handleSave} className="p-6 space-y-6 pb-8">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              {/* DNI */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="inline w-4 h-4 mr-1" /> DNI
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.dni}
                    readOnly
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                  />
                  {checkingPatient && (
                    <Loader className="absolute right-3 top-2 w-5 h-5 text-gray-400 animate-spin" />
                  )}
                </div>
                {patientFound && (
                  <p className="text-teal-600 text-sm mt-1 flex items-center gap-1">
                    <CheckCircle size={16} /> Paciente encontrado - datos actualizados automáticamente
                  </p>
                )}
              </div>

              {/* Datos personales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="inline w-4 h-4 mr-1" /> Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    readOnly
                    onChange={(e) => handleInputChange('nombre', e.target.value)}
                    placeholder="Juan Pérez"
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                    required
                  />
                </div>
                <div className="hidden">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Phone className="inline w-4 h-4 mr-1" /> Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    readOnly
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                  />
                </div>
              </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="paciente@correo.com"
                className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700"
              />
            </div>

            {/* Obra Social */}
            <div className="hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Obra Social</label>
                  <input
                    type="text"
                    value={formData.obraSocial}
                    onChange={(e) => handleInputChange('obraSocial', e.target.value)}
                    placeholder="OSDE, Swiss Medical, etc."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Número de Afiliado</label>
                  <input
                    type="text"
                    value={formData.numeroAfiliado}
                    onChange={(e) => handleInputChange('numeroAfiliado', e.target.value)}
                    placeholder="123456789"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Información médica */}
              <div className="hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Alergias</label>
                  <input
                    type="text"
                    value={formData.alergias}
                    onChange={(e) => handleInputChange('alergias', e.target.value)}
                    placeholder="Ninguna, Penicilina, etc."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Antecedentes</label>
                  <input
                    type="text"
                    value={formData.antecedentes}
                    onChange={(e) => handleInputChange('antecedentes', e.target.value)}
                    placeholder="Diabetes, Hipertensión, etc."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Tipo de turno */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline w-4 h-4 mr-1" /> Tipo de Turno
                </label>
                <select
                  value={formData.tipoTurno}
                  onChange={(e) => handleInputChange('tipoTurno', e.target.value)}
                  className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700"
                  required
                >
                  <option value="">Selecciona el tipo de consulta</option>
                  {APPOINTMENT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.duration} min)
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" /> Fecha
                </label>
                <select
                  value={formData.fecha}
                  onChange={(e) => handleInputChange('fecha', e.target.value)}
                  className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700"
                  required
                >
                  <option value="">Selecciona una fecha</option>
                  {availableDates.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>

              {/* Horario */}
              {formData.fecha && formData.tipoTurno && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="inline w-4 h-4 mr-1" /> Horario Disponible
                  </label>
                  {loadingAvailability ? (
                    <div className="flex items-center gap-2 p-3 text-gray-600">
                      <Loader className="w-5 h-5 animate-spin" /> Cargando horarios disponibles...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleInputChange('hora', slot)}
                          className={`p-3 text-sm rounded-lg border transition-colors focus:outline-none ${
                            formData.hora === slot
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-teal-500'
                          }`}
                        >
                          {slot} hs
                        </button>
                      ))}
                    </div>
                  )}
                  {!loadingAvailability && availableSlots.length === 0 && (
                    <p className="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">
                      No hay horarios disponibles para esta fecha y tipo de turno.
                    </p>
                  )}
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notas adicionales</label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => handleInputChange('notas', e.target.value)}
                  rows={3}
                  placeholder="Información adicional sobre el turno..."
                  className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700"
                />
              </div>

              {/* Botones: ahora sticky en el footer */}
            </form>
          </div>
          {/* Footer sticky con botones */}
          <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t px-6 py-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={deleting || loading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              Cancelar Turno
            </button>
            <button
              type="submit"
              form="edit-turno-form"
              disabled={!isFormValid() || loading || deleting}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  Guardar Cambios
                </>
              )}
            </button>
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
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); handleDelete(); }}
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
