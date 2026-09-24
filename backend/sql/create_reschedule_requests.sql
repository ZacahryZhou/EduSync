-- Reschedule requests (P0-04) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS reschedule_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_date     DATE NOT NULL,
  proposed_start    TIME NOT NULL,
  proposed_end      TIME NOT NULL,
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  teacher_response  TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reschedule_session ON reschedule_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_student ON reschedule_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_status ON reschedule_requests(status);

-- At most one pending request per student per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_one_pending
  ON reschedule_requests(session_id, student_id)
  WHERE status = 'pending';
