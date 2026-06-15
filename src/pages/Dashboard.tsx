import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  BookOpen,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  Clock,
  FileText,
  MapPin,
  Users,
  X,
} from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";
import {
  approveRescheduleRequest,
  listClasses,
  listRescheduleRequests,
  listSessions,
  listTeacherStudents,
  rejectRescheduleRequest,
  type RescheduleRequest,
  type SessionItem,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const displayName = user?.name ?? "there";
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);

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

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => approveRescheduleRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
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

  const studentCount = teacherStudentsQuery.data?.length ?? 0;

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
    { label: "Students", value: studentCount, icon: Users },
    { label: "Classes", value: classes.length, icon: BookOpen },
    { label: "Today's sessions", value: todaysSessions.length, icon: CalendarIcon },
    { label: "Pending assignments", value: 0, icon: FileText },
  ];

  const studentStats = [
    { label: "Classes joined", value: classes.length, icon: BookOpen },
    { label: "Today's sessions", value: todaysSessions.length, icon: CalendarIcon },
    {
      label: "Upcoming sessions",
      value: upcomingSessions.length,
      icon: CalendarDays,
    },
  ];

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
        <h1 className="page-header">Dashboard</h1>
        <p className="page-subtitle">Welcome back, {displayName}.</p>
      </div>

      <div
        className={`grid gap-4 ${
          isTeacher ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
        }`}
      >
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/60 shadow-sm">
            <CardContent className="p-4">
              <stat.icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold tracking-tight">
                {isLoading ? "—" : stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isTeacher ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Pending reschedule requests
              {pendingRequests.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pendingRequests.length})
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRescheduleQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading requests…</p>
            ) : pendingRescheduleQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {(pendingRescheduleQuery.error as Error).message}
              </p>
            ) : pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending requests. Students can request a new time from Calendar.
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
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {isTeacher ? "Upcoming schedule" : "Your upcoming sessions"}
          </CardTitle>
          <Link
            to="/calendar"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            View calendar
          </Link>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading schedule…</p>
          ) : upcomingSessions.length === 0 ? (
            <PageEmptyState
              icon={CalendarIcon}
              title={isTeacher ? "No upcoming sessions" : "No sessions scheduled"}
              description={
                isTeacher
                  ? "Create sessions on the Calendar page once you have classes."
                  : "Sessions for your joined classes will appear here and on the Calendar."
              }
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
                      <p className="font-semibold">{session.title}</p>
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
                  </div>
                </div>
              ))}
            </div>
          )}
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
