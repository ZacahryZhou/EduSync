import random
import re
import string

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record

classes_bp = Blueprint('classes', __name__)

CLASS_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'class_groups' in lower:
            return (
                'Database table "class_groups" is missing. '
                'Run backend/sql/create_mvp_tables.sql in Supabase SQL Editor.'
            )
        if 'class_enrollments' in lower:
            return (
                'Database table "class_enrollments" is missing. '
                'Run backend/sql/create_mvp_tables.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _normalize_class_code(raw):
    """Uppercase, strip spaces, and drop stray punctuation from paste."""
    if not raw:
        return ''
    cleaned = re.sub(r'\s+', '', str(raw).strip().upper())
    return re.sub(r'[^A-Z0-9\-]', '', cleaned)


def _generate_class_code(name):
    prefix = re.sub(r'[^A-Za-z0-9]', '', name.upper())[:4] or 'CLS'
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f'{prefix}-{suffix}'


def _serialize_class(row, student_count=0):
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row.get('description') or '',
        'code': row['code'],
        'billing_mode': row['billing_mode'],
        'unit_price': float(row['unit_price']),
        'teacher_id': row['teacher_id'],
        'color': row.get('color') or CLASS_COLORS[0],
        'student_count': student_count,
        'created_at': row.get('created_at'),
    }


def _student_count_from_row(row):
    nested = row.get('class_enrollments')
    if isinstance(nested, list) and nested and isinstance(nested[0], dict):
        return int(nested[0].get('count') or 0)
    return 0


_CLASS_LIST_COLUMNS = (
    'id, name, description, code, billing_mode, unit_price, '
    'teacher_id, color, created_at, class_enrollments(count)'
)


def _fetch_teacher_classes(teacher_id):
    """One Supabase round-trip (classes + enrollment counts)."""
    try:
        result = supabase.table('class_groups').select(_CLASS_LIST_COLUMNS).eq(
            'teacher_id', teacher_id
        ).order('id', desc=True).execute()
        return result.data or [], True
    except Exception:
        result = supabase.table('class_groups').select(
            'id, name, description, code, billing_mode, unit_price, '
            'teacher_id, color, created_at'
        ).eq('teacher_id', teacher_id).order('id', desc=True).execute()
        return result.data or [], False


def _fetch_student_classes(student_id):
    """One Supabase round-trip via enrollment join."""
    try:
        result = supabase.table('class_enrollments').select(
            f'class_groups({_CLASS_LIST_COLUMNS})'
        ).eq('student_id', student_id).execute()
        rows = []
        for item in result.data or []:
            class_row = item.get('class_groups')
            if class_row:
                rows.append(class_row)
        return rows, True
    except Exception:
        enrollments = supabase.table('class_enrollments').select(
            'class_id'
        ).eq('student_id', student_id).execute()
        class_ids = [row['class_id'] for row in enrollments.data or []]
        if not class_ids:
            return [], False
        result = supabase.table('class_groups').select(
            'id, name, description, code, billing_mode, unit_price, '
            'teacher_id, color, created_at'
        ).in_('id', class_ids).order('id', desc=True).execute()
        return result.data or [], False


def _count_students(class_ids):
    if not class_ids:
        return {}

    result = supabase.table('class_enrollments').select('class_id').in_(
        'class_id', class_ids
    ).execute()

    counts = {class_id: 0 for class_id in class_ids}
    for row in result.data or []:
        class_id = row['class_id']
        counts[class_id] = counts.get(class_id, 0) + 1
    return counts


def _teacher_owns_class(class_id, teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'id', class_id
    ).eq('teacher_id', teacher_id).execute()
    return bool(result.data)


@classes_bp.route('/api/classes/join', methods=['POST'])
@require_role('student')
def join_class():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    class_code = _normalize_class_code(data.get('class_code'))
    if not class_code:
        return jsonify({'error': 'Class code is required'}), 400

    try:
        class_result = supabase.table('class_groups').select('*').eq(
            'code', class_code
        ).execute()
        if not class_result.data:
            class_result = supabase.table('class_groups').select('*').ilike(
                'code', class_code
            ).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not class_result.data:
        return jsonify({
            'error': (
                'Invalid class code. Copy it exactly from your teacher '
                '(e.g. MATH-A1B2), including the hyphen.'
            ),
        }), 404

    class_row = class_result.data[0]
    student_id = g.current_user.id

    existing = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_row['id']
    ).eq('student_id', student_id).execute()

    if existing.data:
        return jsonify({'error': 'You are already in this class'}), 409

    try:
        supabase.table('class_enrollments').insert({
            'class_id': class_row['id'],
            'student_id': student_id,
        }).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    return jsonify({
        'message': 'Joined class successfully',
        'class': _serialize_class(class_row, student_count=1),
    }), 201


