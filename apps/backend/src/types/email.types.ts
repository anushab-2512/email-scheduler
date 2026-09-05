import { EmailStatus } from '../config/constants';

export interface Sender {
  id: string;
  user_id: string;
  name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string; // encrypted at rest
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** What the frontend sees — no SMTP credentials */
export interface SenderPublic {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // Base64
}

export interface EmailCampaign {
  id: string;
  user_id: string;
  sender_id: string;
  subject: string;
  body: string;
  start_time: Date;
  delay_ms: number;
  hourly_limit: number;
  total_recipients: number;
  attachments?: EmailAttachment[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface Email {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  scheduled_at: Date;
  sent_at: Date | null;
  status: EmailStatus;
  attempt_count: number;
  bull_job_id: string | null;
  error_message: string | null;
  ethereal_message_id: string | null;
  ethereal_url: string | null;
  attachments?: EmailAttachment[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailWithCampaign extends Email {
  campaign_delay_ms?: number;
  campaign_hourly_limit?: number;
  campaign_start_time?: Date;
  campaign_attachments?: EmailAttachment[] | null;
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
  start_time: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecipientItem {
  id: string;
  campaign_id: string;
  campaign_subject: string;
  recipient_email: string;
  status: EmailStatus;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleEmailRequest {
  sender_id: string;
  subject: string;
  body: string;
  recipients: string[];
  start_time: string; // ISO date string
  delay_ms: number;
  hourly_limit: number;
  attachments?: EmailAttachment[];
}

export interface SlackConnection {
  id: string;
  user_id: string;
  team_id: string;
  team_name: string;
  access_token: string; // encrypted
  webhook_url: string;  // encrypted
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
