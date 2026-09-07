import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default(
    process.env.NODE_ENV === 'production'
      ? 'https://email-scheduler-frontend-zeta.vercel.app'
      : 'http://localhost:5173'
  ).transform(val => {
    const trimmed = val.trim().replace(/\/$/, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }),

  // MySQL
  DATABASE_URL: z.string().optional(),
  MYSQL_HOST: z.string().default('localhost'),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_DATABASE: z.string().default('email_scheduler'),
  MYSQL_USER: z.string().default('root'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_SSL: z.string().transform(v => v === 'true').default('false'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default(process.env.NODE_ENV === 'test' ? 'test-client-id' : ''),
  GOOGLE_CLIENT_SECRET: z.string().default(process.env.NODE_ENV === 'test' ? 'test-client-secret' : ''),
  GOOGLE_CALLBACK_URL: z.string().default(
    process.env.NODE_ENV === 'production'
      ? 'https://email-scheduler-tehc.onrender.com/api/auth/google/callback'
      : 'http://localhost:4000/api/auth/google/callback'
  ).transform(val => {
    const trimmed = val.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }),

  // Session
  SESSION_SECRET: z.string().min(16).default('test-session-secret-at-least-32-chars-long'),

  // Slack
  SLACK_CLIENT_ID: z.string().default('REMOVED_CLIENT_ID'),
  SLACK_CLIENT_SECRET: z.string().default('REMOVED_SECRET'),
  SLACK_REDIRECT_URL: z.string().default(
    process.env.NODE_ENV === 'production'
      ? 'https://email-scheduler-tehc.onrender.com/api/slack/callback'
      : 'http://localhost:4000/api/slack/callback'
  ).transform(val => {
    const trimmed = val.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }),

  // SMTP (Ethereal)
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),

  // Worker
  START_WORKER: z.string().transform(v => v !== 'false').default('true'),
  DEFAULT_WORKER_CONCURRENCY: z.coerce.number().min(1).default(5),
  DEFAULT_MIN_EMAIL_DELAY_MS: z.coerce.number().min(0).default(2000),
  DEFAULT_MAX_EMAILS_PER_HOUR: z.coerce.number().min(1).default(200),

  // Job retries
  EMAIL_JOB_ATTEMPTS: z.coerce.number().min(1).default(3),
  EMAIL_JOB_BACKOFF_MS: z.coerce.number().min(100).default(5000),

  // Encryption
  ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
