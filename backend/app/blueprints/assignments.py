from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.notifications import notify_assignment_published

assignments_bp = Blueprint('assignments', __name__)


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
    return jsonify({
        'assignments': [
            _serialize_assignment(row, classes_by_id)
            for row in rows
        ],
    }), 200


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
