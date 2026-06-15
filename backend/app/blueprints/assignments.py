from datetime import datetime, timezone
import mimetypes

from flask import Blueprint, g, jsonify, request
from werkzeug.utils import secure_filename

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.notifications import (
    notify_assignment_graded,
    notify_assignment_published,
    notify_assignment_submitted,
)

assignments_bp = Blueprint('assignments', __name__)

SUBMISSIONS_BUCKET = 'submissions'
MAX_SUBMISSION_BYTES = 20 * 1024 * 1024
ALLOWED_SUBMISSION_MIMES = frozenset({
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
})


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'assignments' in lower:
            return (
                'Database table "assignments" is missing. '
                'Run backend/sql/create_assignments.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _teacher_owns_class(class_id, teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'id', class_id
    ).eq('teacher_id', teacher_id).execute()
    return bool(result.data)


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


def _serialize_assignment(row, classes_by_id):
    class_info = classes_by_id.get(row['class_id'], {})
    return {
        'id': row['id'],
        'class_id': row['class_id'],
        'class_name': class_info.get('name', ''),
        'color': class_info.get('color', '#6366f1'),
        'title': row.get('title') or '',
        'description': row.get('description') or '',
        'due_date': row.get('due_date'),
        'attachment_url': row.get('attachment_url') or '',
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
    }


def _parse_due_date(raw):
    if raw is None or raw == '':
        return None, None
    text = str(raw).strip()
    if not text:
        return None, None
    try:
        if 'T' in text:
            parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
        else:
            parsed = datetime.strptime(text, '%Y-%m-%d').replace(
                hour=23, minute=59, tzinfo=timezone.utc
            )
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat(), None
    except (TypeError, ValueError):
        return None, 'due_date must be ISO datetime or YYYY-MM-DD'


def _get_assignment_row(assignment_id):
    try:
        result = supabase.table('assignments').select('*').eq(
            'id', assignment_id
        ).limit(1).execute()
    except Exception:
        return None
    if not result.data:
        return None
    return result.data[0]


def _student_enrolled(student_id, class_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_id
    ).eq('student_id', student_id).limit(1).execute()
    return bool(result.data)


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


def _safe_storage_name(filename):
    base = secure_filename(filename or '') or 'upload'
    return base[:200]


def _storage_path(assignment_id, student_id, filename):
    return f'{assignment_id}/{student_id}/{_safe_storage_name(filename)}'


def _upload_submission_file(assignment_id, student_id, file_storage):
    if not file_storage or not file_storage.filename:
        return None, None
    data = file_storage.read()
    if not data:
        return None, 'Uploaded file is empty'
    if len(data) > MAX_SUBMISSION_BYTES:
        return None, 'File must be 20MB or smaller'
    mime = (file_storage.mimetype or '').split(';')[0].strip().lower()
    if not mime:
        mime = mimetypes.guess_type(file_storage.filename)[0] or ''
    if mime not in ALLOWED_SUBMISSION_MIMES:
        return None, 'Allowed file types: PDF, JPEG, PNG'
    path = _storage_path(assignment_id, student_id, file_storage.filename)
    try:
        supabase.storage.from_(SUBMISSIONS_BUCKET).upload(
            path,
            data,
            file_options={'content-type': mime, 'upsert': 'true'},
        )
    except Exception as exc:
        message = str(exc).lower()
        if 'bucket' in message and 'not found' in message:
            return None, (
                'Storage bucket "submissions" is missing. '
                'Create it in Supabase Storage or run backend/sql/setup_submissions_bucket.sql.'
            )
        return None, str(exc) or 'Failed to upload file'
    return path, None


def _signed_download_url(storage_path):
    if not storage_path:
        return None
    try:
        result = supabase.storage.from_(SUBMISSIONS_BUCKET).create_signed_url(
            storage_path, 3600
        )
    except Exception:
        return None
    if isinstance(result, dict):
        return result.get('signedURL') or result.get('signedUrl')
    return None


def _filename_from_path(storage_path):
    if not storage_path:
        return ''
    return storage_path.rsplit('/', 1)[-1]


def _user_map(user_ids):
    if not user_ids:
        return {}
    result = supabase.table('users').select(
        'id, display_name, email'
    ).in_('id', list(user_ids)).execute()
    return {row['id']: row for row in (result.data or [])}


def _get_submission_row(submission_id):
    try:
        result = supabase.table('assignment_submissions').select('*').eq(
            'id', submission_id
        ).limit(1).execute()
    except Exception:
        return None
    if not result.data:
        return None
    return result.data[0]


