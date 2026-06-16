import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, GripVertical, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getFeatureFeedback,
  submitFeatureFeedback,
  type FeatureVote,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const FEATURE_CALENDAR_DRAG = "calendar_drag_schedule";

type FeaturePreviewVoteProps = {
  featureId?: string;
  className?: string;
};

function localVoteKey(featureId: string) {
  return `edusync:feature-preview:${featureId}:vote`;
}

function localDismissKey(featureId: string) {
  return `edusync:feature-preview:${featureId}:dismissed`;
}

export function FeaturePreviewVote({
  featureId = FEATURE_CALENDAR_DRAG,
  className,
}: FeaturePreviewVoteProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [localVote, setLocalVote] = useState<FeatureVote | null>(null);

  useEffect(() => {
    const voted = window.localStorage.getItem(localVoteKey(featureId));
    const isDismissed = window.localStorage.getItem(localDismissKey(featureId)) === "1";
    setLocalVote(voted === "support" || voted === "oppose" ? voted : null);
    setVisible(!isDismissed);
  }, [featureId]);

  const feedbackQuery = useQuery({
    queryKey: ["feature-feedback", featureId],
    queryFn: () => getFeatureFeedback(featureId),
    staleTime: 60_000,
  });

  const voteMutation = useMutation({
    mutationFn: (vote: FeatureVote) => submitFeatureFeedback(featureId, vote),
    onSuccess: (data, vote) => {
      window.localStorage.setItem(localVoteKey(featureId), vote);
      setLocalVote(vote);
      queryClient.setQueryData(["feature-feedback", featureId], data);
      toast.success(t("calendar.featurePreview.thanks"));
    },
    onError: (error, vote) => {
      window.localStorage.setItem(localVoteKey(featureId), vote);
      setLocalVote(vote);
      toast.error(
        error instanceof Error ? error.message : t("calendar.featurePreview.saveFailed"),
      );
    },
  });

  const myVote = feedbackQuery.data?.my_vote ?? localVote;
  const supportCount = feedbackQuery.data?.support ?? 0;
  const opposeCount = feedbackQuery.data?.oppose ?? 0;
  const totalVotes = supportCount + opposeCount;

  if (!visible) {
    return null;
  }

  function handleDismiss() {
    window.localStorage.setItem(localDismissKey(featureId), "1");
    setVisible(false);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/8 via-background to-indigo-500/5 p-4 shadow-sm",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 text-muted-foreground"
        aria-label={t("calendar.featurePreview.dismiss")}
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:pr-8">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
              <Sparkles className="h-3 w-3" />
              {t("calendar.featurePreview.badge")}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("calendar.featurePreview.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("calendar.featurePreview.description")}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>{t("calendar.featurePreview.pointClick")}</li>
            <li>{t("calendar.featurePreview.pointDrag")}</li>
            <li>{t("calendar.featurePreview.pointVisual")}</li>
          </ul>
        </div>

        <div
          className="hidden shrink-0 rounded-lg border border-border/60 bg-card/80 p-3 sm:block"
          aria-hidden
        >
          <div className="flex gap-3">
            <div className="w-24 space-y-1.5 rounded-md border border-dashed border-border/70 bg-muted/30 p-2">
              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("calendar.featurePreview.mockStudents")}
              </p>
              {["Amy", "Ben"].map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-1 rounded border border-border/50 bg-background px-1.5 py-1 text-[10px]"
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground/60" />
                  {name}
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-center text-muted-foreground/50">
              <span className="text-lg">→</span>
            </div>
            <div className="w-28 rounded-md border border-border/70 bg-background p-2">
              <div className="mb-1 flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {t("calendar.featurePreview.mockCalendar")}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "aspect-square rounded-[2px] bg-muted/50",
                      i === 9 && "ring-1 ring-primary bg-primary/20",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {myVote ? (
            <span>
              {myVote === "support"
                ? t("calendar.featurePreview.youSupported")
                : t("calendar.featurePreview.youOpposed")}
              {totalVotes > 0
                ? ` · ${t("calendar.featurePreview.tally", {
                    support: supportCount,
                    oppose: opposeCount,
                  })}`
                : null}
            </span>
          ) : (
            t("calendar.featurePreview.prompt")
          )}
        </div>
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
            {t("calendar.featurePreview.support")}
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
            {t("calendar.featurePreview.oppose")}
          </Button>
        </div>
      </div>
    </div>
  );
}
