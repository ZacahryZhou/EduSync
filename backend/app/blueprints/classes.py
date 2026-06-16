import random
import re
import string
import mimetypes
import uuid

from flask import Blueprint, g, jsonify, request
from werkzeug.utils import secure_filename

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record

classes_bp = Blueprint('classes', __name__)

MATERIALS_BUCKET = 'materials'
MAX_MATERIAL_BYTES = 20 * 1024 * 1024
MATERIAL_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024
ALLOWED_MATERIAL_MIMES = frozenset({
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
})

CLASS_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']
CLASS_CODE_PATTERN = re.compile(r'[A-Z0-9]{2,6}-[A-Z0-9]{4}')


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
        if 'class_materials' in lower:
            if 'file_size' in lower:
                return (
                    'Database column "class_materials.file_size" is missing. '
                    'Run backend/sql/add_material_file_size.sql in Supabase SQL Editor.'
                )
            return (
                'Database table "class_materials" is missing. '
                'Run backend/sql/create_class_materials.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _normalize_class_code(raw):
    """Uppercase, strip spaces, extract PREFIX-XXXX, drop stray punctuation."""
    if not raw:
        return ''
    cleaned = re.sub(r'\s+', '', str(raw).strip().upper())
    cleaned = re.sub(r'[^A-Z0-9\-]', '', cleaned)
    if CLASS_CODE_PATTERN.fullmatch(cleaned):
        return cleaned
    matches = CLASS_CODE_PATTERN.findall(cleaned)
    if matches:
        return matches[-1]
    return cleaned


def _generate_class_code(name):
    prefix = re.sub(r'[^A-Za-z0-9]', '', name.upper())[:4] or 'CLS'
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f'{prefix}-{suffix}'


def _ensure_class_code(class_row):
    """Backfill missing codes for older rows created before the code column existed."""
    existing = _normalize_class_code(class_row.get('code'))
    if existing:
        class_row['code'] = existing
        return class_row

    name = (class_row.get('name') or 'CLS').strip() or 'CLS'
    class_id = class_row.get('id')
    if not class_id:
        return class_row

    for _ in range(5):
        candidate = _normalize_class_code(_generate_class_code(name))
        try:
            result = supabase.table('class_groups').update({
                'code': candidate,
            }).eq('id', class_id).execute()
            if result.data:
                class_row['code'] = result.data[0].get('code') or candidate
                return class_row
        except Exception as exc:
            if 'duplicate' in str(exc).lower() or 'unique' in str(exc).lower():
                continue
            break

    return class_row


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


def _student_enrolled_in_class(student_id, class_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_id
    ).eq('student_id', student_id).limit(1).execute()
    return bool(result.data)


def _can_access_class(user, class_id):
    role = (user.get('role') or '').strip().lower()
    if role == 'teacher':
        return _teacher_owns_class(class_id, user['id'])
    if role == 'student':
        return _student_enrolled_in_class(user['id'], class_id)
    return False


def _safe_storage_name(filename):
    base = secure_filename(filename or '') or 'upload'
    return base[:200]


def _material_storage_path(class_id, material_id, filename):
    return f'{class_id}/{material_id}/{_safe_storage_name(filename)}'


def _upload_material_file(class_id, material_id, file_storage):
    if not file_storage or not file_storage.filename:
        return None, None, None, None, 'File is required'
    data = file_storage.read()
    if not data:
        return None, None, None, None, 'Uploaded file is empty'
    if len(data) > MAX_MATERIAL_BYTES:
        return None, None, None, None, 'File must be 20MB or smaller'
    mime = (file_storage.mimetype or '').split(';')[0].strip().lower()
    if not mime:
        mime = mimetypes.guess_type(file_storage.filename)[0] or ''
    if mime not in ALLOWED_MATERIAL_MIMES:
        return None, None, None, None, 'Allowed file types: PDF, JPEG, PNG'
    path = _material_storage_path(class_id, material_id, file_storage.filename)
    try:
        supabase.storage.from_(MATERIALS_BUCKET).upload(
            path,
            data,
            file_options={'content-type': mime, 'upsert': 'true'},
        )
    except Exception as exc:
        message = str(exc).lower()
        if 'bucket' in message and 'not found' in message:
            return None, None, None, None, (
                'Storage bucket "materials" is missing. '
                'Create it in Supabase Storage or run backend/sql/setup_materials_bucket.sql.'
            )
        return None, None, None, None, str(exc) or 'Failed to upload file'
    return path, _safe_storage_name(file_storage.filename), mime, len(data), None


def _signed_material_url(storage_path):
    if not storage_path:
        return None
    try:
        result = supabase.storage.from_(MATERIALS_BUCKET).create_signed_url(
            storage_path, 3600
        )
    except Exception:
        return None
    if isinstance(result, dict):
        return result.get('signedURL') or result.get('signedUrl')
    return None


def _load_uploader_names(user_ids):
    if not user_ids:
        return {}
    result = supabase.table('users').select(
        'id, display_name, email'
    ).in_('id', user_ids).execute()
    names = {}
    for row in result.data or []:
        names[row['id']] = row.get('display_name') or row.get('email') or 'Teacher'
    return names


def _serialize_material(row, uploader_names):
    uploader_id = row.get('uploaded_by')
    return {
        'id': row.get('id'),
        'class_id': row.get('class_id'),
        'title': row.get('title') or '',
        'file_name': row.get('file_name') or '',
        'mime_type': row.get('mime_type') or '',
        'file_size': int(row.get('file_size') or 0),
        'download_url': _signed_material_url(row.get('file_path')),
        'uploaded_by': uploader_id,
        'uploaded_by_name': uploader_names.get(uploader_id, ''),
        'created_at': row.get('created_at'),
    }


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
                f'Invalid class code "{class_code}". Ask your teacher to copy the '
                'code from the class card (e.g. MATH-A1B2). If the card shows '
                '"Not set", the teacher should refresh Classes or create a new class.'
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

    if role == 'teacher':
        rows = [_ensure_class_code(row) for row in rows]

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
                row = _ensure_class_code(result.data[0])
                if not _normalize_class_code(row.get('code')):
                    return jsonify({
                        'error': (
                            'Class was created but class code is missing in the '
                            'database. Run backend/sql/fix_class_groups_schema.sql '
                            'in Supabase, then refresh the Classes page.'
                        ),
                    }), 500
                return jsonify({
                    'class': _serialize_class(row, student_count=0),
                }), 201
        except Exception as e:
            if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                continue
            return jsonify({'error': _friendly_db_error(e)}), 500

    return jsonify({'error': 'Could not generate a unique class code, try again'}), 500


def _fetch_class_students(class_id):
    """Return enrollment rows with student profile (name, email, joined_at)."""
    try:
        result = supabase.table('class_enrollments').select(
            'student_id, joined_at, users(id, email, display_name)'
        ).eq('class_id', class_id).order('joined_at', desc=False).execute()
        rows = result.data or []
        students = []
        for row in rows:
            user = row.get('users')
            if isinstance(user, list):
                user = user[0] if user else {}
            elif not isinstance(user, dict):
                user = {}
            students.append({
                'id': user.get('id') or row.get('student_id'),
                'display_name': user.get('display_name') or '',
                'email': user.get('email') or '',
                'joined_at': row.get('joined_at'),
            })
        return students
    except Exception:
        result = supabase.table('class_enrollments').select(
            'student_id, joined_at'
        ).eq('class_id', class_id).order('joined_at', desc=False).execute()
        enrollments = result.data or []
        if not enrollments:
            return []

        student_ids = [row['student_id'] for row in enrollments]
        users_result = supabase.table('users').select(
            'id, email, display_name'
        ).in_('id', student_ids).execute()
        users_by_id = {
            row['id']: row for row in (users_result.data or [])
        }

        students = []
        for row in enrollments:
            user = users_by_id.get(row['student_id'], {})
            students.append({
                'id': row['student_id'],
                'display_name': user.get('display_name') or '',
                'email': user.get('email') or '',
                'joined_at': row.get('joined_at'),
            })
        return students


@classes_bp.route('/api/classes/<class_id>/students', methods=['GET'])
@require_role('teacher')
def list_class_students(class_id):
    teacher_id = g.current_user.id
    if not _teacher_owns_class(class_id, teacher_id):
        return jsonify({'error': 'Class not found'}), 404

    try:
        students = _fetch_class_students(class_id)
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    return jsonify({'students': students}), 200


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


@classes_bp.route('/api/classes/<class_id>/materials', methods=['GET'])
@require_auth
def list_class_materials(class_id):
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    if not _can_access_class(user, class_id):
        return jsonify({'error': 'Class not found'}), 404

    try:
        result = supabase.table('class_materials').select('*').eq(
            'class_id', class_id
        ).order('created_at', desc=True).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    rows = result.data or []
    uploader_ids = list({row.get('uploaded_by') for row in rows if row.get('uploaded_by')})
    uploader_names = _load_uploader_names(uploader_ids)

    return jsonify({
        'materials': [
            _serialize_material(row, uploader_names)
            for row in rows
        ],
    }), 200


@classes_bp.route('/api/classes/<class_id>/materials', methods=['POST'])
@require_role('teacher')
def upload_class_material(class_id):
    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    title = (request.form.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400

    file_storage = request.files.get('file')
    material_id = str(uuid.uuid4())
    file_path, file_name, mime_type, file_size, upload_err = _upload_material_file(
        class_id, material_id, file_storage
    )
    if upload_err:
        return jsonify({'error': upload_err}), 400

    payload = {
        'id': material_id,
        'class_id': class_id,
        'title': title,
        'file_path': file_path,
        'file_name': file_name,
        'mime_type': mime_type,
        'file_size': file_size,
        'uploaded_by': g.current_user.id,
    }

    try:
        try:
            result = supabase.table('class_materials').insert(payload).execute()
        except Exception as insert_exc:
            if 'file_size' not in str(insert_exc).lower():
                raise insert_exc
            payload.pop('file_size', None)
            result = supabase.table('class_materials').insert(payload).execute()
    except Exception as exc:
        try:
            supabase.storage.from_(MATERIALS_BUCKET).remove([file_path])
        except Exception:
            pass
        return jsonify({'error': _friendly_db_error(exc)}), 500

    if not result.data:
        return jsonify({'error': 'Failed to save material'}), 500

    row = result.data[0]
    uploader_names = _load_uploader_names([g.current_user.id])
    return jsonify({
        'material': _serialize_material(row, uploader_names),
    }), 201


@classes_bp.route('/api/classes/<class_id>/materials/<material_id>', methods=['DELETE'])
@require_role('teacher')
def delete_class_material(class_id, material_id):
    if not _teacher_owns_class(class_id, g.current_user.id):
        return jsonify({'error': 'Class not found'}), 404

    try:
        result = supabase.table('class_materials').select('*').eq(
            'id', material_id
        ).eq('class_id', class_id).limit(1).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    if not result.data:
        return jsonify({'error': 'Material not found'}), 404

    row = result.data[0]
    file_path = row.get('file_path')

    try:
        supabase.table('class_materials').delete().eq('id', material_id).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    if file_path:
        try:
            supabase.storage.from_(MATERIALS_BUCKET).remove([file_path])
        except Exception:
            pass

    return jsonify({'message': 'Material deleted'}), 200


@classes_bp.route('/api/materials/usage', methods=['GET'])
@require_role('teacher')
def material_storage_usage():
    teacher_id = g.current_user.id
    try:
        result = supabase.table('class_materials').select(
            'file_size'
        ).eq('uploaded_by', teacher_id).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    used_bytes = sum(
        int(row.get('file_size') or 0)
        for row in (result.data or [])
    )
    quota_bytes = MATERIAL_STORAGE_QUOTA_BYTES
    remaining_bytes = max(quota_bytes - used_bytes, 0)
    return jsonify({
        'used_bytes': used_bytes,
        'quota_bytes': quota_bytes,
        'remaining_bytes': remaining_bytes,
        'used_percent': round((used_bytes / quota_bytes) * 100, 1)
        if quota_bytes else 0,
        'single_file_limit_bytes': MAX_MATERIAL_BYTES,
    }), 200


@classes_bp.route('/api/materials/recent', methods=['GET'])
@require_auth
def list_recent_materials():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    limit = min(max(int(request.args.get('limit', 5)), 1), 20)

    try:
        if role == 'teacher':
            class_rows, _ = _fetch_teacher_classes(user['id'])
            class_ids = [row['id'] for row in class_rows]
        elif role == 'student':
            enrollments = supabase.table('class_enrollments').select(
                'class_id'
            ).eq('student_id', user['id']).execute()
            class_ids = [row['class_id'] for row in enrollments.data or []]
        else:
            return jsonify({'error': 'Forbidden'}), 403
    except Exception:
        return jsonify({'error': 'Failed to load materials'}), 500

    if not class_ids:
        return jsonify({'materials': []}), 200

    try:
        result = supabase.table('class_materials').select('*').in_(
            'class_id', class_ids
        ).order('created_at', desc=True).limit(limit).execute()
    except Exception as exc:
        return jsonify({'error': _friendly_db_error(exc)}), 500

    rows = result.data or []
    uploader_ids = list({row.get('uploaded_by') for row in rows if row.get('uploaded_by')})
    uploader_names = _load_uploader_names(uploader_ids)

    return jsonify({
        'materials': [
            _serialize_material(row, uploader_names)
            for row in rows
        ],
    }), 200
