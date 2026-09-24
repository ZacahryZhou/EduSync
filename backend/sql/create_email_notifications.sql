-- Email notifications (P0-10): user opt-in + send log for deduplication
-- Run once in Supabase → SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type    TEXT NOT NULL,
  reference_id  TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, email_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);
