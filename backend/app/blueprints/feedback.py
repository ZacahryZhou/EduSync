from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role

feedback_bp = Blueprint('feedback', __name__)

ALLOWED_VOTES = frozenset({'support', 'oppose'})


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


@feedback_bp.route('/api/feedback/features/<feature_id>', methods=['GET'])
@require_auth
def get_feature_feedback(feature_id):
    feature_id = (feature_id or '').strip()
    if not feature_id or len(feature_id) > 80:
        return jsonify({'error': 'Invalid feature id'}), 400

    support = 0
    oppose = 0
    my_vote = None

    try:
        rows = supabase.table('feature_feedback').select(
            'vote, user_id'
        ).eq('feature_id', feature_id).execute().data or []
        for row in rows:
            vote = (row.get('vote') or '').strip().lower()
            if vote == 'support':
                support += 1
            elif vote == 'oppose':
                oppose += 1
            if row.get('user_id') == g.current_user.id:
                my_vote = vote
    except Exception:
        pass

    return jsonify({
        'feature_id': feature_id,
        'support': support,
        'oppose': oppose,
        'my_vote': my_vote,
    }), 200


@feedback_bp.route('/api/feedback/features/<feature_id>', methods=['POST'])
@require_role('teacher')
def submit_feature_feedback(feature_id):
    feature_id = (feature_id or '').strip()
    if not feature_id or len(feature_id) > 80:
        return jsonify({'error': 'Invalid feature id'}), 400

    data = request.get_json(silent=True) or {}
    vote = (data.get('vote') or '').strip().lower()
    if vote not in ALLOWED_VOTES:
        return jsonify({'error': 'vote must be support or oppose'}), 400

    user_id = g.current_user.id
    now = _now_iso()

    try:
        existing = supabase.table('feature_feedback').select('id').eq(
            'feature_id', feature_id
        ).eq('user_id', user_id).limit(1).execute()
        if existing.data:
            supabase.table('feature_feedback').update({
                'vote': vote,
                'updated_at': now,
            }).eq('id', existing.data[0]['id']).execute()
        else:
            supabase.table('feature_feedback').insert({
                'feature_id': feature_id,
                'user_id': user_id,
                'vote': vote,
                'created_at': now,
                'updated_at': now,
            }).execute()

        rows = supabase.table('feature_feedback').select(
            'vote'
        ).eq('feature_id', feature_id).execute().data or []
        support = sum(1 for r in rows if r.get('vote') == 'support')
        oppose = sum(1 for r in rows if r.get('vote') == 'oppose')
    except Exception as exc:
        err = str(exc).lower()
        if 'feature_feedback' in err and (
            'does not exist' in err or 'could not find' in err or 'schema cache' in err
        ):
            return jsonify({
                'error': (
                    'Feedback table is missing. Run backend/sql/create_feature_feedback.sql '
                    'in Supabase SQL Editor.'
                ),
            }), 503
        return jsonify({'error': 'Failed to save feedback'}), 500

    return jsonify({
        'feature_id': feature_id,
        'vote': vote,
        'support': support,
        'oppose': oppose,
        'my_vote': vote,
    }), 200
