import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { AppointmentService } from '../services/AppointmentService';
import { PatientService } from '../services/PatientService';
import InsuranceAutocomplete from './InsuranceAutocomplete';
import { combineDateTimeToISO } from '../utils/helpers';
import { message } from 'antd';
import { CreateAppointmentSchema, CreateAppointmentPayload } from '../schemas/appointment.schema';
import { useTurnos } from '../hooks/useTurnos';

interface BookingFormProps {
  onSuccess: () => void;
  hideHeader?: boolean;
  hideInternalSubmit?: boolean;
  setFormSubmit?: (submitFn: () => void) => void;
}

export default function BookingForm({ onSuccess, hideHeader = false, hideInternalSubmit = false, setFormSubmit }: BookingFormProps) {
  const { addTurno } = useTurnos();
  // Configured React Hook Form
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting, isValid },
    reset
  } = useForm<CreateAppointmentPayload>({
    resolver: zodResolver(CreateAppointmentSchema),
    defaultValues: {
      dni: '',
      nombre: '',
      telefono: '',
      email: '',
      obraSocial: '',
      numeroAfiliado: '',
      alergias: '',
      antecedentes: '',
      tipoTurnoNombre: '',
      fechaHora: new Date().toISOString(), // Temporary bypass, overwritten before submit
      notas: '',
      status: 'Confirmado',
      patient_id: '00000000-0000-0000-0000-000000000000'
    },
    mode: 'onChange' // Triggers validation on change
  });

  // UI state
  const [checkingPatient, setCheckingPatient] = useState(false);
  const [patientFound, setPatientFound] = useState(false);
  const [patientId, setPatientId] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [patientNotice, setPatientNotice] = useState('');

  // Watch necessary fields for dynamic updates
  const dniStr = watch('dni');

  // Local state purely for UI selection (since API needs a combined ISO string we construct at submit)
  const [selectedTipoTurnoId, setSelectedTipoTurnoId] = useState('');
  const [selectedFecha, setSelectedFecha] = useState('');
  const [selectedHora, setSelectedHora] = useState('');

  // Dynamic Working Days
  const [activeWorkingDays, setActiveWorkingDays] = useState([]);
  const [services, setServices] = useState([]);

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

  // Exponer submit del form al contenedor para el botón del footer del modal
  const formRef = React.useRef(null);
  const hiddenSubmitRef = React.useRef(null);
  React.useEffect(() => {
    if (typeof setFormSubmit === 'function') {
      setFormSubmit(() => () => {
        try {
          if (formRef.current?.requestSubmit) {
            formRef.current.requestSubmit(hiddenSubmitRef.current || undefined);
          } else {
            hiddenSubmitRef.current?.click();
          }
        } catch {
          try { hiddenSubmitRef.current?.click(); } catch { }
        }
      });
    }
  }, [setFormSubmit]);

  // Debounced checkPatient (simplified for React effect)
  useEffect(() => {
    if (dniStr && dniStr.length >= 7) {
      const timer = setTimeout(() => {
        checkPatient(dniStr);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setPatientFound(false);
      setPatientNotice('');
      setPatientId(null);
    }
  }, [dniStr]);

  // Check patient by DNI
  const checkPatient = async (dni) => {
    setCheckingPatient(true);
    setError('');
    setPatientNotice('');

    try {
      const patient = await PatientService.getPatientByDni(dni);

      if (patient) {
        // Autocompletar datos del paciente encontrado
        setValue('nombre', patient.nombre || patient.name || '', { shouldValidate: true });
        setValue('telefono', patient.telefono || patient.phone || '', { shouldValidate: true });
        setValue('email', patient.email || '', { shouldValidate: true });
        setValue('obraSocial', patient.obraSocial || '', { shouldValidate: true });
        setValue('numeroAfiliado', patient.numeroAfiliado || '', { shouldValidate: true });
        setValue('alergias', patient.alergias || 'Ninguna', { shouldValidate: true });
        setValue('antecedentes', patient.antecedentes || 'Ninguno', { shouldValidate: true });

        // This makes sure the update gets linked correctly
        setValue('patient_id', patient.id);
        setPatientId(patient.id);

        setPatientFound(true);
        setPatientNotice('');
      } else {
        // Form states remains as user typed for new patient
        setPatientId(null);
        setValue('patient_id', '00000000-0000-0000-0000-000000000000');
        setPatientFound(false);
        setPatientNotice('Paciente nuevo: se creará automáticamente al confirmar.');
      }
    } catch (err) {
      setPatientNotice('Error al buscar paciente');
      setPatientFound(false);
    } finally {
      setCheckingPatient(false);
    }
  };

  // Trigger getAvailableSlots when fecha or tipoTurno changes
  useEffect(() => {
    if (selectedFecha && selectedTipoTurnoId) {
      getAvailableSlots(selectedFecha, selectedTipoTurnoId);
    }
  }, [selectedFecha, selectedTipoTurnoId]);

  // Get available slots for selected date and appointment type
  const getAvailableSlots = async (fecha, tipoTurno) => {
    setLoadingAvailability(true);
    try {
      const appointmentType = services.find(t => (t.id === tipoTurno || t.name === tipoTurno));
      const duration = appointmentType?.duration || 30;
      const slots = await AppointmentService.getAvailableSlots(fecha, duration);
      setAvailableSlots(slots);

      // Clear selected hora if it's no longer available
      if (selectedHora && !slots.includes(selectedHora)) {
        setSelectedHora('');
      }
    } catch (err) {
      setAvailableSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Generate available dates (next 2 weeks, only work days)
  const availableDates = useMemo(() => {
    if (activeWorkingDays.length === 0) return [];

    const dates = [];
    const today = new Date();

    const toLocalYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Incluir hoy (i = 0) y los próximos 13 días: total 14 días
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      // Check against dynamic activeWorkingDays
      if (activeWorkingDays.includes(date.getDay())) {
        dates.push({
          value: toLocalYMD(date),
          label: date.toLocaleDateString('es-AR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })
        });
      }
    }

    return dates;
  }, [activeWorkingDays]); // Recompute when activeWorkingDays changes

  // Submit appointment via react-hook-form
  const onSubmit = async (data) => {
    if (!selectedFecha || !selectedHora || !selectedTipoTurnoId) {
      message.error("Debes completar todos los campos del turno.");
      return;
    }
    setError('');

    try {
      const appointmentType = services.find(t => (t.id === selectedTipoTurnoId || t.name === selectedTipoTurnoId));

      // Override schema form data with contextual values
      data.duracion = appointmentType?.duration ? Number(appointmentType.duration) : 30;
      data.tipoTurnoNombre = appointmentType?.name || selectedTipoTurnoId;
      data.fechaHora = combineDateTimeToISO(
        selectedFecha,
        selectedHora
      );

      if (patientId) {
        data.patient_id = patientId;
      }

      await addTurno({
        ...data,
        tipoTurno: selectedTipoTurnoId, // legacy support for backend
      });

      setSuccess(true);

      // Notificar al padre que el turno se creó exitosamente después de un breve delay
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 2000);
    } catch (err) {
      const msg = err.message || 'Error al crear el turno. Intenta nuevamente.';
      setError(msg);
      message.error(msg);
    }
  };

  // Reset form for new appointment
  const resetForm = () => {
    reset();
    setSelectedFecha('');
    setSelectedHora('');
    setSelectedTipoTurnoId('');
    setSuccess(false);
    setError('');
    setPatientFound(false);
    setAvailableSlots([]);
    setPatientId(null);
  };

  if (success) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">¡Turno Confirmado!</h2>
        <p className="text-gray-600 mb-6">
          El turno ha sido agendado exitosamente.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-gray-600">Fecha:</span>
            <span className="font-medium">{availableDates.find(d => d.value === selectedFecha)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Hora:</span>
            <span className="font-medium">{selectedHora} hs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tipo:</span>
            <span className="font-medium">{services.find(t => (t.id === selectedTipoTurnoId || t.name === selectedTipoTurnoId))?.name || selectedTipoTurnoId}</span>
          </div>
        </div>
        <button
          onClick={resetForm}
          className="w-full bg-teal-600 text-white py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors"
        >
          Agendar Otro Turno
        </button>
      </div>
    );
  }

  // (sin hooks aquí para mantener el orden entre renders)

  return (
    <div className="bg-white">
      {!hideHeader && (
        <div className="sticky top-0 z-[1] bg-white/80 backdrop-blur border-b px-6 min-h-[75px] flex items-center">
          <h1 className="text-xl font-semibold text-gray-900">Agendar Turno</h1>
        </div>
      )}

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        <button ref={hiddenSubmitRef} type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        {patientNotice && (
          <div className="bg-gray-50 border border-gray-200 text-gray-800 px-4 py-3 rounded-lg text-sm">
            {patientNotice}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* DNI Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <CreditCard className="inline w-4 h-4 mr-1" />
            DNI
          </label>
          <div className="relative">
            <input
              type="text"
              {...register('dni')}
              placeholder="12.345.678"
              className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.dni ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent`}
            />
            {checkingPatient && (
              <Loader className="absolute right-3 top-2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>
          {errors.dni && <p className="text-red-500 text-xs mt-1">{errors.dni.message}</p>}
          {patientFound && (
            <p className="text-teal-600 text-sm mt-1 flex items-center gap-1">
              <CheckCircle size={16} />
              ¡Paciente encontrado!
            </p>
          )}
        </div>

        {/* Personal Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline w-4 h-4 mr-1" />
              Nombre Completo
            </label>
            <input
              type="text"
              {...register('nombre')}
              placeholder="Juan Pérez"
              className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.nombre ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent`}
            />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="inline w-4 h-4 mr-1" />
              Teléfono
            </label>
            <input
              type="tel"
              {...register('telefono')}
              placeholder="+54 381 123 4567"
              className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.telefono ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent`}
            />
            {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono.message}</p>}
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            {...register('email')}
            placeholder="paciente@correo.com"
            className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.email ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent`}
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        {/* Insurance Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Obra Social (Searchable Autocomplete) */}
          <InsuranceAutocomplete
            value={watch('obraSocial') || ''}
            onChange={(e) => setValue('obraSocial', e.target.value, { shouldValidate: true })}
            disabled={isSubmitting}
            placeholder="OSDE, Swiss Medical, etc."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              N° de Afiliado
            </label>
            <input
              type="text"
              {...register('numeroAfiliado')}
              placeholder="123456789"
              className={`text-sm w-full px-3 py-2 rounded-xl border ${errors.numeroAfiliado ? 'border-red-500' : 'border-transparent'} bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent`}
            />
          </div>
        </div>

        {/* Medical Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alergias
            </label>
            <input
              type="text"
              {...register('alergias')}
              placeholder="Ninguna, Penicilina, etc."
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Antecedentes
            </label>
            <input
              type="text"
              {...register('antecedentes')}
              placeholder="Diabetes, Hipertensión, etc."
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
            />
          </div>
        </div>

        {/* Appointment Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock className="inline w-4 h-4 mr-1" />
            Tipo de Turno
          </label>
          <select
            value={selectedTipoTurnoId}
            onChange={(e) => {
              setSelectedTipoTurnoId(e.target.value);
            }}
            className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] focus:outline-none focus:ring-0 focus:border-transparent"
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

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline w-4 h-4 mr-1" />
            Fecha
          </label>
          <select
            value={selectedFecha}
            onChange={(e) => {
              setSelectedFecha(e.target.value);
            }}
            className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] focus:outline-none focus:ring-0 focus:border-transparent"
            required
          >
            <option value="">Selecciona una fecha</option>
            {availableDates.map((date) => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </select>
        </div>

        {/* Time Selection */}
        {selectedFecha && selectedTipoTurnoId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline w-4 h-4 mr-1" />
              Horario Disponible
            </label>
            {loadingAvailability ? (
              <div className="flex items-center gap-2 p-3 text-gray-600">
                <Loader className="w-5 h-5 animate-spin" />
                Cargando horarios disponibles...
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

        {!hideInternalSubmit && (
          <div className="px-0">
            <div className="mt-2 -mx-6 px-6 py-4 border-t bg-white/80 backdrop-blur">
              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Creando Turno...
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5" />
                    Confirmar Turno
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
