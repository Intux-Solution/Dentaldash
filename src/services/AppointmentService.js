
import { supabase } from '../config/supabaseClient';
import { WORK_HOURS, APPOINTMENT_TYPES } from '../config/appointments';
import { to24h } from '../utils/appointments';
import { GoogleCalendarService } from './GoogleCalendarService';

export class AppointmentService {

    /**
     * Obtener turnos en un rango de fechas
     */
    static async getAppointments(from, to) {
        try {
            const { data, error } = await supabase
                .from('appointments')
                .select(`
          *,
          patient:patients (
            nombre,
            dni,
            telefono,
            email
          )
        `)
                .gte('start_time', from)
                .lte('end_time', to);

            if (error) throw error;

            return data.map(app => ({
                id: app.id,
                title: app.title,
                start: app.start_time,
                end: app.end_time,
                status: app.status,
                notes: app.notes,
                patientId: app.patient_id,
                patientName: app.patient?.nombre,
                patientDni: app.patient?.dni,
                patientPhone: app.patient?.telefono,
                tipoTurnoNombre: app.appointment_type,
                // Helper fields for frontend
                tipoTurno: APPOINTMENT_TYPES.find(t => t.name === app.appointment_type)?.id || 'consulta',
            }));
        } catch (error) {
            console.error('Error fetching appointments:', error);
            throw error;
        }
    }

    /**
     * Calcular horarios disponibles para una fecha y duración
     */
    static async getAvailableSlots(date, durationMinutes, excludeId = null) {
        try {
            // 0. Determinar día de la semana
            const inputDate = new Date(date);
            // getDay() returns 0 (Sun) to 6 (Sat)
            const dayOfWeek = inputDate.getDay();

            // 1. Obtener configuración de horarios para ese día
            const { data: daySchedules, error: schedError } = await supabase
                .from('schedules')
                .select('*')
                .eq('day_of_week', dayOfWeek)
                .eq('is_active', true);

            if (schedError) throw schedError;

            if (!daySchedules || daySchedules.length === 0) {
                return []; // No se trabaja este día
            }

            // 2. Traer turnos existentes ese día (para collision check)
            // Definimos el rango total del día para la query (00:00 a 23:59) para estar seguros
            const dayStartBound = new Date(date);
            dayStartBound.setHours(0, 0, 0, 0);
            const dayEndBound = new Date(date);
            dayEndBound.setHours(23, 59, 59, 999);

            const { data: existing, error } = await supabase
                .from('appointments')
                .select('id, start_time, end_time')
                .gte('start_time', dayStartBound.toISOString())
                .lte('start_time', dayEndBound.toISOString())
                .neq('status', 'cancelled');

            if (error) throw error;

            // 3. Generar slots para CADA rango horario definido
            const slots = [];

            for (const schedule of daySchedules) {
                const [startHour, startMinute] = schedule.start_time.split(':');
                const [endHour, endMinute] = schedule.end_time.split(':');

                const rangeStart = new Date(inputDate);
                rangeStart.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);

                const rangeEnd = new Date(inputDate);
                rangeEnd.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

                let current = new Date(rangeStart);

                while (current < rangeEnd) {
                    const slotStart = new Date(current);
                    const slotEnd = new Date(current.getTime() + durationMinutes * 60000);

                    if (slotEnd > rangeEnd) break;

                    // Verificar colisión
                    const isOccupied = existing.some(app => {
                        if (excludeId && app.id === excludeId) return false;
                        const appStart = new Date(app.start_time);
                        const appEnd = new Date(app.end_time);
                        return (slotStart < appEnd && slotEnd > appStart);
                    });

                    if (!isOccupied) {
                        slots.push(
                            slotStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
                        );
                    }

                    // Avanzar por intervalo (hardcoded 30 mins o configurable si quisieran)
                    current.setMinutes(current.getMinutes() + WORK_HOURS.interval);
                }
            }

            // Ordenar y eliminar duplicados (por si se solapan rangos configurados)
            return Array.from(new Set(slots)).sort();

        } catch (error) {
            console.error('Error getting available slots:', error);
            return [];
        }
    }

    /**
     * Crear un turno
     */
    static async createAppointment(data) {
        try {
            // data: { dni, nombre, telefono... tipoTurno, fechaHora, duracion, notes, isNewPatient }

            let patientId;

            // 1. Gestionar paciente
            const { data: existingPatient } = await supabase
                .from('patients')
                .select('id, email')
                .eq('dni', data.dni)
                .single();

            if (existingPatient) {
                patientId = existingPatient.id;
                // Podríamos actualizar info si cambió, pero por simplicidad asumimos que usa el servicio de pacientes para eso
            } else {
                const { data: newPatient, error: createError } = await supabase
                    .from('patients')
                    .insert([{
                        dni: data.dni,
                        nombre: data.nombre,
                        telefono: data.telefono,
                        email: data.email,
                        obra_social: data.obraSocial,
                        numero_afiliado: data.numeroAfiliado,
                        alergias: data.alergias,
                        antecedentes: data.antecedentes
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                patientId = newPatient.id;
            }

            // 2. Crear appointment
            const startTime = new Date(data.fechaHora);
            const endTime = new Date(startTime.getTime() + (data.duracion || 30) * 60000);

            const appointment = {
                title: `${data.tipoTurnoNombre} - ${data.nombre}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration: data.duracion,
                appointment_type: data.tipoTurnoNombre,
                patient_id: patientId,
                notes: data.notas,
                status: 'confirmed'
            };

            const { data: result, error } = await supabase
                .from('appointments')
                .insert([appointment])
                .select()
                .single();

            if (error) throw error;

            // Sync with Google Calendar
            try {
                // Determine patient email (existing or from data)
                const patientEmail = existingPatient ? existingPatient.email : data.email;

                const googleEvent = await GoogleCalendarService.createEvent({
                    ...result,
                    title: appointment.title,
                    patientEmail: patientEmail,
                    notes: appointment.notes
                });

                if (googleEvent && googleEvent.id) {
                    await supabase.from('appointments').update({ google_event_id: googleEvent.id }).eq('id', result.id);
                }
            } catch (syncError) {
                console.error('Google Sync Error:', syncError);
            }

            return result;

        } catch (error) {
            console.error('Error creating appointment:', error);
            throw error;
        }
    }

    /**
     * Actualizar turno
     */
    static async updateAppointment(id, data) {
        try {
            // data: similar to create
            const startTime = new Date(data.fechaHora);
            const endTime = new Date(startTime.getTime() + (data.duracion || 30) * 60000);

            const updates = {
                title: `${data.tipoTurnoNombre} - ${data.nombre}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration: data.duracion,
                appointment_type: data.tipoTurnoNombre,
                notes: data.notas,
            };

            const { data: result, error } = await supabase
                .from('appointments')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return result;
        } catch (error) {
            console.error('Error updating appointment:', error);
            throw error;
        }
    }

    /**
     * Eliminar (cancelar) turno
     */
    static async deleteAppointment(id) {
        try {
            // Hard delete or soft delete?
            // Init DB said "status: cancelled".
            // But BookingForm delete usually means "remove from calendar".
            // Let's hard delete for consistency with previous N8N logic which seemed to remove it.
            // Although keeping history is better.
            // Let's UPDATE status to 'cancelled' so it falls out of queries.

            const { error } = await supabase
                .from('appointments')
                .update({ status: 'cancelled' })
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting appointment:', error);
            throw error;
        }
    }
}
