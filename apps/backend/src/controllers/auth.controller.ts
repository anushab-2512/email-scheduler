import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { getGoogleAuthUrl, exchangeGoogleCode, getGoogleUserInfo } from '../integrations/google';
import { userRepository } from '../repositories/user.repository';
import { getRedis } from '../redis/redis';
import { REDIS_KEYS } from '../config/constants';
import { AuthenticatedRequest } from '../types/common.types';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

// Resilient in-memory store for OAuth state (ensures CSRF protection even if Redis is reconnecting)
const inMemoryOAuthStates = new Map<string, number>();

// In-memory rate limit tracker for OAuth initiation (prevents rapid-fire redirects to Google)
const oauthRateLimitMap = new Map<string, number>();
const OAUTH_RATE_LIMIT_WINDOW_MS = 5_000; // 5 seconds between OAuth attempts per IP

// Clean up stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of oauthRateLimitMap) {
    if (now - timestamp > OAUTH_RATE_LIMIT_WINDOW_MS) {
      oauthRateLimitMap.delete(key);
    }
  }
  // Also clean expired in-memory OAuth states
  for (const [key, expiry] of inMemoryOAuthStates) {
    if (expiry < now) {
      inMemoryOAuthStates.delete(key);
    }
  }
}, 60_000);

export const authController = {
  /** GET /api/auth/google — redirect to Google OAuth */
  async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Rate limit OAuth initiation per IP to prevent Google's 429 "Too Many Requests"
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const lastAttempt = oauthRateLimitMap.get(clientIp);
      const now = Date.now();

      if (lastAttempt && now - lastAttempt < OAUTH_RATE_LIMIT_WINDOW_MS) {
        const waitSec = Math.ceil((OAUTH_RATE_LIMIT_WINDOW_MS - (now - lastAttempt)) / 1000);
        logger.warn('AUTH', 'OAuth rate limit hit — too many rapid attempts', { clientIp, waitSec });
        res.redirect(`${env.FRONTEND_URL}/login?error=rate_limited`);
        return;
      }
      oauthRateLimitMap.set(clientIp, now);

      // Generate and store state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      inMemoryOAuthStates.set(state, Date.now() + 600_000); // 10 min

      try {
        const redis = getRedis();
        await redis.set(REDIS_KEYS.OAUTH_STATE(state), '1', 'EX', 600);
      } catch (redisErr) {
        logger.warn('AUTH', 'Redis unavailable for OAuth state caching; using in-memory fallback', {
          error: redisErr instanceof Error ? redisErr.message : String(redisErr),
        });
      }

      const url = getGoogleAuthUrl(state);
      res.redirect(url);
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/auth/google/callback — handle OAuth callback */
  async googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        throw new UnauthorizedError('Invalid OAuth callback parameters');
      }

      // Verify state via in-memory cache or Redis
      let isStateValid = false;
      const memExpiry = inMemoryOAuthStates.get(state);
      if (memExpiry && memExpiry > Date.now()) {
        isStateValid = true;
        inMemoryOAuthStates.delete(state);
      }

      try {
        const redis = getRedis();
        const storedState = await redis.get(REDIS_KEYS.OAUTH_STATE(state));
        if (storedState) {
          isStateValid = true;
          await redis.del(REDIS_KEYS.OAUTH_STATE(state));
        }
      } catch (redisErr) {
        logger.warn('AUTH', 'Redis unavailable for OAuth state verification', {
          error: redisErr instanceof Error ? redisErr.message : String(redisErr),
        });
      }

      if (!isStateValid) {
        throw new UnauthorizedError('Invalid or expired OAuth state');
      }

      // Exchange code for tokens
      const tokens = await exchangeGoogleCode(code);

      // Get user info
      const userInfo = await getGoogleUserInfo(tokens.access_token);

      // Find or create user
      const user = await userRepository.upsertFromGoogle(userInfo);

      logger.info('AUTH', 'User authenticated', { userId: user.id, email: user.email });

      // Create JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        env.SESSION_SECRET,
        { expiresIn: '7d' }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      // Redirect to frontend dashboard
      res.redirect(`${env.FRONTEND_URL}/dashboard?token=${token}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AUTH', 'OAuth callback failed', { error: errorMsg });

      // Detect rate limiting from Google (429 status or related message)
      const isRateLimited =
        errorMsg.toLowerCase().includes('too many requests') ||
        errorMsg.includes('429') ||
        errorMsg.toLowerCase().includes('rate limit');

      const errorCode = isRateLimited ? 'rate_limited' : 'auth_failed';
      res.redirect(`${env.FRONTEND_URL}/login?error=${errorCode}`);
    }
  },

  /** GET /api/auth/me — return current user */
  async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const user = await userRepository.findById(req.user.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/auth/logout — clear session */
  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie('token', {
      path: '/',
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  },

  /** GET /api/auth/demo-login — dev helper to authenticate seeded demo user */
  async demoLogin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let user =
        (await userRepository.findByEmail('nagaraj23107@gmail.com')) ||
        (await userRepository.findByEmail('demo@example.com'));
      if (!user) {
        user = await userRepository.upsertFromGoogle({
          sub: 'demo-user-001',
          email: 'demo@example.com',
          name: 'Demo Reviewer',
          picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=reachinbox',
        });
      }
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        env.SESSION_SECRET,
        { expiresIn: '7d' }
      );
      res.cookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.redirect(`${env.FRONTEND_URL}/dashboard?token=${token}`);
    } catch (error) {
      next(error);
    }
  },
};
