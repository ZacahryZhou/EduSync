import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus, Search } from "lucide-react";
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
import { ScrollableList } from "@/components/ScrollableList";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import {
  listClasses,
  listTuitionBalances,
  listTuitionTransactions,
  recordTuitionTopup,
  type BalanceStatus,
  type BalanceTransaction,
  type StudentBalance,
} from "@/lib/api";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

const ALL_CLASSES = "all";

type TuitionDetailTarget = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  classId?: string;
  className?: string;
};

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

function TransactionsTable({
  transactions,
  isTeacher,
  emptyMessage,
}: {
  transactions: BalanceTransaction[];
  isTeacher: boolean;
  emptyMessage: string;
}) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <ScrollableList>
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
      </ScrollableList>
    </div>
  );
}

export default function TuitionPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);

  const [classFilter, setClassFilter] = useState(ALL_CLASSES);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupTarget, setTopupTarget] = useState<StudentBalance | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupComment, setTopupComment] = useState("");
  const [detailTarget, setDetailTarget] = useState<TuitionDetailTarget | null>(null);

  const queryClient = useQueryClient();
  const classId = classFilter === ALL_CLASSES ? undefined : classFilter;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const classesQuery = useQuery({
    queryKey: ["classes", user?.id, role] as const,
    queryFn: listClasses,
    enabled: Boolean(user?.id && isTeacher),
  });

  const balancesQuery = useQuery({
    queryKey: ["tuition-balances", user?.id, role, classId, searchQuery] as const,
    queryFn: () =>
      listTuitionBalances({
        classId,
        q: isTeacher ? searchQuery : undefined,
      }),
    enabled: Boolean(user?.id),
  });

  const transactionsQuery = useQuery({
    queryKey: [
      "tuition-transactions",
      user?.id,
      role,
      classId,
      searchQuery,
      dateFrom,
      dateTo,
    ] as const,
    queryFn: () =>
      listTuitionTransactions({
        classId,
        q: isTeacher ? searchQuery : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: 50,
      }),
    enabled: Boolean(user?.id),
  });

  const detailTransactionsQuery = useQuery({
    queryKey: [
      "tuition-transactions",
      "detail",
      detailTarget?.studentId,
      detailTarget?.classId,
      dateFrom,
      dateTo,
    ] as const,
    queryFn: () =>
      listTuitionTransactions({
        studentId: detailTarget!.studentId,
        classId: detailTarget?.classId,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: 100,
      }),
    enabled: Boolean(user?.id && detailTarget),
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
  const detailTransactions = detailTransactionsQuery.data ?? [];

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

  const detailBalances = useMemo(() => {
    if (!detailTarget) {
      return [];
    }
    return balances.filter((row) => {
      if (row.student_id !== detailTarget.studentId) {
        return false;
      }
      if (detailTarget.classId && row.class_id !== detailTarget.classId) {
        return false;
      }
      return true;
    });
  }, [balances, detailTarget]);

  const hasFilters = Boolean(searchQuery || dateFrom || dateTo);

  function openTopupDialog(row: StudentBalance) {
    setTopupTarget(row);
    setTopupAmount("");
    setTopupComment("");
    setTopupOpen(true);
  }

  function openDetail(row: StudentBalance) {
    setDetailTarget({
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      classId: isTeacher ? undefined : row.class_id,
      className: isTeacher ? undefined : row.class_name,
    });
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

  function clearFilters() {
    setSearchInput("");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  }

  const loading = balancesQuery.isLoading || transactionsQuery.isLoading;
  const error = balancesQuery.error ?? transactionsQuery.error;

  function errorMessage(err: unknown): string {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (typeof err === "string" && err) {
      return err;
    }
    return "Failed to load tuition data.";
  }

  let detailTitle: ReactNode = "Tuition details";
  if (detailTarget) {
    detailTitle = isTeacher ? detailTarget.studentName : detailTarget.className || "My tuition";
  }

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

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
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

          {isTeacher ? (
            <div className="space-y-1.5">
              <Label htmlFor="tuition-name-search" className="text-sm text-muted-foreground">
                Student name
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="tuition-name-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name or email…"
                  className="h-9 w-[240px] pl-8"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="tuition-date-from" className="text-sm text-muted-foreground">
              From date
            </Label>
            <Input
              id="tuition-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tuition-date-to" className="text-sm text-muted-foreground">
              To date
            </Label>
            <Input
              id="tuition-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>

          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>

        {isTeacher ? (
          <p className="text-xs text-muted-foreground">
            Click a student row to open their full tuition history. Students only see their own
            records.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Click a class row to view your transaction history for that class.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tuition data…</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage(error)}
        </p>
      ) : balances.length === 0 ? (
        <PageEmptyState
          icon={DollarSign}
          title={hasFilters ? "No matching tuition records" : "No tuition records yet"}
          description={
            hasFilters
              ? "Try a different name or date range, or clear filters above."
              : isTeacher
                ? "When students join your classes, their balances will appear here. Record a top-up after they pay."
                : "Your class balances will show up here after your teacher records payments."
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <ScrollableList>
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
                  <TableRow
                    key={`${row.student_id}-${row.class_id}`}
                    className="cursor-pointer"
                    onClick={() => openDetail(row)}
                  >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openTopupDialog(row);
                          }}
                        >
                          Top-up
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </ScrollableList>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recent transactions</h2>
            <TransactionsTable
              transactions={transactions}
              isTeacher={isTeacher}
              emptyMessage={
                hasFilters
                  ? "No transactions match your filters."
                  : "No transactions yet. Deductions are recorded when attendance is saved for a session."
              }
            />
          </div>
        </div>
      )}

      <Sheet open={detailTarget !== null} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {detailTarget ? (
            <>
              <SheetHeader>
                <SheetTitle>{detailTitle}</SheetTitle>
                <SheetDescription>
                  {isTeacher
                    ? detailTarget.studentEmail || "Student tuition breakdown"
                    : "Your balance and payment history for this class"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {isTeacher ? "Class balances" : "Current balance"}
                  </h3>
                  <div className="rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isTeacher ? <TableHead>Class</TableHead> : null}
                          <TableHead>Billing</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Status</TableHead>
                          {isTeacher ? <TableHead className="text-right">Actions</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailBalances.map((row) => (
                          <TableRow key={`${row.student_id}-${row.class_id}`}>
                            {isTeacher ? <TableCell>{row.class_name}</TableCell> : null}
                            <TableCell className="text-sm text-muted-foreground">
                              {row.billing_mode === "per_hour" ? "Per hour" : "Per session"}
                              {row.unit_price > 0 ? ` · $${row.unit_price}` : ""}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatBalance(row.balance, row.unit)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.status)}>
                                {statusLabel(row.status)}
                              </Badge>
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
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Transactions</h3>
                  {detailTransactionsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading transactions…</p>
                  ) : (
                    <TransactionsTable
                      transactions={detailTransactions}
                      isTeacher={isTeacher}
                      emptyMessage="No transactions in this date range."
                    />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

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
