"""Teacher invites students by email before they register; claim on sign-up."""

from datetime import datetime, timezone

from app.extensions import supabase
from app.services.balances import (
    delete_pending_billing_records,
    merge_pending_balance_into_student,
    reassign_pending_billing_records,
)
from app.services.student_accounts import (
    DEFAULT_STUDENT_PASSWORD,
    friendly_provision_error,
    initial_password_message,
    provision_student_account,
)
from app.services.notifications import create_notification

PENDING_STATUSES = frozenset({'pending', 'claimed', 'cancelled'})


def normalize_email(email):
    return (email or '').strip().lower()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def friendly_db_error(exc):
    message = str(exc)
    lower = message.lower()
    if 'does not exist' in lower or 'could not find' in lower or 'schema cache' in lower:
        if 'pending_enrollments' in lower:
            return (
                'Database table "pending_enrollments" is missing. '
                'Run backend/sql/create_pending_enrollments.sql in Supabase SQL Editor.'
            )
    return message or 'Database error'


def _find_student_by_email(email):
    norm = normalize_email(email)
    if not norm:
        return None
    result = supabase.table('users').select(
        'id, email, display_name, role, grade'
    ).ilike('email', norm).limit(5).execute()
    for row in result.data or []:
        if normalize_email(row.get('email')) == norm:
            if (row.get('role') or '').strip().lower() == 'student':
                return row
    return None


def _is_enrolled(student_id, class_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_id
    ).eq('student_id', student_id).limit(1).execute()
    return bool(result.data)


def _enroll_student_in_class(student_id, class_id):
    if _is_enrolled(student_id, class_id):
        return False
    supabase.table('class_enrollments').insert({
        'class_id': class_id,
        'student_id': student_id,
    }).execute()
    return True


def _open_assignments_for_class(class_id):
    result = supabase.table('assignments').select(
        'id, title, due_date'
    ).eq('class_id', class_id).order('created_at', desc=True).execute()
    return result.data or []


def _notify_class_joined(user_id, class_name, class_id):
    create_notification(
        user_id,
        'class_enrolled',
        f'Welcome to {class_name}',
        (
            f'You have been added to {class_name}. '
            'Open Assignments and Calendar to see what is due.'
        ),
        related_id=class_id,
    )


def _notify_open_assignments(user_id, class_name, assignments):
    for row in assignments[:10]:
        title = (row.get('title') or 'Assignment').strip()
        due = row.get('due_date')
        due_text = f' Due {due}.' if due else ''
        create_notification(
            user_id,
            'assignment_published',
            f'Assignment in {class_name}',
            f'{title}.{due_text}',
            related_id=row.get('id'),
        )


def _migrate_teacher_note(teacher_id, student_id, note):
    content = (note or '').strip()
    if not content:
        return
    try:
        existing = supabase.table('student_notes').select('id, content').eq(
            'teacher_id', teacher_id
        ).eq('student_id', student_id).limit(1).execute()
        if existing.data:
            current = (existing.data[0].get('content') or '').strip()
            if current:
                return
            supabase.table('student_notes').update({
                'content': content,
                'updated_at': _now_iso(),
            }).eq('teacher_id', teacher_id).eq(
                'student_id', student_id
            ).execute()
        else:
            supabase.table('student_notes').insert({
                'teacher_id': teacher_id,
                'student_id': student_id,
                'content': content,
            }).execute()
    except Exception:
        pass


def _apply_grade_if_missing(user_id, grade):
    value = (grade or '').strip()
    if not value:
        return
    try:
        user = supabase.table('users').select('grade').eq(
            'id', user_id
        ).limit(1).execute()
        if not user.data:
            return
        if (user.data[0].get('grade') or '').strip():
            return
        supabase.table('users').update({
            'grade': value,
        }).eq('id', user_id).execute()
    except Exception:
        pass


