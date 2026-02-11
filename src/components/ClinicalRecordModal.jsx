import React, { useEffect } from "react";
import ModalShell from "./ModalShell";

function isPdf(url = "") {
  return typeof url === "string" && url.toLowerCase().endsWith(".pdf");
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

  const url = rawUrl; // Supabase only

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
        ) : (isPdf(url)) ? (
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
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url);
                alert('Link copiado al portapapeles');
              }}
              className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 mr-auto"
            >
              Copiar Link
            </button>
            <a
              href={rawUrl}
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
