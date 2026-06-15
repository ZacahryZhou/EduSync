import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, registerStudent, registerTeacher } from "@/lib/api";
import { STUDENT_GRADE_OPTIONS } from "@/lib/student-grades";
import { useAuth } from "@/context/AuthContext";
import { getPostLoginPath } from "@/lib/roles";
import { AuthShell } from "@/components/AuthShell";
import { AuthDivider, GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "">("");
  const [grade, setGrade] = useState("");
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
        await registerStudent(email, password, name, grade || undefined);
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
      navigate(getPostLoginPath(data.user.role), { replace: true });
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
    <AuthShell
      title="Start organizing your classes today"
      subtitle="Create a teacher or student account and get your classroom workflow running in minutes."
    >
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            EduSync
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
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

          {role === "student" ? (
            <div className="space-y-1.5">
              <Label htmlFor="register-grade" className="text-xs">
                Grade (optional)
              </Label>
              <select
                id="register-grade"
                name="grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                disabled={isLoading}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select grade</option>
                {STUDENT_GRADE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={isLoading}>
          {isLoading ? "Please wait…" : "Create account"}
        </Button>

        <AuthDivider />
        <GoogleSignInButton label="Sign up with Google" />

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground hover:underline">
            Log in
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Back to home
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
