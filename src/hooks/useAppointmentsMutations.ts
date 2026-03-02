import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppointmentService, CreateAppointmentInput, UpdateAppointmentInput } from '../services/AppointmentService';
import { message } from 'antd';
import { turnosQueryKey } from './useAppointmentsQuery';
import { Appointment } from '../types/appointments';

export function useAppointmentsMutations(fromDate: string | null = null, toDate: string | null = null, session: any = null) {
    const queryClient = useQueryClient();
    const currentQueryKey = turnosQueryKey(fromDate, toDate);

    const addMutation = useMutation({
        mutationFn: async (data: CreateAppointmentInput) => {
            return await AppointmentService.createAppointment(data, session);
        },
        onMutate: async (newAppointment) => {
            // Cancel any outgoing refetches so they don't overwrite optimistic update
            await queryClient.cancelQueries({ queryKey: currentQueryKey });

            // Snapshot the previous value
            const previousTurnos = queryClient.getQueryData<Appointment[]>(currentQueryKey);

            // Optimistic update
            queryClient.setQueryData<Appointment[]>(currentQueryKey, (old = []) => {
                const optimisticAppt: Appointment = {
                    id: `temp-${Date.now()}`,
                    title: `${newAppointment.tipoTurnoNombre} - ${newAppointment.nombre || 'Paciente'}`,
                    start: newAppointment.fechaHora,
                    end: new Date(new Date(newAppointment.fechaHora).getTime() + (newAppointment.duracion || 30) * 60000).toISOString(),
                    status: newAppointment.status || 'pending',
                    notes: newAppointment.notas,
                    patientId: newAppointment.patient_id || '',
                    patientName: newAppointment.nombre, // Temporal map
                    tipoTurnoNombre: newAppointment.tipoTurnoNombre,
                    tipoTurno: newAppointment.tipoTurnoNombre,
                };
                return [...old, optimisticAppt];
            });

            // Return context object with the snapshotted value
            return { previousTurnos };
        },
        onError: (err, newAppointment, context) => {
            // Rollback to the previous value if mutation fails
            if (context?.previousTurnos) {
                queryClient.setQueryData(currentQueryKey, context.previousTurnos);
            }
            message.error(`Error al crear el turno: ${err.message}`);
        },
        onSettled: () => {
            // Always refetch after error or success
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string, data: UpdateAppointmentInput }) => {
            return await AppointmentService.updateAppointment(id, data, session);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: currentQueryKey });
            const previousTurnos = queryClient.getQueryData<Appointment[]>(currentQueryKey);

            queryClient.setQueryData<Appointment[]>(currentQueryKey, (old = []) => {
                return old.map(turno => {
                    if (turno.id === id) {
                        return {
                            ...turno,
                            start: data.fechaHora || turno.start,
                            end: data.fechaHora ? new Date(new Date(data.fechaHora).getTime() + (data.duracion || 30) * 60000).toISOString() : turno.end,
                            status: data.status || turno.status,
                            title: data.tipoTurnoNombre ? `${data.tipoTurnoNombre} - ${data.nombre || turno.patientName}` : turno.title,
                            notes: data.notas || turno.notes,
                        };
                    }
                    return turno;
                });
            });

            return { previousTurnos };
        },
        onError: (err, variables, context) => {
            if (context?.previousTurnos) {
                queryClient.setQueryData(currentQueryKey, context.previousTurnos);
            }
            message.error(`Error al actualizar el turno: ${err.message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return await AppointmentService.deleteAppointment(id, session);
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: currentQueryKey });
            const previousTurnos = queryClient.getQueryData<Appointment[]>(currentQueryKey);

            queryClient.setQueryData<Appointment[]>(currentQueryKey, (old = []) => {
                return old.filter(turno => turno.id !== id);
            });

            return { previousTurnos };
        },
        onError: (err, id, context) => {
            if (context?.previousTurnos) {
                queryClient.setQueryData(currentQueryKey, context.previousTurnos);
            }
            message.error(`Error al eliminar el turno: ${err.message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    return {
        addTurno: async (data: CreateAppointmentInput) => await addMutation.mutateAsync(data),
        updateTurno: async (id: string, data: UpdateAppointmentInput) => await updateMutation.mutateAsync({ id, data }),
        deleteTurno: async (id: string) => await deleteMutation.mutateAsync(id),
        isAdding: addMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending
    };
}

