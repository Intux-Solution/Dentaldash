import { z } from 'zod';

export const PublicBookingSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  dni: z
    .string()
    .min(7, 'El DNI debe tener al menos 7 dígitos')
    .max(10, 'El DNI no puede tener más de 10 dígitos')
    .transform((v) => v.replace(/[.\-\s]/g, '')),
  telefono: z.string().min(8, 'El teléfono debe tener al menos 8 dígitos'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  obra_social: z.string().optional(),
  appointment_type: z.string().min(1, 'Seleccioná un servicio'),
  date: z.string().min(1, 'Seleccioná una fecha'),
  time: z.string().min(1, 'Seleccioná un horario'),
  notes: z.string().optional(),
});

export type PublicBookingData = z.infer<typeof PublicBookingSchema>;
