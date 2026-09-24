import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History, Loader2 } from "lucide-react";
import { listAiLogs, type AiChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

function lastUserMessage(messages: AiChatMessage[] | null | undefined): string {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && messages[i].content?.trim()) {
      return messages[i].content.trim();
    }
  }
  return "";
}

function formatLogTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type AiInteractionLogProps = {
  className?: string;
  enabled?: boolean;
};

export function AiInteractionLog({ className, enabled = true }: AiInteractionLogProps) {
  const { t } = useTranslation();

  const logsQuery = useQuery({
    queryKey: ["ai-logs"],
    queryFn: () => listAiLogs(40),
    enabled,
    staleTime: 15_000,
  });

  if (logsQuery.isLoading) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logsQuery.isError) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6 text-center", className)}>
        <p className="text-sm text-destructive">{(logsQuery.error as Error).message}</p>
      </div>
    );
  }

  const { logs, logging_enabled: loggingEnabled } = logsQuery.data ?? {
    logs: [],
    logging_enabled: false,
  };

  if (!loggingEnabled) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2 p-8 text-center", className)}>
        <History className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">{t("ai.logDisabledTitle")}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t("ai.logDisabledHint")}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2 p-8 text-center", className)}>
        <History className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("ai.logEmpty")}</p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <ul className="space-y-3 p-1 pr-3">
        {logs.map((entry) => {
          const question = lastUserMessage(entry.messages);
          return (
            <li
              key={entry.id}
              className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <time dateTime={entry.created_at}>{formatLogTime(entry.created_at)}</time>
                {entry.model ? <span>{entry.model}</span> : null}
              </div>
              {question ? (
                <p className="mt-2 font-medium text-foreground">
                  <span className="text-muted-foreground">{t("ai.logQuestion")}: </span>
                  {question}
                </p>
              ) : null}
              {entry.reply ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                  <span className="font-medium text-foreground">{t("ai.logAnswer")}: </span>
                  {entry.reply}
                </p>
              ) : null}
              {entry.error_message ? (
                <p className="mt-2 text-xs text-destructive">{entry.error_message}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
