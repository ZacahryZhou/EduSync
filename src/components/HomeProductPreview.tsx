import {
  BookOpen,
  Calendar,
  GraduationCap,
  LayoutDashboard,
  Users,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Calendar, label: "Calendar", active: false },
  { icon: BookOpen, label: "Classes", active: false },
  { icon: Users, label: "Students", active: false },
];

const stats = [
  { label: "Active classes", value: "3" },
  { label: "Students", value: "18" },
  { label: "Sessions this week", value: "6" },
];

const sessions = [
  { title: "Algebra II", time: "09:00 – 10:30", room: "Room 204" },
  { title: "English Writing", time: "14:00 – 15:00", room: "Lab B" },
];

/** Static product mock for the marketing homepage — mirrors in-app layout. */
export function HomeProductPreview() {
  return (
    <div className="landing-preview relative mx-auto w-full max-w-xl">
      <div className="absolute -left-6 top-10 h-28 w-28 rounded-full bg-primary/15 blur-2xl" />
      <div className="absolute -right-4 bottom-8 h-32 w-32 rounded-full bg-accent/80 blur-3xl" />

      <div className="landing-preview-shell overflow-hidden rounded-[1.75rem] border border-white/70 bg-card/90 shadow-2xl shadow-slate-900/10 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
          <span className="ml-3 text-[11px] text-muted-foreground">
            edusync.app/dashboard
          </span>
        </div>

        <div className="flex min-h-[22rem]">
          <aside className="hidden w-36 shrink-0 border-r border-border/60 bg-sidebar/80 p-3 sm:block">
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
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
                    item.active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              ))}
            </div>
          </aside>

          <div className="flex-1 p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Teacher workspace
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">
                Good morning, Ms. Chen
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border/70 bg-background/80 p-2.5"
                >
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-base font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-background/80 p-3">
              <p className="text-xs font-medium">Upcoming sessions</p>
              <div className="mt-2 space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.title}
                    className="flex items-center justify-between rounded-lg bg-card px-2.5 py-2 text-[11px]"
                  >
                    <div>
                      <p className="font-medium">{session.title}</p>
                      <p className="text-muted-foreground">{session.time}</p>
                    </div>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                      {session.room}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
