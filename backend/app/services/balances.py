"""Balance top-ups and session deductions."""

from __future__ import annotations

from datetime import datetime, timezone

from app.extensions import supabase

DEDUCTABLE_ATTENDANCE = frozenset({'present', 'late'})


def friendly_balance_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'student_balances' in lower or 'balance_transactions' in lower:
            return (
                'Billing tables are missing. '
                'Run backend/sql/create_balances.sql in Supabase SQL Editor.'
            )
    if 'duplicate key' in lower or 'unique constraint' in lower:
        return 'Deduction already recorded for this session'
    return message or 'Database error'


def billing_unit(billing_mode):
    return 'hours' if billing_mode == 'per_hour' else 'sessions'


def compute_status(balance):
    value = float(balance)
    if value <= 0:
        return 'zero'
    if value <= 2:
        return 'low'
    return 'sufficient'


def session_duration_hours(start_time, end_time):
    def to_minutes(value):
        parts = str(value or '0:0').split(':')
        hours = int(parts[0] or 0)
        minutes = int(parts[1] or 0) if len(parts) > 1 else 0
        return hours * 60 + minutes

    minutes = to_minutes(end_time) - to_minutes(start_time)
    return round(max(minutes, 0) / 60, 2)


def deduction_amount(class_row, session_row):
    if class_row.get('billing_mode') == 'per_hour':
        hours = session_duration_hours(
            session_row.get('start_time'),
            session_row.get('end_time'),
        )
        return hours if hours > 0 else 1.0
    return 1.0


def _get_class_row(class_id):
    result = supabase.table('class_groups').select(
        'id, name, billing_mode, unit_price, teacher_id'
    ).eq('id', class_id).limit(1).execute()
    if not result.data:
        return None
    return result.data[0]


def get_or_create_balance(student_id, class_id, unit):
    result = supabase.table('student_balances').select('*').eq(
        'student_id', student_id
    ).eq('class_id', class_id).limit(1).execute()
    if result.data:
        return result.data[0]

    created = supabase.table('student_balances').insert({
        'student_id': student_id,
        'class_id': class_id,
        'balance': 0,
        'unit': unit,
    }).execute()
    return created.data[0]


def _update_balance(balance_id, new_balance):
    now_iso = datetime.now(timezone.utc).isoformat()
    result = supabase.table('student_balances').update({
        'balance': new_balance,
        'updated_at': now_iso,
    }).eq('id', balance_id).execute()
    return result.data[0] if result.data else None


def _insert_transaction(
    *,
    student_id,
    class_id,
    tx_type,
    amount,
    unit,
    balance_after,
    comment=None,
    recorded_by=None,
    session_id=None,
):
    payload = {
        'student_id': student_id,
        'class_id': class_id,
        'session_id': session_id,
        'type': tx_type,
        'amount': amount,
        'unit': unit,
        'balance_after': balance_after,
        'comment': comment,
        'recorded_by': recorded_by,
    }
    result = supabase.table('balance_transactions').insert(payload).execute()
    return result.data[0] if result.data else payload


def _deduction_exists(session_id, student_id):
    result = supabase.table('balance_transactions').select('id').eq(
        'session_id', session_id
    ).eq('student_id', student_id).eq('type', 'deduction').limit(1).execute()
    return bool(result.data)


def apply_topup(student_id, class_id, amount, comment, recorded_by_id):
    class_row = _get_class_row(class_id)
    if not class_row:
        raise ValueError('Class not found')

    value = float(amount)
    if value <= 0:
        raise ValueError('amount must be greater than 0')

    unit = billing_unit(class_row.get('billing_mode'))
    balance_row = get_or_create_balance(student_id, class_id, unit)
    current = float(balance_row.get('balance') or 0)
    new_balance = round(current + value, 2)

    _update_balance(balance_row['id'], new_balance)
    tx = _insert_transaction(
        student_id=student_id,
        class_id=class_id,
        tx_type='topup',
        amount=value,
        unit=unit,
        balance_after=new_balance,
        comment=(comment or '').strip() or None,
        recorded_by=recorded_by_id,
    )

    return {
        'student_id': student_id,
        'class_id': class_id,
        'balance': new_balance,
        'unit': unit,
        'status': compute_status(new_balance),
        'transaction': tx,
    }


def apply_session_deductions(session_row, attendance_records):
    """Deduct balances for present/late students once per session."""
    class_id = session_row.get('class_id')
    session_id = session_row.get('id')
    if not class_id or not session_id:
        return []

    class_row = _get_class_row(class_id)
    if not class_row:
        return []

    unit = billing_unit(class_row.get('billing_mode'))
    amount = deduction_amount(class_row, session_row)
    applied = []

    for record in attendance_records or []:
        status = (record.get('status') or '').strip().lower()
        student_id = record.get('student_id')
        if status not in DEDUCTABLE_ATTENDANCE or not student_id:
            continue
        if _deduction_exists(session_id, student_id):
            continue

        balance_row = get_or_create_balance(student_id, class_id, unit)
        current = float(balance_row.get('balance') or 0)
        new_balance = round(current - amount, 2)

        try:
            _update_balance(balance_row['id'], new_balance)
            tx = _insert_transaction(
                student_id=student_id,
                class_id=class_id,
                session_id=session_id,
                tx_type='deduction',
                amount=amount,
                unit=unit,
                balance_after=new_balance,
                comment='Session completed',
                recorded_by=None,
            )
        except Exception as exc:
            raise RuntimeError(friendly_balance_error(exc)) from exc

        applied.append({
            'student_id': student_id,
            'amount': amount,
            'unit': unit,
            'balance_after': new_balance,
            'transaction_id': tx.get('id'),
        })

    return applied


def serialize_balance_row(
    *,
    student_id,
    student_name,
    student_email,
    class_id,
    class_name,
    billing_mode,
    unit_price,
    balance,
    unit,
):
    numeric_balance = float(balance or 0)
    return {
        'student_id': student_id,
        'student_name': student_name,
        'student_email': student_email,
        'class_id': class_id,
        'class_name': class_name,
        'billing_mode': billing_mode,
        'unit_price': float(unit_price or 0),
        'balance': numeric_balance,
        'unit': unit,
        'status': compute_status(numeric_balance),
    }
