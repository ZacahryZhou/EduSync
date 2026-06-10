/**
 * =============================================================================
 * GuestRoute.tsx — Guard for public auth pages / 公开认证页守卫（与 ProtectedRoute 相反）
 * =============================================================================
 *
 * ## What this file does / 这个文件做什么？
 *
 * **English:** Used on `/login` and `/register`. If the user is **already logged in**,
 * do not show the login form again — redirect to `/` (Dashboard).
 * If **not** logged in, render the page normally (`<Outlet />` or `children`).
 *
 * **中文：** 包在登录页、注册页外面。已登录用户不应再看到登录表单，
 * 应自动跳到首页；未登录则正常显示登录/注册页。
 *
 * ## Why pair with ProtectedRoute? / 为什么要和 ProtectedRoute 成对？
 *
 * | Route type        | Guard           | Not logged in      | Logged in        |
 * |-------------------|-----------------|--------------------|------------------|
 * | App pages `/dashboard`… | ProtectedRoute | → `/login`      | show page        |
 * | Auth pages              | GuestRoute     | show login/register | → `/dashboard` |
 *
 * Without GuestRoute, a logged-in user can still open `/login` in the address bar
 * (confusing UX, and they might think they are logged out).
 *
 * 没有 GuestRoute 时，已登录用户仍能手动打开 `/login`，体验混乱。
 *
 * ## Knowledge: symmetric guards / 知识点：对称守卫
 *
 * - ProtectedRoute = "members only" / 会员专区
 * - GuestRoute = "guests only" (auth forms) / 仅访客（未登录填表）
 *
 * =============================================================================
 */

import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

type GuestRouteProps = {
  /** Optional single-page wrap / 可选：直接包裹一个页面 */
  children?: ReactNode;
};

export function GuestRoute({ children }: GuestRouteProps) {
  const { isAuthenticated } = useAuth();

  // Already logged in → dashboard / 已登录 → 去 Dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
