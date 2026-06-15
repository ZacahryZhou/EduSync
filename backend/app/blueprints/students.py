from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_role

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
    return message or 'Database error'


def _serialize_student(student_id, user, class_rows):
    class_rows.sort(key=lambda row: (row.get('name') or '').lower())
    grade = (user or {}).get('grade')
    return {
        'id': student_id,
        'display_name': (user or {}).get('display_name') or '',
        'email': (user or {}).get('email') or '',
        'grade': (grade or '').strip() or None,
        'classes': class_rows,
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
    if not enrollments:
        return jsonify({'students': [], 'total': 0, 'grades': []}), 200

    student_ids = list({row['student_id'] for row in enrollments})

    try:
        users_result = supabase.table('users').select(
            'id, email, display_name, grade'
        ).in_('id', student_ids).execute()
    except Exception:
        return jsonify({'error': 'Failed to load students'}), 500

    users_by_id = {row['id']: row for row in (users_result.data or [])}

    by_student = {}
    for row in enrollments:
        student_id = row['student_id']
        class_info = class_by_id.get(row['class_id'], {})
        class_entry = {
            'id': row['class_id'],
            'name': class_info.get('name') or '',
            'color': class_info.get('color') or '#6366f1',
            'joined_at': row.get('joined_at'),
        }

        if student_id not in by_student:
            by_student[student_id] = []
        by_student[student_id].append(class_entry)

    students = [
        _serialize_student(student_id, users_by_id.get(student_id), class_rows)
        for student_id, class_rows in by_student.items()
    ]
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
