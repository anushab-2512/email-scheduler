import { Worker, Job } from 'bullmq';
import { getRedis } from '../redis/redis';
import { QUEUE_NAMES } from '../config/constants';
import { SlackNotificationJobData } from '../types/queue.types';
import { slackRepository } from '../repositories/slack.repository';
import { sendSlackMessage } from '../integrations/slack';
import { logger } from '../utils/logger';

async function processSlackNotification(job: Job<SlackNotificationJobData>): Promise<void> {
  const { userId, senderEmail, hourlyLimit, senderId, hourWindow } = job.data;

  logger.info('WORKER', 'Processing Slack notification', { jobId: job.id, senderId, hourWindow });

  // Check if user has Slack connected
  const connection = await slackRepository.findActiveByUserId(userId);
  if (!connection) {
    logger.info('WORKER', 'No active Slack connection, skipping notification', { userId });
    return;
  }

  // Send the notification
  const message = `⚠️ Sender \`${senderEmail}\` has reached the hourly email limit of ${hourlyLimit}. Remaining emails will be sent in the next available hourly window.\n\n_Hour window: ${hourWindow}_`;

  try {
    await sendSlackMessage(connection.webhook_url, message);
    logger.info('WORKER', 'Slack notification sent', { senderId, hourWindow });
  } catch (error) {
    logger.error('WORKER', 'Failed to send Slack notification', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Allow BullMQ retry
  }
}

export function createNotificationWorker(): Worker<SlackNotificationJobData> {
  const worker = new Worker<SlackNotificationJobData>(
    QUEUE_NAMES.SLACK_NOTIFICATION,
    processSlackNotification,
    {
      connection: getRedis(),
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    logger.info('WORKER', 'Notification job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('WORKER', 'Notification job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info('WORKER', 'Notification worker started', { queue: QUEUE_NAMES.SLACK_NOTIFICATION });
  return worker;
}
