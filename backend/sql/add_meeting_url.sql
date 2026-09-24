-- P1-13: optional video meeting link on sessions (Zoom, Google Meet, etc.)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_url TEXT;
