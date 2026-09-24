import type { LucideIcon } from "lucide-react";

type PageEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function PageEmptyState({ icon: Icon, title, description }: PageEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-gradient-to-b from-card to-secondary/45 px-6 py-16 text-center shadow-sm">
      {/* Empty states should feel calm, not broken / 空状态要让用户觉得“还没数据”，不是“页面坏了”。 */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
