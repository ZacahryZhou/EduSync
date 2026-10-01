/**
 * =============================================================================
 * ProtectedRoute.tsx — Route guard for authenticated pages / 受保护路由守卫
 * =============================================================================
 *
 * ## What this file does / 这个文件做什么？
 *
 * **English:** A small wrapper used in React Router. Before showing a page
 * (Dashboard, Classes, etc.), it asks AuthContext: "Is the user logged in?"
 * - If NO  → redirect to `/login` (replace history so Back does not return).
 * - If YES → render the page (`children` or nested `<Outlet />`).
 *
 * **中文：** 放在需要登录才能看的页面外面。先通过 `useAuth()` 看是否已登录：
 * - 未登录 → 自动 `Navigate` 到 `/login`
 * - 已登录 → 正常显示子页面
 *
 * ## Why we need it / 为什么需要？
 *
 * Without this guard, anyone can type `http://localhost:8080/` in the address
 * bar and see the Dashboard even when not logged in (MVP plan: "路由保护").
 *
 * 没有守卫时，用户不登录也能直接打开 `/`、`/classes` 等 URL，不符合 MVP 要求。
 *
 * ## How to wire it later (App.tsx) — not done in this file / 稍后如何在 App.tsx 使用
 *
 * **Pattern A — layout route (recommended):**
 * ```tsx
 * <Route element={<ProtectedRoute />}>
 *   <Route element={<AppShell />}>
 *     <Route path="/" element={<Dashboard />} />
 *   </Route>
 * </Route>
 * ```
 * Here `ProtectedRoute` renders `<Outlet />` for nested routes.
 * 此时组件内部渲染 `<Outlet />`，子路由会在 Outlet 位置显示。
 *
 * **Pattern B — wrap one page:**
 * ```tsx
 * <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 * ```
 * Here `ProtectedRoute` renders `children`.
 *
 * ## Knowledge: Navigate vs useNavigate / 知识点
 *
 * - `useNavigate()` — imperative, call inside event handlers (e.g. after login).
 *   在函数里主动跳转，例如登录成功后 `navigate("/")`。
 * - `<Navigate to="..." />` — declarative, render it like JSX when a condition is true.
 *   根据条件在 JSX 里直接“渲染一个跳转”，适合守卫组件。
 * - `replace` — replaces current history entry so user cannot Back into a protected
 *   page while logged out. `replace` 避免用户点“后退”回到未登录时看过的受保护页。
 *
 * ## Knowledge: isAuthenticated / 知识点
 *
 * From AuthContext: `isAuthenticated = Boolean(token && user)`.
 * Both JWT in memory/localStorage AND user object must exist.
 * 必须同时有 token 和 user，才视为已登录（见 AuthContext.tsx）。
 *
 * ## Optional: `state={{ from: location }}` / 可选：登录后跳回原页面
 *
 * We pass the attempted URL in navigation state. LoginPage reads
 * `location.state?.from` and redirects there after a successful login.
 * 把用户原本想去的地址传给登录页，登录成功后跳回该页面（见 LoginPage.tsx）。
 *
 * =============================================================================
 */

import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

type ProtectedRouteProps = {
  /**
   * Optional child element when wrapping a single page directly.
   * 直接包裹单个页面时传入 children。
   * If omitted, nested routes render through `<Outlet />`.
   * 不传 children 时，配合嵌套路由使用 Outlet。
   */
  children?: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Not logged in → send user to login page / 未登录 → 跳转登录页
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // Logged in → show protected content / 已登录 → 渲染受保护内容
  if (children) {
    return <>{children}</>;
  }

  // Layout route pattern: render nested routes / 布局路由模式：渲染子路由
  return <Outlet />;
}
