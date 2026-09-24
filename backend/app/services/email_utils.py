"""Shared email helpers (no service imports — avoids circular deps)."""


def normalize_email(email):
    return (email or '').strip().lower()
