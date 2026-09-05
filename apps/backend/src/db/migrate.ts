import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../utils/logger';

async function runMigrations() {
  const isRemote = !!env.DATABASE_URL || (env.MYSQL_HOST !== 'localhost' && env.MYSQL_HOST !== '127.0.0.1');
  const useSSL = env.MYSQL_SSL || isRemote;
  const sslConfig = useSSL ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined;

  // Ensure the database exists before connecting to it (if using direct host/port)
  if (!env.DATABASE_URL) {
    try {
      const initConn = await mysql.createConnection({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        timezone: '+00:00',
        ssl: sslConfig,
      });
      await initConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${env.MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await initConn.end();
      logger.info('MIGRATION', `Database '${env.MYSQL_DATABASE}' ensured.`);
    } catch (err) {
      logger.warn('MIGRATION', 'Could not pre-create database, will attempt direct connection', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const connection = env.DATABASE_URL
    ? await mysql.createConnection({
        uri: env.DATABASE_URL,
        multipleStatements: true,
        timezone: '+00:00',
        ssl: sslConfig,
      })
    : await mysql.createConnection({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        multipleStatements: true,
        timezone: '+00:00',
        ssl: sslConfig,
      });

  logger.info('MIGRATION', 'Connected to MySQL');

  // Ensure migrations table exists
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Get already-applied migrations
  const [applied] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT name FROM _migrations ORDER BY id'
  );
  const appliedSet = new Set(applied.map(r => r.name));

  // Read migration files
  let migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    migrationsDir = path.join(__dirname, '../../src/db/migrations');
  }
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.info('MIGRATION', `Skipping (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    logger.info('MIGRATION', `Applying: ${file}`);

    try {
      await connection.query(sql);
      await connection.execute(
        'INSERT INTO _migrations (name) VALUES (?)',
        [file]
      );
      appliedCount++;
      logger.info('MIGRATION', `Applied: ${file}`);
    } catch (error) {
      logger.error('MIGRATION', `Failed: ${file}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await connection.end();
      process.exit(1);
    }
  }

  logger.info('MIGRATION', `Done. ${appliedCount} migration(s) applied.`);
  await connection.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
