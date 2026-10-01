import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { forgotPassword } from "@/lib/api";

/**
 * "Forgot password?" entry point — just asks for an email and calls the
 * backend, which always returns the same generic message (see
 * backend/app/blueprints/auth.py forgot_password) so this page can't be
 * used to check which emails have accounts.
 * 忘记密码入口：只需要邮箱，后端永远返回同一句通用提示（不会暴露邮箱是否存在）。
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);
    try {
      const result = await forgotPassword(email.trim());
      setSentMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("forgotPassword.error"),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title={t("forgotPassword.shellTitle")}
      subtitle={t("forgotPassword.shellSubtitle")}
    >
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            EduSync
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("forgotPassword.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("forgotPassword.subtitle")}
          </p>
        </div>

        {sentMessage ? (
          <p className="rounded-md border border-border bg-secondary/50 p-3 text-sm text-foreground">
            {sentMessage}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs">
                {t("login.email")}
              </Label>
              <Input
                id="forgot-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-9"
                required
                disabled={isLoading}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" className="h-10 w-full" disabled={isLoading}>
              {isLoading
                ? t("forgotPassword.submitting")
                : t("forgotPassword.submit")}
            </Button>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="font-medium text-foreground hover:underline">
            {t("forgotPassword.backToLogin")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
