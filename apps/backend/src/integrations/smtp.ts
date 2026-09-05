import nodemailer from 'nodemailer';
import { Sender, EmailAttachment } from '../types/email.types';
import { logger } from '../utils/logger';

// Cache transporters per sender to avoid recreating on every email
const transporterCache = new Map<string, nodemailer.Transporter>();

export function getTransporter(sender: Sender): nodemailer.Transporter {
  const cached = transporterCache.get(sender.id);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: {
      user: sender.smtp_user,
      pass: sender.smtp_password,
    },
  });

  transporterCache.set(sender.id, transporter);
  return transporter;
}

export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[]
): Promise<{ messageId: string; previewUrl: string | null }> {
  const transporter = getTransporter(sender);

  const nodemailerAttachments = attachments && attachments.length > 0
    ? attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType,
      }))
    : undefined;

  const info = await transporter.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to,
    subject,
    html: body,
    text: body.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
    attachments: nodemailerAttachments,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  logger.info('SMTP', 'Email sent', {
    messageId: info.messageId,
    to,
    from: sender.email,
    previewUrl: previewUrl || 'N/A',
  });

  return {
    messageId: info.messageId,
    previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
  };
}

export function clearTransporterCache(): void {
  transporterCache.clear();
}
