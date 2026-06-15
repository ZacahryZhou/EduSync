from flask import Blueprint, g, jsonify, request

from app.extensions import supabase
from app.middleware.auth import require_auth, require_role, _load_user_record
from app.services.balances import (
    apply_topup,
    billing_unit,
    friendly_balance_error,
    serialize_balance_row,
)

tuition_bp = Blueprint('tuition', __name__)


def _teacher_class_ids(teacher_id):
    result = supabase.table('class_groups').select('id').eq(
        'teacher_id', teacher_id
    ).execute()
    return [row['id'] for row in (result.data or [])]


def _teacher_has_student(teacher_id, student_id):
    class_ids = _teacher_class_ids(teacher_id)
    if not class_ids:
        return False
    result = supabase.table('class_enrollments').select('id').eq(
        'student_id', student_id
    ).in_('class_id', class_ids).limit(1).execute()
    return bool(result.data)


def _student_class_ids(student_id):
    result = supabase.table('class_enrollments').select('class_id').eq(
        'student_id', student_id
    ).execute()
    return [row['class_id'] for row in (result.data or [])]


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


def _teacher_balance_rows(teacher_id, class_filter=None):
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

    student_ids = list({row['student_id'] for row in enrollments})
    users_by_id = _load_users(student_ids)
    balances_by_key = _load_balances(student_ids, class_ids)

    rows = []
    for enrollment in enrollments:
        student_id = enrollment['student_id']
        class_id = enrollment['class_id']
        class_row = classes_by_id.get(class_id, {})
        user = users_by_id.get(student_id, {})
        unit = billing_unit(class_row.get('billing_mode'))
        saved = balances_by_key.get((student_id, class_id))
        balance = float((saved or {}).get('balance') or 0)
        rows.append(serialize_balance_row(
            student_id=student_id,
            student_name=user.get('display_name') or user.get('email') or 'Student',
            student_email=user.get('email') or '',
            class_id=class_id,
            class_name=class_row.get('name') or '',
            billing_mode=class_row.get('billing_mode') or 'per_session',
            unit_price=class_row.get('unit_price') or 0,
            balance=balance,
            unit=unit,
        ))

    rows.sort(key=lambda row: (
        row['class_name'].lower(),
        row['student_name'].lower(),
    ))
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


def _serialize_transaction(row, users_by_id, classes_by_id):
    recorder_id = row.get('recorded_by')
    if not recorder_id:
        recorded_by_name = 'System'
    else:
        recorder = users_by_id.get(recorder_id, {})
        recorded_by_name = recorder.get('display_name') or recorder.get('email') or 'Staff'

    student = users_by_id.get(row.get('student_id') or '', {})
    class_row = classes_by_id.get(row.get('class_id') or '', {})

    return {
        'id': row.get('id'),
        'student_id': row.get('student_id'),
        'student_name': (student or {}).get('display_name') or (student or {}).get('email') or '',
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
    }


@tuition_bp.route('/api/tuition/balances', methods=['GET'])
@require_auth
def list_balances():
    user = _load_user_record()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = (user.get('role') or '').strip().lower()
    class_filter = (request.args.get('class_id') or '').strip() or None

    try:
        if role == 'teacher':
            balances = _teacher_balance_rows(user['id'], class_filter)
        elif role == 'student':
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
    limit = min(max(int(request.args.get('limit', 50)), 1), 200)

    if role == 'teacher':
        allowed_class_ids = _teacher_class_ids(user['id'])
        if class_filter and class_filter not in allowed_class_ids:
            return jsonify({'error': 'Class not found'}), 404
        if student_filter and not _teacher_has_student(user['id'], student_filter):
            return jsonify({'error': 'Student not found'}), 404
    elif role == 'student':
        student_filter = user['id']
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
            query = query.eq('student_id', student_filter)
        if class_filter:
            query = query.eq('class_id', class_filter)
        elif role == 'teacher' and allowed_class_ids:
            query = query.in_('class_id', allowed_class_ids)
        result = query.execute()
    except Exception as exc:
        return jsonify({'error': friendly_balance_error(exc)}), 500

    rows = result.data or []
    user_ids = list({
        uid for row in rows
        for uid in (row.get('student_id'), row.get('recorded_by'))
        if uid
    })
    class_ids = list({row.get('class_id') for row in rows if row.get('class_id')})
    users_by_id = _load_users(user_ids)
    classes_by_id = _load_classes(class_ids)

    transactions = [
        _serialize_transaction(row, users_by_id, classes_by_id)
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
    if not _teacher_has_student(teacher_id, student_id):
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
