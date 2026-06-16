import { useState, useEffect, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { FileText, Plus, Trash2, Upload, Users } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  createAssignment,
  deleteAssignment,
  gradeSubmission,
  listAssignmentSubmissions,
  listAssignments,
  listClasses,
  submitAssignment,
  type AssignmentItem,
  type AssignmentSubmission,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

function formatDueDate(value: string | null | undefined): string {
  if (!value) {
    return "No due date";
  }
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value.slice(0, 10);
  }
}

function submissionStatus(item: AssignmentItem): string {
  const sub = item.my_submission;
  if (!sub?.submitted_at) {
    return item.past_due ? "Past due" : "Not submitted";
  }
  if (sub.grade) {
    return `Graded: ${sub.grade}`;
  }
  return "Submitted";
}

function AssignmentCard({
  item,
  isTeacher,
  onDelete,
  onSubmit,
  onViewSubmissions,
}: {
  item: AssignmentItem;
  isTeacher: boolean;
  onDelete: (id: string) => void;
  onSubmit: (item: AssignmentItem) => void;
  onViewSubmissions: (item: AssignmentItem) => void;
}) {
  const status = !isTeacher ? submissionStatus(item) : null;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color || "#6366f1" }}
            />
            <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
            {status ? (
              <Badge variant={status.startsWith("Graded") ? "default" : "secondary"}>
                {status}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{item.class_name}</p>
        </div>
        {isTeacher ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item.id)}
            aria-label="Delete assignment"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Due: <span className="text-foreground">{formatDueDate(item.due_date)}</span>
        </p>
        {item.description ? (
          <p className="whitespace-pre-wrap text-foreground/90">{item.description}</p>
        ) : null}
        {item.attachment_url ? (
          <a
            href={item.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-primary underline-offset-4 hover:underline"
          >
            View attachment
          </a>
        ) : null}
        {!isTeacher && item.my_submission?.feedback ? (
          <p className="rounded-lg bg-muted/50 p-3 text-foreground/90">
            <span className="font-medium">Teacher feedback: </span>
            {item.my_submission.feedback}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {isTeacher ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onViewSubmissions(item)}>
              <Users className="h-4 w-4" />
              Submissions
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={Boolean(item.past_due && !item.my_submission?.submitted_at)}
              onClick={() => onSubmit(item)}
            >
              <Upload className="h-4 w-4" />
              {item.my_submission?.submitted_at ? "Resubmit" : "Submit"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SubmitAssignmentDialog({
  item,
  open,
  onOpenChange,
}: {
  item: AssignmentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open && item) {
      setContent(item.my_submission?.content ?? "");
      setFile(null);
    }
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: (input: { content?: string; file?: File | null }) =>
      submitAssignment(item!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      onOpenChange(false);
      setContent("");
      setFile(null);
      toast.success("Assignment submitted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (!content.trim() && !file) {
      toast.error("Add a written response or choose a file");
      return;
    }
    mutation.mutate({ content, file });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Submit: {item?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="submit-content">Written response</Label>
              <Textarea
                id="submit-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type your answer here…"
                rows={5}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="submit-file">File (PDF or image, max 20MB)</Label>
              <Input
                id="submit-file"
                type="file"
                accept=".pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {item?.my_submission?.file_name ? (
                <p className="text-xs text-muted-foreground">
                  Current file: {item.my_submission.file_name}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GradeRow({
  submission,
  onGraded,
}: {
  submission: AssignmentSubmission;
  onGraded: () => void;
}) {
  const [grade, setGrade] = useState(submission.grade ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");

  const mutation = useMutation({
    mutationFn: () => gradeSubmission(submission.id, { grade: grade.trim(), feedback }),
    onSuccess: () => {
      toast.success("Grade saved");
      onGraded();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{submission.student_name}</p>
          <p className="text-xs text-muted-foreground">{submission.student_email}</p>
          {submission.submitted_at ? (
            <p className="text-xs text-muted-foreground mt-1">
              Submitted {formatDueDate(submission.submitted_at)}
            </p>
          ) : null}
        </div>
        {submission.file_download_url ? (
          <a
            href={submission.file_download_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Download {submission.file_name || "file"}
          </a>
        ) : null}
      </div>
      {submission.content ? (
        <p className="text-sm whitespace-pre-wrap text-foreground/90">{submission.content}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label htmlFor={`grade-${submission.id}`}>Grade</Label>
          <Input
            id={`grade-${submission.id}`}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="A / 95"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`feedback-${submission.id}`}>Feedback</Label>
          <Input
            id={`feedback-${submission.id}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional comment"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!grade.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save grade"}
        </Button>
      </div>
    </div>
  );
}

function SubmissionsDialog({
  item,
  open,
  onOpenChange,
}: {
  item: AssignmentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const submissionsQuery = useQuery({
    queryKey: ["assignment-submissions", item?.id],
    queryFn: () => listAssignmentSubmissions(item!.id),
    enabled: open && Boolean(item?.id),
  });

  const submissions = submissionsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submissions — {item?.title}</DialogTitle>
        </DialogHeader>
        {submissionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading submissions…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => (
              <GradeRow
                key={submission.id}
                submission={submission}
                onGraded={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["assignment-submissions", item?.id],
                  });
                  queryClient.invalidateQueries({ queryKey: ["notifications"] });
                  queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitItem, setSubmitItem] = useState<AssignmentItem | null>(null);
  const [submissionsItem, setSubmissionsItem] = useState<AssignmentItem | null>(null);
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: listClasses,
    enabled: isTeacher,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["assignments"],
    queryFn: () => listAssignments(),
  });

  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setAttachmentUrl("");
      setClassId("");
      const count = data.students_notified ?? 0;
      toast.success(
        count > 0
          ? `Assignment published · ${count} student${count === 1 ? "" : "s"} notified`
          : "Assignment published",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDeleteId(null);
      toast.success("Assignment deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!classId || !title.trim()) {
      toast.error("Class and title are required");
      return;
    }
    createMutation.mutate({
      class_id: classId,
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || null,
      attachment_url: attachmentUrl.trim() || undefined,
    });
  }

  const assignments = assignmentsQuery.data ?? [];
  const classes = classesQuery.data ?? [];

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">Assignments</h1>
          <p className="page-subtitle">
            {isTeacher
              ? "Create homework, review submissions, and grade work"
              : "View homework and submit your work"}
          </p>
        </div>
        {isTeacher ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={classes.length === 0}>
                <Plus className="h-4 w-4" /> New Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>New assignment</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="assignment-class">Class</Label>
                    <Select value={classId} onValueChange={setClassId} required>
                      <SelectTrigger id="assignment-class">
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assignment-title">Title</Label>
                    <Input
                      id="assignment-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Chapter 5 exercises"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assignment-due">Due date</Label>
                    <Input
                      id="assignment-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assignment-desc">Instructions</Label>
                    <Textarea
                      id="assignment-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What should students complete?"
                      rows={4}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assignment-url">Attachment URL (optional)</Label>
                    <Input
                      id="assignment-url"
                      type="url"
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Publishing…" : "Publish"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {assignmentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading assignments…</p>
      ) : assignments.length === 0 ? (
        <PageEmptyState
          icon={FileText}
          title="No assignments yet"
          description={
            isTeacher
              ? classes.length === 0
                ? "Create a class first, then post homework here."
                : "Post your first assignment — enrolled students will be notified."
              : "When your teacher posts homework, it will show up here."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assignments.map((item) => (
            <AssignmentCard
              key={item.id}
              item={item}
              isTeacher={isTeacher}
              onDelete={setDeleteId}
              onSubmit={setSubmitItem}
              onViewSubmissions={setSubmissionsItem}
            />
          ))}
        </div>
      )}

      <SubmitAssignmentDialog
        item={submitItem}
        open={Boolean(submitItem)}
        onOpenChange={(open) => {
          if (!open) setSubmitItem(null);
        }}
      />

      <SubmissionsDialog
        item={submissionsItem}
        open={Boolean(submissionsItem)}
        onOpenChange={(open) => {
          if (!open) setSubmissionsItem(null);
        }}
      />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Students will no longer see this assignment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
