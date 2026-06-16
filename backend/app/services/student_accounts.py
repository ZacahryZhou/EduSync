"""Create or sync student login accounts (teacher-initiated)."""

from __future__ import annotations

from app.config import Config
from app.extensions import supabase, supabase_auth
from app.services.email_utils import normalize_email

DEFAULT_STUDENT_PASSWORD = (Config.DEFAULT_STUDENT_PASSWORD or '123456').strip() or '123456'


def _list_auth_users_page(page: int, per_page: int = 200):
    result = supabase_auth.auth.admin.list_users(page=page, per_page=per_page)
    if isinstance(result, list):
        return result
    return getattr(result, 'users', None) or []


def find_auth_user_id_by_email(email):
    norm = normalize_email(email)
    if not norm:
        return None
    page = 1
    while page <= 20:
        users = _list_auth_users_page(page)
        if not users:
            break
        for row in users:
            row_email = getattr(row, 'email', None) or ''
            if normalize_email(row_email) == norm:
                return row.id
        if len(users) < 200:
            break
        page += 1
    return None


def _find_public_student_by_email(email):
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


def friendly_provision_error(exc):
    message = str(exc).strip() or 'Failed to create student account'
    lower = message.lower()
    if 'password' in lower and 'short' in lower:
        return 'Initial password is too short for Supabase (min 6 characters)'
    return message


def provision_student_account(email, display_name, *, grade=None, reset_password=True):
    """
    Ensure a student can log in with email + default password.
    Returns (student_id, status) where status is created|synced|existing.
    """
    norm = normalize_email(email)
    name = (display_name or '').strip() or norm.split('@')[0] or 'Student'
    grade_value = (grade or '').strip() or None

    existing = _find_public_student_by_email(norm)
    if existing:
        return existing['id'], 'existing'

    user_id = None
    created_new = False

    try:
        created = supabase_auth.auth.admin.create_user({
            'email': norm,
            'password': DEFAULT_STUDENT_PASSWORD,
            'email_confirm': True,
            'user_metadata': {'display_name': name},
        })
        user_id = created.user.id if created and created.user else None
        created_new = bool(user_id)
    except Exception as exc:
        err = str(exc).lower()
        if 'already' in err or 'registered' in err or 'exists' in err:
            user_id = find_auth_user_id_by_email(norm)
            if not user_id:
                raise RuntimeError(
                    'This email already has a login account that could not be linked. '
                    'Ask the student to reset their password or use another email.'
                ) from exc
        else:
            raise

    if not user_id:
        raise RuntimeError('Failed to create student login account')

    payload = {
        'id': user_id,
        'email': norm,
        'display_name': name,
        'role': 'student',
    }
    if grade_value:
        payload['grade'] = grade_value

    public_row = supabase.table('users').select('id, role').eq('id', user_id).limit(1).execute()
    if public_row.data:
        role = (public_row.data[0].get('role') or '').strip().lower()
        if role and role != 'student':
            raise RuntimeError(
                f'This email belongs to an existing {role} account and cannot be added as a student.'
            )
        update_payload = {
            'email': norm,
            'display_name': name,
            'role': 'student',
        }
        if grade_value:
            update_payload['grade'] = grade_value
        supabase.table('users').update(update_payload).eq('id', user_id).execute()
        status = 'synced'
    else:
        supabase.table('users').insert(payload).execute()
        status = 'created' if created_new else 'synced'

    if reset_password and (created_new or status == 'synced'):
        try:
            supabase_auth.auth.admin.update_user_by_id(
                user_id,
                {'password': DEFAULT_STUDENT_PASSWORD},
            )
        except Exception:
            pass

    return user_id, status


def initial_password_message():
    return (
        f'Student account is ready. They can log in with this email and initial '
        f'password: {DEFAULT_STUDENT_PASSWORD}'
    )
