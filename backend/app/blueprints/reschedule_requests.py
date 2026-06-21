from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.blueprints.sessions import (
    _get_session_row,
    _normalize_time_for_db,
    _teacher_owns_class,
    _validate_date,
    _validate_time,
    _validate_time_range,
)
from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.notifications import (
    notify_reschedule_requested,
    notify_reschedule_resolved,
)

reschedule_bp = Blueprint('reschedule', __name__)


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'reschedule_requests' in lower:
            return (
                'Database table "reschedule_requests" is missing. '
                'Run backend/sql/create_reschedule_requests.sql in Supabase SQL Editor.'
            )
    if 'idx_reschedule_one_pending' in lower or 'duplicate' in lower:
        return 'You already have a pending reschedule request for this session'
    return message or 'Database error'


def _student_enrolled_in_class(student_id, class_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'student_id', student_id
    ).eq('class_id', class_id).limit(1).execute()
    return bool(result.data)


def _teacher_class_ids(teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'teacher_id', teacher_id
    ).execute()
    return [row['id'] for row in (result.data or [])]


def _class_map(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name, teacher_id'
    ).in_('id', class_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _user_map(user_ids):
    if not user_ids:
        return {}
    result = supabase.table('users').select(
        'id, email, display_name'
    ).in_('id', user_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _session_map(session_ids):
    if not session_ids:
        return {}
    result = supabase.table('sessions').select(
        'id, title, date, start_time, end_time, class_id'
    ).in_('id', session_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _display_name(user):
    if not user:
        return ''
    name = (user.get('display_name') or '').strip()
    if name:
        return name
    email = user.get('email') or ''
    return email.split('@')[0] if email else 'Student'


def _serialize_request(row, sessions_by_id, classes_by_id, users_by_id):
    session = sessions_by_id.get(row['session_id'], {})
    class_info = classes_by_id.get(session.get('class_id'), {})
    student = users_by_id.get(row['student_id'], {})
    return {
        'id': row['id'],
        'session_id': row['session_id'],
        'student_id': row['student_id'],
        'proposed_date': row['proposed_date'],
        'proposed_start': row['proposed_start'],
        'proposed_end': row['proposed_end'],
        'reason': row.get('reason') or '',
        'status': row.get('status') or 'pending',
        'teacher_response': row.get('teacher_response') or '',
        'created_at': row.get('created_at'),
        'resolved_at': row.get('resolved_at'),
        'session_title': session.get('title') or '',
        'session_date': session.get('date') or '',
        'session_start': session.get('start_time') or '',
        'session_end': session.get('end_time') or '',
        'class_id': session.get('class_id') or '',
        'class_name': class_info.get('name') or '',
        'student_name': _display_name(student),
        'student_email': student.get('email') or '',
    }


def _enrich_requests(rows):
    session_ids = list({row['session_id'] for row in rows})
    student_ids = list({row['student_id'] for row in rows})
    sessions_by_id = _session_map(session_ids)
    class_ids = list({
        sessions_by_id[sid]['class_id']
        for sid in session_ids
        if sessions_by_id.get(sid, {}).get('class_id')
    })
    classes_by_id = _class_map(class_ids)
    users_by_id = _user_map(student_ids)
    return [
        _serialize_request(row, sessions_by_id, classes_by_id, users_by_id)
        for row in rows
    ]


def _get_request_row(request_id):
    result = supabase.table('reschedule_requests').select('*').eq(
        'id', request_id
    ).execute()
    if not result.data:
        return None
    return result.data[0]


@reschedule_bp.route('/api/reschedule-requests', methods=['GET'])
@require_auth
def list_reschedule_requests():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    status_filter = (request.args.get('status') or '').strip().lower()

    try:
        if role == 'teacher':
            class_ids = _teacher_class_ids(g.current_user.id)
            if not class_ids:
                return jsonify({'requests': []}), 200

            sessions_result = supabase.table('sessions').select('id').in_(
                'class_id', class_ids
            ).execute()
            session_ids = [row['id'] for row in (sessions_result.data or [])]
            if not session_ids:
                return jsonify({'requests': []}), 200

            query = supabase.table('reschedule_requests').select('*').in_(
                'session_id', session_ids
            )
            if status_filter in ('pending', 'approved', 'rejected'):
                query = query.eq('status', status_filter)
            result = query.order('created_at', desc=True).execute()

        elif role == 'student':
            query = supabase.table('reschedule_requests').select('*').eq(
                'student_id', user['id']
            )
            if status_filter in ('pending', 'approved', 'rejected'):
                query = query.eq('status', status_filter)
            result = query.order('created_at', desc=True).execute()
        else:
            return jsonify({'error': 'Forbidden'}), 403
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    rows = result.data or []
    return jsonify({'requests': _enrich_requests(rows)}), 200


@reschedule_bp.route('/api/reschedule-requests', methods=['POST'])
@require_role('student')
def create_reschedule_request():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    session_id = data.get('session_id')
    proposed_date = (data.get('proposed_date') or '').strip()
    proposed_start = (data.get('proposed_start') or '').strip()
    proposed_end = (data.get('proposed_end') or '').strip()
    reason = (data.get('reason') or '').strip()

    if not session_id or not proposed_date or not proposed_start or not proposed_end:
        return jsonify({
            'error': 'session_id, proposed_date, proposed_start, and proposed_end are required',
        }), 400

    if not reason:
        return jsonify({'error': 'reason is required'}), 400

    if not _validate_date(proposed_date):
        return jsonify({'error': 'proposed_date must be YYYY-MM-DD'}), 400

    for time_value, label in (
        (proposed_start, 'proposed_start'),
        (proposed_end, 'proposed_end'),
    ):
        err = _validate_time(time_value, label)
        if err:
            return jsonify({'error': err}), 400

    range_err = _validate_time_range(proposed_start, proposed_end)
    if range_err:
        return jsonify({'error': range_err}), 400

    session = _get_session_row(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    student_id = g.current_user.id
    if not _student_enrolled_in_class(student_id, session['class_id']):
        return jsonify({'error': 'You are not enrolled in this class'}), 403

    existing = supabase.table('reschedule_requests').select('id').eq(
        'session_id', session_id
    ).eq('student_id', student_id).eq('status', 'pending').execute()
    if existing.data:
        return jsonify({
            'error': 'You already have a pending reschedule request for this session',
        }), 409

    payload = {
        'session_id': session_id,
        'student_id': student_id,
        'proposed_date': proposed_date,
        'proposed_start': _normalize_time_for_db(proposed_start),
        'proposed_end': _normalize_time_for_db(proposed_end),
        'reason': reason,
        'status': 'pending',
    }

    try:
        result = supabase.table('reschedule_requests').insert(payload).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to create request'}), 500

    enriched = _enrich_requests([result.data[0]])
    created = enriched[0]
    class_info = _class_map([session['class_id']]).get(session['class_id'], {})
    notify_reschedule_requested(
        result.data[0],
        session,
        created.get('student_name') or _display_name(_load_user_record()),
        class_info.get('name') or '',
    )
    return jsonify({'request': created}), 201


@reschedule_bp.route('/api/reschedule-requests/<request_id>/approve', methods=['PATCH'])
@require_role('teacher')
def approve_reschedule_request(request_id):
    row = _get_request_row(request_id)
    if not row:
        return jsonify({'error': 'Request not found'}), 404

    if row.get('status') != 'pending':
        return jsonify({'error': 'Request is no longer pending'}), 409

    session = _get_session_row(row['session_id'])
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if not _teacher_owns_class(session['class_id'], g.current_user.id):
        return jsonify({'error': 'Request not found'}), 404

    data = request.get_json() or {}
    teacher_response = (data.get('teacher_response') or '').strip() or None
    now_iso = datetime.now(timezone.utc).isoformat()

    session_updates = {
        'date': row['proposed_date'],
        'start_time': row['proposed_start'],
        'end_time': row['proposed_end'],
    }

    try:
        supabase.table('sessions').update(session_updates).eq(
            'id', row['session_id']
        ).execute()

        result = supabase.table('reschedule_requests').update({
            'status': 'approved',
            'teacher_response': teacher_response,
            'resolved_at': now_iso,
        }).eq('id', request_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to approve request'}), 500

    enriched = _enrich_requests([result.data[0]])
    notify_reschedule_resolved(
        result.data[0],
        session,
        approved=True,
        teacher_response=teacher_response,
    )
    return jsonify({'request': enriched[0]}), 200


@reschedule_bp.route('/api/reschedule-requests/<request_id>/reject', methods=['PATCH'])
@require_role('teacher')
def reject_reschedule_request(request_id):
    row = _get_request_row(request_id)
    if not row:
        return jsonify({'error': 'Request not found'}), 404

    if row.get('status') != 'pending':
        return jsonify({'error': 'Request is no longer pending'}), 409

    session = _get_session_row(row['session_id'])
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if not _teacher_owns_class(session['class_id'], g.current_user.id):
        return jsonify({'error': 'Request not found'}), 404

    data = request.get_json() or {}
    teacher_response = (data.get('teacher_response') or '').strip() or None
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        result = supabase.table('reschedule_requests').update({
            'status': 'rejected',
            'teacher_response': teacher_response,
            'resolved_at': now_iso,
        }).eq('id', request_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to reject request'}), 500

    enriched = _enrich_requests([result.data[0]])
    notify_reschedule_resolved(
        result.data[0],
        session,
        approved=False,
        teacher_response=teacher_response,
    )
    return jsonify({'request': enriched[0]}), 200
