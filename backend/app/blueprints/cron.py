"""Scheduled jobs (protected by CRON_SECRET)."""

from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from app.config import Config
from app.extensions import supabase
from app.services.email import email_session_reminder
from app.services.notifications import _class_student_ids, _class_teacher_id

cron_bp = Blueprint('cron', __name__)


def _authorized_cron():
    secret = Config.CRON_SECRET
    if not secret:
        return False
    provided = (
        request.headers.get('X-Cron-Secret')
        or request.args.get('secret')
        or ''
    )
    return provided == secret


def _class_map(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name'
    ).in_('id', list(class_ids)).execute()
    return {row['id']: row for row in (result.data or [])}


@cron_bp.route('/api/cron/session-reminders', methods=['POST'])
def session_reminders():
    """Send email reminders for sessions happening tomorrow (run daily via Railway cron)."""
    if not _authorized_cron():
        return jsonify({'error': 'Unauthorized'}), 401

    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    try:
        result = supabase.table('sessions').select('*').eq(
            'date', tomorrow
        ).execute()
    except Exception:
        return jsonify({'error': 'Failed to load sessions'}), 500

    rows = result.data or []
    class_ids = list({row['class_id'] for row in rows if row.get('class_id')})
    classes_by_id = _class_map(class_ids)

    sent = 0
    skipped = 0

    for session_row in rows:
        class_id = session_row.get('class_id')
        class_name = (classes_by_id.get(class_id) or {}).get('name') or 'your class'
        recipient_ids = list(_class_student_ids(class_id))
        teacher_id = _class_teacher_id(class_id)
        if teacher_id:
            recipient_ids.append(teacher_id)

        for user_id in {uid for uid in recipient_ids if uid}:
            if email_session_reminder(user_id, session_row, class_name):
                sent += 1
            else:
                skipped += 1

    return jsonify({
        'date': tomorrow,
        'sessions': len(rows),
        'emails_sent': sent,
        'skipped': skipped,
    }), 200
