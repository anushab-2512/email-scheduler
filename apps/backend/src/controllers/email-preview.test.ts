import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emailController } from './email.controller';
import { emailRepository } from '../repositories/email.repository';

vi.mock('../repositories/email.repository', () => ({
  emailRepository: {
    getEmailPreviewById: vi.fn(),
  },
}));

describe('Email Preview Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when email record is not found', async () => {
    vi.mocked(emailRepository.getEmailPreviewById).mockResolvedValue(null);

    const req: any = {
      params: { id: 'non-existent-id' },
      user: { userId: 'test-user-123' },
    };

    let responseStatus = 0;
    let responseJson: any = null;

    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return res;
      },
      json: (data: any) => {
        responseJson = data;
        return res;
      },
    };

    const next = vi.fn();

    await emailController.getPreview(req, res, next);

    expect(responseStatus).toBe(404);
    expect(responseJson).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Email not found.' },
    });
  });

  it('returns exact recipient, subject, body, sent_at and status for a valid email', async () => {
    const mockRecord: any = {
      id: 'email-456',
      recipient_email: 'vivek.gupta25@gmail.com',
      sender_email: 'sender@example.com',
      sender_name: 'Lead Recruiter',
      subject: 'internship details',
      body: '<p>Hello Vivek, here are the internship details.</p>',
      sent_at: new Date('2026-09-05T10:16:22.000Z'),
      status: 'sent',
      ethereal_url: 'https://ethereal.email/messages',
      ethereal_message_id: '<msg-123@ethereal.email>',
    };

    vi.mocked(emailRepository.getEmailPreviewById).mockResolvedValue(mockRecord);

    const req: any = {
      params: { id: 'email-456' },
      user: { userId: 'test-user-123' },
    };

    let responseJson: any = null;

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: (data: any) => {
        responseJson = data;
        return res;
      },
    };

    const next = vi.fn();

    await emailController.getPreview(req, res, next);

    expect(responseJson.success).toBe(true);
    expect(responseJson.data.recipient_email).toBe('vivek.gupta25@gmail.com');
    expect(responseJson.data.subject).toBe('internship details');
    expect(responseJson.data.body).toBe('<p>Hello Vivek, here are the internship details.</p>');
    expect(responseJson.data.status).toBe('sent');
    expect(responseJson.data.sender_email).toBe('sender@example.com');
  });

  it('maintains data consistency when querying a different recipient', async () => {
    const mockSnehaRecord: any = {
      id: 'email-789',
      recipient_email: 'sneha.rao11@gmail.com',
      sender_email: 'sender@example.com',
      sender_name: 'Lead Recruiter',
      subject: 'internship details',
      body: '<p>Hello Sneha, here is your internship offer.</p>',
      sent_at: new Date('2026-09-05T10:16:20.000Z'),
      status: 'sent',
      ethereal_url: 'https://ethereal.email/messages',
      ethereal_message_id: '<msg-456@ethereal.email>',
    };

    vi.mocked(emailRepository.getEmailPreviewById).mockResolvedValue(mockSnehaRecord);

    const req: any = {
      params: { id: 'email-789' },
      user: { userId: 'test-user-123' },
    };

    let responseJson: any = null;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: (data: any) => {
        responseJson = data;
        return res;
      },
    };

    await emailController.getPreview(req, res, vi.fn());

    expect(responseJson.data.recipient_email).toBe('sneha.rao11@gmail.com');
    expect(responseJson.data.body).toContain('Hello Sneha');
    expect(responseJson.data.recipient_email).not.toBe('vivek.gupta25@gmail.com');
  });
});
