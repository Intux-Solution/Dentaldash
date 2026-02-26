import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppointmentService } from '../services/AppointmentService';
import { message } from 'antd';
import { turnosQueryKey } from './useAppointmentsQuery';
import { Appointment, AppointmentPayload } from '../types/appointments';

export function useAppointmentsMutations(fromDate: string | null = null, toDate: string | null = null) {
    const queryClient = useQueryClient();
    const currentQueryKey = turnosQueryKey(fromDate, toDate);

    const addMutation = useMutation({
        mutationFn: async (data: AppointmentPayload) => {
            return await AppointmentService.createAppointment(data);
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
                    title: `${newAppointment.appointment_type} - ${newAppointment.title || 'Paciente'}`,
                    start: newAppointment.start_time,
                    end: new Date(new Date(newAppointment.start_time).getTime() + (newAppointment.duration || 30) * 60000).toISOString(),
                    status: newAppointment.status || 'pending',
                    notes: newAppointment.notes,
                    patientId: newAppointment.patient_id,
                    patientName: newAppointment.title, // Temporal map
                    tipoTurnoNombre: newAppointment.appointment_type,
                    tipoTurno: newAppointment.appointment_type,
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
        mutationFn: async ({ id, data }: { id: string, data: Partial<AppointmentPayload> }) => {
            return await AppointmentService.updateAppointment(id, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: currentQueryKey });
            const previousTurnos = queryClient.getQueryData<Appointment[]>(currentQueryKey);

            queryClient.setQueryData<Appointment[]>(currentQueryKey, (old = []) => {
                return old.map(turno => {
                    if (turno.id === id) {
                        return {
                            ...turno,
                            ...data,
                            start: data.start_time || turno.start,
                            end: data.end_time || turno.end,
                            status: data.status || turno.status,
                            title: data.appointment_type ? `${data.appointment_type} - ${data.title || turno.patientName}` : turno.title
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
            return await AppointmentService.deleteAppointment(id);
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
        addTurno: async (data: AppointmentPayload) => await addMutation.mutateAsync(data),
        updateTurno: async (id: string, data: Partial<AppointmentPayload>) => await updateMutation.mutateAsync({ id, data }),
        deleteTurno: async (id: string) => await deleteMutation.mutateAsync(id),
        isAdding: addMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending
    };
}

