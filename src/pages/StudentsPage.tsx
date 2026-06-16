import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Mail, Plus, Search, Users } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageEmptyState } from "@/components/PageEmptyState";
import { ScrollableList } from "@/components/ScrollableList";
import { OnboardingHint } from "@/components/OnboardingHint";
import { InvitedStudentLimitsNotice } from "@/components/InvitedStudentLimitsNotice";
import { StudentReportPreview } from "@/components/StudentReportPreview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import {
  cancelClassInvite,
  getStudentNote,
  getStudentReport,
  inviteClassStudent,
  listClasses,
  listTeacherStudents,
  removeClassStudent,
  saveStudentNote,
  type StudentClassEnrollment,
  type StudentReport,
  type StudentReportPeriod,
  type TeacherStudent,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";
import { STUDENT_GRADE_OPTIONS } from "@/lib/student-grades";
import { downloadStudentReport, printStudentReport } from "@/lib/student-report";

function formatJoinedAt(iso?: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function studentDisplayName(student: TeacherStudent): string {
  const name = student.display_name?.trim();
  if (name) {
    return name;
  }
  return student.email?.split("@")[0] || "Student";
}

function isPendingOnlyStudent(student: TeacherStudent): boolean {
  return student.status === "pending" || student.id.startsWith("pending:");
}

function classSummary(student: TeacherStudent): string {
  if (student.classes.length === 0) {
    return "—";
  }
  if (student.classes.length === 1) {
    return student.classes[0].name;
  }
  return `${student.classes[0].name} +${student.classes.length - 1} more`;
}

const ALL_GRADES = "all";
const NO_GRADE = "__none__";

type ClassRemovalTarget = {
  classItem: StudentClassEnrollment;
  student: TeacherStudent;
};

const REPORT_PERIODS: Array<{ value: StudentReportPeriod; label: string }> = [
  { value: "week", label: "Last 7 days" },
  { value: "half_month", label: "Last 15 days" },
  { value: "month", label: "Last 30 days" },
];

export default function StudentsPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<TeacherStudent | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState(ALL_GRADES);
  const [reportPeriod, setReportPeriod] = useState<StudentReportPeriod>("week");
  const [reportPreview, setReportPreview] = useState<StudentReport | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addGrade, setAddGrade] = useState("");
  const [addClassId, setAddClassId] = useState("");
  const [addNote, setAddNote] = useState("");
  const [removeClassTarget, setRemoveClassTarget] = useState<ClassRemovalTarget | null>(
    null,
  );

  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const studentsQuery = useQuery({
    queryKey: [
      "teacher-students",
      user?.id,
      searchQuery,
      gradeFilter,
    ] as const,
    queryFn: () =>
      listTeacherStudents({
        q: searchQuery || undefined,
        grade: gradeFilter === ALL_GRADES ? undefined : gradeFilter,
      }),
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 30_000,
  });

  const classesQuery = useQuery({
    queryKey: ["classes", user?.id, role] as const,
    queryFn: listClasses,
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!addOpen) {
      return;
    }
    const classes = classesQuery.data ?? [];
    if (classes.length > 0 && !addClassId) {
      setAddClassId(classes[0].id);
    }
  }, [addOpen, classesQuery.data, addClassId]);

  const inviteMutation = useMutation({
    mutationFn: (payload: {
      classId: string;
      email: string;
      display_name: string;
      grade?: string;
      teacher_note?: string;
    }) =>
      inviteClassStudent(payload.classId, {
        email: payload.email,
        display_name: payload.display_name,
        grade: payload.grade,
        teacher_note: payload.teacher_note,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["teacher-students"] });
      queryClient.invalidateQueries({ queryKey: ["class-students"] });
      toast.success(result.message);
      setAddOpen(false);
      setAddEmail("");
      setAddName("");
      setAddGrade("");
      setAddClassId("");
      setAddNote("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeFromClassMutation = useMutation({
    mutationFn: async (target: ClassRemovalTarget) => {
      const { classItem, student } = target;
      if (classItem.enrollment_status === "pending" && classItem.invite_id) {
        await cancelClassInvite(classItem.id, classItem.invite_id);
        return;
      }
      if (isPendingOnlyStudent(student)) {
        throw new Error("This student has not registered yet");
      }
      await removeClassStudent(classItem.id, student.id);
    },
    onSuccess: (_result, target) => {
      queryClient.invalidateQueries({ queryKey: ["teacher-students"] });
      queryClient.invalidateQueries({ queryKey: ["class-students"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setRemoveClassTarget(null);
      const wasPending = target.classItem.enrollment_status === "pending";
      toast.success(wasPending ? "Invite cancelled" : "Student removed from class");
      if (
        selectedStudent?.id === target.student.id &&
        target.student.classes.length <= 1
      ) {
        setSelectedStudent(null);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const noteQuery = useQuery({
    queryKey: ["student-note", selectedStudent?.id] as const,
    queryFn: () => getStudentNote(selectedStudent!.id),
    enabled: Boolean(selectedStudent?.id && !isPendingOnlyStudent(selectedStudent)),
    staleTime: 30_000,
  });

  useEffect(() => {
    setNoteDraft("");
  }, [selectedStudent?.id]);

  useEffect(() => {
    if (!selectedStudent?.id || noteQuery.isFetching) {
      return;
    }
    setNoteDraft(noteQuery.data?.content ?? "");
  }, [selectedStudent?.id, noteQuery.data, noteQuery.isFetching]);

  const saveNoteMutation = useMutation({
    mutationFn: ({ studentId, content }: { studentId: string; content: string }) =>
      saveStudentNote(studentId, content),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(["student-note", variables.studentId], saved);
      toast.success("Note saved");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const reportMutation = useMutation({
    mutationFn: ({ studentId, period }: { studentId: string; period: StudentReportPeriod }) =>
      getStudentReport(studentId, period),
    onSuccess: (report) => {
      setReportPreview(report);
      toast.success("Report ready — preview opened below.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const students = studentsQuery.data?.students ?? [];
  const gradeOptions = studentsQuery.data?.grades ?? [];
  const hasFilters = Boolean(searchQuery) || gradeFilter !== ALL_GRADES;
  const totalLabel =
    studentsQuery.isLoading && !studentsQuery.data
      ? "Loading…"
      : `${students.length} student${students.length === 1 ? "" : "s"}${
          hasFilters ? " matching" : " enrolled"
        }`;

  if (!isTeacher) {
    return (
      <div className="space-y-5 max-w-6xl">
        <h1 className="page-header">Students</h1>
        <PageEmptyState
          icon={Users}
          title="Teacher access only"
          description="Student accounts cannot view the teacher student list."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">Students</h1>
          <p className="page-subtitle">{totalLabel}</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" /> Add Student
        </Button>
      </div>

      <OnboardingHint
        id="students-page"
        title="Tip: add students by email or class code"
        description="Add a student by email — we create their login (initial password 123456) and enroll them in the class. Students who already have accounts are added immediately."
      />

      <InvitedStudentLimitsNotice variant="panel" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            className="h-9 pl-9"
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="All grades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GRADES}>All grades</SelectItem>
            <SelectItem value={NO_GRADE}>No grade set</SelectItem>
            {STUDENT_GRADE_OPTIONS.map((grade) => (
              <SelectItem key={grade} value={grade}>
                {grade}
              </SelectItem>
            ))}
            {gradeOptions
              .filter((g) => !STUDENT_GRADE_OPTIONS.includes(g as (typeof STUDENT_GRADE_OPTIONS)[number]))
              .map((grade) => (
                <SelectItem key={grade} value={grade}>
                  {grade}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {studentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading students…</p>
      ) : studentsQuery.isError ? (
        <p className="text-sm text-destructive">
          {(studentsQuery.error as Error).message}
        </p>
      ) : students.length === 0 ? (
        <div className="space-y-4">
          <PageEmptyState
            icon={Users}
            title={hasFilters ? "No students match" : "No students yet"}
            description={
              hasFilters
                ? "Try a different name, email, or grade filter."
                : "Create a class and invite students by email, or share a class code for self-join."
            }
          />
          {!hasFilters ? (
            <div className="flex justify-center">
              <Button asChild size="sm" variant="outline">
                <Link to="/classes">Go to Classes</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
          <ScrollableList>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Grade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead className="hidden md:table-cell text-right">
                  Enrolled in
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow
                  key={student.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedStudent(student)}
                >
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {studentDisplayName(student)}
                      {isPendingOnlyStudent(student) ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          Invited
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {student.email || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {student.grade || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {isPendingOnlyStudent(student)
                      ? "Awaiting signup"
                      : student.status === "mixed"
                        ? "Active + invited"
                        : "Active"}
                  </TableCell>
                  <TableCell>{classSummary(student)}</TableCell>
                  <TableCell className="hidden md:table-cell text-right text-muted-foreground">
                    {student.classes.length} class
                    {student.classes.length === 1 ? "" : "es"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </ScrollableList>
        </div>
      )}

      <Sheet
        open={selectedStudent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudent(null);
          }
        }}
      >
        <SheetContent className="sm:max-w-md">
          {selectedStudent ? (
            <>
              <SheetHeader>
                <SheetTitle>{studentDisplayName(selectedStudent)}</SheetTitle>
                <SheetDescription className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    {selectedStudent.email || "No email on file"}
                  </span>
                  {selectedStudent.grade ? (
                    <span className="text-xs">Grade: {selectedStudent.grade}</span>
                  ) : null}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Classes</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setAddEmail(selectedStudent.email || "");
                      setAddName(selectedStudent.display_name || "");
                      setAddOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add to class
                  </Button>
                </div>
                {selectedStudent.classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enrolled in any class.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border/60">
                    {selectedStudent.classes.map((classItem) => (
                      <li
                        key={`${classItem.id}-${classItem.invite_id ?? "active"}`}
                        className="flex items-start gap-3 px-4 py-3 text-sm"
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: classItem.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{classItem.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {classItem.enrollment_status === "pending"
                              ? `Invited ${formatJoinedAt(classItem.joined_at)}`
                              : `Joined ${formatJoinedAt(classItem.joined_at)}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={removeFromClassMutation.isPending}
                          onClick={() =>
                            setRemoveClassTarget({
                              classItem,
                              student: selectedStudent,
                            })
                          }
                        >
                          {classItem.enrollment_status === "pending"
                            ? "Cancel"
                            : "Remove"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {isPendingOnlyStudent(selectedStudent) ? (
                <div className="mt-6 space-y-3">
                  <InvitedStudentLimitsNotice variant="compact" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for signup with{" "}
                    <strong className="text-foreground">{selectedStudent.email}</strong>.
                  </p>
                </div>
              ) : (
                <>
              <div className="mt-6 space-y-3 rounded-lg border border-border/60 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Progress report</h3>
                  <p className="text-xs text-muted-foreground">
                    Generate a printable report for parents. Use the browser print dialog to save it as PDF, then send it by WeChat yourself.
                  </p>
                </div>
                <Select
                  value={reportPeriod}
                  onValueChange={(value) => setReportPeriod(value as StudentReportPeriod)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_PERIODS.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={reportMutation.isPending}
                  onClick={() => {
                    reportMutation.mutate({
                      studentId: selectedStudent.id,
                      period: reportPeriod,
                    });
                  }}
                >
                  <FileText className="h-4 w-4" />
                  {reportMutation.isPending ? "Generating…" : "Generate report"}
                </Button>
              </div>
              <div className="mt-6 space-y-2">
                <Label htmlFor="student-private-note">Private notes</Label>
                <Textarea
                  id="student-private-note"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Level, parent contact, learning goals…"
                  rows={5}
                  disabled={
                    noteQuery.isLoading ||
                    noteQuery.isFetching ||
                    saveNoteMutation.isPending
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Only you can see this note. Students cannot view it.
                </p>
                {noteQuery.data?.updated_at ? (
                  <p className="text-xs text-muted-foreground">
                    Last saved {formatJoinedAt(noteQuery.data.updated_at)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    noteQuery.isLoading ||
                    noteQuery.isFetching ||
                    saveNoteMutation.isPending ||
                    !selectedStudent
                  }
                  onClick={() => {
                    if (selectedStudent) {
                      saveNoteMutation.mutate({
                        studentId: selectedStudent.id,
                        content: noteDraft,
                      });
                    }
                  }}
                >
                  {saveNoteMutation.isPending ? "Saving…" : "Save note"}
                </Button>
              </div>
                </>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={reportPreview !== null} onOpenChange={(open) => !open && setReportPreview(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle>Student progress report</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {reportPreview ? <StudentReportPreview report={reportPreview} /> : null}
          </div>
          <DialogFooter className="border-t border-border/60 px-5 py-4 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setReportPreview(null)}>
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!reportPreview}
                onClick={() => {
                  if (!reportPreview) {
                    return;
                  }
                  downloadStudentReport(reportPreview);
                  toast.success("Report downloaded.");
                }}
              >
                Download HTML
              </Button>
              <Button
                type="button"
                disabled={!reportPreview}
                onClick={() => {
                  if (!reportPreview) {
                    return;
                  }
                  try {
                    printStudentReport(reportPreview);
                  } catch (error) {
                    const message =
                      error instanceof Error ? error.message : "Could not print report.";
                    toast.error(message);
                  }
                }}
              >
                Print / Save as PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add student</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addClassId) {
                toast.error("Select a class");
                return;
              }
              inviteMutation.mutate({
                classId: addClassId,
                email: addEmail.trim(),
                display_name: addName.trim(),
                grade: addGrade.trim() || undefined,
                teacher_note: addNote.trim() || undefined,
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              We create a student login for this email (initial password{" "}
              <span className="font-mono">123456</span>) and add them to the class. Share
              those credentials with the student so they can log in directly — no separate
              registration needed.
            </p>
            <InvitedStudentLimitsNotice variant="compact" />
            <div className="space-y-1.5">
              <Label htmlFor="add-class">Class</Label>
              <Select value={addClassId} onValueChange={setAddClassId}>
                <SelectTrigger id="add-class" className="h-9">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {(classesQuery.data ?? []).map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(classesQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  <Link to="/classes" className="underline underline-offset-2">
                    Create a class
                  </Link>{" "}
                  first.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Student name</Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Alex Chen"
                required
                disabled={inviteMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="student@example.com"
                required
                disabled={inviteMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-grade">Grade (optional)</Label>
              <Select value={addGrade || NO_GRADE} onValueChange={(v) => setAddGrade(v === NO_GRADE ? "" : v)}>
                <SelectTrigger id="add-grade" className="h-9">
                  <SelectValue placeholder="No grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GRADE}>No grade</SelectItem>
                  {STUDENT_GRADE_OPTIONS.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-note">Private note (optional)</Label>
              <Textarea
                id="add-note"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="Saved to your notes when the student registers."
                rows={3}
                disabled={inviteMutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={inviteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  inviteMutation.isPending ||
                  !addClassId ||
                  (classesQuery.data ?? []).length === 0
                }
              >
                {inviteMutation.isPending ? "Adding…" : "Add student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeClassTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveClassTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeClassTarget?.classItem.enrollment_status === "pending"
                ? "Cancel invite?"
                : "Remove from class?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeClassTarget
                ? removeClassTarget.classItem.enrollment_status === "pending"
                  ? `Cancel the invite for ${studentDisplayName(removeClassTarget.student)} to join "${removeClassTarget.classItem.name}".`
                  : `Remove ${studentDisplayName(removeClassTarget.student)} from "${removeClassTarget.classItem.name}". They can rejoin with the class code or a new invite.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeFromClassMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeFromClassMutation.isPending || !removeClassTarget}
              onClick={(e) => {
                e.preventDefault();
                if (removeClassTarget) {
                  removeFromClassMutation.mutate(removeClassTarget);
                }
              }}
            >
              {removeFromClassMutation.isPending
                ? "Working…"
                : removeClassTarget?.classItem.enrollment_status === "pending"
                  ? "Cancel invite"
                  : "Remove student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
