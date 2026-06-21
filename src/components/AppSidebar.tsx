import {
  LayoutDashboard,
  Calendar,
  Users,
  BookOpen,
  FileText,
  DollarSign,
  Bell,
  Settings,
  GraduationCap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { isStudentRole, isTeacherRole, normalizeRole } from "@/lib/roles";

const teacherMainNav = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "nav.calendar", url: "/calendar", icon: Calendar },
  { titleKey: "nav.classes", url: "/classes", icon: BookOpen },
  { titleKey: "nav.students", url: "/students", icon: Users },
  { titleKey: "nav.assignments", url: "/assignments", icon: FileText },
  { titleKey: "nav.tuition", url: "/tuition", icon: DollarSign },
  { titleKey: "nav.notifications", url: "/notifications", icon: Bell },
] as const;

const studentMainNav = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "nav.calendar", url: "/calendar", icon: Calendar },
  { titleKey: "nav.classes", url: "/classes", icon: BookOpen },
  { titleKey: "nav.assignments", url: "/assignments", icon: FileText },
  { titleKey: "nav.tuition", url: "/tuition", icon: DollarSign },
  { titleKey: "nav.notifications", url: "/notifications", icon: Bell },
] as const;

const manageNav: { titleKey: string; url: string; icon: typeof DollarSign }[] = [];

export function AppSidebar() {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const { user } = useAuth();
  const collapsed = state === "collapsed";
  const displayName = user?.name ?? "User";
  const role = normalizeRole(user?.role);
  const isTeacher = isTeacherRole(role);
  const isStudent = isStudentRole(role);
  const roleLabel = isTeacher
    ? t("roles.teacher")
    : isStudent
      ? t("roles.student")
      : user?.role ?? "";

  const visibleMainNav = isStudent ? studentMainNav : teacherMainNav;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary shadow-sm flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
                EduSync
              </span>
              <p className="text-[11px] text-muted-foreground">{t("brand.tagline")}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold px-3 mb-2">
            {t("nav.main")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isTeacher && manageNav.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold px-3 mb-2">
            Manage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageNav.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/70">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </NavLink>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mt-1 rounded-xl bg-white/55">
            <Avatar className="w-8 h-8">
              {user?.avatar ? (
                <AvatarImage src={user.avatar} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                {displayName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate">
                {displayName}
              </span>
              <span className="text-[11px] text-muted-foreground truncate capitalize">
                {roleLabel}
              </span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
