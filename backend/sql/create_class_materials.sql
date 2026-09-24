-- Class materials library (P1-09) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS class_materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL DEFAULT '',
  uploaded_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_materials_class ON class_materials(class_id);
CREATE INDEX IF NOT EXISTS idx_class_materials_created ON class_materials(created_at DESC);
