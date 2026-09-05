import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { getSlackAuthUrl, exchangeSlackCode, sendSlackMessage } from '../integrations/slack';
import { slackRepository } from '../repositories/slack.repository';
import { getRedis } from '../redis/redis';
import { REDIS_KEYS } from '../config/constants';
import { AuthenticatedRequest } from '../types/common.types';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

export const slackController = {
  /** GET /api/slack/connect — redirect to Slack OAuth */
  async connect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
        res.status(503).json({
          success: false,
          error: { code: 'SLACK_NOT_CONFIGURED', message: 'Slack integration is not configured' },
        });
        return;
      }

      // Generate state with embedded userId
      const state = `${req.user.userId}:${crypto.randomBytes(16).toString('hex')}`;
      const redis = getRedis();
      await redis.set(REDIS_KEYS.OAUTH_STATE(state), req.user.userId, 'EX', 600);

      const url = getSlackAuthUrl(state);
      res.redirect(url);
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/slack/callback — handle Slack OAuth callback */
  async callback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
        return;
      }

      // Verify state and get userId
      const redis = getRedis();
      const userId = await redis.get(REDIS_KEYS.OAUTH_STATE(state));
      if (!userId) {
        res.redirect(`${env.FRONTEND_URL}/dashboard?slack=invalid_state`);
        return;
      }
      await redis.del(REDIS_KEYS.OAUTH_STATE(state));

      // Exchange code for access
      const slackData = await exchangeSlackCode(code);

      // Store connection
      await slackRepository.upsert({
        userId,
        teamId: slackData.teamId,
        teamName: slackData.teamName,
        accessToken: slackData.accessToken,
        webhookUrl: slackData.webhookUrl,
      });

      logger.info('SLACK', 'Slack connected', { userId, teamName: slackData.teamName });

      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
    } catch (error) {
      logger.error('SLACK', 'OAuth callback failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
    }
  },

  /** POST /api/slack/webhook — connect via incoming webhook URL directly */
  async saveWebhook(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { webhookUrl, channelName } = req.body;
      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://hooks.slack.com/')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_WEBHOOK', message: 'Please provide a valid Slack incoming webhook URL starting with https://hooks.slack.com/' }
        });
        return;
      }

      await slackRepository.upsert({
        userId: req.user.userId,
        teamId: 'manual-webhook',
        teamName: channelName || 'Slack Channel',
        accessToken: 'webhook-only',
        webhookUrl,
      });

      logger.info('SLACK', 'Manual webhook configured', { userId: req.user.userId });
      res.json({ success: true, data: { message: 'Slack webhook connected successfully' } });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/slack/test — send a test alert to the connected Slack channel */
  async testNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const conn = await slackRepository.findActiveByUserId(req.user.userId);
      if (!conn || !conn.webhook_url) {
        res.status(400).json({
          success: false,
          error: { code: 'NOT_CONNECTED', message: 'No active Slack connection found' }
        });
        return;
      }

      await sendSlackMessage(
        conn.webhook_url,
        `🔔 *Test Notification from ReachInbox Email Scheduler*\nYour Slack alert channel is connected and ready to receive hourly rate-limit notifications!`
      );

      res.json({ success: true, data: { message: 'Test message sent to Slack successfully!' } });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/slack/disconnect */
  async disconnect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      await slackRepository.disconnect(req.user.userId);
      res.json({ success: true, data: { message: 'Slack disconnected' } });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/slack/status */
  async status(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const status = await slackRepository.getStatus(req.user.userId);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  },
};
