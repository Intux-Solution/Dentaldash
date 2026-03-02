import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { AppointmentBusinessLogic } from './AppointmentBusinessLogic';
import { GoogleCalendarService } from './GoogleCalendarService';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../schemas/appointment.schema';
import { addMinutes } from 'date-fns';
import { Session } from '@supabase/supabase-js';
import * as z from 'zod';

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema> & { patient_id?: string; email?: string };
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema> & { email?: string; status?: string };

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

    static async getAvailableSlots(date: string, durationMinutes: number, excludeId: string | null = null, session: Session | null = null) {
        return await AppointmentBusinessLogic.getAvailableSlots(date, durationMinutes, excludeId, session);
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

    static formatEventDescription(data: Record<string, any>) {
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

    static async createAppointment(data: CreateAppointmentInput, session: Session | null = null): Promise<any> {
        try {
            const validatedData = CreateAppointmentSchema.parse({
                ...data,
                patient_id: data.patient_id || '00000000-0000-0000-0000-000000000000',
            });

            let patientId = data.patient_id;
            // Clean DNI strictly: keep only numbers
            const cleanDni = validatedData.dni ? validatedData.dni.replace(/\D/g, '') : undefined;

            if (!patientId && cleanDni) {
                const existingPatient = await AppointmentRepository.findPatientByDni(cleanDni);

                if (existingPatient?.id) {
                    patientId = existingPatient.id;
                    console.log(`[AppointmentService] Found existing patient by DNI ${cleanDni} -> ID: ${patientId}`);
                } else {
                    console.log(`[AppointmentService] No existing patient found for DNI ${cleanDni}, creating new one.`);
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

            const rpcResult = await AppointmentRepository.insertAppointmentRPC(appointment);

            if (!rpcResult.success) {
                throw new Error(rpcResult.error || "Error: El horario ya no está disponible.");
            }

            // Since RPC only returns { success, id, error }, we construct the full object for Google Calendar
            const result = { ...appointment, id: rpcResult.id };

            try {
                const description = this.formatEventDescription(validatedData);
                const googleEvent = await GoogleCalendarService.createEvent({
                    ...result,
                    title: appointment.title,
                    patientEmail: data.email || null,
                    notes: description
                }, session);

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

    static async updateAppointment(id: string, data: any, session: Session | null = null): Promise<any> {
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
                    }, session);
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
        if (!session?.provider_token) {
            return;
        }

        try {
            const pending = await AppointmentRepository.getPendingGoogleSync(new Date().toISOString());
            if (!pending || pending.length === 0) return;

            for (const appt of pending) {
                try {
                    const eventData = {
                        title: `${appt.title} - ${appt.patient?.nombre || 'Paciente'}`,
                        start_time: appt.start_time,
                        end_time: appt.end_time,
                        notes: appt.notes
                    };

                    const googleEvent = await GoogleCalendarService.createEvent(eventData, session);

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

    static async deleteAppointment(id: string, session: Session | null = null): Promise<boolean> {
        try {
            const appointment = await AppointmentRepository.getAppointmentGoogleId(id);
            if (appointment?.google_event_id) {
                try {
                    await GoogleCalendarService.deleteEvent(appointment.google_event_id, session);
                } catch (syncError: any) {
                    throw new Error(`Fallo al borrar el evento en Google Calendar: ${syncError.message}`);
                }
            }
            await AppointmentRepository.deleteAppointment(id);
            return true;
        } catch (error) {
            console.error('Error deleting appointment:', error);
            throw error;
        }
    }
}
