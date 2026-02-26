import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppointmentService } from '../services/AppointmentService';
import { message } from 'antd';
import { turnosQueryKey } from './useAppointmentsQuery';

export function useAppointmentsMutations(fromDate: string | null = null, toDate: string | null = null) {
    const queryClient = useQueryClient();
    const currentQueryKey = turnosQueryKey(fromDate, toDate);

    const addMutation = useMutation({
        mutationFn: async (data: any) => {
            return await AppointmentService.createAppointment(data);
        },
        onMutate: async (newAppointment) => {
            await queryClient.cancelQueries({ queryKey: turnosQueryKey() });
            const previousTurnos = queryClient.getQueryData<any[]>(currentQueryKey);

            // Optimistic update
            queryClient.setQueryData(currentQueryKey, (old: any[] = []) => {
                // Approximate the shape of a new appointment for instant feedback
                const optimisticAppt = {
                    id: `temp-${Date.now()}`,
                    title: `${newAppointment.tipoTurnoNombre} - ${newAppointment.nombre || 'Paciente'}`,
                    start: newAppointment.fechaHora,
                    end: new Date(new Date(newAppointment.fechaHora).getTime() + (newAppointment.duracion || 30) * 60000).toISOString(),
                    status: newAppointment.status || 'pending',
                    notes: newAppointment.notas,
                    patientName: newAppointment.nombre,
                    patientDni: newAppointment.dni,
                    tipoTurnoNombre: newAppointment.tipoTurnoNombre,
                    tipoTurno: newAppointment.tipoTurnoNombre,
                };
                return [...old, optimisticAppt];
            });

            return { previousTurnos };
        },
        onError: (err, newAppointment, context) => {
            if (context?.previousTurnos) {
                queryClient.setQueryData(currentQueryKey, context.previousTurnos);
            }
            message.error(`Error al crear el turno: ${err.message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['turnos'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string, data: any }) => {
            return await AppointmentService.updateAppointment(id, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: turnosQueryKey() });
            const previousTurnos = queryClient.getQueryData<any[]>(currentQueryKey);

            queryClient.setQueryData(currentQueryKey, (old: any[] = []) => {
                return old.map(turno => {
                    if (turno.id === id) {
                        return {
                            ...turno,
                            ...data,
                            start: data.fechaHora || turno.start,
                            title: data.tipoTurnoNombre ? `${data.tipoTurnoNombre} - ${data.nombre || turno.patientName}` : turno.title
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
            await queryClient.cancelQueries({ queryKey: turnosQueryKey() });
            const previousTurnos = queryClient.getQueryData<any[]>(currentQueryKey);

            queryClient.setQueryData(currentQueryKey, (old: any[] = []) => {
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
        addTurno: async (data: any) => await addMutation.mutateAsync(data),
        updateTurno: async (id: string, data: any) => await updateMutation.mutateAsync({ id, data }),
        deleteTurno: async (id: string) => await deleteMutation.mutateAsync(id),
        isAdding: addMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending
    };
}
