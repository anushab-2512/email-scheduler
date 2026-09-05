import { v4 as uuidv4 } from 'uuid';
import { emailRepository } from '../../repositories/email.repository';
import { senderRepository } from '../../repositories/sender.repository';
import { addEmailJob } from '../../queue/email.queue';
import { indexEmail } from '../../integrations/elasticsearch';
import { JOB_IDS } from '../../config/constants';
import { ScheduleEmailRequest } from '../../types/email.types';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface ScheduleResult {
  campaignId: string;
  totalScheduled: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
}

export async function scheduleEmails(
  userId: string,
  request: ScheduleEmailRequest
): Promise<ScheduleResult> {
  // Validate sender belongs to user
  const sender = await senderRepository.findByIdPublic(request.sender_id, userId);
  if (!sender) {
    throw new NotFoundError('Sender');
  }

  if (request.recipients.length === 0) {
    throw new ValidationError('No recipients provided');
  }

  const startTime = new Date(request.start_time);
  if (isNaN(startTime.getTime())) {
    throw new ValidationError('Invalid start time');
  }

  // Create campaign
  const campaignId = await emailRepository.createCampaign({
    userId,
    senderId: request.sender_id,
    subject: request.subject,
    body: request.body,
    startTime,
    delayMs: request.delay_ms,
    hourlyLimit: request.hourly_limit,
    totalRecipients: request.recipients.length,
    attachments: request.attachments,
  });

  logger.info('SCHEDULER', 'Campaign created', {
    campaignId,
    recipients: request.recipients.length,
  });

  // Prepare email records and BullMQ jobs
  const emails: Array<{
    id: string;
    campaignId: string;
    userId: string;
    senderId: string;
    recipientEmail: string;
    subject: string;
    body: string;
    scheduledAt: Date;
    bullJobId: string;
  }> = [];

  const now = Date.now();

  for (let i = 0; i < request.recipients.length; i++) {
    const emailId = uuidv4();
    const scheduledAt = new Date(startTime.getTime() + i * request.delay_ms);
    const bullJobId = JOB_IDS.email(emailId);

    emails.push({
      id: emailId,
      campaignId,
      userId,
      senderId: request.sender_id,
      recipientEmail: request.recipients[i],
      subject: request.subject,
      body: request.body,
      scheduledAt,
      bullJobId,
    });
  }

  // Batch insert email rows
  // Process in chunks of 100 to avoid hitting MySQL limits
  const CHUNK_SIZE = 100;
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const chunk = emails.slice(i, i + CHUNK_SIZE);
    await emailRepository.createEmails(chunk);
  }

  logger.info('SCHEDULER', 'Email records created', {
    campaignId,
    count: emails.length,
  });

  // Create BullMQ delayed jobs
  for (const email of emails) {
    const delayMs = Math.max(0, email.scheduledAt.getTime() - now);
    await addEmailJob(
      {
        emailId: email.id,
        campaignId,
        senderId: request.sender_id,
      },
      delayMs
    );
  }

  logger.info('SCHEDULER', 'BullMQ jobs created', {
    campaignId,
    count: emails.length,
  });

  // Index emails in Elasticsearch (non-blocking)
  for (const email of emails) {
    indexEmail(
      {
        id: email.id,
        campaign_id: email.campaignId,
        user_id: email.userId,
        sender_id: email.senderId,
        recipient_email: email.recipientEmail,
        subject: email.subject,
        body: email.body,
        scheduled_at: email.scheduledAt,
        sent_at: null,
        status: 'scheduled',
        attempt_count: 0,
        bull_job_id: email.bullJobId,
        error_message: null,
        ethereal_message_id: null,
        ethereal_url: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      sender.email
    ).catch(err => {
      logger.error('SCHEDULER', 'ES indexing failed (non-critical)', {
        emailId: email.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return {
    campaignId,
    totalScheduled: emails.length,
    firstScheduledAt: emails[0].scheduledAt.toISOString(),
    lastScheduledAt: emails[emails.length - 1].scheduledAt.toISOString(),
  };
}
