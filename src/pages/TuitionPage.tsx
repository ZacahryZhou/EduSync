import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageEmptyState } from "@/components/PageEmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import {
  listClasses,
  listTuitionBalances,
  listTuitionTransactions,
  recordTuitionTopup,
  type BalanceStatus,
  type StudentBalance,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

const ALL_CLASSES = "all";

function statusLabel(status: BalanceStatus): string {
  if (status === "zero") {
    return "Zero";
  }
  if (status === "low") {
    return "Low";
  }
  return "OK";
}

function statusVariant(status: BalanceStatus): "default" | "secondary" | "destructive" {
  if (status === "zero") {
    return "destructive";
  }
  if (status === "low") {
    return "secondary";
  }
  return "default";
}

function formatBalance(balance: number, unit: string): string {
  const rounded = Number.isInteger(balance) ? balance.toString() : balance.toFixed(2);
  const label = unit === "hours" ? "hr" : "sessions";
  return `${rounded} ${label}`;
}

function formatTransactionType(type: string): string {
  return type === "topup" ? "Top-up" : "Deduction";
}

function formatDateTime(iso?: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TuitionPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);

  const [classFilter, setClassFilter] = useState(ALL_CLASSES);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupTarget, setTopupTarget] = useState<StudentBalance | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupComment, setTopupComment] = useState("");

  const queryClient = useQueryClient();
  const classId = classFilter === ALL_CLASSES ? undefined : classFilter;

  const classesQuery = useQuery({
    queryKey: ["classes", user?.id, role] as const,
    queryFn: listClasses,
    enabled: Boolean(user?.id && isTeacher),
  });

  const balancesQuery = useQuery({
    queryKey: ["tuition-balances", user?.id, role, classId] as const,
    queryFn: () => listTuitionBalances(classId),
    enabled: Boolean(user?.id),
  });

  const transactionsQuery = useQuery({
    queryKey: ["tuition-transactions", user?.id, role, classId] as const,
    queryFn: () => listTuitionTransactions({ classId, limit: 50 }),
    enabled: Boolean(user?.id),
  });

  const topupMutation = useMutation({
    mutationFn: recordTuitionTopup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tuition-balances"] });
      queryClient.invalidateQueries({ queryKey: ["tuition-transactions"] });
      setTopupOpen(false);
      setTopupTarget(null);
      setTopupAmount("");
      setTopupComment("");
      toast.success("Top-up recorded");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const balances = balancesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

  const classOptions = useMemo(() => {
    if (isTeacher) {
      return classesQuery.data ?? [];
    }
    const seen = new Map<string, string>();
    for (const row of balances) {
      seen.set(row.class_id, row.class_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({
      id,
      name,
      description: "",
      code: "",
      billing_mode: "per_session" as const,
      unit_price: 0,
      teacher_id: "",
      color: "",
      student_count: 0,
    }));
  }, [balances, classesQuery.data, isTeacher]);

  function openTopupDialog(row: StudentBalance) {
    setTopupTarget(row);
    setTopupAmount("");
    setTopupComment("");
    setTopupOpen(true);
  }

  function handleTopupSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!topupTarget) {
      return;
    }
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount greater than 0");
      return;
    }
    if (topupTarget.unit !== "hours" && !Number.isInteger(amount)) {
      toast.error("Session top-ups must be whole numbers (e.g. 12, not 12.01)");
      return;
    }
    topupMutation.mutate({
      student_id: topupTarget.student_id,
      class_id: topupTarget.class_id,
      amount,
      comment: topupComment.trim() || undefined,
    });
  }

  const loading = balancesQuery.isLoading || transactionsQuery.isLoading;
  const error = balancesQuery.error || transactionsQuery.error;

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">Tuition</h1>
          <p className="page-subtitle">
            {isTeacher
              ? "Track balances, record top-ups, and review deductions"
              : "View your class balances and payment history"}
          </p>
        </div>
        {isTeacher && balances.length > 0 ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => openTopupDialog(balances[0])}
          >
            <Plus className="h-4 w-4" /> Record Top-up
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="tuition-class-filter" className="text-sm text-muted-foreground">
          Class
        </Label>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger id="tuition-class-filter" className="w-[220px]">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
            {classOptions.map((classItem) => (
              <SelectItem key={classItem.id} value={classItem.id}>
                {classItem.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tuition data…</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message}
        </p>
      ) : balances.length === 0 ? (
        <PageEmptyState
          icon={DollarSign}
          title="No tuition records yet"
          description={
            isTeacher
              ? "When students join your classes, their balances will appear here. Record a top-up after they pay."
              : "Your class balances will show up here after your teacher records payments."
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {isTeacher ? <TableHead>Student</TableHead> : null}
                  <TableHead>Class</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  {isTeacher ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((row) => (
                  <TableRow key={`${row.student_id}-${row.class_id}`}>
                    {isTeacher ? (
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.student_name}</p>
                          {row.student_email ? (
                            <p className="text-xs text-muted-foreground">{row.student_email}</p>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell>{row.class_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.billing_mode === "per_hour" ? "Per hour" : "Per session"}
                      {row.unit_price > 0 ? ` · $${row.unit_price}` : ""}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatBalance(row.balance, row.unit)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </TableCell>
                    {isTeacher ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openTopupDialog(row)}
                        >
                          Top-up
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recent transactions</h2>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions yet. Deductions are recorded when attendance is saved for a
                session.
              </p>
            ) : (
              <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                <div className="max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        {isTeacher ? <TableHead>Student</TableHead> : null}
                        <TableHead>Class</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Balance after</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(tx.created_at)}
                          </TableCell>
                          {isTeacher ? <TableCell>{tx.student_name}</TableCell> : null}
                          <TableCell>{tx.class_name}</TableCell>
                          <TableCell>{formatTransactionType(tx.type)}</TableCell>
                          <TableCell>
                            {tx.type === "deduction" ? "−" : "+"}
                            {formatBalance(tx.amount, tx.unit)}
                          </TableCell>
                          <TableCell>{formatBalance(tx.balance_after, tx.unit)}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {tx.comment || tx.recorded_by_name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isTeacher ? (
        <Dialog
          open={topupOpen}
          onOpenChange={(open) => {
            setTopupOpen(open);
            if (!open) {
              setTopupTarget(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleTopupSubmit}>
              <DialogHeader>
                <DialogTitle>Record top-up</DialogTitle>
                {topupTarget ? (
                  <p className="text-sm text-muted-foreground">
                    {topupTarget.student_name} · {topupTarget.class_name}
                  </p>
                ) : null}
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="topup-amount">
                    Amount ({topupTarget?.unit === "hours" ? "hours" : "sessions"})
                  </Label>
                  <Input
                    id="topup-amount"
                    type="number"
                    min={topupTarget?.unit === "hours" ? "0.25" : "1"}
                    step={topupTarget?.unit === "hours" ? "0.25" : "1"}
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    required
                    disabled={topupMutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="topup-comment">Comment (optional)</Label>
                  <Textarea
                    id="topup-comment"
                    value={topupComment}
                    onChange={(e) => setTopupComment(e.target.value)}
                    placeholder="Cash, WeChat, bank transfer…"
                    rows={3}
                    disabled={topupMutation.isPending}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTopupOpen(false)}
                  disabled={topupMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={topupMutation.isPending || !topupTarget}>
                  {topupMutation.isPending ? "Saving…" : "Save top-up"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
