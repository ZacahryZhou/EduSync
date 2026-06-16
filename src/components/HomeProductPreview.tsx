import {
  Bot,
  Calendar,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: Calendar, label: "Calendar", active: true },
  { icon: Bot, label: "AI Assistant", active: false, ai: true },
  { icon: Users, label: "Students", active: false },
];

const aiMessages = [
  {
    role: "user" as const,
    text: "Add a weekly Algebra session Tuesdays 4pm for Class 8A",
  },
  {
    role: "assistant" as const,
    text: "I can draft 6 Tuesday sessions through May. Review times and confirm before saving.",
  },
];

/** Static product mock — highlights AI assistant beside the teacher calendar. */
export function HomeProductPreview() {
  return (
    <div className="landing-preview relative mx-auto w-full max-w-xl">
      <div className="absolute -left-8 top-6 h-32 w-32 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="absolute -right-6 bottom-4 h-36 w-36 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="landing-preview-shell overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-2xl shadow-neutral-900/10">
        <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
          <span className="ml-3 text-[11px] text-muted-foreground">edusync.app/calendar</span>
        </div>

        <div className="flex min-h-[24rem]">
          <aside className="hidden w-[7.5rem] shrink-0 border-r border-border/60 bg-sidebar p-3 sm:block">
            <div className="mb-4 flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                <GraduationCap className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-xs font-semibold">EduSync</span>
            </div>
            <div className="space-y-1">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${
                    item.active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground"
                  } ${item.ai ? "text-violet-700 dark:text-violet-300" : ""}`}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
            <div className="flex-1 border-b border-border/60 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Calendar
                  </p>
                  <h3 className="text-sm font-semibold tracking-tight">June 2026</h3>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] text-muted-foreground">
                  3 sessions
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-muted-foreground">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-md text-[9px] ${
                      i === 10
                        ? "bg-primary font-medium text-primary-foreground"
                        : i === 3 || i === 17
                          ? "bg-violet-500/15 font-medium text-violet-900 dark:text-violet-100"
                          : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-border/70 bg-background p-2.5">
                <p className="text-[10px] font-medium">Tue · Algebra II</p>
                <p className="text-[9px] text-muted-foreground">16:00 – 17:30 · Room 204</p>
              </div>
            </div>

            <div className="flex w-full flex-col bg-gradient-to-b from-violet-500/[0.06] to-transparent p-4 lg:w-[52%]">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold">AI Assistant</p>
                  <p className="text-[9px] text-muted-foreground">Beta · read-only planning</p>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                {aiMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`max-w-[95%] rounded-xl px-2.5 py-2 text-[10px] leading-relaxed ${
                      message.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "border border-violet-500/20 bg-card text-foreground"
                    }`}
                  >
                    {message.text}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-2">
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground">
                  Ask about schedule, classes, students…
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
