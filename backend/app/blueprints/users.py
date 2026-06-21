import mimetypes

from flask import Blueprint, request, jsonify, g

from app.middleware.auth import require_auth
from app.extensions import supabase
from app.config import Config

users_bp = Blueprint('users', __name__)

AVATARS_BUCKET = 'avatars'
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_MIMES = frozenset({
    'image/jpeg',
    'image/png',
    'image/webp',
})


def _resolve_avatar_url(avatar_url):
    if not avatar_url:
        return None
    value = str(avatar_url).strip()
    if not value:
        return None
    if value.startswith('http://') or value.startswith('https://'):
        return value
    base = (Config.SUPABASE_URL or '').rstrip('/')
    if not base:
        return value
    return f'{base}/storage/v1/object/public/{AVATARS_BUCKET}/{value}'


def _serialize_user(user):
    payload = {
        'id': user['id'],
        'email': user['email'],
        'role': user['role'],
        'display_name': user['display_name'],
        'email_notifications': user.get('email_notifications', True),
        'created_at': user.get('created_at'),
        'avatar_url': _resolve_avatar_url(user.get('avatar_url')),
    }
    if user.get('grade') is not None:
        payload['grade'] = user.get('grade') or None
    return payload


def _avatar_extension(mime, filename):
    if mime == 'image/jpeg':
        return 'jpg'
    if mime == 'image/png':
        return 'png'
    if mime == 'image/webp':
        return 'webp'
    guessed = mimetypes.guess_type(filename or '')[0]
    if guessed == 'image/jpeg':
        return 'jpg'
    if guessed == 'image/png':
        return 'png'
    if guessed == 'image/webp':
        return 'webp'
    return 'jpg'


def _avatar_storage_path(user_id, mime, filename):
    ext = _avatar_extension(mime, filename)
    return f'{user_id}/avatar.{ext}'


def _is_storage_avatar_path(avatar_url):
    if not avatar_url:
        return False
    value = str(avatar_url).strip()
    if not value or value.startswith('http://') or value.startswith('https://'):
        return False
    return True


def _upload_avatar_file(user_id, file_storage):
    if not file_storage or not file_storage.filename:
        return None, 'File is required'
    data = file_storage.read()
    if not data:
        return None, 'Uploaded file is empty'
    if len(data) > MAX_AVATAR_BYTES:
        return None, 'Image must be 2MB or smaller'
    mime = (file_storage.mimetype or '').split(';')[0].strip().lower()
    if not mime:
        mime = mimetypes.guess_type(file_storage.filename)[0] or ''
    if mime not in ALLOWED_AVATAR_MIMES:
        return None, 'Allowed image types: JPEG, PNG, WebP'
    path = _avatar_storage_path(user_id, mime, file_storage.filename)
    try:
        supabase.storage.from_(AVATARS_BUCKET).upload(
            path,
            data,
            file_options={'content-type': mime, 'upsert': 'true'},
        )
    except Exception as exc:
        message = str(exc).lower()
        if 'bucket' in message and 'not found' in message:
            return None, (
                'Storage bucket "avatars" is missing. '
                'Run backend/sql/setup_avatars_bucket.sql in Supabase.'
            )
        return None, str(exc) or 'Failed to upload image'
    return path, None


def _remove_storage_avatar(avatar_url):
    if not _is_storage_avatar_path(avatar_url):
        return
    try:
        supabase.storage.from_(AVATARS_BUCKET).remove([str(avatar_url).strip()])
    except Exception:
        pass


@users_bp.route('/api/users', methods=['GET'])
@require_auth
def get_user():
    user_id = g.current_user.id

    try:
        user_data = supabase.table('users').select('*').eq('id', user_id).execute()

        if not user_data.data:
            return jsonify({'error': 'User not found'}), 404
        user = user_data.data[0]

        return jsonify(_serialize_user(user)), 200
    except Exception:
        return jsonify({'error': 'something went wrong'}), 500


@users_bp.route('/api/users/me', methods=['PATCH'])
@require_auth
def update_user():
    user_id = g.current_user.id
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    updates = {}

    if 'display_name' in data:
        display_name = str(data.get('display_name') or '').strip()
        if not display_name:
            return jsonify({'error': 'display_name cannot be empty'}), 400
        updates['display_name'] = display_name

    if 'email_notifications' in data:
        updates['email_notifications'] = bool(data.get('email_notifications'))

    if 'avatar_url' in data:
        raw = data.get('avatar_url')
        if raw is None or str(raw).strip() == '':
            updates['avatar_url'] = None
        else:
            updates['avatar_url'] = str(raw).strip()

    if 'grade' in data:
        try:
            user_row = supabase.table('users').select('role').eq(
                'id', user_id
            ).limit(1).execute()
        except Exception:
            return jsonify({'error': 'Failed to load user'}), 500
        if not user_row.data:
            return jsonify({'error': 'User not found'}), 404
        if (user_row.data[0].get('role') or '').lower() != 'student':
            return jsonify({'error': 'Only students can set grade'}), 400
        grade = str(data.get('grade') or '').strip()
        updates['grade'] = grade or None

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        result = supabase.table('users').update(updates).eq('id', user_id).execute()
    except Exception:
        return jsonify({'error': 'Failed to update profile'}), 500

    if not result.data:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(_serialize_user(result.data[0])), 200


@users_bp.route('/api/users/me/avatar', methods=['POST'])
@require_auth
def upload_avatar():
    user_id = g.current_user.id
    file_storage = request.files.get('file')

    try:
        current = supabase.table('users').select('avatar_url').eq(
            'id', user_id
        ).limit(1).execute()
    except Exception:
        return jsonify({'error': 'Failed to load user'}), 500

    if not current.data:
        return jsonify({'error': 'User not found'}), 404

    previous_avatar = current.data[0].get('avatar_url')
    file_path, upload_err = _upload_avatar_file(user_id, file_storage)
    if upload_err:
        return jsonify({'error': upload_err}), 400

    try:
        result = supabase.table('users').update({
            'avatar_url': file_path,
        }).eq('id', user_id).execute()
    except Exception:
        try:
            supabase.storage.from_(AVATARS_BUCKET).remove([file_path])
        except Exception:
            pass
        return jsonify({'error': 'Failed to save avatar'}), 500

    if not result.data:
        return jsonify({'error': 'User not found'}), 404

    if previous_avatar and previous_avatar != file_path:
        _remove_storage_avatar(previous_avatar)

    return jsonify(_serialize_user(result.data[0])), 200
