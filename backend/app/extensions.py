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