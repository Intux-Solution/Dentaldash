import { z } from 'zod';

export const PlanFormSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  description: z.string().max(500).optional().nullable(),
  price_monthly: z.coerce.number().min(0, 'El precio mensual debe ser ≥ 0'),
  price_yearly: z.coerce.number().min(0).optional().nullable(),
  features: z.array(z.string()).default([]),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export type PlanFormData = z.infer<typeof PlanFormSchema>;
