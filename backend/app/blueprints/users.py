from flask import Blueprint, request, jsonify, g
from app.middleware.auth import require_auth
from app.extensions import supabase

users_bp = Blueprint('users', __name__)


def _serialize_user(user):
    payload = {
        'id': user['id'],
        'email': user['email'],
        'role': user['role'],
        'display_name': user['display_name'],
        'email_notifications': user.get('email_notifications', True),
        'created_at': user.get('created_at'),
    }
    if user.get('grade') is not None:
        payload['grade'] = user.get('grade') or None
    return payload


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
