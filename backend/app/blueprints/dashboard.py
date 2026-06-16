from datetime import datetime, timezone

from flask import Blueprint, g, jsonify

from app.extensions import supabase
from app.middleware.auth import require_auth, _load_user_record

dashboard_bp = Blueprint('dashboard', __name__)


def _friendly_db_error(exc):
    message = str(exc)
    return message or 'Database error'


def _accessible_class_ids(user):
    role = (user.get('role') or '').strip().lower()
    if role == 'teacher':
        result = supabase.table('class_groups').select('id').eq(
            'teacher_id', user['id']
        ).execute()
        return [row['id'] for row in result.data or []]
    if role == 'student':
        result = supabase.table('class_enrollments').select('class_id').eq(
            'student_id', user['id']
        ).execute()
        return [row['class_id'] for row in result.data or []]
    return []


def _class_map(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name, color'
    ).in_('id', class_ids).execute()
    return {row['id']: row for row in result.data or []}


def _assignment_past_due(assignment_row):
    due = assignment_row.get('due_date')
    if not due:
        return False
    try:
        text = str(due).replace('Z', '+00:00')
        due_dt = datetime.fromisoformat(text)
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=timezone.utc)
        return due_dt < datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


def _serialize_notification(row):
    return {
        'id': row['id'],
        'type': row.get('type') or '',
        'title': row.get('title') or '',
        'body': row.get('body') or '',
        'read': bool(row.get('read')),
        'related_id': row.get('related_id'),
        'created_at': row.get('created_at'),
    }


def _unread_notification_count(user_id):
    result = supabase.table('notifications').select(
        'id', count='exact'
    ).eq('user_id', user_id).eq('read', False).execute()
    return result.count or 0


def _recent_notifications(user_id, limit=5):
    result = supabase.table('notifications').select('*').eq(
        'user_id', user_id
    ).order('created_at', desc=True).limit(limit).execute()
    return [_serialize_notification(row) for row in result.data or []]


def _pending_reschedule_count(teacher_id, class_ids):
    if not class_ids:
        return 0
    sessions_result = supabase.table('sessions').select('id').in_(
        'class_id', class_ids
    ).execute()
    session_ids = [row['id'] for row in sessions_result.data or []]
    if not session_ids:
        return 0
    result = supabase.table('reschedule_requests').select(
        'id', count='exact'
    ).in_('session_id', session_ids).eq('status', 'pending').execute()
    return result.count or 0


def _teacher_pending_grades(class_ids, limit=8):
    if not class_ids:
        return 0, []

    try:
        assignments_result = supabase.table('assignments').select(
            'id, class_id, title'
        ).in_('class_id', class_ids).execute()
    except Exception:
        return 0, []

    assignment_rows = assignments_result.data or []
    if not assignment_rows:
        return 0, []

    assignment_by_id = {row['id']: row for row in assignment_rows}
    assignment_ids = list(assignment_by_id.keys())
    classes_by_id = _class_map(class_ids)

    try:
        submissions_result = supabase.table('assignment_submissions').select(
            'id, assignment_id, student_id, submitted_at, grade'
        ).in_('assignment_id', assignment_ids).execute()
    except Exception:
        return 0, []

    pending_rows = [
        row for row in submissions_result.data or []
        if row.get('submitted_at') and not (row.get('grade') or '').strip()
    ]
    pending_rows.sort(
        key=lambda row: row.get('submitted_at') or '',
        reverse=True,
    )

    student_ids = list({row['student_id'] for row in pending_rows})
    users_by_id = {}
    if student_ids:
        users_result = supabase.table('users').select(
            'id, name, email'
        ).in_('id', student_ids).execute()
        users_by_id = {row['id']: row for row in users_result.data or []}

    items = []
    for row in pending_rows[:limit]:
        assignment = assignment_by_id.get(row['assignment_id'], {})
        class_info = classes_by_id.get(assignment.get('class_id'), {})
        student = users_by_id.get(row['student_id'], {})
        items.append({
            'submission_id': row['id'],
            'assignment_id': row['assignment_id'],
            'assignment_title': assignment.get('title') or '',
            'class_name': class_info.get('name', ''),
            'student_name': student.get('name') or student.get('email') or 'Student',
            'submitted_at': row.get('submitted_at'),
        })

    return len(pending_rows), items


def _student_open_assignments(class_ids, student_id, limit=8):
    if not class_ids:
        return 0, []

    try:
        assignments_result = supabase.table('assignments').select(
            'id, class_id, title, due_date'
        ).in_('class_id', class_ids).order(
            'due_date', desc=False
        ).order('created_at', desc=True).execute()
    except Exception:
        return 0, []

    assignment_rows = assignments_result.data or []
    if not assignment_rows:
        return 0, []

    assignment_ids = [row['id'] for row in assignment_rows]
    classes_by_id = _class_map(class_ids)

    try:
        submissions_result = supabase.table('assignment_submissions').select(
            'assignment_id, submitted_at'
        ).eq('student_id', student_id).in_(
            'assignment_id', assignment_ids
        ).execute()
    except Exception:
        submissions_result = type('R', (), {'data': []})()

    submitted_by_assignment = {
        row['assignment_id']: row.get('submitted_at')
        for row in submissions_result.data or []
    }

    open_rows = [
        row for row in assignment_rows
        if not submitted_by_assignment.get(row['id'])
    ]

    items = []
    for row in open_rows[:limit]:
        class_info = classes_by_id.get(row['class_id'], {})
        items.append({
            'assignment_id': row['id'],
            'title': row.get('title') or '',
            'class_name': class_info.get('name', ''),
            'due_date': row.get('due_date'),
            'past_due': _assignment_past_due(row),
        })

    return len(open_rows), items


@dashboard_bp.route('/api/dashboard/summary', methods=['GET'])
@require_auth
def dashboard_summary():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    user_id = user['id']
    role = (user.get('role') or '').strip().lower()
    class_ids = _accessible_class_ids(user)

    try:
        unread_notifications = _unread_notification_count(user_id)
        recent_notifications = _recent_notifications(user_id, limit=5)
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    payload = {
        'role': role,
        'unread_notifications': unread_notifications,
        'recent_notifications': recent_notifications,
        'pending_grades': 0,
        'pending_reschedules': 0,
        'open_assignments': 0,
        'pending_grade_items': [],
        'open_assignment_items': [],
    }

    try:
        if role == 'teacher':
            pending_count, pending_items = _teacher_pending_grades(class_ids)
            payload['pending_grades'] = pending_count
            payload['pending_grade_items'] = pending_items
            payload['pending_reschedules'] = _pending_reschedule_count(
                user_id, class_ids
            )
        elif role == 'student':
            open_count, open_items = _student_open_assignments(
                class_ids, user_id
            )
            payload['open_assignments'] = open_count
            payload['open_assignment_items'] = open_items
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    return jsonify(payload), 200
