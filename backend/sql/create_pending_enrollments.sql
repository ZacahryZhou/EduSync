-- Pending student invites (teacher adds by email before student registers)
-- Run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS pending_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  grade           TEXT,
  teacher_note    TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'cancelled')),
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_enroll_class_email_pending
  ON pending_enrollments (class_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pending_enroll_teacher
  ON pending_enrollments (teacher_id);

CREATE INDEX IF NOT EXISTS idx_pending_enroll_email_pending
  ON pending_enrollments (lower(email))
  WHERE status = 'pending';

-- Welcome notification when a pending invite is claimed on registration
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'schedule_changed',
    'reschedule_requested',
    'reschedule_resolved',
    'session_scheduled',
    'assignment_published',
    'assignment_submitted',
    'assignment_graded',
    'class_enrolled'
  ));
