import { cn } from "@/lib/utils";

const AVAILABLE_NOW = [
  "Add them to a class roster by email",
  "Auto-create login: email + initial password 123456",
  "Record tuition top-ups and track their balance",
  "Mark calendar attendance; present/late deducts from their balance",
  "Cancel an invite or remove them from a class",
] as const;

const STUDENT_NEXT_STEPS = [
  "Log in at the app with their email and 123456 (they can change password later in settings when available)",
  "Assignments, submissions, and grading",
  "Private notes and progress reports for the teacher",
  "In-app notifications",
] as const;

type InvitedStudentLimitsNoticeProps = {
  variant?: "panel" | "compact" | "inline";
  className?: string;
};

export function InvitedStudentLimitsNotice({
  variant = "panel",
  className,
}: InvitedStudentLimitsNoticeProps) {
  if (variant === "inline") {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        New students get login email + initial password 123456. They should log in
        directly instead of registering again.
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-muted-foreground",
          className,
        )}
      >
        <p className="font-medium text-foreground">Student login created</p>
        <p className="mt-1">
          Tell the student to log in with this email and initial password{" "}
          <span className="font-mono text-foreground">123456</span>. Registration is not
          required.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm",
        className,
      )}
    >
      <p className="font-medium text-foreground">Adding students by email</p>
      <p className="mt-1 text-xs text-muted-foreground">
        If they already have an EduSync account, they are enrolled immediately and keep
        their existing password.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            What you do as teacher
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            {AVAILABLE_NOW.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-400">
            What the student does
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            {STUDENT_NEXT_STEPS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
