import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History, MessageSquare, Sparkles } from "lucide-react";
import { AiAssistant } from "@/components/AiAssistant";
import { AiInteractionLog } from "@/components/AiInteractionLog";
import { AiBetaBadge } from "@/components/AiBetaNotice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AiPanelTab = "chat" | "log";

/** Floating AI entry — bottom-right; opens centered modal. */
export function AiAssistantFab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AiPanelTab>("chat");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTab("chat");
    }
  }

  function refreshLogs() {
    void queryClient.invalidateQueries({ queryKey: ["ai-logs"] });
  }

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 transition-opacity",
          open && "opacity-0",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto group relative flex h-14 w-14 items-center justify-center rounded-full",
            "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30",
            "ring-4 ring-violet-500/20 transition-all duration-200",
            "hover:scale-105 hover:shadow-xl hover:shadow-violet-500/40",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/50",
          )}
          aria-label={t("nav.ai")}
          aria-expanded={open}
        >
          <span
            className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping opacity-40 group-hover:opacity-60"
            aria-hidden
          />
          <Sparkles className="relative h-6 w-6" strokeWidth={2} />
          <span className="absolute -right-0.5 -top-0.5 scale-90">
            <AiBetaBadge />
          </span>
        </button>
        <span className="pointer-events-none hidden rounded-full border border-violet-500/20 bg-card/95 px-2.5 py-1 text-[10px] font-medium text-violet-800 shadow-sm backdrop-blur-sm dark:text-violet-200 sm:block">
          {t("nav.ai")}
        </span>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[min(90vh,52rem)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0",
            "sm:rounded-2xl",
          )}
        >
          <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 px-6 py-4 pr-14 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  {t("nav.ai")}
                  <AiBetaBadge />
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t("ai.fabHint")}
                </DialogDescription>
              </div>
              <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setTab("chat")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === "chat"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t("ai.tabChat")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("log");
                    refreshLogs();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === "log"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  {t("ai.tabLog")}
                </button>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
            {tab === "chat" ? (
              <AiAssistant
                variant="modal"
                className="h-[min(68vh,40rem)]"
                onInteractionComplete={refreshLogs}
              />
            ) : (
              <AiInteractionLog
                className="h-[min(68vh,40rem)]"
                enabled={open && tab === "log"}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
