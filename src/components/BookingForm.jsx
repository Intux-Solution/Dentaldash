
import React, { useState, useMemo } from 'react';
import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import './loader-spin.css';
import { N8N_ENDPOINTS } from '../config/n8n';
import { apiFetch } from '../utils/api';
import { APPOINTMENT_TYPES, WORK_DAYS } from '../config/appointments';
import { combineDateTimeToISO, to24h } from '../utils/appointments';

const LOCAL_APPOINTMENT_TYPES = [
  { id: 'consulta', name: 'Consulta', duration: 30 },
  { id: 'limpieza', name: 'Limpieza', duration: 45 },
  { id: 'ensenanza', name: 'Enseñanza de técnica de cepillado y flúor en niños', duration: 30 },
  { id: 'caries_chicos', name: 'Arreglos caries chicos', duration: 45 },
  { id: 'caries_grandes', name: 'Arreglos caries grandes', duration: 60 },
  { id: 'molde_blanqueamiento', name: 'Toma de molde para blanqueamiento ambulatorio', duration: 30 },
  { id: 'molde_relajacion', name: 'Toma de molde para placa de relajación', duration: 30 },
  { id: 'instalacion_placas', name: 'Instalación de placas de relajación', duration: 45 },
  { id: 'carillas', name: 'Carillas anteriores', duration: 90 },
  { id: 'contenciones', name: 'Contenciones', duration: 45 },
  { id: 'incrustaciones', name: 'Incrustaciones', duration: 75 }
];

const LOCAL_WORK_DAYS = [1, 2, 3, 4]; // Lunes a Jueves

