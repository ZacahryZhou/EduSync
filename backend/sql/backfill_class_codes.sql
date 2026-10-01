-- Backfill missing class codes for rows created before the `code` column existed.
-- Run in Supabase SQL Editor if teachers see "Not set" on class cards.

UPDATE class_groups
SET code = upper(
  left(regexp_replace(coalesce(name, 'CLS'), '[^A-Za-z0-9]', '', 'g'), 4)
  || '-'
  || substr(md5(id::text || random()::text), 1, 4)
)
WHERE code IS NULL OR trim(code) = '';

-- Verify: every class should now have a non-empty code
SELECT id, name, code FROM class_groups ORDER BY created_at DESC NULLS LAST;
