import { supabase } from '../config/supabaseClient';

export class AppointmentRepository {
    static async getAppointments(fromISO: string, toISO: string) {
        // Solapamiento con la ventana, no contención: `start >= from AND end <= to`
        // exigía que el turno entrara COMPLETO en el rango, así que uno de 23:45 a
        // 00:15 no aparecía en ninguno de los dos días. Es la misma convención que
        // usan `getAppointmentsForDay` y la Edge Function `public-booking`.
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                patient:patients (nombre, dni, telefono, email)
            `)
            .lte('start_time', toISO)
            .gte('end_time', fromISO);

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

    static async findPatientByDni(dni: string, userId: string) {
        const { data, error } = await supabase
            .from('patients')
            .select('id, dni, email')
            .eq('dni', dni)
            .eq('user_id', userId)
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
            p_patient_id: appointment.patient_id ?? null,
            p_title: appointment.title ?? null,
            p_start_time: appointment.start_time ?? null,
            p_end_time: appointment.end_time ?? null,
            p_duration: appointment.duration ?? null,
            p_appointment_type: appointment.appointment_type ?? null,
            p_notes: appointment.notes ?? null,
            p_status: appointment.status ?? null
        });

        if (error) throw error;

        // Return structured JSON data exactly as the RPC yields
        return data;
    }

    static async getAppointmentById(id: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    static async updateAppointment(id: string, updates: any, userId: string) {
        // First verify ownership
        const { data: ownCheck, error: ownCheckError } = await supabase
            .from('appointments')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (ownCheckError || !ownCheck) throw new Error("Unauthorized to update this appointment.");

        const { data, error } = await supabase.rpc('update_appointment_safe', {
            p_appointment_id: id ?? null,
            p_patient_id: updates.patient_id ?? null,
            p_title: updates.title ?? null,
            p_start_time: updates.start_time ?? null,
            p_end_time: updates.end_time ?? null,
            p_duration: updates.duration ?? null,
            p_appointment_type: updates.appointment_type ?? null,
            p_notes: updates.notes ?? null,
            p_status: updates.status ?? null
        });

        if (error) throw error;
        return data;
    }

    static async updateGoogleEventId(id: string, googleEventId: string, userId: string) {
        const { error } = await supabase
            .from('appointments')
            .update({ google_event_id: googleEventId })
            .eq('id', id)
            .eq('user_id', userId);
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
            // Se reintentan todos los turnos vigentes sin evento, no solo los
            // 'confirmed': filtrar por ese estado dejaba a los 'pending' (los que crea
            // el link público de reservas) sin volver a intentarse nunca.
            .neq('status', 'cancelled')
            .is('google_event_id', null)
            .gte('start_time', todayISO);

        if (error) throw error;
        return data || [];
    }

    static async deleteAppointment(id: string, userId: string) {
        const { error } = await supabase
            .from('appointments')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    }
}
