import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader, X, ArrowLeft } from 'lucide-react';
import { AppointmentService } from '../services/AppointmentService';
import { PatientService } from '../services/PatientService';
import './loader-spin.css';
import { combineDateTimeToISO } from '../utils/helpers';
import { message } from 'antd';
import { UpdateAppointmentSchema, UpdateAppointmentPayload } from '../schemas/appointment.schema';

export default function EditTurnoModal({ open, turno, onClose, onSaved, onDeleted, onBack }) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isValid, isSubmitting }
  } = useForm<UpdateAppointmentPayload>({
    resolver: zodResolver(UpdateAppointmentSchema),
    defaultValues: {
      id: '',
      dni: '',
      nombre: '',
      telefono: '',
      email: '',
      obraSocial: '',
      numeroAfiliado: '',
      alergias: '',
      antecedentes: '',
      tipoTurnoNombre: '',
      fechaHora: new Date().toISOString(),
      notas: '',
      status: 'Confirmado'
    },
    mode: 'onChange'
  });

  const [deleting, setDeleting] = useState(false);
  const [checkingPatient, setCheckingPatient] = useState(false);
  const [patientFound, setPatientFound] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Dynamic Working Days
  const [activeWorkingDays, setActiveWorkingDays] = useState([]);
  const [services, setServices] = useState([]);

  // Local state purely for UI selection
  const [selectedTipoTurnoId, setSelectedTipoTurnoId] = useState('');
  const [selectedFecha, setSelectedFecha] = useState('');
  const [selectedHora, setSelectedHora] = useState('');

  // Fetch working days on mount
  useEffect(() => {
    const fetchConfig = async () => {
      const [days, servs] = await Promise.all([
        AppointmentService.getActiveWorkingDays(),
        AppointmentService.getServices()
      ]);
      setActiveWorkingDays(days);
      setServices(servs);
    };
    fetchConfig();
  }, []);

  // Evita borrar el turno más de una vez al abrir el modal
  const freedRef = useRef(false);

  // Obtener horarios disponibles (puede excluir el turno actual)
  const getAvailableSlots = useCallback(async (fecha, tipoTurno, excludeId) => {
    if (!fecha || !tipoTurno) return;

    setLoadingAvailability(true);

    try {
      const appointmentType = services.find(t => (t.id === tipoTurno || t.name === tipoTurno));
      const effectiveExclude = excludeId || watch('id');

      const slots = await AppointmentService.getAvailableSlots(
        fecha,
        appointmentType?.duration || 30,
        effectiveExclude
      );

      setAvailableSlots(slots);

      // Clear selected hora if it's no longer available and not the initially loaded one
      if (selectedHora && !slots.includes(selectedHora) && !open) {
        setSelectedHora('');
      }
    } catch (err) {
      setAvailableSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  }, [watch('id'), selectedHora, open, services]);

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

      const tipoTurno = (services.find(type =>
        (turno.title || '').toLowerCase().includes(type.name.toLowerCase()) ||
        (turno.tipoTurnoNombre || '').toLowerCase().includes(type.name.toLowerCase()) ||
        (turno.tipoTurno || '').toLowerCase() === (type.id || '').toLowerCase() ||
        (turno.appointment_type || '').toLowerCase() === (type.name || '').toLowerCase()
      ) || {}).id || turno.tipoTurno || '';

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

      reset({
        id: idTurno,
        dni: dniInicial,
        nombre: turno.patientName || turno.paciente || nombreDesdeDescripcion || '',
        telefono: turno.patientPhone || turno.telefono || '',
        email: turno.patientEmail || turno.email || '',
        obraSocial: turno.obraSocial || '',
        numeroAfiliado: turno.numeroAfiliado || '',
        alergias: turno.alergias || '',
        antecedentes: turno.antecedentes || '',
        notas: turno.description || turno.notas || '',
        fechaHora: startDate || new Date().toISOString(),
        tipoTurnoNombre: tipoTurno, // will be overwritten on submit
        status: turno.status || turno.estado || 'Confirmado'
      });

      setSelectedFecha(fecha);
      setSelectedHora(hora);
      setSelectedTipoTurnoId(tipoTurno);

      // Aún no sabemos si existe en base; esperar resultado de checkPatient
      setPatientFound(false);
      setError('');

      // Traer datos del paciente automáticamente al abrir si hay DNI
      if (dniInicial) {
        checkPatient(dniInicial);
      }

      if (fecha && tipoTurno) {
        getAvailableSlots(fecha, tipoTurno, idTurno);
      }
    }
  }, [open, turno, reset, services, getAvailableSlots]);

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
      const patient = await PatientService.getPatientByDni(dni);
      if (patient) {
        setValue('nombre', patient.nombre || watch('nombre'));
        setValue('telefono', patient.telefono || watch('telefono'));
        setValue('email', patient.email || watch('email'));
        setValue('obraSocial', patient.obraSocial || watch('obraSocial'));
        setValue('numeroAfiliado', patient.numeroAfiliado || watch('numeroAfiliado'));
        setValue('alergias', patient.alergias || 'Ninguna');
        setValue('antecedentes', patient.antecedentes || 'Ninguno');
        setPatientFound(true);
      } else {
        setPatientFound(false);
      }
    } catch (err) {
      setError('Error al consultar paciente.');
      setPatientFound(false);
    } finally {
      setCheckingPatient(false);
    }
  };

  // Fechas disponibles (próximas 2 semanas; incluir seleccionada)
  const availableDates = useMemo(() => {
    if (activeWorkingDays.length === 0) return [];

    const dates = [];
    const today = new Date();
    for (let i = 0; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isWorkDay = activeWorkingDays.includes(d.getDay());
      const value = d.toISOString().split('T')[0];
      if (isWorkDay || value === selectedFecha) {
        dates.push({
          value,
          label: d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }),
        });
      }
    }
    return dates;
  }, [selectedFecha, activeWorkingDays]);

  // Trigger getAvailableSlots when fecha or tipoTurno changes
  useEffect(() => {
    if (selectedFecha && selectedTipoTurnoId && open) {
      getAvailableSlots(selectedFecha, selectedTipoTurnoId, watch('id'));
    }
  }, [selectedFecha, selectedTipoTurnoId, open, getAvailableSlots, watch('id')]);

  const onSubmitForm = async (data) => {
    if (!selectedFecha || !selectedHora || !selectedTipoTurnoId) {
      message.error("Debes completar todos los campos del turno.");
      return;
    }
    setError('');

    try {
      const appointmentType = services.find(t => (t.id === selectedTipoTurnoId || t.name === selectedTipoTurnoId));
      const appointmentISO = combineDateTimeToISO(selectedFecha, selectedHora);

      // Override contextual variables
      data.duracion = appointmentType?.duration || 30;
      data.tipoTurnoNombre = appointmentType?.name || 'Consulta';
      data.fechaHora = appointmentISO;

      let saved;
      if (freedRef.current || !data.id) {
        // Create new
        saved = await AppointmentService.createAppointment({
          ...data,
          tipoTurno: selectedTipoTurnoId,
          timezone: 'America/Argentina/Buenos_Aires',
          isNewPatient: !patientFound
        });
      } else {
        // Update existing
        saved = await AppointmentService.updateAppointment(data.id, {
          ...data,
          tipoTurno: selectedTipoTurnoId,
          timezone: 'America/Argentina/Buenos_Aires'
        });
      }

      if (onSaved) onSaved(saved);
      message.success('Turno guardado con éxito');
      onClose();
    } catch (err) {
      const msg = err.message || 'Error al actualizar el turno. Intenta nuevamente.';
      setError(msg);
      message.error(msg);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await AppointmentService.deleteAppointment(watch('id'));
      if (onDeleted) onDeleted(turno);
      message.success('Turno cancelado correctamente');
      onClose();
    } catch (err) {
      const msg = err.message || 'Error al cancelar el turno. Intenta nuevamente.';
      setError(msg);
      message.error(msg);
    } finally {
      setDeleting(false);
    }
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
            <form id="edit-turno-form" onSubmit={handleSubmit(onSubmitForm)} className="p-6 space-y-6 pb-8">
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
                    {...register('dni')}
                    readOnly
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                  />
                  {checkingPatient && (
                    <Loader className="absolute right-3 top-2 w-5 h-5 text-gray-400 animate-spin" />
                  )}
                </div>
                {errors.dni && <p className="text-red-500 text-xs mt-1">{errors.dni.message}</p>}
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
                    {...register('nombre')}
                    readOnly
                    placeholder="Juan Pérez"
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                  />
                  {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
                </div>
                <div className="hidden">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Phone className="inline w-4 h-4 mr-1" /> Teléfono
                  </label>
                  <input
                    type="tel"
                    {...register('telefono')}
                    readOnly
                    className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700 cursor-not-allowed"
                  />
                  {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono.message}</p>}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  placeholder="paciente@correo.com"
                  className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.email ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] text-gray-700`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              {/* Obra Social */}
              <div className="hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Obra Social</label>
                  <input
                    type="text"
                    {...register('obraSocial')}
                    placeholder="OSDE, Swiss Medical, etc."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Número de Afiliado</label>
                  <input
                    type="text"
                    {...register('numeroAfiliado')}
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
                    {...register('alergias')}
                    placeholder="Ninguna, Penicilina, etc."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Antecedentes</label>
                  <input
                    type="text"
                    {...register('antecedentes')}
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
                  value={selectedTipoTurnoId}
                  onChange={(e) => {
                    setSelectedTipoTurnoId(e.target.value);
                  }}
                  className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] text-gray-700"
                  required
                >
                  <option value="">Selecciona el tipo de consulta</option>
                  {services.map((type) => (
                    <option key={type.id || type.name} value={type.id || type.name}>
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
                  value={selectedFecha}
                  onChange={(e) => {
                    setSelectedFecha(e.target.value);
                  }}
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
              {selectedFecha && selectedTipoTurnoId && (
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
                          onClick={() => {
                            setSelectedHora(slot);
                          }}
                          className={`p-3 text-sm rounded-lg border transition-colors focus:outline-none ${selectedHora === slot
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
                  {...register('notas')}
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
              disabled={deleting || isSubmitting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              Cancelar Turno
            </button>
            <button
              type="submit"
              form="edit-turno-form"
              disabled={!isValid || isSubmitting || deleting}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
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
