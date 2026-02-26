import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { AppointmentBusinessLogic } from './AppointmentBusinessLogic';
import { GoogleCalendarService } from './GoogleCalendarService';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../schemas/appointment.schema';
import { addMinutes } from 'date-fns';
import { Session } from '@supabase/supabase-js';

export class AppointmentService {
    static async getAppointments(fromISO: string, toISO: string, session: Session | null = null) {
        try {
            const data = await AppointmentRepository.getAppointments(fromISO, toISO);
            return data.map((app: any) => ({
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
            console.error('Error fetching appointments:', error);
            throw error;
        }
    }

    static async getAvailableSlots(date: string, durationMinutes: number, excludeId: string | null = null) {
        return await AppointmentBusinessLogic.getAvailableSlots(date, durationMinutes, excludeId);
    }

    static async getServices(session: Session | null = null) {
        if (!session?.user?.id) return [];
        try {
            return await AppointmentRepository.getServices(session.user.id);
        } catch (error) {
            console.error('Error fetching services:', error);
            return [];
        }
    }

    static async getActiveWorkingDays() {
        try {
            return await AppointmentRepository.getActiveWorkingDays();
        } catch (error) {
            console.error('Error fetching working days:', error);
            return [1, 2, 3, 4, 5];
        }
    }

    static formatEventDescription(data: any) {
        return `
Paciente: ${data.nombre}
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

    static async createAppointment(data: any): Promise<any> {
        try {
            const validatedData = CreateAppointmentSchema.parse({
                ...data,
                patient_id: data.patient_id || '00000000-0000-0000-0000-000000000000',
            });

            let patientId = data.patient_id;
            const cleanDni = validatedData.dni?.trim();

            if (!patientId && cleanDni) {
                const existingPatient = await AppointmentRepository.findPatientByDni(cleanDni);
                if (existingPatient) {
                    patientId = existingPatient.id;
                } else {
                    const newPatient = await AppointmentRepository.createPatient({
                        dni: cleanDni,
                        nombre: validatedData.nombre?.trim(),
                        telefono: validatedData.telefono?.trim(),
                        email: validatedData.email?.trim() || null,
                        obra_social: validatedData.obraSocial?.trim(),
                        numero_afiliado: validatedData.numeroAfiliado?.trim(),
                        alergias: validatedData.alergias,
                        antecedentes: validatedData.antecedentes
                    });
                    patientId = newPatient.id;
                }
            }

            if (!patientId) throw new Error("Patient ID is required or a valid DNI to create/find one.");

            const startTime = new Date(validatedData.fechaHora);
            const endTime = addMinutes(startTime, validatedData.duracion || 30);

            const statusMap: Record<string, string> = {
                'Pendiente': 'pending',
                'Confirmado': 'confirmed',
                'Completado': 'completed',
                'Cancelado': 'cancelled'
            };

            const appointment = {
                title: `${validatedData.tipoTurnoNombre} - ${validatedData.nombre || 'Paciente'}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration: validatedData.duracion,
                appointment_type: validatedData.tipoTurnoNombre,
                patient_id: patientId,
                notes: validatedData.notas,
                status: statusMap[validatedData.status] || 'confirmed'
            };

            const result = await AppointmentRepository.insertAppointmentRPC(appointment);

            try {
                const description = this.formatEventDescription(validatedData);
                const googleEvent = await GoogleCalendarService.createEvent({
                    ...result,
                    title: appointment.title,
                    patientEmail: data.email || null,
                    notes: description
                });

                if (googleEvent && googleEvent.id) {
                    await AppointmentRepository.updateGoogleEventId(result.id, googleEvent.id);
                }
            } catch (syncError: any) {
                // We rollback the DB insert if Google fails to guarantee syncing consistency
                await AppointmentRepository.deleteAppointment(result.id);
                throw new Error(`Fallo al sincronizar con Google Calendar: ${syncError.message}`);
            }

            return result;
        } catch (error) {
            console.error('Error creating appointment:', error);
            throw error;
        }
    }

    static async updateAppointment(id: string, data: any): Promise<any> {
        try {
            const validatedData = UpdateAppointmentSchema.parse({ ...data, id });

            const startTime = new Date(validatedData.fechaHora);
            const endTime = addMinutes(startTime, validatedData.duracion || 30);

            const statusMap: Record<string, string> = {
                'Pendiente': 'pending',
                'Confirmado': 'confirmed',
                'Completado': 'completed',
                'Cancelado': 'cancelled'
            };

            const updates: Record<string, any> = {
                title: `${validatedData.tipoTurnoNombre} - ${validatedData.nombre || 'Paciente'}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration: validatedData.duracion,
                appointment_type: validatedData.tipoTurnoNombre,
                notes: validatedData.notas,
            };

            if (validatedData.status) {
                updates.status = statusMap[validatedData.status] || validatedData.status;
            }

            const result = await AppointmentRepository.updateAppointment(id, updates);

            try {
                if (result.google_event_id) {
                    const description = this.formatEventDescription(validatedData);
                    await GoogleCalendarService.updateEvent(result.google_event_id, {
                        ...updates,
                        patientEmail: validatedData.email,
                        notes: description
                    });
                }
            } catch (syncError: any) {
                throw new Error(`Fallo al actualizar en Google Calendar: ${syncError.message}`);
            }

            return result;
        } catch (error) {
            console.error('Error updating appointment:', error);
            throw error;
        }
    }

    static async syncPendingAppointments(session: Session | null = null): Promise<void> {
        try {
            const pending = await AppointmentRepository.getPendingGoogleSync(new Date().toISOString());
            if (!pending || pending.length === 0) return;

            console.log(`Sincronizando ${pending.length} turnos pendientes...`);
            for (const appt of pending) {
                try {
                    const eventData = {
                        title: `${appt.title} - ${appt.patient?.nombre || 'Paciente'}`,
                        start_time: appt.start_time,
                        end_time: appt.end_time,
                        notes: appt.notes
                    };

                    const googleEvent = await GoogleCalendarService.createEvent(eventData);

                    if (googleEvent && googleEvent.id) {
                        await AppointmentRepository.updateGoogleEventId(appt.id, googleEvent.id);
                    }
                } catch (e: any) {
                    // We throw instead of swallow to surface this up to the caller
                    throw new Error(`Sincronización fallida para el turno ${appt.id}: ${e.message}`);
                }
            }
        } catch (error) {
            console.error('Error in syncPendingAppointments:', error);
            throw error;
        }
    }

    static async deleteAppointment(id: string): Promise<boolean> {
        try {
            const appointment = await AppointmentRepository.getAppointmentGoogleId(id);
            if (appointment?.google_event_id) {
                try {
                    await GoogleCalendarService.deleteEvent(appointment.google_event_id);
                } catch (syncError: any) {
                    throw new Error(`Fallo al borrar el evento en Google Calendar: ${syncError.message}`);
                }
            }
            return true;
        } catch (error) {
            console.error('Error deleting appointment:', error);
            throw error;
        }
    }
}
