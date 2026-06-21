import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
};

/** Split auth layout: form panel + photography panel. */
export function AuthShell({ children, title, subtitle }: AuthShellProps) {
  return (
    <div className="auth-surface min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src="/images/auth-students.jpg"
          alt="Students collaborating in a classroom"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-900/35 to-neutral-800/20" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <Link to="/" className="mb-8 inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">EduSync</span>
          </Link>
          <h2 className="max-w-md text-3xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-base font-semibold">EduSync</span>
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
