import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { loginUser } from "@/lib/api";
import { getPostLoginPath } from "@/lib/roles";
import { AuthShell } from "@/components/AuthShell";
import { AuthDivider, GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const data = await loginUser(email.trim(), password);
      login(data.token, {
        id: data.user.id,
        name: data.user.display_name,
        role: data.user.role,
        email: data.user.email,
        avatar: data.user.avatar_url ?? undefined,
      });
      navigate(getPostLoginPath(data.user.role, fromPath), { replace: true });
    } catch {
      setErrorMessage(t("login.error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell title={t("login.shellTitle")} subtitle={t("login.shellSubtitle")}>
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            EduSync
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs">
              {t("login.email")}
            </Label>
            <Input
              id="login-email"
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
          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-xs">
              {t("login.password")}
            </Label>
            <Input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-9"
              required
              disabled={isLoading}
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={isLoading}>
          {isLoading ? t("login.submitting") : t("login.submit")}
        </Button>

        <AuthDivider />
        <GoogleSignInButton />

        <p className="text-center text-xs text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link to="/register" className="font-medium text-foreground hover:underline">
            {t("login.register")}
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            {t("login.backHome")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
