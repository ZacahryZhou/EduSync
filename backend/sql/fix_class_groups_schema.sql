-- Run this if you got: column "code" does not exist
-- Cause: class_groups table already existed with an incomplete/old schema.
-- CREATE TABLE IF NOT EXISTS skipped recreation; CREATE INDEX on code failed.

-- Step A: Create shell table if missing (MVP does not use companies)
CREATE TABLE IF NOT EXISTS class_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Step B: Add every column the app expects (safe if already present)
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id);
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS billing_mode TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step C: Indexes (only after columns exist)
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON class_groups(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_code_unique ON class_groups(code);
CREATE INDEX IF NOT EXISTS idx_classes_code ON class_groups(code);

-- Step D: Other MVP tables (if not created yet)
CREATE TABLE IF NOT EXISTS class_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enroll_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enroll_student ON class_enrollments(student_id);

-- Step E: sessions (ALTER if table already exists with old schema)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
