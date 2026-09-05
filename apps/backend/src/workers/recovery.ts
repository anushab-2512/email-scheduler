import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/mysql';
import { getEmailQueue, addEmailJob } from '../queue/email.queue';
import { JOB_IDS } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * Recover any scheduled emails that were stuck in processing (e.g. from crash or restart)
 * or scheduled emails whose BullMQ jobs are missing or failed.
 */
export async function recoverScheduledEmails(): Promise<void> {
  try {
    const db = getPool();

    // 1. Reset any emails stuck in 'processing' back to 'scheduled'
    const [resetResult] = await db.query(
      "UPDATE emails SET status = 'scheduled' WHERE status = 'processing'"
    );
    const affected = (resetResult as any)?.affectedRows || 0;
    if (affected > 0) {
      logger.info('WORKER', `Reset ${affected} stuck 'processing' emails back to 'scheduled'`);
    }

    // 2. Fetch all currently 'scheduled' emails
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT e.id, e.campaign_id, e.sender_id, e.scheduled_at 
       FROM emails e 
       WHERE e.status = 'scheduled' 
       ORDER BY e.scheduled_at ASC`
    );

    if (rows.length === 0) {
      logger.info('WORKER', 'No pending scheduled emails to recover');
      return;
    }

    const queue = getEmailQueue();
    const now = Date.now();
    let readdedCount = 0;

    for (const email of rows) {
      const jobId = JOB_IDS.email(email.id);
      try {
        const existing = await queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'delayed' || state === 'waiting') {
            continue; // Already scheduled and valid in queue
          }
          if (state === 'failed') {
            await existing.remove();
          }
        }

        const scheduledTime = email.scheduled_at ? new Date(email.scheduled_at).getTime() : now;
        const delayMs = Math.max(0, scheduledTime - now);

        await addEmailJob(
          {
            emailId: email.id,
            campaignId: email.campaign_id,
            senderId: email.sender_id,
          },
          delayMs
        );
        readdedCount++;
      } catch (jobErr) {
        logger.warn('WORKER', `Could not recover job for email ${email.id}`, {
          error: jobErr instanceof Error ? jobErr.message : String(jobErr),
        });
      }
    }

    logger.info('WORKER', `Successfully recovered and enqueued ${readdedCount} scheduled emails`);
  } catch (err) {
    logger.error('WORKER', 'Error during scheduled email recovery', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
