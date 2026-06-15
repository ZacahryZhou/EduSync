from flask import Blueprint, request, jsonify, g
from app.middleware.auth import require_auth
from app.extensions import supabase

users_bp = Blueprint('users', __name__)


def _serialize_user(user):
    return {
        'id': user['id'],
        'email': user['email'],
        'role': user['role'],
        'display_name': user['display_name'],
        'email_notifications': user.get('email_notifications', True),
        'created_at': user.get('created_at'),
    }


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

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        result = supabase.table('users').update(updates).eq('id', user_id).execute()
    except Exception:
        return jsonify({'error': 'Failed to update profile'}), 500

    if not result.data:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(_serialize_user(result.data[0])), 200
