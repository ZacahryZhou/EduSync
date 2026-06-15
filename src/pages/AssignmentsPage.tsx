import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { FileText, Plus, Trash2 } from "lucide-react";
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
  listAssignments,
  listClasses,
  type AssignmentItem,
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

function AssignmentCard({
  item,
  canDelete,
  onDelete,
}: {
  item: AssignmentItem;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color || "#6366f1" }}
            />
            <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">{item.class_name}</p>
        </div>
        {canDelete ? (
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
      <CardContent className="space-y-2 text-sm">
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
      </CardContent>
    </Card>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
              ? "Create and manage homework for your classes"
              : "Homework posted by your teachers"}
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
              canDelete={isTeacher}
              onDelete={setDeleteId}
            />
          ))}
        </div>
      )}

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
