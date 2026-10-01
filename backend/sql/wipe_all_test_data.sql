-- =============================================================================
-- EduSync — 一键清空所有测试数据（保留表结构）
-- =============================================================================
-- ⚠️  危险操作：删除所有业务数据 + 所有登录账号（auth.users）
-- ⚠️  仅用于测试环境！不要在生产库执行！
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
--
-- 不会删除：表结构、索引、RLS 策略、Storage bucket 配置
-- 需要手动清空（可选）：Storage → avatars / materials / submissions 里的文件
-- =============================================================================

BEGIN;

-- 1) 清空 public 业务表（CASCADE 自动处理外键依赖）
TRUNCATE TABLE
  assignment_submissions,
  assignments,
  attendance,
  balance_transactions,
  student_balances,
  reschedule_requests,
  class_materials,
  sessions,
  class_enrollments,
  student_notes,
  notifications,
  email_log,
  class_groups,
  users
RESTART IDENTITY CASCADE;

-- 若你创建了 companies 表，取消下面注释：
-- TRUNCATE TABLE companies RESTART IDENTITY CASCADE;

-- 2) 清空 Supabase Auth 登录账号（Authentication → Users 会全部消失）
DELETE FROM auth.users;

COMMIT;

-- 验证（应全部为 0）：
-- SELECT 'users' AS t, COUNT(*) FROM users
-- UNION ALL SELECT 'class_groups', COUNT(*) FROM class_groups
-- UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users;
