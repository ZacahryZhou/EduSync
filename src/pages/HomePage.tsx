import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductPreview } from "@/components/HomeProductPreview";
import { useAuth } from "@/context/AuthContext";

const aiPillars = [
  {
    icon: MessageSquareText,
    title: "Talk to plan your week",
    description:
      "Describe what you need in plain language — the AI helps draft sessions, check your calendar, and answer questions about your classes.",
    accent: "violet",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    description:
      "AI suggestions are read-only during beta. Nothing changes until you review and confirm — built for real classrooms, not autopilot.",
    accent: "slate",
  },
  {
    icon: BookOpen,
    title: "Grounded in your materials",
    description:
      "Coming soon: upload teaching resources so students can ask an AI that answers from your library — not random web guesses.",
    accent: "indigo",
  },
];

const workflowFeatures = [
  {
    icon: Bot,
    title: "AI assistant for teachers",
    description:
      "A copilot inside EduSync for scheduling, class questions, and daily teaching workflow — right next to your calendar.",
    highlight: true,
  },
  {
    icon: CalendarDays,
    title: "Shared calendar",
    description:
      "Schedule once on the teacher calendar. Students see upcoming sessions on their dashboard instantly.",
    highlight: false,
  },
  {
    icon: UserRound,
    title: "Classes & roles",
    description:
      "Invite codes, student accounts, and role-aware views — teachers manage, students follow along.",
    highlight: false,
  },
];

const teacherSteps = [
  "Create your teacher account",
  "Set up classes and share invite codes",
  "Use AI + calendar to plan sessions",
];

const studentSteps = [
  "Join with your teacher's class code",
  "See your schedule on the dashboard",
  "Soon: ask AI questions from class materials",
];

const heroHighlights = [
  "AI scheduling assistant (Beta)",
  "Shared class calendar",
  "Teacher & student workspaces",
  "Invite-code enrollment",
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing-page min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">EduSync</p>
              <p className="text-xs text-muted-foreground">AI-assisted teaching workspace</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero-ai relative overflow-hidden border-b border-border/50">
          <div className="pointer-events-none absolute inset-0 landing-hero-ai-mesh" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-900 dark:text-violet-100">
                <Sparkles className="h-3.5 w-3.5" />
                AI-assisted · Built for tutors & small classes
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
                Teach with clarity.
                <span className="mt-1 block text-violet-700 dark:text-violet-300">
                  Plan faster with AI beside you.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                EduSync combines class management, a shared calendar, and an AI assistant
                that helps teachers schedule, organize, and answer workflow questions —
                while students stay synced to what matters.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="gap-2 shadow-sm" asChild>
                  <Link to="/register">
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="bg-card/80" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {heroHighlights.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="animate-fade-in [animation-delay:120ms]">
              <HomeProductPreview />
            </div>
          </div>
        </section>

        <section className="border-b border-border/70 bg-secondary/20 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                <Bot className="h-4 w-4" />
                AI at the center
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Not just another LMS — an assistant that knows your classroom
              </h2>
              <p className="mt-3 text-muted-foreground">
                EduSync is designed around how tutors actually work: fewer tabs, less
                admin, and an AI layer that supports planning without taking over.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {aiPillars.map((pillar, index) => (
                <div
                  key={pillar.title}
                  className="stat-card animate-fade-in text-left"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      pillar.accent === "violet"
                        ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        : pillar.accent === "indigo"
                          ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          : "bg-secondary text-foreground"
                    }`}
                  >
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Everything connected
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                AI, calendar, and classes in one calm workspace
              </h2>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {workflowFeatures.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    feature.highlight
                      ? "border-violet-500/30 bg-gradient-to-br from-violet-500/[0.08] via-card to-card shadow-sm"
                      : "border-border/70 bg-card shadow-sm"
                  }`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      feature.highlight
                        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  {feature.highlight ? (
                    <span className="mt-4 inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
                      <Zap className="h-3 w-3" />
                      Core differentiator
                    </span>
                  ) : null}
                  <h3 className={`font-semibold ${feature.highlight ? "mt-2" : "mt-4"} text-lg`}>
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card rounded-3xl p-8 transition-shadow hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                For teachers
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Run classes with AI at your side
              </h3>
              <ul className="mt-6 space-y-3">
                {teacherSteps.map((step) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    {step}
                  </li>
                ))}
              </ul>
              <Button className="mt-8" asChild>
                <Link to="/register">Create teacher account</Link>
              </Button>
            </div>

            <div className="glass-card rounded-3xl p-8 transition-shadow hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                For students
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Stay on schedule — AI help is coming
              </h3>
              <ul className="mt-6 space-y-3">
                {studentSteps.map((step) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    {step}
                  </li>
                ))}
              </ul>
              <Button className="mt-8" variant="outline" asChild>
                <Link to="/register">Join as a student</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="landing-cta-ai rounded-[2rem] px-8 py-10 text-center md:px-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Ready to teach with AI-assisted workflow?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
              Create a teacher account, set up your first class, and try the AI assistant
              on your calendar. Core scheduling is live — more AI features are on the way.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white text-foreground hover:bg-white/90"
                asChild
              >
                <Link to="/register">Create account</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
                asChild
              >
                <Link to="/login">Login</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-card/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="text-center md:text-left">
            <p>EduSync · AI-assisted education management</p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Classes, calendar, and intelligent planning for teachers
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="transition-colors hover:text-foreground">
              Login
            </Link>
            <Link to="/register" className="transition-colors hover:text-foreground">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
