/**
 * AppLayout — shell with sidebar + top header / 应用外壳：侧边栏 + 顶栏
 *
 * MVP Week 3: show current user name in the header (top-right) and Log out.
 * 第 3 周要求：右上角显示当前用户名，并能退出登录。
 *
 * logout() clears AuthContext + localStorage; navigate("/login") sends user to login.
 * 退出时清空全局状态与 localStorage，再跳转到登录页（配合 GuestRoute / ProtectedRoute）。
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { UpcomingFeaturesMenu } from "@/components/UpcomingFeaturesMenu";
import { AiAssistantFab } from "@/components/AiAssistantFab";
import { Bell, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { listNotifications } from "@/lib/api";
import { isStudentRole, isTeacherRole, normalizeRole } from "@/lib/roles";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const displayName = user?.name ?? "User";
  const role = normalizeRole(user?.role);
  const roleLabel = isTeacherRole(role)
    ? "Teacher"
    : isStudentRole(role)
      ? "Student"
      : user?.role ?? "";

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id] as const,
    queryFn: () => listNotifications({ limit: 1 }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });

  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  function handleLogout() {
    queryClient.clear();
    logout();
    navigate("/login", { replace: true, state: {} });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-transparent">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* App chrome / 应用外壳:
              a translucent header keeps navigation visible while the soft background adds depth. */}
          <header className="h-16 flex items-center justify-between border-b border-white/70 px-5 bg-card/80 backdrop-blur-md sticky top-0 z-10 shadow-sm shadow-slate-900/[0.03]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground" />
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={
                    isStudentRole(role)
                      ? "Search classes..."
                      : "Search students, classes..."
                  }
                  className="pl-9 w-72 h-9 rounded-full bg-secondary/70 border-0 text-sm focus-visible:ring-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isTeacherRole(role) ? <UpcomingFeaturesMenu /> : null}
              <Button
                variant="ghost"
                size="icon"
                className="relative text-muted-foreground"
                asChild
              >
                <Link to="/notifications" aria-label="Notifications">
                  <Bell className="w-[18px] h-[18px]" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <div className="hidden sm:flex flex-col items-end leading-tight px-1">
                <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                  {displayName}
                </span>
                {roleLabel ? (
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {roleLabel}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleLogout}
              >
                <LogOut className="w-3.5 h-3.5" />
                Log out
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <div className="p-6 lg:p-8">
              {children}
            </div>
          </main>
          {isTeacherRole(role) ? <AiAssistantFab /> : null}
        </div>
      </div>
    </SidebarProvider>
  );
}
