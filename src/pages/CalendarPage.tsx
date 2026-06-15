import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bot,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageEmptyState } from "@/components/PageEmptyState";
import { useAuth } from "@/context/AuthContext";
import {
  createRescheduleRequest,
  createSession,
  deleteSession,
  listClasses,
  listRescheduleRequests,
  listSessions,
  updateSession,
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

function toTimeInputValue(value: string): string {
  return value.slice(0, 5);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function validateTimeRange(start: string, end: string): string | null {
  if (timeToMinutes(end) <= timeToMinutes(start)) {
    return "End time must be after start time";
  }
  return null;
}

function compareSessionsByTime(a: SessionItem, b: SessionItem): number {
  return a.start_time.localeCompare(b.start_time);
}

function rescheduleStatusLabel(status: RescheduleRequest["status"]): string {
  if (status === "pending") {
    return "Reschedule pending";
  }
  if (status === "approved") {
    return "Reschedule approved";
  }
  return "Reschedule rejected";
}

function rescheduleStatusClass(status: RescheduleRequest["status"]): string {
  if (status === "pending") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (status === "approved") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-muted text-muted-foreground";
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function CalendarPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const isStudent = isStudentRole(role);

  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState(toDateKey(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSessionDate, setEditSessionDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("10:00");
  const [editLocation, setEditLocation] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<SessionItem | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState<SessionItem | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [proposedStart, setProposedStart] = useState("09:00");
  const [proposedEnd, setProposedEnd] = useState("10:00");
  const [rescheduleReason, setRescheduleReason] = useState("");

  const queryClient = useQueryClient();

  const monthKey = toMonthKey(calendarMonth);
  const classesQueryKey = ["classes", user?.id, role] as const;
  const sessionsQueryKey = ["sessions", monthKey, user?.id, role] as const;

  const classesQuery = useQuery({
    queryKey: classesQueryKey,
    queryFn: listClasses,
    enabled: Boolean(user?.id) && isTeacher,
  });

  const sessionsQuery = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => listSessions(monthKey),
    enabled: Boolean(user?.id),
  });

  const rescheduleQuery = useQuery({
    queryKey: ["reschedule-requests", user?.id, role] as const,
    queryFn: () => listRescheduleRequests(),
    enabled: Boolean(user?.id && isStudent),
    staleTime: 30_000,
  });

  const teacherPendingRescheduleQuery = useQuery({
    queryKey: ["reschedule-requests", "pending", user?.id] as const,
    queryFn: () => listRescheduleRequests("pending"),
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setCreateOpen(false);
      setTitle("");
      setLocation("");
      const createdDate = parseDateKey(created.date);
      setSelectedDate(createdDate);
      setCalendarMonth(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
      toast.success(
        `Session scheduled for ${format(createdDate, "MMM d")} at ${formatTimeLabel(created.start_time)}`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      sessionId,
      input,
    }: {
      sessionId: string;
      input: {
        title: string;
        date: string;
        start_time: string;
        end_time: string;
        location?: string;
      };
    }) => updateSession(sessionId, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setEditOpen(false);
      setEditingSession(null);
      if (updated.date !== toDateKey(selectedDate)) {
        const [year, month, day] = updated.date.split("-").map(Number);
        setSelectedDate(new Date(year, month - 1, day));
        setCalendarMonth(new Date(year, month - 1, 1));
      }
      toast.success("Session updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setDeleteTarget(null);
      toast.success("Session deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: createRescheduleRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setRescheduleOpen(false);
      setRescheduleSession(null);
      setRescheduleReason("");
      toast.success("Reschedule request submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const selectedDateKey = toDateKey(selectedDate);

  const sessionsOnSelectedDay = useMemo(
    () =>
      sessions
        .filter((session) => session.date === selectedDateKey)
        .sort(compareSessionsByTime),
    [sessions, selectedDateKey],
  );

  const daysWithSessions = useMemo(() => {
    const uniqueDates = [...new Set(sessions.map((session) => session.date))];
    return uniqueDates.map((dateStr) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(year, month - 1, day);
    });
  }, [sessions]);

  const teacherClasses = classesQuery.data ?? [];

  const rescheduleBySessionId = useMemo(() => {
    const map = new Map<string, RescheduleRequest>();
    for (const item of rescheduleQuery.data ?? []) {
      const existing = map.get(item.session_id);
      if (!existing || (item.created_at ?? "") > (existing.created_at ?? "")) {
        map.set(item.session_id, item);
      }
    }
    return map;
  }, [rescheduleQuery.data]);

  function openRescheduleDialog(session: SessionItem) {
    setRescheduleSession(session);
    setProposedDate(session.date);
    setProposedStart(toTimeInputValue(session.start_time));
    setProposedEnd(toTimeInputValue(session.end_time));
    setRescheduleReason("");
    setRescheduleOpen(true);
  }

  function handleRescheduleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rescheduleSession) {
      return;
    }
    const reason = rescheduleReason.trim();
    if (!reason) {
      toast.error("Please provide a reason");
      return;
    }
    const timeError = validateTimeRange(proposedStart, proposedEnd);
    if (timeError) {
      toast.error(timeError);
      return;
    }
    rescheduleMutation.mutate({
      session_id: rescheduleSession.id,
      proposed_date: proposedDate,
      proposed_start: proposedStart,
      proposed_end: proposedEnd,
      reason,
    });
  }

  function openCreateDialog() {
    setSessionDate(selectedDateKey);
    if (!classId && teacherClasses.length > 0) {
      setClassId(teacherClasses[0].id);
    }
    setCreateOpen(true);
  }

  function openEditDialog(session: SessionItem) {
    setEditingSession(session);
    setEditTitle(session.title);
    setEditSessionDate(session.date);
    setEditStartTime(toTimeInputValue(session.start_time));
    setEditEndTime(toTimeInputValue(session.end_time));
    setEditLocation(session.location ?? "");
    setEditOpen(true);
  }

  function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!classId) {
      toast.error("Please select a class");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }
    const timeError = validateTimeRange(startTime, endTime);
    if (timeError) {
      toast.error(timeError);
      return;
    }
    createMutation.mutate({
      class_id: classId,
      title: trimmedTitle,
      date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      location: location.trim() || undefined,
    });
  }

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingSession) {
      return;
    }
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }
    const timeError = validateTimeRange(editStartTime, editEndTime);
    if (timeError) {
      toast.error(timeError);
      return;
    }
    updateMutation.mutate({
      sessionId: editingSession.id,
      input: {
        title: trimmedTitle,
        date: editSessionDate,
        start_time: editStartTime,
        end_time: editEndTime,
        location: editLocation.trim() || undefined,
      },
    });
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">Calendar</h1>
          <p className="page-subtitle">
            {isTeacher
              ? "Pick a day, add sessions, and manage your schedule"
              : "View sessions for classes you have joined"}
          </p>
        </div>
        {isTeacher ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={openCreateDialog}
                disabled={teacherClasses.length === 0}
              >
                <Plus className="h-4 w-4" /> Add Session
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateSubmit}>
                <DialogHeader>
                  <DialogTitle>New session</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <Label>Class</Label>
                    <Select
                      value={classId}
                      onValueChange={setClassId}
                      disabled={createMutation.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {teacherClasses.map((classItem) => (
                          <SelectItem key={classItem.id} value={classItem.id}>
                            {classItem.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="session-title">Title</Label>
                    <Input
                      id="session-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Algebra review"
                      required
                      disabled={createMutation.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="session-date">Date</Label>
                    <Input
                      id="session-date"
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      required
                      disabled={createMutation.isPending}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="start-time">Start time</Label>
                      <Input
                        id="start-time"
                        type="time"
                        step={60}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                        disabled={createMutation.isPending}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="end-time">End time</Label>
                      <Input
                        id="end-time"
                        type="time"
                        step={60}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                        disabled={createMutation.isPending}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set date and times to the minute. Joined students see this on
                    their Calendar and Dashboard.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="session-location">Location</Label>
                    <Input
                      id="session-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Room 201"
                      disabled={createMutation.isPending}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Saving…" : "Save session"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {isTeacher && teacherClasses.length === 0 && !classesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Create a class first on the Classes page before scheduling sessions.
        </p>
      ) : null}

      <div className="space-y-5">
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="shrink-0 border-b border-border/60 bg-muted/30 p-3 sm:p-4 lg:border-b-0 lg:border-r">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                  }
                }}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                modifiers={{ hasSession: daysWithSessions }}
                modifiersClassNames={{
                  hasSession:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
                }}
                className="p-0"
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-5">
                <p className="text-base font-semibold tracking-tight">
                  {format(selectedDate, "EEEE, MMM d, yyyy")}
                  {sessionsOnSelectedDay.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {sessionsOnSelectedDay.length} session
                      {sessionsOnSelectedDay.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 max-h-[min(22rem,calc(100dvh-14rem))] lg:max-h-none">
                {sessionsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading sessions…</p>
                ) : sessionsQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {(sessionsQuery.error as Error).message}
                  </p>
                ) : sessionsOnSelectedDay.length === 0 ? (
                  <PageEmptyState
                    icon={CalendarIcon}
                    title="No sessions on this day"
                    description={
                      isTeacher
                        ? "Select another day or add a new session."
                        : "No classes are scheduled for this day."
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {sessionsOnSelectedDay.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-lg border border-border/50 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
                        style={{ borderLeftWidth: 3, borderLeftColor: session.color }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug">
                              {session.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {session.class_name}
                            </p>
                            {isStudent ? (
                              (() => {
                                const request = rescheduleBySessionId.get(session.id);
                                if (!request) {
                                  return null;
                                }
                                return (
                                  <span
                                    className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${rescheduleStatusClass(request.status)}`}
                                  >
                                    {rescheduleStatusLabel(request.status)}
                                  </span>
                                );
                              })()
                            ) : null}
                          </div>
                          {isTeacher ? (
                            <div className="flex shrink-0 gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Edit ${session.title}`}
                                onClick={() => openEditDialog(session)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                aria-label={`Delete ${session.title}`}
                                onClick={() => setDeleteTarget(session)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : isStudent ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 shrink-0 gap-1 px-2 text-xs"
                              disabled={
                                rescheduleBySessionId.get(session.id)?.status === "pending"
                              }
                              onClick={() => openRescheduleDialog(session)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Reschedule
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatTimeLabel(session.start_time)}–
                            {formatTimeLabel(session.end_time)}
                          </span>
                          {session.location ? (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {session.location}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {isTeacher ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Assistant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-sm text-muted-foreground">
                  Smart tools for lesson planning and class insights — coming soon.
                </p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    Draft session plans from your syllabus
                  </li>
                  <li className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    Summarize student progress before class
                  </li>
                  <li className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    Suggest follow-up after each session
                  </li>
                </ul>
                <Button type="button" size="sm" variant="outline" className="w-full" disabled>
                  Coming soon
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Course updates
                  </CardTitle>
                  {(teacherPendingRescheduleQuery.data?.length ?? 0) > 0 ? (
                    <Link
                      to="/"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Review on Dashboard
                    </Link>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="max-h-48 space-y-2 overflow-y-auto pt-0">
                {teacherPendingRescheduleQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading updates…</p>
                ) : teacherPendingRescheduleQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {(teacherPendingRescheduleQuery.error as Error).message}
                  </p>
                ) : (teacherPendingRescheduleQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No pending reschedule requests or course alerts right now.
                  </p>
                ) : (
                  teacherPendingRescheduleQuery.data?.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                    >
                      <p className="font-medium leading-snug">
                        {request.student_name} · {request.class_name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Reschedule {request.session_title}: {request.session_date}{" "}
                        {formatTimeLabel(request.session_start)} → {request.proposed_date}{" "}
                        {formatTimeLabel(request.proposed_start)}–
                        {formatTimeLabel(request.proposed_end)}
                      </p>
                      {request.reason ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          “{request.reason}”
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {isTeacher ? (
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) {
              setEditingSession(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleEditSubmit}>
              <DialogHeader>
                <DialogTitle>Edit session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {editingSession ? (
                  <p className="text-sm text-muted-foreground">
                    Class: <span className="font-medium">{editingSession.class_name}</span>
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-session-title">Title</Label>
                  <Input
                    id="edit-session-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    disabled={updateMutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-session-date">Date</Label>
                  <Input
                    id="edit-session-date"
                    type="date"
                    value={editSessionDate}
                    onChange={(e) => setEditSessionDate(e.target.value)}
                    required
                    disabled={updateMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-start-time">Start time</Label>
                    <Input
                      id="edit-start-time"
                      type="time"
                      step={60}
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      required
                      disabled={updateMutation.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-end-time">End time</Label>
                    <Input
                      id="edit-end-time"
                      type="time"
                      step={60}
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      required
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-session-location">Location</Label>
                  <Input
                    id="edit-session-location"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Room 201"
                    disabled={updateMutation.isPending}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {isStudent ? (
        <Dialog
          open={rescheduleOpen}
          onOpenChange={(open) => {
            setRescheduleOpen(open);
            if (!open) {
              setRescheduleSession(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleRescheduleSubmit}>
              <DialogHeader>
                <DialogTitle>Request reschedule</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {rescheduleSession ? (
                  <p className="text-sm text-muted-foreground">
                    Current: {rescheduleSession.title} on{" "}
                    {rescheduleSession.date},{" "}
                    {formatTimeLabel(rescheduleSession.start_time)}–
                    {formatTimeLabel(rescheduleSession.end_time)}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="proposed-date">Proposed date</Label>
                  <Input
                    id="proposed-date"
                    type="date"
                    value={proposedDate}
                    onChange={(e) => setProposedDate(e.target.value)}
                    required
                    disabled={rescheduleMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="proposed-start">Start time</Label>
                    <Input
                      id="proposed-start"
                      type="time"
                      step={60}
                      value={proposedStart}
                      onChange={(e) => setProposedStart(e.target.value)}
                      required
                      disabled={rescheduleMutation.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposed-end">End time</Label>
                    <Input
                      id="proposed-end"
                      type="time"
                      step={60}
                      value={proposedEnd}
                      onChange={(e) => setProposedEnd(e.target.value)}
                      required
                      disabled={rescheduleMutation.isPending}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reschedule-reason">Reason</Label>
                  <Textarea
                    id="reschedule-reason"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Why do you need a different time?"
                    rows={3}
                    required
                    disabled={rescheduleMutation.isPending}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRescheduleOpen(false)}
                  disabled={rescheduleMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={rescheduleMutation.isPending}>
                  {rescheduleMutation.isPending ? "Submitting…" : "Submit request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.title}" on ${deleteTarget.date} will be permanently removed.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
