"""Roster identifiers for enrolled students and pending invites."""

PENDING_ID_PREFIX = 'pending:'


def is_pending_roster_id(value):
    return bool(value and str(value).startswith(PENDING_ID_PREFIX))


def parse_roster_student_id(value):
    text = (value or '').strip()
    if is_pending_roster_id(text):
        return None, text[len(PENDING_ID_PREFIX):]
    return text or None, None


def roster_student_id(*, student_id=None, pending_enrollment_id=None):
    if pending_enrollment_id:
        return f'{PENDING_ID_PREFIX}{pending_enrollment_id}'
    return student_id
