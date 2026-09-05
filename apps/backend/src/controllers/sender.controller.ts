import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/common.types';
import { senderRepository } from '../repositories/sender.repository';
import { createSenderSchema, updateSenderSchema } from '../validators/sender.schema';
import { ValidationError, NotFoundError } from '../utils/errors';

export const senderController = {
  /** GET /api/senders */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const senders = await senderRepository.findByUserId(req.user!.userId);
      res.json({ success: true, data: senders });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/senders */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createSenderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map(e => e.message).join(', '));
      }

      const sender = await senderRepository.create({
        userId: req.user!.userId,
        name: parsed.data.name,
        email: parsed.data.email,
        smtpHost: parsed.data.smtp_host,
        smtpPort: parsed.data.smtp_port,
        smtpUser: parsed.data.smtp_user,
        smtpPassword: parsed.data.smtp_password,
      });

      res.status(201).json({ success: true, data: sender });
    } catch (error) {
      next(error);
    }
  },

  /** PUT /api/senders/:id */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateSenderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map(e => e.message).join(', '));
      }

      const senderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await senderRepository.update(senderId, req.user!.userId, {
        name: parsed.data.name,
        email: parsed.data.email,
        smtpHost: parsed.data.smtp_host,
        smtpPort: parsed.data.smtp_port,
        smtpUser: parsed.data.smtp_user,
        smtpPassword: parsed.data.smtp_password,
      });

      if (!updated) {
        throw new NotFoundError('Sender');
      }

      res.json({ success: true, data: { message: 'Sender updated' } });
    } catch (error) {
      next(error);
    }
  },

  /** DELETE /api/senders/:id */
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const senderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const deleted = await senderRepository.delete(senderId, req.user!.userId);
      if (!deleted) {
        throw new NotFoundError('Sender');
      }
      res.json({ success: true, data: { message: 'Sender deleted' } });
    } catch (error) {
      next(error);
    }
  },
};
