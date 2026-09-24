import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type OnboardingHintProps = {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function OnboardingHint({
  id,
  title,
  description,
  action,
}: OnboardingHintProps) {
  const storageKey = `edusync:onboarding:${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(storageKey) !== "dismissed");
  }, [storageKey]);

  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{description}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 self-end sm:self-start"
        aria-label="Dismiss tip"
        onClick={() => {
          window.localStorage.setItem(storageKey, "dismissed");
          setVisible(false);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
