"""Create in-app notifications for schedule and reschedule events."""

from app.extensions import supabase

NOTIFICATION_TYPES = frozenset({
    'schedule_changed',
    'reschedule_requested',
    'reschedule_resolved',
})


def _format_time(value):
    if not value:
        return ''
    text = str(value)
    return text[:5] if len(text) >= 5 else text


def _class_teacher_id(class_id):
    result = supabase.table('class_groups').select('teacher_id').eq(
        'id', class_id
    ).limit(1).execute()
    if not result.data:
        return None
    return result.data[0].get('teacher_id')


def _class_student_ids(class_id):
    result = supabase.table('class_enrollments').select('student_id').eq(
        'class_id', class_id
    ).execute()
    return [row['student_id'] for row in (result.data or [])]


def create_notification(user_id, notif_type, title, body, related_id=None):
    """Insert one notification; failures are logged but do not break callers."""
    if notif_type not in NOTIFICATION_TYPES:
        return
    if not user_id:
        return
    payload = {
        'user_id': user_id,
        'type': notif_type,
        'title': title,
        'body': body or '',
        'read': False,
    }
    if related_id:
        payload['related_id'] = related_id
    try:
        supabase.table('notifications').insert(payload).execute()
    except Exception:
        pass


def create_notifications(user_ids, notif_type, title, body, related_id=None):
    unique_ids = list({uid for uid in (user_ids or []) if uid})
    for user_id in unique_ids:
        create_notification(user_id, notif_type, title, body, related_id)


def notify_reschedule_requested(request_row, session, student_name, class_name):
    teacher_id = _class_teacher_id(session.get('class_id'))
    if not teacher_id:
        return
    session_title = session.get('title') or 'Session'
    create_notification(
        teacher_id,
        'reschedule_requested',
        'New reschedule request',
        (
            f'{student_name} requested to reschedule {session_title} '
            f'({class_name}). Proposed: {request_row.get("proposed_date")} '
            f'{_format_time(request_row.get("proposed_start"))}–'
            f'{_format_time(request_row.get("proposed_end"))}.'
        ),
        related_id=request_row.get('id'),
    )


def notify_reschedule_resolved(
    request_row,
    session,
    approved,
    teacher_response=None,
):
    student_id = request_row.get('student_id')
    session_title = session.get('title') or 'Session'
    if approved:
        title = 'Reschedule approved'
        body = (
            f'Your request for {session_title} was approved. '
            f'New time: {request_row.get("proposed_date")} '
            f'{_format_time(request_row.get("proposed_start"))}–'
            f'{_format_time(request_row.get("proposed_end"))}.'
        )
    else:
        title = 'Reschedule declined'
        body = f'Your request for {session_title} was declined.'
        if teacher_response:
            body += f' Note: {teacher_response}'
    create_notification(
        student_id,
        'reschedule_resolved',
        title,
        body,
        related_id=request_row.get('id'),
    )


def notify_session_schedule_changed(session_row, classes_by_id=None):
    class_id = session_row.get('class_id')
    class_info = (classes_by_id or {}).get(class_id, {})
    class_name = class_info.get('name') or 'your class'
    title_text = session_row.get('title') or 'Session'
    body = (
        f'{title_text} ({class_name}) is now scheduled for '
        f'{session_row.get("date")} '
        f'{_format_time(session_row.get("start_time"))}–'
        f'{_format_time(session_row.get("end_time"))}.'
    )
    location = session_row.get('location')
    if location:
        body += f' Location: {location}.'
    student_ids = _class_student_ids(class_id)
    create_notifications(
        student_ids,
        'schedule_changed',
        'Class schedule updated',
        body,
        related_id=session_row.get('id'),
    )


def notify_session_cancelled(session_row, classes_by_id=None):
    class_id = session_row.get('class_id')
    class_info = (classes_by_id or {}).get(class_id, {})
    class_name = class_info.get('name') or 'your class'
    title_text = session_row.get('title') or 'Session'
    body = (
        f'{title_text} ({class_name}) on {session_row.get("date")} '
        f'{_format_time(session_row.get("start_time"))}–'
        f'{_format_time(session_row.get("end_time"))} '
        f'has been cancelled.'
    )
    student_ids = _class_student_ids(class_id)
    create_notifications(
        student_ids,
        'schedule_changed',
        'Session cancelled',
        body,
        related_id=session_row.get('id'),
    )


def notify_recurring_series_cancelled(session_row, deleted_count, classes_by_id=None):
    class_id = session_row.get('class_id')
    class_info = (classes_by_id or {}).get(class_id, {})
    class_name = class_info.get('name') or 'your class'
    title_text = session_row.get('title') or 'Session'
    count_label = deleted_count if deleted_count > 1 else 1
    body = (
        f'{title_text} ({class_name}) — {count_label} weekly '
        f'session{"s" if count_label != 1 else ""} cancelled.'
    )
    student_ids = _class_student_ids(class_id)
    create_notifications(
        student_ids,
        'schedule_changed',
        'Recurring sessions cancelled',
        body,
        related_id=session_row.get('recurrence_group_id') or session_row.get('id'),
    )
