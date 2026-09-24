-- P1-03 / P1-04 — notification types for submissions and grading

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
