from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.balances import (
    apply_topup,
    billing_unit,
    friendly_balance_error,
    serialize_balance_row,
)
from app.services.pending_enrollments import fetch_pending_for_classes
from app.services.roster_ids import is_pending_roster_id, parse_roster_student_id, roster_student_id

tuition_bp = Blueprint('tuition', __name__)


def _teacher_class_ids(teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'teacher_id', teacher_id
    ).execute()
    return [row['id'] for row in (result.data or [])]


def _teacher_has_student(teacher_id, student_id, class_id=None):
    if is_pending_roster_id(student_id):
        return _teacher_has_pending_student(teacher_id, student_id, class_id)
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return False
    if class_id and class_id not in class_ids:
        return False
    query = supabase.table('class_enrollments').select('id').eq(
        'student_id', student_id
    )
    if class_id:
        query = query.eq('class_id', class_id)
    else:
        query = query.in_('class_id', class_ids)
    result = query.limit(1).execute()
    return bool(result.data)


def _teacher_has_pending_student(teacher_id, roster_id, class_id=None):
    _, pending_id = parse_roster_student_id(roster_id)
    if not pending_id:
        return False
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return False
    if class_id and class_id not in class_ids:
        return False
    query = supabase.table('pending_enrollments').select('id').eq(
        'id', pending_id
    ).eq('teacher_id', teacher_id).eq('status', 'pending')
    if class_id:
        query = query.eq('class_id', class_id)
    else:
        query = query.in_('class_id', class_ids)
    result = query.limit(1).execute()
    return bool(result.data)


def _student_class_ids(student_id):
    result = supabase.table('class_enrollments').select('class_id').eq(
        'student_id', student_id
    ).execute()
    return [row['class_id'] for row in (result.data or [])]


def _matches_name_query(row, query):
    if not query:
        return True
    needle = query.strip().lower()
    if not needle:
        return True
    haystack = f"{row.get('student_name') or ''} {row.get('student_email') or ''}".lower()
    return needle in haystack


def _teacher_matching_student_ids(teacher_id, query):
    if not query or not query.strip():
        return None
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return []
    enrollments = supabase.table('class_enrollments').select(
        'student_id'
    ).in_('class_id', class_ids).execute().data or []
    student_ids = list({row['student_id'] for row in enrollments})
    users_by_id = _load_users(student_ids)
    needle = query.strip().lower()
    matching = []
    for student_id in student_ids:
        user = users_by_id.get(student_id, {})
        haystack = (
            f"{user.get('display_name') or ''} {user.get('email') or ''}"
        ).lower()
        if needle in haystack:
            matching.append(student_id)

    pending_rows = fetch_pending_for_classes(class_ids)
    for row in pending_rows:
        haystack = (
            f"{row.get('display_name') or ''} {row.get('email') or ''}"
        ).lower()
        if needle in haystack:
            matching.append(roster_student_id(pending_enrollment_id=row['id']))
    return matching


def _parse_date_bound(value, *, end_of_day=False):
    text = (value or '').strip()
    if not text:
        return None
    if len(text) == 10:
        return f'{text}T23:59:59' if end_of_day else f'{text}T00:00:00'
    return text

