from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_role
from app.services.pending_enrollments import fetch_pending_for_classes, normalize_email

students_bp = Blueprint('students', __name__)


def _teacher_class_ids(teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'teacher_id', teacher_id
    ).execute()
    return [row['id'] for row in (result.data or [])]


def _teacher_has_student(teacher_id, student_id):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return False

    result = supabase.table('class_enrollments').select('id').eq(
        'student_id', student_id
    ).in_('class_id', class_ids).limit(1).execute()
    return bool(result.data)


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'student_notes' in lower:
            return (
                'Database table "student_notes" is missing. '
                'Run backend/sql/create_student_notes.sql in Supabase SQL Editor.'
            )
        if 'pending_enrollments' in lower:
            return (
                'Database table "pending_enrollments" is missing. '
                'Run backend/sql/create_pending_enrollments.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _serialize_student(student_id, user, class_rows, *, enrollment_status='active'):
    class_rows.sort(key=lambda row: (row.get('name') or '').lower())
    grade = (user or {}).get('grade')
    return {
        'id': student_id,
        'display_name': (user or {}).get('display_name') or '',
        'email': (user or {}).get('email') or '',
        'grade': (grade or '').strip() or None,
        'classes': class_rows,
        'status': enrollment_status,
    }


def _matches_search(user, query):
    if not query:
        return True
    needle = query.lower()
    name = ((user or {}).get('display_name') or '').lower()
    email = ((user or {}).get('email') or '').lower()
    return needle in name or needle in email


def _matches_grade(user, grade_filter):
    if not grade_filter:
        return True
    value = ((user or {}).get('grade') or '').strip()
    if grade_filter == '__none__':
        return not value
    return value.lower() == grade_filter.lower()


def _period_start(period):
    today = date.today()
    days_by_period = {
        'week': 7,
        'half_month': 15,
        'month': 30,
    }
    days = days_by_period.get(period or 'week', 7)
    return today - timedelta(days=days - 1), today


def _format_date(value):
    return value.isoformat() if isinstance(value, date) else str(value)


def _load_teacher_student_context(teacher_id, student_id):
    classes_result = supabase.table('class_groups').select(
        'id, name, billing_mode, unit_price'
    ).eq('teacher_id', teacher_id).execute()
    teacher_classes = classes_result.data or []
    class_ids = [row['id'] for row in teacher_classes]
    if not class_ids:
        return [], {}

    enrollments = supabase.table('class_enrollments').select(
        'class_id'
    ).eq('student_id', student_id).in_('class_id', class_ids).execute()
    enrolled_ids = {row['class_id'] for row in (enrollments.data or [])}
    classes = [row for row in teacher_classes if row['id'] in enrolled_ids]
    return classes, {row['id']: row for row in classes}


def _report_sessions(student_id, class_ids, classes_by_id, start_date, end_date):
    if not class_ids:
        return [], {'present': 0, 'late': 0, 'absent': 0, 'unrecorded': 0, 'total': 0}

    sessions_result = supabase.table('sessions').select(
        'id, class_id, title, date, start_time, end_time, notes'
    ).in_('class_id', class_ids).gte(
        'date', _format_date(start_date)
    ).lte(
        'date', _format_date(end_date)
    ).order('date').execute()

    sessions = sessions_result.data or []
    session_ids = [row['id'] for row in sessions]
    attendance_by_session = {}
    if session_ids:
        attendance_result = supabase.table('attendance').select(
            'session_id, status, recorded_at'
        ).eq('student_id', student_id).in_('session_id', session_ids).execute()
        attendance_by_session = {
            row['session_id']: row
            for row in (attendance_result.data or [])
        }

    summary = {'present': 0, 'late': 0, 'absent': 0, 'unrecorded': 0, 'total': len(sessions)}
    items = []
    for row in sessions:
        attendance = attendance_by_session.get(row['id'])
        status = (attendance or {}).get('status') or 'unrecorded'
        if status in summary:
            summary[status] += 1
        items.append({
            'id': row['id'],
            'class_name': (classes_by_id.get(row['class_id']) or {}).get('name') or '',
            'title': row.get('title') or 'Session',
            'date': row.get('date'),
            'start_time': row.get('start_time'),
            'end_time': row.get('end_time'),
            'notes': row.get('notes') or '',
            'attendance_status': status,
        })
    return items, summary


def _report_assignments(student_id, class_ids, classes_by_id, start_date, end_date):
    if not class_ids:
        return []

    assignments_result = supabase.table('assignments').select(
        'id, class_id, title, description, due_date, created_at'
    ).in_('class_id', class_ids).execute()
    assignments = []
    for row in assignments_result.data or []:
        key = row.get('due_date') or row.get('created_at') or ''
        key_date = str(key)[:10]
        if _format_date(start_date) <= key_date <= _format_date(end_date):
            assignments.append(row)

    assignment_ids = [row['id'] for row in assignments]
    submissions_by_assignment = {}
    if assignment_ids:
        submissions_result = supabase.table('assignment_submissions').select(
            'assignment_id, submitted_at, grade, feedback, content'
        ).eq('student_id', student_id).in_(
            'assignment_id', assignment_ids
        ).execute()
        submissions_by_assignment = {
            row['assignment_id']: row
            for row in (submissions_result.data or [])
        }

    items = []
    for row in sorted(assignments, key=lambda item: item.get('due_date') or item.get('created_at') or ''):
        submission = submissions_by_assignment.get(row['id'])
        items.append({
            'id': row['id'],
            'class_name': (classes_by_id.get(row['class_id']) or {}).get('name') or '',
            'title': row.get('title') or '',
            'description': row.get('description') or '',
            'due_date': row.get('due_date'),
            'submitted_at': (submission or {}).get('submitted_at'),
            'grade': (submission or {}).get('grade'),
            'feedback': (submission or {}).get('feedback') or '',
            'status': 'submitted' if submission else 'missing',
        })
    return items


def _report_balances(student_id, class_ids, classes_by_id):
    if not class_ids:
        return []
    result = supabase.table('student_balances').select(
        'class_id, balance, unit'
    ).eq('student_id', student_id).in_('class_id', class_ids).execute()
    rows_by_class = {row['class_id']: row for row in (result.data or [])}
    balances = []
    for class_id in class_ids:
        saved = rows_by_class.get(class_id, {})
        balances.append({
            'class_id': class_id,
            'class_name': (classes_by_id.get(class_id) or {}).get('name') or '',
            'balance': float(saved.get('balance') or 0),
            'unit': saved.get('unit') or 'sessions',
        })
    return balances


@students_bp.route('/api/students', methods=['GET'])
@require_role('teacher')
def list_teacher_students():
    teacher_id = g.current_user.id

    try:
        classes_result = supabase.table('class_groups').select(
            'id, name, color'
        ).eq('teacher_id', teacher_id).execute()
    except Exception:
        return jsonify({'error': 'Failed to load classes'}), 500

    classes = classes_result.data or []
    class_ids = [row['id'] for row in classes]
    if not class_ids:
        return jsonify({'students': [], 'total': 0, 'grades': []}), 200

    class_by_id = {row['id']: row for row in classes}

    try:
        enrollments_result = supabase.table('class_enrollments').select(
            'student_id, class_id, joined_at'
        ).in_('class_id', class_ids).execute()
    except Exception:
        return jsonify({'error': 'Failed to load enrollments'}), 500

    enrollments = enrollments_result.data or []

    by_student = {}
    users_by_id = {}

    if enrollments:
        student_ids = list({row['student_id'] for row in enrollments})

        try:
            users_result = supabase.table('users').select(
                'id, email, display_name, grade'
            ).in_('id', student_ids).execute()
        except Exception:
            return jsonify({'error': 'Failed to load students'}), 500

        users_by_id = {row['id']: row for row in (users_result.data or [])}

        for row in enrollments:
            student_id = row['student_id']
            class_info = class_by_id.get(row['class_id'], {})
            class_entry = {
                'id': row['class_id'],
                'name': class_info.get('name') or '',
                'color': class_info.get('color') or '#6366f1',
                'joined_at': row.get('joined_at'),
                'enrollment_status': 'active',
            }

            if student_id not in by_student:
                by_student[student_id] = []
            by_student[student_id].append(class_entry)

    students = [
        _serialize_student(student_id, users_by_id.get(student_id), class_rows)
        for student_id, class_rows in by_student.items()
    ]

    try:
        pending_rows = fetch_pending_for_classes(class_ids)
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500
    pending_by_email = {}
    for row in pending_rows:
        email = normalize_email(row.get('email'))
        if not email:
            continue
        class_info = class_by_id.get(row.get('class_id'), {})
        class_entry = {
            'id': row.get('class_id'),
            'name': class_info.get('name') or '',
            'color': class_info.get('color') or '#6366f1',
            'joined_at': row.get('invited_at'),
            'enrollment_status': 'pending',
            'invite_id': row.get('id'),
        }
        pending_by_email.setdefault(email, {
            'display_name': row.get('display_name') or '',
            'grade': (row.get('grade') or '').strip() or None,
            'classes': [],
            'invite_ids': [],
        })
        bucket = pending_by_email[email]
        if not bucket['display_name']:
            bucket['display_name'] = row.get('display_name') or ''
        if not bucket['grade'] and row.get('grade'):
            bucket['grade'] = (row.get('grade') or '').strip() or None
        bucket['classes'].append(class_entry)
        bucket['invite_ids'].append(row.get('id'))

    enrolled_emails = {
        normalize_email(users_by_id.get(student_id, {}).get('email'))
        for student_id in by_student
    }

    for email, bucket in pending_by_email.items():
        if email in enrolled_emails:
            for student in students:
                if normalize_email(student.get('email')) == email:
                    for class_entry in bucket['classes']:
                        if not any(
                            existing.get('id') == class_entry.get('id')
                            for existing in student.get('classes', [])
                        ):
                            student['classes'].append(class_entry)
                    if student.get('status') != 'active':
                        student['status'] = 'mixed'
                    break
            continue

        invite_id = bucket['invite_ids'][0] if bucket['invite_ids'] else email
        students.append(_serialize_student(
            f"pending:{invite_id}",
            {
                'display_name': bucket['display_name'],
                'email': email,
                'grade': bucket['grade'],
            },
            bucket['classes'],
            enrollment_status='pending',
        ))

    students.sort(
        key=lambda row: (
            (row.get('display_name') or row.get('email') or '').lower()
        ),
    )

    all_grades = sorted({
        row['grade']
        for row in students
        if row.get('grade')
    }, key=str.lower)

    query = (request.args.get('q') or '').strip()
    grade_filter = (request.args.get('grade') or '').strip()

    if query or grade_filter:
        filtered = []
        for row in students:
            if str(row.get('id', '')).startswith('pending:'):
                user = {
                    'display_name': row.get('display_name') or '',
                    'email': row.get('email') or '',
                    'grade': row.get('grade'),
                }
            else:
                user = users_by_id.get(row['id'], {})
            if not _matches_search(user, query):
                continue
            if not _matches_grade(user, grade_filter):
                continue
            filtered.append(row)
        students = filtered

    return jsonify({
        'students': students,
        'total': len(students),
        'grades': all_grades,
    }), 200


@students_bp.route('/api/students/<student_id>/notes', methods=['GET'])
@require_role('teacher')
def get_student_note(student_id):
    teacher_id = g.current_user.id
    if not _teacher_has_student(teacher_id, student_id):
        return jsonify({'error': 'Student not found'}), 404

    try:
        result = supabase.table('student_notes').select(
            'content, updated_at'
        ).eq('teacher_id', teacher_id).eq('student_id', student_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'content': '', 'updated_at': None}), 200

    row = result.data[0]
    return jsonify({
        'content': row.get('content') or '',
        'updated_at': row.get('updated_at'),
    }), 200


