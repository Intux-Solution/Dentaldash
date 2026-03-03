import React, { useEffect, useState } from "react";
import { FolderOpen, Upload, X, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { StorageService } from "../services/StorageService";
import { PatientService } from "../services/PatientService";
import { supabase } from "../config/supabaseClient";
import ModalShell from "./ModalShell";
import { Patient } from "../types/database.types";
import { Session } from "@supabase/supabase-js";
import { toast } from 'react-hot-toast';

function isPdf(url = "") {
  if (typeof url !== "string") return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes(".pdf");
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

  // Sincronizar prop patient con estado local al abrir o cambiar de paciente
  useEffect(() => {
    if (patient) {
      setLocalRawUrl(
        patient.historiaUrl ||
        patient.odontogramaUrl ||
        patient.odontograma ||
        patient.historiaClinica ||
        patient.historiaClinicaUrl ||
        patient.historia_clinica_url ||
        ""
      );
      setInstantPreviewUrl(null); // Limpiar preview temporal al cambiar de paciente
    }
  }, [patient, open]);

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
      if (!instantPreviewUrl) {
        setSignedUrl(null);
        fetchUrl();
      }
    } else {
      setSignedUrl(null);
      if (instantPreviewUrl) {
        URL.revokeObjectURL(instantPreviewUrl);
        setInstantPreviewUrl(null);
      }
    }

    return () => { active = false; };
  }, [localRawUrl, open]);

  if (!open || !patient) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Visualizar inmediatamente para UX perfecta e inmune a tiempos de red
    const objectUrl = URL.createObjectURL(file);
    setInstantPreviewUrl(objectUrl);
    setSignedUrl(objectUrl);

    try {
      setLoading(true);

      const userId = session?.user?.id;
      if (!userId) throw new Error("No hay sesión activa");

      const newPath = await PatientService.uploadClinicalRecord(file, userId);

      if (!newPath) {
        throw new Error("No se pudo obtener la ruta del archivo subido");
      }
      if (localRawUrl && !localRawUrl.startsWith('http')) {
        try {
          await StorageService.deleteFile(localRawUrl, 'clinical-records');
        } catch (deleteErrUnknown: unknown) {
          const deleteErr = deleteErrUnknown instanceof Error ? deleteErrUnknown : new Error(String(deleteErrUnknown) || "Ocurrió un error inesperado.");
          console.warn('Could not delete old clinical record file, proceeding anyway:', deleteErr);
        }
      }

      await supabase.from('patients').update({ historia_clinica_url: newPath }).eq('id', patient.id);

      setLocalRawUrl(newPath);
      window.dispatchEvent(new CustomEvent('patients:refresh'));
      e.target.value = '';
      toast.success("Archivo subido exitosamente");
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      // Revert if upload fails
      setInstantPreviewUrl(null);
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
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
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
          ) : isPdf(displayUrl) || (typeof localRawUrl === 'string' && localRawUrl.includes("drive.google.com")) ? (
            <div className="w-full h-full">
              <iframe title="Historia Clínica" src={displayUrl} className="w-full h-full border-none" />
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
            Sube un archivo (Imagen o PDF) para verlo aquí.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

