import { z } from 'zod';

export const createSenderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email address'),
  smtp_host: z.string().min(1, 'SMTP host is required'),
  smtp_port: z.number().int().min(1).max(65535).default(587),
  smtp_user: z.string().min(1, 'SMTP user is required'),
  smtp_password: z.string().min(1, 'SMTP password is required'),
});

export const updateSenderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  smtp_host: z.string().min(1).optional(),
  smtp_port: z.number().int().min(1).max(65535).optional(),
  smtp_user: z.string().min(1).optional(),
  smtp_password: z.string().min(1).optional(),
});

export type CreateSenderInput = z.infer<typeof createSenderSchema>;
export type UpdateSenderInput = z.infer<typeof updateSenderSchema>;
