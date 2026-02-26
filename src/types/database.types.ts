// Este archivo define las interfaces TypeScript para las entidades de la base de datos.
// Los campos usan los nombres reales de las columnas PostgreSQL (snake_case)
// más los alias camelCase que mapDbPatient genera en el cliente.

export interface Patient {
    // ─── Identificadores ──────────────────────────────────────────────────────
    id: string;
    organization_id?: string;
    tenant_id?: string;
    user_id?: string;

    // ─── Datos personales (snake_case = columnas DB) ──────────────────────────
    nombre?: string;
    email?: string;
    dni?: string;
    telefono?: string;
    created_at?: string;
    updated_at?: string;

    // ─── Obra social ──────────────────────────────────────────────────────────
    obra_social?: string;
    numero_afiliado?: string;

    // ─── Clínica ──────────────────────────────────────────────────────────────
    historia_clinica_url?: string;
    alergias?: string | string[];
    antecedentes?: string;
    notas?: string;
    estado?: string;
    ultima_visita?: string;
    fecha_nacimiento?: string;

    // ─── camelCase (alias generados por mapDbPatient en el cliente) ───────────
    obraSocial?: string;
    numeroAfiliado?: string;
    historiaClinica?: string;
    ultimaVisita?: string;
    fechaNacimiento?: string;
    fechaCreacion?: string;
    fechaRegistro?: string;

    // ─── Campos heredados de integraciones anteriores (inglés) ───────────────
    name?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    birth_date?: string;
    address?: string;
    insurance_provider?: string;
    insurance_number?: string;
    medical_history?: string;
    allergies?: string[];
    medications?: string;
    blood_type?: string;
}

export interface PatientPayload {
    id?: string;
    user_id?: string;
    nombre?: string;
    dni?: string;
    telefono?: string;
    email?: string;
    obraSocial?: string;
    numeroAfiliado?: string;
    fechaNacimiento?: string;
    alergias?: string | string[];
    antecedentes?: string;
    notas?: string;
    estado?: string;
    historiaClinicaFile?: File;
    historiaClinica?: string | null;
    historia_clinica_url?: string | null;
}

export interface DbPatientRow {
    id: string;
    user_id?: string;
    nombre: string;
    dni?: string;
    telefono?: string;
    email?: string;
    obra_social?: string;
    numero_afiliado?: string;
    fecha_nacimiento?: string;
    alergias?: string | string[];
    antecedentes?: string;
    notas?: string;
    estado?: string;
    historia_clinica?: string | null;
    historia_clinica_url?: string | null;
    ultima_visita?: string;
    created_at?: string;
    [key: string]: any;
}



export interface ClinicalRecord {
    id: string;
    patient_id: string;
    user_id: string;
    fecha: string;
    diagnostico: string;
    tratamiento: string;
    odontogram_state: Record<string, unknown> | null;
    archivo_url?: string;
    created_at: string;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
