import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  MessageSquareWarning,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageEmptyState } from "@/components/PageEmptyState";
import { useAuth } from "@/context/AuthContext";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function notificationIcon(type: NotificationType) {
  if (type === "reschedule_requested") {
    return MessageSquareWarning;
  }
  if (type === "reschedule_resolved") {
    return RefreshCw;
  }
  return CalendarClock;
}

function notificationAccent(type: NotificationType): string {
  if (type === "reschedule_requested") {
    return "border-l-amber-500 bg-amber-500/5";
  }
  if (type === "reschedule_resolved") {
    return "border-l-emerald-500 bg-emerald-500/5";
  }
  return "border-l-primary bg-primary/5";
}

function formatNotificationTime(value?: string): string {
  if (!value) {
    return "";
  }
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

function NotificationRow({
  item,
  onMarkRead,
  isPending,
}: {
  item: NotificationItem;
  onMarkRead: (id: string) => void;
  isPending: boolean;
}) {
  const Icon = notificationIcon(item.type);

  return (
    <Card
      className={cn(
        "border-border/60 shadow-sm transition-colors",
        !item.read && "ring-1 ring-primary/10",
      )}
    >
      <CardContent className="flex gap-3 p-4">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-l-[3px]",
            notificationAccent(item.type),
          )}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug">{item.title}</p>
            {!item.read ? (
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          {item.created_at ? (
            <p className="mt-2 text-xs text-muted-foreground/80">
              {formatNotificationTime(item.created_at)}
            </p>
          ) : null}
        </div>
        {!item.read ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 self-start text-xs"
            disabled={isPending}
            onClick={() => onMarkRead(item.id)}
          >
            Mark read
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id] as const,
    queryFn: () => listNotifications({ limit: 50 }),
    enabled: Boolean(user?.id),
    staleTime: 15_000,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-header">Notifications</h1>
          <p className="page-subtitle">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You are all caught up"}
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {notificationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : notificationsQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {(notificationsQuery.error as Error).message}
        </p>
      ) : notifications.length === 0 ? (
        <PageEmptyState
          icon={Bell}
          title="No notifications"
          description="Alerts about schedule changes, reschedule requests, and class updates will appear here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              isPending={markReadMutation.isPending}
              onMarkRead={(id) => markReadMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
