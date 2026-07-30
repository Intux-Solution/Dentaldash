import type { LucideIcon } from 'lucide-react';
import { Image as ImageIcon, ShieldCheck, FileText } from 'lucide-react';
import { PatientService } from '../services/PatientService';

/**
 * Strings de clase Tailwind COMPLETOS por tema.
 *
 * Nunca interpolar el token de color (`bg-${color}-600`): Tailwind 3 emite solo
 * las clases que ve literales en los archivos del glob `content`, y el proyecto
 * no tiene `safelist`. Este archivo está bajo `src/`, así que las clases de acá
 * sí se emiten.
 */
export interface DocumentAccentClasses {
    /** Botón "Abrir" (outline) del footer. */
    openButton: string;
    /** Botón "Adjuntar/Modificar" (sólido) del footer. */
    uploadButton: string;
    /** Borde del spinner del preview. */
    spinner: string;
    /** CTA sólido "Abrir PDF en nueva pestaña" (fallback mobile). */
    mobileCta: string;
    /** Link discreto "Abrir en nueva pestaña" (desktop, bajo el iframe). */
    desktopLink: string;
    /** Ícono grande del fallback mobile de PDF. */
    mobileIcon: string;
}

/** Columnas de `patients` que persisten el path de un documento. */
export type PatientDocumentColumn = 'historia_clinica_url' | 'consentimiento_url';

export interface PatientDocumentConfig {
    /** Clave estable, usada como `key` del modal y en tests. */
    id: 'clinical-record' | 'consent';
    /** Título del ModalShell, del <iframe> y del alt de la <img>. */
    title: string;
    /** Campos del objeto `patient` a probar EN ORDEN hasta hallar la URL/path. */
    urlFields: readonly string[];
    /** Columna de `patients` a actualizar tras subir. */
    dbColumn: PatientDocumentColumn;
    /** Sube el archivo y devuelve el PATH relativo dentro del bucket (no la URL). */
    upload: (file: File, userId: string) => Promise<string>;
    /** Ícono del estado vacío. */
    emptyIcon: LucideIcon;
    /** Ícono del fallback mobile de PDF. Default: `emptyIcon`. */
    pdfMobileIcon?: LucideIcon;
    /** Texto del estado vacío. */
    emptyLabel: string;
    /** Toast cuando falla obtener la URL firmada. */
    loadErrorMessage: string;
    /** Toast tras subir con éxito. */
    uploadSuccessMessage: string;
    /** Paleta (ver DocumentAccentClasses). */
    accent: DocumentAccentClasses;
}

/** Bucket de Storage. Compartido por ambos documentos. */
export const PATIENT_DOCUMENTS_BUCKET = 'clinical-records';

export const CLINICAL_RECORD_DOC: PatientDocumentConfig = {
    id: 'clinical-record',
    title: 'Historia Clínica',
    // Varios alias por datos legacy: la columna se leyó con distintos nombres
    // según por dónde pasó el paciente (mapeo del servicio, override del modal).
    urlFields: [
        'historiaUrl',
        'odontogramaUrl',
        'odontograma',
        'historiaClinica',
        'historiaClinicaUrl',
        'historia_clinica_url',
    ],
    dbColumn: 'historia_clinica_url',
    upload: (file, userId) => PatientService.uploadClinicalRecord(file, userId),
    emptyIcon: ImageIcon,
    pdfMobileIcon: FileText,
    emptyLabel: 'No hay archivo seleccionado',
    loadErrorMessage: 'Error al cargar el archivo de la historia clínica.',
    uploadSuccessMessage: 'Archivo subido exitosamente',
    accent: {
        openButton: 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100',
        uploadButton: 'bg-teal-600 hover:bg-teal-700',
        spinner: 'border-teal-600',
        mobileCta: 'bg-teal-600 hover:bg-teal-700',
        desktopLink: 'text-teal-600 hover:text-teal-800',
        mobileIcon: 'text-teal-500',
    },
};

export const CONSENT_DOC: PatientDocumentConfig = {
    id: 'consent',
    title: 'Consentimiento Informado',
    urlFields: ['consentimientoUrl', 'consentimiento_url'],
    dbColumn: 'consentimiento_url',
    upload: (file, userId) => PatientService.uploadConsentimiento(file, userId),
    emptyIcon: ShieldCheck,
    emptyLabel: 'No hay consentimiento adjunto',
    loadErrorMessage: 'Error al cargar el archivo de consentimiento.',
    uploadSuccessMessage: 'Consentimiento subido exitosamente',
    accent: {
        openButton: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
        uploadButton: 'bg-orange-600 hover:bg-orange-700',
        spinner: 'border-orange-600',
        mobileCta: 'bg-orange-600 hover:bg-orange-700',
        desktopLink: 'text-orange-600 hover:text-orange-800',
        mobileIcon: 'text-orange-500',
    },
};
