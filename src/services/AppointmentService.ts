import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { AppointmentBusinessLogic } from './AppointmentBusinessLogic';
import { CalendarSyncService } from './CalendarSyncService';
import { NotificationService } from './NotificationService';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../schemas/appointment.schema';
import { addMinutes } from 'date-fns';
import { Session } from '@supabase/supabase-js';
import { devLog } from '../utils/devLog';
import * as z from 'zod';

/** Turnos rezagados que se sincronizan como máximo por pasada de `syncPendingAppointments`. */
const PENDING_SYNC_BATCH_SIZE = 10;

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema> & { patient_id?: string; email?: string };
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema> & { email?: string; status?: string };

export class AppointmentService {
    static async getAppointments(fromISO: string, toISO: string, _session: Session | null = null) {
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
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
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
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error fetching services:', error);
            return [];
        }
    }

    static async getActiveWorkingDays() {
        try {
            return await AppointmentRepository.getActiveWorkingDays();
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
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
            const validatedData = CreateAppointmentSchema.parse(data);

            let patientId = data.patient_id;
            // Clean DNI strictly: keep only numbers
            const cleanDni = validatedData.dni ? validatedData.dni.replace(/\D/g, '') : undefined;

            if (!patientId && cleanDni) {
                const existingPatient = await AppointmentRepository.findPatientByDni(cleanDni, session?.user?.id ?? '');

                if (existingPatient?.id) {
                    patientId = existingPatient.id;
                    // Sin el DNI en el mensaje: es un dato personal y la consola
                    // del consultorio suele quedar abierta en un equipo compartido.
                    devLog(`[AppointmentService] Paciente existente encontrado -> ID: ${patientId}`);
                } else {
                    devLog('[AppointmentService] Paciente no encontrado, creando uno nuevo.');
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
                status: (validatedData.status ? statusMap[validatedData.status] : undefined) || 'confirmed'
            };

            const rpcResult = await AppointmentRepository.insertAppointmentRPC(appointment);

            if (!rpcResult.success) {
                throw new Error(rpcResult.error || "Error: El horario ya no está disponible.");
            }

            // Since RPC only returns { success, id, error }, we construct the full object for Google Calendar
            const result = { ...appointment, id: rpcResult.id };

            // La sincronización con Google corre server-side (`calendar-sync`) y nunca
            // lanza: el turno ya está guardado y la DB local es la fuente de verdad.
            // `syncFailed` se devuelve para que la UI pueda avisar en vez de callar,
            // que era el problema: el turno quedaba sin google_event_id en silencio.
            const sync = await CalendarSyncService.pushAppointment(result.id, {
                description: this.formatEventDescription(validatedData),
                attendeeEmail: data.email || null,
            });

            if (!sync.synced && sync.reason !== 'not_connected' && sync.reason !== 'not_configured') {
                console.warn(`[AppointmentService] Turno ${result.id} guardado sin sincronizar con Google Calendar (${sync.reason}).`);
            }

            // Aviso por email al paciente y al dentista. No bloquea ni puede fallar el alta.
            await NotificationService.notifyAppointmentCreated(result.id);

            return {
                ...result,
                google_event_id: sync.google_event_id ?? null,
                syncFailed: !sync.synced && sync.reason !== 'not_connected' && sync.reason !== 'not_configured',
            };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error creating appointment:', error);
            throw error;
        }
    }

    static async updateAppointment(id: string, data: any, session: Session | null = null): Promise<any> {
        try {
            const validatedData = UpdateAppointmentSchema.parse({ ...data, id });

            const originalData = await AppointmentRepository.getAppointmentById(id);

            const startTime = new Date(validatedData.fechaHora);
            const endTime = addMinutes(startTime, validatedData.duracion || 30);

            const statusMap: Record<string, string> = {
                'Pendiente': 'pending',
                'Confirmado': 'confirmed',
                'Completado': 'completed',
                'Cancelado': 'cancelled'
            };

            const updates: Record<string, any> = {
                patient_id: data.patient_id || originalData.patient_id,
                title: `${validatedData.tipoTurnoNombre} - ${validatedData.nombre || 'Paciente'}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration: validatedData.duracion,
                appointment_type: validatedData.tipoTurnoNombre,
                notes: validatedData.notas,
                status: validatedData.status ? (statusMap[validatedData.status] || validatedData.status) : originalData.status
            };

            const rpcResult = await AppointmentRepository.updateAppointment(id, updates, session?.user?.id ?? '');

            if (!rpcResult.success) {
                throw new Error(rpcResult.error || "Error: El horario ya no está disponible.");
            }

            const result = rpcResult.data;

            // Mismo criterio que createAppointment: la DB local es la fuente de verdad y
            // Google es best-effort. Si el turno todavía no tenía evento (porque la
            // sincronización original falló), `push_appointment` lo crea ahora.
            const sync = await CalendarSyncService.pushAppointment(id, {
                description: this.formatEventDescription(validatedData),
                attendeeEmail: validatedData.email,
            });

            const syncFailed = !sync.synced && sync.reason !== 'not_connected' && sync.reason !== 'not_configured';
            if (syncFailed) {
                console.warn(`[AppointmentService] Turno ${id} actualizado, pero falló la sincronización con Google Calendar (${sync.reason}).`);
            }

            return { ...result, syncFailed };
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error updating appointment:', error);
            throw error;
        }
    }

    static async syncPendingAppointments(session: Session | null = null): Promise<void> {
        if (!session) return;

        try {
            const pending = await AppointmentRepository.getPendingGoogleSync(new Date().toISOString());
            if (!pending || pending.length === 0) return;

            // Tope por pasada: el resto se reintenta en la siguiente. Un backlog
            // grande encadenaba decenas de llamadas seguidas a la Edge Function.
            for (const appt of pending.slice(0, PENDING_SYNC_BATCH_SIZE)) {
                // `push_appointment` no lanza y ya resuelve por su cuenta si la
                // integración está conectada, así que un turno que falle no frena
                // a los siguientes.
                const sync = await CalendarSyncService.pushAppointment(appt.id, {
                    attendeeEmail: appt.patient?.email || null,
                });

                // Sin integración conectada no tiene sentido recorrer el resto.
                if (!sync.synced && (sync.reason === 'not_connected' || sync.reason === 'not_configured')) {
                    return;
                }
                if (!sync.synced) {
                    console.error(`Sincronización fallida para el turno ${appt.id} (${sync.reason}).`);
                }
            }
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error in syncPendingAppointments:', error);
            throw error;
        }
    }

    static async deleteAppointment(id: string, session: Session | null = null): Promise<boolean> {
        try {
            const appointment = await AppointmentRepository.getAppointmentGoogleId(id);
            if (appointment?.google_event_id) {
                // Best-effort, igual que en create/update: si Google falla igual
                // borramos el turno local en vez de dejarlo trabado.
                await CalendarSyncService.deleteEvent(appointment.google_event_id);
            }
            await AppointmentRepository.deleteAppointment(id, session?.user?.id ?? '');
            return true;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error deleting appointment:', error);
            throw error;
        }
    }
}
