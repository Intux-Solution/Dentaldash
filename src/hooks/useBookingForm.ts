import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentService } from '../services/AppointmentService';
import { PatientService } from '../services/PatientService';
import { combineDateTimeToISO } from '../utils/helpers';
import { message } from 'antd';
import { CreateAppointmentSchema, CreateAppointmentPayload } from '../schemas/appointment.schema';
import { useTurnos } from './useTurnos';

import { useAuth } from '../context/AuthContext';

export function useBookingForm(onSuccess?: () => void, setFormSubmit?: (submitFn: () => void) => void) {
    const { session } = useAuth();
    const { addTurno } = useTurnos();

    // Configured React Hook Form
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        trigger,
        formState: { errors, isSubmitting, isValid },
        reset
    } = useForm<CreateAppointmentPayload>({
        resolver: zodResolver(CreateAppointmentSchema),
        defaultValues: {
            dni: '',
            nombre: '',
            telefono: '',
            email: '',
            obraSocial: '',
            numeroAfiliado: '',
            alergias: '',
            antecedentes: '',
            tipoTurnoNombre: 'Temporal', // Temporary bypass for Zod validaton (requires min 1), overwritten before submit
            fechaHora: new Date().toISOString(), // Temporary bypass, overwritten before submit
            notas: '',
            status: 'Confirmado',
            patient_id: '00000000-0000-0000-0000-000000000000'
        },
        mode: 'onChange' // Triggers validation on change
    });

    // UI state
    const [checkingPatient, setCheckingPatient] = useState(false);
    const [patientFound, setPatientFound] = useState(false);
    const [patientId, setPatientId] = useState<string | null>(null);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [loadingAvailability, setLoadingAvailability] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [patientNotice, setPatientNotice] = useState('');

    // Watch necessary fields for dynamic updates
    const dniStr = watch('dni');
    const obraSocial = watch('obraSocial');

    // Local state purely for UI selection (since API needs a combined ISO string we construct at submit)
    const [selectedTipoTurnoId, setSelectedTipoTurnoId] = useState('');
    const [selectedFecha, setSelectedFecha] = useState('');
    const [selectedHora, setSelectedHora] = useState('');

    // Dynamic Working Days
    const [activeWorkingDays, setActiveWorkingDays] = useState<number[]>([]);
    const [services, setServices] = useState<any[]>([]);

    // Fetch working days on mount
    useEffect(() => {
        const fetchConfig = async () => {
            const [days, servs] = await Promise.all([
                AppointmentService.getActiveWorkingDays(),
                AppointmentService.getServices(session)
            ]);
            setActiveWorkingDays(days);
            setServices(servs);
        };
        fetchConfig();
    }, [session]);

    // Exponer submit del form al contenedor para el botón del footer del modal
    const formRef = React.useRef<HTMLFormElement>(null);
    const hiddenSubmitRef = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        if (typeof setFormSubmit === 'function') {
            setFormSubmit(() => () => {
                try {
                    if (formRef.current?.requestSubmit) {
                        formRef.current.requestSubmit(hiddenSubmitRef.current || undefined);
                    } else {
                        hiddenSubmitRef.current?.click();
                    }
                } catch {
                    try { hiddenSubmitRef.current?.click(); } catch { }
                }
            });
        }
    }, [setFormSubmit]);

    // Debounced checkPatient (simplified for React effect)
    useEffect(() => {
        if (dniStr && dniStr.length >= 7) {
            const timer = setTimeout(() => {
                checkPatient(dniStr);
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setPatientFound(false);
            setPatientNotice('');
            setPatientId(null);
        }
    }, [dniStr]);

    // Check patient by DNI
    const checkPatient = async (dni: string) => {
        setCheckingPatient(true);
        setError('');
        setPatientNotice('');

        try {
            const patient = await PatientService.getPatientByDni(dni);

            if (patient) {
                // Autocompletar datos del paciente encontrado
                setValue('nombre', patient.nombre || patient.name || '', { shouldValidate: true });
                setValue('telefono', patient.telefono || patient.phone || '', { shouldValidate: true });
                setValue('email', patient.email || '', { shouldValidate: true });
                setValue('obraSocial', patient.obraSocial || '', { shouldValidate: true });
                setValue('numeroAfiliado', patient.numeroAfiliado || '', { shouldValidate: true });
                setValue('alergias', patient.alergias || 'Ninguna', { shouldValidate: true });
                setValue('antecedentes', patient.antecedentes || 'Ninguno', { shouldValidate: true });

                // This makes sure the update gets linked correctly
                setValue('patient_id', patient.id);
                setPatientId(patient.id);

                setPatientFound(true);
                setPatientNotice('');
            } else {
                // Form states remains as user typed for new patient
                setPatientId(null);
                setValue('patient_id', '00000000-0000-0000-0000-000000000000');
                setPatientFound(false);
                setPatientNotice('Paciente nuevo: se creará automáticamente al confirmar.');
            }
        } catch (err) {
            setPatientNotice('Error al buscar paciente');
            setPatientFound(false);
        } finally {
            setCheckingPatient(false);
        }
    };

    // Trigger getAvailableSlots when fecha or tipoTurno changes
    useEffect(() => {
        if (selectedFecha && selectedTipoTurnoId) {
            getAvailableSlots(selectedFecha, selectedTipoTurnoId);
        }
    }, [selectedFecha, selectedTipoTurnoId]);

    // Get available slots for selected date and appointment type
    const getAvailableSlots = async (fecha: string, tipoTurno: string) => {
        setLoadingAvailability(true);
        try {
            const appointmentType = services.find(t => (t.id === tipoTurno || t.name === tipoTurno));
            const duration = appointmentType?.duration || 30;
            const slots = await AppointmentService.getAvailableSlots(fecha, duration);
            setAvailableSlots(slots);

            // Clear selected hora if it's no longer available
            if (selectedHora && !slots.includes(selectedHora)) {
                setSelectedHora('');
            }
        } catch (err) {
            setAvailableSlots([]);
        } finally {
            setLoadingAvailability(false);
        }
    };

    // Generate available dates (next 2 weeks, only work days)
    const availableDates = useMemo(() => {
        if (activeWorkingDays.length === 0) return [];

        const dates = [];
        const today = new Date();

        const toLocalYMD = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        // Incluir hoy y los próximos días
        for (let i = 0; i < 14; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);

            // Check against dynamic activeWorkingDays
            if (activeWorkingDays.includes(date.getDay())) {
                dates.push({
                    value: toLocalYMD(date),
                    label: date.toLocaleDateString('es-AR', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                    })
                });
            }
        }

        return dates;
    }, [activeWorkingDays]); // Recompute when activeWorkingDays changes

    // Submit appointment via react-hook-form
    const onSubmit = async (data: any) => {
        if (!selectedFecha || !selectedHora || !selectedTipoTurnoId) {
            message.error("Debes completar todos los campos del turno.");
            return;
        }
        setError('');

        try {
            const appointmentType = services.find(t => (t.id === selectedTipoTurnoId || t.name === selectedTipoTurnoId));

            // Override schema form data with contextual values
            data.duracion = appointmentType?.duration ? Number(appointmentType.duration) : 30;
            data.tipoTurnoNombre = appointmentType?.name || selectedTipoTurnoId;
            data.fechaHora = combineDateTimeToISO(
                selectedFecha,
                selectedHora
            );

            if (patientId) {
                data.patient_id = patientId;
            }

            await addTurno({
                ...data,
                tipoTurno: selectedTipoTurnoId, // legacy support for backend
            });

            setSuccess(true);

            // Notificar al padre que el turno se creó exitosamente después de un breve delay
            setTimeout(() => {
                if (onSuccess) onSuccess();
            }, 2000);
        } catch (err: any) {
            const msg = err.message || 'Error al crear el turno. Intenta nuevamente.';
            setError(msg);
            message.error(msg);
        }
    };

    // Reset form for new appointment
    const resetForm = () => {
        reset();
        setSelectedFecha('');
        setSelectedHora('');
        setSelectedTipoTurnoId('');
        setSuccess(false);
        setError('');
        setPatientFound(false);
        setAvailableSlots([]);
        setPatientId(null);
    };

    return {
        register,
        handleSubmit,
        setValue,
        watch,
        errors,
        isSubmitting,
        isValid,
        checkingPatient,
        patientFound,
        availableSlots,
        loadingAvailability,
        success,
        error,
        patientNotice,
        obraSocial,
        selectedTipoTurnoId,
        setSelectedTipoTurnoId,
        selectedFecha,
        setSelectedFecha,
        selectedHora,
        setSelectedHora,
        services,
        availableDates,
        onSubmit,
        resetForm,
        formRef,
        hiddenSubmitRef
    };
}
