-- Student grade field (P1-05) — run once in Supabase → SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS grade TEXT;

CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade) WHERE grade IS NOT NULL;
