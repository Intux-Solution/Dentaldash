import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
    patient_id: z.string().uuid("El ID del paciente debe ser un UUID válido"),
    fechaHora: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "La fecha y hora no son válidas",
    }),
    duracion: z.number().int().positive("La duración debe ser un número positivo").default(30),
    tipoTurnoNombre: z.string().min(1, "El tipo de turno es requerido"),
    notas: z.string().optional(),
    status: z.enum(['Pendiente', 'Confirmado', 'Completado', 'Cancelado']).default('Confirmado'),
    // Add these for backward compatibility depending on how the frontend builds the payload
    nombre: z.string().optional(),
    dni: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal('')),
    obraSocial: z.string().optional(),
    numeroAfiliado: z.string().optional(),
    alergias: z.union([z.string(), z.array(z.string())]).optional(),
    antecedentes: z.string().optional(),
});

export const UpdateAppointmentSchema = z.object({
    id: z.string().uuid("El ID del turno debe ser un UUID válido"),
    fechaHora: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "La fecha y hora no son válidas",
    }),
    duracion: z.number().int().positive("La duración debe ser un número positivo").default(30),
    tipoTurnoNombre: z.string().min(1, "El tipo de turno es requerido"),
    notas: z.string().optional(),
    status: z.enum(['Pendiente', 'Confirmado', 'Completado', 'Cancelado']).optional(),
    // Add these for backward compatibility depending on how the frontend builds the payload
    nombre: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal('')),
});

export type CreateAppointmentPayload = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentPayload = z.infer<typeof UpdateAppointmentSchema>;
