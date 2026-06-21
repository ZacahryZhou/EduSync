-- EduSync — Track class material file size for storage usage hints.
-- Run once in Supabase → SQL Editor.

ALTER TABLE class_materials ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_class_materials_uploaded_by
  ON class_materials(uploaded_by);
