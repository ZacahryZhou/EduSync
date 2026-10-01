-- Groups ai_interactions rows into conversations so a past chat can be
-- resumed instead of only viewed as a read-only log.
-- Run once in Supabase: SQL Editor -> New query -> paste all -> Run

ALTER TABLE ai_interactions
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

CREATE INDEX IF NOT EXISTS idx_ai_interactions_conversation
  ON ai_interactions(conversation_id);
