/**
 * Worker Entry Point
 *
 * This runs as a SEPARATE process from the API server.
 * It consumes BullMQ jobs and processes them.
 *
 * Start with: npm run dev:worker
 */

import { env } from '../config/env';
import { createEmailWorker } from './email.worker';
import { createNotificationWorker } from './notification.worker';
import { closeMySQLPool } from '../db/mysql';
import { closeRedis } from '../redis/redis';
import { closeES } from '../integrations/elasticsearch';
import { ensureIndex } from '../integrations/elasticsearch';
import { logger } from '../utils/logger';

async function start() {
  logger.info('WORKER', '═══════════════════════════════════════════');
  logger.info('WORKER', 'Starting Email Scheduler Worker Process');
  logger.info('WORKER', '═══════════════════════════════════════════');

  // Ensure Elasticsearch index exists
  try {
    await ensureIndex();
  } catch (err) {
    logger.warn('WORKER', 'Elasticsearch index setup failed (non-critical)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start workers
  const emailWorker = createEmailWorker();
  const notificationWorker = createNotificationWorker();

  logger.info('WORKER', 'All workers started', {
    concurrency: env.DEFAULT_WORKER_CONCURRENCY,
    minDelayMs: env.DEFAULT_MIN_EMAIL_DELAY_MS,
    maxEmailsPerHour: env.DEFAULT_MAX_EMAILS_PER_HOUR,
  });

  // Recover scheduled emails on startup
  try {
    const { recoverScheduledEmails } = await import('./recovery');
    await recoverScheduledEmails();
  } catch (recErr) {
    logger.error('WORKER', 'Failed to recover scheduled emails', {
      error: recErr instanceof Error ? recErr.message : String(recErr),
    });
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('WORKER', `Received ${signal}, shutting down gracefully...`);

    try {
      await emailWorker.close();
      logger.info('WORKER', 'Email worker closed');
    } catch (err) {
      logger.error('WORKER', 'Error closing email worker', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await notificationWorker.close();
      logger.info('WORKER', 'Notification worker closed');
    } catch (err) {
      logger.error('WORKER', 'Error closing notification worker', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await closeMySQLPool();
    await closeES();
    await closeRedis();

    logger.info('WORKER', 'Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('WORKER', 'Failed to start worker', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
