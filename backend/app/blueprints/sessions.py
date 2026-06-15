import calendar as cal
import uuid
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role
from app.services.notifications import (
    notify_recurring_series_cancelled,
    notify_session_cancelled,
    notify_session_schedule_changed,
)

sessions_bp = Blueprint('sessions', __name__)

MAX_RECURRING_SESSIONS = 52


def _get_user_record(user_id):
    result = supabase.table('users').select('*').eq('id', user_id).execute()
    if not result.data:
        return None
    return result.data[0]


def _accessible_class_ids(user):
    role = user['role']
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
    return None


def _class_map(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name, color'
    ).in_('id', class_ids).execute()
    return {row['id']: row for row in result.data or []}


def _serialize_session(row, classes_by_id):
    class_info = classes_by_id.get(row['class_id'], {})
    return {
        'id': row['id'],
        'class_id': row['class_id'],
        'class_name': class_info.get('name', ''),
        'color': class_info.get('color', '#6366f1'),
        'title': row['title'],
        'date': row['date'],
        'start_time': row['start_time'],
        'end_time': row['end_time'],
        'location': row.get('location') or '',
        'type': row['type'],
        'recurrence_rule': row.get('recurrence_rule') or '',
        'recurrence_group_id': row.get('recurrence_group_id'),
        'notes': row.get('notes') or '',
        'created_at': row.get('created_at'),
    }


def _parse_month(month_str):
    try:
        parsed = datetime.strptime(month_str, '%Y-%m')
        last_day = cal.monthrange(parsed.year, parsed.month)[1]
        start = parsed.strftime('%Y-%m-01')
        end = parsed.strftime(f'%Y-%m-{last_day:02d}')
        return start, end
    except ValueError:
        return None, None


def _teacher_owns_class(class_id, teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'id', class_id
    ).eq('teacher_id', teacher_id).execute()
    return bool(result.data)


def _get_session_row(session_id):
    try:
        result = supabase.table('sessions').select('*').eq(
            'id', session_id
        ).execute()
    except Exception:
        return None
    if not result.data:
        return None
    return result.data[0]


def _validate_date(date_str):
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except (TypeError, ValueError):
        return False


def _validate_time(time_value, label):
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            datetime.strptime(time_value, fmt)
            return None
        except (TypeError, ValueError):
            continue
    return f'{label} must be HH:MM or HH:MM:SS'


def _normalize_time_for_db(time_value):
    """Store as HH:MM:SS when input is HH:MM."""
    if not time_value:
        return time_value
    try:
        datetime.strptime(time_value, '%H:%M:%S')
        return time_value
    except ValueError:
        pass
    try:
        parsed = datetime.strptime(time_value, '%H:%M')
        return parsed.strftime('%H:%M:%S')
    except ValueError:
        return time_value


def _time_to_minutes(time_value):
    normalized = _normalize_time_for_db(time_value)
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            parsed = datetime.strptime(normalized, fmt)
            return parsed.hour * 60 + parsed.minute
        except (TypeError, ValueError):
            continue
    return None


def _validate_time_range(start_time, end_time):
    start_minutes = _time_to_minutes(start_time)
    end_minutes = _time_to_minutes(end_time)
    if start_minutes is None or end_minutes is None:
        return 'start_time and end_time must be valid times'
    if end_minutes <= start_minutes:
        return 'end_time must be after start_time'
    return None


def _weekly_session_dates(start_date_str, end_date_str):
    start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
    if end < start:
        return None, 'recurrence_end_date must be on or after the first session date'

    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime('%Y-%m-%d'))
        if len(dates) > MAX_RECURRING_SESSIONS:
            return None, (
                f'Recurring series cannot exceed {MAX_RECURRING_SESSIONS} sessions'
            )
        current += timedelta(days=7)

    return dates, None


