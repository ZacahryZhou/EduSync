-- =============================================================================
-- EduSync — Supabase 测试用一键迁移（可重复执行 / idempotent）
-- 用法：Supabase Dashboard → SQL Editor → New query → 粘贴全文 → Run
-- =============================================================================

-- 1) MVP 基础表（班级 / 选课 / 课次）
CREATE TABLE IF NOT EXISTS class_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id);
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS billing_mode TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON class_groups(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_code_unique ON class_groups(code);
CREATE INDEX IF NOT EXISTS idx_classes_code ON class_groups(code);

CREATE TABLE IF NOT EXISTS class_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enroll_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enroll_student ON class_enrollments(student_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);

-- 2) 改课申请
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_date     DATE NOT NULL,
  proposed_start    TIME NOT NULL,
  proposed_end      TIME NOT NULL,
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  teacher_response  TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reschedule_session ON reschedule_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_student ON reschedule_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_status ON reschedule_requests(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_one_pending
  ON reschedule_requests(session_id, student_id)
  WHERE status = 'pending';

-- 3) 学生私有备注
CREATE TABLE IF NOT EXISTS student_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_notes_teacher ON student_notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id);

-- 4) 站内通知
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  read        BOOLEAN NOT NULL DEFAULT false,
  related_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read)
  WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 更新通知类型（含新建排课 + 作业发布）
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'schedule_changed',
    'reschedule_requested',
    'reschedule_resolved',
    'session_scheduled',
    'assignment_published',
    'assignment_submitted',
    'assignment_graded'
  ));

-- 5) 邮件开关 + 发送记录
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;

ALTER TABLE users ADD COLUMN IF NOT EXISTS grade TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade) WHERE grade IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type    TEXT NOT NULL,
  reference_id  TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, email_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);

-- 6) 作业（P1-01 / P1-02）
CREATE TABLE IF NOT EXISTS assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  due_date       TIMESTAMPTZ,
  attachment_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL DEFAULT '',
  file_url      TEXT,
  grade         TEXT,
  feedback      TEXT,
  submitted_at  TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);

-- 8) Storage bucket for assignment uploads (P1-03)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submissions',
  'submissions',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 9) 出勤记录（P1-06）
CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'present'
                CHECK (status IN ('present', 'absent', 'late')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

-- 10) 学费 / 课时包（P1-07）
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
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('topup', 'deduction')),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  unit            TEXT NOT NULL CHECK (unit IN ('sessions', 'hours')),
  balance_after   NUMERIC(10,2) NOT NULL,
  comment         TEXT,
  recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_student ON balance_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_class ON balance_transactions(class_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_session ON balance_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_created ON balance_transactions(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_tx_session_deduction
  ON balance_transactions(session_id, student_id)
  WHERE type = 'deduction' AND session_id IS NOT NULL;

-- 11) 班级资料库（P1-09）
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 13) 用户头像 Storage（P1-11）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 验证（应看到 13 行表名）
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'class_groups',
    'class_enrollments',
    'sessions',
    'reschedule_requests',
    'student_notes',
    'notifications',
    'email_log',
    'assignments',
    'assignment_submissions',
    'attendance',
    'student_balances',
    'balance_transactions',
    'class_materials'
  )
ORDER BY table_name;
