-- Private teacher notes per student (P0-03)
-- Run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS student_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_notes_teacher ON student_notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id);
