import { z } from 'zod';

export const emailAttachmentSchema = z.object({
  filename: z.string().min(1, 'Attachment filename is required'),
  contentType: z.string().default('application/octet-stream'),
  size: z.number().int().nonnegative().optional().default(0),
  content: z.string().min(1, 'Attachment content is required'),
});

export const scheduleEmailSchema = z.object({
  sender_id: z.string().uuid('Invalid sender ID'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  recipients: z.array(z.string().email('Invalid email address')).min(1, 'At least one recipient is required'),
  start_time: z.string().refine((val) => !isNaN(new Date(val).getTime()), 'Invalid start time'),
  delay_ms: z.number().int().min(0).default(2000),
  hourly_limit: z.number().int().min(1).default(200),
  attachments: z.array(emailAttachmentSchema).optional().default([]),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;
