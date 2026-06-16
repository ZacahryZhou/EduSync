"""Read-only AI tools for teachers (AI-1). All queries scoped to teacher_id."""

import calendar as cal
import json
from datetime import datetime, timezone

from app.extensions import supabase
from app.blueprints.tuition import _teacher_balance_rows
from app.blueprints.dashboard import _teacher_pending_grades

MAX_TOOL_RESULT_CHARS = 14_000
MAX_LIST_ITEMS = 40


def tool_definitions():
    """OpenAI-compatible tool schemas for DeepSeek."""
    return [
        {
            'type': 'function',
            'function': {
                'name': 'list_my_classes',
                'description': (
                    'List classes owned by this teacher (name, id, student count, billing).'
                ),
                'parameters': {'type': 'object', 'properties': {}, 'required': []},
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_sessions',
                'description': (
                    'List scheduled sessions. Filter by month (YYYY-MM) and/or date range '
                    '(from_date, to_date as YYYY-MM-DD) and/or class_id or class_name.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'month': {
                            'type': 'string',
                            'description': 'Calendar month YYYY-MM',
                        },
                        'from_date': {
                            'type': 'string',
                            'description': 'Start date YYYY-MM-DD (inclusive)',
                        },
                        'to_date': {
                            'type': 'string',
                            'description': 'End date YYYY-MM-DD (inclusive)',
                        },
                        'class_id': {'type': 'string'},
                        'class_name': {
                            'type': 'string',
                            'description': 'Partial class name match',
                        },
                    },
                    'required': [],
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_class_students',
                'description': 'List students enrolled in one of the teacher\'s classes.',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_id': {'type': 'string'},
                        'class_name': {'type': 'string'},
                    },
                    'required': [],
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_assignments',
                'description': 'List homework assignments, optionally for one class.',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_id': {'type': 'string'},
                        'class_name': {'type': 'string'},
                    },
                    'required': [],
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_pending_submissions',
                'description': (
                    'List student submissions that are submitted but not yet graded.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_id': {'type': 'string'},
                        'class_name': {'type': 'string'},
                        'limit': {
                            'type': 'integer',
                            'description': 'Max rows (default 20)',
                        },
                    },
                    'required': [],
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'get_student_balances',
                'description': (
                    'Tuition/session balances for students in the teacher\'s classes.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_id': {'type': 'string'},
                        'class_name': {'type': 'string'},
                        'student_name': {
                            'type': 'string',
                            'description': 'Filter by partial student name',
                        },
                    },
                    'required': [],
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_pending_reschedules',
                'description': 'Pending student reschedule requests awaiting teacher approval.',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'limit': {'type': 'integer'},
                    },
                    'required': [],
                },
            },
        },
    ]


def _teacher_class_ids(teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'teacher_id', teacher_id
    ).execute()
    return [row['id'] for row in (result.data or [])]


def _class_map(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name, color, billing_mode, unit_price, code'
    ).in_('id', class_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _resolve_class_id(teacher_id, class_id=None, class_name=None):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return None, 'You have no classes yet.'

    if class_id:
        if class_id not in class_ids:
            return None, 'Class not found or not accessible.'
        return class_id, None

    if class_name:
        needle = class_name.strip().lower()
        classes = _class_map(class_ids)
        matches = [
            cid for cid, row in classes.items()
            if needle in (row.get('name') or '').lower()
        ]
        if not matches:
            return None, f'No class matching "{class_name}".'
        if len(matches) > 1:
            names = [classes[cid].get('name') for cid in matches[:5]]
            return None, (
                f'Multiple classes match "{class_name}": {", ".join(names)}. '
                'Ask the teacher to be more specific or pass class_id.'
            )
        return matches[0], None

    return None, None


def _parse_month(month_str):
    try:
        parsed = datetime.strptime(month_str, '%Y-%m')
        last_day = cal.monthrange(parsed.year, parsed.month)[1]
        return parsed.strftime('%Y-%m-01'), parsed.strftime(f'%Y-%m-{last_day:02d}')
    except (TypeError, ValueError):
        return None, None


def _validate_date(date_str):
    if not date_str:
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except (TypeError, ValueError):
        return False


def _display_title(session_row, class_name=''):
    title = (session_row.get('title') or '').strip()
    if title:
        return title
    return (class_name or '').strip() or 'Session'


def _trim_payload(data):
    text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) <= MAX_TOOL_RESULT_CHARS:
        return text
    return json.dumps({
        'error': 'Result too large; narrow filters (class, date range, or month).',
        'truncated_preview': text[:2000],
    }, ensure_ascii=False)


