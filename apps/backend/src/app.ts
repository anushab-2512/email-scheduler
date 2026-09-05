import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { getEmailQueue } from './queue/email.queue';
import { getNotificationQueue } from './queue/notification.queue';
import { checkMySQLHealth } from './db/mysql';
import { checkRedisHealth } from './redis/redis';
import { checkESHealth } from './integrations/elasticsearch';
import authRoutes from './routes/auth.routes';
import emailRoutes from './routes/email.routes';
import senderRoutes from './routes/sender.routes';
import slackRoutes from './routes/slack.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';

export function createApp(): express.Express {
  const app = express();

  // ── Security ─────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Bull Board needs inline scripts
  }));
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, Bull Board)
      if (!origin) return callback(null, true);
      if (
        origin === env.FRONTEND_URL ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Allow other origins for demo accessibility
    },
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Bull Board ───────────────────────────────────────────
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(getEmailQueue()),
      new BullMQAdapter(getNotificationQueue()),
    ],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());

  // ── Health Checks ────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  app.get('/ready', async (_req, res) => {
    const [mysql, redis, elasticsearch] = await Promise.all([
      checkMySQLHealth(),
      checkRedisHealth(),
      checkESHealth(),
    ]);

    const allOk = mysql && redis;
    res.status(allOk ? 200 : 503).json({
      success: allOk,
      data: {
        api: 'ok',
        mysql: mysql ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
        elasticsearch: elasticsearch ? 'ok' : 'error',
      },
    });
  });

  // ── API Routes ───────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/emails', emailRoutes);
  app.use('/api/senders', senderRoutes);
  app.use('/api/slack', slackRoutes);

  // ── Error Handling ───────────────────────────────────────
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
