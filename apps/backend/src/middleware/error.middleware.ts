import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Handle operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Log unexpected errors
  logger.error('API', 'Unexpected error', {
    error: err.message,
    stack: err.stack?.split('\n')[0] || '',
  });

  // Never leak internal details
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
