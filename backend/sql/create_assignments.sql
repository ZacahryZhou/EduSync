-- Assignments (P1-01) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  due_date       TIMESTAMPTZ,
  attachment_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL DEFAULT '',
  file_url      TEXT,
  grade         TEXT,
  feedback      TEXT,
  submitted_at  TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);