@sessions_bp.route('/api/sessions', methods=['GET'])
@require_auth
def list_sessions():
    user = _get_user_record(g.current_user.id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    class_ids = _accessible_class_ids(user)
    if class_ids is None:
        return jsonify({'error': 'Forbidden'}), 403
    if not class_ids:
        return jsonify({'sessions': []}), 200

    month = request.args.get('month', '').strip()
    class_id = request.args.get('class_id', '').strip()

    try:
        query = supabase.table('sessions').select('*').in_('class_id', class_ids)

        if class_id:
            if class_id not in class_ids:
                return jsonify({'error': 'Forbidden'}), 403
            query = query.eq('class_id', class_id)

        if month:
            start, end = _parse_month(month)
            if not start:
                return jsonify({'error': 'month must be YYYY-MM'}), 400
            query = query.gte('date', start).lte('date', end)

        result = query.order('date').order('start_time').execute()
    except Exception:
        return jsonify({'error': 'Failed to load sessions'}), 500

    rows = result.data or []
    classes_by_id = _class_map(class_ids)

    return jsonify({
        'sessions': [
            _serialize_session(row, classes_by_id)
            for row in rows
        ]
    }), 200


@sessions_bp.route('/api/sessions', methods=['POST'])
@require_role('teacher')
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    class_id = data.get('class_id')
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    start_time = (data.get('start_time') or '').strip()
    end_time = (data.get('end_time') or '').strip()
    location = (data.get('location') or '').strip()
    session_type = (data.get('type') or 'one-time').strip().lower()
    recurrence_rule = (data.get('recurrence_rule') or '').strip().lower()
    recurrence_end_date = (data.get('recurrence_end_date') or '').strip()

    if not class_id or not title or not date or not start_time or not end_time:
        return jsonify({
            'error': 'class_id, title, date, start_time, and end_time are required'
        }), 400

    try:
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'date must be YYYY-MM-DD'}), 400

    for time_value, label in ((start_time, 'start_time'), (end_time, 'end_time')):
        err = _validate_time(time_value, label)
        if err:
            return jsonify({'error': err}), 400

    range_err = _validate_time_range(start_time, end_time)
    if range_err:
        return jsonify({'error': range_err}), 400

    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    normalized_start = _normalize_time_for_db(start_time)
    normalized_end = _normalize_time_for_db(end_time)

    is_recurring = session_type == 'recurring' and recurrence_rule == 'weekly'

    if session_type == 'recurring' and recurrence_rule != 'weekly':
        return jsonify({'error': 'Only weekly recurrence is supported'}), 400

    if is_recurring:
        if not recurrence_end_date:
            return jsonify({'error': 'recurrence_end_date is required for weekly sessions'}), 400
        if not _validate_date(recurrence_end_date):
            return jsonify({'error': 'recurrence_end_date must be YYYY-MM-DD'}), 400

        dates, dates_err = _weekly_session_dates(date, recurrence_end_date)
        if dates_err:
            return jsonify({'error': dates_err}), 400

        group_id = str(uuid.uuid4())
        payloads = [
            {
                'class_id': class_id,
                'title': title,
                'date': session_date,
                'start_time': normalized_start,
                'end_time': normalized_end,
                'location': location or None,
                'type': 'recurring',
                'recurrence_rule': 'weekly',
                'recurrence_group_id': group_id,
            }
            for session_date in dates
        ]

        try:
            result = supabase.table('sessions').insert(payloads).execute()
        except Exception:
            return jsonify({'error': 'Failed to create recurring sessions'}), 500

        if not result.data:
            return jsonify({'error': 'Failed to create recurring sessions'}), 500

        classes_by_id = _class_map([class_id])
        serialized = [
            _serialize_session(row, classes_by_id)
            for row in result.data
        ]
        return jsonify({
            'session': serialized[0],
            'sessions': serialized,
            'count': len(serialized),
        }), 201

    if session_type not in ('one-time', 'recurring'):
        return jsonify({'error': 'type must be one-time or recurring'}), 400

    payload = {
        'class_id': class_id,
        'title': title,
        'date': date,
        'start_time': normalized_start,
        'end_time': normalized_end,
        'location': location or None,
        'type': 'one-time',
    }

    try:
        result = supabase.table('sessions').insert(payload).execute()
    except Exception:
        return jsonify({'error': 'Failed to create session'}), 500

    if not result.data:
        return jsonify({'error': 'Failed to create session'}), 500

    classes_by_id = _class_map([class_id])
    return jsonify({
        'session': _serialize_session(result.data[0], classes_by_id),
        'count': 1,
    }), 201


