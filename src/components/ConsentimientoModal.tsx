import React, { useEffect, useState } from "react";
import { FolderOpen, Upload, X, AlertTriangle, Image as ImageIcon, FileText, ShieldCheck } from 'lucide-react';
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

export interface ConsentimientoModalProps {
  open: boolean;
  patient: Patient | null | any;
  onClose: () => void;
  session: Session | null;
}

export default function ConsentimientoModal({ open, patient, onClose, session }: ConsentimientoModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localRawUrl, setLocalRawUrl] = useState<string | null>(null);
  const [instantPreviewUrl, setInstantPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);

  useEffect(() => {
    if (patient) {
      setLocalRawUrl(
        patient.consentimientoUrl ||
        patient.consentimiento_url ||
        ""
      );
      setInstantPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewKind(null);
    }
  }, [patient, open]);

  useEffect(() => {
    let active = true;

    async function fetchUrl() {
      try {
        if (active) setLoading(true);
        const url = await StorageService.getValidRecordUrl(localRawUrl as string);
        if (active) setSignedUrl(url);
      } catch (errUnknown: unknown) {
        const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
        toast.error("Error al cargar el archivo de consentimiento.");
        console.error("Error fetching signed URL:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (open) {
      if (instantPreviewUrl) {
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

  if (!open || !patient) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setInstantPreviewUrl(objectUrl);
    setPreviewKind(kindFromMime(file.type));
    setSignedUrl(objectUrl);

    try {
      setLoading(true);

      const userId = session?.user?.id;
      if (!userId) throw new Error("No hay sesión activa");

      const newPath = await PatientService.uploadConsentimiento(file, userId);

      if (!newPath) {
        throw new Error("No se pudo obtener la ruta del archivo subido");
      }

      const oldUrl = localRawUrl;
      setLocalRawUrl(null);

      if (oldUrl && !oldUrl.startsWith('http') && oldUrl !== 'Sin archivo' && oldUrl !== '-') {
        try {
          await StorageService.deleteFile(oldUrl, 'clinical-records');
        } catch (deleteErrUnknown: unknown) {
          const deleteErr = deleteErrUnknown instanceof Error ? deleteErrUnknown : new Error(String(deleteErrUnknown) || "Ocurrió un error inesperado.");
          console.warn('Could not delete old consentimiento file, proceeding anyway:', deleteErr);
        }
      }

      const { error: updateError } = await supabase
        .from('patients')
        .update({ consentimiento_url: newPath })
        .eq('id', patient.id)
        .eq('user_id', userId);

      if (updateError) throw new Error(`Error al guardar en base de datos: ${updateError.message}`);

      // Descartar el preview local ANTES de fijar el path real: así el efecto de
      // abajo pide la URL firmada (con extensión real) en vez de quedarse pegado
      // al blob:, que no permite renderizar PDF ni Word.
      URL.revokeObjectURL(objectUrl);
      setInstantPreviewUrl(null);
      setPreviewKind(null);
      setLocalRawUrl(newPath);
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      e.target.value = '';
      toast.success("Consentimiento subido exitosamente");
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
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
  const kind: PreviewKind = previewKind ?? kindFromUrl(localRawUrl, displayUrl);

  return (
    <ModalShell
      title="Consentimiento Informado"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => displayUrl && window.open(displayUrl, '_blank')}
            disabled={!displayUrl || loading}
            className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <FolderOpen size={18} />
            <span>Abrir</span>
          </button>

          <label className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 cursor-pointer transition-all">
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
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div>
              <span className="text-sm text-gray-500 font-medium">Cargando documento...</span>
            </div>
          ) : !localRawUrl ? (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <ShieldCheck size={64} strokeWidth={1} />
              <span className="text-sm font-medium">No hay consentimiento adjunto</span>
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
          ) : kind === 'pdf' ? (
            <div className="w-full h-full flex flex-col">
              {/* Desktop: inline iframe */}
              <iframe title="Consentimiento Informado" src={displayUrl} className="flex-1 w-full border-none hidden sm:block" />
              {/* Mobile fallback */}
              <div className="flex flex-col items-center justify-center gap-4 p-6 sm:hidden flex-1">
                <ShieldCheck size={64} strokeWidth={1} className="text-orange-500" />
                <p className="text-sm text-gray-500 text-center font-medium">Los PDF no se pueden previsualizar en dispositivos móviles.</p>
                <a
                  href={displayUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 transition-all shadow-sm"
                >
                  Abrir PDF en nueva pestaña
                </a>
              </div>
              <a
                href={displayUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center justify-center gap-1.5 py-2 text-xs text-orange-600 hover:text-orange-800 font-medium transition-colors"
              >
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
              <img src={displayUrl} alt="Consentimiento Informado" className="w-full h-full object-contain" />
            </a>
          )}
        </div>

        {!localRawUrl && (
          <p className="text-center text-sm text-gray-500 italic">
            Sube un archivo (Imagen, PDF o Word) para verlo aquí.
          </p>
        )}
      </div>
    </ModalShell>
  );
}
