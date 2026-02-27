import { supabase } from '../config/supabaseClient';
import { Session } from '@supabase/supabase-js';

export class AppointmentRepository {
    static async getAppointments(fromISO: string, toISO: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                patient:patients (nombre, dni, telefono, email)
            `)
            .gte('start_time', fromISO)
            .lte('end_time', toISO);

        if (error) throw error;
        return data;
    }

    static async getActiveSchedules(dayOfWeek: number) {
        const { data, error } = await supabase
            .from('schedules')
            .select('*')
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true);
        if (error) throw error;
        return data || [];
    }

    static async getAppointmentsForDay(dayStartBoundISO: string, dayEndBoundISO: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('id, start_time, end_time')
            .gte('start_time', dayStartBoundISO)
            .lte('start_time', dayEndBoundISO)
            .neq('status', 'cancelled');
        if (error) throw error;
        return data || [];
    }

    static async getServices(userId: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('services')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data?.services || [];
    }

    static async getActiveWorkingDays() {
        const { data, error } = await supabase
            .from('schedules')
            .select('day_of_week')
            .eq('is_active', true);
        if (error) throw error;
        return [...new Set(data.map(item => item.day_of_week))].sort();
    }

    static async findPatientByDni(dni: string) {
        const { data, error } = await supabase
            .from('patients')
            .select('id, dni, email')
            .eq('dni', dni)
            .maybeSingle();

        if (error) {
            console.error('Error finding patient by DNI:', error);
            return null;
        }
        return data;
    }

    static async createPatient(patientData: any) {
        const { data, error } = await supabase
            .from('patients')
            .insert([patientData])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    static async insertAppointmentRPC(appointment: any) {
        // Use the new atomic RPC to avoid overlapping concurrent bookings
        const { data, error } = await supabase.rpc('confirm_appointment_safe', {
            p_patient_id: appointment.patient_id,
            p_title: appointment.title,
            p_start_time: appointment.start_time,
            p_end_time: appointment.end_time,
            p_duration: appointment.duration,
            p_appointment_type: appointment.appointment_type,
            p_notes: appointment.notes,
            p_status: appointment.status
        });

        if (error) throw error;

        // Return structured JSON data exactly as the RPC yields
        return data;
    }

    static async updateAppointment(id: string, updates: any) {
        const { data, error } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    static async updateGoogleEventId(id: string, googleEventId: string) {
        const { error } = await supabase
            .from('appointments')
            .update({ google_event_id: googleEventId })
            .eq('id', id);
        if (error) throw error;
    }

    static async getAppointmentGoogleId(id: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('google_event_id')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    static async getPendingGoogleSync(todayISO: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                patient:patients (nombre, dni, telefono, email, obra_social, numero_afiliado)
            `)
            .eq('status', 'confirmed')
            .is('google_event_id', null)
            .gte('start_time', todayISO);

        if (error) throw error;
        return data || [];
    }

    static async deleteAppointment(id: string) {
        const { error } = await supabase
            .from('appointments')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }
}