@classes_bp.route('/api/classes', methods=['GET'])
@require_auth
def list_classes():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    teacher_id = g.current_user.id

    try:
        if role == 'teacher':
            rows, has_embedded_counts = _fetch_teacher_classes(teacher_id)
        elif role == 'student':
            rows, has_embedded_counts = _fetch_student_classes(user['id'])
        else:
            return jsonify({'error': 'Forbidden'}), 403
    except Exception:
        return jsonify({'error': 'Failed to load classes'}), 500

    if has_embedded_counts:
        return jsonify({
            'classes': [
                _serialize_class(row, _student_count_from_row(row))
                for row in rows
            ]
        }), 200

    class_ids = [row['id'] for row in rows]
    counts = _count_students(class_ids)

    return jsonify({
        'classes': [
            _serialize_class(row, counts.get(row['id'], 0))
            for row in rows
        ]
    }), 200


@classes_bp.route('/api/classes', methods=['POST'])
@require_role('teacher')
def create_class():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Class name is required'}), 400

    description = (data.get('description') or '').strip()
    billing_mode = data.get('billing_mode', 'per_session')
    if billing_mode not in ('per_hour', 'per_session'):
        return jsonify({'error': 'billing_mode must be per_hour or per_session'}), 400

    try:
        unit_price = float(data.get('unit_price', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'unit_price must be a number'}), 400

    if unit_price < 0:
        return jsonify({'error': 'unit_price cannot be negative'}), 400

    teacher_id = g.current_user.id
    color = random.choice(CLASS_COLORS)

    for _ in range(5):
        code = _normalize_class_code(_generate_class_code(name))
        payload = {
            'teacher_id': teacher_id,
            'name': name,
            'description': description or None,
            'code': code,
            'billing_mode': billing_mode,
            'unit_price': unit_price,
            'color': color,
        }
        try:
            result = supabase.table('class_groups').insert(payload).execute()
            if result.data:
                return jsonify({
                    'class': _serialize_class(result.data[0], student_count=0),
                }), 201
        except Exception as e:
            if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                continue
            return jsonify({'error': _friendly_db_error(e)}), 500

    return jsonify({'error': 'Could not generate a unique class code, try again'}), 500


@classes_bp.route('/api/classes/<class_id>', methods=['PATCH'])
@require_role('teacher')
def update_class(class_id):
    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    updates = {}

    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Class name cannot be empty'}), 400
        updates['name'] = name

    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip() or None

    if 'billing_mode' in data:
        billing_mode = data.get('billing_mode')
        if billing_mode not in ('per_hour', 'per_session'):
            return jsonify({'error': 'billing_mode must be per_hour or per_session'}), 400
        updates['billing_mode'] = billing_mode

    if 'unit_price' in data:
        try:
            unit_price = float(data.get('unit_price'))
        except (TypeError, ValueError):
            return jsonify({'error': 'unit_price must be a number'}), 400
        if unit_price < 0:
            return jsonify({'error': 'unit_price cannot be negative'}), 400
        updates['unit_price'] = unit_price

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        result = supabase.table('class_groups').update(updates).eq(
            'id', class_id
        ).execute()
    except Exception:
        return jsonify({'error': 'Failed to update class'}), 500

    if not result.data:
        return jsonify({'error': 'Class not found'}), 404

    counts = _count_students([class_id])
    return jsonify({
        'class': _serialize_class(result.data[0], counts.get(class_id, 0)),
    }), 200


@classes_bp.route('/api/classes/<class_id>', methods=['DELETE'])
@require_role('teacher')
def delete_class(class_id):
    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    try:
        supabase.table('class_groups').delete().eq('id', class_id).execute()
    except Exception:
        return jsonify({'error': 'Failed to delete class'}), 500

    return jsonify({'message': 'Class deleted'}), 200
