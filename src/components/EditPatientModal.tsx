import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Hash, Phone, FileText, AlertTriangle, Activity, Stethoscope, AlertCircle, X, ArrowLeft } from 'lucide-react';
import InsuranceAutocomplete from './InsuranceAutocomplete';
import { UpdatePatientSchema } from '../schemas/patient.schema';
import { message } from 'antd';

// ─── Helpers visuales ─────────────────────────────────────────────────────────
const FieldError = ({ error }: { error?: { message?: string } }) =>
  error ? <p className="mt-1 text-xs text-red-500">{error.message}</p> : null;

const inputCls = (hasError?: any) =>
  `w-full rounded-xl border px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none ${hasError
    ? 'border-red-400 bg-red-50'
    : 'border-transparent bg-[#F5F5F5]'
  }`;

// ─── Helper: normalizar null/undefined a string vacío ───
const safeStr = (val: any) => val ?? '';

interface EditPatientModalProps {
  open: boolean;
  patient: any;
  onClose?: () => void;
  onSaved?: (data: any) => Promise<void>;
  onBack?: () => void;
}

export default function EditPatientModal({ open, patient, onClose, onSaved, onBack }: EditPatientModalProps) {
  // Estado del archivo clínico (no entra en el esquema Zod)
  const [historiaClinicaFile, setHistoriaClinicaFile] = useState<File | null>(null);
  const [shouldRemoveRecord, setShouldRemoveRecord] = useState(false);
  const [originalRecord, setOriginalRecord] = useState('');

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(UpdatePatientSchema),
    defaultValues: {
      nombre: '',
      dni: '',
      telefono: '',
      email: '',
      obraSocial: '',
      numeroAfiliado: '',
      alergias: '',
      antecedentes: '',
      notas: '',
      estado: 'Activo',
    },
  });

  // ─── Poblar el form cuando se abre con un paciente ────────────────────────
  useEffect(() => {
    if (open && patient) {
      reset({
        id: patient.id || patient._id || undefined,
        nombre: safeStr(patient.nombre),
        dni: safeStr(patient.dni),
        telefono: safeStr(patient.telefono),
        email: safeStr(patient.email),
        obraSocial: safeStr(patient.obraSocial),
        numeroAfiliado: safeStr(patient.numeroAfiliado),
        alergias: safeStr(patient.alergias || patient.alergia),
        antecedentes: safeStr(patient.antecedentes),
        notas: safeStr(patient.notas),
        estado: safeStr(patient.estado) || 'Activo',
      });

      const record = safeStr(patient.historiaClinica);
      setOriginalRecord(record);
      setHistoriaClinicaFile(null);
      setShouldRemoveRecord(false);
    }
  }, [open, patient, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistoriaClinicaFile(e.target.files?.[0] || null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose?.();
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const onSubmit = async (validData: any) => {
    try {
      const payload = {
        ...patient,
        ...validData,
        estado: validData.estado || 'Activo',
      };

      if (historiaClinicaFile) {
        payload.historiaClinicaFile = historiaClinicaFile;
        payload.historiaClinicaNombre = historiaClinicaFile.name;
      } else if (shouldRemoveRecord) {
        payload.historiaClinica = null;
        payload.historia_clinica_url = null;
      }

      if (typeof onSaved === 'function') {
        await onSaved(payload);
      }

      message.success('Paciente actualizado correctamente');
      setTimeout(handleClose, 900);
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      const msg = err.message || 'Error actualizando el paciente';
      message.error(msg);
      // Re-throw para que react-hook-form capte el error (no oculta el form)
      throw err;
    }
  };

  if (!open || !patient) return null;

  // Estado del archivo actual para mostrar en UI
  const fileLabel = historiaClinicaFile
    ? historiaClinicaFile.name
    : shouldRemoveRecord
      ? 'Archivo eliminado (se guardará al actualizar)'
      : originalRecord
        ? `Actual: ${originalRecord}`
        : 'Sin archivos seleccionados';

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-full items-center justify-center py-6 md:py-10 px-4">
        <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] md:max-h-[calc(100vh-5rem)] min-h-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white/80 backdrop-blur min-h-[75px]">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="mr-2 p-2 rounded-full hover:bg-gray-100 text-gray-900 transition-colors"
                  aria-label="Volver"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h3 className="text-xl font-semibold text-gray-900">Editar Paciente</h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
              disabled={isSubmitting}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Error global del formulario (si el submit falla) */}
          {errors.root && (
            <div className="mb-4 mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 text-sm">
              <AlertCircle size={16} className="mr-2 shrink-0" />
              {errors.root.message}
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
            noValidate
          >
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-5">

              {/* Nombre */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <User size={16} className="mr-2 text-gray-500" />
                  Nombre *
                </label>
                <input
                  {...register('nombre', { required: 'El nombre es obligatorio' })}
                  placeholder=""
                  className={inputCls(errors.nombre)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.nombre} />
              </div>

              {/* DNI */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <Hash size={16} className="mr-2 text-gray-500" />
                  DNI
                </label>
                <input
                  {...register('dni')}
                  type="text"
                  placeholder="Número de documento"
                  className={inputCls(errors.dni)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.dni} />
              </div>

              {/* Teléfono */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <Phone size={16} className="mr-2 text-gray-500" />
                  Teléfono
                </label>
                <input
                  {...register('telefono')}
                  type="tel"
                  placeholder="+54 11 5555-5555"
                  className={inputCls(errors.telefono)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.telefono} />
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <User size={16} className="mr-2 text-gray-500" />
                  Email
                </label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="paciente@correo.com"
                  className={inputCls(errors.email)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.email} />
              </div>

              {/* Obra Social — custom component via Controller */}
              <Controller
                name="obraSocial"
                control={control}
                render={({ field }) => (
                  <InsuranceAutocomplete
                    value={field.value || ''}
                    onChange={(e: any) => field.onChange(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Seleccionar..."
                  />
                )}
              />
              <FieldError error={errors.obraSocial} />

              {/* N° de Afiliado */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <Hash size={16} className="mr-2 text-gray-500" />
                  N° de Afiliado
                </label>
                <input
                  {...register('numeroAfiliado')}
                  type="text"
                  placeholder="1234-5678-90"
                  className={inputCls(errors.numeroAfiliado)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.numeroAfiliado} />
              </div>

              {/* Alergias */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <AlertTriangle size={16} className="mr-2 text-gray-500" />
                  Alergias
                </label>
                <input
                  {...register('alergias')}
                  type="text"
                  placeholder="Ninguna / Penicilina, Polen..."
                  className={inputCls(errors.alergias)}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.alergias} />
              </div>

              {/* Antecedentes */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <Stethoscope size={16} className="mr-2 text-gray-500" />
                  Antecedentes
                </label>
                <textarea
                  {...register('antecedentes')}
                  rows={2}
                  placeholder="Antecedentes médicos relevantes..."
                  className={`resize-none ${inputCls(errors.antecedentes)}`}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.antecedentes} />
              </div>

              {/* Historia Clínica (Archivo) */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <FileText size={16} className="mr-2 text-gray-500" />
                  Historia Clínica (archivo)
                </label>
                <div className="flex items-center">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isSubmitting}
                    id="edit-historia-clinica-file"
                  />
                  <label
                    htmlFor="edit-historia-clinica-file"
                    className="text-sm inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F1F6F5] text-black shadow-sm hover:bg-gray-200 select-none cursor-pointer"
                  >
                    <FileText size={16} />
                    Adjuntar
                  </label>

                  {/* Botón quitar archivo */}
                  {(historiaClinicaFile || (originalRecord && !shouldRemoveRecord)) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (historiaClinicaFile) {
                          setHistoriaClinicaFile(null);
                        } else {
                          setShouldRemoveRecord(true);
                        }
                      }}
                      className="ml-2 p-1 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      title="Eliminar archivo"
                    >
                      <X size={16} />
                    </button>
                  )}

                  <span className="ml-3 text-sm text-gray-600 truncate max-w-[12rem] sm:max-w-[16rem] md:max-w-[20rem]">
                    {fileLabel}
                  </span>
                </div>
              </div>

              {/* Estado */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <Activity size={16} className="mr-2 text-gray-500" />
                  Estado
                </label>
                <select
                  {...register('estado')}
                  className={`text-sm ${inputCls(errors.estado)}`}
                  disabled={isSubmitting}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
                <FieldError error={errors.estado} />
              </div>

              {/* Notas */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <FileText size={16} className="mr-2 text-gray-500" />
                  Notas
                </label>
                <textarea
                  {...register('notas')}
                  rows={3}
                  placeholder="Observaciones adicionales..."
                  className={`resize-none ${inputCls(errors.notas)}`}
                  disabled={isSubmitting}
                />
                <FieldError error={errors.notas} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-white/80 backdrop-blur sticky bottom-0">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 rounded-xl border text-gray-700 hover:bg-gray-50"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
