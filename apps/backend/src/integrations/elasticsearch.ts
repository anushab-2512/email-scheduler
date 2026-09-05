import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Email } from '../types/email.types';
import { getPool } from '../db/mysql';

let esClient: Client | null = null;
let lastESCheck = 0;
let isESReachable = false;

export function getESClient(): Client {
  if (!esClient) {
    esClient = new Client({
      node: env.ELASTICSEARCH_URL,
      requestTimeout: 1000,
      maxRetries: 0,
    });
    logger.info('ELASTICSEARCH', 'Client initialized', { url: env.ELASTICSEARCH_URL });
  }
  return esClient;
}

export async function ensureIndex(): Promise<void> {
  const client = getESClient();
  const indexName = env.ELASTICSEARCH_INDEX;

  try {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              recipientEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              senderEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              senderId: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              userId: { type: 'keyword' },
            },
          },
        },
      });
      logger.info('ELASTICSEARCH', `Index "${indexName}" created`);
    }
  } catch (error) {
    logger.error('ELASTICSEARCH', 'Failed to ensure index', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function indexEmail(email: Email, senderEmail: string): Promise<void> {
  try {
    const client = getESClient();
    await client.index({
      index: env.ELASTICSEARCH_INDEX,
      id: email.id,
      document: {
        id: email.id,
        campaignId: email.campaign_id,
        recipientEmail: email.recipient_email,
        subject: email.subject,
        body: email.body,
        status: email.status,
        senderEmail,
        senderId: email.sender_id,
        scheduledAt: email.scheduled_at,
        sentAt: email.sent_at,
        userId: email.user_id,
      },
    });
  } catch (error) {
    logger.error('ELASTICSEARCH', 'Failed to index email', {
      emailId: email.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateEmailInIndex(emailId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const client = getESClient();
    await client.update({
      index: env.ELASTICSEARCH_INDEX,
      id: emailId,
      doc: fields,
    });
  } catch (error) {
    logger.error('ELASTICSEARCH', 'Failed to update email in index', {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteEmailFromIndex(emailId: string): Promise<void> {
  try {
    const isHealthy = await checkESHealth();
    if (!isHealthy) return;
    const client = getESClient();
    await client.delete({
      index: env.ELASTICSEARCH_INDEX,
      id: emailId,
    });
  } catch (error) {
    logger.warn('ELASTICSEARCH', 'Failed to delete email from index', {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteEmailsByCampaignFromIndex(campaignId: string): Promise<void> {
  try {
    const isHealthy = await checkESHealth();
    if (!isHealthy) return;
    const client = getESClient();
    await client.deleteByQuery({
      index: env.ELASTICSEARCH_INDEX,
      body: {
        query: {
          term: { campaignId },
        },
      },
      conflicts: 'proceed',
    });
  } catch (error) {
    logger.warn('ELASTICSEARCH', 'Failed to delete campaign emails from index', {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function checkESHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastESCheck < 10000) {
    return isESReachable;
  }
  lastESCheck = now;
  try {
    const client = getESClient();
    const health = await client.cluster.health();
    isESReachable = health.status !== 'red';
    return isESReachable;
  } catch {
    isESReachable = false;
    return false;
  }
}

export async function searchEmails(userId: string, query: string, page = 1, limit = 50): Promise<{
  items: Array<Record<string, unknown>>;
  total: number;
}> {
  const isHealthy = await checkESHealth();
  if (!isHealthy) {
    return searchFromDatabase(userId, query, page, limit);
  }

  try {
    const client = getESClient();
    const from = (page - 1) * limit;

    const result = await client.search({
      index: env.ELASTICSEARCH_INDEX,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { userId } },
              {
                multi_match: {
                  query,
                  fields: ['recipientEmail', 'subject', 'status', 'senderEmail'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      },
    });

    const hits = result.hits.hits;
    const total = typeof result.hits.total === 'number'
      ? result.hits.total
      : result.hits.total?.value || 0;

    return {
      items: hits.map(hit => ({ ...(hit._source as Record<string, unknown>), _score: hit._score })),
      total,
    };
  } catch (error) {
    logger.warn('ELASTICSEARCH', 'Search via ES unavailable, using database fallback search', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return searchFromDatabase(userId, query, page, limit);
  }
}

async function searchFromDatabase(
  userId: string,
  query: string,
  page = 1,
  limit = 50
): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  try {
    const db = getPool();
    const offset = (page - 1) * limit;
    const pattern = `%${query}%`;

    const [countRows] = await db.execute<any[]>(
      `SELECT COUNT(*) as total FROM emails 
       WHERE user_id = ? AND (recipient_email LIKE ? OR subject LIKE ? OR body LIKE ?)`,
      [userId, pattern, pattern, pattern]
    );
    const total = (countRows[0] as { total: number })?.total || 0;

    const [rows] = await db.query<any[]>(
      `SELECT e.*, s.email as sender_email 
       FROM emails e 
       LEFT JOIN senders s ON e.sender_id = s.id 
       WHERE e.user_id = ? AND (e.recipient_email LIKE ? OR e.subject LIKE ? OR e.body LIKE ?)
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pattern, pattern, pattern, limit, offset]
    );

    const items = rows.map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      body: row.body,
      status: row.status,
      senderEmail: row.sender_email,
      senderId: row.sender_id,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      userId: row.user_id,
      _score: 1.0,
    }));

    return { items, total };
  } catch (dbError) {
    logger.error('ELASTICSEARCH', 'Database fallback search failed', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return { items: [], total: 0 };
  }
}

export async function closeES(): Promise<void> {
  if (esClient) {
    await esClient.close();
    esClient = null;
    logger.info('ELASTICSEARCH', 'Client closed');
  }
}
