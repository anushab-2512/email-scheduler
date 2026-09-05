import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const commonOptions = {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    };

    if (env.REDIS_URL) {
      redisClient = new Redis(env.REDIS_URL, {
        ...commonOptions,
        tls: env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      });
      logger.info('REDIS', 'Connecting via REDIS_URL');
    } else {
      redisClient = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        ...commonOptions,
      });
      logger.info('REDIS', 'Connecting via host/port', { host: env.REDIS_HOST, port: env.REDIS_PORT });
    }

    redisClient.on('connect', () => {
      logger.info('REDIS', 'Connected to Redis');
    });

    redisClient.on('error', (err) => {
      logger.error('REDIS', 'Connection error', { error: err.message });
    });
  }
  return redisClient;
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('REDIS', 'Connection closed');
  }
}
