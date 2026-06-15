"""Transactional email via Resend API."""

import os
from html import escape

import requests

from app.extensions import supabase

RESEND_API_URL = 'https://api.resend.com/emails'


def _resend_configured():
    return bool(os.getenv('RESEND_API_KEY'))


def _from_address():
    return os.getenv('RESEND_FROM_EMAIL', 'EduSync <onboarding@resend.dev>')


def _frontend_url():
    return os.getenv('FRONTEND_URL', 'http://localhost:8080').rstrip('/')


def _user_row(user_id):
    if not user_id:
        return None
    try:
        result = supabase.table('users').select(
            'id, email, display_name, email_notifications'
        ).eq('id', user_id).limit(1).execute()
    except Exception:
        return None
    if not result.data:
        return None
    return result.data[0]


def email_opted_in(user_id):
    row = _user_row(user_id)
    if not row:
        return False
    email = (row.get('email') or '').strip()
    if not email:
        return False
    if row.get('email_notifications') is False:
        return False
    return True


def _already_sent(user_id, email_type, reference_id):
    try:
        result = supabase.table('email_log').select('id').eq(
            'user_id', user_id
        ).eq('email_type', email_type).eq(
            'reference_id', reference_id
        ).limit(1).execute()
    except Exception:
        return False
    return bool(result.data)


def _log_sent(user_id, email_type, reference_id):
    try:
        supabase.table('email_log').insert({
            'user_id': user_id,
            'email_type': email_type,
            'reference_id': reference_id,
        }).execute()
    except Exception:
        pass


def send_email(to_address, subject, html_body, text_body=None):
    """Send one email; returns True if accepted by Resend."""
    if not _resend_configured():
        return False
    to_address = (to_address or '').strip()
    if not to_address:
        return False

    payload = {
        'from': _from_address(),
        'to': [to_address],
        'subject': subject,
        'html': html_body,
    }
    if text_body:
        payload['text'] = text_body

    try:
        response = requests.post(
            RESEND_API_URL,
            headers={
                'Authorization': f'Bearer {os.getenv("RESEND_API_KEY")}',
                'Content-Type': 'application/json',
            },
            json=payload,
            timeout=15,
        )
        return response.status_code in (200, 201)
    except Exception:
        return False


def send_user_email(user_id, email_type, reference_id, subject, html_body, text_body=None):
    """Respect opt-in + dedupe; returns True when an email was sent."""
    if not _resend_configured():
        return False
    if not email_opted_in(user_id):
        return False
    if _already_sent(user_id, email_type, reference_id):
        return False

    row = _user_row(user_id)
    if not row:
        return False

    if not send_email(row['email'], subject, html_body, text_body):
        return False

    _log_sent(user_id, email_type, reference_id)
    return True


def _wrap_html(title, body_lines, cta_label='Open EduSync', cta_path='/calendar'):
    safe_title = escape(title)
    body_html = ''.join(
        f'<p style="margin:0 0 12px;line-height:1.5;">{escape(line)}</p>'
        for line in body_lines
    )
    url = f'{_frontend_url()}{cta_path}'
    return f'''
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 16px;font-size:18px;">{safe_title}</h2>
  {body_html}
  <p style="margin:24px 0 0;">
    <a href="{url}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">{escape(cta_label)}</a>
  </p>
</div>
'''


def email_schedule_changed(user_id, session_row, class_name):
    title_text = session_row.get('title') or 'Session'
    ref = str(session_row.get('id') or '')
    start = str(session_row.get('start_time') or '')[:5]
    end = str(session_row.get('end_time') or '')[:5]
    subject = f'Schedule update: {title_text}'
    lines = [
        f'{title_text} ({class_name}) has a new time.',
        f'Date: {session_row.get("date")} {start}–{end}',
    ]
    if session_row.get('location'):
        lines.append(f'Location: {session_row.get("location")}')
    html = _wrap_html('Class schedule updated', lines)
    text = '\n'.join(lines)
    return send_user_email(user_id, 'schedule_changed', ref, subject, html, text)


def email_session_cancelled(user_id, session_row, class_name):
    title_text = session_row.get('title') or 'Session'
    ref = f'cancel:{session_row.get("id")}'
    start = str(session_row.get('start_time') or '')[:5]
    end = str(session_row.get('end_time') or '')[:5]
    subject = f'Cancelled: {title_text}'
    lines = [
        f'{title_text} ({class_name}) on {session_row.get("date")} '
        f'{start}–{end} has been cancelled.',
    ]
    html = _wrap_html('Session cancelled', lines)
    return send_user_email(user_id, 'session_cancelled', ref, subject, html, '\n'.join(lines))


def email_reschedule_requested(teacher_id, request_row, session_row, student_name, class_name):
    ref = str(request_row.get('id') or '')
    session_title = session_row.get('title') or 'Session'
    subject = f'Reschedule request from {student_name}'
    lines = [
        f'{student_name} asked to reschedule {session_title} ({class_name}).',
        (
            f'Proposed: {request_row.get("proposed_date")} '
            f'{str(request_row.get("proposed_start") or "")[:5]}–'
            f'{str(request_row.get("proposed_end") or "")[:5]}'
        ),
    ]
    if request_row.get('reason'):
        lines.append(f'Reason: {request_row.get("reason")}')
    html = _wrap_html('New reschedule request', lines, cta_path='/dashboard')
    return send_user_email(teacher_id, 'reschedule_requested', ref, subject, html, '\n'.join(lines))


