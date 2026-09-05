// Queue names
export const QUEUE_NAMES = {
  EMAIL_SEND: 'email-send',
  SLACK_NOTIFICATION: 'slack-notification',
} as const;

// Redis key prefixes
export const REDIS_KEYS = {
  SENDER_NEXT_SEND: (senderId: string) => `sender:${senderId}:next_send_at`,
  RATE_LIMIT: (senderId: string, hourWindow: string) => `rate:${senderId}:${hourWindow}`,
  SLACK_NOTIFIED: (senderId: string, hourWindow: string) => `slack-rate-limit-notified:${senderId}:${hourWindow}`,
  OAUTH_STATE: (state: string) => `oauth:state:${state}`,
} as const;

// Email statuses
export const EMAIL_STATUS = {
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export type EmailStatus = typeof EMAIL_STATUS[keyof typeof EMAIL_STATUS];

// BullMQ job ID helpers
export const JOB_IDS = {
  email: (emailId: string) => `email-${emailId}`,
  slackNotification: (senderId: string, hourWindow: string) => `slack-${senderId}-${hourWindow}`,
} as const;

// Hour window helper (UTC-based)
export function getHourWindow(date: Date = new Date()): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`;
}

// Calculate next hour window start time
export function getNextHourWindowStart(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}
