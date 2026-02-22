export interface Patient {
    id: string;
    name?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    dni?: string;
    birth_date?: string;
    address?: string;
    insurance_provider?: string;
    insurance_number?: string;
    medical_history?: string;
    allergies?: string[];
    medications?: string;
    blood_type?: string;
    created_at?: string;
    updated_at?: string;
    organization_id?: string;
    tenant_id?: string;
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