def _serialize_submission(row, users_by_id=None, include_download=False):
    student = (users_by_id or {}).get(row.get('student_id'), {})
    file_path = row.get('file_url') or ''
    payload = {
        'id': row['id'],
        'assignment_id': row['assignment_id'],
        'student_id': row['student_id'],
        'student_name': student.get('display_name') or student.get('email') or 'Student',
        'student_email': student.get('email') or '',
        'content': row.get('content') or '',
        'file_name': _filename_from_path(file_path),
        'grade': row.get('grade'),
        'feedback': row.get('feedback') or '',
        'submitted_at': row.get('submitted_at'),
    }
    if include_download and file_path:
        payload['file_download_url'] = _signed_download_url(file_path)
    return payload


def _get_submission_for_student(assignment_id, student_id):
    try:
        result = supabase.table('assignment_submissions').select('*').eq(
            'assignment_id', assignment_id
        ).eq('student_id', student_id).limit(1).execute()
    except Exception:
        return None
    if not result.data:
        return None
    return result.data[0]


def _my_submission_for_assignment(assignment_id, student_id):
    row = _get_submission_for_student(assignment_id, student_id)
    if not row:
        return None
    return _serialize_submission(row, include_download=True)


@assignments_bp.route('/api/assignments', methods=['GET'])
@require_auth
def list_assignments():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    class_id = (request.args.get('class_id') or '').strip()
    class_ids = _accessible_class_ids(user)
    if not class_ids:
        return jsonify({'assignments': []}), 200

    if class_id:
        if class_id not in class_ids:
            return jsonify({'error': 'Class not found'}), 404
        class_ids = [class_id]

    try:
        result = supabase.table('assignments').select('*').in_(
            'class_id', class_ids
        ).order('due_date', desc=False).order('created_at', desc=True).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    rows = result.data or []
    classes_by_id = _class_map(class_ids)
    role = (user.get('role') or '').strip().lower()
    assignments = []
    for row in rows:
        item = _serialize_assignment(row, classes_by_id)
        if role == 'student':
            item['my_submission'] = _my_submission_for_assignment(
                row['id'], user['id']
            )
            item['past_due'] = _assignment_past_due(row)
        assignments.append(item)
    return jsonify({'assignments': assignments}), 200


@assignments_bp.route('/api/assignments', methods=['POST'])
@require_role('teacher')
def create_assignment():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    class_id = data.get('class_id')
    title = (data.get('title') or '').strip()
    description = (data.get('description') or '').strip()
    attachment_url = (data.get('attachment_url') or '').strip() or None

    if not class_id or not title:
        return jsonify({'error': 'class_id and title are required'}), 400

    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    due_date, due_err = _parse_due_date(data.get('due_date'))
    if due_err:
        return jsonify({'error': due_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        'class_id': class_id,
        'teacher_id': g.current_user.id,
        'title': title,
        'description': description,
        'due_date': due_date,
        'attachment_url': attachment_url,
        'updated_at': now_iso,
    }

    try:
        result = supabase.table('assignments').insert(payload).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to create assignment'}), 500

    row = result.data[0]
    classes_by_id = _class_map([class_id])
    serialized = _serialize_assignment(row, classes_by_id)
    notified = notify_assignment_published(row, classes_by_id)
    return jsonify({
        'assignment': serialized,
        'students_notified': notified,
    }), 201


@assignments_bp.route('/api/assignments/<assignment_id>', methods=['PATCH'])
@require_role('teacher')
def update_assignment(assignment_id):
    row = _get_assignment_row(assignment_id)
    if not row:
        return jsonify({'error': 'Assignment not found'}), 404

    if not _teacher_owns_class(row['class_id'], g.current_user.id):
        return jsonify({'error': 'Assignment not found'}), 404

    data = request.get_json() or {}
    updates = {}

    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'title cannot be empty'}), 400
        updates['title'] = title

    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip()

    if 'attachment_url' in data:
        updates['attachment_url'] = (
            (data.get('attachment_url') or '').strip() or None
        )

    if 'due_date' in data:
        due_date, due_err = _parse_due_date(data.get('due_date'))
        if due_err:
            return jsonify({'error': due_err}), 400
        updates['due_date'] = due_date

    if not updates:
        return jsonify({'error': 'No fields to update'}), 400

    updates['updated_at'] = datetime.now(timezone.utc).isoformat()

    try:
        result = supabase.table('assignments').update(updates).eq(
            'id', assignment_id
        ).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to update assignment'}), 500

    classes_by_id = _class_map([row['class_id']])
    return jsonify({
        'assignment': _serialize_assignment(result.data[0], classes_by_id),
    }), 200


