import { z } from 'zod';

export const SurfaceStatusSchema = z.enum([
    'caries',
    'tratado',
    'pendiente',
    'ausente'
]);

export type SurfaceStatus = z.infer<typeof SurfaceStatusSchema>;

export const ToothDataSchema = z.object({
    vestibular: SurfaceStatusSchema.optional(),
    lingual: SurfaceStatusSchema.optional(),
    oclusal: SurfaceStatusSchema.optional(),
    mesial: SurfaceStatusSchema.optional(),
    distal: SurfaceStatusSchema.optional(),
    all: z.literal('ausente').optional()
}).strict();

export type ToothData = z.infer<typeof ToothDataSchema>;

/**
 * Representa el diccionario JSON completo del odontograma:
 * { "18": { "oclusal": "caries" }, "21": { "all": "ausente" } }
 */
export const OdontogramSchema = z.record(z.string(), ToothDataSchema);

export type OdontogramData = z.infer<typeof OdontogramSchema>;