export default function BookingForm({ onSuccess, hideHeader = false, hideInternalSubmit = false, setFormSubmit }) {
  // Form state
  const [formData, setFormData] = useState({
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
    hora: ''
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [checkingPatient, setCheckingPatient] = useState(false);
  const [patientFound, setPatientFound] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [patientNotice, setPatientNotice] = useState('');

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
          try { hiddenSubmitRef.current?.click(); } catch {}
        }
      });
    }
  }, [setFormSubmit]);

  // Check patient by DNI
  const checkPatient = async (dni) => {
    if (dni.length < 8) {
      setPatientFound(false);
      setPatientNotice('');
      return;
    }
    
    setCheckingPatient(true);
    setError('');
    setPatientNotice('');
    
    try {
      const response = await apiFetch(`${N8N_ENDPOINTS.CHECK_PATIENT}?dni=${dni}`);
      
      if (!response.ok) {
        throw new Error('No se encontró el paciente');
      }
      
      const data = await response.json();
      
      if (data.found && data.patient) {
        const p = data.patient || {};
        const obraSocial =
          p.obraSocial ||
          p.obra_social ||
          p['Obra Social'] ||
          p.insurance ||
          '';
        const numeroAfiliado =
          p.numeroAfiliado ||
          p.numeroafiliado ||
          p.numero_afiliado ||
          p['Numero Afiliado'] ||
          p.affiliateNumber ||
          '';

        // Autocompletar datos del paciente encontrado
        setFormData(prev => ({
          ...prev,
          nombre: p.nombre || p.name || '',
          telefono: p.telefono || p.phone || '',
          email: p.email || '',
          obraSocial,
          numeroAfiliado,
          alergias: p.alergias || p.allergies || 'Ninguna',
          antecedentes: p.antecedentes || p.background || 'Ninguno'
        }));
        setPatientFound(true);
        setPatientNotice('');
      } else {
        // Limpiar datos si no se encuentra el paciente
        setFormData(prev => ({
          ...prev,
          nombre: '',
          telefono: '',
          email: '',
          obraSocial: '',
          numeroAfiliado: '',
          alergias: '',
          antecedentes: ''
        }));
        setPatientFound(false);
        setPatientNotice('No se encontró el paciente');
      }
    } catch (err) {
      setPatientNotice('No se encontró el paciente');
      setPatientFound(false);
    } finally {
      setCheckingPatient(false);
    }
  };

  // Get available slots for selected date and appointment type
  const getAvailableSlots = async (fecha, tipoTurno) => {
    if (!fecha || !tipoTurno) return;
    
    setLoadingAvailability(true);
    try {
      const appointmentType = APPOINTMENT_TYPES.find(t => t.id === tipoTurno);
      const response = await apiFetch(
        `${N8N_ENDPOINTS.GET_AVAILABILITY}?fecha=${fecha}&duration=${appointmentType.duration}`
      );
      const data = await response.json();
      const raw = Array.isArray(data?.availableSlots) ? data.availableSlots : [];
      const normalized = Array.from(new Set(raw.map(to24h))).sort();
      setAvailableSlots(normalized);
    } catch (err) {
      setAvailableSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Generate available dates (next 2 weeks, only work days)
  const availableDates = useMemo(() => {
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

      if (WORK_DAYS.includes(date.getDay())) {
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
  }, []);

  // Handle form input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'dni') {
      setPatientNotice('');
      checkPatient(value);
    }
    
    if (field === 'fecha' || field === 'tipoTurno') {
      const newFormData = { ...formData, [field]: value };
      if (newFormData.fecha && newFormData.tipoTurno) {
        getAvailableSlots(newFormData.fecha, newFormData.tipoTurno);
      }
    }
  };

  // Submit appointment
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const appointmentType = APPOINTMENT_TYPES.find(t => t.id === formData.tipoTurno);
      
      // Combinar fecha y hora en formato ISO completo
      const appointmentISO = combineDateTimeToISO(
        formData.fecha,
        formData.hora,
        'America/Argentina/Buenos_Aires'
      );
      
      const response = await apiFetch(N8N_ENDPOINTS.CREATE_APPOINTMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Datos del paciente
          dni: formData.dni,
          nombre: formData.nombre,
          telefono: formData.telefono,
          email: formData.email,
          obraSocial: formData.obraSocial,
          numeroAfiliado: formData.numeroAfiliado,
          alergias: formData.alergias || 'Ninguna',
          antecedentes: formData.antecedentes || 'Ninguno',
          // Datos del turno
          tipoTurno: formData.tipoTurno,
          tipoTurnoNombre: appointmentType.name,
          duracion: appointmentType.duration,
          fechaHora: appointmentISO, // Fecha y hora en formato ISO completo
          timezone: 'America/Argentina/Buenos_Aires',
          // Metadatos
          isNewPatient: !patientFound
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al crear el turno');
      }

      await response.json();
      setSuccess(true);
      
      // Notificar al padre que el turno se creó exitosamente después de un breve delay
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Error al crear el turno. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // Validation
  const isFormValid = () => {
    return formData.dni && formData.nombre && formData.telefono && 
           formData.tipoTurno && formData.fecha && formData.hora;
  };

  // Reset form for new appointment
  const resetForm = () => {
    setFormData({
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
      hora: ''
    });
    setSuccess(false);
    setError('');
    setPatientFound(false);
    setAvailableSlots([]);
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
            <span className="font-medium">{availableDates.find(d => d.value === formData.fecha)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Hora:</span>
            <span className="font-medium">{formData.hora} hs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tipo:</span>
            <span className="font-medium">{APPOINTMENT_TYPES.find(t => t.id === formData.tipoTurno)?.name}</span>
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
      <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-6">
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
              value={formData.dni}
              onChange={(e) => handleInputChange('dni', e.target.value)}
              placeholder="12.345.678"
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
              required
            />
            {checkingPatient && (
              <Loader className="absolute right-3 top-2 w-5 h-5 text-gray-400 spin-in-place" />
            )}
          </div>
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
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Juan Pérez"
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="inline w-4 h-4 mr-1" />
              Teléfono
            </label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => handleInputChange('telefono', e.target.value)}
              placeholder="+54 381 123 4567"
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="paciente@correo.com"
            className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
          />
        </div>

        {/* Insurance Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Obra Social
            </label>
            <input
              type="text"
              value={formData.obraSocial}
              onChange={(e) => handleInputChange('obraSocial', e.target.value)}
              placeholder="OSDE, Swiss Medical, etc."
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              N° de Afiliado
            </label>
            <input
              type="text"
              value={formData.numeroAfiliado}
              onChange={(e) => handleInputChange('numeroAfiliado', e.target.value)}
              placeholder="123456789"
              className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
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
              value={formData.alergias}
              onChange={(e) => handleInputChange('alergias', e.target.value)}
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
              value={formData.antecedentes}
              onChange={(e) => handleInputChange('antecedentes', e.target.value)}
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
            value={formData.tipoTurno}
            onChange={(e) => handleInputChange('tipoTurno', e.target.value)}
            className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] focus:outline-none focus:ring-0 focus:border-transparent text-sm"
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

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline w-4 h-4 mr-1" />
            Fecha
          </label>
          <select
            value={formData.fecha}
            onChange={(e) => handleInputChange('fecha', e.target.value)}
            className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] focus:outline-none focus:ring-0 focus:border-transparent text-sm"
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
        {formData.fecha && formData.tipoTurno && (
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

        {!hideInternalSubmit && (
          <div className="px-0">
            <div className="mt-2 -mx-6 px-6 py-4 border-t bg-white/80 backdrop-blur">
              <button
                type="submit"
                disabled={!isFormValid() || loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
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
