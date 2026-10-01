-- Fix incomplete "sessions" table (missing date, start_time, end_time, etc.)
-- Your table only had: id, class_id, title, description
-- The app needs: date, start_time, end_time, location, type, ...

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT;
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

-- Title is optional in the app (class + date + start/end time are required).
ALTER TABLE sessions ALTER COLUMN title DROP NOT NULL;
