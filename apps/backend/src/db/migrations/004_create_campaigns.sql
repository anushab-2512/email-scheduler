CREATE TABLE IF NOT EXISTS email_campaigns (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  delay_ms INT NOT NULL DEFAULT 2000,
  hourly_limit INT NOT NULL DEFAULT 200,
  total_recipients INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES senders(id) ON DELETE CASCADE,
  INDEX idx_campaigns_user_id (user_id),
  INDEX idx_campaigns_sender_id (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
