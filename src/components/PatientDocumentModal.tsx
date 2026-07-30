import React, { useEffect, useState } from "react";
import { FolderOpen, Upload, X, AlertTriangle, FileText, ExternalLink } from 'lucide-react';
import { StorageService } from "../services/StorageService";
import { supabase } from "../config/supabaseClient";
import ModalShell from "./ModalShell";
import { Patient } from "../types/database.types";
import { Session } from "@supabase/supabase-js";
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from "../lib/queryKeys";
import {
  PATIENT_DOCUMENTS_BUCKET,
  type PatientDocumentColumn,
  type PatientDocumentConfig,
} from "../config/patientDocuments";

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

/** Primer campo con un string no vacío, respetando el orden de `fields`. */
function resolveRawUrl(patient: Record<string, unknown>, fields: readonly string[]): string {
  for (const field of fields) {
    const value = patient?.[field];
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

export interface PatientDocumentModalProps {
  open: boolean;
  // `any` a propósito: los pacientes llegan con distintos shapes según el camino
  // (fila cruda, mapeada a camelCase, o con overrides inyectados por el provider).
  patient: Patient | null | any;
  onClose: () => void;
  session: Session | null;
  config: PatientDocumentConfig;
}

/**
 * Modal de un documento adjunto del paciente (historia clínica, consentimiento).
 *
 * Reemplaza a `ClinicalRecordModal` y `ConsentimientoModal`, que eran el mismo
 * componente duplicado (345 y 323 líneas): mismos helpers, mismos cuatro efectos,
 * mismo `handleFileChange` y mismo bloque de preview. Todo lo que difería está en
 * `config` (ver `src/config/patientDocuments.ts`).
 */
export default function PatientDocumentModal({ open, patient, onClose, session, config }: PatientDocumentModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localRawUrl, setLocalRawUrl] = useState<string | null>(null);
  const [instantPreviewUrl, setInstantPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const EmptyIcon = config.emptyIcon;
  const PdfMobileIcon = config.pdfMobileIcon ?? config.emptyIcon;

  // Sincronizar la prop `patient` con el estado local al abrir o cambiar de paciente.
  //
  // Depende del ID y NO de la referencia del objeto: tras subir un archivo el
  // provider vuelve a emitir el paciente varias veces, y una dependencia por
  // referencia reseteaba `localRawUrl` al valor stale — mostrando el estado vacío
  // con el archivo ya guardado.
  useEffect(() => {
    if (!patient) return;
    setLocalRawUrl(resolveRawUrl(patient, config.urlFields));
    // Limpiar preview temporal al cambiar de paciente
    setInstantPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewKind(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id ?? patient?._id, open, config.id]);

  // Resolver la URL firmada si es un path, o usarla directo si ya es pública
  useEffect(() => {
    let active = true;

    async function fetchUrl() {
      try {
        if (active) setLoading(true);
        const url = await StorageService.getValidRecordUrl(localRawUrl as string);
        if (active) setSignedUrl(url);
      } catch (err) {
        toast.error(config.loadErrorMessage);
        console.error("Error fetching signed URL:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (open) {
      if (instantPreviewUrl) {
        // Con un preview local en pantalla NO se consulta a Supabase
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Visualizar inmediatamente: la UX no depende de los tiempos de red
    const objectUrl = URL.createObjectURL(file);
    setInstantPreviewUrl(objectUrl);
    setPreviewKind(kindFromMime(file.type));
    setSignedUrl(objectUrl);

    try {
      setLoading(true);

      const userId = session?.user?.id;
      if (!userId) throw new Error("No hay sesión activa");

      const newPath = await config.upload(file, userId);
      if (!newPath) throw new Error("No se pudo obtener la ruta del archivo subido");

      const oldUrl = localRawUrl;
      // Limpiar el path viejo ya: si no, el efecto de arriba pediría la URL
      // firmada de un archivo que estamos por borrar.
      setLocalRawUrl(null);

      const { error: updateError } = await supabase
        .from('patients')
        .update({ [config.dbColumn]: newPath } as Partial<Record<PatientDocumentColumn, string>>)
        .eq('id', patient.id)
        .eq('user_id', userId);

      if (updateError) throw new Error(`Error al guardar en base de datos: ${updateError.message}`);

      // El archivo viejo se borra DESPUÉS de confirmar el update: si el delete falla
      // (o el proceso se corta acá) el registro sigue apuntando a un archivo válido,
      // en vez de quedar sin archivo por haber borrado el anterior antes de tiempo.
      if (oldUrl && !oldUrl.startsWith('http') && oldUrl !== 'Sin archivo' && oldUrl !== '-') {
        try {
          await StorageService.deleteFile(oldUrl, PATIENT_DOCUMENTS_BUCKET);
        } catch (deleteErr) {
          console.warn(`No se pudo borrar el archivo previo de ${config.title}:`, deleteErr);
        }
      }

      // Descartar el preview local ANTES de fijar el path real: así el efecto pide
      // la URL firmada (con extensión real) en vez de quedarse pegado al blob:,
      // que no permite renderizar PDF ni Word.
      URL.revokeObjectURL(objectUrl);
      setInstantPreviewUrl(null);
      setPreviewKind(null);
      setLocalRawUrl(newPath);
      // Refresca la lista y el detalle del paciente (la key `detail` cuelga del
      // mismo prefijo), para que la fila muestre el documento recién subido.
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      e.target.value = '';
      toast.success(config.uploadSuccessMessage);
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      // Revertir si la subida falla
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

  if (!open || !patient) return null;

  const displayUrl = signedUrl;
  // Un `historia_clinica_url` legacy puede ser un link de Drive sin extensión, que
  // `kindFromUrl` clasificaría como imagen y renderizaría con un <img> roto.
  const isGoogleDrive = typeof localRawUrl === 'string' && localRawUrl.includes('drive.google.com');
  const kind: PreviewKind = previewKind ?? kindFromUrl(localRawUrl, displayUrl);

  return (
    <ModalShell
      title={config.title}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => displayUrl && window.open(displayUrl, '_blank')}
            disabled={!displayUrl || loading}
            className={`flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl border font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all ${config.accent.openButton}`}
          >
            <FolderOpen size={18} />
            <span>Abrir</span>
          </button>

          <label className={`flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-xl text-white font-semibold cursor-pointer transition-all ${config.accent.uploadButton}`}>
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
        {/* Preview */}
        <div className="w-full aspect-[4/3] bg-gray-50 rounded-2xl border border-dashed border-gray-300 overflow-hidden flex items-center justify-center relative group">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className={`animate-spin rounded-full h-10 w-10 border-b-2 ${config.accent.spinner}`}></div>
              <span className="text-sm text-gray-500 font-medium">Cargando documento...</span>
            </div>
          ) : !localRawUrl ? (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <EmptyIcon size={64} strokeWidth={1} />
              <span className="text-sm font-medium">{config.emptyLabel}</span>
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
              {/* Desktop: iframe embebido */}
              <iframe title={config.title} src={pdfObjectUrl ?? displayUrl} className="flex-1 w-full border-none hidden sm:block" />
              {/* Mobile: el iframe falla en silencio en iOS/Android */}
              <div className="flex flex-col items-center justify-center gap-4 p-6 sm:hidden flex-1">
                <PdfMobileIcon size={64} strokeWidth={1} className={config.accent.mobileIcon} />
                <p className="text-sm text-gray-500 text-center font-medium">Los PDF no se pueden previsualizar en dispositivos móviles.</p>
                <a
                  href={displayUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-xl transition-all shadow-sm ${config.accent.mobileCta}`}
                >
                  <ExternalLink size={18} />
                  Abrir PDF en nueva pestaña
                </a>
              </div>
              {/* Desktop: link discreto bajo el iframe */}
              <a
                href={displayUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className={`hidden sm:flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${config.accent.desktopLink}`}
              >
                <ExternalLink size={14} />
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
              <img src={displayUrl} alt={config.title} className="w-full h-full object-contain" />
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
