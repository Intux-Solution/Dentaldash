
import { supabase } from '../config/supabaseClient';
import { WORK_HOURS } from '../config/appointments';
import { GoogleCalendarService } from './GoogleCalendarService';

export class AppointmentService {

    /**
     * Obtener turnos en un rango de fechas
     */
    static async getAppointments(from, to, session = null) {
        try {
            // Removemos getSession concurrente que causaba deadlock en F5

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
                tipoTurno: app.appointment_type,
            }));
        } catch (error) {
            throw error;
        }
    }

    /**
     * Calcular horarios disponibles para una fecha y duración
     */
    static async getAvailableSlots(date, durationMinutes, excludeId = null) {
        try {
            // 0. Determinar día de la semana (PARSE LOCAL)
            // date coming as YYYY-MM-DD
            const [yStr, mStr, dStr] = String(date).split('-');
            const inputDate = new Date(
                parseInt(yStr, 10),
                parseInt(mStr, 10) - 1,
                parseInt(dStr, 10),
                12, 0, 0 // Use noon to avoid any edge flips during day math
            );

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
            // Definimos el rango total del día para la query basado en la fecha parsed local
            const dayStartBound = new Date(inputDate);
            dayStartBound.setHours(0, 0, 0, 0);

            const dayEndBound = new Date(inputDate);
            dayEndBound.setHours(23, 59, 59, 999);

            const { data: existing, error } = await supabase
                .from('appointments')
                .select('id, start_time, end_time')
                .gte('start_time', dayStartBound.toISOString())
                .lte('start_time', dayEndBound.toISOString())
                .neq('status', 'cancelled');

            if (error) throw error;

            // 3. Traer eventos de Google Calendar (si está conectado)
            const googleEvents = await GoogleCalendarService.listEvents(dayStartBound, dayEndBound);

            // 4. Time buffer: filter out slots that are in the past or < 30 min from now
            const nowTime = new Date();
            const minTimeForAppt = new Date(nowTime.getTime() + 30 * 60000);

            // 5. Generar slots para CADA rango horario definido
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

                    // Si el turno completo (o su inicio) es anterior al tiempo mínimo, lo omitimos
                    if (slotStart < minTimeForAppt) {
                        current.setMinutes(current.getMinutes() + WORK_HOURS.interval);
                        continue;
                    }

                    // Verificar colisión con turnos locales
                    const isOccupiedLocal = existing.some(app => {
                        if (excludeId && app.id === excludeId) return false;
                        const appStart = new Date(app.start_time);
                        const appEnd = new Date(app.end_time);
                        return (slotStart < appEnd && slotEnd > appStart);
                    });

                    // Verificar colisión con Google Calendar
                    const isOccupiedGoogle = googleEvents.some(event => {
                        // Google "transparency": "transparent" = disponible, "opaque" = ocupado.
                        if (event.transparency === 'transparent') return false;

                        let eventStart, eventEnd;

                        if (event.start.date) {
                            // All-day event: Google gives YYYY-MM-DD
                            // We must parse it as local midnight to avoid UTC shifts
                            const [sY, sM, sD] = event.start.date.split('-').map(Number);
                            eventStart = new Date(sY, sM - 1, sD, 0, 0, 0);

                            const [eY, eM, eD] = event.end.date.split('-').map(Number);
                            eventEnd = new Date(eY, eM - 1, eD, 0, 0, 0);
                        } else {
                            eventStart = new Date(event.start.dateTime);
                            eventEnd = new Date(event.end.dateTime);
                        }

                        // Overlap check: (StartA < EndB) && (EndA > StartB)
                        return (slotStart < eventEnd && slotEnd > eventStart);
                    });

                    if (!isOccupiedLocal && !isOccupiedGoogle) {
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
     * Obtener los servicios configurados en el perfil del usuario
     */
    static async getServices(session = null) {
        try {
            let userId = session?.user?.id;
            if (!userId) {
                const { data } = await supabase.auth.getSession();
                userId = data?.session?.user?.id;
            }
            if (!userId) return [];

            const { data, error } = await supabase
                .from('profiles')
                .select('services')
                .eq('id', userId)
                .single();

            if (error) throw error;
            return data.services || [];
        } catch (error) {
            console.error('Error fetching services:', error);
            return [];
        }
    }

    /**
     * Obtener los días laborales activos desde la configuración
     */
    static async getActiveWorkingDays() {
        try {
            const { data, error } = await supabase
                .from('schedules')
                .select('day_of_week')
                .eq('is_active', true);

            if (error) throw error;

            // Extraer días únicos
            const days = [...new Set(data.map(item => item.day_of_week))].sort();
            return days;
        } catch (error) {
            console.error('Error fetching working days:', error);
            // Fallback a los días por defecto si falla la DB, pero idealmente debería retornar vacío o error
            return [1, 2, 3, 4, 5]; // L-V default fallback
        }
    }

    /**
     * Helper para formatear la descripción del evento de Google
     */
    static formatEventDescription(data) {
        return `
Pacinte: ${data.nombre}
DNI: ${data.dni}
Teléfono: ${data.telefono}
Email: ${data.email || 'No informado'}
Obra Social: ${data.obraSocial || 'No informada'}
Nro Afiliado: ${data.numeroAfiliado || '-'}

Tipo de Turno: ${data.tipoTurnoNombre}
Duración: ${data.duracion} min

Notas:
${data.notas || 'Sin notas adicionales'}
        `.trim();
    }

    /**
     * Crear un turno
     */
    static async createAppointment(data) {
        try {
            // data: { dni, nombre, telefono... tipoTurno, fechaHora, duracion, notes, isNewPatient }

            let patientId;

            // 1. Gestionar paciente
            const cleanDni = data.dni?.trim();

            const { data: existingPatient } = await supabase
                .from('patients')
                .select('id, email')
                .eq('dni', cleanDni)
                .maybeSingle();

            if (existingPatient) {
                patientId = existingPatient.id;
            } else {
                const { data: newPatient, error: createError } = await supabase
                    .from('patients')
                    .insert([{
                        dni: cleanDni,
                        nombre: data.nombre?.trim(),
                        telefono: data.telefono?.trim(),
                        email: data.email?.trim(),
                        obra_social: data.obraSocial?.trim(),
                        numero_afiliado: data.numeroAfiliado?.trim(),
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

                const description = this.formatEventDescription(data);

                const googleEvent = await GoogleCalendarService.createEvent({
                    ...result,
                    title: appointment.title,
                    patientEmail: patientEmail,
                    notes: description // Usamos la descripción enriquecida
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

            // Sync with Google Calendar
            try {
                if (result.google_event_id) {
                    const description = this.formatEventDescription(data);

                    await GoogleCalendarService.updateEvent(result.google_event_id, {
                        ...updates,
                        patientEmail: data.email,
                        notes: description // Update description with rich text
                    });
                } else {
                    console.warn('Skipping Google Update: No google_event_id found for appointment', id);
                }
            } catch (syncError) {
                console.error('Google Sync Error (Update):', syncError);
            }

            return result;
        } catch (error) {
            console.error('Error updating appointment:', error);
            throw error;
        }
    }

    /**
     * Sincronizar turnos pendientes con Google Calendar (Client-Side)
     * Se llama al iniciar la app para asegurar que turnos creados por Bot/Backend se suban a Google.
     */
    static async syncPendingAppointments(session = null) {
        try {
            const today = new Date().toISOString();

            // 1. Buscar turnos futuros, confirmados y SIN google_event_id
            const { data: pending, error } = await supabase
                .from('appointments')
                .select(`
                    *,
                    patient:patients (
                        nombre,
                        dni,
                        telefono,
                        email,
                        obra_social,
                        numero_afiliado
                    )
                `)
                .eq('status', 'confirmed')
                .is('google_event_id', null)
                .gte('start_time', today);

            if (error) throw error;
            if (!pending || pending.length === 0) return;

            console.log(`Sincronizando ${pending.length} turnos pendientes...`);

            for (const appt of pending) {
                try {
                    const googleEvent = await GoogleCalendarService.createEvent({
                        title: `${appt.title} - ${appt.patient?.nombre || 'Paciente'}`,
                        start_time: appt.start_time,
                        end_time: appt.end_time,
                        notes: appt.notes
                    }, session);

                    if (googleEvent && googleEvent.id) {
                        await supabase
                            .from('appointments')
                            .update({
                                google_event_id: googleEvent.id,
                                google_sync_status: 'synced'
                            })
                            .eq('id', appt.id);
                    }
                } catch (e) {
                    console.error(`Error sincronizando turno ${appt.id}:`, e);
                }
            }
        } catch (error) {
            console.error('Error in syncPendingAppointments:', error);
        }
    }

    /**
     * Eliminar (cancelar) turno
     */
    static async deleteAppointment(id) {
        try {
            // 1. Fetch appointment to get google_event_id
            const { data: appointment } = await supabase
                .from('appointments')
                .select('google_event_id')
                .eq('id', id)
                .single();

            if (error) throw error;

            // 3. Delete from Google Calendar
            if (appointment?.google_event_id) {
                try {
                    await GoogleCalendarService.deleteEvent(appointment.google_event_id);
                } catch (syncError) {
                    console.error('Google Sync Error (Delete):', syncError);
                }
            }

            return true;
        } catch (error) {
            console.error('Error deleting appointment:', error);
            throw error;
        }
    }
}
