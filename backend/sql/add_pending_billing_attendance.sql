-- Extend attendance & billing for invited (not yet registered) students.
-- Run once in Supabase → SQL Editor after create_pending_enrollments.sql
-- and create_balances.sql / create_attendance.sql.

-- attendance: exactly one of student_id or pending_enrollment_id
ALTER TABLE attendance
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID
    REFERENCES pending_enrollments(id) ON DELETE CASCADE;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_session_id_student_id_key;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_subject_check;

ALTER TABLE attendance ADD CONSTRAINT attendance_subject_check CHECK (
  (student_id IS NOT NULL AND pending_enrollment_id IS NULL)
  OR (student_id IS NULL AND pending_enrollment_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_student
  ON attendance (session_id, student_id)
  WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_pending
  ON attendance (session_id, pending_enrollment_id)
  WHERE pending_enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_pending
  ON attendance (pending_enrollment_id)
  WHERE pending_enrollment_id IS NOT NULL;

-- student_balances
ALTER TABLE student_balances
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE student_balances
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID
    REFERENCES pending_enrollments(id) ON DELETE CASCADE;

ALTER TABLE student_balances DROP CONSTRAINT IF EXISTS student_balances_student_id_class_id_key;
ALTER TABLE student_balances DROP CONSTRAINT IF EXISTS student_balances_subject_check;

ALTER TABLE student_balances ADD CONSTRAINT student_balances_subject_check CHECK (
  (student_id IS NOT NULL AND pending_enrollment_id IS NULL)
  OR (student_id IS NULL AND pending_enrollment_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_balances_class_student
  ON student_balances (class_id, student_id)
  WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_balances_class_pending
  ON student_balances (class_id, pending_enrollment_id)
  WHERE pending_enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_balances_pending
  ON student_balances (pending_enrollment_id)
  WHERE pending_enrollment_id IS NOT NULL;

-- balance_transactions
ALTER TABLE balance_transactions
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE balance_transactions
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID
    REFERENCES pending_enrollments(id) ON DELETE CASCADE;

ALTER TABLE balance_transactions DROP CONSTRAINT IF EXISTS balance_transactions_subject_check;

ALTER TABLE balance_transactions ADD CONSTRAINT balance_transactions_subject_check CHECK (
  (student_id IS NOT NULL AND pending_enrollment_id IS NULL)
  OR (student_id IS NULL AND pending_enrollment_id IS NOT NULL)
);

DROP INDEX IF EXISTS idx_balance_tx_session_deduction;

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_tx_session_deduction_student
  ON balance_transactions (session_id, student_id)
  WHERE type = 'deduction' AND session_id IS NOT NULL AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_tx_session_deduction_pending
  ON balance_transactions (session_id, pending_enrollment_id)
  WHERE type = 'deduction' AND session_id IS NOT NULL AND pending_enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_balance_tx_pending
  ON balance_transactions (pending_enrollment_id)
  WHERE pending_enrollment_id IS NOT NULL;
