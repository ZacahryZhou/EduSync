import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    // Implicit flow: tokens return in the URL hash — no PKCE verifier storage needed.
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Clear the Supabase browser session without revoking the JWT we store in
 * `edusync_token`. Default `signOut()` uses global scope and invalidates the
 * access token on the server, which breaks subsequent API calls (e.g. join class).
 */
export async function clearLocalSupabaseSession(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
}
