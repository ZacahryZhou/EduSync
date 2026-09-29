"""
Simple in-memory attempt limiter for login/register/forgot-password.

Keyed by the email being attempted (not by IP): this protects each account
from brute-forcing regardless of which network the attacker uses, and
avoids accidentally locking out an entire shared network (e.g. everyone on
one venue's WiFi during a demo, who all share one public IP).

In-memory only: state lives in this process and resets on restart / does
not sync across multiple server instances. That's fine for a single
Railway service; swap for Redis (or a DB table) if you ever scale to more
than one backend instance.
"""

import threading
import time

ATTEMPT_LIMIT = 10
WINDOW_SECONDS = 60 * 60          # 1 hour rolling window
LOCKOUT_SECONDS = 5 * 60 * 60     # lockout duration once the limit is hit

_lock = threading.Lock()
_attempts: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}


def _normalize_key(key: str) -> str:
    return (key or '').strip().lower() or 'unknown'


def check_and_record(key: str) -> tuple[bool, int]:
    """
    Call once per attempt (login or register), before doing the real work.

    Returns (allowed, retry_after_seconds):
    - allowed=True: proceed as normal (this attempt has been counted).
    - allowed=False: reject the request now; retry_after_seconds is how
      long the caller should wait before trying again.
    """
    key = _normalize_key(key)
    now = time.time()

    with _lock:
        locked_until = _locked_until.get(key)
        if locked_until is not None:
            if locked_until > now:
                return False, int(locked_until - now)
            # Lockout expired — clear it and start fresh.
            _locked_until.pop(key, None)
            _attempts.pop(key, None)

        window_start = now - WINDOW_SECONDS
        history = [t for t in _attempts.get(key, []) if t >= window_start]
        history.append(now)
        _attempts[key] = history

        if len(history) > ATTEMPT_LIMIT:
            _locked_until[key] = now + LOCKOUT_SECONDS
            _attempts.pop(key, None)
            return False, LOCKOUT_SECONDS

        return True, 0


def reset(key: str) -> None:
    """Clear a key's attempt history (e.g. call after a successful login)."""
    key = _normalize_key(key)
    with _lock:
        _attempts.pop(key, None)
        _locked_until.pop(key, None)


def format_wait(seconds: int) -> str:
    seconds = max(1, int(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes = max(1, remainder // 60) if hours == 0 else round(remainder / 60)
    if hours and minutes:
        return f'{hours}h {minutes}m'
    if hours:
        return f'{hours}h'
    return f'{minutes}m'
