import json

from flask import Blueprint, Response, g, jsonify, request

from app.config import Config
from app.extensions import supabase
from app.middleware.auth import require_role, _load_user_record
from app.services.deepseek import is_configured, stream_chat

ai_bp = Blueprint('ai', __name__)

MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 8000
ALLOWED_ROLES = frozenset({'user', 'assistant'})

TEACHER_SYSTEM_PROMPT = """You are EduSync AI for logged-in teachers only.

SCOPE
- Answer ONLY using data returned by EduSync tools/API for this teacher, plus the teacher's current message.
- Never invent students, sessions, grades, or balances. If data is missing, say you don't have it.
- Do not use general world knowledge as if it were this school's records.
- You cannot change data in this version unless a confirmed tool result says so; suggest using the app UI.

CONFIDENTIALITY (NEVER disclose)
- Passwords, tokens, API keys, .env, database credentials.
- Other teachers' classes or students outside this teacher's access.
- Unnecessary PII: emails, phones, addresses, full grade/feedback dumps, full uploaded files.
- Claiming an action was executed unless the app confirmed it after teacher approval.

BEHAVIOR
- Minimize sensitive fields in replies; suggest using the app UI when unsure.
- Refuse policy-violating requests briefly and safely.
- Match the teacher's language (Chinese or English).
- Destructive or bulk changes: require in-app confirmation flows; do not bypass.

Full policy: docs/AI-SAFETY-POLICY.md"""


def _sanitize_messages(raw_messages):
    if not isinstance(raw_messages, list):
        return None, 'messages must be an array'

    cleaned = []
    for item in raw_messages[-MAX_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = (item.get('role') or '').strip().lower()
        if role not in ALLOWED_ROLES:
            continue
        content = (item.get('content') or '').strip()
        if not content:
            continue
        if len(content) > MAX_MESSAGE_CHARS:
            content = content[:MAX_MESSAGE_CHARS]
        cleaned.append({'role': role, 'content': content})

    if not cleaned or cleaned[-1]['role'] != 'user':
        return None, 'Last message must be a non-empty user message'

    return cleaned, None


def _log_interaction(user_id, role, model, messages, reply, error_message=None):
    try:
        supabase.table('ai_interactions').insert({
            'user_id': user_id,
            'role': role,
            'model': model,
            'messages': messages,
            'reply': reply,
            'error_message': error_message,
        }).execute()
    except Exception:
        pass


@ai_bp.route('/api/ai/status', methods=['GET'])
@require_role('teacher')
def ai_status():
    return jsonify({
        'configured': is_configured(),
        'model': Config.DEEPSEEK_MODEL or 'deepseek-chat',
    })


@ai_bp.route('/api/ai/chat', methods=['POST'])
@require_role('teacher')
def ai_chat():
    if not is_configured():
        return jsonify({
            'error': (
                'AI is not configured. Set DEEPSEEK_API_KEY in backend/.env '
                'and restart the server.'
            ),
        }), 503

    data = request.get_json(silent=True) or {}
    messages, err = _sanitize_messages(data.get('messages'))
    if err:
        return jsonify({'error': err}), 400

    user_record = _load_user_record() or {}
    teacher_name = user_record.get('display_name') or 'Teacher'
    system_prompt = (
        f'{TEACHER_SYSTEM_PROMPT}\n\n'
        f'The teacher\'s display name is {teacher_name}.'
    )
    model = Config.DEEPSEEK_MODEL or 'deepseek-chat'
    user_id = g.current_user.id

    def generate():
        reply_parts = []
        try:
            for token in stream_chat(messages, system_prompt=system_prompt):
                reply_parts.append(token)
                payload = json.dumps({'type': 'token', 'content': token})
                yield f'data: {payload}\n\n'
            full_reply = ''.join(reply_parts)
            _log_interaction(user_id, 'teacher', model, messages, full_reply)
            yield f'data: {json.dumps({"type": "done"})}\n\n'
        except Exception as exc:
            message = str(exc) or 'AI request failed'
            _log_interaction(
                user_id, 'teacher', model, messages, ''.join(reply_parts), message
            )
            yield f'data: {json.dumps({"type": "error", "message": message})}\n\n'

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )
