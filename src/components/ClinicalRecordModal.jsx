import React, { useEffect, useState } from "react";
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

  return (
    <ModalShell title="Historia Clínica" onClose={onClose}>
      <div className="mb-4">
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

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center items-center h-[60vh] border rounded-lg bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : !displayUrl ? (
          <div className="p-4 rounded-lg border bg-gray-50 text-sm text-gray-600">
            No hay historia clínica asociada o no se pudo cargar.
          </div>
        ) : (isPdf(displayUrl) || rawUrl.includes("drive.google.com")) ? (
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
          className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
        >
          Cerrar
        </button>
      </div>
    </ModalShell>
  );
}
