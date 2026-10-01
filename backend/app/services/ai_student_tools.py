"""Read-only AI tools for students. All queries scoped to the student's own id."""

from datetime import datetime, timezone

from app.extensions import supabase
from app.blueprints.tuition import _student_balance_rows
from app.services.ai_tools import (
    MAX_LIST_ITEMS,
    _class_map,
    _display_title,
    _parse_month,
    _trim_payload,
    _validate_date,
)


def student_tool_definitions():
    """OpenAI-compatible tool schemas for the student assistant."""
    return [
        {
            'type': 'function',
            'function': {
                'name': 'list_my_classes',
                'description': 'List the classes this student is enrolled in.',
                'parameters': {'type': 'object', 'properties': {}},
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_sessions',
                'description': (
                    'List this student\'s sessions. Defaults to the current month. '
                    'Use month (YYYY-MM) or from_date/to_date (YYYY-MM-DD).'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_name': {'type': 'string', 'description': 'Filter by class name.'},
                        'month': {'type': 'string', 'description': 'YYYY-MM'},
                        'from_date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                        'to_date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    },
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_assignments',
                'description': (
                    'List this student\'s homework with due dates and whether it is '
                    'pending, submitted, graded, or overdue.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'class_name': {'type': 'string', 'description': 'Filter by class name.'},
                        'status': {
                            'type': 'string',
                            'enum': ['pending', 'submitted', 'graded', 'all'],
                            'description': 'Default: all.',
                        },
                    },
                },
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'get_my_balances',
                'description': 'Remaining tuition/session balance for each enrolled class.',
                'parameters': {'type': 'object', 'properties': {}},
            },
        },
        {
            'type': 'function',
            'function': {
                'name': 'list_my_reschedules',
                'description': 'This student\'s reschedule requests and their status.',
                'parameters': {'type': 'object', 'properties': {}},
            },
        },
    ]


def _student_class_ids(student_id):
    result = supabase.table('class_enrollments').select('class_id').eq(
        'student_id', student_id
    ).execute()
    return [row['class_id'] for row in (result.data or [])]


def _filter_by_class_name(class_ids, class_name):
    """Return (class_ids, error) narrowed by a class-name substring."""
    needle = (class_name or '').strip().lower()
    if not needle:
        return class_ids, None
    classes = _class_map(class_ids)
    matches = [
        cid for cid, row in classes.items()
        if needle in (row.get('name') or '').lower()
    ]
    if not matches:
        return None, f'No enrolled class matching "{class_name}".'
    return matches, None


def _tool_list_my_classes(student_id, _args):
    class_ids = _student_class_ids(student_id)
    if not class_ids:
        return {'classes': [], 'total': 0}
    classes = _class_map(class_ids)
    items = [
        {
            'name': (classes.get(cid) or {}).get('name') or '',
            'billing_mode': (classes.get(cid) or {}).get('billing_mode') or 'per_session',
        }
        for cid in class_ids
    ]
    items.sort(key=lambda r: r['name'].lower())
    return {'classes': items[:MAX_LIST_ITEMS], 'total': len(items)}


def _tool_list_sessions(student_id, args):
    class_ids = _student_class_ids(student_id)
    if not class_ids:
        return {'sessions': [], 'total': 0}
    class_ids, err = _filter_by_class_name(class_ids, args.get('class_name'))
    if err:
        return {'error': err}

    month = (args.get('month') or '').strip()
    from_date = (args.get('from_date') or '').strip()
    to_date = (args.get('to_date') or '').strip()
    if not month and not from_date and not to_date:
        month = datetime.now(timezone.utc).date().strftime('%Y-%m')

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
            'class_name': class_name,
            'title': _display_title(row, class_name),
            'date': row['date'],
            'start_time': (row.get('start_time') or '')[:5],
            'end_time': (row.get('end_time') or '')[:5],
            'location': row.get('location') or '',
            'has_meeting_link': bool(row.get('meeting_url')),
        })
    return {'sessions': sessions, 'total': len(sessions)}