def _tool_list_my_classes(teacher_id, _args):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return {'classes': [], 'total': 0}

    classes = _class_map(class_ids)
    counts_result = supabase.table('class_enrollments').select(
        'class_id'
    ).in_('class_id', class_ids).execute()
    counts = {}
    for row in counts_result.data or []:
        cid = row['class_id']
        counts[cid] = counts.get(cid, 0) + 1

    items = []
    for cid in class_ids:
        row = classes.get(cid, {})
        items.append({
            'id': cid,
            'name': row.get('name') or '',
            'code': row.get('code') or '',
            'student_count': counts.get(cid, 0),
            'billing_mode': row.get('billing_mode') or 'per_session',
            'unit_price': row.get('unit_price') or 0,
        })
    items.sort(key=lambda r: (r['name'] or '').lower())
    return {'classes': items[:MAX_LIST_ITEMS], 'total': len(items)}


def _tool_list_sessions(teacher_id, args):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return {'sessions': [], 'total': 0}

    class_id, err = _resolve_class_id(
        teacher_id,
        class_id=args.get('class_id'),
        class_name=args.get('class_name'),
    )
    if err:
        return {'error': err}

    if class_id:
        class_ids = [class_id]

    month = (args.get('month') or '').strip()
    from_date = (args.get('from_date') or '').strip()
    to_date = (args.get('to_date') or '').strip()

    if not month and not from_date and not to_date:
        today = datetime.now(timezone.utc).date()
        month = today.strftime('%Y-%m')

    try:
        query = supabase.table('sessions').select('*').in_('class_id', class_ids)

        if month:
            start, end = _parse_month(month)
            if not start:
                return {'error': 'month must be YYYY-MM'}
            query = query.gte('date', start).lte('date', end)

        if from_date:
            if not _validate_date(from_date):
                return {'error': 'from_date must be YYYY-MM-DD'}
            query = query.gte('date', from_date)
        if to_date:
            if not _validate_date(to_date):
                return {'error': 'to_date must be YYYY-MM-DD'}
            query = query.lte('date', to_date)

        result = query.order('date').order('start_time').limit(MAX_LIST_ITEMS).execute()
    except Exception:
        return {'error': 'Failed to load sessions'}

    classes = _class_map(class_ids)
    sessions = []
    for row in result.data or []:
        class_name = (classes.get(row['class_id']) or {}).get('name', '')
        sessions.append({
            'id': row['id'],
            'class_id': row['class_id'],
            'class_name': class_name,
            'title': _display_title(row, class_name),
            'date': row['date'],
            'start_time': (row.get('start_time') or '')[:5],
            'end_time': (row.get('end_time') or '')[:5],
            'location': row.get('location') or '',
            'type': row.get('type') or 'one-time',
        })

    return {'sessions': sessions, 'total': len(sessions)}


def _tool_list_class_students(teacher_id, args):
    class_id, err = _resolve_class_id(
        teacher_id,
        class_id=args.get('class_id'),
        class_name=args.get('class_name'),
    )
    if err:
        return {'error': err}
    if not class_id:
        return {'error': 'class_id or class_name is required'}

    enrollments = supabase.table('class_enrollments').select(
        'student_id, joined_at'
    ).eq('class_id', class_id).execute().data or []

    if not enrollments:
        return {'students': [], 'total': 0, 'class_id': class_id}

    student_ids = [row['student_id'] for row in enrollments]
    users = supabase.table('users').select(
        'id, display_name, grade'
    ).in_('id', student_ids).execute().data or []
    users_by_id = {row['id']: row for row in users}

    students = []
    for row in enrollments:
        user = users_by_id.get(row['student_id'], {})
        name = (user.get('display_name') or '').strip() or 'Student'
        students.append({
            'id': row['student_id'],
            'display_name': name,
            'grade': user.get('grade') or '',
            'joined_at': row.get('joined_at'),
        })
    students.sort(key=lambda r: r['display_name'].lower())
    class_name = (_class_map([class_id]).get(class_id) or {}).get('name', '')
    return {
        'class_id': class_id,
        'class_name': class_name,
        'students': students[:MAX_LIST_ITEMS],
        'total': len(students),
    }


def _tool_list_assignments(teacher_id, args):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return {'assignments': [], 'total': 0}

    class_id, err = _resolve_class_id(
        teacher_id,
        class_id=args.get('class_id'),
        class_name=args.get('class_name'),
    )
    if err:
        return {'error': err}
    if class_id:
        class_ids = [class_id]

    result = supabase.table('assignments').select('*').in_(
        'class_id', class_ids
    ).order('due_date', desc=False).limit(MAX_LIST_ITEMS).execute()

    classes = _class_map(class_ids)
    items = []
    for row in result.data or []:
        class_name = (classes.get(row['class_id']) or {}).get('name', '')
        items.append({
            'id': row['id'],
            'class_id': row['class_id'],
            'class_name': class_name,
            'title': row.get('title') or '',
            'due_date': row.get('due_date'),
        })
    return {'assignments': items, 'total': len(items)}