@students_bp.route('/api/students/<student_id>/report', methods=['GET'])
@require_role('teacher')
def student_report(student_id):
    teacher_id = g.current_user.id
    if not _teacher_has_student(teacher_id, student_id):
        return jsonify({'error': 'Student not found'}), 404

    period = (request.args.get('period') or 'week').strip()
    if period not in ('week', 'half_month', 'month'):
        return jsonify({'error': 'period must be week, half_month, or month'}), 400

    start_date, end_date = _period_start(period)

    try:
        user_result = supabase.table('users').select(
            'id, email, display_name, grade'
        ).eq('id', student_id).limit(1).execute()
        if not user_result.data:
            return jsonify({'error': 'Student not found'}), 404
        student = user_result.data[0]

        classes, classes_by_id = _load_teacher_student_context(
            teacher_id, student_id
        )
        class_ids = [row['id'] for row in classes]
        sessions, attendance_summary = _report_sessions(
            student_id, class_ids, classes_by_id, start_date, end_date
        )
        assignments = _report_assignments(
            student_id, class_ids, classes_by_id, start_date, end_date
        )
        balances = _report_balances(student_id, class_ids, classes_by_id)

        note_result = supabase.table('student_notes').select(
            'content, updated_at'
        ).eq('teacher_id', teacher_id).eq('student_id', student_id).limit(1).execute()
        note = (note_result.data or [{}])[0]
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    return jsonify({
        'student': {
            'id': student_id,
            'display_name': student.get('display_name') or '',
            'email': student.get('email') or '',
            'grade': (student.get('grade') or '').strip() or None,
        },
        'period': {
            'type': period,
            'start_date': _format_date(start_date),
            'end_date': _format_date(end_date),
        },
        'classes': classes,
        'attendance': {
            'summary': attendance_summary,
            'sessions': sessions,
        },
        'assignments': assignments,
        'balances': balances,
        'teacher_note': {
            'content': note.get('content') or '',
            'updated_at': note.get('updated_at'),
        },
    }), 200


@students_bp.route('/api/students/<student_id>/notes', methods=['PUT'])
@require_role('teacher')
def upsert_student_note(student_id):
    teacher_id = g.current_user.id
    if not _teacher_has_student(teacher_id, student_id):
        return jsonify({'error': 'Student not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    content = data.get('content')
    if content is None:
        return jsonify({'error': 'content is required'}), 400

    content = str(content).strip()
    if len(content) > 10000:
        return jsonify({'error': 'Note is too long (max 10000 characters)'}), 400

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        existing = supabase.table('student_notes').select('id').eq(
            'teacher_id', teacher_id
        ).eq('student_id', student_id).execute()

        if existing.data:
            result = supabase.table('student_notes').update({
                'content': content,
                'updated_at': now_iso,
            }).eq('teacher_id', teacher_id).eq(
                'student_id', student_id
            ).execute()
        else:
            result = supabase.table('student_notes').insert({
                'teacher_id': teacher_id,
                'student_id': student_id,
                'content': content,
            }).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to save note'}), 500

    row = result.data[0]
    return jsonify({
        'content': row.get('content') or '',
        'updated_at': row.get('updated_at'),
    }), 200
