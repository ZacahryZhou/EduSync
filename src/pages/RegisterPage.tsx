import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, registerStudent, registerTeacher } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "">("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      if (role === "student") {
        await registerStudent(email, password, name);
      } else if (role === "teacher") {
        await registerTeacher(email, password, name);
      } else {
        setErrorMessage("Please select a role.");
        return;
      }

      const data = await loginUser(email, password);
      login(data.token, {
        id: data.user.id,
        name: data.user.display_name,
        role: data.user.role,
        email: data.user.email,
      });
      navigate("/", { replace: true });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Registration failed, please try again.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border/60 bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Register</h1>
          <p className="text-sm text-muted-foreground">
            Create your EduSync account
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="register-name" className="text-xs">
              Name
            </Label>
            <Input
              id="register-name"
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-9"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="register-email" className="text-xs">
              Email
            </Label>
            <Input
              id="register-email"
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
            <Label htmlFor="register-password" className="text-xs">
              Password
            </Label>
            <Input
              id="register-password"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-9"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="register-role" className="text-xs">
              Role
            </Label>
            <select
              id="register-role"
              name="role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "student" | "teacher" | "")
              }
              required
              disabled={isLoading}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                Select your role
              </option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Please wait…" : "Create account"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
