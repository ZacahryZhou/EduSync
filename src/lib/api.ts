/**
 * =============================================================================
 * api.ts — HTTP helper for the frontend / 前端 HTTP 请求封装
 * =============================================================================
 *
 * ## What this file is for / 这个文件是干什么的？
 *
 * **English:** Your React app talks to the Flask backend over HTTP. Raw `fetch()`
 * needs a full URL, correct headers, and often a JWT on every request. This
 * module centralizes that so pages only write short calls like
 * `apiFetch("/auth/login", { method: "POST", body: ... })` instead of repeating
 * base URL and `Authorization` everywhere.
 *
 * **中文：** 前端要通过 HTTP 访问 Flask 后端。每次手写 `fetch` 都要拼完整地址、
 * 处理请求头、还要带上 JWT，容易漏、容易错。这里把「根地址 + 默认头 + Bearer token」
 * 集中写在一处，页面里只写路径和 body，代码更短、更统一。
 *
 * ## What `BASE_URL` does / BASE_URL 的作用
 *
 * **English:** All API routes in your backend are under `/api` (e.g.
 * `POST http://localhost:5000/api/auth/login`). `BASE_URL` is the fixed prefix
 * so relative paths like `/auth/login` become the full URL automatically.
 *
 * **中文：** 后端接口都在 `/api` 下面（例如 `POST http://localhost:5000/api/auth/login`）。
 * `BASE_URL` 就是这段固定前缀；你传相对路径 `/auth/login`，函数会自动拼成完整 URL。
 *
 * ## Why `Authorization: Bearer <token>` / 为什么要带 Bearer token？
 *
 * **English:** After login, the server returns a JWT. Protected routes expect
 * `Authorization: Bearer eyJ...`. The browser does not attach that by itself.
 * We read the token from `localStorage` (same key as `AuthContext`: `edusync_token`)
 * and add the header on each request so you do not forget it.
 *
 * **中文：** 登录成功后服务器返回 JWT。受保护的接口要求请求头里带上
 * `Authorization: Bearer <token>`。浏览器不会自动加。我们从 `localStorage` 读取 token
 *（键名与 `AuthContext` 一致：`edusync_token`），每次请求自动加上，避免遗漏。
 *
 * ## Important / 重要约定
 *
 * - Keep `AUTH_TOKEN_STORAGE_KEY` in sync with `STORAGE_KEY_TOKEN` in
 *   `src/context/AuthContext.tsx` / 键名必须与 AuthContext 里的 `edusync_token` 一致。
 * - Later you can switch `BASE_URL` to `import.meta.env.VITE_API_URL` for
 *   production / 上线后可改为环境变量 `VITE_API_URL`，此处先用本地开发地址。
 *
 * =============================================================================
 */

/** Backend API root (development) / 后端 API 根地址（开发环境） */
export const BASE_URL = "http://localhost:5000/api";

/**
 * Must match `STORAGE_KEY_TOKEN` in AuthContext / 必须与 AuthContext 中的 token 键一致
 * @see src/context/AuthContext.tsx
 */
const AUTH_TOKEN_STORAGE_KEY = "edusync_token";

/**
 * Read JWT from localStorage (set by AuthContext.login) /
 * 从 localStorage 读取 JWT（由 AuthContext.login 写入）
 */
function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Join `BASE_URL` with a path to a full URL /
 * 把 BASE_URL 和路径拼成完整请求地址
 *
 * @param path — e.g. `/auth/login` or `auth/login` / 例如 `/auth/login` 或 `auth/login`
 */
function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  return `${base}${normalized}`;
}

/**
 * `fetch` wrapper: same as global fetch, but:
 * - Prefixes relative URLs with `BASE_URL` / 相对路径自动加上 BASE_URL
 * - Adds `Authorization: Bearer …` when a token exists in localStorage /
 *   若 localStorage 有 token，则自动附加 Bearer 头
 *
 * @param path — Relative API path or absolute URL / 相对 API 路径或完整 URL
 * @param init — Same as `fetch` second argument (method, body, headers, …) / 与原生 fetch 的第二个参数相同
 * @returns The same `Promise<Response>` as `fetch` / 返回值与 fetch 相同
 *
 * **English:** If you pass custom `headers` with `Authorization` already set,
 * we do not overwrite it (useful for rare public or special requests).
 *
 * **中文：** 若你在 `init.headers` 里已经写了 `Authorization`，本函数不会覆盖，
 * 方便极少数不需要默认 token 或要自己指定头的请求。
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveUrl(path);
  const token = getStoredAccessToken();

  const headers = new Headers(init?.headers ?? undefined);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

export type LoginUserResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    role: string;
  }; 
};

/**
 * Log in with email + password / 使用邮箱和密码登录
 *
 * Calls `POST /api/auth/login` and returns the backend `{ token, user }` payload.
 * 调用登录接口，并返回后端的 `{ token, user }` 数据。
 */

/**
 * this is login user function -> login user is a web request to the backend to login the user with email and password
 * 
 */

//对外暴露一个登录函数 -> 接受邮箱和密码，返回登录结果//
export async function loginUser(
  email: string,
  password: string,
): Promise<LoginUserResponse> {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
//调用apiFetch函数（已经封装好的）-> 发送到后端 然后apiFetch会自动拼上Base_URL和token//

  if (!response.ok) {
    let message = `Login failed (${response.status})`;

    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Keep the default status-based message when the response is not JSON.
    }

    throw new Error(message);
  }
//请求失败的时候，尝试读取后端返回的错误信息，要是读取不到的话就用默认的状态码信息 然后抛出错误//

  return (await response.json()) as LoginUserResponse;
}
//成功的话 就把后端返回的JSON解析出来返回给调用者//

export type RegisterStudentResponse = {
  message: string;
};

/**
 * Register a student account / 注册学生账号
 *
 * Calls `POST /api/auth/register/student` with `{ email, password, display_name }`.
 * 调用学生注册接口；后端字段为 `display_name`（对应 UI 上的 name）。
 *
 * @returns `{ message }` on success (HTTP 201) / 成功时返回提示信息
 */
export async function registerStudent(
  email: string,
  password: string,
  displayName: string,
): Promise<RegisterStudentResponse> {
  const response = await apiFetch("/auth/register/student", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
    }),
  });

  if (!response.ok) {
    let message = `Student registration failed (${response.status})`;

    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Keep the default status-based message when the response is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as RegisterStudentResponse;
}

/**
 * Register an admin (company) account / 注册管理员（机构）账号
 *
 * Calls `POST /api/auth/register/admin` with `{ company_name, email, password }`.
 * 调用管理员注册接口（MVP：创建机构 + admin 用户，并返回 token）。
 *
 * @returns `{ token, user }` on success — same shape as login / 成功时与登录接口相同结构
 */
export async function registerAdmin(
  companyName: string,
  email: string,
  password: string,
): Promise<LoginUserResponse> {
  const response = await apiFetch("/auth/register/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      company_name: companyName,
      email,
      password,
    }),
  });

  if (!response.ok) {
    let message = `Admin registration failed (${response.status})`;

    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Keep the default status-based message when the response is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as LoginUserResponse;
}

/** 知识点：
 * 1: async and await -> 异步编程 因为网络请求需要时间 await means wait for the response to come back before moving on to the next line of code//
 * response.ok -> 判断请求是否成功 200-299 为成功 其他为失败//
 * logic 错误的两层嵌套 -> 第一层是response.ok 第二层是try catch 读取错误信息 -> 无论读不读得到都会抛出错误信息//
 * 发请求 → 等回复 → 判断成功还是失败 → 成功就返回数据，失败就抛错误
 * */