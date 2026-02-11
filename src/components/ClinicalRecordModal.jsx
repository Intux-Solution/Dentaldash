import React, { useEffect } from "react";
import ModalShell from "./ModalShell";

function isPdf(url = "") {
  return typeof url === "string" && url.toLowerCase().endsWith(".pdf");
}

// Para Drive: usar /preview en iframes
function toDrivePreview(url = "") {
  if (!url) return "";
  return url.includes("drive.google.com/file/d/")
    ? url.replace("/view", "/preview")
    : url;
}

export default function ClinicalRecordModal({ open, patient, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !patient) return null;

  // Soportar varias keys
  const rawUrl =
    patient.historiaUrl ||
    patient.odontogramaUrl ||
    patient.odontograma ||
    patient.historiaClinica ||
    patient.historiaClinicaUrl ||
    "";

  const url = toDrivePreview(rawUrl);

  const ultimaVisita = patient.ultimaVisita || "—";
  const ultimoMotivo =
    patient.ultimoMotivo ||
    patient.motivoUltimoTurno ||
    patient.ultimoTurnoMotivo ||
    "No especificado";

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
        {!url ? (
          <div className="p-4 rounded-lg border bg-gray-50 text-sm text-gray-600">
            No hay historia clínica asociada.
          </div>
        ) : (isPdf(url) || url.includes("drive.google.com")) ? (
          <div className="h-[60vh] rounded-lg border overflow-hidden">
            <iframe title="Historia Clínica" src={url} className="w-full h-full" />
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <img
              src={url}
              alt="Historia Clínica"
              className="w-full h-auto object-contain bg-white"
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {url && (
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
          >
            Abrir en pestaña nueva
          </a>
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
