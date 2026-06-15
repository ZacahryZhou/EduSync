#!/usr/bin/env python3
"""P0 smoke test — exercises teacher + student flows against a running API.

Usage:
  cd backend && mise exec -- python scripts/p0_smoke_test.py

Optional env (in backend/.env):
  SMOKE_API_URL=http://127.0.0.1:5000/api
  SMOKE_EMAIL_BASE=your.name@gmail.com   # required for auto-register
  SMOKE_PASSWORD=SmokeTest1!
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    create_client = None

API = os.getenv('SMOKE_API_URL', 'http://127.0.0.1:5000/api').rstrip('/')
PASSWORD = os.getenv('SMOKE_PASSWORD', 'SmokeTest1!')


def _smoke_email(role: str, suffix: str) -> str:
    """Gmail-style plus addressing: base+role.suffix@domain"""
    base = (os.getenv('SMOKE_EMAIL_BASE') or '').strip()
    if not base or '@' not in base:
        raise SmokeFailure(
            'Set SMOKE_EMAIL_BASE in backend/.env (e.g. your.name@gmail.com). '
            'Supabase rejects @example.com addresses.'
        )
    local, domain = base.rsplit('@', 1)
    tag = f'{role}.{suffix}'
    return f'{local}+{tag}@{domain}'


class SmokeFailure(Exception):
    pass


def _url(path: str) -> str:
    return f'{API}{path if path.startswith("/") else "/" + path}'


def _check(label: str, response: requests.Response, expected: int | tuple[int, ...] = 200):
    codes = (expected,) if isinstance(expected, int) else expected
    if response.status_code not in codes:
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise SmokeFailure(f'{label}: HTTP {response.status_code} — {body}')
    return response


def _json(response: requests.Response) -> dict:
    data = response.json()
    if not isinstance(data, dict):
        raise SmokeFailure(f'Expected JSON object, got {type(data)}')
    return data


def register(role: str, email: str, name: str):
    if _provision_user_via_admin(role, email, name):
        return True
    path = f'/auth/register/{role}'
    resp = requests.post(
        _url(path),
        json={'email': email, 'password': PASSWORD, 'display_name': name},
        timeout=30,
    )
    if resp.status_code == 201:
        return True
    if resp.status_code == 409:
        return False
    try:
        body = resp.json()
        err = str(body.get('error', '')).lower()
    except Exception:
        err = resp.text.lower()
    if resp.status_code == 400 and 'rate limit' in err:
        if _provision_user_via_admin(role, email, name):
            return True
    _check(f'Register {role}', resp, (201, 409))
    return False


def _provision_user_via_admin(role: str, email: str, name: str) -> bool:
    """Create auth + public.users row via service role (avoids signup rate limits)."""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key or create_client is None:
        return False
    client = create_client(url, key)
    user_id = None
    try:
        created = client.auth.admin.create_user({
            'email': email,
            'password': PASSWORD,
            'email_confirm': True,
            'user_metadata': {'display_name': name},
        })
        user_id = created.user.id if created and created.user else None
    except Exception:
        try:
            auth_only = create_client(url, key)
            sign_in = auth_only.auth.sign_in_with_password({
                'email': email,
                'password': PASSWORD,
            })
            user_id = sign_in.user.id if sign_in and sign_in.user else None
        except Exception:
            return False
    if not user_id:
        return False
    try:
        existing = client.table('users').select('id, role').eq('id', user_id).limit(1).execute()
        if not existing.data:
            client.table('users').insert({
                'id': user_id,
                'email': email,
                'display_name': name,
                'role': role,
            }).execute()
    except Exception:
        return False
    return True


def login(email: str) -> str:
    resp = _check(
        'Login',
        requests.post(
            _url('/auth/login'),
            json={'email': email, 'password': PASSWORD},
            timeout=30,
        ),
    )
    data = _json(resp)
    token = data.get('token')
    if not token:
        raise SmokeFailure('Login response missing token')
    return token


def auth_headers(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    teacher_email = _smoke_email('teacher', suffix)
    student_email = _smoke_email('student', suffix)
    print(f'P0 smoke test → {API}')
    print(f'  teacher: {teacher_email}')
    print(f'  student: {student_email}')

    # Health
    health = requests.get(_url('/health'), timeout=10)
    if health.status_code != 200:
        raise SmokeFailure(f'Health check failed: HTTP {health.status_code}')

    register('teacher', teacher_email, f'Smoke Teacher {suffix}')
    register('student', student_email, f'Smoke Student {suffix}')
    teacher_token = login(teacher_email)
    th = auth_headers(teacher_token)

    # Teacher: create class
    class_resp = _check(
        'Create class',
        requests.post(
            _url('/classes'),
            headers=th,
            json={
                'name': f'Smoke Class {suffix}',
                'description': 'P0 smoke',
                'billing_mode': 'per_session',
                'unit_price': 50,
            },
            timeout=30,
        ),
        201,
    )
    class_row = _json(class_resp).get('class') or {}
    class_id = class_row.get('id')
    class_code = class_row.get('code')
    if not class_id or not class_code:
        raise SmokeFailure('Create class missing id/code')

    # Teacher: recurring sessions
    start = date.today() + timedelta(days=7)
    end = start + timedelta(days=21)
    sess_resp = _check(
        'Create recurring sessions',
        requests.post(
            _url('/sessions'),
            headers=th,
            json={
                'class_id': class_id,
                'title': 'Smoke Weekly',
                'date': start.isoformat(),
                'start_time': '10:00',
                'end_time': '11:00',
                'type': 'recurring',
                'recurrence_rule': 'weekly',
                'recurrence_end_date': end.isoformat(),
            },
            timeout=30,
        ),
        201,
    )
    sess_data = _json(sess_resp)
    sessions = sess_data.get('sessions') or []
    if len(sessions) < 2:
        raise SmokeFailure(f'Expected multiple recurring sessions, got {len(sessions)}')
    first_session = sessions[0]
    session_id = first_session.get('id')
    if not session_id:
        raise SmokeFailure('Missing session id')

    # Teacher: edit one session
    _check(
        'Update session',
        requests.patch(
            _url(f'/sessions/{session_id}'),
            headers=th,
            json={'title': 'Smoke Weekly (edited)', 'location': 'Room A'},
            timeout=30,
        ),
    )

    # Teacher: student list visible
    students_resp = _check(
        'List class students (empty)',
        requests.get(_url(f'/classes/{class_id}/students'), headers=th, timeout=30),
    )
    if _json(students_resp).get('students') is None:
        raise SmokeFailure('students key missing')

    # Student: register/login/join
    student_token = login(student_email)
    sh = auth_headers(student_token)
    _check(
        'Join class',
        requests.post(
            _url('/classes/join'),
            headers=sh,
            json={'class_code': class_code},
            timeout=30,
        ),
        201,
    )

    students_resp2 = _check(
        'List class students (after join)',
        requests.get(_url(f'/classes/{class_id}/students'), headers=th, timeout=30),
    )
    students = _json(students_resp2).get('students') or []
    if len(students) < 1:
        raise SmokeFailure('Teacher should see enrolled student')

    # Student: calendar
    month = start.strftime('%Y-%m')
    cal_resp = _check(
        'List sessions (student)',
        requests.get(
            _url('/sessions'),
            headers=sh,
            params={'month': month, 'class_id': class_id},
            timeout=30,
        ),
    )
    if not _json(cal_resp).get('sessions'):
        raise SmokeFailure('Student calendar empty')

    # Student: reschedule request
    proposed = (start + timedelta(days=1)).isoformat()
    req_resp = _check(
        'Create reschedule request',
        requests.post(
            _url('/reschedule-requests'),
            headers=sh,
            json={
                'session_id': session_id,
                'proposed_date': proposed,
                'proposed_start': '14:00',
                'proposed_end': '15:00',
                'reason': 'Smoke test conflict',
            },
            timeout=30,
        ),
        201,
    )
    request_id = (_json(req_resp).get('request') or {}).get('id')
    if not request_id:
        raise SmokeFailure('Missing reschedule request id')

    time.sleep(0.5)

    # Teacher notifications
    t_notif = _check(
        'Teacher notifications',
        requests.get(_url('/notifications'), headers=th, timeout=30),
    )
    t_rows = _json(t_notif).get('notifications') or []
    if not any(r.get('type') == 'reschedule_requested' for r in t_rows):
        raise SmokeFailure('Teacher missing reschedule_requested notification')

    # Teacher: approve
    _check(
        'Approve reschedule',
        requests.patch(
            _url(f'/reschedule-requests/{request_id}/approve'),
            headers=th,
            json={'teacher_response': 'Approved in smoke test'},
            timeout=30,
        ),
    )

    time.sleep(0.5)

    s_notif = _check(
        'Student notifications',
        requests.get(_url('/notifications'), headers=sh, timeout=30),
    )
    s_rows = _json(s_notif).get('notifications') or []
    if not any(r.get('type') == 'reschedule_resolved' for r in s_rows):
        raise SmokeFailure('Student missing reschedule_resolved notification')

    print('\n✅ P0 smoke test passed (local API)')
    print('   Manual: repeat in production incognito when deployed.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SmokeFailure as exc:
        print(f'\n❌ {exc}', file=sys.stderr)
        raise SystemExit(1) from exc
    except requests.RequestException as exc:
        print(f'\n❌ Connection error — is the backend running? {exc}', file=sys.stderr)
        raise SystemExit(1) from exc
