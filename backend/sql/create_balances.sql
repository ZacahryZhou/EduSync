-- Student balances & transactions (P1-07) — run once in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS student_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id    UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL CHECK (unit IN ('sessions', 'hours')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_student_balances_student ON student_balances(student_id);
CREATE INDEX IF NOT EXISTS idx_student_balances_class ON student_balances(class_id);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('topup', 'deduction')),
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  unit              TEXT NOT NULL CHECK (unit IN ('sessions', 'hours')),
  balance_after     NUMERIC(10,2) NOT NULL,
  comment           TEXT,
  recorded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_student ON balance_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_class ON balance_transactions(class_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_session ON balance_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_created ON balance_transactions(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_tx_session_deduction
  ON balance_transactions(session_id, student_id)
  WHERE type = 'deduction' AND session_id IS NOT NULL;
