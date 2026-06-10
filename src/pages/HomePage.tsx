import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductPreview } from "@/components/HomeProductPreview";
import { useAuth } from "@/context/AuthContext";

const features = [
  {
    icon: BookOpen,
    title: "Classrooms with invite codes",
    description:
      "Teachers create a class in seconds and share a short code so students can join without manual setup.",
  },
  {
    icon: CalendarDays,
    title: "One calendar for everyone",
    description:
      "Schedule lessons once on the teacher calendar and students immediately see what is coming up next.",
  },
  {
    icon: UserRound,
    title: "Role-aware dashboards",
    description:
      "Teachers track classes and sessions. Students land on a focused view of their own schedule and enrollments.",
  },
];

const teacherSteps = [
  "Create your teacher account",
  "Set up classes and share invite codes",
  "Add sessions to the shared calendar",
];

const studentSteps = [
  "Register as a student",
  "Join a class with the teacher's code",
  "Open your dashboard and calendar anytime",
];

const mvpHighlights = [
  "Teacher & student registration",
  "Class creation and enrollment",
  "Shared session calendar",
  "Role-based dashboard views",
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing-page min-h-screen">
      <header className="landing-nav sticky top-0 z-20 border-b border-white/60 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">EduSync</p>
              <p className="text-xs text-muted-foreground">
                Classes, schedules, and students — synced
              </p>
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
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Built for teachers and students
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              The calm workspace for classes, schedules, and learning flow.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              EduSync brings class management and lesson planning into one
              lightweight platform. Teachers organize. Students follow along.
              Everyone stays on the same page.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="shadow-sm shadow-primary/20" asChild>
                <Link to="/register">
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {mvpHighlights.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-fade-in [animation-delay:120ms]">
            <HomeProductPreview />
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-primary">
                Why EduSync
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Designed around how tutoring teams actually work
              </h2>
              <p className="mt-3 text-muted-foreground">
                Not another bloated LMS. EduSync focuses on the essentials your
                MVP needs: getting classes online, putting sessions on a calendar,
                and giving each role a clear home.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="stat-card animate-fade-in"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card rounded-3xl p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                For teachers
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Run your classes from one dashboard
              </h3>
              <ul className="mt-6 space-y-3">
                {teacherSteps.map((step) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {step}
                  </li>
                ))}
              </ul>
              <Button className="mt-8" asChild>
                <Link to="/register">Create teacher account</Link>
              </Button>
            </div>

            <div className="glass-card rounded-3xl p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                For students
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Join a class and never miss a session
              </h3>
              <ul className="mt-6 space-y-3">
                {studentSteps.map((step) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
          <div className="landing-cta rounded-[2rem] px-8 py-10 text-center md:px-12">
            <h2 className="text-3xl font-semibold tracking-tight text-primary-foreground">
              Ready to try EduSync with your class?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/85 md:text-base">
              Set up a teacher account, create your first class, and invite
              students in minutes. Assignments, tuition, and notifications are
              on the roadmap — the core learning workflow is live now.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white text-primary hover:bg-white/90"
                asChild
              >
                <Link to="/register">Create account</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-primary-foreground hover:bg-white/10"
                asChild
              >
                <Link to="/login">Login</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-card/40 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground md:flex-row">
          <p>EduSync · Education management for teachers and students</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-foreground">
              Login
            </Link>
            <Link to="/register" className="hover:text-foreground">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
