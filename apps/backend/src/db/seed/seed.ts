import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import { env } from '../../config/env';
import { encrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';

async function seed() {
  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    timezone: '+00:00',
  });

  logger.info('MYSQL', 'Connected for seeding');

  // Check if demo user exists
  const [existingUsers] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT id FROM users WHERE email = 'demo@example.com'"
  );

  let userId: string;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    logger.info('MYSQL', 'Demo user already exists', { userId });
  } else {
    userId = uuidv4();
    await connection.execute(
      'INSERT INTO users (id, google_id, name, email, avatar_url) VALUES (?, ?, ?, ?, ?)',
      [userId, 'demo-google-id', 'Demo User', 'demo@example.com', null]
    );
    logger.info('MYSQL', 'Demo user created', { userId });
  }

  // Seed demo senders (Ethereal credentials — auto-generate if blank)
  let etherealUser = env.SMTP_USER;
  let etherealPass = env.SMTP_PASSWORD;

  if (!etherealUser || !etherealPass) {
    logger.info('MYSQL', 'No Ethereal credentials in .env, auto-generating test account...');
    const nodemailer = await import('nodemailer');
    const testAccount = await nodemailer.createTestAccount();
    etherealUser = testAccount.user;
    etherealPass = testAccount.pass;
    logger.info('MYSQL', 'Auto-generated Ethereal test account', { user: etherealUser });
  }

  const senders = [
    {
      id: uuidv4(),
      name: 'Marketing Team',
      email: 'marketing@demo.ethereal.email',
      smtpUser: etherealUser,
      smtpPassword: etherealPass,
    },
    {
      id: uuidv4(),
      name: 'Sales Outreach',
      email: 'sales@demo.ethereal.email',
      smtpUser: etherealUser,
      smtpPassword: etherealPass,
    },
  ];

  for (const sender of senders) {
    // Check if sender with this email already exists for this user
    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT id FROM senders WHERE user_id = ? AND email = ?',
      [userId, sender.email]
    );

    if (existing.length > 0) {
      logger.info('MYSQL', 'Sender already exists, skipping', { email: sender.email });
      continue;
    }

    await connection.execute(
      'INSERT INTO senders (id, user_id, name, email, smtp_host, smtp_port, smtp_user, smtp_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        sender.id,
        userId,
        sender.name,
        sender.email,
        env.SMTP_HOST,
        env.SMTP_PORT,
        sender.smtpUser,
        encrypt(sender.smtpPassword),
      ]
    );
    logger.info('MYSQL', 'Demo sender created', { email: sender.email });
  }

  logger.info('MYSQL', 'Seeding complete');
  await connection.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
