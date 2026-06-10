// this file is the login page for collecting user's email and password and submit to the backend//
// 1: user click the Login button and 2: invoke the handleSubmit function to submit the email and password to the backend//
//3: e.preventDefault() to prevent the default behavior of the form which is submitting to the server and reloading the page//
//4:setIsLoading(true) button become grey and LoginUser(email, password) senr HTTP request to the backend//

//注意需要检查后端需要先跑起来不然LoginUser发出请求会被拒绝//

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { loginUser } from "@/lib/api";
import { getPostLoginPath } from "@/lib/roles";

//这里相当于在页面渲染之前先把所有需要的工具和变量准备好//
export default function LoginPage() {
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

// because the name is different of the backend and the frontend, so we need to map the name to the backend and the frontend//
//把display_name映射为name//
    try {
      const data = await loginUser(email.trim(), password);
      // Backend returns display_name; AuthContext expects name.
      login(data.token, {
        id: data.user.id,
        name: data.user.display_name,
        role: data.user.role,
        email: data.user.email,
      });
      navigate(getPostLoginPath(data.user.role, fromPath), { replace: true });
    } catch {
      setErrorMessage("Invalid email or password, please try again");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-surface flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="auth-card"
      >
        {/* Auth card hierarchy / 登录卡片层级:
            brand label -> page title -> short helper text -> form. */}
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            EduSync
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Please use your email and password to login
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs">
              Email
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
              Password
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

        <Button type="submit" className="h-10 w-full shadow-sm shadow-primary/20" disabled={isLoading}>
          {isLoading ? "Logging in…" : "Login"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Register
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Back to home
          </Link>
        </p>
      </form>
    </div>
  );
}
