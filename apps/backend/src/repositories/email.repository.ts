import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool } from '../db/mysql';
import { Email, EmailCampaign, EmailWithCampaign, CampaignWithStats, RecipientItem, EmailAttachment } from '../types/email.types';
import { EmailStatus, JOB_IDS } from '../config/constants';
import { getEmailQueue } from '../queue/email.queue';
import { deleteEmailsByCampaignFromIndex } from '../integrations/elasticsearch';
import { getRedis } from '../redis/redis';
import { logger } from '../utils/logger';

export const emailRepository = {
  // ── Campaign ──────────────────────────────────────────────

  async createCampaign(data: {
    userId: string;
    senderId: string;
    subject: string;
    body: string;
    startTime: Date;
    delayMs: number;
    hourlyLimit: number;
    totalRecipients: number;
    attachments?: EmailAttachment[];
  }): Promise<string> {
    const db = getPool();
    const id = uuidv4();
    const attachmentsJson = data.attachments && data.attachments.length > 0 ? JSON.stringify(data.attachments) : null;
    await db.execute(
      `INSERT INTO email_campaigns (id, user_id, sender_id, subject, body, start_time, delay_ms, hourly_limit, total_recipients, attachments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.userId, data.senderId, data.subject, data.body, data.startTime, data.delayMs, data.hourlyLimit, data.totalRecipients, attachmentsJson]
    );
    return id;
  },

  async getCampaignsByUser(userId: string): Promise<EmailCampaign[]> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM email_campaigns WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows as EmailCampaign[];
  },

  async getCampaignById(campaignId: string): Promise<EmailCampaign | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [campaignId]
    );
    return (rows[0] as EmailCampaign) || null;
  },

  async getCampaignByIdWithStats(campaignId: string, userId: string): Promise<CampaignWithStats | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        c.id, c.user_id, c.sender_id, c.subject, c.body, c.start_time, c.delay_ms, c.hourly_limit, c.total_recipients, c.attachments, c.created_at, c.updated_at,
        s.email as sender_email, s.name as sender_name
      FROM email_campaigns c
      LEFT JOIN senders s ON c.sender_id = s.id
      WHERE c.id = ? AND c.user_id = ?`,
      [campaignId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    const r = rows[0];

    const [statsRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        COUNT(id) as total_recipients_count,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) as sent_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(CASE WHEN status IN ('scheduled', 'processing') THEN 1 ELSE 0 END), 0) as pending_count
      FROM emails
      WHERE campaign_id = ?`,
      [campaignId]
    );

    const st = (statsRows[0] as any) || {
      total_recipients_count: 0,
      sent_count: 0,
      failed_count: 0,
      pending_count: 0,
    };

    let attachments: EmailAttachment[] = [];
    if (r.attachments) {
      try {
        attachments = typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments;
      } catch {
        attachments = [];
      }
    }

    const sentCount = Number(st.sent_count) || 0;
    const failedCount = Number(st.failed_count) || 0;
    const pendingCount = Number(st.pending_count) || 0;
    const totalRecipients = Number(r.total_recipients) || Number(st.total_recipients_count) || 0;
    const sentPercentage = totalRecipients > 0 ? Math.round((sentCount / totalRecipients) * 100) : 0;

    let status: 'completed' | 'in_progress' | 'failed' = 'in_progress';
    if (pendingCount === 0 && totalRecipients > 0) {
      if (sentCount > 0) {
        status = 'completed';
      } else if (failedCount > 0) {
        status = 'failed';
      }
    }

    return {
      id: r.id,
      user_id: r.user_id,
      sender_id: r.sender_id,
      sender_email: r.sender_email || 'Unknown',
      sender_name: r.sender_name || 'Sender',
      subject: r.subject,
      body: r.body,
      attachments,
      attachments_count: attachments.length,
      total_recipients: totalRecipients,
      sent_count: sentCount,
      failed_count: failedCount,
      pending_count: pendingCount,
      sent_percentage: sentPercentage,
      status,
      hourly_limit: r.hourly_limit,
      delay_ms: r.delay_ms,
      start_time: r.start_time,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  },


  async getCampaignsWithStats(userId: string, page = 1, limit = 20): Promise<{
    items: CampaignWithStats[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore?: boolean;
  }> {
    const db = getPool();
    const offset = (page - 1) * limit;

    const [countRows] = await db.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM email_campaigns WHERE user_id = ?',
      [userId]
    );
    const total = (countRows[0] as { total: number })?.total || 0;

    if (total === 0) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        hasMore: false,
      };
    }

    // Fetch paginated campaigns without joining the full emails table into sort memory
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 
        c.id, c.user_id, c.sender_id, c.subject, c.body, c.start_time, c.delay_ms, c.hourly_limit, c.total_recipients, c.attachments, c.created_at, c.updated_at,
        s.email as sender_email, s.name as sender_name
      FROM email_campaigns c
      LEFT JOIN senders s ON c.sender_id = s.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    if (rows.length === 0) {
      return {
        items: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: false,
      };
    }

    // Fetch stats for the returned campaigns
    const campaignIds = rows.map((r) => r.id);
    const placeholders = campaignIds.map(() => '?').join(',');
    const [statsRows] = await db.query<RowDataPacket[]>(
      `SELECT 
        campaign_id,
        COUNT(id) as total_recipients_count,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) as sent_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(CASE WHEN status IN ('scheduled', 'processing') THEN 1 ELSE 0 END), 0) as pending_count
      FROM emails
      WHERE campaign_id IN (${placeholders})
      GROUP BY campaign_id`,
      campaignIds
    );

    const statsMap = new Map<string, {
      total_recipients_count: number;
      sent_count: number;
      failed_count: number;
      pending_count: number;
    }>();

    for (const st of statsRows) {
      statsMap.set(st.campaign_id, {
        total_recipients_count: Number(st.total_recipients_count) || 0,
        sent_count: Number(st.sent_count) || 0,
        failed_count: Number(st.failed_count) || 0,
        pending_count: Number(st.pending_count) || 0,
      });
    }

    const items: CampaignWithStats[] = rows.map((r) => {
      let attachments: EmailAttachment[] = [];
      if (r.attachments) {
        try {
          attachments = typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments;
        } catch {
          attachments = [];
        }
      }

      const st = statsMap.get(r.id) || {
        total_recipients_count: 0,
        sent_count: 0,
        failed_count: 0,
        pending_count: 0,
      };

      const sentCount = st.sent_count;
      const failedCount = st.failed_count;
      const pendingCount = st.pending_count;
      const totalRecipients = Number(r.total_recipients) || st.total_recipients_count || 0;
      const sentPercentage = totalRecipients > 0 ? Math.round((sentCount / totalRecipients) * 100) : 0;

      let status: 'completed' | 'in_progress' | 'failed' = 'in_progress';
      if (pendingCount === 0 && totalRecipients > 0) {
        if (sentCount > 0) {
          status = 'completed';
        } else if (failedCount > 0) {
          status = 'failed';
        }
      }

      return {
        id: r.id,
        user_id: r.user_id,
        sender_id: r.sender_id,
        sender_email: r.sender_email || 'Unknown',
        sender_name: r.sender_name || 'Sender',
        subject: r.subject,
        body: r.body,
        attachments,
        attachments_count: attachments.length,
        total_recipients: totalRecipients,
        sent_count: sentCount,
        failed_count: failedCount,
        pending_count: pendingCount,
        sent_percentage: sentPercentage,
        status,
        hourly_limit: r.hourly_limit,
        delay_ms: r.delay_ms,
        start_time: r.start_time,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;
    const hasMore = page < totalPages;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasMore,
    };
  },

  // ── Emails ────────────────────────────────────────────────

  async createEmails(emails: Array<{
    id: string;
    campaignId: string;
    userId: string;
    senderId: string;
    recipientEmail: string;
    subject: string;
    body: string;
    scheduledAt: Date;
    bullJobId: string;
  }>): Promise<void> {
    if (emails.length === 0) return;

    const db = getPool();
    const placeholders = emails.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = emails.flatMap(e => [
      e.id, e.campaignId, e.userId, e.senderId, e.recipientEmail,
      e.subject, e.body, e.scheduledAt, e.bullJobId,
    ]);

    await db.execute(
      `INSERT INTO emails (id, campaign_id, user_id, sender_id, recipient_email, subject, body, scheduled_at, bull_job_id)
       VALUES ${placeholders}`,
      values
    );
  },

  async findById(id: string): Promise<Email | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ?',
      [id]
    );
    return (rows[0] as Email) || null;
  },

  async findByIdWithCampaign(id: string): Promise<EmailWithCampaign | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT e.*, 
              c.delay_ms as campaign_delay_ms, 
              c.hourly_limit as campaign_hourly_limit, 
              c.start_time as campaign_start_time,
              c.attachments as campaign_attachments 
       FROM emails e 
       LEFT JOIN email_campaigns c ON e.campaign_id = c.id 
       WHERE e.id = ?`,
      [id]
    );
    const email = (rows[0] as any) || null;
    if (email && email.campaign_attachments) {
      try {
        email.campaign_attachments = typeof email.campaign_attachments === 'string'
          ? JSON.parse(email.campaign_attachments)
          : email.campaign_attachments;
      } catch {
        email.campaign_attachments = [];
      }
    }
    return email as EmailWithCampaign | null;
  },

  async getAllRecipientsByUser(userId: string, page = 1, limit = 50, campaignId?: string): Promise<{
    items: RecipientItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const db = getPool();
    const offset = (page - 1) * limit;

    let countSql = 'SELECT COUNT(*) as total FROM emails WHERE user_id = ?';
    const countParams: any[] = [userId];
    if (campaignId) {
      countSql += ' AND campaign_id = ?';
      countParams.push(campaignId);
    }

    const [countRows] = await db.execute<RowDataPacket[]>(countSql, countParams);
    const total = (countRows[0] as { total: number })?.total || 0;

    let querySql = `SELECT 
        e.id, e.campaign_id, e.recipient_email, e.status, e.sent_at, e.created_at, e.updated_at,
        COALESCE(c.subject, 'Untitled') as campaign_subject
      FROM emails e
      LEFT JOIN email_campaigns c ON e.campaign_id = c.id
      WHERE e.user_id = ?`;
    const queryParams: any[] = [userId];
    if (campaignId) {
      querySql += ' AND e.campaign_id = ?';
      queryParams.push(campaignId);
    }
    querySql += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const [rows] = await db.query<RowDataPacket[]>(querySql, queryParams);

    return {
      items: rows as RecipientItem[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  },

  async findByBullJobId(bullJobId: string): Promise<Email | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM emails WHERE bull_job_id = ?',
      [bullJobId]
    );
    return (rows[0] as Email) || null;
  },

  async getScheduledByUser(userId: string, page = 1, limit = 50): Promise<{ items: Email[]; total: number }> {
    const db = getPool();
    const offset = (page - 1) * limit;

    const [countRows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM emails WHERE user_id = ? AND status IN ('scheduled', 'processing')",
      [userId]
    );
    const total = (countRows[0] as { total: number }).total;

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT * FROM emails WHERE user_id = ? AND status IN ('scheduled', 'processing') ORDER BY scheduled_at ASC LIMIT ? OFFSET ?",
      [userId, limit, offset]
    );

    return { items: rows as Email[], total };
  },

  async getSentByUser(userId: string, page = 1, limit = 50): Promise<{ items: Email[]; total: number }> {
    const db = getPool();
    const offset = (page - 1) * limit;

    const [countRows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM emails WHERE user_id = ? AND status IN ('sent', 'failed')",
      [userId]
    );
    const total = (countRows[0] as { total: number }).total;

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT * FROM emails WHERE user_id = ? AND status IN ('sent', 'failed') ORDER BY sent_at DESC, updated_at DESC LIMIT ? OFFSET ?",
      [userId, limit, offset]
    );

    return { items: rows as Email[], total };
  },

  /**
   * Atomically reserve an email for processing.
   * Returns true only if this caller successfully transitioned scheduled → processing.
   * This is the primary idempotency guard.
   */
  async atomicReserve(emailId: string): Promise<boolean> {
    const db = getPool();
    const [result] = await db.execute<ResultSetHeader>(
      "UPDATE emails SET status = 'processing', attempt_count = attempt_count + 1, updated_at = NOW() WHERE id = ? AND status = 'scheduled'",
      [emailId]
    );
    return result.affectedRows > 0;
  },

  async markSent(emailId: string, etherealMessageId: string | null, etherealUrl: string | null): Promise<void> {
    const db = getPool();
    await db.execute(
      "UPDATE emails SET status = 'sent', sent_at = NOW(), ethereal_message_id = ?, ethereal_url = ?, updated_at = NOW() WHERE id = ?",
      [etherealMessageId, etherealUrl, emailId]
    );
  },

  async markFailed(emailId: string, errorMessage: string): Promise<void> {
    const db = getPool();
    await db.execute(
      "UPDATE emails SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?",
      [errorMessage, emailId]
    );
  },

  /** Reset a processing email back to scheduled (for reschedule after rate limit) */
  async resetToScheduled(emailId: string, newScheduledAt: Date): Promise<void> {
    const db = getPool();
    await db.execute(
      "UPDATE emails SET status = 'scheduled', scheduled_at = ?, attempt_count = GREATEST(attempt_count - 1, 0), updated_at = NOW() WHERE id = ?",
      [newScheduledAt, emailId]
    );
  },

  async getEmailById(id: string, userId: string): Promise<Email | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return (rows[0] as Email) || null;
  },

  async getEmailPreviewById(id: string, userId: string): Promise<(Email & { sender_email?: string; sender_name?: string }) | null> {
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT e.id, e.campaign_id, e.user_id, e.sender_id, e.recipient_email, e.subject, e.body,
              e.scheduled_at, e.sent_at, e.status, e.attempt_count, e.bull_job_id, e.error_message,
              e.ethereal_message_id, e.ethereal_url, e.created_at, e.updated_at,
              s.email as sender_email, s.name as sender_name
       FROM emails e
       LEFT JOIN senders s ON e.sender_id = s.id
       WHERE e.id = ? AND e.user_id = ?`,
      [id, userId]
    );
    return (rows[0] as any) || null;
  },


  /**
   * Delete a campaign and all associated data across the application.
   * Safety check: If any email in the campaign is currently 'processing', prevents deletion.
   * Safely cancels any pending/delayed BullMQ jobs.
   * Removes from Elasticsearch.
   * Database CASCADE removes all rows in emails table.
   * Emits CAMPAIGN_DELETED over Redis SSE channel.
   */
  async deleteCampaign(campaignId: string, userId: string): Promise<{ success: boolean; error?: string; status?: number }> {
    const db = getPool();

    // 1. Verify campaign existence and ownership
    const [campRows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM email_campaigns WHERE id = ? AND user_id = ?',
      [campaignId, userId]
    );
    if (campRows.length === 0) {
      return { success: false, error: 'Campaign not found or access denied', status: 404 };
    }

    // 2. Check if any email is currently 'processing' (BullMQ Safety)
    const [processingRows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM emails WHERE campaign_id = ? AND status = 'processing'",
      [campaignId]
    );
    const processingCount = (processingRows[0] as { cnt: number })?.cnt || 0;
    if (processingCount > 0) {
      return {
        success: false,
        error: 'This email is currently being processed and cannot be deleted.',
        status: 409,
      };
    }

    // 3. Find all scheduled/delayed emails in this campaign to cancel BullMQ jobs
    const [emails] = await db.execute<RowDataPacket[]>(
      "SELECT id, bull_job_id FROM emails WHERE campaign_id = ? AND status = 'scheduled'",
      [campaignId]
    );

    try {
      const queue = getEmailQueue();
      for (const em of emails) {
        const jobId = em.bull_job_id || JOB_IDS.email(em.id);
        try {
          const job = await queue.getJob(jobId);
          if (job) {
            await job.remove();
            logger.info('QUEUE', 'Cancelled BullMQ job on campaign deletion', { jobId });
          }
        } catch (err) {
          logger.warn('QUEUE', 'Failed to remove job from BullMQ queue', { jobId, error: err });
        }
      }
    } catch (queueErr) {
      logger.warn('QUEUE', 'Queue connection error while cleaning up jobs', { error: queueErr });
    }

    // 4. Remove from Elasticsearch
    await deleteEmailsByCampaignFromIndex(campaignId);

    // 5. Delete from MySQL (cascade deletes all matching rows in emails table)
    await db.execute(
      'DELETE FROM email_campaigns WHERE id = ? AND user_id = ?',
      [campaignId, userId]
    );

    logger.info('MYSQL', 'Campaign and all related data deleted', { campaignId, userId });

    // 6. Broadcast real-time CAMPAIGN_DELETED event via Redis pub/sub
    try {
      const redis = getRedis();
      await redis.publish(
        'email-events',
        JSON.stringify({
          type: 'CAMPAIGN_DELETED',
          campaignId,
          userId,
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      // Non-critical if pubsub fails
    }

    return { success: true };
  },

  /**
   * Delete by email ID or campaign ID.
   * If ID matches an individual email, finds its campaign and deletes the campaign and all related data.
   */
  async deleteEmailOrCampaign(id: string, userId: string): Promise<{ success: boolean; error?: string; status?: number }> {
    const db = getPool();

    // Check if it's a campaign ID directly
    const [campRows] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM email_campaigns WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (campRows.length > 0) {
      return this.deleteCampaign(id, userId);
    }

    // Check if it's an email ID
    const [emailRows] = await db.execute<RowDataPacket[]>(
      'SELECT id, campaign_id FROM emails WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (emailRows.length > 0) {
      const campaignId = (emailRows[0] as any).campaign_id;
      if (campaignId) {
        return this.deleteCampaign(campaignId, userId);
      }
    }

    return { success: false, error: 'Email or campaign not found', status: 404 };
  },
};
