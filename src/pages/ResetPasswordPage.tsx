import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseClient } from "@/lib/supabase";
import { completeOAuthSignIn } from "@/lib/api";
import { getPostLoginPath } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";

/**
 * Landing page for the link in the password-reset email
 * (backend/app/blueprints/auth.py forgot_password sets redirect_to here).
 *
 * Supabase puts a short-lived recovery session in the URL hash
 * (`#access_token=...&refresh_token=...&type=recovery`); the anon
 * supabase-js client (detectSessionInUrl: true) picks it up automatically.
 * Once the new password is set, we hand that same session's access_token
 * to /api/auth/oauth/complete — the same endpoint Google sign-in uses — to
 * log the user straight into the app instead of sending them back to the
 * login form.
 *
 * 密码重置邮件链接落地页：Supabase 会把一个临时的恢复会话放进 URL hash 里，
 * anon 客户端会自动识别。设置新密码后，直接复用这个会话的 access_token 调用
 * 与 Google 登录相同的 oauth/complete 接口，让用户重置后立刻进入应用。
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function checkRecoveryLink() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setLinkError(t("resetPassword.notConfigured"));
        setIsCheckingLink(false);
        return;
      }

      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const oauthError =
        hashParams.get("error_description") ?? hashParams.get("error");
      if (oauthError) {
        setLinkError(oauthError);
        setIsCheckingLink(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setLinkError(t("resetPassword.invalidLink"));
        setIsCheckingLink(false);
        return;
      }

      setIsCheckingLink(false);
    }

    void checkRecoveryLink();
  }, [t]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage(t("resetPassword.tooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t("resetPassword.mismatch"));
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage(t("resetPassword.notConfigured"));
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        throw new Error(updateError.message);
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        throw new Error(t("resetPassword.invalidLink"));
      }

      const result = await completeOAuthSignIn(
        session.access_token,
        session.refresh_token,
      );
      if (result.status !== "ok") {
        // Shouldn't happen — this account already exists — but handle it
        // gracefully instead of leaving the user stuck.
        navigate("/login", { replace: true });
        return;
      }

      login(
        result.token,
        {
          id: result.user.id,
          name: result.user.display_name,
          role: result.user.role,
          email: result.user.email,
          avatar: result.user.avatar_url ?? undefined,
        },
        result.refresh_token,
      );
      navigate(getPostLoginPath(result.user.role), { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("resetPassword.error"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={t("resetPassword.shellTitle")}
      subtitle={t("resetPassword.shellSubtitle")}
    >
      <div className="auth-card">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            EduSync
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("resetPassword.title")}
          </h1>
        </div>

        {isCheckingLink ? (
          <p className="text-sm text-muted-foreground">
            {t("resetPassword.checking")}
          </p>
        ) : linkError ? (
          <>
            <p className="text-sm text-destructive" role="alert">
              {linkError}
            </p>
            <Button asChild className="h-10 w-full">
              <Link to="/forgot-password">{t("resetPassword.requestNew")}</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password" className="text-xs">
                {t("resetPassword.newPassword")}
              </Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-password-confirm" className="text-xs">
                {t("resetPassword.confirmPassword")}
              </Label>
              <Input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9"
                required
                disabled={isSubmitting}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting
                ? t("resetPassword.submitting")
                : t("resetPassword.submit")}
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
