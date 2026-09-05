import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/mysql';
import { User, GoogleUserInfo } from '../types/auth.types';

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return (rows[0] as User) || null;
  },

  async findByGoogleId(googleId: string): Promise<User | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM users WHERE google_id = ?',
      [googleId]
    );
    return (rows[0] as User) || null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return (rows[0] as User) || null;
  },

  async upsertFromGoogle(userInfo: GoogleUserInfo): Promise<User> {
    const db = getPool();
    const existing = (await this.findByGoogleId(userInfo.sub)) || (await this.findByEmail(userInfo.email));

    if (existing) {
      await db.execute(
        'UPDATE users SET google_id = ?, name = ?, email = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?',
        [userInfo.sub, userInfo.name, userInfo.email, userInfo.picture || null, existing.id]
      );
      return {
        ...existing,
        google_id: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
        avatar_url: userInfo.picture || null,
      };
    }

    const id = uuidv4();
    await db.execute(
      'INSERT INTO users (id, google_id, name, email, avatar_url) VALUES (?, ?, ?, ?, ?)',
      [id, userInfo.sub, userInfo.name, userInfo.email, userInfo.picture || null]
    );

    return {
      id,
      google_id: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email,
      avatar_url: userInfo.picture || null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  },
};
