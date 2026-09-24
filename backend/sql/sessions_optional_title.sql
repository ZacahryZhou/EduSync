-- Make session title optional (only class + date + times are required in the app).
-- Run once in Supabase → SQL Editor if create session fails with:
--   null value in column "title" of relation "sessions" violates not-null constraint

ALTER TABLE sessions ALTER COLUMN title DROP NOT NULL;