def _tool_list_assignments(student_id, args):
    class_ids = _student_class_ids(student_id)
    if not class_ids:
        return {'assignments': [], 'total': 0}
    class_ids, err = _filter_by_class_name(class_ids, args.get('class_name'))
    if err:
        return {'error': err}

    status_filter = (args.get('status') or 'all').strip().lower()
    try:
        rows = supabase.table('assignments').select('*').in_(
            'class_id', class_ids
        ).order('due_date').limit(100).execute().data or []
        subs = {}
        if rows:
            sub_rows = supabase.table('assignment_submissions').select(
                'assignment_id, grade, feedback, submitted_at'
            ).eq('student_id', student_id).in_(
                'assignment_id', [r['id'] for r in rows]
            ).execute().data or []
            subs = {s['assignment_id']: s for s in sub_rows}
    except Exception:
        return {'error': 'Failed to load assignments'}

    classes = _class_map(class_ids)
    today = datetime.now(timezone.utc).date().isoformat()
    items = []
    for row in rows:
        sub = subs.get(row['id'])
        if not sub:
            status = 'pending'
        elif sub.get('grade') is None:
            status = 'submitted'
        else:
            status = 'graded'
        if status_filter in ('pending', 'submitted', 'graded') and status != status_filter:
            continue
        due = (row.get('due_date') or '')[:10]
        items.append({
            'class_name': (classes.get(row['class_id']) or {}).get('name', ''),
            'title': row.get('title') or '',
            'description': (row.get('description') or '')[:300],
            'due_date': row.get('due_date'),
            'status': status,
            'overdue': status == 'pending' and bool(due) and due < today,
            'grade': (sub or {}).get('grade'),
            'feedback': ((sub or {}).get('feedback') or '')[:300],
        })
    return {'assignments': items[:MAX_LIST_ITEMS], 'total': len(items)}


def _tool_get_my_balances(student_id, _args):
    rows = _student_balance_rows(student_id)
    return {
        'balances': [
            {
                'class_name': r.get('class_name'),
                'balance': r.get('balance'),
                'unit': r.get('unit'),
                'billing_mode': r.get('billing_mode'),
            }
            for r in rows
        ],
        'total': len(rows),
    }


def _tool_list_my_reschedules(student_id, _args):
    rows = supabase.table('reschedule_requests').select('*').eq(
        'student_id', student_id
    ).order('created_at', desc=True).limit(20).execute().data or []
    if not rows:
        return {'requests': [], 'total': 0}

    sessions = supabase.table('sessions').select('*').in_(
        'id', [r['session_id'] for r in rows]
    ).execute().data or []
    session_map = {s['id']: s for s in sessions}
    classes = _class_map(list({s['class_id'] for s in sessions}))

    requests = []
    for row in rows:
        session = session_map.get(row['session_id'], {})
        class_name = (classes.get(session.get('class_id')) or {}).get('name', '')
        requests.append({
            'class_name': class_name,
            'session_date': session.get('date') or '',
            'session_start': (session.get('start_time') or '')[:5],
            'proposed_date': row.get('proposed_date'),
            'proposed_start': (row.get('proposed_start') or '')[:5],
            'proposed_end': (row.get('proposed_end') or '')[:5],
            'status': row.get('status') or 'pending',
            'teacher_response': row.get('teacher_response') or '',
        })
    return {'requests': requests, 'total': len(requests)}


def execute_student_tool(tool_name, arguments, student_id):
    """Run a student read tool; returns JSON string for the model."""
    if not isinstance(arguments, dict):
        arguments = {}

    handlers = {
        'list_my_classes': _tool_list_my_classes,
        'list_sessions': _tool_list_sessions,
        'list_assignments': _tool_list_assignments,
        'get_my_balances': _tool_get_my_balances,
        'list_my_reschedules': _tool_list_my_reschedules,
    }
    handler = handlers.get(tool_name)
    if not handler:
        return _trim_payload({'error': f'Unknown tool: {tool_name}'})

    try:
        result = handler(student_id, arguments)
    except Exception as exc:
        result = {'error': str(exc) or 'Tool execution failed'}
    return _trim_payload(result)
