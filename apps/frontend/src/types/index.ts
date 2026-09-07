export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface Email {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  scheduled_at: string;
  sent_at: string | null;
  status: EmailStatus;
  attempt_count: number;
  bull_job_id: string | null;
  error_message: string | null;
  ethereal_message_id: string | null;
  ethereal_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailPreviewData {
  id: string;
  recipient_email: string;
  sender_email?: string | null;
  sender_name?: string | null;
  subject: string;
  body: string;
  sent_at: string | null;
  status: EmailStatus;
  ethereal_url: string | null;
  ethereal_message_id: string | null;
}

export interface Sender {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlackStatus {
  connected: boolean;
  teamName?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // Base64
}

export interface CampaignWithStats {
  id: string;
  user_id: string;
  sender_id: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  attachments_count: number;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  sent_percentage: number;
  status: 'completed' | 'in_progress' | 'failed';
  hourly_limit: number;
  delay_ms: number;
  start_time: string;
  created_at: string;
  updated_at: string;
}

export interface RecipientItem {
  id: string;
  campaign_id: string;
  campaign_subject: string;
  recipient_email: string;
  status: EmailStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleEmailPayload {
  sender_id: string;
  subject: string;
  body: string;
  recipients: string[];
  start_time: string;
  delay_ms: number;
  hourly_limit: number;
  attachments?: EmailAttachment[];
}
