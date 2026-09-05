import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/common.types';
import { scheduleEmailSchema } from '../validators/email.schema';
import { scheduleEmails } from '../services/scheduler/scheduler.service';
import { emailRepository } from '../repositories/email.repository';
import { searchEmails } from '../integrations/elasticsearch';
import { ValidationError } from '../utils/errors';
import { parseEmailsFromContent } from '../utils/csv-parser';
import { getRedis } from '../redis/redis';

export const emailController = {
  /** POST /api/emails/schedule */
  async schedule(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = scheduleEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map(e => e.message).join(', '));
      }

      const result = await scheduleEmails(req.user!.userId, parsed.data);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/emails/parse-csv — parse a CSV/text file for email addresses */
  async parseCsv(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const content = file.buffer.toString('utf-8');
      const emails = parseEmailsFromContent(content);

      res.json({
        success: true,
        data: {
          emails,
          count: emails.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/scheduled */
  async getScheduled(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const result = await emailRepository.getScheduledByUser(req.user!.userId, page, limit);

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/sent */
  async getSent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const result = await emailRepository.getSentByUser(req.user!.userId, page, limit);

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/search?q= */
  async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query.q as string) || '';
      if (!query.trim()) {
        res.json({ success: true, data: { items: [], total: 0 } });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const result = await searchEmails(req.user!.userId, query, page, limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/:id */
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const emailId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const email = await emailRepository.getEmailById(emailId, req.user!.userId);

      if (!email) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Email not found' },
        });
        return;
      }

      res.json({ success: true, data: email });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/campaigns — Paginated composed email campaigns with stats for Email Details */
  async getCampaigns(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 6, 100);

      const result = await emailRepository.getCampaignsWithStats(req.user!.userId, page, limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/campaigns/:id — Single composed email campaign with stats & attachments */
  async getCampaignById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const campaign = await emailRepository.getCampaignByIdWithStats(campaignId, req.user!.userId);

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Campaign not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/recipients — Paginated recipient items for Table (optionally scoped to campaign_id) */
  async getAllRecipients(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const campaignId = (req.query.campaign_id || req.query.campaignId) as string | undefined;

      const result = await emailRepository.getAllRecipientsByUser(req.user!.userId, page, limit, campaignId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/emails/events — Server-Sent Events stream for real-time status updates */
  async events(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = req.user!.userId;
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const redisSubscriber = getRedis().duplicate();
    await redisSubscriber.subscribe('email-events');

    const messageHandler = (channel: string, message: string) => {
      if (channel === 'email-events') {
        try {
          const parsed = JSON.parse(message);
          if (!parsed.userId || parsed.userId === userId) {
            res.write(`data: ${message}\n\n`);
          }
        } catch {
          // Ignore
        }
      }
    };

    redisSubscriber.on('message', messageHandler);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      redisSubscriber.removeListener('message', messageHandler);
      redisSubscriber.unsubscribe('email-events').catch(() => {});
      redisSubscriber.quit().catch(() => {});
    });
  },

  /** DELETE /api/emails/campaigns/:id and DELETE /api/emails/:id */
  async deleteCampaign(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Missing ID parameter' },
        });
        return;
      }

      const result = await emailRepository.deleteEmailOrCampaign(id, req.user!.userId);

      if (!result.success) {
        res.status(result.status || 400).json({
          success: false,
          error: {
            code: result.status === 409 ? 'PROCESSING' : 'DELETE_FAILED',
            message: result.error || 'Failed to delete mail. Please try again.',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Mail and all related data deleted successfully.' },
      });
    } catch (error) {
      next(error);
    }
  },
};
