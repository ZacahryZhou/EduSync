#!/usr/bin/env python3
"""Create an EduSync user via Supabase Admin API (bypasses signup email rate limits).

Requires in backend/.env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  cd backend && .venv/bin/python scripts/create_supabase_user.py \\
    --email teacher1@example.com \\
    --password 'YourPassword123!' \\
    --name 'Ms. Chen' \\
    --role teacher

  cd backend && .venv/bin/python scripts/create_supabase_user.py \\
    --email student1@example.com \\
    --password 'YourPassword123!' \\
    --name 'Alex Student' \\
    --role student \\
    --grade 'Grade 10'
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
except ImportError:
    pass

import os

try:
    from supabase import create_client
except ImportError:
    print('Install dependencies: pip install supabase python-dotenv', file=sys.stderr)
    sys.exit(1)


def _client():
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env', file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def _list_auth_users(client, *, page: int, per_page: int = 100):
    result = client.auth.admin.list_users(page=page, per_page=per_page)
    if isinstance(result, list):
        return result
    return getattr(result, 'users', None) or []


def create_user(
    *,
    email: str,
    password: str,
    display_name: str,
    role: str,
    grade: str | None = None,
) -> str:
    if role not in ('teacher', 'student'):
        raise ValueError('role must be teacher or student')

    client = _client()
    user_id = None

    try:
        created = client.auth.admin.create_user({
            'email': email,
            'password': password,
            'email_confirm': True,
            'user_metadata': {'display_name': display_name},
        })
        user_id = created.user.id if created and created.user else None
    except Exception as exc:
        err = str(exc).lower()
        if 'already' in err or 'registered' in err or 'exists' in err:
            print(f'Auth user already exists for {email}; syncing public.users if needed…')
            # Try to find existing auth user by listing (small projects / dev)
            page = 1
            while True:
                users = _list_auth_users(client, page=page)
                if not users:
                    break
                for row in users:
                    if (getattr(row, 'email', None) or '').lower() == email.lower():
                        user_id = row.id
                        break
                if user_id:
                    break
                page += 1
            if not user_id:
                raise RuntimeError(f'Could not create or find auth user: {exc}') from exc
        else:
            raise RuntimeError(f'Failed to create auth user: {exc}') from exc

    if not user_id:
        raise RuntimeError('No user id returned from Supabase Auth')

    payload = {
        'id': user_id,
        'email': email,
        'display_name': display_name,
        'role': role,
    }
    if role == 'student' and grade:
        payload['grade'] = grade.strip()

    existing = client.table('users').select('id').eq('id', user_id).limit(1).execute()
    if existing.data:
        client.table('users').update({
            'email': email,
            'display_name': display_name,
            'role': role,
            **({'grade': grade.strip()} if role == 'student' and grade else {}),
        }).eq('id', user_id).execute()
        print('Updated existing public.users row.')
    else:
        client.table('users').insert(payload).execute()
        print('Inserted public.users row.')

    return user_id


def main() -> int:
    parser = argparse.ArgumentParser(description='Create EduSync user via Supabase Admin API')
    parser.add_argument('--email', required=True, help='Login email')
    parser.add_argument('--password', required=True, help='Login password (min 6 chars for Supabase)')
    parser.add_argument('--name', required=True, help='Display name shown in the app')
    parser.add_argument('--role', required=True, choices=['teacher', 'student'])
    parser.add_argument('--grade', default='', help='Student grade (optional)')
    args = parser.parse_args()

    try:
        user_id = create_user(
            email=args.email.strip(),
            password=args.password,
            display_name=args.name.strip(),
            role=args.role,
            grade=(args.grade or '').strip() or None,
        )
    except Exception as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1

    print('User ready.')
    print(f'  id:    {user_id}')
    print(f'  email: {args.email.strip()}')
    print(f'  role:  {args.role}')
    print('Log in at your app with the email + password above.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
