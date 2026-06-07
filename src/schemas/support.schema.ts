import { z } from 'zod';

export const supportMessageSchema = z.object({
  subject: z.string().min(3, 'El asunto es muy corto').max(120, 'El asunto es muy largo'),
  body: z.string().min(5, 'El mensaje es muy corto').max(2000, 'El mensaje es muy largo'),
});

export type SupportMessageData = z.infer<typeof supportMessageSchema>;
