-- Add assignment_published to notifications.type (P1-02)
-- Run after create_notifications.sql

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'schedule_changed',
    'reschedule_requested',
    'reschedule_resolved',
    'session_scheduled',
    'assignment_published'
  ));
