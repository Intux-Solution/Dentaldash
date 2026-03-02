import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentService } from '../services/AppointmentService';
import { PatientService } from '../services/PatientService';
import { combineDateTimeToISO } from '../utils/helpers';
import { message } from 'antd';
import { UpdateAppointmentSchema, UpdateAppointmentPayload } from '../schemas/appointment.schema';
import { useAuth } from '../context/AuthContext';

export function useEditTurnoModal(open: boolean, turno: any, onClose: () => void, onSaved?: (saved: any) => void, onDeleted?: (deleted: any) => void) {
    const { session } = useAuth();
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors, isValid, isSubmitting }
    } = useForm<UpdateAppointmentPayload>({
        resolver: zodResolver(UpdateAppointmentSchema),
        defaultValues: {
            id: '',
            dni: '',
            nombre: '',
            telefono: '',
            email: '',
            obraSocial: '',
            numeroAfiliado: '',
            alergias: '',
            antecedentes: '',
            tipoTurnoNombre: '',
            fechaHora: new Date().toISOString(),
            notas: '',
            status: 'Confirmado'
        },
        mode: 'onChange'
    });

    const [deleting, setDeleting] = useState(false);
    const [checkingPatient, setCheckingPatient] = useState(false);
    const [patientFound, setPatientFound] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [loadingAvailability, setLoadingAvailability] = useState(false);
    const [error, setError] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    // Dynamic Working Days
    const [activeWorkingDays, setActiveWorkingDays] = useState<number[]>([]);
    const [services, setServices] = useState<any[]>([]);

    // Local state purely for UI selection
    const [selectedTipoTurnoId, setSelectedTipoTurnoId] = useState('');
    const [selectedFecha, setSelectedFecha] = useState('');
    const [selectedHora, setSelectedHora] = useState('');

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

    // Evita borrar el turno más de una vez al abrir el modal
    const freedRef = useRef(false);

    // Obtener horarios disponibles (puede excluir el turno actual)
    const getAvailableSlots = useCallback(async (fecha: string, tipoTurno: string, excludeId?: string) => {
        if (!fecha || !tipoTurno) return;

        setLoadingAvailability(true);

        try {
            const appointmentType = services.find(t => (t.id === tipoTurno || t.name === tipoTurno));
            const effectiveExclude = excludeId || watch('id');

            const slots = await AppointmentService.getAvailableSlots(
                fecha,
                appointmentType?.duration || 30,
                effectiveExclude
            );

            setAvailableSlots(slots);

            // Clear selected hora if it's no longer available and not the initially loaded one
            if (selectedHora && !slots.includes(selectedHora) && !open) {
                setSelectedHora('');
            }
        } catch (err) {
            setAvailableSlots([]);
        } finally {
            setLoadingAvailability(false);
        }
    }, [watch('id'), selectedHora, open, services]);

    // Inicializar formulario cuando se abre el modal
    useEffect(() => {
        if (open && turno) {

            const startDate = turno.start || turno.startTime;
            let fecha = '', hora = '';
            if (startDate) {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) {
                    fecha = d.toISOString().split('T')[0];
                    hora = d.toTimeString().slice(0, 5);
                }
            }

            const tipoTurno = (services.find(type =>
                (turno.title || '').toLowerCase().includes(type.name.toLowerCase()) ||
                (turno.tipoTurnoNombre || '').toLowerCase().includes(type.name.toLowerCase()) ||
                (turno.tipoTurno || '').toLowerCase() === (type.id || '').toLowerCase() ||
                (turno.appointment_type || '').toLowerCase() === (type.name || '').toLowerCase()
            ) || {}).id || turno.tipoTurno || '';

            // Obtener DNI: usar campo explícito o parsear de la descripción
            let dniInicial = turno.patientDni || turno.dni || '';
            if (!dniInicial) {
                const text = String(turno.description || '');
                const m1 = text.match(/dni\s*[:\-]?\s*([0-9\.\s]+)/i);
                if (m1 && m1[1]) {
                    dniInicial = String(m1[1]).replace(/\D/g, '');
                } else {
                    const m2 = text.match(/(^|\D)(\d{7,9})(?!\d)/);
                    if (m2 && m2[2]) dniInicial = m2[2];
                }
            }
            // Normalizar a solo dígitos
            dniInicial = String(dniInicial || '').replace(/\D/g, '');

            // Nombre desde descripción como fallback
            const nombreDesdeDescripcion = (() => {
                const text = String(turno.description || '');
                const m = text.match(/Paciente\s*[:\-]?\s*(.+?)(?=\s*(DNI|Dni|dni)\b|$)/);
                return m && m[1] ? m[1].trim() : '';
            })();

            const idTurno = turno.id || turno.eventId || turno._id || '';

            reset({
                id: idTurno,
                dni: dniInicial,
                nombre: turno.patientName || turno.paciente || nombreDesdeDescripcion || '',
                telefono: turno.patientPhone || turno.telefono || '',
                email: turno.patientEmail || turno.email || '',
                obraSocial: turno.obraSocial || '',
                numeroAfiliado: turno.numeroAfiliado || '',
                alergias: turno.alergias || '',
                antecedentes: turno.antecedentes || '',
                notas: turno.description || turno.notas || '',
                fechaHora: startDate || new Date().toISOString(),
                tipoTurnoNombre: tipoTurno, // will be overwritten on submit
                status: turno.status || turno.estado || 'Confirmado'
            });

            setSelectedFecha(fecha);
            setSelectedHora(hora);
            setSelectedTipoTurnoId(tipoTurno);

            // Aún no sabemos si existe en base; esperar resultado de checkPatient
            setPatientFound(false);
            setError('');

            // Traer datos del paciente automáticamente al abrir si hay DNI
            if (dniInicial) {
                checkPatient(dniInicial);
            }

            if (fecha && tipoTurno) {
                getAvailableSlots(fecha, tipoTurno, idTurno);
            }
        }
    }, [open, turno, reset, services, getAvailableSlots]);

    // Reset flag al cerrar el modal
    useEffect(() => {
        if (!open) {
            freedRef.current = false;
        }
    }, [open]);

    // Consultar paciente por DNI
    const checkPatient = async (dni: string) => {
        // Aceptar DNIs de 7 a 9 dígitos
        if (!dni || String(dni).replace(/\D/g, '').length < 7) {
            setPatientFound(false);
            return;
        }
        setCheckingPatient(true);
        setError('');
        try {
            const patient = await PatientService.getPatientByDni(dni);
            if (patient) {
                setValue('nombre', patient.nombre || watch('nombre'));
                setValue('telefono', patient.telefono || watch('telefono'));
                setValue('email', patient.email || watch('email'));
                setValue('obraSocial', patient.obraSocial || watch('obraSocial'));
                setValue('numeroAfiliado', patient.numeroAfiliado || watch('numeroAfiliado'));
                setValue('alergias', patient.alergias || 'Ninguna');
                setValue('antecedentes', patient.antecedentes || 'Ninguno');
                setPatientFound(true);
            } else {
                setPatientFound(false);
            }
        } catch (err) {
            setError('Error al consultar paciente.');
            setPatientFound(false);
        } finally {
            setCheckingPatient(false);
        }
    };

    // Fechas disponibles (próximas 2 semanas; incluir seleccionada)
    const availableDates = useMemo(() => {
        if (activeWorkingDays.length === 0) return [];

        const dates = [];
        const today = new Date();
        for (let i = 0; i <= 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const isWorkDay = activeWorkingDays.includes(d.getDay());
            const value = d.toISOString().split('T')[0];
            if (isWorkDay || value === selectedFecha) {
                dates.push({
                    value,
                    label: d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }),
                });
            }
        }
        return dates;
    }, [selectedFecha, activeWorkingDays]);

    // Trigger getAvailableSlots when fecha or tipoTurno changes
    useEffect(() => {
        if (selectedFecha && selectedTipoTurnoId && open) {
            getAvailableSlots(selectedFecha, selectedTipoTurnoId, watch('id'));
        }
    }, [selectedFecha, selectedTipoTurnoId, open, getAvailableSlots, watch('id')]);

    const onSubmitForm = async (data: any) => {
        if (!selectedFecha || !selectedHora || !selectedTipoTurnoId) {
            message.error("Debes completar todos los campos del turno.");
            return;
        }
        setError('');

        try {
            const appointmentType = services.find(t => (t.id === selectedTipoTurnoId || t.name === selectedTipoTurnoId));
            const appointmentISO = combineDateTimeToISO(selectedFecha, selectedHora);

            // Override contextual variables
            data.duracion = appointmentType?.duration || 30;
            data.tipoTurnoNombre = appointmentType?.name || 'Consulta';
            data.fechaHora = appointmentISO;

            let saved;
            if (freedRef.current || !data.id) {
                // Create new
                saved = await AppointmentService.createAppointment({
                    ...data,
                    tipoTurno: selectedTipoTurnoId,
                    timezone: 'America/Argentina/Buenos_Aires',
                    isNewPatient: !patientFound
                });
            } else {
                // Update existing
                saved = await AppointmentService.updateAppointment(data.id, {
                    ...data,
                    tipoTurno: selectedTipoTurnoId,
                    timezone: 'America/Argentina/Buenos_Aires'
                });
            }

            if (onSaved) onSaved(saved);
            message.success('Turno guardado con éxito');
            onClose();
        } catch (err: any) {
            const msg = err.message || 'Error al actualizar el turno. Intenta nuevamente.';
            setError(msg);
            message.error(msg);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        setError('');
        try {
            await AppointmentService.deleteAppointment(watch('id'));
            if (onDeleted) onDeleted(turno);
            message.success('Turno cancelado correctamente');
            onClose();
        } catch (err: any) {
            const msg = err.message || 'Error al cancelar el turno. Intenta nuevamente.';
            setError(msg);
            message.error(msg);
        } finally {
            setDeleting(false);
        }
    };

    return {
        register,
        handleSubmit,
        errors,
        isValid,
        isSubmitting,
        deleting,
        checkingPatient,
        patientFound,
        availableSlots,
        loadingAvailability,
        error,
        showConfirm,
        setShowConfirm,
        selectedTipoTurnoId,
        setSelectedTipoTurnoId,
        selectedFecha,
        setSelectedFecha,
        selectedHora,
        setSelectedHora,
        services,
        availableDates,
        onSubmitForm,
        handleDelete
    };
}
