import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { OAuthRoleDialog } from "@/components/OAuthRoleDialog";
import { completeOAuthSignIn } from "@/lib/api";
import { getPostLoginPath } from "@/lib/roles";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type PendingProfile = {
  accessToken: string;
  email: string;
  suggestedDisplayName: string;
  avatarUrl?: string;
};

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [errorMessage, setErrorMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(true);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<PendingProfile | null>(
    null,
  );

  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      if (handledRef.current) return;
      handledRef.current = true;

      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorMessage("Google sign-in is not configured.");
        setIsProcessing(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const oauthError =
        params.get("error_description") ??
        params.get("error") ??
        hashParams.get("error_description") ??
        hashParams.get("error");

      if (oauthError) {
        setErrorMessage(oauthError);
        setIsProcessing(false);
        return;
      }

      let accessToken: string | null = hashParams.get("access_token");

      if (!accessToken) {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message);
          setIsProcessing(false);
          return;
        }
        accessToken = data.session?.access_token ?? null;
      }

      if (!accessToken) {
        setErrorMessage("No Google session found. Please try again.");
        setIsProcessing(false);
        return;
      }

      try {
        const result = await completeOAuthSignIn(accessToken);
        if (cancelled) return;

        window.history.replaceState({}, "", "/auth/callback");

        if (result.status === "needs_profile") {
          setPendingProfile({
            accessToken: result.token,
            email: result.email,
            suggestedDisplayName: result.suggested_display_name,
            avatarUrl: result.avatar_url,
          });
          setRoleDialogOpen(true);
          setIsProcessing(false);
          return;
        }

        login(result.token, {
          id: result.user.id,
          name: result.user.display_name,
          role: result.user.role,
          email: result.user.email,
          avatar: result.user.avatar_url ?? undefined,
        });
        navigate(getPostLoginPath(result.user.role), { replace: true });
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Google sign-in failed";
        setErrorMessage(message);
        setIsProcessing(false);
      }
    }

    void finishSignIn();

    return () => {
      cancelled = true;
    };
  }, [login, navigate]);

  function handleProfileComplete(payload: {
    token: string;
    user: {
      id: string;
      email: string;
      display_name: string;
      role: string;
      avatar_url?: string | null;
    };
  }) {
    login(payload.token, {
      id: payload.user.id,
      name: payload.user.display_name,
      role: payload.user.role,
      email: payload.user.email,
      avatar: payload.user.avatar_url ?? undefined,
    });
    navigate(getPostLoginPath(payload.user.role), { replace: true });
  }

  if (errorMessage) {
    return (
      <div className="auth-surface flex min-h-screen items-center justify-center px-4">
        <div className="auth-card space-y-4 text-center">
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
          <Button asChild>
            <Link to="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="auth-surface flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          {isProcessing ? "Completing Google sign-in…" : "Almost there…"}
        </p>
      </div>

      {pendingProfile ? (
        <OAuthRoleDialog
          open={roleDialogOpen}
          onOpenChange={setRoleDialogOpen}
          accessToken={pendingProfile.accessToken}
          email={pendingProfile.email}
          suggestedDisplayName={pendingProfile.suggestedDisplayName}
          avatarUrl={pendingProfile.avatarUrl}
          onSuccess={handleProfileComplete}
        />
      ) : null}
    </>
  );
}
