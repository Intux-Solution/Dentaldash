import { DbPatientRow } from './database.types';

export interface Appointment {
    id: string;
    title: string;
    start: string;
    end: string;
    status: string;
    notes?: string;
    patientId: string;
    patientName?: string;
    patientDni?: string;
    patientPhone?: string;
    tipoTurnoNombre: string;
    tipoTurno: string;
}

export interface AppointmentPayload {
    id?: string;
    patient_id: string;
    title: string;
    start_time: string;
    end_time: string;
    duration: number;
    appointment_type: string;
    notes?: string;
    status: string;
    google_event_id?: string;
}

export interface AppointmentWithPatient extends AppointmentPayload {
    id: string;
    patient: Pick<DbPatientRow, 'nombre' | 'dni' | 'telefono' | 'email' | 'obra_social' | 'numero_afiliado'>;
}