@assignments_bp.route('/api/assignments/<assignment_id>', methods=['DELETE'])
@require_role('teacher')
def delete_assignment(assignment_id):
    row = _get_assignment_row(assignment_id)
    if not row:
        return jsonify({'error': 'Assignment not found'}), 404

    if not _teacher_owns_class(row['class_id'], g.current_user.id):
        return jsonify({'error': 'Assignment not found'}), 404

    try:
        supabase.table('assignments').delete().eq('id', assignment_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    return jsonify({'message': 'Assignment deleted'}), 200


@assignments_bp.route('/api/assignments/<assignment_id>/submit', methods=['POST'])
@require_role('student')
def submit_assignment(assignment_id):
    assignment = _get_assignment_row(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    student_id = g.current_user.id
    if not _student_enrolled(student_id, assignment['class_id']):
        return jsonify({'error': 'Assignment not found'}), 404

    if _assignment_past_due(assignment):
        return jsonify({'error': 'This assignment is past the due date'}), 400

    content = (request.form.get('content') or '').strip()
    file_storage = request.files.get('file')
    if not content and (not file_storage or not file_storage.filename):
        return jsonify({'error': 'Add a written response or upload a file'}), 400

    file_path = None
    if file_storage and file_storage.filename:
        file_path, upload_err = _upload_submission_file(
            assignment_id, student_id, file_storage
        )
        if upload_err:
            return jsonify({'error': upload_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    existing_row = _get_submission_for_student(assignment_id, student_id)
    payload = {
        'assignment_id': assignment_id,
        'student_id': student_id,
        'content': content,
        'submitted_at': now_iso,
    }
    if file_path:
        payload['file_url'] = file_path
    elif existing_row and existing_row.get('file_url'):
        payload['file_url'] = existing_row['file_url']

    try:
        if existing_row:
            result = supabase.table('assignment_submissions').update(
                payload
            ).eq('assignment_id', assignment_id).eq(
                'student_id', student_id
            ).execute()
        else:
            result = supabase.table('assignment_submissions').insert(
                payload
            ).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to save submission'}), 500

    row = result.data[0]
    user = _load_user_record()
    student_name = (user or {}).get('display_name') or (user or {}).get('email') or 'A student'
    notify_assignment_submitted(assignment, student_name, row.get('id'))

    return jsonify({
        'submission': _serialize_submission(row, include_download=True),
    }), 200


@assignments_bp.route('/api/assignments/<assignment_id>/submissions', methods=['GET'])
@require_role('teacher')
def list_submissions(assignment_id):
    assignment = _get_assignment_row(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    if not _teacher_owns_class(assignment['class_id'], g.current_user.id):
        return jsonify({'error': 'Assignment not found'}), 404

    try:
        result = supabase.table('assignment_submissions').select('*').eq(
            'assignment_id', assignment_id
        ).order('submitted_at', desc=True).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    rows = result.data or []
    users_by_id = _user_map([row['student_id'] for row in rows])
    return jsonify({
        'submissions': [
            _serialize_submission(row, users_by_id, include_download=True)
            for row in rows
        ],
    }), 200


@assignments_bp.route('/api/submissions/<submission_id>', methods=['PATCH'])
@require_role('teacher')
def grade_submission(submission_id):
    row = _get_submission_row(submission_id)
    if not row:
        return jsonify({'error': 'Submission not found'}), 404

    assignment = _get_assignment_row(row['assignment_id'])
    if not assignment:
        return jsonify({'error': 'Submission not found'}), 404

    if not _teacher_owns_class(assignment['class_id'], g.current_user.id):
        return jsonify({'error': 'Submission not found'}), 404

    data = request.get_json() or {}
    grade = (data.get('grade') or '').strip()
    feedback = (data.get('feedback') or '').strip()

    if not grade:
        return jsonify({'error': 'grade is required'}), 400

    updates = {'grade': grade, 'feedback': feedback}

    try:
        result = supabase.table('assignment_submissions').update(
            updates
        ).eq('id', submission_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to update submission'}), 500

    updated = result.data[0]
    users_by_id = _user_map([updated['student_id']])
    notify_assignment_graded(
        assignment, updated['student_id'], grade, feedback or None
    )

    return jsonify({
        'submission': _serialize_submission(
            updated, users_by_id, include_download=True
        ),
    }), 200
