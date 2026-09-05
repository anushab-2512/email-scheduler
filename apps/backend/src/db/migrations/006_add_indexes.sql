-- Performance indexes for the emails table
CREATE INDEX idx_emails_user_status ON emails (user_id, status);
CREATE INDEX idx_emails_sender_scheduled ON emails (sender_id, scheduled_at);
CREATE INDEX idx_emails_scheduled_at ON emails (scheduled_at);
CREATE INDEX idx_emails_sent_at ON emails (sent_at);
CREATE INDEX idx_emails_recipient ON emails (recipient_email);
CREATE INDEX idx_emails_bull_job ON emails (bull_job_id);
CREATE INDEX idx_emails_campaign ON emails (campaign_id);
CREATE INDEX idx_emails_status ON emails (status);
CREATE INDEX idx_emails_user_created ON emails (user_id, created_at DESC);
CREATE INDEX idx_campaigns_user_created ON email_campaigns (user_id, created_at DESC);