def cancel_pending_for_class_email(class_id, email):
    norm = normalize_email(email)
    if not norm:
        return
    try:
        rows = supabase.table('pending_enrollments').select('id, email').eq(
            'class_id', class_id
        ).eq('status', 'pending').execute()
        for row in rows.data or []:
            if normalize_email(row.get('email')) == norm:
                supabase.table('pending_enrollments').update({
                    'status': 'cancelled',
                    'cancelled_at': _now_iso(),
                }).eq('id', row['id']).execute()
    except Exception:
        pass


def remove_student_from_class(class_id, student_id):
    result = supabase.table('class_enrollments').select('id').eq(
        'class_id', class_id
    ).eq('student_id', student_id).limit(1).execute()
    if not result.data:
        return False, 'Student is not enrolled in this class'
    supabase.table('class_enrollments').delete().eq(
        'class_id', class_id
    ).eq('student_id', student_id).execute()
    return True, None


def cancel_pending_invite(invite_id, teacher_id):
    result = supabase.table('pending_enrollments').select(
        'id, teacher_id, status'
    ).eq('id', invite_id).limit(1).execute()
    if not result.data:
        return False, 'Invite not found'
    row = result.data[0]
    if row.get('teacher_id') != teacher_id:
        return False, 'Invite not found'
    if row.get('status') != 'pending':
        return False, 'Invite is no longer pending'
    supabase.table('pending_enrollments').update({
        'status': 'cancelled',
        'cancelled_at': _now_iso(),
    }).eq('id', invite_id).execute()
    delete_pending_billing_records(invite_id)
    return True, None


def create_class_invite(teacher_id, class_id, *, email, display_name, grade=None, teacher_note=None):
    norm = normalize_email(email)
    name = (display_name or '').strip()
    if not norm:
        return None, 'Email is required'
    if '@' not in norm or len(norm) > 320:
        return None, 'Invalid email address'
    if not name:
        return None, 'Display name is required'
    if len(name) > 200:
        return None, 'Display name is too long'

    grade_value = (grade or '').strip() or None
    note_value = (teacher_note or '').strip()
    if len(note_value) > 10000:
        return None, 'Note is too long (max 10000 characters)'

    existing_student = _find_student_by_email(norm)
    if existing_student:
        student_id = existing_student['id']
        if _is_enrolled(student_id, class_id):
            return None, 'This student is already in the class'
        _enroll_student_in_class(student_id, class_id)
        cancel_pending_for_class_email(class_id, norm)
        class_row = supabase.table('class_groups').select('name').eq(
            'id', class_id
        ).limit(1).execute()
        class_name = (class_row.data or [{}])[0].get('name') or 'your class'
        _migrate_teacher_note(teacher_id, student_id, note_value)
        _notify_class_joined(student_id, class_name, class_id)
        assignments = _open_assignments_for_class(class_id)
        _notify_open_assignments(student_id, class_name, assignments)
        return {
            'status': 'active',
            'student_id': student_id,
            'email': norm,
            'display_name': name,
            'message': 'Student already had an account and was added to the class.',
        }, None

    try:
        student_id, provision_status = provision_student_account(
            norm,
            name,
            grade=grade_value,
        )
    except RuntimeError as exc:
        return None, str(exc)
    except Exception as exc:
        return None, friendly_provision_error(exc)

    if _is_enrolled(student_id, class_id):
        return None, 'This student is already in the class'

    _enroll_student_in_class(student_id, class_id)
    cancel_pending_for_class_email(class_id, norm)

    pending_rows = supabase.table('pending_enrollments').select('id').eq(
        'email', norm
    ).eq('status', 'pending').execute()
    for pending_row in pending_rows.data or []:
        invite_id = pending_row['id']
        merge_pending_balance_into_student(invite_id, student_id, class_id)
        reassign_pending_billing_records(invite_id, student_id)
        supabase.table('pending_enrollments').update({
            'status': 'claimed',
            'claimed_user_id': student_id,
            'claimed_at': _now_iso(),
        }).eq('id', invite_id).execute()

    class_row = supabase.table('class_groups').select('name').eq(
        'id', class_id
    ).limit(1).execute()
    class_name = (class_row.data or [{}])[0].get('name') or 'your class'
    _migrate_teacher_note(teacher_id, student_id, note_value)
    _notify_class_joined(student_id, class_name, class_id)
    assignments = _open_assignments_for_class(class_id)
    _notify_open_assignments(student_id, class_name, assignments)

    if provision_status == 'existing':
        message = (
            'Student already had an account and was added to the class. '
            'They should log in with their existing password.'
        )
    else:
        message = initial_password_message()

    return {
        'status': 'active',
        'student_id': student_id,
        'email': norm,
        'display_name': name,
        'message': message,
        'initial_password': None if provision_status == 'existing' else DEFAULT_STUDENT_PASSWORD,
    }, None


