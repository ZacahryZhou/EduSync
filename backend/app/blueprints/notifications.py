from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth

notifications_bp = Blueprint('notifications', __name__)


def _friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'notifications' in lower:
            return (
                'Database table "notifications" is missing. '
                'Run backend/sql/create_notifications.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _serialize_notification(row):
    return {
        'id': row['id'],
        'type': row.get('type') or '',
        'title': row.get('title') or '',
        'body': row.get('body') or '',
        'read': bool(row.get('read')),
        'related_id': row.get('related_id'),
        'created_at': row.get('created_at'),
    }


@notifications_bp.route('/api/notifications', methods=['GET'])
@require_auth
def list_notifications():
    unread_only = request.args.get('unread_only', '').strip().lower() in (
        '1', 'true', 'yes',
    )
    limit_raw = request.args.get('limit', '50').strip()
    try:
        limit = min(max(int(limit_raw), 1), 100)
    except ValueError:
        limit = 50

    user_id = g.current_user.id

    try:
        query = supabase.table('notifications').select('*').eq(
            'user_id', user_id
        )
        if unread_only:
            query = query.eq('read', False)
        result = query.order('created_at', desc=True).limit(limit).execute()

        unread_result = supabase.table('notifications').select(
            'id', count='exact'
        ).eq('user_id', user_id).eq('read', False).execute()
        unread_count = unread_result.count or 0
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    rows = result.data or []
    return jsonify({
        'notifications': [_serialize_notification(row) for row in rows],
        'unread_count': unread_count,
    }), 200


@notifications_bp.route('/api/notifications/read-all', methods=['POST'])
@require_auth
def mark_all_read():
    user_id = g.current_user.id
    try:
        supabase.table('notifications').update({
            'read': True,
        }).eq('user_id', user_id).eq('read', False).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500
    return jsonify({'message': 'All notifications marked as read'}), 200


@notifications_bp.route('/api/notifications/<notification_id>/read', methods=['PATCH'])
@require_auth
def mark_notification_read(notification_id):
    user_id = g.current_user.id
    try:
        result = supabase.table('notifications').update({
            'read': True,
        }).eq('id', notification_id).eq('user_id', user_id).execute()
    except Exception as e:
        return jsonify({'error': _friendly_db_error(e)}), 500

    if not result.data:
        return jsonify({'error': 'Notification not found'}), 404

    return jsonify({
        'notification': _serialize_notification(result.data[0]),
    }), 200
