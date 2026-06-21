import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { AiAssistant } from "@/components/AiAssistant";
import { AiBetaBadge } from "@/components/AiBetaNotice";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Floating AI entry — bottom-right on every teacher screen. */
export function AiAssistantFab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

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
            open && "scale-95 opacity-90",
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              {t("nav.ai")}
              <AiBetaBadge />
            </SheetTitle>
            <SheetDescription className="text-xs">
              {t("ai.fabHint")}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-3 sm:px-6">
            <AiAssistant
              variant="page"
              className="h-[calc(100dvh-7.5rem)] max-h-none border-0 shadow-none"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
