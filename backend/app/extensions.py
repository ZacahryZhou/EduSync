from supabase import create_client
from app.config import Config

# Database + server-side writes — always service role (bypasses RLS).
supabase = create_client(
    Config.SUPABASE_URL,
    Config.SUPABASE_SERVICE_ROLE_KEY
)

# Auth-only client — sign-in / token validation must not mutate `supabase` headers.
supabase_auth = create_client(
    Config.SUPABASE_URL,
    Config.SUPABASE_SERVICE_ROLE_KEY,
)


def new_session_client():
    """
    A throwaway Supabase client for any call that ESTABLISHES a session
    (sign_in_with_password, sign_up, refresh_session).

    Those calls save the new session onto the client instance they're
    called on, and every later call through that same instance — including
    `.auth.admin.*` calls — then uses that user's token instead of the
    service_role key. Since gunicorn runs one worker per process reusing
    the same module-level `supabase_auth` for the app's whole lifetime,
    calling one of those three methods directly on `supabase_auth` would
    silently break every admin operation (provisioning students, deleting
    users, listing auth users) for every later request in that worker,
    until it restarts. Always use a fresh client from here for those three
    calls instead — `supabase_auth.auth.get_user(token)` (used by
    require_auth on every request) and `reset_password_for_email` are
    confirmed safe on the shared client and don't need this.
    """
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)