import { Queue } from 'bullmq';
import { getRedis } from '../redis/redis';
import { QUEUE_NAMES, JOB_IDS } from '../config/constants';
import { env } from '../config/env';
import { EmailJobData } from '../types/queue.types';
import { logger } from '../utils/logger';

let emailQueue: Queue<EmailJobData> | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL_SEND, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: env.EMAIL_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.EMAIL_JOB_BACKOFF_MS,
        },
        removeOnComplete: { count: 1000 },  // Keep last 1000 for Bull Board
        removeOnFail: { count: 500 },
      },
    });
    logger.info('QUEUE', `Email queue "${QUEUE_NAMES.EMAIL_SEND}" initialized`);
  }
  return emailQueue;
}

/**
 * Add a delayed email job.
 * Uses deterministic job ID to prevent duplicate scheduling.
 */
export async function addEmailJob(data: EmailJobData, delayMs: number): Promise<string> {
  const queue = getEmailQueue();
  const jobId = JOB_IDS.email(data.emailId);

  // If a failed job exists with this ID, remove it so BullMQ will accept re-adding it
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') {
        await existing.remove();
      }
    }
  } catch {}

  await queue.add('send-email', data, {
    jobId,
    delay: Math.max(0, delayMs),
  });

  logger.info('QUEUE', 'Email job added', {
    jobId,
    emailId: data.emailId,
    delayMs,
  });

  return jobId;
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
    logger.info('QUEUE', 'Email queue closed');
  }
}
