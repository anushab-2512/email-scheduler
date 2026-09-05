import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    const isRemote = !!env.DATABASE_URL || (env.MYSQL_HOST !== 'localhost' && env.MYSQL_HOST !== '127.0.0.1');
    const useSSL = env.MYSQL_SSL || isRemote;

    const baseOptions: mysql.PoolOptions = {
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+00:00',
      ssl: useSSL ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
    };

    if (env.DATABASE_URL) {
      pool = mysql.createPool({
        uri: env.DATABASE_URL,
        ...baseOptions,
      });
      logger.info('MYSQL', 'Connection pool created via DATABASE_URL', { ssl: useSSL });
    } else {
      pool = mysql.createPool({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        ...baseOptions,
      });
      logger.info('MYSQL', 'Connection pool created', {
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        database: env.MYSQL_DATABASE,
        ssl: useSSL,
      });
    }
  }
  return pool;
}

export async function checkMySQLHealth(): Promise<boolean> {
  try {
    const db = getPool();
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeMySQLPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MYSQL', 'Connection pool closed');
  }
}