def email_reschedule_resolved(student_id, request_row, session_row, approved, teacher_response=None):
    ref = f'resolved:{request_row.get("id")}'
    session_title = session_row.get('title') or 'Session'
    if approved:
        subject = f'Reschedule approved: {session_title}'
        title = 'Reschedule approved'
        lines = [
            f'Your request for {session_title} was approved.',
            (
                f'New time: {request_row.get("proposed_date")} '
                f'{str(request_row.get("proposed_start") or "")[:5]}–'
                f'{str(request_row.get("proposed_end") or "")[:5]}'
            ),
        ]
    else:
        subject = f'Reschedule declined: {session_title}'
        title = 'Reschedule declined'
        lines = [f'Your request for {session_title} was declined.']
        if teacher_response:
            lines.append(f'Note: {teacher_response}')
    html = _wrap_html(title, lines)
    return send_user_email(student_id, 'reschedule_resolved', ref, subject, html, '\n'.join(lines))


def email_session_reminder(user_id, session_row, class_name):
    ref = f'reminder:{session_row.get("id")}'
    title_text = session_row.get('title') or 'Session'
    start = str(session_row.get('start_time') or '')[:5]
    end = str(session_row.get('end_time') or '')[:5]
    subject = f'Reminder: {title_text} tomorrow'
    lines = [
        f'You have {title_text} ({class_name}) tomorrow.',
        f'Time: {session_row.get("date")} {start}–{end}',
    ]
    if session_row.get('location'):
        lines.append(f'Location: {session_row.get("location")}')
    notes = (session_row.get('notes') or '').strip()
    if notes:
        lines.append(f'Notes: {notes}')
    html = _wrap_html('Class tomorrow', lines)
    return send_user_email(user_id, 'session_reminder', ref, subject, html, '\n'.join(lines))


def email_session_scheduled(
    user_id,
    session_row,
    class_name,
    session_count=1,
    last_date=None,
):
    title_text = session_row.get('title') or 'Session'
    if session_count > 1:
        ref = f'scheduled:{session_row.get("recurrence_group_id") or session_row.get("id")}'
        end_part = f' through {last_date}' if last_date else ''
        subject = f'New weekly classes: {title_text}'
        lines = [
            (
                f'{title_text} ({class_name}) — {session_count} weekly sessions '
                f'starting {session_row.get("date")}{end_part}.'
            ),
            (
                f'Time: {_format_time(session_row.get("start_time"))}–'
                f'{_format_time(session_row.get("end_time"))}'
            ),
        ]
    else:
        ref = f'scheduled:{session_row.get("id")}'
        subject = f'New class: {title_text}'
        lines = [
            f'{title_text} ({class_name}) was scheduled.',
            (
                f'When: {session_row.get("date")} '
                f'{_format_time(session_row.get("start_time"))}–'
                f'{_format_time(session_row.get("end_time"))}'
            ),
        ]
    if session_row.get('location'):
        lines.append(f'Location: {session_row.get("location")}')
    notes = (session_row.get('notes') or '').strip()
    if notes:
        lines.append(f'Notes: {notes}')
    html = _wrap_html('New class scheduled', lines)
    return send_user_email(user_id, 'session_scheduled', ref, subject, html, '\n'.join(lines))


def _format_time(value):
    if not value:
        return ''
    text = str(value)
    return text[:5] if len(text) >= 5 else text


def _format_due_date(value):
    if not value:
        return 'No due date'
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def email_assignment_published(user_id, assignment_row, class_name):
    title_text = assignment_row.get('title') or 'Assignment'
    ref = f'assignment:{assignment_row.get("id")}'
    due_label = _format_due_date(assignment_row.get('due_date'))
    subject = f'New assignment: {title_text}'
    lines = [
        f'Your teacher posted {title_text} for {class_name}.',
        f'Due: {due_label}',
    ]
    description = (assignment_row.get('description') or '').strip()
    if description:
        lines.append(description[:500])
    html = _wrap_html('New assignment', lines, cta_path='/assignments')
    return send_user_email(user_id, 'assignment_published', ref, subject, html, '\n'.join(lines))


def email_assignment_submitted(teacher_id, assignment_row, student_name):
    title_text = assignment_row.get('title') or 'Assignment'
    ref = f'submission:{assignment_row.get("id")}:{student_name}'
    subject = f'Submission received: {title_text}'
    lines = [
        f'{student_name} submitted {title_text}.',
        'Open Assignments to review and grade.',
    ]
    html = _wrap_html('New submission', lines, cta_path='/assignments')
    return send_user_email(teacher_id, 'assignment_submitted', ref, subject, html, '\n'.join(lines))


def email_assignment_graded(student_id, assignment_row, grade, feedback=None):
    title_text = assignment_row.get('title') or 'Assignment'
    ref = f'graded:{assignment_row.get("id")}:{student_id}'
    subject = f'Graded: {title_text}'
    lines = [f'Your work for {title_text} was graded: {grade}.']
    if feedback:
        lines.append(feedback[:500])
    html = _wrap_html('Assignment graded', lines, cta_path='/assignments')
    return send_user_email(student_id, 'assignment_graded', ref, subject, html, '\n'.join(lines))
