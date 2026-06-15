import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Mail, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageEmptyState } from "@/components/PageEmptyState";
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
import { useAuth } from "@/context/AuthContext";
import {
  getStudentNote,
  listTeacherStudents,
  saveStudentNote,
  type TeacherStudent,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

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

function classSummary(student: TeacherStudent): string {
  if (student.classes.length === 0) {
    return "—";
  }
  if (student.classes.length === 1) {
    return student.classes[0].name;
  }
  return `${student.classes[0].name} +${student.classes.length - 1} more`;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<TeacherStudent | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");

  const queryClient = useQueryClient();

  const studentsQuery = useQuery({
    queryKey: ["teacher-students", user?.id] as const,
    queryFn: listTeacherStudents,
    enabled: Boolean(user?.id && isTeacher),
    staleTime: 60_000,
  });

  const noteQuery = useQuery({
    queryKey: ["student-note", selectedStudent?.id] as const,
    queryFn: () => getStudentNote(selectedStudent!.id),
    enabled: Boolean(selectedStudent?.id),
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

  const students = studentsQuery.data ?? [];
  const totalLabel =
    studentsQuery.isLoading && !studentsQuery.data
      ? "Loading…"
      : `${students.length} student${students.length === 1 ? "" : "s"} enrolled`;

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
            title="No students yet"
            description="Create a class and share its code so students can join. They will appear here automatically."
          />
          <div className="flex justify-center">
            <Button asChild size="sm" variant="outline">
              <Link to="/classes">Go to Classes</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
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
                    {studentDisplayName(student)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {student.email || "—"}
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
                <SheetDescription className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" />
                  {selectedStudent.email || "No email on file"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium">Classes</h3>
                {selectedStudent.classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enrolled in any class.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border/60">
                    {selectedStudent.classes.map((classItem) => (
                      <li
                        key={classItem.id}
                        className="flex items-start gap-3 px-4 py-3 text-sm"
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: classItem.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{classItem.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {formatJoinedAt(classItem.joined_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add students</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              Students join EduSync with their own account using a{" "}
              <strong className="text-foreground">class code</strong> from your
              Classes page.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Create a class (or open an existing one).</li>
              <li>Copy the class code and send it to the student.</li>
              <li>They sign in as a student and enter the code on Classes.</li>
            </ol>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                There is no manual “add student” yet — enrollment happens when
                they join with the code.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <Link to="/classes">Open Classes</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
