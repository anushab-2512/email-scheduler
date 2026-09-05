import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest } from '../types/common.types';
import { JwtPayload } from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';

export function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.token;

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const decoded = jwt.verify(token, env.SESSION_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}
