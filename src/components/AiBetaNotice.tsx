import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function AiBetaBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200",
        className,
      )}
    >
      {t("ai.betaBadge")}
    </span>
  );
}

export function AiBetaNotice({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <Alert
        className={cn(
          "border-amber-500/30 bg-amber-500/5 py-2 text-foreground [&>svg]:left-3 [&>svg]:top-3 [&>svg]:text-amber-600 [&>svg~*]:pl-6",
          className,
        )}
      >
        <FlaskConical className="h-3.5 w-3.5" />
        <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("ai.betaTitle")}</span>{" "}
          <AiBetaBadge className="align-middle" />
          <span className="mt-1 block">{t("ai.betaBodyShort")}</span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      className={cn(
        "border-amber-500/30 bg-amber-500/5 text-foreground [&>svg]:text-amber-600",
        className,
      )}
    >
      <FlaskConical className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {t("ai.betaTitle")}
        <AiBetaBadge />
      </AlertTitle>
      <AlertDescription className="space-y-2 text-muted-foreground">
        <p>{t("ai.betaBody")}</p>
        <ul className="list-disc space-y-1 pl-4 text-xs">
          <li>{t("ai.betaLimitReadOnly")}</li>
          <li>{t("ai.betaLimitVerify")}</li>
          <li>{t("ai.betaLimitFeedback")}</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
