import os
from pathlib import Path

from dotenv import load_dotenv

# Always load backend/.env (Flask secrets), then repo root .env as fallback.
# Vite only reads root .env; never put NVIDIA_API_KEY in VITE_* vars.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_BACKEND_DIR / ".env", override=True)

def _find_nvidia_key():
    """NVIDIA key from NVIDIA_API_KEY, or a near-miss name such as `NVDIA_API_KEY`
    or `Nvia_Api` (any name starting with "nv" and ending in "key"/"api",
    case-insensitive); strips stray quotes/whitespace."""
    candidates = [os.getenv("NVIDIA_API_KEY")]
    for name, value in os.environ.items():
        lowered = name.strip().lower()
        if lowered.startswith("nv") and lowered.endswith(("key", "api")):
            candidates.append(value)
    for value in candidates:
        cleaned = (value or "").strip().strip("\"'").strip()
        if cleaned:
            return cleaned
    return None


class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")
    RESEND_API_KEY = os.getenv("RESEND_API_KEY")
    RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "EduSync <onboarding@resend.dev>")
    CRON_SECRET = os.getenv("CRON_SECRET")

    # NVIDIA NIM (OpenAI-compatible) — AI assistant for teachers and students.
    # `Nvia_Api` is accepted as a legacy spelling of the key variable name.
    NVIDIA_API_KEY = _find_nvidia_key()
    NVIDIA_API_BASE = os.getenv("NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1")
    NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")

    # Default password for teacher-added students (min 6 chars for Supabase Auth).
    DEFAULT_STUDENT_PASSWORD = os.getenv("DEFAULT_STUDENT_PASSWORD", "123456")