def _tool_list_pending_submissions(teacher_id, args):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return {'pending_submissions': [], 'total': 0}

    class_id, err = _resolve_class_id(
        teacher_id,
        class_id=args.get('class_id'),
        class_name=args.get('class_name'),
    )
    if err:
        return {'error': err}
    if class_id:
        class_ids = [class_id]

    limit = args.get('limit') or 20
    try:
        limit = min(max(int(limit), 1), MAX_LIST_ITEMS)
    except (TypeError, ValueError):
        limit = 20

    total, items = _teacher_pending_grades(class_ids, limit=limit)
    pending = [
        {
            'assignment_title': item['assignment_title'],
            'class_name': item['class_name'],
            'student_name': item['student_name'],
            'submitted_at': item.get('submitted_at'),
        }
        for item in items
    ]
    return {
        'pending_submissions': pending,
        'total': total,
        'shown': len(pending),
    }


def _tool_get_student_balances(teacher_id, args):
    class_id, err = _resolve_class_id(
        teacher_id,
        class_id=args.get('class_id'),
        class_name=args.get('class_name'),
    )
    if err:
        return {'error': err}

    name_query = (args.get('student_name') or '').strip() or None
    rows = _teacher_balance_rows(teacher_id, class_id, name_query)
    balances = [
        {
            'student_name': row['student_name'],
            'class_name': row['class_name'],
            'balance': row['balance'],
            'unit': row['unit'],
            'status': row.get('status') or '',
        }
        for row in rows[:MAX_LIST_ITEMS]
    ]
    return {'balances': balances, 'total': len(rows)}


def _tool_list_pending_reschedules(teacher_id, args):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return {'requests': [], 'total': 0}

    limit = args.get('limit') or 20
    try:
        limit = min(max(int(limit), 1), MAX_LIST_ITEMS)
    except (TypeError, ValueError):
        limit = 20

    sessions_result = supabase.table('sessions').select('id').in_(
        'class_id', class_ids
    ).execute()
    session_ids = [row['id'] for row in (sessions_result.data or [])]
    if not session_ids:
        return {'requests': [], 'total': 0}

    result = supabase.table('reschedule_requests').select('*').in_(
        'session_id', session_ids
    ).eq('status', 'pending').order('created_at', desc=True).limit(limit).execute()

    rows = result.data or []
    session_map = {}
    if rows:
        sids = list({row['session_id'] for row in rows})
        sessions = supabase.table('sessions').select(
            'id, title, date, start_time, end_time, class_id'
        ).in_('id', sids).execute().data or []
        session_map = {row['id']: row for row in sessions}

    classes = _class_map(class_ids)
    student_ids = list({row['student_id'] for row in rows})
    users_by_id = {}
    if student_ids:
        users = supabase.table('users').select(
            'id, display_name'
        ).in_('id', student_ids).execute().data or []
        users_by_id = {row['id']: row for row in users}

    requests = []
    for row in rows:
        session = session_map.get(row['session_id'], {})
        class_name = (classes.get(session.get('class_id')) or {}).get('name', '')
        student = users_by_id.get(row['student_id'], {})
        requests.append({
            'id': row['id'],
            'student_name': (student.get('display_name') or '').strip() or 'Student',
            'class_name': class_name,
            'session_title': (session.get('title') or class_name or 'Session'),
            'session_date': session.get('date') or '',
            'session_start': (session.get('start_time') or '')[:5],
            'session_end': (session.get('end_time') or '')[:5],
            'proposed_date': row.get('proposed_date'),
            'proposed_start': (row.get('proposed_start') or '')[:5],
            'proposed_end': (row.get('proposed_end') or '')[:5],
            'reason': row.get('reason') or '',
            'created_at': row.get('created_at'),
        })

    return {'requests': requests, 'total': len(requests)}


def execute_tool(tool_name, arguments, teacher_id):
    """Run a read tool; returns JSON string for the model."""
    if not isinstance(arguments, dict):
        arguments = {}

    handlers = {
        'list_my_classes': _tool_list_my_classes,
        'list_sessions': _tool_list_sessions,
        'list_class_students': _tool_list_class_students,
        'list_assignments': _tool_list_assignments,
        'list_pending_submissions': _tool_list_pending_submissions,
        'get_student_balances': _tool_get_student_balances,
        'list_pending_reschedules': _tool_list_pending_reschedules,
    }

    handler = handlers.get(tool_name)
    if not handler:
        return _trim_payload({'error': f'Unknown tool: {tool_name}'})

    try:
        result = handler(teacher_id, arguments)
    except Exception as exc:
        result = {'error': str(exc) or 'Tool execution failed'}

    return _trim_payload(result)
