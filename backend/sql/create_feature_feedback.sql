-- Feature preview votes (teacher feedback) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS feature_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id  TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote        TEXT NOT NULL CHECK (vote IN ('support', 'oppose')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feature_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_feedback_feature
  ON feature_feedback(feature_id);