def _serialize_pending_row(row, class_info=None):
    class_info = class_info or {}
    return {
        'id': row.get('id'),
        'class_id': row.get('class_id'),
        'class_name': class_info.get('name') or '',
        'class_color': class_info.get('color') or '#6366f1',
        'email': row.get('email') or '',
        'display_name': row.get('display_name') or '',
        'grade': (row.get('grade') or '').strip() or None,
        'teacher_note': row.get('teacher_note') or '',
        'status': row.get('status') or 'pending',
        'invited_at': row.get('invited_at'),
    }


def fetch_pending_for_classes(class_ids):
    if not class_ids:
        return []
    result = supabase.table('pending_enrollments').select(
        'id, class_id, email, display_name, grade, teacher_note, status, invited_at'
    ).in_('class_id', class_ids).eq('status', 'pending').execute()
    return result.data or []


def roster_pending_students(class_id):
    rows = fetch_pending_for_classes([class_id])
    return [
        {
            'id': f"pending:{row['id']}",
            'invite_id': row['id'],
            'display_name': row.get('display_name') or '',
            'email': row.get('email') or '',
            'joined_at': row.get('invited_at'),
            'status': 'pending',
            'grade': (row.get('grade') or '').strip() or None,
        }
        for row in rows
    ]


def claim_pending_enrollments(user_id, email):
    norm = normalize_email(email)
    if not norm or not user_id:
        return {'claimed_classes': 0, 'class_names': []}

    try:
        pending_result = supabase.table('pending_enrollments').select(
            'id, class_id, teacher_id, display_name, grade, teacher_note'
        ).eq('status', 'pending').execute()
    except Exception:
        return {'claimed_classes': 0, 'class_names': []}

    matching = [
        row for row in (pending_result.data or [])
        if normalize_email(row.get('email')) == norm
    ]
    if not matching:
        return {'claimed_classes': 0, 'class_names': []}

    class_ids = list({row['class_id'] for row in matching})
    classes_result = supabase.table('class_groups').select(
        'id, name'
    ).in_('id', class_ids).execute()
    classes_by_id = {row['id']: row for row in (classes_result.data or [])}

    claimed_names = []
    claimed_count = 0
    now_iso = _now_iso()

    for row in matching:
        class_id = row['class_id']
        class_name = (classes_by_id.get(class_id) or {}).get('name') or 'your class'
        enrolled = _enroll_student_in_class(user_id, class_id)
        merge_pending_balance_into_student(row['id'], user_id, class_id)
        reassign_pending_billing_records(row['id'], user_id)
        supabase.table('pending_enrollments').update({
            'status': 'claimed',
            'claimed_user_id': user_id,
            'claimed_at': now_iso,
        }).eq('id', row['id']).execute()

        if enrolled:
            claimed_count += 1
            claimed_names.append(class_name)
            _apply_grade_if_missing(user_id, row.get('grade'))
            _migrate_teacher_note(
                row.get('teacher_id'), user_id, row.get('teacher_note')
            )
            merge_pending_balance_into_student(row['id'], user_id, class_id)
            reassign_pending_billing_records(row['id'], user_id)
            _notify_class_joined(user_id, class_name, class_id)
            assignments = _open_assignments_for_class(class_id)
            _notify_open_assignments(user_id, class_name, assignments)

    return {
        'claimed_classes': claimed_count,
        'class_names': claimed_names,
    }