@sessions_bp.route('/api/sessions/<session_id>', methods=['PATCH'])
@require_role('teacher')
def update_session(session_id):
    row = _get_session_row(session_id)
    if not row:
        return jsonify({'error': 'Session not found'}), 404

    if not _teacher_owns_class(row['class_id'], g.current_user.id):
        return jsonify({'error': 'Session not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    updates = {}

    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'title cannot be empty'}), 400
        updates['title'] = title

    if 'date' in data:
        date = (data.get('date') or '').strip()
        if not _validate_date(date):
            return jsonify({'error': 'date must be YYYY-MM-DD'}), 400
        updates['date'] = date

    if 'start_time' in data:
        start_time = (data.get('start_time') or '').strip()
        err = _validate_time(start_time, 'start_time')
        if err:
            return jsonify({'error': err}), 400
        updates['start_time'] = _normalize_time_for_db(start_time)

    if 'end_time' in data:
        end_time = (data.get('end_time') or '').strip()
        err = _validate_time(end_time, 'end_time')
        if err:
            return jsonify({'error': err}), 400
        updates['end_time'] = _normalize_time_for_db(end_time)

    if 'location' in data:
        location = (data.get('location') or '').strip()
        updates['location'] = location or None

    if 'notes' in data:
        updates['notes'] = (data.get('notes') or '').strip() or None

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    next_start = updates.get('start_time', row.get('start_time'))
    next_end = updates.get('end_time', row.get('end_time'))
    range_err = _validate_time_range(next_start, next_end)
    if range_err:
        return jsonify({'error': range_err}), 400

    try:
        result = supabase.table('sessions').update(updates).eq(
            'id', session_id
        ).execute()
    except Exception:
        return jsonify({'error': 'Failed to update session'}), 500

    if not result.data:
        return jsonify({'error': 'Session not found'}), 404

    updated_row = result.data[0]
    classes_by_id = _class_map([row['class_id']])
    schedule_fields = {'title', 'date', 'start_time', 'end_time', 'location'}
    if updates.keys() & schedule_fields:
        notify_session_schedule_changed(updated_row, classes_by_id)

    return jsonify({
        'session': _serialize_session(updated_row, classes_by_id),
    }), 200


@sessions_bp.route('/api/sessions/<session_id>', methods=['DELETE'])
@require_role('teacher')
def delete_session(session_id):
    row = _get_session_row(session_id)
    if not row:
        return jsonify({'error': 'Session not found'}), 404

    if not _teacher_owns_class(row['class_id'], g.current_user.id):
        return jsonify({'error': 'Session not found'}), 404

    scope = (request.args.get('scope') or 'this').strip().lower()
    classes_by_id = _class_map([row['class_id']])
    group_id = row.get('recurrence_group_id')

    try:
        if scope == 'series' and group_id:
            siblings = supabase.table('sessions').select('id').eq(
                'recurrence_group_id', group_id
            ).eq('class_id', row['class_id']).execute()
            deleted_count = len(siblings.data or [])
            supabase.table('sessions').delete().eq(
                'recurrence_group_id', group_id
            ).eq('class_id', row['class_id']).execute()
            notify_recurring_series_cancelled(row, deleted_count, classes_by_id)
            return jsonify({
                'message': 'Recurring series deleted',
                'deleted_count': deleted_count,
            }), 200

        supabase.table('sessions').delete().eq('id', session_id).execute()
    except Exception:
        return jsonify({'error': 'Failed to delete session'}), 500

    notify_session_cancelled(row, classes_by_id)

    return jsonify({'message': 'Session deleted', 'deleted_count': 1}), 200
