// Este archivo define las interfaces TypeScript para las entidades de la base de datos.
// Los campos usan los nombres reales de las columnas PostgreSQL (snake_case)
// más los alias camelCase que mapDbPatient genera en el cliente.

export interface Patient {
    // ─── Identificadores ──────────────────────────────────────────────────────
    id: string;
    organization_id?: string;
    tenant_id?: string;

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

export interface Appointment {
    id: string;
    patient_id: string;
    date: string;
    time: string;
    end_time?: string;
    type: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    notes?: string;
    created_at?: string;
}

export interface ClinicalRecord {
    id: string;
    patient_id?: string;
    date?: string;
    diagnosis?: string;
    treatment?: string;
    notes?: string;
    created_at?: string;
}
