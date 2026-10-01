import calendar as cal
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.balances import apply_session_deductions
from app.services.pending_enrollments import roster_pending_students
from app.services.roster_ids import parse_roster_student_id, roster_student_id
from app.services.ical import build_sessions_ics
from app.services.notifications import (
    notify_recurring_series_cancelled,
    notify_session_cancelled,
    notify_session_created,
    notify_session_schedule_changed,
)

sessions_bp = Blueprint('sessions', __name__)

MAX_RECURRING_SESSIONS = 52
ATTENDANCE_STATUSES = frozenset({'present', 'absent', 'late'})
DEFAULT_ATTENDANCE_STATUS = 'present'


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


def _display_session_title(row, class_name=''):
    title = (row.get('title') or '').strip()
    if title:
        return title
    return (class_name or '').strip() or 'Session'


def _serialize_session(row, classes_by_id):
    class_info = classes_by_id.get(row['class_id'], {})
    class_name = class_info.get('name', '')
    raw_title = (row.get('title') or '').strip()
    return {
        'id': row['id'],
        'class_id': row['class_id'],
        'class_name': class_name,
        'color': class_info.get('color', '#6366f1'),
        'title': raw_title,
        'display_title': _display_session_title(row, class_name),
        'date': row['date'],
        'start_time': row['start_time'],
        'end_time': row['end_time'],
        'location': row.get('location') or '',
        'meeting_url': row.get('meeting_url') or '',
        'type': row.get('type') or 'one-time',
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


def _normalize_meeting_url(raw):
    if raw is None:
        return None, None
    text = str(raw).strip()
    if not text:
        return None, None
    lower = text.lower()
    if lower in ('none', 'n/a', 'na', '-'):
        return None, None
    if not (lower.startswith('http://') or lower.startswith('https://')):
        return None, None
    if len(text) > 2048:
        return None, 'meeting_url is too long'
    return text, None


def _with_meeting_url(payload, meeting_url):
    """Only send meeting_url when set — DB may not have migrated column yet."""
    if meeting_url:
        payload['meeting_url'] = meeting_url
    return payload


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'sessions' in lower:
            if 'meeting_url' in lower:
                return (
                    'Database column "sessions.meeting_url" is missing. '
                    'Run backend/sql/add_meeting_url.sql in Supabase SQL Editor.'
                )
            if 'title' in lower and 'not-null' in lower:
                return (
                    'Database column "sessions.title" must allow NULL. '
                    'Run backend/sql/sessions_optional_title.sql in Supabase SQL Editor.'
                )
            return (
                'Sessions table is missing required columns (date, start_time, etc.). '
                'Run backend/sql/fix_sessions_schema.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _strip_optional_session_columns(rows, exc):
    """Drop optional columns mentioned in a schema error and retry once."""
    msg = str(exc).lower()
    optional = (
        'meeting_url', 'notes', 'location', 'type',
        'recurrence_rule', 'recurrence_group_id',
    )
    stripped = False
    for row in rows:
        for col in optional:
            if col in msg and col in row:
                row.pop(col, None)
                stripped = True
    return stripped


def _ensure_insert_titles(rows):
    """Legacy DBs may still have NOT NULL title — use class name before insert."""
    changed = False
    for row in rows:
        if (row.get('title') or '').strip():
            continue
        class_row = _get_class_row(row.get('class_id'))
        row['title'] = (class_row or {}).get('name') or 'Session'
        changed = True
    return changed


def _get_class_row(class_id):
    if not class_id:
        return None
    result = supabase.table('class_groups').select(
        'id, name, billing_mode, unit_price, teacher_id'
    ).eq('id', class_id).limit(1).execute()
    if not result.data:
        return None
    return result.data[0]


def _insert_sessions(payloads):
    """Insert session row(s); retry without optional columns if DB schema lags."""
    rows = [payloads] if isinstance(payloads, dict) else list(payloads)
    try:
        result = supabase.table('sessions').insert(rows).execute()
        return result, None
    except Exception as exc:
        msg = str(exc).lower()
        if 'title' in msg and ('not-null' in msg or '23502' in msg):
            if _ensure_insert_titles(rows):
                try:
                    result = supabase.table('sessions').insert(rows).execute()
                    return result, None
                except Exception as retry_exc:
                    return None, _friendly_db_error(retry_exc)
        if not _strip_optional_session_columns(rows, exc):
            return None, _friendly_db_error(exc)
        try:
            result = supabase.table('sessions').insert(rows).execute()
            return result, None
        except Exception as retry_exc:
            return None, _friendly_db_error(retry_exc)


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


def _validate_export_date(date_str, label):
    if not date_str:
        return None
    if not _validate_date(date_str):
        return f'{label} must be YYYY-MM-DD'
    return None


@sessions_bp.route('/api/sessions/export.ics', methods=['GET'])
@require_auth
def export_sessions_ics():
    user = _get_user_record(g.current_user.id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    class_ids = _accessible_class_ids(user)
    if class_ids is None:
        return jsonify({'error': 'Forbidden'}), 403
    if not class_ids:
        body = build_sessions_ics([], calendar_name='EduSync Schedule')
        return Response(
            body,
            mimetype='text/calendar; charset=utf-8',
            headers={
                'Content-Disposition': 'attachment; filename="edusync-schedule.ics"',
            },
        )

    from_date = request.args.get('from', '').strip()
    to_date = request.args.get('to', '').strip()
    class_id = request.args.get('class_id', '').strip()

    from_error = _validate_export_date(from_date, 'from')
    if from_error:
        return jsonify({'error': from_error}), 400
    to_error = _validate_export_date(to_date, 'to')
    if to_error:
        return jsonify({'error': to_error}), 400

    if class_id and class_id not in class_ids:
        return jsonify({'error': 'Forbidden'}), 403

    try:
        query = supabase.table('sessions').select('*').in_('class_id', class_ids)
        if class_id:
            query = query.eq('class_id', class_id)
        if from_date:
            query = query.gte('date', from_date)
        if to_date:
            query = query.lte('date', to_date)
        result = query.order('date').order('start_time').execute()
    except Exception:
        return jsonify({'error': 'Failed to export sessions'}), 500

    rows = result.data or []
    classes_by_id = _class_map(class_ids)
    sessions = [_serialize_session(row, classes_by_id) for row in rows]

    display_name = user.get('display_name') or user.get('email') or 'EduSync'
    calendar_name = f'EduSync — {display_name}'

    body = build_sessions_ics(sessions, calendar_name=calendar_name)
    return Response(
        body,
        mimetype='text/calendar; charset=utf-8',
        headers={
            'Content-Disposition': 'attachment; filename="edusync-schedule.ics"',
        },
    )


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
    meeting_url, meeting_err = _normalize_meeting_url(data.get('meeting_url'))
    if meeting_err:
        return jsonify({'error': meeting_err}), 400
    notes = (data.get('notes') or '').strip()
    session_type = (data.get('type') or 'one-time').strip().lower()
    recurrence_rule = (data.get('recurrence_rule') or '').strip().lower()
    recurrence_end_date = (data.get('recurrence_end_date') or '').strip()

    if not class_id or not date or not start_time or not end_time:
        return jsonify({
            'error': 'class_id, date, start_time, and end_time are required'
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
            _with_meeting_url({
                'class_id': class_id,
                'title': title or None,
                'date': session_date,
                'start_time': normalized_start,
                'end_time': normalized_end,
                'location': location or None,
                'notes': notes or None,
                'type': 'recurring',
                'recurrence_rule': 'weekly',
                'recurrence_group_id': group_id,
            }, meeting_url)
            for session_date in dates
        ]

        result, insert_err = _insert_sessions(payloads)
        if insert_err:
            return jsonify({'error': insert_err}), 500

        if not result.data:
            return jsonify({'error': 'Failed to create recurring sessions'}), 500

        classes_by_id = _class_map([class_id])
        serialized = [
            _serialize_session(row, classes_by_id)
            for row in result.data
        ]
        first_row = result.data[0]
        try:
            notified = notify_session_created(
                first_row,
                classes_by_id,
                session_count=len(serialized),
                last_date=result.data[-1].get('date'),
            )
        except Exception:
            notified = 0
        return jsonify({
            'session': serialized[0],
            'sessions': serialized,
            'count': len(serialized),
            'notified_students': notified,
        }), 201

    if session_type not in ('one-time', 'recurring'):
        return jsonify({'error': 'type must be one-time or recurring'}), 400

    payload = _with_meeting_url({
        'class_id': class_id,
        'title': title or None,
        'date': date,
        'start_time': normalized_start,
        'end_time': normalized_end,
        'location': location or None,
        'notes': notes or None,
        'type': 'one-time',
    }, meeting_url)

    result, insert_err = _insert_sessions(payload)
    if insert_err:
        return jsonify({'error': insert_err}), 500

    if not result.data:
        return jsonify({'error': 'Failed to create session'}), 500

    classes_by_id = _class_map([class_id])
    try:
        notified = notify_session_created(result.data[0], classes_by_id)
    except Exception:
        notified = 0
    return jsonify({
        'session': _serialize_session(result.data[0], classes_by_id),
        'count': 1,
        'notified_students': notified,
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
        updates['title'] = title or None

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

    if 'meeting_url' in data:
        meeting_url, meeting_err = _normalize_meeting_url(data.get('meeting_url'))
        if meeting_err:
            return jsonify({'error': meeting_err}), 400
        updates['meeting_url'] = meeting_url

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
    schedule_fields = {'title', 'date', 'start_time', 'end_time', 'location', 'meeting_url'}
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


def _friendly_attendance_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'attendance' in lower:
            return (
                'Database table "attendance" is missing. '
                'Run backend/sql/create_attendance.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _class_enrolled_students(class_id):
    enrollments = supabase.table('class_enrollments').select(
        'student_id'
    ).eq('class_id', class_id).execute()
    student_ids = [row['student_id'] for row in (enrollments.data or [])]
    if not student_ids:
        enrolled_rows = []
    else:
        users = supabase.table('users').select(
            'id, display_name, email'
        ).in_('id', student_ids).execute()
        users_by_id = {row['id']: row for row in (users.data or [])}
        enrolled_rows = []
        for student_id in student_ids:
            user = users_by_id.get(student_id, {})
            enrolled_rows.append({
                'student_id': student_id,
                'pending_enrollment_id': None,
                'student_name': user.get('display_name') or user.get('email') or 'Student',
                'email': user.get('email') or '',
                'is_pending': False,
            })
        enrolled_rows.sort(key=lambda row: row['student_name'].lower())

    pending_rows = []
    for row in roster_pending_students(class_id):
        pending_rows.append({
            'student_id': row['id'],
            'pending_enrollment_id': row.get('invite_id'),
            'student_name': row.get('display_name') or row.get('email') or 'Student',
            'email': row.get('email') or '',
            'is_pending': True,
        })

    return enrolled_rows + pending_rows


def _class_roster_ids(class_id):
    return {
        student['student_id']
        for student in _class_enrolled_students(class_id)
        if student.get('student_id')
    }


def _student_enrolled_in_class(student_id, class_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_id
    ).eq('student_id', student_id).limit(1).execute()
    return bool(result.data)


def _attendance_map_for_session(session_id):
    try:
        result = supabase.table('attendance').select(
            'student_id, pending_enrollment_id, status, recorded_at'
        ).eq('session_id', session_id).execute()
    except Exception:
        return {}
    mapped = {}
    for row in (result.data or []):
        if row.get('pending_enrollment_id'):
            key = roster_student_id(pending_enrollment_id=row['pending_enrollment_id'])
        else:
            key = row.get('student_id')
        if key:
            mapped[key] = row
    return mapped


def _build_attendance_records(session_id, class_id):
    students = _class_enrolled_students(class_id)
    by_student = _attendance_map_for_session(session_id)
    records = []
    for student in students:
        roster_id = student['student_id']
        saved = by_student.get(roster_id)
        records.append({
            'student_id': roster_id,
            'student_name': student['student_name'],
            'email': student['email'],
            'status': (saved or {}).get('status') or DEFAULT_ATTENDANCE_STATUS,
            'recorded_at': (saved or {}).get('recorded_at'),
            'is_pending': student.get('is_pending', False),
        })
    return records


@sessions_bp.route('/api/sessions/<session_id>/attendance', methods=['GET'])
@require_auth
def get_session_attendance(session_id):
    row = _get_session_row(session_id)
    if not row:
        return jsonify({'error': 'Session not found'}), 404

    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    class_id = row['class_id']

    if role == 'teacher':
        if not _teacher_owns_class(class_id, g.current_user.id):
            return jsonify({'error': 'Session not found'}), 404
        try:
            records = _build_attendance_records(session_id, class_id)
        except Exception as exc:
            return jsonify({'error': _friendly_attendance_error(exc)}), 500
        return jsonify({
            'session_id': session_id,
            'records': records,
        }), 200

    if role == 'student':
        if not _student_enrolled_in_class(user['id'], class_id):
            return jsonify({'error': 'Session not found'}), 404
        try:
            by_student = _attendance_map_for_session(session_id)
        except Exception as exc:
            return jsonify({'error': _friendly_attendance_error(exc)}), 500
        saved = by_student.get(user['id'])
        return jsonify({
            'session_id': session_id,
            'my_status': (saved or {}).get('status'),
            'recorded_at': (saved or {}).get('recorded_at'),
        }), 200

    return jsonify({'error': 'Forbidden'}), 403


@sessions_bp.route('/api/sessions/<session_id>/attendance', methods=['POST'])
@require_role('teacher')
def save_session_attendance(session_id):
    row = _get_session_row(session_id)
    if not row:
        return jsonify({'error': 'Session not found'}), 404

    if not _teacher_owns_class(row['class_id'], g.current_user.id):
        return jsonify({'error': 'Session not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    records = data.get('records')
    if not isinstance(records, list) or not records:
        return jsonify({'error': 'records must be a non-empty array'}), 400

    enrolled_ids = _class_roster_ids(row['class_id'])
    if not enrolled_ids:
        return jsonify({'error': 'No students enrolled in this class'}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    upserts = []
    for item in records:
        if not isinstance(item, dict):
            return jsonify({'error': 'Each record must be an object'}), 400
        roster_id = item.get('student_id')
        status = (item.get('status') or '').strip().lower()
        if roster_id not in enrolled_ids:
            return jsonify({'error': 'Invalid student for this session'}), 400
        if status not in ATTENDANCE_STATUSES:
            return jsonify({'error': 'status must be present, absent, or late'}), 400

        student_id, pending_enrollment_id = parse_roster_student_id(roster_id)
        row_payload = {
            'session_id': session_id,
            'status': status,
            'recorded_at': now_iso,
        }
        if pending_enrollment_id:
            row_payload['pending_enrollment_id'] = pending_enrollment_id
            row_payload['student_id'] = None
        else:
            row_payload['student_id'] = student_id
            row_payload['pending_enrollment_id'] = None
        upserts.append(row_payload)

    try:
        for row_payload in upserts:
            if row_payload.get('pending_enrollment_id'):
                supabase.table('attendance').upsert(
                    row_payload,
                    on_conflict='session_id,pending_enrollment_id',
                ).execute()
            else:
                supabase.table('attendance').upsert(
                    row_payload,
                    on_conflict='session_id,student_id',
                ).execute()
        saved_records = _build_attendance_records(session_id, row['class_id'])
    except Exception as exc:
        return jsonify({'error': _friendly_attendance_error(exc)}), 500

    deductions_applied = []
    try:
        deduction_records = [
            {
                'student_id': item.get('student_id'),
                'status': item.get('status'),
            }
            for item in records
        ]
        deductions_applied = apply_session_deductions(row, deduction_records)
    except Exception:
        # Attendance saved; billing failure should not block the teacher.
        deductions_applied = []

    return jsonify({
        'session_id': session_id,
        'records': saved_records,
        'deductions_applied': len(deductions_applied),
    }), 200


@sessions_bp.route('/api/attendance/me', methods=['GET'])
@require_role('student')
def list_my_attendance():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    month = (request.args.get('month') or '').strip()
    class_ids = _accessible_class_ids(user) or []
    if not class_ids:
        return jsonify({'records': []}), 200

    try:
        sessions_query = supabase.table('sessions').select(
            'id, class_id, title, date, start_time, end_time'
        ).in_('class_id', class_ids)
        if month:
            start, end = _parse_month(month)
            if start and end:
                sessions_query = sessions_query.gte('date', start).lte('date', end)
        sessions_result = sessions_query.order('date', desc=True).execute()
    except Exception:
        return jsonify({'error': 'Failed to load sessions'}), 500

    sessions = sessions_result.data or []
    if not sessions:
        return jsonify({'records': []}), 200

    session_ids = [row['id'] for row in sessions]
    classes_by_id = _class_map(class_ids)

    try:
        attendance_result = supabase.table('attendance').select(
            'session_id, status, recorded_at'
        ).eq('student_id', user['id']).in_('session_id', session_ids).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_attendance_error(exc)}), 500

    by_session = {
        row['session_id']: row for row in (attendance_result.data or [])
    }

    records = []
    for session_row in sessions:
        saved = by_session.get(session_row['id'])
        if not saved:
            continue
        class_info = classes_by_id.get(session_row['class_id'], {})
        records.append({
            'session_id': session_row['id'],
            'session_title': session_row.get('title') or 'Session',
            'class_name': class_info.get('name') or '',
            'date': session_row.get('date'),
            'start_time': session_row.get('start_time'),
            'end_time': session_row.get('end_time'),
            'status': saved.get('status'),
            'recorded_at': saved.get('recorded_at'),
        })

    return jsonify({'records': records}), 200
