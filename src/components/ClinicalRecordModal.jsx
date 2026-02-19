import React, { useEffect, useState } from "react";
import { X, Calendar, Download, Trash2, FileText, ExternalLink, RefreshCw, Upload, AlertTriangle } from 'lucide-react';
import ModalShell from "./ModalShell";
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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Soportar varias keys
  const rawUrl = patient ? (
    patient.historiaUrl ||
    patient.odontogramaUrl ||
    patient.odontograma ||
    patient.historiaClinica ||
    patient.historiaClinicaUrl ||
    ""
  ) : "";

  // Fetch signed URL if it's a path, or use it directly if it's a public URL (legacy/Google)
  useEffect(() => {
    let active = true;

    async function fetchUrl() {
      if (!rawUrl) {
        if (active) setSignedUrl(null);
        return;
      }

      // If it looks like a full URL (http/https), use it directly
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        if (active) setSignedUrl(rawUrl);
        return;
      }

      // Prevenir intentos de firmar placeholders o strings inválidos
      const isLikelyPath = typeof rawUrl === 'string' &&
        rawUrl.length > 5 &&
        !rawUrl.includes(' ') &&
        !['Sin archivo', 'Sin historia clínica', 'Sin historia clinica', '-'].includes(rawUrl);

      if (!isLikelyPath) {
        if (active) setSignedUrl(null);
        return;
      }

      // Otherwise, assume it's a Storage path and get a signed URL
      try {
        if (active) setLoading(true);
        const url = await StorageService.getSignedUrl(rawUrl); // Default bucket is 'clinical-records'
        if (active) setSignedUrl(url);
      } catch (err) {
        console.error("Error fetching signed URL:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (open && patient) {
      setSignedUrl(null); // Limpiar URL previa al cambiar paciente o abrir
      fetchUrl();
    } else {
      setSignedUrl(null);
    }

    return () => { active = false; };
  }, [rawUrl, open, patient]);

  if (!open || !patient) return null;

  const ultimaVisita = patient.ultimaVisita || "—";
  const ultimoMotivo =
    patient.ultimoMotivo ||
    patient.motivoUltimoTurno ||
    patient.ultimoTurnoMotivo ||
    "No especificado";

  const displayUrl = signedUrl;

  const handleDelete = async () => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este archivo? Esta acción borrará el archivo de la base de datos definitivamente.")) return;

    try {
      setLoading(true);
      await StorageService.deleteFile(rawUrl, 'clinical-records');

      // Update DB
      const { supabase } = await import('../config/supabaseClient');
      await supabase.from('patients').update({ historia_clinica_url: null }).eq('id', patient.id);

      onClose();
      // Notify parent to refresh
      window.dispatchEvent(new CustomEvent('patients:refresh'));
    } catch (err) {
      alert("Error al eliminar el archivo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);

      // 1. Upload new file
      const { PatientService } = await import('../services/PatientService');
      const newPath = await PatientService.uploadClinicalRecord(file, patient.nombre);

      // 2. Delete old file if exists and it is a path
      if (rawUrl && !rawUrl.startsWith('http')) {
        await StorageService.deleteFile(rawUrl, 'clinical-records');
      }

      // 3. Update DB
      const { supabase } = await import('../config/supabaseClient');
      await supabase.from('patients').update({ historia_clinica_url: newPath }).eq('id', patient.id);

      onClose();
      // Notify parent to refresh
      window.dispatchEvent(new CustomEvent('patients:refresh'));
    } catch (err) {
      alert("Error al cambiar el archivo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Historia Clínica" onClose={onClose}>
      <div className="mb-4 flex justify-between items-start">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            {patient.nombre}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Último turno: </span>
            {ultimaVisita}
            <span className="mx-2">•</span>
            <span className="font-medium text-gray-700">Motivo: </span>
            {ultimoMotivo}
          </div>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors">
            Cambiar Archivo
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
          </label>
          {rawUrl && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center items-center h-[60vh] border rounded-lg bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : !rawUrl ? (
          /* Caso 1: No hay archivo asignado en BD */
          <div className="flex flex-col items-center justify-center p-12 rounded-xl border-2 border-dashed bg-gray-50 text-gray-500">
            <div className="text-sm font-medium mb-4">No hay historia clínica asociada.</div>
            <label className="cursor-pointer px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all shadow-sm">
              Subir Historia Clínica
              <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
            </label>
          </div>
        ) : !displayUrl ? (
          /* Caso 2: Hay path en BD pero no se pudo obtener URL (Archivo borrado/invalido) */
          <div className="flex flex-col items-center justify-center h-[60vh] rounded-xl border-2 border-dashed border-red-200 bg-red-50 p-8 text-center">
            <AlertTriangle size={48} className="text-red-400 mb-4" />
            <h3 className="text-lg font-bold text-red-700 mb-2">Archivo No Encontrado</h3>
            <p className="text-sm text-red-600 mb-6 max-w-sm">
              El archivo figura en la base de datos pero no se encuentra en el servidor de almacenamiento. Es posible que haya sido eliminado externamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors shadow-sm"
              >
                Limpiar Registro Roto
              </button>
              <label className="cursor-pointer px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors shadow-sm">
                Subir Nuevo
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-4 font-mono">{rawUrl}</p>
          </div>
        ) : (isPdf(displayUrl) || (typeof rawUrl === 'string' && rawUrl.includes("drive.google.com"))) ? (
          <div className="h-[60vh] rounded-lg border overflow-hidden">
            <iframe title="Historia Clínica" src={displayUrl} className="w-full h-full" />
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <img
              src={displayUrl}
              alt="Historia Clínica"
              className="w-full h-auto object-contain bg-white"
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {displayUrl && (
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(displayUrl);
                alert('Link copiado al portapapeles');
              }}
              className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 mr-auto"
            >
              Copiar Link
            </button>
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
            >
              Abrir en pestaña nueva
            </a>
          </>
        )}
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-lg bg-gray-900 text-white font-bold hover:bg-black transition-all"
        >
          Cerrar
        </button>
      </div>
    </ModalShell>
  );
}
