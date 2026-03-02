import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import InsuranceAutocomplete from './InsuranceAutocomplete';
import { useBookingForm } from '../hooks/useBookingForm';

interface BookingFormProps {
  onSuccess: () => void;
  hideHeader?: boolean;
  hideInternalSubmit?: boolean;
  setFormSubmit?: (submitFn: () => void) => void;
}

export default function BookingForm({ onSuccess, hideHeader = false, hideInternalSubmit = false, setFormSubmit }: BookingFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    errors,
    isSubmitting,
    isValid,
    checkingPatient,
    patientFound,
    availableSlots,
    loadingAvailability,
    success,
    error,
    patientNotice,
    obraSocial,
    selectedTipoTurnoId,
    setSelectedTipoTurnoId,
    selectedFecha,
    setSelectedFecha,
    selectedHora,
    setSelectedHora,
    services,
    availableDates,
    onSubmit,
    resetForm,
    formRef,
    hiddenSubmitRef
  } = useBookingForm(onSuccess, setFormSubmit);

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
            value={obraSocial || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue('obraSocial', e.target.value, { shouldValidate: true })}
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
                disabled={!isValid || isSubmitting || !selectedFecha || !selectedHora || !selectedTipoTurnoId}
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
