import { createApp } from './app';
import { env } from './config/env';
import { ensureIndex } from './integrations/elasticsearch';
import { closeMySQLPool } from './db/mysql';
import { closeRedis } from './redis/redis';
import { closeES } from './integrations/elasticsearch';
import { closeEmailQueue } from './queue/email.queue';
import { closeNotificationQueue } from './queue/notification.queue';
import { createEmailWorker } from './workers/email.worker';
import { createNotificationWorker } from './workers/notification.worker';
import { logger } from './utils/logger';

async function start() {
  logger.info('API', '═══════════════════════════════════════════');
  logger.info('API', 'Starting Email Scheduler API Server');
  logger.info('API', '═══════════════════════════════════════════');

  // Ensure Elasticsearch index exists (non-blocking)
  try {
    await ensureIndex();
  } catch (err) {
    logger.warn('API', 'Elasticsearch index setup failed (non-critical)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start background workers if enabled (for single-service cloud deployments like Render)
  let emailWorker: ReturnType<typeof createEmailWorker> | null = null;
  let notificationWorker: ReturnType<typeof createNotificationWorker> | null = null;

  if (env.START_WORKER) {
    try {
      emailWorker = createEmailWorker();
      notificationWorker = createNotificationWorker();
      logger.info('API', 'BullMQ background workers initialized in-process', {
        concurrency: env.DEFAULT_WORKER_CONCURRENCY,
        minDelayMs: env.DEFAULT_MIN_EMAIL_DELAY_MS,
      });
    } catch (workerErr) {
      logger.error('API', 'Failed to initialize background workers', {
        error: workerErr instanceof Error ? workerErr.message : String(workerErr),
      });
    }
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('API', `Server running on port ${env.PORT}`);
    logger.info('API', `Frontend URL: ${env.FRONTEND_URL}`);
    logger.info('API', `Bull Board: http://localhost:${env.PORT}/admin/queues`);
    logger.info('API', `Health: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('API', `Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      logger.info('API', 'HTTP server closed');

      if (emailWorker) {
        try { await emailWorker.close(); } catch {}
      }
      if (notificationWorker) {
        try { await notificationWorker.close(); } catch {}
      }
      try { await closeEmailQueue(); } catch {}
      try { await closeNotificationQueue(); } catch {}
      try { await closeMySQLPool(); } catch {}
      try { await closeES(); } catch {}
      try { await closeRedis(); } catch {}

      logger.info('API', 'Shutdown complete');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('API', 'Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('API', 'Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
