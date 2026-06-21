import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export function getGoogleAuthRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export async function startGoogleSignIn(): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Google sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Google sign-in is not available.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getGoogleAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}
