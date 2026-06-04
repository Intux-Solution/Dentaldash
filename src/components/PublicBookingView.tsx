import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, CheckCircle, Loader2, User } from 'lucide-react';
import { PublicBookingService, PublicDentistProfile } from '../services/PublicBookingService';
import TimeSlotGrid from './form/TimeSlotGrid';
import { PublicBookingSchema, PublicBookingData } from '../schemas/publicBooking.schema';

// Generate next N calendar days starting from tomorrow
function getNextDays(activeDays: number[], count = 30): string[] {
  const dates: string[] = [];
  const today = new Date();
  let d = new Date(today);
  d.setDate(d.getDate() + 1);
  while (dates.length < count) {
    if (activeDays.includes(d.getDay())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function PublicBookingView() {
  const { slug } = useParams<{ slug: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicDentistProfile | null>(null);
  const [workingDays, setWorkingDays] = useState<number[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PublicBookingData>({
    resolver: zodResolver(PublicBookingSchema),
  });

  const selectedService = watch('appointment_type');

  // Load profile on mount
  useEffect(() => {
    if (!slug) return;
    setPageLoading(true);
    PublicBookingService.resolveSlug(slug)
      .then(({ user_id }) => {
        setUserId(user_id);
        return Promise.all([
          PublicBookingService.getProfile(user_id),
          PublicBookingService.getWorkingDays(user_id),
        ]);
      })
      .then(([prof, days]) => {
        setProfile(prof);
        setWorkingDays(days);
        setAvailableDates(getNextDays(days, 30));
      })
      .catch((err) => setPageError(err.message ?? 'No se pudo cargar el perfil del dentista.'))
      .finally(() => setPageLoading(false));
  }, [slug]);

  // Load slots when date and service change
  useEffect(() => {
    if (!userId || !selectedDate || !selectedService || !profile) return;
    const service = profile.services?.find((s) => s.name === selectedService);
    if (!service) return;

    setLoadingSlots(true);
    setSelectedTime('');
    setValue('time', '');
    PublicBookingService.getSlots(userId, selectedDate, service.duration)
      .then(setAvailableSlots)
      .catch(() => setAvailableSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [userId, selectedDate, selectedService, profile, setValue]);

  const onSubmit = async (data: PublicBookingData) => {
    if (!userId || !selectedTime) return;
    const service = profile?.services?.find((s) => s.name === data.appointment_type);
    setSubmitting(true);
    try {
      await PublicBookingService.createAppointment({
        user_id: userId,
        nombre: data.nombre,
        dni: data.dni,
        telefono: data.telefono,
        email: data.email,
        obra_social: data.obra_social,
        appointment_type: data.appointment_type,
        date: data.date,
        time: selectedTime,
        duration: service?.duration ?? 30,
        notes: data.notes,
      });
      setSuccess(true);
    } catch (err: any) {
      alert(err.message ?? 'Error al agendar el turno. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-teal-600" size={32} />
      </div>
    );
  }

  if (pageError || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <p className="text-gray-500">{pageError ?? 'Dentista no encontrado.'}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-teal-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Turno solicitado!</h2>
          <p className="text-gray-500 mb-1">
            Tu turno fue agendado para el
          </p>
          <p className="font-semibold text-gray-800">
            {formatDateLabel(selectedDate)} a las {selectedTime} hs
          </p>
          <p className="text-sm text-gray-400 mt-4">
            El consultorio se pondrá en contacto para confirmar.
          </p>
        </div>
      </div>
    );
  }

  const inputCls = (hasError?: any) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${
      hasError ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              className="w-12 h-12 rounded-full object-cover border border-gray-100"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center">
              <User size={24} className="text-teal-600" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {profile.business_name || profile.full_name || 'Consultorio'}
            </h1>
            <p className="text-sm text-gray-500">Solicitar turno en línea</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

          {/* Servicio */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">1. Seleccioná el servicio</h2>
            {profile.services && profile.services.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.services.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setValue('appointment_type', s.name, { shouldValidate: true });
                      setSelectedDate('');
                      setSelectedTime('');
                      setValue('date', '');
                      setValue('time', '');
                    }}
                    className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                      selectedService === s.name
                        ? 'bg-teal-50 border-teal-400 text-teal-700 font-medium'
                        : 'border-gray-200 text-gray-700 hover:border-teal-300'
                    }`}
                  >
                    <span className="block font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.duration} min</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Este consultorio no tiene servicios configurados.</p>
            )}
            {errors.appointment_type && (
              <p className="mt-2 text-xs text-red-500">{errors.appointment_type.message}</p>
            )}
            <input type="hidden" {...register('appointment_type')} />
          </div>

          {/* Fecha */}
          {selectedService && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                <Calendar className="inline w-4 h-4 mr-1.5 text-teal-600" />
                2. Elegí una fecha
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {availableDates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDate(d);
                      setValue('date', d, { shouldValidate: true });
                      setSelectedTime('');
                      setValue('time', '');
                    }}
                    className={`text-sm px-3 py-2.5 rounded-xl border transition-colors capitalize ${
                      selectedDate === d
                        ? 'bg-teal-50 border-teal-400 text-teal-700 font-medium'
                        : 'border-gray-200 text-gray-700 hover:border-teal-300'
                    }`}
                  >
                    {formatDateLabel(d)}
                  </button>
                ))}
              </div>
              {errors.date && (
                <p className="mt-2 text-xs text-red-500">{errors.date.message}</p>
              )}
              <input type="hidden" {...register('date')} />
            </div>
          )}

          {/* Horarios */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">3. Seleccioná un horario</h2>
              <TimeSlotGrid
                loadingAvailability={loadingSlots}
                availableSlots={availableSlots}
                selectedHora={selectedTime}
                setSelectedHora={(h) => {
                  setSelectedTime(h);
                  setValue('time', h, { shouldValidate: true });
                }}
              />
              {errors.time && (
                <p className="mt-2 text-xs text-red-500">{errors.time.message}</p>
              )}
              <input type="hidden" {...register('time')} />
            </div>
          )}

          {/* Datos del paciente */}
          {selectedTime && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">4. Tus datos</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre y apellido *</label>
                    <input {...register('nombre')} placeholder="Ej: Juan Pérez" className={inputCls(errors.nombre)} />
                    {errors.nombre && <p className="mt-1 text-xs text-red-500">{errors.nombre.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DNI *</label>
                    <input {...register('dni')} placeholder="Ej: 30123456" className={inputCls(errors.dni)} />
                    {errors.dni && <p className="mt-1 text-xs text-red-500">{errors.dni.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                    <input {...register('telefono')} placeholder="Ej: 1155551234" className={inputCls(errors.telefono)} />
                    {errors.telefono && <p className="mt-1 text-xs text-red-500">{errors.telefono.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input {...register('email')} type="email" placeholder="Opcional" className={inputCls(errors.email)} />
                    {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Obra social</label>
                  {profile.accepted_insurances && profile.accepted_insurances.length > 0 ? (
                    <select {...register('obra_social')} className={inputCls()}>
                      <option value="">Sin obra social / Particular</option>
                      {profile.accepted_insurances.map((ins) => (
                        <option key={ins} value={ins}>{ins}</option>
                      ))}
                    </select>
                  ) : (
                    <input {...register('obra_social')} placeholder="Opcional" className={inputCls()} />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / notas</label>
                  <textarea
                    {...register('notes')}
                    rows={2}
                    placeholder="Opcional: descripción del motivo de la consulta"
                    className={`resize-none ${inputCls()}`}
                  />
                </div>
              </div>
            </div>
          )}

          {selectedTime && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 size={18} className="animate-spin" /> Agendando...</>
              ) : (
                'Confirmar turno'
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
