"""Create or sync student login accounts (teacher-initiated)."""

from __future__ import annotations

import secrets

from app.config import Config
from app.extensions import supabase, supabase_auth
from app.services.email_utils import normalize_email

# Kept as a last-resort fallback (e.g. if random generation ever throws) —
# no longer shown to users, since each student now gets their own random
# password (see generate_temp_password below).
DEFAULT_STUDENT_PASSWORD = (Config.DEFAULT_STUDENT_PASSWORD or '123456').strip() or '123456'

# No 0/O/1/l/I — easy to misread when a teacher reads it aloud or a student
# copy-types it from a screenshot. Not meant to be "strong" (it's a one-time
# password the student is expected to change or reset), just unguessable
# and unique per student instead of one shared default for everyone.
_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'


def generate_temp_password(length: int = 8) -> str:
    return ''.join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


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


def _ensure_auth_login_ready(user_id, *, password=None):
    """Confirm email and optionally set a new password."""
    payload = {'email_confirm': True}
    if password:
        payload['password'] = password
    supabase_auth.auth.admin.update_user_by_id(user_id, payload)


def provision_student_account(email, display_name, *, grade=None, reset_password=True):
    """
    Ensure a student can log in. When reset_password is True (default), a
    fresh random password is generated for them — unique per student, never
    the same shared default for everyone.

    Returns (student_id, status, password) where status is
    created|synced|existing, and password is the new plaintext password
    when one was generated (reset_password=True), else None — this is the
    only moment the plaintext password exists outside the student's head;
    Supabase only ever stores its hash after this call returns.
    """
    norm = normalize_email(email)
    name = (display_name or '').strip() or norm.split('@')[0] or 'Student'
    grade_value = (grade or '').strip() or None
    new_password = generate_temp_password() if reset_password else None

    existing_profile = _find_public_student_by_email(norm)
    auth_user_id = find_auth_user_id_by_email(norm)
    if existing_profile and auth_user_id and existing_profile['id'] != auth_user_id:
        raise RuntimeError(
            'This email has conflicting account records. Contact support or use another email.'
        )

    user_id = auth_user_id or (existing_profile['id'] if existing_profile else None)
    created_new = False

    if not user_id:
        try:
            created = supabase_auth.auth.admin.create_user({
                'email': norm,
                'password': new_password or DEFAULT_STUDENT_PASSWORD,
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
        status = 'existing' if existing_profile and not created_new else 'synced'
    else:
        supabase.table('users').insert(payload).execute()
        status = 'created' if created_new else 'synced'

    try:
        _ensure_auth_login_ready(user_id, password=new_password)
    except Exception as exc:
        raise RuntimeError(friendly_provision_error(exc)) from exc

    return user_id, status, new_password


def initial_password_message(password: str | None = None):
    if not password:
        return 'Student account is ready. Share their login password with them separately.'
    return (
        f'Student account is ready. They can log in with this email and initial '
        f'password: {password}'
    )
