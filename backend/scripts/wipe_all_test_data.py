#!/usr/bin/env python3
"""Wipe all EduSync test data from Supabase (public tables + auth users).

Requires in backend/.env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  cd backend && .venv/bin/python scripts/wipe_all_test_data.py
  cd backend && .venv/bin/python scripts/wipe_all_test_data.py --yes
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    print('Install dependencies: pip install supabase python-dotenv', file=sys.stderr)
    sys.exit(1)

# Child tables first, then parents (same order as wipe_all_test_data.sql)
PUBLIC_TABLES = [
    'assignment_submissions',
    'assignments',
    'attendance',
    'balance_transactions',
    'student_balances',
    'reschedule_requests',
    'class_materials',
    'sessions',
    'class_enrollments',
    'student_notes',
    'notifications',
    'email_log',
    'class_groups',
    'users',
]

# PostgREST delete-all idiom: neq impossible uuid
_DELETE_ALL_FILTER = '00000000-0000-0000-0000-000000000000'


def _client():
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env', file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def wipe_public_tables(client) -> None:
    for table in PUBLIC_TABLES:
        try:
            client.table(table).delete().neq('id', _DELETE_ALL_FILTER).execute()
            print(f'  cleared {table}')
        except Exception as exc:
            print(f'  skip {table}: {exc}')


def wipe_auth_users(client) -> None:
    deleted = 0
    page = 1
    while True:
        result = client.auth.admin.list_users(page=page, per_page=100)
        users = getattr(result, 'users', None) or []
        if not users:
            break
        for user in users:
            uid = getattr(user, 'id', None)
            if not uid:
                continue
            client.auth.admin.delete_user(uid)
            deleted += 1
        if len(users) < 100:
            break
        page += 1
    print(f'  deleted {deleted} auth user(s)')


def main() -> None:
    parser = argparse.ArgumentParser(description='Wipe all EduSync test data from Supabase')
    parser.add_argument(
        '--yes',
        action='store_true',
        help='Skip confirmation prompt',
    )
    args = parser.parse_args()

    if not args.yes:
        print('⚠️  This deletes ALL app data and ALL auth users in this Supabase project.')
        print('    Tables stay; only rows are removed.')
        answer = input('Type DELETE ALL to continue: ').strip()
        if answer != 'DELETE ALL':
            print('Aborted.')
            sys.exit(0)

    client = _client()
    print('Clearing public tables…')
    wipe_public_tables(client)
    print('Clearing auth users…')
    wipe_auth_users(client)
    print('Done. Optional: empty Storage buckets (avatars, materials, submissions) in Dashboard.')


if __name__ == '__main__':
    main()
