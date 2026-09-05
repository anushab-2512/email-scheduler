import { Worker, Job, DelayedError } from 'bullmq';
import { getRedis } from '../redis/redis';
import { QUEUE_NAMES, getHourWindow, getNextHourWindowStart } from '../config/constants';
import { env } from '../config/env';
import { EmailJobData } from '../types/queue.types';
import { emailRepository } from '../repositories/email.repository';
import { senderRepository } from '../repositories/sender.repository';
import { checkAndReserveSendSlot, rollbackSendSlot, shouldNotifySlack } from '../services/email/rate-limiter';
import { sendEmail } from '../integrations/smtp';
import { updateEmailInIndex } from '../integrations/elasticsearch';
import { addSlackNotification } from '../queue/notification.queue';
import { logger } from '../utils/logger';

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId, senderId } = job.data;

  logger.info('WORKER', 'Processing email job', { jobId: job.id, emailId, senderId });

  // 1. Load email and associated campaign configuration from MySQL
  const email = await emailRepository.findByIdWithCampaign(emailId);
  if (!email) {
    logger.warn('WORKER', 'Email not found, skipping', { emailId });
    return; // Don't retry — the email record is gone
  }

  // 2. Idempotency: skip if already sent or permanently failed
  if (email.status === 'sent') {
    logger.info('WORKER', 'Email already sent, skipping duplicate job', { emailId });
    return;
  }

  if (email.status === 'failed') {
    logger.info('WORKER', 'Email marked as failed, skipping', { emailId });
    return;
  }

  // 3. Load sender configuration
  const sender = await senderRepository.findById(senderId);
  if (!sender || !sender.is_active) {
    await emailRepository.markFailed(emailId, 'Sender not found or inactive');
    await updateEmailInIndex(emailId, { status: 'failed' });
    logger.error('WORKER', 'Sender not found or inactive', { emailId, senderId });
    return; // Permanent failure, don't retry
  }

  const now = new Date();

  // 4. Rule 1: START TIME check
  // The first email must not be processed before the campaign's configured start time
  if (email.campaign_start_time) {
    const startTime = new Date(email.campaign_start_time);
    if (now.getTime() < startTime.getTime()) {
      logger.info('WORKER', 'Campaign start time not reached, rescheduling job', {
        emailId,
        startTime: startTime.toISOString(),
        now: now.toISOString(),
      });
      await emailRepository.resetToScheduled(emailId, startTime);
      await updateEmailInIndex(emailId, {
        status: 'scheduled',
        scheduledAt: startTime.toISOString(),
      });
      await job.moveToDelayed(startTime.getTime(), job.token);
      throw new DelayedError();
    }
  }

  // 5. Atomically transition scheduled → processing (concurrency/idempotency guard)
  const reserved = await emailRepository.atomicReserve(emailId);
  if (!reserved) {
    logger.info('WORKER', 'Email already being processed or completed by another worker', { emailId });
    return; // Another worker acquired it
  }

  // Determine campaign-specific delay and hourly limit (fallback to env defaults if unset)
  const delayMs = email.campaign_delay_ms ?? env.DEFAULT_MIN_EMAIL_DELAY_MS;
  const hourlyLimit = email.campaign_hourly_limit ?? env.DEFAULT_MAX_EMAILS_PER_HOUR;

  // 6. Enforce DELAY and HOURLY LIMIT atomically across workers via Redis
  const reservation = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, now);

  // 7. Handle Hourly Limit Reached (Hourly limit takes priority over delay)
  if (reservation.status === 'HOURLY_LIMIT_EXCEEDED') {
    const nextWindow = reservation.nextWindowStart;
    logger.info('WORKER', 'Hourly limit reached, rescheduling BullMQ job to next window', {
      emailId,
      senderId,
      hourlyLimit,
      currentCount: reservation.currentCount,
      nextWindow: nextWindow.toISOString(),
    });

    // Keep database email status as scheduled/waiting with new scheduled time
    await emailRepository.resetToScheduled(emailId, nextWindow);
    await updateEmailInIndex(emailId, {
      status: 'scheduled',
      scheduledAt: nextWindow.toISOString(),
    });

    // Reschedule the BullMQ job for the next window start
    await job.moveToDelayed(nextWindow.getTime(), job.token);

    // Trigger Slack notification (deduplicated per sender + hour window)
    const hourWindow = getHourWindow(now);
    const shouldNotify = await shouldNotifySlack(senderId, hourWindow);
    if (shouldNotify) {
      await addSlackNotification({
        userId: email.user_id,
        senderId,
        senderEmail: sender.email,
        hourlyLimit,
        hourWindow,
      });
    }

    throw new DelayedError();
  }

  // 8. Handle Sender Delay Not Satisfied
  if (reservation.status === 'DELAY_NOT_SATISFIED') {
    const nextSendAt = reservation.nextSendAt;
    logger.info('WORKER', 'Sender delay not satisfied, rescheduling BullMQ job', {
      emailId,
      senderId,
      delayMs,
      nextSendAt: new Date(nextSendAt).toISOString(),
    });

    // Keep database email status as scheduled/waiting with next valid send time
    const nextDate = new Date(nextSendAt);
    await emailRepository.resetToScheduled(emailId, nextDate);
    await updateEmailInIndex(emailId, {
      status: 'scheduled',
      scheduledAt: nextDate.toISOString(),
    });

    // Reschedule the BullMQ job for the next valid time
    await job.moveToDelayed(nextSendAt, job.token);
    throw new DelayedError();
  }

  // 9. Both rules satisfied: Send email using Nodemailer + Ethereal SMTP
  const attachments = (email.campaign_attachments || email.attachments || []) as any[];
  try {
    const result = await sendEmail(sender, email.recipient_email, email.subject, email.body, attachments);

    // 10. Only after SMTP send succeeds: update MySQL status to "sent"
    await emailRepository.markSent(emailId, result.messageId, result.previewUrl);

    // Update Elasticsearch
    await updateEmailInIndex(emailId, {
      status: 'sent',
      sentAt: new Date().toISOString(),
    });

    // Publish real-time status update to Redis channel for SSE clients
    try {
      const redis = getRedis();
      await redis.publish(
        'email-events',
        JSON.stringify({
          type: 'STATUS_UPDATE',
          emailId,
          campaignId: email.campaign_id,
          userId: email.user_id,
          status: 'sent',
          sentAt: new Date().toISOString(),
        })
      );
    } catch {
      // Non-critical if pubsub fails
    }

    logger.info('WORKER', 'Email sent successfully', {
      emailId,
      recipient: email.recipient_email,
      messageId: result.messageId,
      previewUrl: result.previewUrl || 'N/A',
      attachmentsCount: attachments.length,
    });
  } catch (smtpError) {
    const errorMsg = smtpError instanceof Error ? smtpError.message : String(smtpError);
    logger.error('WORKER', 'SMTP send failed', { emailId, error: errorMsg });

    // Rollback the reserved hourly slot so an unsent email doesn't burn the rate limit
    const hourWindow = getHourWindow(now);
    await rollbackSendSlot(senderId, hourWindow);

    // Check if this is a transient error that BullMQ should retry
    if (isTransientError(errorMsg)) {
      await emailRepository.resetToScheduled(emailId, new Date());
      throw smtpError; // BullMQ will retry with backoff
    }

    // Permanent failure
    await emailRepository.markFailed(emailId, errorMsg);
    await updateEmailInIndex(emailId, { status: 'failed' });

    // Publish permanent failure event to Redis
    try {
      const redis = getRedis();
      await redis.publish(
        'email-events',
        JSON.stringify({
          type: 'STATUS_UPDATE',
          emailId,
          campaignId: email.campaign_id,
          userId: email.user_id,
          status: 'failed',
          sentAt: new Date().toISOString(),
        })
      );
    } catch {
      // Non-critical
    }
  }
}

function isTransientError(message: string): boolean {
  const transientPatterns = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ESOCKET',
    'ENOTFOUND',
    'connection',
    'timeout',
    'rate limit',
    'too many',
    'temporarily',
    '421',
    '451',
    '452',
  ];
  const lower = message.toLowerCase();
  return transientPatterns.some(p => lower.includes(p.toLowerCase()));
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAMES.EMAIL_SEND,
    processEmailJob,
    {
      connection: getRedis(),
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    logger.info('WORKER', 'Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    // DelayedError is expected when rescheduling — don't log as an error
    if (err instanceof DelayedError || err.name === 'DelayedError' || err.message?.includes('movedToDelayed')) {
      logger.info('WORKER', 'Job moved to delayed', { jobId: job?.id });
      return;
    }

    logger.error('WORKER', 'Job failed', {
      jobId: job?.id,
      error: err.message,
      attempt: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('WORKER', 'Worker error', { error: err.message });
  });

  logger.info('WORKER', 'Email worker started', {
    concurrency: env.DEFAULT_WORKER_CONCURRENCY,
    queue: QUEUE_NAMES.EMAIL_SEND,
  });

  return worker;
}
