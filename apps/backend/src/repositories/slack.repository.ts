import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool } from '../db/mysql';
import { SlackConnection } from '../types/email.types';
import { encrypt, decrypt } from '../utils/crypto';

export const slackRepository = {
  async findActiveByUserId(userId: string): Promise<SlackConnection | null> {
    const db = getPool();
    let [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM slack_connections WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [userId]
    );

    // Fall back to any active workspace connection so all logged-in accounts inherit alerts
    if (!rows || rows.length === 0) {
      [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM slack_connections WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1'
      );
    }

    const conn = rows[0] as SlackConnection | undefined;
    if (!conn) return null;

    // Decrypt tokens
    try {
      conn.access_token = decrypt(conn.access_token);
      conn.webhook_url = decrypt(conn.webhook_url);
    } catch {
      // Use as-is if not encrypted
    }
    return conn;
  },

  async upsert(data: {
    userId: string;
    teamId: string;
    teamName: string;
    accessToken: string;
    webhookUrl: string;
  }): Promise<string> {
    const db = getPool();
    const id = uuidv4();
    const encToken = encrypt(data.accessToken);
    const encWebhook = encrypt(data.webhookUrl);

    // Deactivate existing connections for this user
    await db.execute(
      'UPDATE slack_connections SET is_active = 0, updated_at = NOW() WHERE user_id = ?',
      [data.userId]
    );

    await db.execute(
      `INSERT INTO slack_connections (id, user_id, team_id, team_name, access_token, webhook_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), webhook_url = VALUES(webhook_url), is_active = 1, updated_at = NOW()`,
      [id, data.userId, data.teamId, data.teamName, encToken, encWebhook]
    );

    return id;
  },

  async disconnect(userId: string): Promise<boolean> {
    const db = getPool();
    const [result] = await db.execute<ResultSetHeader>(
      'UPDATE slack_connections SET is_active = 0, updated_at = NOW() WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    if (result.affectedRows === 0) {
      const [wsResult] = await db.execute<ResultSetHeader>(
        'UPDATE slack_connections SET is_active = 0, updated_at = NOW() WHERE is_active = 1'
      );
      return wsResult.affectedRows > 0;
    }
    return result.affectedRows > 0;
  },

  async getStatus(userId: string): Promise<{ connected: boolean; teamName?: string }> {
    const db = getPool();
    let [rows] = await db.execute<RowDataPacket[]>(
      'SELECT team_name FROM slack_connections WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [userId]
    );
    if (rows && rows.length > 0) {
      const conn = rows[0] as { team_name: string };
      return { connected: true, teamName: conn.team_name };
    }

    // Fall back to any active workspace connection
    [rows] = await db.execute<RowDataPacket[]>(
      'SELECT team_name FROM slack_connections WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1'
    );
    if (rows && rows.length > 0) {
      const conn = rows[0] as { team_name: string };
      return { connected: true, teamName: conn.team_name };
    }

    return { connected: false };
  },
};
