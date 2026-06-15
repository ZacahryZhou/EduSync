-- In-app notifications (P0-07) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN (
                  'schedule_changed',
                  'reschedule_requested',
                  'reschedule_resolved',
                  'session_scheduled',
                  'assignment_published'
                )),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  read        BOOLEAN NOT NULL DEFAULT false,
  related_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read)
  WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
