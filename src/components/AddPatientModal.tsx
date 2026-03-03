import React, { useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, User, Hash, Phone, FileText, AlertTriangle, Activity, Stethoscope, Paperclip } from 'lucide-react';
import InsuranceAutocomplete from './InsuranceAutocomplete';
import { AddPatientSchema } from '../schemas/patient.schema';
import { message } from 'antd';

// ─── Helpers visuales ─────────────────────────────────────────────────────────
const FieldError = ({ error }: { error?: { message?: string } }) =>
  error ? <p className="mt-1 text-xs text-red-500">{error.message}</p> : null;

const inputCls = (hasError?: any) =>
  `w-full rounded-xl border px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none ${hasError
    ? 'border-red-400 bg-red-50'
    : 'border-transparent bg-[#F5F5F5]'
  }`;

interface AddPatientModalProps {
  open: boolean;
  onClose?: () => void;
  onCreate?: (data: any) => Promise<void>;
}

export default function AddPatientModal({ open: openFlag, onClose, onCreate }: AddPatientModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const [historiaClinicaFile, setHistoriaClinicaFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(AddPatientSchema),
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

  // ─── Manejo de archivo (fuera del esquema Zod) ──────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistoriaClinicaFile(e.target.files?.[0] || null);
    try { attachBtnRef.current?.focus({ preventScroll: true }); } catch { }
  };

  const handleClearFile = () => {
    try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch { }
    setHistoriaClinicaFile(null);
    try { attachBtnRef.current?.focus({ preventScroll: true }); } catch { }
  };

  // ─── Cierre/reset ────────────────────────────────────────────────────────
  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    setHistoriaClinicaFile(null);
    onClose?.();
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const onSubmit = async (validData: any) => {
    if (typeof onCreate !== 'function') {
      console.error('[AddPatientModal] onCreate prop is not a function');
      return;
    }

    try {
      const payload = {
        ...validData,
        historiaClinicaFile: historiaClinicaFile || null,
        ultimaVisita: '-',
      };

      // Cerramos el modal antes de la petición para UX fluida
      handleClose();
      await onCreate(payload);
      message.success('Paciente creado correctamente');
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      message.error(`Error: ${err.message || 'No se pudo crear el paciente'}`);
    }
  };

  if (!openFlag) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-full items-center justify-center py-6 md:py-10 px-4">
        <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] md:max-h-[calc(100vh-5rem)] min-h-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white/80 backdrop-blur min-h-[75px]">
            <h3 className="text-xl font-semibold text-gray-900">Nuevo Paciente</h3>
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

          {/* Body */}
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
                  type="text"
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
                  DNI *
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

              {/* Historia Clínica (Archivo) — fuera del esquema Zod */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <FileText size={16} className="mr-2 text-gray-500" />
                  Historia Clínica (archivo)
                </label>
                <div className="flex items-center">
                  <button
                    type="button"
                    ref={attachBtnRef}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F1F6F5] text-black shadow-sm hover:bg-gray-200 select-none"
                    disabled={isSubmitting}
                  >
                    <Paperclip size={16} />
                    Adjuntar
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    onFocus={(e) => { try { e.target.blur(); } catch { } }}
                    className="hidden"
                    disabled={isSubmitting}
                  />
                  <span className="ml-3 text-sm text-gray-600 truncate max-w-[12rem] sm:max-w-[16rem] md:max-w-[20rem]">
                    {historiaClinicaFile ? historiaClinicaFile.name : 'Sin archivos seleccionados'}
                  </span>
                  {historiaClinicaFile && (
                    <button
                      type="button"
                      onClick={handleClearFile}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                      aria-label="Quitar archivo"
                    >
                      <X size={14} />
                      Quitar
                    </button>
                  )}
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
                  className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
