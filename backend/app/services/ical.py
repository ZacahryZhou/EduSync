"""Build RFC 5545 iCalendar (.ics) payloads for class sessions."""

from datetime import datetime, timezone


def _escape_ical_text(value):
    if value is None:
        return ''
    text = str(value)
    text = text.replace('\\', '\\\\')
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('\n', '\\n')
    text = text.replace(',', '\\,')
    text = text.replace(';', '\\;')
    return text


def _normalize_time(time_value):
    raw = (time_value or '00:00').strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.strftime('%H%M%S')
        except (TypeError, ValueError):
            continue
    return '000000'


def _to_ical_datetime(date_value, time_value):
    date_str = (date_value or '').strip()
    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d')
    except (TypeError, ValueError):
        parsed_date = datetime.utcnow()
    return f"{parsed_date.strftime('%Y%m%d')}T{_normalize_time(time_value)}"


def build_sessions_ics(sessions, calendar_name='EduSync Schedule'):
    """Return a VCALENDAR document for the given session dicts."""
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//EduSync//Class Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        f'X-WR-CALNAME:{_escape_ical_text(calendar_name)}',
    ]

    now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    for session in sessions:
        session_id = session.get('id') or ''
        uid = f'{session_id}@edusync' if session_id else f'event-{now}@edusync'
        dtstart = _to_ical_datetime(session.get('date'), session.get('start_time'))
        dtend = _to_ical_datetime(session.get('date'), session.get('end_time'))
        summary = (
            session.get('title')
            or session.get('class_name')
            or 'Class session'
        )
        location = session.get('location') or ''
        description_parts = []
        class_name = session.get('class_name') or ''
        if class_name:
            description_parts.append(f'Class: {class_name}')
        notes = session.get('notes') or ''
        if notes:
            description_parts.append(notes)

        lines.append('BEGIN:VEVENT')
        lines.append(f'UID:{uid}')
        lines.append(f'DTSTAMP:{now}')
        lines.append(f'DTSTART:{dtstart}')
        lines.append(f'DTEND:{dtend}')
        lines.append(f'SUMMARY:{_escape_ical_text(summary)}')
        if location:
            lines.append(f'LOCATION:{_escape_ical_text(location)}')
        if description_parts:
            description = '\\n'.join(_escape_ical_text(part) for part in description_parts)
            lines.append(f'DESCRIPTION:{description}')
        lines.append('END:VEVENT')

    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'
