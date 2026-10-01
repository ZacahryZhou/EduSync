import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { getAiConversation, listAiLogs, type AiChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AiResumeRequest } from "@/components/AiAssistant";

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
  /** Called with the full thread once a past conversation is picked, so the
   * parent can switch to the Chat tab and load it there. Entries without a
   * conversation_id (logged before that migration) still resume — they
   * just start a fresh conversation seeded with that one exchange. */
  onResume?: (request: AiResumeRequest) => void;
};

export function AiInteractionLog({
  className,
  enabled = true,
  onResume,
}: AiInteractionLogProps) {
  const { t } = useTranslation();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ["ai-logs"],
    queryFn: () => listAiLogs(40),
    enabled,
    staleTime: 15_000,
  });

  async function handleSelect(entry: {
    id: string;
    conversation_id: string | null;
    messages: AiChatMessage[] | null;
    reply: string | null;
  }) {
    if (!onResume || loadingId) {
      return;
    }
    setLoadingId(entry.id);
    try {
      if (entry.conversation_id) {
        const detail = await getAiConversation(entry.conversation_id);
        onResume({ conversationId: detail.conversation_id, messages: detail.messages });
      } else {
        // Pre-migration row: no conversation_id to fetch by — resume with
        // just this row's own opening exchange as a brand-new conversation.
        const messages = [...(entry.messages ?? [])];
        if (entry.reply) {
          messages.push({ role: "assistant", content: entry.reply });
        }
        onResume({ conversationId: crypto.randomUUID(), messages });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("ai.logResumeFailed"),
      );
    } finally {
      setLoadingId(null);
    }
  }

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
          // The opening question (first row in the conversation) — the
          // matching "latest reply" only makes sense to preview when there
          // was just one exchange; for a longer thread it'd pair an old
          // question with an unrelated later answer, so show a turn count
          // instead. Click the card to load the whole thing either way.
          const question = lastUserMessage(entry.messages);
          const isSingleTurn = entry.turn_count <= 1;
          const isLoading = loadingId === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                disabled={!onResume || isLoading}
                onClick={() => void handleSelect(entry)}
                className={cn(
                  "w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left text-sm transition-colors",
                  onResume && "hover:border-primary/40 hover:bg-muted/40",
                  isLoading && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <time dateTime={entry.created_at}>{formatLogTime(entry.created_at)}</time>
                  <span className="flex items-center gap-2">
                    {entry.turn_count > 1 ? (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {t("ai.logTurnCount", { count: entry.turn_count })}
                      </span>
                    ) : null}
                    {entry.model ? <span>{entry.model}</span> : null}
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  </span>
                </div>
                {question ? (
                  <p className="mt-2 font-medium text-foreground">
                    <span className="text-muted-foreground">{t("ai.logQuestion")}: </span>
                    {question}
                  </p>
                ) : null}
                {isSingleTurn && entry.reply ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                    <span className="font-medium text-foreground">{t("ai.logAnswer")}: </span>
                    {entry.reply}
                  </p>
                ) : null}
                {entry.error_message ? (
                  <p className="mt-2 text-xs text-destructive">{entry.error_message}</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
