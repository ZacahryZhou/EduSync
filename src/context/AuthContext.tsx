/**
 * AuthContext — global authentication state / 全局认证状态
 *
 * What this file does / 这个文件做什么：
 * - Keeps `user` (id, name, role) and `token` in React state / 在 React 状态里保存 user（id、名字、角色）和 token
 * - Persists them in `localStorage` so refresh does not lose login / 同步写入 localStorage，刷新页面后仍保持登录
 * - Exposes `login()` and `logout()` for pages to call / 对外提供 login()、logout() 供页面调用
 *
 * Next step (when you wire the app) / 下一步（接入应用时）：
 * Wrap `<App />` with `<AuthProvider>` in `main.tsx` / 在 main.tsx 里用 <AuthProvider> 包裹 <App />
 * Example / 示例：
 *   <AuthProvider><App /></AuthProvider>
 */


//这个文件的作用是整个系统的认证中枢//


import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Keys used in localStorage — keep stable / localStorage 键名，不要随意改名 */
const STORAGE_KEY_TOKEN = "edusync_token";
const STORAGE_KEY_USER = "edusync_user";

/**
 * Logged-in user shape for the UI layer / 前端使用的「当前用户」结构
 * `name` maps from API `display_name` when you call login() / name 对应后端返回的 display_name
 */
export interface AuthUser {
  /** User id (UUID from backend) / 用户唯一 id（后端 UUID） */
  id: string;
  /** Display name shown in header, etc. / 界面显示的名字 */
  name: string;
  /** Role: e.g. teacher, student, admin / 角色：如 teacher、student、admin */
  role: string;
  /** Optional email / 可选邮箱 */
  email?: string;
}

type AuthContextValue = {
  /** Current user or null if logged out / 当前用户；未登录为 null */
  user: AuthUser | null;
  /** JWT or access token from your API / 接口返回的 JWT 或 access token */
  token: string | null;
  /** True when both token and user exist / 同时有 token 和 user 时为 true */
  isAuthenticated: boolean;
  /**
   * Save session after successful API login / 登录接口成功后调用，写入内存 + localStorage
   * @param newToken — token string from `POST /api/auth/login` / 登录接口返回的 token 字符串
   * @param newUser — minimal user object (id, name, role) / 至少包含 id、name、role
   */
  login: (newToken: string, newUser: AuthUser) => void;
  /** Clear session everywhere / 清除内存与 localStorage 中的登录信息 */
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      "name" in parsed &&
      "role" in parsed
    ) {
      const o = parsed as Record<string, unknown>;
      return {
        id: String(o.id),
        name: String(o.name),
        role: String(o.role),
        email: o.email != null ? String(o.email) : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Provider — must wrap the part of the tree that needs auth / 提供者：需要用到认证的组件树外层要包一层
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Hydrate from localStorage once on mount / 挂载时从 localStorage 恢复一次（避免刷新丢登录）
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedUser = readStoredUser();
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(storedUser);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [user, token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to read auth from any descendant of AuthProvider / 在 AuthProvider 子组件中读取认证状态
 * Throws if used outside provider / 若未包裹 AuthProvider 会抛错，便于尽早发现问题
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error(
      "useAuth must be used within AuthProvider / useAuth 必须在 AuthProvider 内部使用"
    );
  }
  return ctx;
}
