import React, { useEffect, useState } from "react";
import { FolderOpen, Upload, X, AlertTriangle, Image as ImageIcon, FileText } from 'lucide-react';
import { StorageService } from "../services/StorageService";
import { PatientService } from "../services/PatientService";
import { supabase } from "../config/supabaseClient";
import ModalShell from "./ModalShell";
import { Patient } from "../types/database.types";
import { Session } from "@supabase/supabase-js";
import { toast } from 'react-hot-toast';

type PreviewKind = 'pdf' | 'doc' | 'image';

/**
 * Deduce el tipo de documento a partir del MIME real del archivo.
 * Necesario para los previews locales (blob:) cuya URL no tiene extensión.
 */
function kindFromMime(mime = ""): PreviewKind {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'doc';
}

/** Deduce el tipo mirando la extensión en cualquiera de las URLs/paths dados. */
function kindFromUrl(...urls: (string | null | undefined)[]): PreviewKind {
  const joined = urls.filter(Boolean).join(' ').toLowerCase();
  if (joined.includes('.pdf')) return 'pdf';
  if (joined.includes('.doc')) return 'doc';
  return 'image';
}

export interface ClinicalRecordModalProps {
  open: boolean;
  patient: Patient | null | any; // Falling back to any if patient schema in use differs
  onClose: () => void;
  session: Session | null;
}

