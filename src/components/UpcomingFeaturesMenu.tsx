import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bot,
  CalendarDays,
  FileBarChart2,
  FolderOpen,
  GripVertical,
  MessageCircle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getFeatureFeedback,
  submitFeatureFeedback,
  type FeatureVote,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const FEATURE_CALENDAR_DRAG = "calendar_drag_schedule";
export const FEATURE_STUDENT_MATERIALS_AI = "student_materials_ai";
export const FEATURE_CHAT_AI = "messaging_ai_integration";
export const FEATURE_TEACHER_REPORTS = "periodic_teacher_reports";
export const FEATURE_GOOGLE_DRIVE = "google_drive_integration";

const FEATURE_IDS = [
  FEATURE_CALENDAR_DRAG,
  FEATURE_STUDENT_MATERIALS_AI,
  FEATURE_CHAT_AI,
  FEATURE_TEACHER_REPORTS,
  FEATURE_GOOGLE_DRIVE,
] as const;

type FeatureI18nKey =
  | "calendar"
  | "studentAi"
  | "chatAi"
  | "teacherReports"
  | "googleDrive";

type FeatureConfig = {
  id: (typeof FEATURE_IDS)[number];
  i18nKey: FeatureI18nKey;
  illustration?: ReactNode;
};

const FEATURES: FeatureConfig[] = [
  {
    id: FEATURE_CALENDAR_DRAG,
    i18nKey: "calendar",
    illustration: (
      <div className="flex gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="w-20 space-y-1 rounded-md border border-dashed border-border/70 bg-background/80 p-1.5">
          <p className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
            Students
          </p>
          {["Amy", "Ben"].map((name) => (
            <div
              key={name}
              className="flex items-center gap-0.5 rounded border border-border/50 bg-background px-1 py-0.5 text-[9px]"
            >
              <GripVertical className="h-2.5 w-2.5 text-muted-foreground/60" />
              {name}
            </div>
          ))}
        </div>
        <div className="flex items-center text-muted-foreground/40">→</div>
        <div className="w-24 rounded-md border border-border/70 bg-background p-1.5">
          <div className="mb-1 flex items-center gap-0.5 text-[8px] font-medium text-muted-foreground">
            <CalendarDays className="h-2.5 w-2.5" />
            Calendar
          </div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-[1px] bg-muted/50",
                  i === 9 && "ring-1 ring-primary bg-primary/20",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: FEATURE_STUDENT_MATERIALS_AI,
    i18nKey: "studentAi",
    illustration: (
      <div className="flex items-stretch gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="flex flex-1 flex-col gap-1 rounded-md border border-dashed border-border/70 bg-background/80 p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            Materials
          </div>
          <div className="space-y-0.5 text-[9px] text-muted-foreground">
            <div className="rounded bg-muted/60 px-1 py-0.5">Unit 3 notes.pdf</div>
            <div className="rounded bg-muted/60 px-1 py-0.5">Vocab list.docx</div>
          </div>
        </div>
        <div className="flex items-center text-muted-foreground/40">→</div>
        <div className="flex w-28 flex-col gap-1 rounded-md border border-border/70 bg-background p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <Bot className="h-3 w-3" />
            Student AI
          </div>
          <div className="rounded-md bg-primary/10 px-1.5 py-1 text-[8px] leading-snug text-foreground">
            What should I review for Friday?
          </div>
          <div className="rounded-md bg-muted/60 px-1.5 py-1 text-[8px] leading-snug text-muted-foreground">
            From Unit 3 notes: focus on…
          </div>
        </div>
      </div>
    ),
  },
  {
    id: FEATURE_CHAT_AI,
    i18nKey: "chatAi",
    illustration: (
      <div className="flex items-stretch gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="flex w-24 flex-col gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2">
          <p className="text-[8px] font-medium text-emerald-800 dark:text-emerald-200">WeChat</p>
          <div className="rounded-lg bg-emerald-600/90 px-1.5 py-1 text-[8px] text-white">
            Move Tue class to 5pm?
          </div>
          <p className="text-[8px] font-medium text-emerald-800/80 dark:text-emerald-200/80">
            WhatsApp
          </p>
        </div>
        <div className="flex items-center text-muted-foreground/40">↔</div>
        <div className="flex flex-1 flex-col gap-1 rounded-md border border-violet-500/25 bg-violet-500/5 p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-violet-800 dark:text-violet-200">
            <MessageCircle className="h-3 w-3" />
            EduSync AI
          </div>
          <div className="rounded-md border border-border/60 bg-card px-1.5 py-1 text-[8px] leading-snug">
            Done — Algebra Tue updated to 17:00. Students notified.
          </div>
        </div>
      </div>
    ),
  },
  {
    id: FEATURE_TEACHER_REPORTS,
    i18nKey: "teacherReports",
    illustration: (
      <div className="flex items-stretch gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="flex flex-1 flex-col gap-1 rounded-md border border-dashed border-border/70 bg-background/80 p-2">
          <p className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
            This week
          </p>
          <div className="space-y-0.5 text-[8px] text-muted-foreground">
            <div className="rounded bg-muted/60 px-1 py-0.5">Attendance · 12 students</div>
            <div className="rounded bg-muted/60 px-1 py-0.5">Grades · 3 assignments</div>
            <div className="rounded bg-muted/60 px-1 py-0.5">Notes & messages</div>
          </div>
        </div>
        <div className="flex items-center text-muted-foreground/40">→</div>
        <div className="flex w-28 flex-col gap-1 rounded-md border border-border/70 bg-background p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <FileBarChart2 className="h-3 w-3" />
            Weekly report
          </div>
          <div className="space-y-0.5 text-[8px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Present</span>
              <span className="font-medium">92%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">At risk</span>
              <span className="font-medium text-amber-700">2</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: FEATURE_GOOGLE_DRIVE,
    i18nKey: "googleDrive",
    illustration: (
      <div className="flex items-stretch gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="flex flex-1 flex-col gap-1 rounded-md border border-dashed border-border/70 bg-background/80 p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <FolderOpen className="h-3 w-3" />
            Google Drive
          </div>
          <div className="space-y-0.5 text-[9px] text-muted-foreground">
            <div className="rounded bg-muted/60 px-1 py-0.5">Class 8A / Unit 3</div>
            <div className="rounded bg-muted/60 px-1 py-0.5">Slides · Worksheets</div>
          </div>
        </div>
        <div className="flex items-center text-muted-foreground/40">→</div>
        <div className="flex w-28 flex-col gap-1 rounded-md border border-border/70 bg-background p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <Bot className="h-3 w-3" />
            AI + materials
          </div>
          <div className="rounded-md bg-muted/60 px-1.5 py-1 text-[8px] leading-snug text-muted-foreground">
            Answers use files from your Drive folder
          </div>
        </div>
      </div>
    ),
  },
];

function localVoteKey(featureId: string) {
  return `edusync:feature-preview:${featureId}:vote`;
}

function readLocalVote(featureId: string): FeatureVote | null {
  const voted = window.localStorage.getItem(localVoteKey(featureId));
  return voted === "support" || voted === "oppose" ? voted : null;
}

type FeatureVoteCardProps = {
  feature: FeatureConfig;
};

function FeatureVoteCard({ feature }: FeatureVoteCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const baseKey = `upcomingFeatures.${feature.i18nKey}`;
  const [localVote, setLocalVote] = useState<FeatureVote | null>(() =>
    readLocalVote(feature.id),
  );

  const feedbackQuery = useQuery({
    queryKey: ["feature-feedback", feature.id],
    queryFn: () => getFeatureFeedback(feature.id),
    staleTime: 60_000,
  });

  const voteMutation = useMutation({
    mutationFn: (vote: FeatureVote) => submitFeatureFeedback(feature.id, vote),
    onSuccess: (data, vote) => {
      window.localStorage.setItem(localVoteKey(feature.id), vote);
      setLocalVote(vote);
      queryClient.setQueryData(["feature-feedback", feature.id], data);
      toast.success(t("upcomingFeatures.thanks"));
    },
    onError: (error, vote) => {
      window.localStorage.setItem(localVoteKey(feature.id), vote);
      setLocalVote(vote);
      toast.error(
        error instanceof Error ? error.message : t("upcomingFeatures.saveFailed"),
      );
    },
  });

  const myVote = feedbackQuery.data?.my_vote ?? localVote;
  const supportCount = feedbackQuery.data?.support ?? 0;
  const opposeCount = feedbackQuery.data?.oppose ?? 0;
  const totalVotes = supportCount + opposeCount;
  const points = t(`${baseKey}.points`, { returnObjects: true }) as string[];

  return (
    <article className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
            <Sparkles className="h-3 w-3" />
            {t("upcomingFeatures.badge")}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{t(`${baseKey}.title`)}</h3>
          <p className="text-sm text-muted-foreground">{t(`${baseKey}.description`)}</p>
          {Array.isArray(points) && points.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {feature.illustration ? (
          <div className="hidden sm:block">{feature.illustration}</div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {myVote ? (
              <span>
                {myVote === "support"
                  ? t("upcomingFeatures.youSupported")
                  : t("upcomingFeatures.youOpposed")}
                {totalVotes > 0
                  ? ` · ${t("upcomingFeatures.tally", {
                      support: supportCount,
                      oppose: opposeCount,
                    })}`
                  : null}
              </span>
            ) : (
              t("upcomingFeatures.prompt")
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={myVote === "support" ? "default" : "outline"}
              className="gap-1.5"
              disabled={voteMutation.isPending}
              onClick={() => voteMutation.mutate("support")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {t("upcomingFeatures.support")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={myVote === "oppose" ? "secondary" : "outline"}
              className="gap-1.5"
              disabled={voteMutation.isPending}
              onClick={() => voteMutation.mutate("oppose")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              {t("upcomingFeatures.oppose")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function UpcomingFeaturesMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const feedbackQueries = useQueries({
    queries: FEATURE_IDS.map((id) => ({
      queryKey: ["feature-feedback", id],
      queryFn: () => getFeatureFeedback(id),
      staleTime: 60_000,
    })),
  });

  const pendingCount = useMemo(() => {
    return FEATURE_IDS.filter((id, index) => {
      const serverVote = feedbackQueries[index]?.data?.my_vote ?? null;
      const localVote = readLocalVote(id);
      return !serverVote && !localVote;
    }).length;
  }, [feedbackQueries]);

  const menuLabel = useMemo(() => t("upcomingFeatures.menuLabel"), [t]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        <span className="hidden sm:inline">{menuLabel}</span>
        {pendingCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
            {pendingCount}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4 pr-12">
            <DialogTitle>{t("upcomingFeatures.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("upcomingFeatures.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {FEATURES.map((feature) => (
              <FeatureVoteCard key={feature.id} feature={feature} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
