import React, { useEffect, useState } from "react";
import { X, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { StorageService } from "../services/StorageService";

function isPdf(url = "") {
  if (typeof url !== "string") return false;
  const lowerUrl = url.toLowerCase();
  // Check if it has .pdf extension OR if it's a signed URL from Supabase that might have query params but still be a PDF
  return lowerUrl.includes(".pdf");
}

export default function ClinicalRecordModal({ open, patient, onClose }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localRawUrl, setLocalRawUrl] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose && onClose();
    if (open) {
      window.addEventListener("keydown", onKey);
      // Evitar scroll del body al abrir el modal
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Sincronizar prop patient con estado local al abrir o cambiar de paciente
  useEffect(() => {
    if (patient) {
      setLocalRawUrl(
        patient.historiaUrl ||
        patient.odontogramaUrl ||
        patient.odontograma ||
        patient.historiaClinica ||
        patient.historiaClinicaUrl ||
        ""
      );
    }
  }, [patient, open]);

  // Fetch signed URL if it's a path, or use it directly if it's a public URL
  useEffect(() => {
    let active = true;

    async function fetchUrl() {
      if (!localRawUrl) {
        if (active) setSignedUrl(null);
        return;
      }

      // If it looks like a full URL (http/https), use it directly
      if (localRawUrl.startsWith("http://") || localRawUrl.startsWith("https://")) {
        if (active) setSignedUrl(localRawUrl);
        return;
      }

      // Prevenir intentos de firmar placeholders o strings inválidos
      const isLikelyPath = typeof localRawUrl === 'string' &&
        localRawUrl.length > 5 &&
        !localRawUrl.includes(' ') &&
        !['Sin archivo', 'Sin historia clínica', 'Sin historia clinica', '-'].includes(localRawUrl);

      if (!isLikelyPath) {
        if (active) setSignedUrl(null);
        return;
      }

      // Otherwise, assume it's a Storage path and get a signed URL
      try {
        if (active) setLoading(true);
        const url = await StorageService.getSignedUrl(localRawUrl); // Default bucket is 'clinical-records'
        if (active) setSignedUrl(url);
      } catch (err) {
        console.error("Error fetching signed URL:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (open) {
      setSignedUrl(null); // Limpiar URL previa
      fetchUrl();
    } else {
      setSignedUrl(null);
    }

    return () => { active = false; };
  }, [localRawUrl, open]);

  if (!open || !patient) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);

      // 1. Upload new file
      const { PatientService } = await import('../services/PatientService');
      const newPath = await PatientService.uploadClinicalRecord(file, patient.nombre);

      // 2. Delete old file if exists and it is a path
      if (localRawUrl && !localRawUrl.startsWith('http')) {
        await StorageService.deleteFile(localRawUrl, 'clinical-records');
      }

      // 3. Update DB
      const { supabase } = await import('../config/supabaseClient');
      await supabase.from('patients').update({ historia_clinica_url: newPath }).eq('id', patient.id);

      // 4. Update local state to show new file WITHOUT closing modal
      setLocalRawUrl(newPath);

      // Notify parent to refresh list in background
      window.dispatchEvent(new CustomEvent('patients:refresh'));

      // Reset input para permitir volver a subir el mismo archivo si es necesario
      e.target.value = null;
    } catch (err) {
      alert("Error al cambiar el archivo: " + err.message);
    } finally {
      // El effect de localRawUrl manejará el resto del loading de la URL firmada,
      // pero por si falla y no carga nada nuevo, quitamos el loading.
      setLoading(false);
    }
  };

  const displayUrl = signedUrl;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-opacity">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card - Minimalist UI */}
      <div className="relative z-10 w-full max-w-md bg-white p-8 md:p-10 shadow-2xl flex flex-col justify-between overflow-y-auto max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 md:mb-10">
          <h2 className="text-[22px] font-black uppercase tracking-tight text-black m-0 leading-none">
            Historia Clínica
          </h2>
          <button
            onClick={onClose}
            className="text-black hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={28} strokeWidth={3} />
          </button>
        </div>

        {/* Gray Preview Box */}
        <div className="w-full aspect-square sm:aspect-[4/3] bg-[#F5F5F5] mb-8 md:mb-10 flex items-center justify-center relative group overflow-hidden">
          {loading ? (
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-t-transparent border-black"></div>
          ) : !localRawUrl ? (
            <ImageIcon size={96} strokeWidth={1.5} className="text-black" />
          ) : !displayUrl ? (
            <div className="flex flex-col items-center justify-center text-red-500">
              <AlertTriangle size={64} className="mb-4" />
              <span className="text-sm font-bold uppercase tracking-wider text-center px-4">Error cargando archivo</span>
            </div>
          ) : isPdf(displayUrl) || (typeof localRawUrl === 'string' && localRawUrl.includes("drive.google.com")) ? (
            <div className="w-full h-full relative">
              <iframe title="Historia Clínica" src={displayUrl} className="w-full h-full border-none" />
            </div>
          ) : (
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full h-full flex items-center justify-center bg-[#F5F5F5] cursor-zoom-in"
              title="Abrir imagen en pestaña nueva"
            >
              <img src={displayUrl} alt="Historia Clínica" className="w-full h-full object-contain mix-blend-multiply" />
            </a>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto">
          {/* ABRIR - Upload file */}
          <label className="w-full min-h-[56px] flex items-center justify-center bg-white text-black border-2 border-black font-extrabold text-sm tracking-[0.2em] uppercase cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors m-0">
            Abrir
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
          </label>

          {/* CERRAR */}
          <button
            onClick={onClose}
            className="w-full min-h-[56px] flex items-center justify-center bg-black text-white font-extrabold text-sm tracking-[0.2em] uppercase hover:bg-gray-900 active:bg-gray-800 transition-colors m-0"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}

