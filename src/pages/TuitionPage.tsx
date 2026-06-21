import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function localeForDates(lang: string): string {
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("fr")) return "fr-FR";
  if (lang.startsWith("ja")) return "ja-JP";
  if (lang.startsWith("ko")) return "ko-KR";
  return "en-US";
}

function statusLabel(status: BalanceStatus, t: TFunction): string {
  if (status === "zero") {
    return t("tuition.statusZero");
  }
  if (status === "low") {
    return t("tuition.statusLow");
  }
  return t("tuition.statusOk");
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

function formatBalance(balance: number, unit: string, t: TFunction): string {
  const rounded = Number.isInteger(balance) ? balance.toString() : balance.toFixed(2);
  const label = unit === "hours" ? t("tuition.unitHours") : t("tuition.unitSessions");
  return `${rounded} ${label}`;
}

function formatTransactionType(type: string, t: TFunction): string {
  return type === "topup" ? t("tuition.typeTopup") : t("tuition.typeDeduction");
}

function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(locale, {
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
  dateLocale,
}: {
  transactions: BalanceTransaction[];
  isTeacher: boolean;
  emptyMessage: string;
  dateLocale: string;
}) {
  const { t } = useTranslation();

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <ScrollableList>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead>{t("tuition.colDate")}</TableHead>
              {isTeacher ? <TableHead>{t("tuition.colStudent")}</TableHead> : null}
              <TableHead>{t("tuition.colClass")}</TableHead>
              <TableHead>{t("tuition.colType")}</TableHead>
              <TableHead>{t("tuition.colAmount")}</TableHead>
              <TableHead>{t("tuition.colBalanceAfter")}</TableHead>
              <TableHead>{t("tuition.colNotes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(tx.created_at, dateLocale)}
                </TableCell>
                {isTeacher ? <TableCell>{tx.student_name}</TableCell> : null}
                <TableCell>{tx.class_name}</TableCell>
                <TableCell>{formatTransactionType(tx.type, t)}</TableCell>
                <TableCell>
                  {tx.type === "deduction" ? "−" : "+"}
                  {formatBalance(tx.amount, tx.unit, t)}
                </TableCell>
                <TableCell>{formatBalance(tx.balance_after, tx.unit, t)}</TableCell>
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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const dateLocale = localeForDates(i18n.language);

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
      toast.success(t("tuition.topupRecorded"));
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
      toast.error(t("tuition.invalidAmount"));
      return;
    }
    if (topupTarget.unit !== "hours" && !Number.isInteger(amount)) {
      toast.error(t("tuition.sessionsWholeNumber"));
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
    return t("tuition.loadError");
  }

  let detailTitle: ReactNode = t("tuition.detailDefault");
  if (detailTarget) {
    detailTitle = isTeacher
      ? detailTarget.studentName
      : detailTarget.className || t("tuition.detailMyTuition");
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-header">{t("tuition.title")}</h1>
          <p className="page-subtitle">
            {isTeacher ? t("tuition.subtitleTeacher") : t("tuition.subtitleStudent")}
          </p>
        </div>
        {isTeacher && balances.length > 0 ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => openTopupDialog(balances[0])}
          >
            <Plus className="h-4 w-4" /> {t("tuition.recordTopup")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tuition-class-filter" className="text-sm text-muted-foreground">
              {t("tuition.class")}
            </Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger id="tuition-class-filter" className="w-[220px]">
                <SelectValue placeholder={t("tuition.allClasses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLASSES}>{t("tuition.allClasses")}</SelectItem>
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
                {t("tuition.studentName")}
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="tuition-name-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("tuition.searchPlaceholder")}
                  className="h-9 w-[240px] pl-8"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="tuition-date-from" className="text-sm text-muted-foreground">
              {t("tuition.fromDate")}
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
              {t("tuition.toDate")}
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
              {t("tuition.clearFilters")}
            </Button>
          ) : null}
        </div>

        {isTeacher ? (
          <p className="text-xs text-muted-foreground">{t("tuition.hintTeacher")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("tuition.hintStudent")}</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("tuition.loading")}</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage(error)}
        </p>
      ) : balances.length === 0 ? (
        <PageEmptyState
          icon={DollarSign}
          title={hasFilters ? t("tuition.emptyFilteredTitle") : t("tuition.emptyTitle")}
          description={
            hasFilters
              ? t("tuition.emptyFilteredDesc")
              : isTeacher
                ? t("tuition.emptyTeacherDesc")
                : t("tuition.emptyStudentDesc")
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <ScrollableList>
            <Table>
              <TableHeader>
                <TableRow>
                  {isTeacher ? <TableHead>{t("tuition.colStudent")}</TableHead> : null}
                  <TableHead>{t("tuition.colClass")}</TableHead>
                  <TableHead>{t("tuition.colBilling")}</TableHead>
                  <TableHead>{t("tuition.colBalance")}</TableHead>
                  <TableHead>{t("tuition.colStatus")}</TableHead>
                  {isTeacher ? (
                    <TableHead className="text-right">{t("tuition.colActions")}</TableHead>
                  ) : null}
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
                          <p className="font-medium">
                            {row.student_name}
                            {row.is_pending ? (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {t("tuition.invited")}
                              </Badge>
                            ) : null}
                          </p>
                          {row.student_email ? (
                            <p className="text-xs text-muted-foreground">{row.student_email}</p>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell>{row.class_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.billing_mode === "per_hour"
                        ? t("tuition.billingPerHour")
                        : t("tuition.billingPerSession")}
                      {row.unit_price > 0 ? ` · $${row.unit_price}` : ""}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatBalance(row.balance, row.unit, t)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabel(row.status, t)}
                      </Badge>
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
                          {t("tuition.topup")}
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
            <h2 className="text-base font-semibold">{t("tuition.recentTransactions")}</h2>
            <TransactionsTable
              transactions={transactions}
              isTeacher={isTeacher}
              dateLocale={dateLocale}
              emptyMessage={
                hasFilters ? t("tuition.noTransactionsFiltered") : t("tuition.noTransactionsYet")
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
                    ? detailTarget.studentEmail || t("tuition.detailStudentBreakdown")
                    : t("tuition.detailStudentHistory")}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {isTeacher ? t("tuition.classBalances") : t("tuition.currentBalance")}
                  </h3>
                  <div className="rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isTeacher ? <TableHead>{t("tuition.colClass")}</TableHead> : null}
                          <TableHead>{t("tuition.colBilling")}</TableHead>
                          <TableHead>{t("tuition.colBalance")}</TableHead>
                          <TableHead>{t("tuition.colStatus")}</TableHead>
                          {isTeacher ? (
                            <TableHead className="text-right">{t("tuition.colActions")}</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailBalances.map((row) => (
                          <TableRow key={`${row.student_id}-${row.class_id}`}>
                            {isTeacher ? <TableCell>{row.class_name}</TableCell> : null}
                            <TableCell className="text-sm text-muted-foreground">
                              {row.billing_mode === "per_hour"
                                ? t("tuition.billingPerHour")
                                : t("tuition.billingPerSession")}
                              {row.unit_price > 0 ? ` · $${row.unit_price}` : ""}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatBalance(row.balance, row.unit, t)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.status)}>
                                {statusLabel(row.status, t)}
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
                                  {t("tuition.topup")}
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
                  <h3 className="text-sm font-semibold">{t("tuition.transactions")}</h3>
                  {detailTransactionsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">{t("tuition.loadingTransactions")}</p>
                  ) : (
                    <TransactionsTable
                      transactions={detailTransactions}
                      isTeacher={isTeacher}
                      dateLocale={dateLocale}
                      emptyMessage={t("tuition.noTransactionsInRange")}
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
                <DialogTitle>{t("tuition.dialogTitle")}</DialogTitle>
                {topupTarget ? (
                  <p className="text-sm text-muted-foreground">
                    {topupTarget.student_name} · {topupTarget.class_name}
                  </p>
                ) : null}
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="topup-amount">
                    {t("tuition.amountLabel", {
                      unit:
                        topupTarget?.unit === "hours"
                          ? t("tuition.unitHoursFull")
                          : t("tuition.unitSessionsFull"),
                    })}
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
                  <Label htmlFor="topup-comment">{t("tuition.commentOptional")}</Label>
                  <Textarea
                    id="topup-comment"
                    value={topupComment}
                    onChange={(e) => setTopupComment(e.target.value)}
                    placeholder={t("tuition.commentPlaceholder")}
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
                  {t("tuition.cancel")}
                </Button>
                <Button type="submit" disabled={topupMutation.isPending || !topupTarget}>
                  {topupMutation.isPending ? t("tuition.saving") : t("tuition.saveTopup")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
