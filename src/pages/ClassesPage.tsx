import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Copy, Download, FolderOpen, List, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  createClass,
  deleteClass,
  deleteClassMaterial,
  joinClass,
  listClassMaterials,
  listClassStudents,
  listClasses,
  updateClass,
  uploadClassMaterial,
  type ClassItem,
  type ClassMaterial,
  type ClassStudent,
} from "@/lib/api";
import { isStudentRole, isTeacherRole, normalizeRole } from "@/lib/roles";

function parseUnitPrice(value: string): number | null {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

const CLASS_CODE_PATTERN = /[A-Z0-9]{2,6}-[A-Z0-9]{4}/g;

function normalizeClassCodeInput(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (/^[A-Z0-9]{2,6}-[A-Z0-9]{4}$/.test(cleaned)) {
    return cleaned;
  }
  const matches = cleaned.match(CLASS_CODE_PATTERN);
  return matches?.[matches.length - 1] ?? cleaned;
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
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function studentDisplayName(student: ClassStudent): string {
  const name = student.display_name?.trim();
  if (name) {
    return name;
  }
  return student.email?.split("@")[0] || "Student";
}

export default function ClassesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const isStudent = isStudentRole(role);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [billingMode, setBillingMode] = useState<"per_hour" | "per_session">(
    "per_session",
  );
  const [unitPrice, setUnitPrice] = useState("0");
  const [classCode, setClassCode] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBillingMode, setEditBillingMode] = useState<
    "per_hour" | "per_session"
  >("per_session");
  const [editUnitPrice, setEditUnitPrice] = useState("0");

  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [rosterClass, setRosterClass] = useState<ClassItem | null>(null);
  const [materialsClass, setMaterialsClass] = useState<ClassItem | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);

  const classesQueryKey = ["classes", user?.id, role] as const;

  const classesQuery = useQuery({
    queryKey: classesQueryKey,
    queryFn: listClasses,
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  });

  const rosterQuery = useQuery({
    queryKey: ["class-students", rosterClass?.id] as const,
    queryFn: () => listClassStudents(rosterClass!.id),
    enabled: Boolean(isTeacher && rosterClass?.id),
    staleTime: 60_000,
  });

  const materialsQuery = useQuery({
    queryKey: ["class-materials", materialsClass?.id] as const,
    queryFn: () => listClassMaterials(materialsClass!.id),
    enabled: Boolean(materialsClass?.id),
    staleTime: 30_000,
  });

  const uploadMaterialMutation = useMutation({
    mutationFn: ({
      classId,
      title,
      file,
    }: {
      classId: string;
      title: string;
      file: File;
    }) => uploadClassMaterial(classId, { title, file }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-materials"] });
      queryClient.invalidateQueries({ queryKey: ["recent-materials"] });
      setMaterialTitle("");
      setMaterialFile(null);
      toast.success("Material uploaded");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: ({
      classId,
      materialId,
    }: {
      classId: string;
      materialId: string;
    }) => deleteClassMaterial(classId, materialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-materials"] });
      queryClient.invalidateQueries({ queryKey: ["recent-materials"] });
      toast.success("Material deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: createClass,
    onSuccess: (created) => {
      queryClient.setQueryData<ClassItem[]>(classesQueryKey, (prev) => [
        created,
        ...(prev ?? []),
      ]);
      setCreateOpen(false);
      setName("");
      setDescription("");
      setBillingMode("per_session");
      setUnitPrice("0");
      if (created.code) {
        toast.success(`Class created. Share this code: ${created.code}`);
      } else {
        toast.success("Class created");
        toast.warning(
          "Class code is missing in the database. Run backend/sql/fix_class_groups_schema.sql in Supabase.",
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      classId,
      input,
    }: {
      classId: string;
      input: {
        name: string;
        description?: string;
        billing_mode: "per_hour" | "per_session";
        unit_price: number;
      };
    }) => updateClass(classId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<ClassItem[]>(classesQueryKey, (prev) =>
        (prev ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setEditOpen(false);
      setEditingClass(null);
      toast.success("Class updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (classId: string) => deleteClass(classId),
    onSuccess: (_data, classId) => {
      queryClient.setQueryData<ClassItem[]>(classesQueryKey, (prev) =>
        (prev ?? []).filter((item) => item.id !== classId),
      );
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setDeleteTarget(null);
      toast.success("Class deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const joinMutation = useMutation({
    mutationFn: joinClass,
    onSuccess: (joined) => {
      queryClient.setQueryData<ClassItem[]>(classesQueryKey, (prev) => {
        const existing = prev ?? [];
        if (existing.some((item) => item.id === joined.id)) {
          return existing;
        }
        return [joined, ...existing];
      });
      setClassCode("");
      toast.success("Joined class successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function openEditDialog(classItem: ClassItem) {
    setEditingClass(classItem);
    setEditName(classItem.name);
    setEditDescription(classItem.description ?? "");
    setEditBillingMode(classItem.billing_mode);
    setEditUnitPrice(String(classItem.unit_price));
    setEditOpen(true);
  }

  function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedPrice = parseUnitPrice(unitPrice);
    if (parsedPrice === null) {
      toast.error("Unit price must be a valid number");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      billing_mode: billingMode,
      unit_price: parsedPrice,
    });
  }

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingClass) {
      return;
    }
    const parsedPrice = parseUnitPrice(editUnitPrice);
    if (parsedPrice === null) {
      toast.error("Unit price must be a valid number");
      return;
    }
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error("Class name is required");
      return;
    }
    updateMutation.mutate({
      classId: editingClass.id,
      input: {
        name: trimmedName,
        description: editDescription.trim() || undefined,
        billing_mode: editBillingMode,
        unit_price: parsedPrice,
      },
    });
  }

  function handleCopyClassCode(code: string) {
    void navigator.clipboard.writeText(code).then(
      () => toast.success(`Copied class code: ${code}`),
      () => toast.error("Could not copy. Select the code and copy manually."),
    );
  }

  function handleJoinSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = normalizeClassCodeInput(classCode);
    if (!code) {
      toast.error("Please enter a class code");
      return;
    }
    if (code !== classCode.trim().replace(/\s+/g, "").toUpperCase().replace(/[^A-Z0-9-]/g, "")) {
      setClassCode(code);
    }
    joinMutation.mutate(code);
  }

  function handleMaterialUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!materialsClass) {
      return;
    }
    const title = materialTitle.trim();
    if (!title) {
      toast.error("Enter a title for this material");
      return;
    }
    if (!materialFile) {
      toast.error("Choose a PDF or image file");
      return;
    }
    uploadMaterialMutation.mutate({
      classId: materialsClass.id,
      title,
      file: materialFile,
    });
  }

  function formatMaterialDate(iso?: string): string {
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
      year: "numeric",
    });
  }

  const classes = classesQuery.data ?? [];
  const waitingForClasses =
    classesQuery.isPending ||
    classesQuery.isLoading ||
    (classesQuery.isFetching && classes.length === 0);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">{t("classes.title")}</h1>
          <p className="page-subtitle">
            {isTeacher ? t("classes.subtitleTeacher") : t("classes.subtitleStudent")}
          </p>
        </div>
        {isTeacher ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> {t("classes.createClass")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateSubmit}>
                <DialogHeader>
                  <DialogTitle>Create class</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="class-name">Class name</Label>
                    <Input
                      id="class-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Math 10A"
                      required
                      disabled={createMutation.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="class-description">Description</Label>
                    <Textarea
                      id="class-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional notes for this class"
                      rows={3}
                      disabled={createMutation.isPending}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Billing mode</Label>
                      <Select
                        value={billingMode}
                        onValueChange={(value: "per_hour" | "per_session") =>
                          setBillingMode(value)
                        }
                        disabled={createMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per_session">Per session</SelectItem>
                          <SelectItem value="per_hour">Per hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-price">Unit price</Label>
                      <Input
                        id="unit-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        disabled={createMutation.isPending}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Saving…" : "Save class"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {isStudent ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">{t("classes.joinTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("classes.signedInAs", {
                email: user?.email ?? user?.name ?? "",
                role: isStudent ? t("roles.student") : role || "",
              })}
            </p>
            <form
              onSubmit={handleJoinSubmit}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="class-code">{t("classes.classCode")}</Label>
                <Input
                  id="class-code"
                  value={classCode}
                  onChange={(e) =>
                    setClassCode(e.target.value.replace(/\s+/g, "").toUpperCase())
                  }
                  placeholder="MATH-A1B2"
                  disabled={joinMutation.isPending}
                />
              </div>
              <Button type="submit" disabled={joinMutation.isPending}>
                {joinMutation.isPending ? t("classes.joining") : t("classes.join")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {waitingForClasses ? (
        <p className="text-sm text-muted-foreground">{t("classes.loading")}</p>
      ) : classesQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {(classesQuery.error as Error).message}
        </p>
      ) : classes.length === 0 ? (
        <PageEmptyState
          icon={BookOpen}
          title={isTeacher ? t("classes.emptyTitleTeacher") : t("classes.emptyTitleStudent")}
          description={
            isTeacher ? t("classes.emptyTeacher") : t("classes.emptyStudent")
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((classItem) => (
            <Card
              key={classItem.id}
              className="border-border/60 shadow-sm overflow-hidden"
            >
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: classItem.color }}
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-snug">
                    {classItem.name}
                  </CardTitle>
                  {isTeacher ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Edit ${classItem.name}`}
                        onClick={() => openEditDialog(classItem)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Delete ${classItem.name}`}
                        onClick={() => setDeleteTarget(classItem)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {classItem.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {classItem.description}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t("classes.classCodeLabel")}</span>
                  {classItem.code ? (
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
                        {classItem.code}
                      </code>
                      {isTeacher ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Copy class code ${classItem.code}`}
                          onClick={() => handleCopyClassCode(classItem.code)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("classes.notSet")}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{t("classes.studentsCount", { count: classItem.student_count })}</span>
                </div>
                {isTeacher ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setRosterClass(classItem)}
                  >
                    <List className="mr-2 h-4 w-4" />
                    {t("classes.viewRoster")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setMaterialsClass(classItem)}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {t("classes.materials")}
                </Button>
                <div className="text-muted-foreground">
                  {classItem.billing_mode === "per_hour"
                    ? t("classes.billingPerHour")
                    : t("classes.billingPerSession")}
                  {" · $"}
                  {classItem.unit_price.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isTeacher ? (
        <Dialog
          open={rosterClass !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRosterClass(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {rosterClass ? `${rosterClass.name} — Students` : "Class roster"}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              {rosterQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading roster…</p>
              ) : rosterQuery.isError ? (
                <p className="text-sm text-destructive">
                  {(rosterQuery.error as Error).message}
                </p>
              ) : (rosterQuery.data?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="font-medium text-foreground">No students yet</p>
                  <p className="mt-1">
                    Share the class code
                    {rosterClass?.code ? (
                      <>
                        {" "}
                        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                          {rosterClass.code}
                        </code>
                      </>
                    ) : null}{" "}
                    so students can join.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border/60">
                  {(rosterQuery.data ?? []).map((student) => (
                    <li
                      key={student.id}
                      className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {studentDisplayName(student)}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {student.email || "No email"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Joined {formatJoinedAt(student.joined_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              {rosterClass?.code ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopyClassCode(rosterClass.code)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy class code
                </Button>
              ) : null}
              <Button type="button" onClick={() => setRosterClass(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog
        open={materialsClass !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMaterialsClass(null);
            setMaterialTitle("");
            setMaterialFile(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {materialsClass
                ? `${materialsClass.name} — ${t("classes.materials")}`
                : t("classes.materials")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isTeacher && materialsClass ? (
              <form onSubmit={handleMaterialUpload} className="space-y-3 rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">{t("classes.uploadMaterial")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="material-title">{t("classes.materialTitle")}</Label>
                  <Input
                    id="material-title"
                    value={materialTitle}
                    onChange={(e) => setMaterialTitle(e.target.value)}
                    placeholder="Week 3 slides"
                    disabled={uploadMaterialMutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-file">{t("classes.materialFile")}</Label>
                  <Input
                    id="material-file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setMaterialFile(e.target.files?.[0] ?? null)}
                    disabled={uploadMaterialMutation.isPending}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploadMaterialMutation.isPending}
                >
                  <Upload className="h-4 w-4" />
                  {uploadMaterialMutation.isPending ? t("classes.uploading") : t("classes.upload")}
                </Button>
              </form>
            ) : null}

            {materialsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("classes.materialsLoading")}</p>
            ) : materialsQuery.isError ? (
              <p className="text-sm text-destructive">
                {(materialsQuery.error as Error).message}
              </p>
            ) : (materialsQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                <FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="font-medium text-foreground">{t("classes.materialsEmptyTitle")}</p>
                <p className="mt-1">
                  {isTeacher
                    ? t("classes.materialsEmptyTeacher")
                    : t("classes.materialsEmptyStudent")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border/60">
                {(materialsQuery.data ?? []).map((material: ClassMaterial) => (
                  <li
                    key={material.id}
                    className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{material.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {material.file_name || "File"} · {formatMaterialDate(material.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {material.download_url ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          asChild
                        >
                          <a
                            href={material.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t("classes.open")}
                          </a>
                        </Button>
                      ) : null}
                      {isTeacher && materialsClass ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Delete ${material.title}`}
                          disabled={deleteMaterialMutation.isPending}
                          onClick={() =>
                            deleteMaterialMutation.mutate({
                              classId: materialsClass.id,
                              materialId: material.id,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setMaterialsClass(null)}>
              {t("classes.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isTeacher ? (
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) {
              setEditingClass(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleEditSubmit}>
              <DialogHeader>
                <DialogTitle>Edit class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-class-name">Class name</Label>
                  <Input
                    id="edit-class-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    disabled={updateMutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-class-description">Description</Label>
                  <Textarea
                    id="edit-class-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    disabled={updateMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Billing mode</Label>
                    <Select
                      value={editBillingMode}
                      onValueChange={(value: "per_hour" | "per_session") =>
                        setEditBillingMode(value)
                      }
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_session">Per session</SelectItem>
                        <SelectItem value="per_hour">Per hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-unit-price">Unit price</Label>
                    <Input
                      id="edit-unit-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editUnitPrice}
                      onChange={(e) => setEditUnitPrice(e.target.value)}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </div>
                {editingClass?.code ? (
                  <p className="text-xs text-muted-foreground">
                    Class code{" "}
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                      {editingClass.code}
                    </code>{" "}
                    cannot be changed here.
                  </p>
                ) : null}
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
            <AlertDialogTitle>Delete class?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" will be permanently removed. Enrolled students will lose access and scheduled sessions for this class will be deleted.`
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
              {deleteMutation.isPending ? "Deleting…" : "Delete class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
