import { cn } from "@/lib/utils";

const AVAILABLE_NOW = [
  "Add them to a class roster by email (manual invite or future AI batch invite)",
  "See them on the Students page and class roster with an Invited badge",
  "Record tuition top-ups and track their balance",
  "Mark calendar attendance; present/late deducts from their balance",
  "Cancel an invite or remove them from a class",
  "Automatic enrollment when they sign up with the same email (balances carry over)",
] as const;

const REQUIRES_ACCOUNT = [
  "Assignments (receive, submit, or grade)",
  "Private notes and progress reports",
  "In-app notifications to the student",
  "AI assistant class rosters (only registered students appear)",
] as const;

type InvitedStudentLimitsNoticeProps = {
  /** compact: one paragraph; panel: two columns; inline: short line under forms */
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
        Invited students can use tuition and attendance now. Assignments, private notes,
        reports, and AI student lookups need a registered account.
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-sm text-muted-foreground",
          className,
        )}
      >
        <p className="font-medium text-foreground">Invited but not registered yet</p>
        <p className="mt-1">
          You can record tuition, mark attendance, and manage the roster now. Assignments,
          private notes, reports, and AI student lists unlock after they sign up with the
          same email.
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
      <p className="font-medium text-foreground">
        Invited students who have not registered yet
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        If they already have an EduSync account, they are added immediately and
        everything below works right away.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Available now
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            {AVAILABLE_NOW.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
            After they register
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            {REQUIRES_ACCOUNT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
