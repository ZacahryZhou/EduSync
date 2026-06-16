import os
from pathlib import Path

from dotenv import load_dotenv

# Always load backend/.env (Flask secrets), then repo root .env as fallback.
# Vite only reads root .env; never put DEEPSEEK_API_KEY in VITE_* vars.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_BACKEND_DIR / ".env", override=True)

class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")
    RESEND_API_KEY = os.getenv("RESEND_API_KEY")
    RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "EduSync <onboarding@resend.dev>")
    CRON_SECRET = os.getenv("CRON_SECRET")

    # DeepSeek (teacher AI assistant)
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    DEEPSEEK_API_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    # Default password for teacher-added students (min 6 chars for Supabase Auth).
    DEFAULT_STUDENT_PASSWORD = os.getenv("DEFAULT_STUDENT_PASSWORD", "123456")
