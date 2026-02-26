import { z } from 'zod';

// ─── Campos base compartidos por crear y editar ──────────────────────────────

const PatientBaseSchema = z.object({
    nombre: z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres (es obligatorio).')
        .max(150, 'El nombre no puede superar los 150 caracteres.'),

    dni: z
        .string()
        .min(6, 'El DNI debe tener al menos 6 caracteres (es obligatorio).')
        .max(20, 'El DNI no puede superar los 20 caracteres.'),

    telefono: z
        .string()
        .max(30, 'El teléfono no puede superar los 30 caracteres.')
        .optional()
        .nullable(),

    email: z
        .string()
        .email('El formato del email no es válido.')
        .max(254, 'El email no puede superar los 254 caracteres.')
        .optional()
        .nullable()
        .or(z.literal('')), // permite string vacío además de null/undefined

    obraSocial: z
        .string()
        .max(100, 'Obra social no puede superar los 100 caracteres.')
        .optional()
        .nullable(),

    numeroAfiliado: z
        .string()
        .max(50, 'Número de afiliado no puede superar los 50 caracteres.')
        .optional()
        .nullable(),

    // Acepta ISO-date string (YYYY-MM-DD) o string vacío
    fechaNacimiento: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe tener el formato YYYY-MM-DD.')
        .optional()
        .nullable()
        .or(z.literal('')),

    alergias: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .nullable(),

    antecedentes: z
        .string()
        .max(1000, 'Antecedentes no puede superar los 1000 caracteres.')
        .optional()
        .nullable(),

    notas: z
        .string()
        .max(2000, 'Las notas no pueden superar los 2000 caracteres.')
        .optional()
        .nullable(),

    estado: z
        .enum(['Activo', 'Inactivo', 'Pendiente', 'En Tratamiento', 'Alta'])
        .optional()
        .default('Activo'),
});

// ─── Schema para CREAR un paciente ──────────────────────────────────────────

export const AddPatientSchema = PatientBaseSchema;

type AddPatientInput = z.infer<typeof AddPatientSchema>;

// ─── Schema para ACTUALIZAR un paciente ──────────────────────────────────────
// Todos los campos son opcionales; solo se validan los que se envíen.

export const UpdatePatientSchema = PatientBaseSchema.partial().extend({
    /** UUID de PostgreSQL — único identificador válido */
    id: z.string().uuid('El ID del paciente debe ser un UUID válido.'),
});

type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;
