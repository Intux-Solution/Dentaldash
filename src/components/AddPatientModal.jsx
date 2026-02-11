import React, { useState, useRef } from 'react';
import { X, User, Hash, Phone, Building2, FileText, AlertTriangle, Activity, Stethoscope, Paperclip } from 'lucide-react';

const todayISO = () => new Date().toISOString();

export default function AddPatientModal({ open: openFlag, onClose, onCreate, onCreated }) {
  const submittingRef = useRef(false);
  const fileInputRef = useRef(null);
  const attachBtnRef = useRef(null);
  
  const [form, setForm] = useState({
    nombre: '',
    dni: '',
    telefono: '',
    email: '',
    obraSocial: '',
    numeroAfiliado: '',
    alergias: '',
    antecedentes: '',
    historiaClinica: '',
    estado: 'Activo', // Valor por defecto
    notas: ''
  });
  
  const [historiaClinicaFile, setHistoriaClinicaFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setForm({
      nombre: '',
      dni: '',
      telefono: '',
      email: '',
      obraSocial: '',
      numeroAfiliado: '',
      alergias: '',
      antecedentes: '',
      historiaClinica: '',
      estado: 'Activo',
      notas: ''
    });
    setHistoriaClinicaFile(null);
    setSubmitting(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setHistoriaClinicaFile(file || null);
    // Devolver el foco a un elemento visible y estable
    try { attachBtnRef.current?.focus({ preventScroll: true }); } catch {}
  };

  const handleClearFile = () => {
    try {
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {}
    setHistoriaClinicaFile(null);
    try { attachBtnRef.current?.focus({ preventScroll: true }); } catch {}
  };

  const submit = async () => {
    if (submitting || submittingRef.current) {
      return;
    }

    if (!form.nombre?.trim()) {
      alert('El nombre es obligatorio');
      return;
    }

    setSubmitting(true);
    submittingRef.current = true;

    try {
      const baseData = {
        ...form,
        id: `temp_${Date.now()}`,
        fechaCreacion: todayISO(),
        _createdAt: Date.now(),
        ultimaVisita: '-',
        historiaClinicaFile: historiaClinicaFile || null,
        hasFile: !historiaClinicaFile,
        fileName: historiaClinicaFile?.name,
        fileType: historiaClinicaFile?.type,
        fileSize: historiaClinicaFile?.size,
      };

      if (historiaClinicaFile) {
        baseData.historiaClinicaFile = historiaClinicaFile;
      } 

      if (typeof onCreate !== 'function') {
        throw new Error('onCreate no está definido');
      }

      // Cerramos el modal rápido para mejor UX
      onClose?.();

      // El padre hace el POST y devuelve el paciente creado
      const createdRes = await onCreate(baseData);

      // Normalizamos la respuesta
      const fromServer = (Array.isArray(createdRes) ? createdRes[0]?.patient : createdRes?.patient) || createdRes || {};
      const createdPatient = {
        ...baseData,
        ...fromServer,
        id: fromServer?.id || baseData.id,
        fechaCreacion: fromServer?.fechaCreacion || baseData.fechaCreacion || todayISO(),
        _createdAt: typeof fromServer?._createdAt === 'number' ? fromServer._createdAt : baseData._createdAt,
      };

      if (typeof onCreated === 'function') {
        onCreated(createdPatient);
      }

      resetForm();
    } catch (err) {
      alert(`Error: ${err.message || 'No se pudo crear el paciente'}`);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!openFlag) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 flex h-full items-center justify-center py-6 md:py-10 px-4">
        <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] md:max-h-[calc(100vh-5rem)] min-h-0 overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white/80 backdrop-blur min-h-[75px]">
            <h3 className="text-xl font-semibold text-gray-900">Nuevo Paciente</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
              disabled={submitting}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
            
            {/* 1. Nombre */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <User size={16} className="mr-2 text-gray-500" />
                Nombre *
              </label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                type="text"
                placeholder="Nombre completo del paciente"
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
                required
              />
            </div>

            {/* 2. DNI */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Hash size={16} className="mr-2 text-gray-500" />
                DNI
              </label>
              <input
                name="dni"
                value={form.dni}
                onChange={handleChange}
                type="text"
                placeholder="Número de documento"
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 3. Teléfono */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Phone size={16} className="mr-2 text-gray-500" />
                Teléfono
              </label>
              <input
                name="telefono"
                value={form.telefono}
                onChange={handleChange}
                type="tel"
                placeholder="+54 11 5555-5555"
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 3b. Email */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <User size={16} className="mr-2 text-gray-500" />
                Email
              </label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                type="email"
                placeholder="paciente@correo.com"
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 4. Obra Social */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Building2 size={16} className="mr-2 text-gray-500" />
                Obra Social
              </label>
              <input
                name="obraSocial"
                value={form.obraSocial}
                onChange={handleChange}
                type="text"
                placeholder="OSDE, Swiss Medical, etc."
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 5. Número de Afiliado */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Hash size={16} className="mr-2 text-gray-500" />
                N° de Afiliado
              </label>
              <input
                name="numeroAfiliado"
                value={form.numeroAfiliado}
                onChange={handleChange}
                type="text"
                placeholder="1234-5678-90"
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 6. Alergias */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <AlertTriangle size={16} className="mr-2 text-gray-500" />
                Alergias
              </label>
              <input
                name="alergias"
                value={form.alergias}
                onChange={handleChange}
                type="text"
                placeholder="Ninguna / Penicilina, Polen..."
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm text-sm px-3 py-2 shadow-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 7. Antecedentes */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Stethoscope size={16} className="mr-2 text-gray-500" />
                Antecedentes
              </label>
              <textarea
                name="antecedentes"
                value={form.antecedentes}
                onChange={handleChange}
                rows={2}
                placeholder="Antecedentes médicos relevantes..."
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] text-sm px-3 py-2 resize-none placeholder:text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              />
            </div>

            {/* 8. Historia Clínica (Archivo) */}
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
                >
                  <Paperclip size={16} />
                  Adjuntar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                  onFocus={(e) => { try { e.target.blur(); } catch {} }}
                  className="hidden"
                  disabled={submitting}
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

            {/* 9. Estado */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Activity size={16} className="mr-2 text-gray-500" />
                Estado
              </label>
              <select
                name="estado"
                value={form.estado}
                onChange={handleChange}
                className="text-sm w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent"
                disabled={submitting}
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="En Tratamiento">En Tratamiento</option>
                <option value="Alta">Alta</option>
              </select>
            </div>

            {/* 10. Notas */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <FileText size={16} className="mr-2 text-gray-500" />
                Notas
              </label>
              <textarea
                name="notas"
                value={form.notas}
                onChange={handleChange}
                rows={3}
                placeholder="Observaciones adicionales..."
                className="w-full rounded-xl border border-transparent bg-[#F5F5F5] text-sm px-3 py-2 placeholder:text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent resize-none"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-white/80 backdrop-blur sticky bottom-0">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl border text-gray-700 hover:bg-gray-50"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={submitting || !form.nombre?.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
