import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool } from '../db/mysql';
import { Sender, SenderPublic } from '../types/email.types';
import { encrypt, decrypt } from '../utils/crypto';

function toPublic(sender: Sender): SenderPublic {
  return {
    id: sender.id,
    user_id: sender.user_id,
    name: sender.name,
    email: sender.email,
    is_active: sender.is_active,
    created_at: sender.created_at,
    updated_at: sender.updated_at,
  };
}

export const senderRepository = {
  async findByUserId(userId: string): Promise<SenderPublic[]> {
    const db = getPool();
    let [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM senders WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [userId]
    );
    if (!rows || rows.length === 0) {
      // Fall back to active senders so new logged-in users immediately have default Ethereal senders
      [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM senders WHERE is_active = 1 ORDER BY created_at ASC LIMIT 10'
      );
    }
    return (rows as Sender[]).map(toPublic);
  },

  async findById(id: string): Promise<Sender | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM senders WHERE id = ?',
      [id]
    );
    const sender = rows[0] as Sender | undefined;
    if (!sender) return null;
    // Decrypt SMTP password for worker use
    try {
      sender.smtp_password = decrypt(sender.smtp_password);
    } catch {
      // If not encrypted (legacy/seed data), use as-is
    }
    return sender;
  },

  async findByIdPublic(id: string, userId: string): Promise<SenderPublic | null> {
    const db = getPool();
    let [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM senders WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    let sender = rows[0] as Sender | undefined;
    if (!sender) {
      [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM senders WHERE id = ? AND is_active = 1',
        [id]
      );
      sender = rows[0] as Sender | undefined;
    }
    return sender ? toPublic(sender) : null;
  },


  async create(data: {
    userId: string;
    name: string;
    email: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
  }): Promise<SenderPublic> {
    const db = getPool();
    const id = uuidv4();
    const encryptedPassword = encrypt(data.smtpPassword);

    await db.execute(
      `INSERT INTO senders (id, user_id, name, email, smtp_host, smtp_port, smtp_user, smtp_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.userId, data.name, data.email, data.smtpHost, data.smtpPort, data.smtpUser, encryptedPassword]
    );

    return {
      id,
      user_id: data.userId,
      name: data.name,
      email: data.email,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
  },

  async update(id: string, userId: string, data: {
    name?: string;
    email?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
  }): Promise<boolean> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.smtpHost !== undefined) { fields.push('smtp_host = ?'); values.push(data.smtpHost); }
    if (data.smtpPort !== undefined) { fields.push('smtp_port = ?'); values.push(data.smtpPort); }
    if (data.smtpUser !== undefined) { fields.push('smtp_user = ?'); values.push(data.smtpUser); }
    if (data.smtpPassword !== undefined) { fields.push('smtp_password = ?'); values.push(encrypt(data.smtpPassword)); }

    if (fields.length === 0) return false;

    fields.push('updated_at = NOW()');
    values.push(id, userId);

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE senders SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    return result.affectedRows > 0;
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const db = getPool();
    const [result] = await db.execute<ResultSetHeader>(
      'UPDATE senders SET is_active = 0, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  },
};
