import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  BookOpen,
  Bell,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  Clock,
  FileText,
  FolderOpen,
  MapPin,
  Users,
  Video,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageEmptyState } from "@/components/PageEmptyState";
import { ScrollableList } from "@/components/ScrollableList";
import { OnboardingHint } from "@/components/OnboardingHint";
import { useAuth } from "@/context/AuthContext";
import {
  approveRescheduleRequest,
  getDashboardSummary,
  listClasses,
  listRecentMaterials,
  listRescheduleRequests,
  listSessions,
  listTeacherStudents,
  rejectRescheduleRequest,
  sessionDisplayTitle,
  type RescheduleRequest,
  type SessionItem,
} from "@/lib/api";
import { isStudentRole, isTeacherRole, normalizeRole } from "@/lib/roles";

function toMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatTimeLabel(value: string): string {
  return value.slice(0, 5);
}

function compareSessions(a: SessionItem, b: SessionItem): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  return a.start_time.localeCompare(b.start_time);
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const displayName = user?.name ?? "there";
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const isStudent = isStudentRole(role);

  const [rejectTarget, setRejectTarget] = useState<RescheduleRequest | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");

  const today = new Date();
  const todayKey = toDateKey(today);
  const monthKey = toMonthKey(today);

  const classesQueryKey = ["classes", user?.id, role] as const;
  const sessionsQueryKey = ["sessions", monthKey, user?.id, role] as const;

  const classesQuery = useQuery({
    queryKey: classesQueryKey,
    queryFn: listClasses,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const sessionsQuery = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => listSessions(monthKey),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const pendingRescheduleQuery = useQuery({
    queryKey: ["reschedule-requests", "pending", user?.id] as const,
    queryFn: () => listRescheduleRequests("pending"),
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 30_000,
  });

  const teacherStudentsQuery = useQuery({
    queryKey: ["teacher-students", user?.id] as const,
    queryFn: listTeacherStudents,
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 60_000,
  });

  const dashboardSummaryQuery = useQuery({
    queryKey: ["dashboard-summary", user?.id, role] as const,
    queryFn: getDashboardSummary,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });

  const recentMaterialsQuery = useQuery({
    queryKey: ["recent-materials", user?.id, role] as const,
    queryFn: () => listRecentMaterials(5),
    enabled: Boolean(user?.id && (isTeacher || isStudent)),
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => approveRescheduleRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Reschedule approved — calendar updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      requestId,
      feedback,
    }: {
      requestId: string;
      feedback?: string;
    }) => rejectRescheduleRequest(requestId, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setRejectTarget(null);
      setRejectFeedback("");
      toast.success("Reschedule request rejected");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const classes = classesQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const summary = dashboardSummaryQuery.data;

  const studentCount =
    teacherStudentsQuery.data?.total ??
    teacherStudentsQuery.data?.students?.length ??
    0;

  const openAssignments = summary?.open_assignments ?? 0;

  const pendingGrades = summary?.pending_grades ?? 0;
  const pendingRescheduleCount =
    summary?.pending_reschedules ?? pendingRescheduleQuery.data?.length ?? 0;
  const unreadNotifications = summary?.unread_notifications ?? 0;
  const recentNotifications = summary?.recent_notifications ?? [];
  const pendingGradeItems = summary?.pending_grade_items ?? [];
  const openAssignmentItems = summary?.open_assignment_items ?? [];

  const todaysSessions = useMemo(
    () => sessions.filter((s) => s.date === todayKey).sort(compareSessions),
    [sessions, todayKey],
  );

  const upcomingSessions = useMemo(() => {
    return sessions
      .filter((s) => s.date >= todayKey)
      .sort(compareSessions)
      .slice(0, 8);
  }, [sessions, todayKey]);

  const teacherStats = [
    { key: "students", value: studentCount, icon: Users },
    { key: "classes", value: classes.length, icon: BookOpen },
    { key: "todaySessions", value: todaysSessions.length, icon: CalendarIcon },
    { key: "pendingGrades", value: pendingGrades, icon: FileText },
  ] as const;

  const studentStats = [
    { key: "classesJoined", value: classes.length, icon: BookOpen },
    { key: "openAssignments", value: openAssignments, icon: FileText },
    { key: "todaySessions", value: todaysSessions.length, icon: CalendarIcon },
    { key: "upcomingSessions", value: upcomingSessions.length, icon: CalendarDays },
  ] as const;

  const stats = isTeacher ? teacherStats : studentStats;

  const pendingRequests = pendingRescheduleQuery.data ?? [];

  const isLoading = classesQuery.isLoading || sessionsQuery.isLoading;
  const loadError =
    (classesQuery.error as Error | null)?.message ??
    (sessionsQuery.error as Error | null)?.message ??
    null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="page-header">{t("dashboard.title")}</h1>
        <p className="page-subtitle">{t("dashboard.welcome", { name: displayName })}</p>
      </div>

      <OnboardingHint
        id={isTeacher ? "dashboard-teacher" : "dashboard-student"}
        title={isTeacher ? "Tip: start with one class and one test student" : "Tip: your teacher controls classes and assignments"}
        description={
          isTeacher
            ? "Create a class, share the class code, schedule a session, then try one assignment. Dashboard collects pending grades, reschedule requests, notifications, and upcoming sessions."
            : "After you join a class, this page shows upcoming sessions, open assignments, recent materials, and notifications."
        }
      />

      <div
        className={`grid gap-4 ${
          isTeacher ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {stats.map((stat) => (
          <Card key={stat.key} className="border-border/60 shadow-sm">
            <CardContent className="p-4">
              <stat.icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold tracking-tight">
                {isLoading ||
                (dashboardSummaryQuery.isLoading &&
                  (stat.key === "openAssignments" ||
                    stat.key === "pendingGrades"))
                  ? "—"
                  : stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`dashboard.stats.${stat.key}`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isStudent ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base font-semibold">{t("dashboard.homework")}</CardTitle>
            <Link
              to="/assignments"
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              {t("dashboard.viewAssignments")}
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollableList className="px-6 pb-6">
            {dashboardSummaryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.homeworkLoading")}</p>
            ) : dashboardSummaryQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {(dashboardSummaryQuery.error as Error).message}
              </p>
            ) : openAssignments === 0 ? (
              <p className="text-sm text-muted-foreground">
                {classes.length === 0
                  ? t("dashboard.homeworkEmpty")
                  : t("dashboard.homeworkDone")}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.homeworkPending", { count: openAssignments })}
                </p>
                <ul className="space-y-2">
                  {openAssignmentItems.map((item) => (
                    <li
                      key={item.assignment_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.class_name}
                          {item.past_due ? ` · ${t("dashboard.pastDue")}` : null}
                        </p>
                      </div>
                      {item.due_date ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("dashboard.dueLabel", {
                            date: formatDueLabel(item.due_date),
                          })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </ScrollableList>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.recentNotifications")}
            {unreadNotifications > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                ({unreadNotifications})
              </span>
            ) : null}
          </CardTitle>
          <Link
            to="/notifications"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            {t("dashboard.viewNotifications")}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollableList className="px-6 pb-6">
          {dashboardSummaryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : dashboardSummaryQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {(dashboardSummaryQuery.error as Error).message}
            </p>
          ) : recentNotifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.notificationsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {recentNotifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    item.read
                      ? "border-border/50"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <p className="font-medium">{item.title}</p>
                  {item.body ? (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {item.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          </ScrollableList>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base font-semibold">{t("dashboard.recentMaterials")}</CardTitle>
          <Link
            to="/classes"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            {t("dashboard.openClasses")}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollableList className="px-6 pb-6">
          {recentMaterialsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.materialsLoading")}</p>
          ) : recentMaterialsQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.materialsEmptyTeacher")}
            </p>
          ) : (recentMaterialsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isTeacher
                ? t("dashboard.materialsEmptyTeacher")
                : t("dashboard.materialsEmptyStudent")}
            </p>
          ) : (
            <ul className="space-y-2">
              {recentMaterialsQuery.data?.map((material) => (
                <li
                  key={material.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{material.title}</span>
                  </div>
                  {material.download_url ? (
                    <a
                      href={material.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      {t("dashboard.download")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          </ScrollableList>
        </CardContent>
      </Card>

      {isTeacher ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.pendingGrades")}
              {pendingGrades > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pendingGrades})
                </span>
              ) : null}
            </CardTitle>
            <Link
              to="/assignments"
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              {t("dashboard.gradeInAssignments")}
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollableList className="px-6 pb-6">
            {dashboardSummaryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : dashboardSummaryQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {(dashboardSummaryQuery.error as Error).message}
              </p>
            ) : pendingGradeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.pendingGradesEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {pendingGradeItems.map((item) => (
                  <li
                    key={item.submission_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.assignment_title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.student_name} · {item.class_name}
                      </p>
                    </div>
                    {item.submitted_at ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("dashboard.submittedAt", {
                          date: formatJoinedAt(item.submitted_at),
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            </ScrollableList>
          </CardContent>
        </Card>
      ) : null}

      {isTeacher ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.pendingReschedule")}
              {pendingRescheduleCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pendingRescheduleCount})
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollableList className="px-6 pb-6">
            {pendingRescheduleQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading requests…</p>
            ) : pendingRescheduleQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {(pendingRescheduleQuery.error as Error).message}
              </p>
            ) : pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.pendingRescheduleEmpty")}
              </p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-border/60 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{request.session_title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {request.student_name} · {request.class_name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted {formatJoinedAt(request.created_at)}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Current: </span>
                        {request.session_date},{" "}
                        {formatTimeLabel(request.session_start)}–
                        {formatTimeLabel(request.session_end)}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Proposed: </span>
                        {request.proposed_date},{" "}
                        {formatTimeLabel(request.proposed_start)}–
                        {formatTimeLabel(request.proposed_end)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Reason: </span>
                      {request.reason}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={
                          approveMutation.isPending || rejectMutation.isPending
                        }
                        onClick={() => approveMutation.mutate(request.id)}
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={
                          approveMutation.isPending || rejectMutation.isPending
                        }
                        onClick={() => {
                          setRejectTarget(request);
                          setRejectFeedback("");
                        }}
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </ScrollableList>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">{t("dashboard.upcoming")}</CardTitle>
          <Link
            to="/calendar"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            {t("nav.calendar")}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollableList size="lg" className="px-6 pb-6">
          {loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : upcomingSessions.length === 0 ? (
            <PageEmptyState
              icon={CalendarIcon}
              title={t("dashboard.upcomingEmpty")}
              description={t("dashboard.upcomingEmpty")}
            />
          ) : (
            <div className="space-y-3">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-border/60 p-4 shadow-sm"
                  style={{ borderLeftWidth: 4, borderLeftColor: session.color }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{sessionDisplayTitle(session)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.class_name}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(session.date), "EEE, MMM d")}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {formatTimeLabel(session.start_time)} –{" "}
                      {formatTimeLabel(session.end_time)}
                    </span>
                    {session.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {session.location}
                      </span>
                    ) : null}
                    {session.meeting_url ? (
                      <a
                        href={session.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                      >
                        <Video className="h-4 w-4" />
                        {t("calendar.joinMeeting")}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          </ScrollableList>
        </CardContent>
      </Card>

      {isTeacher ? (
        <Dialog
          open={rejectTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTarget(null);
              setRejectFeedback("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject reschedule request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                The session will keep its current time. You can add an optional
                message for the student.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reject-feedback">Message (optional)</Label>
                <Textarea
                  id="reject-feedback"
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  rows={3}
                  disabled={rejectMutation.isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={rejectMutation.isPending || !rejectTarget}
                onClick={() => {
                  if (rejectTarget) {
                    rejectMutation.mutate({
                      requestId: rejectTarget.id,
                      feedback: rejectFeedback.trim() || undefined,
                    });
                  }
                }}
              >
                {rejectMutation.isPending ? "Rejecting…" : "Reject request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function formatJoinedAt(iso?: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDueLabel(value: string): string {
  try {
    return format(parseISO(value), "MMM d");
  } catch {
    return value.slice(0, 10);
  }
}