export default function ClinicalRecordModal({ open, patient, onClose, session }: ClinicalRecordModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localRawUrl, setLocalRawUrl] = useState<string | null>(null);
  const [instantPreviewUrl, setInstantPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);

  // Sincronizar prop patient con estado local al abrir o cambiar de paciente.
  // Depende del ID y no de la referencia del objeto: ver la nota equivalente en
  // ConsentimientoModal (una dependencia por referencia borraba el archivo recien subido).
  useEffect(() => {
    if (!patient) return;
    setLocalRawUrl(
      patient.historiaUrl ||
      patient.odontogramaUrl ||
      patient.odontograma ||
      patient.historiaClinica ||
      patient.historiaClinicaUrl ||
      patient.historia_clinica_url ||
      ""
    );
    // Limpiar preview temporal al cambiar de paciente
    setInstantPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewKind(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id ?? patient?._id, open]);

  // Fetch signed URL if it's a path, or use it directly if it's a public URL
  useEffect(() => {
    let active = true;

    async function fetchUrl() {
      try {
        if (active) setLoading(true);
        const url = await StorageService.getValidRecordUrl(localRawUrl as string);
        if (active) setSignedUrl(url);
      } catch (errUnknown: unknown) {
        const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
        toast.error("Error al cargar el archivo de la historia clínica.");
        console.error("Error fetching signed URL:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (open) {
      if (instantPreviewUrl) {
        // If we are showing a local preview, DO NOT fetch from supabase
        setSignedUrl(instantPreviewUrl);
      } else if (localRawUrl && localRawUrl !== 'Sin archivo' && localRawUrl !== '-') {
        fetchUrl();
      } else {
        setSignedUrl(null);
      }
    } else {
      setSignedUrl(null);
      setPreviewKind(null);
      if (instantPreviewUrl) {
        URL.revokeObjectURL(instantPreviewUrl);
        setInstantPreviewUrl(null);
      }
    }

    return () => { active = false; };
  }, [localRawUrl, open, instantPreviewUrl]);

  // Los PDF guardados se previsualizan desde un blob: same-origin en vez de embeber
  // la URL firmada de Supabase. La firma caduca a la hora y el <iframe> queda en
  // blanco; el blob no. Ver StorageService.downloadAsObjectUrl.
  useEffect(() => {
    const isStoredPdf =
      open &&
      !instantPreviewUrl &&
      typeof localRawUrl === 'string' &&
      !localRawUrl.startsWith('http') &&
      localRawUrl.toLowerCase().endsWith('.pdf');

    if (!isStoredPdf) {
      setPdfObjectUrl(null);
      return;
    }

    let active = true;
    let created: string | null = null;

    StorageService.downloadAsObjectUrl(localRawUrl as string).then(url => {
      if (!url) return;
      if (!active) { URL.revokeObjectURL(url); return; }
      created = url;
      setPdfObjectUrl(url);
    });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [localRawUrl, open, instantPreviewUrl]);

  if (!open || !patient) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Visualizar inmediatamente para UX perfecta e inmune a tiempos de red
    const objectUrl = URL.createObjectURL(file);
    setInstantPreviewUrl(objectUrl);
    setPreviewKind(kindFromMime(file.type));
    setSignedUrl(objectUrl);

    try {
      setLoading(true);

      const userId = session?.user?.id;
      if (!userId) throw new Error("No hay sesión activa");

      const newPath = await PatientService.uploadClinicalRecord(file, userId);

      if (!newPath) {
        throw new Error("No se pudo obtener la ruta del archivo subido");
      }

      const oldUrl = localRawUrl;
      // Immediately clear the old raw URL so the useEffect doesn't try to fetch it
      // while we are deleting it or uploading the new one
      setLocalRawUrl(null);

      if (oldUrl && !oldUrl.startsWith('http') && oldUrl !== 'Sin archivo' && oldUrl !== '-') {
        try {
          await StorageService.deleteFile(oldUrl, 'clinical-records');
        } catch (deleteErrUnknown: unknown) {
          const deleteErr = deleteErrUnknown instanceof Error ? deleteErrUnknown : new Error(String(deleteErrUnknown) || "Ocurrió un error inesperado.");
          console.warn('Could not delete old clinical record file, proceeding anyway:', deleteErr);
        }
      }

      const { error: updateError } = await supabase
        .from('patients')
        .update({ historia_clinica_url: newPath })
        .eq('id', patient.id)
        .eq('user_id', userId);

      if (updateError) throw new Error(`Error al guardar en base de datos: ${updateError.message}`);

      // Descartar el preview local ANTES de fijar el path real: así el efecto pide
      // la URL firmada (con extensión real) en vez de quedarse pegado al blob:,
      // que no permite renderizar PDF ni Word.
      URL.revokeObjectURL(objectUrl);
      setInstantPreviewUrl(null);
      setPreviewKind(null);
      setLocalRawUrl(newPath);
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      e.target.value = '';
      toast.success("Archivo subido exitosamente");
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      // Revert if upload fails
      URL.revokeObjectURL(objectUrl);
      setInstantPreviewUrl(null);
      setPreviewKind(null);
      setSignedUrl(null);
      console.error("Upload error:", err);
      if (err.message?.includes('violates row-level security policy')) {
        toast.error("No tienes permisos para subir este archivo.");
      } else {
        toast.error("Error al subir el archivo: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const displayUrl = signedUrl;
  const isGoogleDrive = typeof localRawUrl === 'string' && localRawUrl.includes('drive.google.com');
  const kind: PreviewKind = previewKind ?? kindFromUrl(localRawUrl, displayUrl);

  return (
    <ModalShell
      title="Historia Clínica"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => displayUrl && window.open(displayUrl, '_blank')}
            disabled={!displayUrl || loading}
            className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 font-semibold hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <FolderOpen size={18} />
            <span>Abrir</span>
          </button>

          <label className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 cursor-pointer transition-all">
            <Upload size={18} />
            <span>{localRawUrl ? 'Modificar' : 'Adjuntar Nuevo'}</span>
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf,.doc,.docx" />
          </label>

          <button
            onClick={onClose}
            className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
          >
            <X size={18} />
            <span>Cerrar</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Preview Area */}
        <div className="w-full aspect-[4/3] bg-gray-50 rounded-2xl border border-dashed border-gray-300 overflow-hidden flex items-center justify-center relative group">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
              <span className="text-sm text-gray-500 font-medium">Cargando documento...</span>
            </div>
          ) : !localRawUrl ? (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <ImageIcon size={64} strokeWidth={1} />
              <span className="text-sm font-medium">No hay archivo seleccionado</span>
            </div>
          ) : !displayUrl ? (
            <div className="flex flex-col items-center gap-3 text-amber-500">
              <AlertTriangle size={48} />
              <span className="text-sm font-bold uppercase tracking-wider text-center px-4">Error cargando archivo</span>
            </div>
          ) : kind === 'doc' ? (
            <div className="flex flex-col items-center justify-center gap-4 p-6 flex-1">
              <FileText size={64} strokeWidth={1} className="text-blue-500" />
              <p className="text-sm text-gray-500 text-center font-medium">
                Los archivos Word no se pueden previsualizar en el navegador.
              </p>
              <a
                href={displayUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm"
              >
                <FolderOpen size={18} />
                Abrir documento
              </a>
            </div>
          ) : kind === 'pdf' || isGoogleDrive ? (
            <div className="w-full h-full flex flex-col">
              {/* Desktop: inline iframe */}
              <iframe title="Historia Clínica" src={pdfObjectUrl ?? displayUrl} className="flex-1 w-full border-none hidden sm:block" />
              {/* Mobile fallback: iframe often fails silently on iOS/Android */}
              <div className="flex flex-col items-center justify-center gap-4 p-6 sm:hidden flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-gray-500 text-center font-medium">Los PDF no se pueden previsualizar en dispositivos móviles.</p>
                <a
                  href={displayUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Abrir PDF en nueva pestaña
                </a>
              </div>
              {/* Desktop: also show subtle link below iframe for convenience */}
              <a
                href={displayUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center justify-center gap-1.5 py-2 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Abrir en nueva pestaña
              </a>
            </div>
          ) : (
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full h-full flex items-center justify-center cursor-zoom-in"
              title="Abrir imagen en pestaña nueva"
            >
              <img src={displayUrl} alt="Historia Clínica" className="w-full h-full object-contain" />
            </a>
          )}
        </div>

        {/* Info or helper text if needed */}
        {!localRawUrl && (
          <p className="text-center text-sm text-gray-500 italic">
            Sube un archivo (Imagen, PDF o Word) para verlo aquí.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

