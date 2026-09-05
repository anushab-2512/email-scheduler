import { Queue } from 'bullmq';
import { getRedis } from '../redis/redis';
import { QUEUE_NAMES, JOB_IDS } from '../config/constants';
import { SlackNotificationJobData } from '../types/queue.types';
import { logger } from '../utils/logger';

let notificationQueue: Queue<SlackNotificationJobData> | null = null;

export function getNotificationQueue(): Queue<SlackNotificationJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<SlackNotificationJobData>(QUEUE_NAMES.SLACK_NOTIFICATION, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
    logger.info('QUEUE', `Notification queue "${QUEUE_NAMES.SLACK_NOTIFICATION}" initialized`);
  }
  return notificationQueue;
}

export async function addSlackNotification(data: SlackNotificationJobData): Promise<void> {
  const queue = getNotificationQueue();
  const jobId = JOB_IDS.slackNotification(data.senderId, data.hourWindow);

  await queue.add('slack-notify', data, { jobId });
  logger.info('QUEUE', 'Slack notification job added', { jobId, senderId: data.senderId });
}

export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
    logger.info('QUEUE', 'Notification queue closed');
  }
}
