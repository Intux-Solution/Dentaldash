import { Calendar, Clock, User, CreditCard, Phone, AlertCircle, CheckCircle, Loader, X, ArrowLeft } from 'lucide-react';
import { useEditTurnoModal } from '../hooks/useEditTurnoModal';

interface EditTurnoModalProps {
  open: boolean;
  turno: any;
  onClose: () => void;
  onSaved?: (turno: any) => void;
  onDeleted?: (turno: any) => void;
  onBack?: () => void;
}

export default function EditTurnoModal({ open, turno, onClose, onSaved, onDeleted, onBack }: EditTurnoModalProps) {
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    deleting,
    checkingPatient,
    patientFound,
    availableSlots,
    loadingAvailability,
    error,
    showConfirm,
    setShowConfirm,
    selectedTipoTurnoId,
    setSelectedTipoTurnoId,
    selectedFecha,
    setSelectedFecha,
    selectedHora,
    setSelectedHora,
    services,
    availableDates,
    onSubmitForm,
    handleDelete
  } = useEditTurnoModal(open, turno, onClose, onSaved, onDeleted);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4 overflow-hidden">
        <div className="relative bg-white rounded-2xl shadow-2xl border max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-[1] bg-white/80 backdrop-blur border-b px-6 min-h-[75px] flex items-center">
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
              disabled={isSubmitting || deleting}
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