def _load_classes(class_ids):
    if not class_ids:
        return {}
    result = supabase.table('class_groups').select(
        'id, name, billing_mode, unit_price, teacher_id'
    ).in_('id', class_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _load_users(user_ids):
    if not user_ids:
        return {}
    result = supabase.table('users').select(
        'id, display_name, email'
    ).in_('id', user_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _load_balances_for_roster(roster_keys, class_ids):
    """roster_keys: list of (student_id|None, pending_id|None, roster_id str)"""
    if not roster_keys or not class_ids:
        return {}

    enrolled_ids = [key[0] for key in roster_keys if key[0]]
    pending_ids = [key[1] for key in roster_keys if key[1]]
    keyed = {}

    if enrolled_ids:
        result = supabase.table('student_balances').select('*').in_(
            'student_id', enrolled_ids
        ).in_('class_id', class_ids).execute()
        for row in (result.data or []):
            roster_id = row.get('student_id')
            keyed[(roster_id, row['class_id'])] = row

    if pending_ids:
        try:
            result = supabase.table('student_balances').select('*').in_(
                'pending_enrollment_id', pending_ids
            ).in_('class_id', class_ids).execute()
            for row in (result.data or []):
                roster_id = roster_student_id(
                    pending_enrollment_id=row.get('pending_enrollment_id')
                )
                keyed[(roster_id, row['class_id'])] = row
        except Exception:
            pass

    return keyed


def _load_balances(student_ids, class_ids):
    if not student_ids or not class_ids:
        return {}
    result = supabase.table('student_balances').select('*').in_(
        'student_id', student_ids
    ).in_('class_id', class_ids).execute()
    keyed = {}
    for row in (result.data or []):
        keyed[(row['student_id'], row['class_id'])] = row
    return keyed


def _teacher_balance_rows(teacher_id, class_filter=None, name_query=None):
    class_ids = _teacher_class_ids(teacher_id)
    if class_filter:
        if class_filter not in class_ids:
            return []
        class_ids = [class_filter]
    if not class_ids:
        return []

    classes_by_id = _load_classes(class_ids)
    enrollments = supabase.table('class_enrollments').select(
        'student_id, class_id'
    ).in_('class_id', class_ids).execute().data or []

    pending_rows = fetch_pending_for_classes(class_ids)

    roster_entries = []
    for enrollment in enrollments:
        roster_entries.append({
            'roster_id': enrollment['student_id'],
            'student_id': enrollment['student_id'],
            'pending_id': None,
            'class_id': enrollment['class_id'],
            'student_name': '',
            'student_email': '',
            'is_pending': False,
        })
    for row in pending_rows:
        roster_entries.append({
            'roster_id': roster_student_id(pending_enrollment_id=row['id']),
            'student_id': None,
            'pending_id': row['id'],
            'class_id': row['class_id'],
            'student_name': row.get('display_name') or '',
            'student_email': row.get('email') or '',
            'is_pending': True,
        })

    student_ids = list({entry['student_id'] for entry in roster_entries if entry['student_id']})
    users_by_id = _load_users(student_ids)
    roster_keys = [
        (entry['student_id'], entry['pending_id'], entry['roster_id'])
        for entry in roster_entries
    ]
    balances_by_key = _load_balances_for_roster(roster_keys, class_ids)

    rows = []
    for entry in roster_entries:
        roster_id = entry['roster_id']
        class_id = entry['class_id']
        class_row = classes_by_id.get(class_id, {})
        if entry['is_pending']:
            student_name = entry['student_name'] or entry['student_email'] or 'Invited student'
            student_email = entry['student_email']
        else:
            user = users_by_id.get(entry['student_id'], {})
            student_name = user.get('display_name') or user.get('email') or 'Student'
            student_email = user.get('email') or ''
        unit = billing_unit(class_row.get('billing_mode'))
        saved = balances_by_key.get((roster_id, class_id))
        balance = float((saved or {}).get('balance') or 0)
        rows.append(serialize_balance_row(
            student_id=roster_id,
            student_name=student_name,
            student_email=student_email,
            class_id=class_id,
            class_name=class_row.get('name') or '',
            billing_mode=class_row.get('billing_mode') or 'per_session',
            unit_price=class_row.get('unit_price') or 0,
            balance=balance,
            unit=unit,
            is_pending=entry['is_pending'],
        ))

    rows.sort(key=lambda row: (
        row['class_name'].lower(),
        row['student_name'].lower(),
    ))
    if name_query:
        rows = [row for row in rows if _matches_name_query(row, name_query)]
    return rows


def _student_balance_rows(student_id):
    class_ids = _student_class_ids(student_id)
    if not class_ids:
        return []

    classes_by_id = _load_classes(class_ids)
    balances_by_key = _load_balances([student_id], class_ids)
    user = _load_users([student_id]).get(student_id, {})
    student_name = user.get('display_name') or user.get('email') or 'Student'

    rows = []
    for class_id in class_ids:
        class_row = classes_by_id.get(class_id, {})
        unit = billing_unit(class_row.get('billing_mode'))
        saved = balances_by_key.get((student_id, class_id))
        balance = float((saved or {}).get('balance') or 0)
        rows.append(serialize_balance_row(
            student_id=student_id,
            student_name=student_name,
            student_email=user.get('email') or '',
            class_id=class_id,
            class_name=class_row.get('name') or '',
            billing_mode=class_row.get('billing_mode') or 'per_session',
            unit_price=class_row.get('unit_price') or 0,
            balance=balance,
            unit=unit,
        ))

    rows.sort(key=lambda row: row['class_name'].lower())
    return rows


def _load_pending_invites(pending_ids):
    if not pending_ids:
        return {}
    result = supabase.table('pending_enrollments').select(
        'id, display_name, email'
    ).in_('id', pending_ids).execute()
    return {row['id']: row for row in (result.data or [])}


def _serialize_transaction(row, users_by_id, classes_by_id, pending_by_id=None):
    pending_by_id = pending_by_id or {}
    recorder_id = row.get('recorded_by')
    if not recorder_id:
        recorded_by_name = 'System'
    else:
        recorder = users_by_id.get(recorder_id, {})
        recorded_by_name = recorder.get('display_name') or recorder.get('email') or 'Staff'

    pending_id = row.get('pending_enrollment_id')
    if pending_id:
        pending = pending_by_id.get(pending_id, {})
        student_name = pending.get('display_name') or pending.get('email') or ''
        roster_id = roster_student_id(pending_enrollment_id=pending_id)
    else:
        student = users_by_id.get(row.get('student_id') or '', {})
        student_name = (student or {}).get('display_name') or (student or {}).get('email') or ''
        roster_id = row.get('student_id')

    class_row = classes_by_id.get(row.get('class_id') or '', {})

    return {
        'id': row.get('id'),
        'student_id': roster_id,
        'student_name': student_name,
        'class_id': row.get('class_id'),
        'class_name': (class_row or {}).get('name') or '',
        'session_id': row.get('session_id'),
        'type': row.get('type'),
        'amount': float(row.get('amount') or 0),
        'unit': row.get('unit'),
        'balance_after': float(row.get('balance_after') or 0),
        'comment': row.get('comment') or '',
        'recorded_by': row.get('recorded_by'),
        'recorded_by_name': recorded_by_name,
        'created_at': row.get('created_at'),
        'is_pending': bool(pending_id),
    }


@tuition_bp.route('/api/tuition/balances', methods=['GET'])
@require_auth
def list_balances():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    class_filter = (request.args.get('class_id') or '').strip() or None
    name_query = (request.args.get('q') or '').strip() or None

    try:
        if role == 'teacher':
            balances = _teacher_balance_rows(user['id'], class_filter, name_query)
        elif role == 'student':
            if name_query:
                name_query = None
            if class_filter and class_filter not in _student_class_ids(user['id']):
                return jsonify({'error': 'Class not found'}), 404
            balances = _student_balance_rows(user['id'])
            if class_filter:
                balances = [row for row in balances if row['class_id'] == class_filter]
        else:
            return jsonify({'error': 'Forbidden'}), 403
    except Exception as exc:
        return jsonify({'error': friendly_balance_error(exc)}), 500

    return jsonify({'balances': balances}), 200


@tuition_bp.route('/api/tuition/transactions', methods=['GET'])
@require_auth
def list_transactions():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    student_filter = (request.args.get('student_id') or '').strip() or None
    class_filter = (request.args.get('class_id') or '').strip() or None
    name_query = (request.args.get('q') or '').strip() or None
    from_date = _parse_date_bound(request.args.get('from') or request.args.get('from_date'))
    to_date = _parse_date_bound(
        request.args.get('to') or request.args.get('to_date'),
        end_of_day=True,
    )
    limit = min(max(int(request.args.get('limit', 50)), 1), 200)
    matching_student_ids = None

    if role == 'teacher':
        allowed_class_ids = _teacher_class_ids(user['id'])
        if class_filter and class_filter not in allowed_class_ids:
            return jsonify({'error': 'Class not found'}), 404
        if student_filter and not _teacher_has_student(user['id'], student_filter):
            return jsonify({'error': 'Student not found'}), 404
        matching_student_ids = _teacher_matching_student_ids(user['id'], name_query)
        if matching_student_ids is not None and not matching_student_ids:
            return jsonify({'transactions': []}), 200
        if matching_student_ids is not None and student_filter:
            if student_filter not in matching_student_ids:
                return jsonify({'transactions': []}), 200
    elif role == 'student':
        if student_filter and student_filter != user['id']:
            return jsonify({'error': 'Forbidden'}), 403
        student_filter = user['id']
        name_query = None
        allowed_class_ids = _student_class_ids(user['id'])
        if class_filter and class_filter not in allowed_class_ids:
            return jsonify({'error': 'Class not found'}), 404
    else:
        return jsonify({'error': 'Forbidden'}), 403

    try:
        query = supabase.table('balance_transactions').select('*').order(
            'created_at', desc=True
        ).limit(limit)
        if student_filter:
            student_uuid, pending_id = parse_roster_student_id(student_filter)
            if pending_id:
                query = query.eq('pending_enrollment_id', pending_id)
            else:
                query = query.eq('student_id', student_filter)
        elif role == 'teacher' and matching_student_ids is not None:
            enrolled_ids = [
                sid for sid in matching_student_ids if not is_pending_roster_id(sid)
            ]
            pending_ids = [
                parse_roster_student_id(sid)[1]
                for sid in matching_student_ids
                if is_pending_roster_id(sid)
            ]
            pending_ids = [pid for pid in pending_ids if pid]
            if not enrolled_ids and not pending_ids:
                return jsonify({'transactions': []}), 200
            if enrolled_ids and pending_ids:
                enrolled_result = query.in_('student_id', enrolled_ids).execute()
                pending_query = supabase.table('balance_transactions').select('*').order(
                    'created_at', desc=True
                ).limit(limit).in_('pending_enrollment_id', pending_ids)
                if class_filter:
                    pending_query = pending_query.eq('class_id', class_filter)
                elif allowed_class_ids:
                    pending_query = pending_query.in_('class_id', allowed_class_ids)
                if from_date:
                    pending_query = pending_query.gte('created_at', from_date)
                if to_date:
                    pending_query = pending_query.lte('created_at', to_date)
                pending_result = pending_query.execute()
                combined = (enrolled_result.data or []) + (pending_result.data or [])
                combined.sort(key=lambda row: row.get('created_at') or '', reverse=True)
                result_data = combined[:limit]
                rows = result_data
                user_ids = list({
                    uid for row in rows
                    for uid in (row.get('student_id'), row.get('recorded_by'))
                    if uid
                })
                pending_ids_in_rows = list({
                    row.get('pending_enrollment_id')
                    for row in rows
                    if row.get('pending_enrollment_id')
                })
                class_ids = list({row.get('class_id') for row in rows if row.get('class_id')})
                users_by_id = _load_users(user_ids)
                pending_by_id = _load_pending_invites(pending_ids_in_rows)
                classes_by_id = _load_classes(class_ids)
                transactions = [
                    _serialize_transaction(row, users_by_id, classes_by_id, pending_by_id)
                    for row in rows
                ]
                return jsonify({'transactions': transactions}), 200
            if enrolled_ids:
                query = query.in_('student_id', enrolled_ids)
            else:
                query = query.in_('pending_enrollment_id', pending_ids)
        if class_filter:
            query = query.eq('class_id', class_filter)
        elif role == 'teacher' and allowed_class_ids:
            query = query.in_('class_id', allowed_class_ids)
        if from_date:
            query = query.gte('created_at', from_date)
        if to_date:
            query = query.lte('created_at', to_date)
        result = query.execute()
    except Exception as exc:
        return jsonify({'error': friendly_balance_error(exc)}), 500

    rows = result.data or []
    user_ids = list({
        uid for row in rows
        for uid in (row.get('student_id'), row.get('recorded_by'))
        if uid
    })
    pending_ids = list({
        row.get('pending_enrollment_id') for row in rows if row.get('pending_enrollment_id')
    })
    class_ids = list({row.get('class_id') for row in rows if row.get('class_id')})
    users_by_id = _load_users(user_ids)
    pending_by_id = _load_pending_invites(pending_ids)
    classes_by_id = _load_classes(class_ids)

    transactions = [
        _serialize_transaction(row, users_by_id, classes_by_id, pending_by_id)
        for row in rows
    ]
    return jsonify({'transactions': transactions}), 200


@tuition_bp.route('/api/tuition/topup', methods=['POST'])
@require_role('teacher')
def record_topup():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    student_id = data.get('student_id')
    class_id = data.get('class_id')
    comment = (data.get('comment') or '').strip()

    if not student_id or not class_id:
        return jsonify({'error': 'student_id and class_id are required'}), 400

    teacher_id = g.current_user.id
    if class_id not in _teacher_class_ids(teacher_id):
        return jsonify({'error': 'Class not found'}), 404
    if not _teacher_has_student(teacher_id, student_id, class_id):
        return jsonify({'error': 'Student not found in this class'}), 404

    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'error': 'amount must be a number'}), 400

    if amount <= 0:
        return jsonify({'error': 'amount must be greater than 0'}), 400

    try:
        result = apply_topup(
            student_id,
            class_id,
            amount,
            comment,
            teacher_id,
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'error': friendly_balance_error(exc)}), 500

    tx = result.get('transaction') or {}
    return jsonify({
        'balance': {
            'student_id': result['student_id'],
            'class_id': result['class_id'],
            'balance': result['balance'],
            'unit': result['unit'],
            'status': result['status'],
        },
        'transaction': {
            'id': tx.get('id'),
            'type': 'topup',
            'amount': float(tx.get('amount') or amount),
            'unit': result['unit'],
            'balance_after': result['balance'],
            'comment': comment or None,
        },
    }), 201
