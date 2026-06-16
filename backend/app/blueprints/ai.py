import json

from flask import Blueprint, Response, g, jsonify, request

from app.config import Config
from app.extensions import supabase
from app.middleware.auth import require_role, _load_user_record
from app.services.ai_tools import execute_tool, tool_definitions
from app.services.deepseek import (
    MAX_TOOL_ROUNDS,
    complete_chat,
    is_configured,
    stream_chat,
)

ai_bp = Blueprint('ai', __name__)

MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 8000
ALLOWED_ROLES = frozenset({'user', 'assistant'})

TEACHER_SYSTEM_PROMPT = """You are EduSync AI for logged-in teachers only.

SCOPE
- Answer ONLY using data returned by EduSync tools/API for this teacher, plus the teacher's current message.
- For schedule, students, homework, balances, or reschedule questions: call the appropriate read tool first.
- Never invent students, sessions, grades, or balances. If data is missing, say you don't have it.
- Do not use general world knowledge as if it were this school's records.
- You cannot change data in this version; suggest using the app UI for edits.

CONFIDENTIALITY (NEVER disclose)
- Passwords, tokens, API keys, .env, database credentials.
- Other teachers' classes or students outside this teacher's access.
- Unnecessary PII: student emails, phones, addresses, full grade/feedback dumps, full uploaded files.
- Claiming an action was executed unless the app confirmed it after teacher approval.

BEHAVIOR
- After tool results, summarize clearly with class names and dates.
- Minimize sensitive fields in replies; use display names only.
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
        payload = {
            'user_id': user_id,
            'role': role,
            'model': model,
            'messages': messages,
            'reply': reply,
            'error_message': error_message,
        }
        supabase.table('ai_interactions').insert(payload).execute()
    except Exception:
        pass


def _parse_tool_arguments(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _tool_label(tool_name):
    labels = {
        'list_my_classes': 'classes',
        'list_sessions': 'schedule',
        'list_class_students': 'students',
        'list_assignments': 'assignments',
        'list_pending_submissions': 'submissions',
        'get_student_balances': 'balances',
        'list_pending_reschedules': 'reschedule requests',
    }
    return labels.get(tool_name, tool_name)


@ai_bp.route('/api/ai/status', methods=['GET'])
@require_role('teacher')
def ai_status():
    return jsonify({
        'configured': is_configured(),
        'model': Config.DEEPSEEK_MODEL or 'deepseek-chat',
        'read_tools': True,
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
    teacher_id = user_id
    tools = tool_definitions()

    def generate():
        reply_parts = []
        agent_messages = list(messages)

        try:
            for _ in range(MAX_TOOL_ROUNDS):
                result = complete_chat(
                    agent_messages,
                    system_prompt=system_prompt,
                    tools=tools,
                )
                tool_calls = result.get('tool_calls') or []

                if tool_calls:
                    assistant_message = {
                        'role': 'assistant',
                        'content': result.get('content') or None,
                        'tool_calls': tool_calls,
                    }
                    agent_messages.append(assistant_message)

                    for call in tool_calls:
                        fn = call.get('function') or {}
                        tool_name = fn.get('name') or ''
                        tool_id = call.get('id') or tool_name
                        args = _parse_tool_arguments(fn.get('arguments'))

                        yield (
                            f'data: {json.dumps({"type": "tool_start", "name": tool_name, "label": _tool_label(tool_name)})}\n\n'
                        )

                        tool_result = execute_tool(tool_name, args, teacher_id)

                        agent_messages.append({
                            'role': 'tool',
                            'tool_call_id': tool_id,
                            'content': tool_result,
                        })

                        yield (
                            f'data: {json.dumps({"type": "tool_done", "name": tool_name})}\n\n'
                        )
                    continue

                final_text = (result.get('content') or '').strip()
                if final_text:
                    chunk_size = 24
                    for index in range(0, len(final_text), chunk_size):
                        piece = final_text[index:index + chunk_size]
                        reply_parts.append(piece)
                        yield f'data: {json.dumps({"type": "token", "content": piece})}\n\n'
                else:
                    for token in stream_chat(agent_messages, system_prompt=system_prompt):
                        reply_parts.append(token)
                        yield f'data: {json.dumps({"type": "token", "content": token})}\n\n'

                full_reply = ''.join(reply_parts)
                _log_interaction(user_id, 'teacher', model, messages, full_reply)
                yield f'data: {json.dumps({"type": "done"})}\n\n'
                return

            yield f'data: {json.dumps({"type": "error", "message": "Too many tool steps; try a simpler question."})}\n\n'
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
