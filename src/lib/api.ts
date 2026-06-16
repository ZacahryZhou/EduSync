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

/** Backend API root — set VITE_API_URL on Vercel; falls back to local dev */
export const BASE_URL =
  import.meta.env.VITE_API_URL?.trim() || "http://127.0.0.1:5000/api";

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
    avatar_url?: string | null;
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

export type OAuthUserPayload = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  avatar_url?: string | null;
};

export type OAuthCompleteOk = {
  status: "ok";
  token: string;
  user: OAuthUserPayload;
};

export type OAuthCompleteNeedsProfile = {
  status: "needs_profile";
  token: string;
  email: string;
  suggested_display_name: string;
  avatar_url?: string;
};

export type OAuthCompleteResponse = OAuthCompleteOk | OAuthCompleteNeedsProfile;

async function parseApiError(
  response: Response,
  fallback: string,
): Promise<never> {
  let message = fallback;

  try {
    const errorBody = (await response.json()) as { error?: unknown };
    if (typeof errorBody.error === "string") {
      message = errorBody.error;
    }
  } catch {
    // Keep fallback when body is not JSON.
  }

  throw new Error(message);
}

export async function completeOAuthSignIn(
  accessToken: string,
): Promise<OAuthCompleteResponse> {
  const response = await apiFetch("/auth/oauth/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!response.ok) {
    await parseApiError(response, `Google sign-in failed (${response.status})`);
  }

  return (await response.json()) as OAuthCompleteResponse;
}

export async function registerOAuthUser(
  accessToken: string,
  role: "teacher" | "student",
  displayName: string,
  avatarUrl?: string,
): Promise<{ token: string; user: OAuthUserPayload }> {
  const response = await apiFetch("/auth/oauth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_token: accessToken,
      role,
      display_name: displayName,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    }),
  });

  if (!response.ok) {
    await parseApiError(
      response,
      `Could not finish Google sign-in (${response.status})`,
    );
  }

  const body = (await response.json()) as {
    token: string;
    user: OAuthUserPayload;
  };
  return { token: body.token, user: body.user };
}

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
  grade?: string,
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
      ...(grade?.trim() ? { grade: grade.trim() } : {}),
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

export type RegisterTeacherResponse = {
  message: string;
};

/**
 * Register a teacher account / 注册教师账号
 *
 * Calls `POST /api/auth/register/teacher` with `{ email, password, display_name }`.
 * 调用教师注册接口；后端字段为 `display_name`（对应 UI 上的 name）。
 *
 * @returns `{ message }` on success (HTTP 201) / 成功时返回提示信息
 */
export async function registerTeacher(
  email: string,
  password: string,
  displayName: string,
): Promise<RegisterTeacherResponse> {
  const response = await apiFetch("/auth/register/teacher", {
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
    let message = `Teacher registration failed (${response.status})`;

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

  return (await response.json()) as RegisterTeacherResponse;
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

/**
 * Profile returned by the current-user endpoint / 当前登录用户资料
 *
 * Backend: `GET /api/users` with `Authorization: Bearer <token>` (@require_auth).
 * PRD also names this `GET /api/users/me`; this project uses `/users` under BASE_URL.
 * 后端实际路由为 GET /api/users（需 Bearer token）；与文档中的 /users/me 用途相同。
 */
export type CurrentUserResponse = {
  id: string;
  email: string;
  role: string;
  display_name: string;
  email_notifications?: boolean;
  grade?: string | null;
  avatar_url?: string | null;
  created_at?: string;
};

/**
 * Fetch the logged-in user's profile and validate the JWT / 获取当前用户并验证 token
 *
 * **English data flow:**
 * 1. `apiFetch("/users")` reads `edusync_token` from localStorage and sends
 *    `Authorization: Bearer …`.
 * 2. Flask `require_auth` checks the token with Supabase; invalid → 401.
 * 3. On 200, returns `{ id, email, role, display_name, … }`.
 * 4. `AuthContext` maps `display_name` → `name` for the UI (same as login).
 *
 * **中文数据流：**
 * 1. 从 localStorage 取 token，自动加到请求头。
 * 2. 后端验证 token；无效或过期 → 401。
 * 3. 成功则返回用户 JSON。
 * 4. AuthContext 把 display_name 映射成前端的 name。
 *
 * Use after page refresh: localStorage may still have a token, but it might be
 * expired — calling this proves the session is still valid.
 * 刷新页面后 localStorage 里可能有旧 token，调用本接口可确认是否仍有效。
 */
export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const response = await apiFetch("/users", {
    method: "GET",
  });

  if (!response.ok) {
    let message = `Failed to load current user (${response.status})`;

    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Keep default message when body is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as CurrentUserResponse;
}

/** Update the logged-in user's profile / 更新当前用户资料 */
export async function updateCurrentUser(input: {
  display_name?: string;
  email_notifications?: boolean;
  grade?: string | null;
  avatar_url?: string | null;
}): Promise<CurrentUserResponse> {
  const response = await apiFetch("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = `Failed to update profile (${response.status})`;

    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Keep default message when body is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as CurrentUserResponse;
}

/** Upload profile photo (JPEG, PNG, or WebP, max 2MB) */
export async function uploadUserAvatar(file: File): Promise<CurrentUserResponse> {
  const form = new FormData();
  form.append("file", file);

  const response = await apiFetch("/users/me/avatar", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to upload avatar"));
  }

  return (await response.json()) as CurrentUserResponse;
}

export type ClassItem = {
  id: string;
  name: string;
  description: string;
  code: string;
  billing_mode: "per_hour" | "per_session";
  unit_price: number;
  teacher_id: string;
  color: string;
  student_count: number;
  created_at?: string;
};

type ClassesListResponse = {
  classes: ClassItem[];
};

type ClassResponse = {
  class: ClassItem;
};

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const errorBody = (await response.json()) as { error?: unknown };
    if (typeof errorBody.error === "string") {
      return errorBody.error;
    }
  } catch {
    // Keep fallback when body is not JSON.
  }
  return `${fallback} (${response.status})`;
}

/** List classes for the current user (teacher: own classes; student: enrolled). */
export async function listClasses(): Promise<ClassItem[]> {
  const response = await apiFetch("/classes", { method: "GET" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load classes"));
  }

  const data = (await response.json()) as ClassesListResponse;
  return data.classes;
}

/** Teacher creates a class / 教师创建班级 */
export async function createClass(input: {
  name: string;
  description?: string;
  billing_mode?: "per_hour" | "per_session";
  unit_price?: number;
}): Promise<ClassItem> {
  const response = await apiFetch("/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create class"));
  }

  const data = (await response.json()) as ClassResponse;
  return data.class;
}

/** Student joins a class with a class code / 学生用班级码加入 */
export async function joinClass(classCode: string): Promise<ClassItem> {
  const response = await apiFetch("/classes/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_code: classCode }),
  });

  if (!response.ok) {
    const message = await readApiError(response, "Failed to join class");
    if (response.status === 401) {
      throw new Error(
        `${message} Log out, sign in again, then retry joining the class.`,
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Only student accounts can join with a class code. Log out and sign in with a student account.",
      );
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { class: ClassItem };
  return data.class;
}

/** Teacher updates a class / 教师更新班级 */
export async function updateClass(
  classId: string,
  input: {
    name?: string;
    description?: string;
    billing_mode?: "per_hour" | "per_session";
    unit_price?: number;
  },
): Promise<ClassItem> {
  const response = await apiFetch(`/classes/${classId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update class"));
  }

  const data = (await response.json()) as ClassResponse;
  return data.class;
}

export type ClassStudent = {
  id: string;
  display_name: string;
  email: string;
  joined_at?: string;
  status?: "active" | "pending";
  invite_id?: string;
  grade?: string | null;
};

/** Teacher lists enrolled students for a class / 教师查看班级学生名单 */
export async function listClassStudents(classId: string): Promise<ClassStudent[]> {
  const response = await apiFetch(`/classes/${classId}/students`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load class roster"));
  }

  const data = (await response.json()) as { students: ClassStudent[] };
  return data.students;
}

export type ClassInviteResult = {
  status: "pending" | "active";
  message: string;
  student_id?: string;
  email?: string;
  display_name?: string;
  initial_password?: string | null;
  invite?: {
    id: string;
    class_id: string;
    email: string;
    display_name: string;
    grade?: string | null;
    status: string;
    invited_at?: string;
  };
};

/** Teacher adds a student by email (creates login with initial password, or enrolls existing account). */
export async function inviteClassStudent(
  classId: string,
  payload: {
    email: string;
    display_name: string;
    grade?: string;
    teacher_note?: string;
  },
): Promise<ClassInviteResult> {
  const response = await apiFetch(`/classes/${classId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to invite student"));
  }

  return (await response.json()) as ClassInviteResult;
}

/** Cancel a pending class invite. */
export async function cancelClassInvite(
  classId: string,
  inviteId: string,
): Promise<void> {
  const response = await apiFetch(`/classes/${classId}/invites/${inviteId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to cancel invite"));
  }
}

/** Remove an enrolled student from a class. */
export async function removeClassStudent(
  classId: string,
  studentId: string,
): Promise<void> {
  const response = await apiFetch(`/classes/${classId}/students/${studentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to remove student"));
  }
}

export type ClassMaterial = {
  id: string;
  class_id: string;
  title: string;
  file_name: string;
  mime_type: string;
  file_size?: number;
  download_url: string | null;
  uploaded_by?: string;
  uploaded_by_name: string;
  created_at?: string;
};

export type MaterialUsage = {
  used_bytes: number;
  quota_bytes: number;
  remaining_bytes: number;
  used_percent: number;
  single_file_limit_bytes: number;
};

export async function listClassMaterials(classId: string): Promise<ClassMaterial[]> {
  const response = await apiFetch(`/classes/${classId}/materials`, { method: "GET" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load materials"));
  }

  const data = (await response.json()) as { materials: ClassMaterial[] };
  return data.materials ?? [];
}

export async function uploadClassMaterial(
  classId: string,
  input: { title: string; file: File },
): Promise<ClassMaterial> {
  const form = new FormData();
  form.append("title", input.title.trim());
  form.append("file", input.file);

  const response = await apiFetch(`/classes/${classId}/materials`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to upload material"));
  }

  const data = (await response.json()) as { material: ClassMaterial };
  return data.material;
}

export async function deleteClassMaterial(
  classId: string,
  materialId: string,
): Promise<void> {
  const response = await apiFetch(`/classes/${classId}/materials/${materialId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete material"));
  }
}

export async function getMaterialUsage(): Promise<MaterialUsage> {
  const response = await apiFetch("/materials/usage", { method: "GET" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load storage usage"));
  }

  return (await response.json()) as MaterialUsage;
}

export async function listRecentMaterials(limit = 5): Promise<ClassMaterial[]> {
  const response = await apiFetch(`/materials/recent?limit=${limit}`, { method: "GET" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load recent materials"));
  }

  const data = (await response.json()) as { materials: ClassMaterial[] };
  return data.materials ?? [];
}

export type StudentClassEnrollment = {
  id: string;
  name: string;
  color: string;
  joined_at?: string;
  enrollment_status?: "active" | "pending";
  invite_id?: string;
};

export type TeacherStudent = {
  id: string;
  display_name: string;
  email: string;
  grade?: string | null;
  classes: StudentClassEnrollment[];
  status?: "active" | "pending" | "mixed";
};

export type StudentReportPeriod = "week" | "half_month" | "month";

export type StudentReport = {
  student: {
    id: string;
    display_name: string;
    email: string;
    grade?: string | null;
  };
  period: {
    type: StudentReportPeriod;
    start_date: string;
    end_date: string;
  };
  classes: Array<{
    id: string;
    name: string;
    billing_mode?: string;
    unit_price?: number;
  }>;
  attendance: {
    summary: {
      present: number;
      late: number;
      absent: number;
      unrecorded: number;
      total: number;
    };
    sessions: Array<{
      id: string;
      class_name: string;
      title: string;
      date: string;
      start_time: string;
      end_time: string;
      notes: string;
      attendance_status: string;
    }>;
  };
  assignments: Array<{
    id: string;
    class_name: string;
    title: string;
    description: string;
    due_date?: string | null;
    submitted_at?: string | null;
    grade?: string | null;
    feedback: string;
    status: "submitted" | "missing";
  }>;
  balances: Array<{
    class_id: string;
    class_name: string;
    balance: number;
    unit: string;
  }>;
  teacher_note: {
    content: string;
    updated_at?: string | null;
  };
};

export type TeacherStudentsResponse = {
  students: TeacherStudent[];
  total: number;
  grades: string[];
};

/** Teacher lists enrolled students; optional search `q` and `grade` filter */
export async function listTeacherStudents(filters?: {
  q?: string;
  grade?: string;
}): Promise<TeacherStudentsResponse> {
  const params = new URLSearchParams();
  if (filters?.q?.trim()) {
    params.set("q", filters.q.trim());
  }
  if (filters?.grade) {
    params.set("grade", filters.grade);
  }
  const query = params.toString();
  const response = await apiFetch(`/students${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load students"));
  }

  return (await response.json()) as TeacherStudentsResponse;
}

export type StudentNote = {
  content: string;
  updated_at?: string | null;
};

/** Teacher reads private note for a student / 教师读取学生私有备注 */
export async function getStudentNote(studentId: string): Promise<StudentNote> {
  const response = await apiFetch(`/students/${studentId}/notes`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load note"));
  }

  return (await response.json()) as StudentNote;
}

/** Teacher saves private note for a student / 教师保存学生私有备注 */
export async function saveStudentNote(
  studentId: string,
  content: string,
): Promise<StudentNote> {
  const response = await apiFetch(`/students/${studentId}/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to save note"));
  }

  return (await response.json()) as StudentNote;
}

export async function getStudentReport(
  studentId: string,
  period: StudentReportPeriod,
): Promise<StudentReport> {
  const response = await apiFetch(`/students/${studentId}/report?period=${period}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to generate report"));
  }

  return (await response.json()) as StudentReport;
}

/** Teacher deletes a class / 教师删除班级 */
export async function deleteClass(classId: string): Promise<void> {
  const response = await apiFetch(`/classes/${classId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete class"));
  }
}

export type SessionItem = {
  id: string;
  class_id: string;
  class_name: string;
  color: string;
  title: string;
  /** Shown in UI when title is empty (falls back to class name). */
  display_title?: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  meeting_url?: string;
  type: "one-time" | "recurring";
  recurrence_rule?: string;
  recurrence_group_id?: string | null;
  notes?: string;
  created_at?: string;
};

/** Label for calendar lists when session title is optional. */
export function sessionDisplayTitle(
  session: Pick<SessionItem, "title" | "class_name" | "display_title">,
): string {
  const fromApi = session.display_title?.trim();
  if (fromApi) {
    return fromApi;
  }
  const title = session.title?.trim();
  if (title) {
    return title;
  }
  return session.class_name?.trim() || "Session";
}

type SessionsListResponse = {
  sessions: SessionItem[];
};

type SessionResponse = {
  session: SessionItem;
  count?: number;
  sessions?: SessionItem[];
};

/** List sessions for the current month (optional class filter). */
export async function listSessions(month: string, classId?: string): Promise<SessionItem[]> {
  const params = new URLSearchParams({ month });
  if (classId) {
    params.set("class_id", classId);
  }

  const response = await apiFetch(`/sessions?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load sessions"));
  }

  const data = (await response.json()) as SessionsListResponse;
  return data.sessions;
}

export type SessionsIcalExportOptions = {
  classId?: string;
  from?: string;
  to?: string;
};

/** Download all accessible sessions as an .ics file (Apple / Google Calendar import). */
export async function downloadSessionsIcal(
  options?: SessionsIcalExportOptions,
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.classId) {
    params.set("class_id", options.classId);
  }
  if (options?.from) {
    params.set("from", options.from);
  }
  if (options?.to) {
    params.set("to", options.to);
  }

  const query = params.toString();
  const response = await apiFetch(`/sessions/export.ics${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to export calendar"));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "edusync-schedule.ics";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export type CreateSessionResult = {
  session: SessionItem;
  count: number;
  sessions?: SessionItem[];
  notified_students?: number;
};

/** Teacher creates a session (one-time or weekly recurring) */
export async function createSession(input: {
  class_id: string;
  title?: string;
  date: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
  type?: "one-time" | "recurring";
  recurrence_rule?: "weekly";
  recurrence_end_date?: string;
}): Promise<CreateSessionResult> {
  const response = await apiFetch("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create session"));
  }

  const data = (await response.json()) as SessionResponse;
  return {
    session: data.session,
    count: data.count ?? 1,
    sessions: data.sessions,
  };
}

/** Teacher updates a session / 教师更新课程 */
export async function updateSession(
  sessionId: string,
  input: {
    title?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    meeting_url?: string;
    notes?: string;
  },
): Promise<SessionItem> {
  const response = await apiFetch(`/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update session"));
  }

  const data = (await response.json()) as SessionResponse;
  return data.session;
}

/** Teacher deletes a session (optionally the full recurring series) */
export async function deleteSession(
  sessionId: string,
  options?: { scope?: "this" | "series" },
): Promise<{ deleted_count: number }> {
  const scope = options?.scope ?? "this";
  const response = await apiFetch(`/sessions/${sessionId}?scope=${scope}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete session"));
  }

  const data = (await response.json()) as { deleted_count?: number };
  return { deleted_count: data.deleted_count ?? 1 };
}

export type AttendanceStatus = "present" | "absent" | "late";

export type AttendanceRecord = {
  student_id: string;
  student_name: string;
  email: string;
  status: AttendanceStatus;
  recorded_at?: string | null;
  is_pending?: boolean;
};

type SessionAttendanceResponse = {
  session_id: string;
  records?: AttendanceRecord[];
  my_status?: AttendanceStatus | null;
  recorded_at?: string | null;
};

/** Teacher: roster + status; student: own status for one session */
export async function getSessionAttendance(sessionId: string): Promise<SessionAttendanceResponse> {
  const response = await apiFetch(`/sessions/${sessionId}/attendance`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load attendance"));
  }

  return (await response.json()) as SessionAttendanceResponse;
}

/** Teacher saves attendance for a session */
export async function saveSessionAttendance(
  sessionId: string,
  records: { student_id: string; status: AttendanceStatus }[],
): Promise<{ session_id: string; records: AttendanceRecord[] }> {
  const response = await apiFetch(`/sessions/${sessionId}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to save attendance"));
  }

  return (await response.json()) as { session_id: string; records: AttendanceRecord[] };
}

export type MyAttendanceRecord = {
  session_id: string;
  session_title: string;
  class_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: AttendanceStatus;
  recorded_at?: string;
};

/** Student attendance history (optional month filter yyyy-MM) */
export async function listMyAttendance(month?: string): Promise<MyAttendanceRecord[]> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const response = await apiFetch(`/attendance/me${params}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load attendance history"));
  }

  const data = (await response.json()) as { records: MyAttendanceRecord[] };
  return data.records ?? [];
}

export type BalanceStatus = "sufficient" | "low" | "zero";

export type StudentBalance = {
  student_id: string;
  student_name: string;
  student_email: string;
  class_id: string;
  class_name: string;
  billing_mode: "per_hour" | "per_session";
  unit_price: number;
  balance: number;
  unit: "sessions" | "hours";
  status: BalanceStatus;
  is_pending?: boolean;
};

export type BalanceTransaction = {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  session_id?: string | null;
  type: "topup" | "deduction";
  amount: number;
  unit: "sessions" | "hours";
  balance_after: number;
  comment: string;
  recorded_by?: string | null;
  recorded_by_name: string;
  created_at?: string;
};

export async function listTuitionBalances(filters?: {
  classId?: string;
  q?: string;
}): Promise<StudentBalance[]> {
  const params = new URLSearchParams();
  if (filters?.classId) {
    params.set("class_id", filters.classId);
  }
  if (filters?.q?.trim()) {
    params.set("q", filters.q.trim());
  }
  const query = params.toString();
  const response = await apiFetch(`/tuition/balances${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load balances"));
  }

  const data = (await response.json()) as { balances: StudentBalance[] };
  return data.balances ?? [];
}

export async function listTuitionTransactions(options?: {
  studentId?: string;
  classId?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<BalanceTransaction[]> {
  const params = new URLSearchParams();
  if (options?.studentId) {
    params.set("student_id", options.studentId);
  }
  if (options?.classId) {
    params.set("class_id", options.classId);
  }
  if (options?.q?.trim()) {
    params.set("q", options.q.trim());
  }
  if (options?.from) {
    params.set("from", options.from);
  }
  if (options?.to) {
    params.set("to", options.to);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const response = await apiFetch(`/tuition/transactions${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load transactions"));
  }

  const data = (await response.json()) as { transactions: BalanceTransaction[] };
  return data.transactions ?? [];
}

export async function recordTuitionTopup(input: {
  student_id: string;
  class_id: string;
  amount: number;
  comment?: string;
}): Promise<{ balance: StudentBalance; transaction: BalanceTransaction }> {
  const response = await apiFetch("/tuition/topup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to record top-up"));
  }

  return (await response.json()) as {
    balance: StudentBalance;
    transaction: BalanceTransaction;
  };
}

export type RescheduleRequest = {
  id: string;
  session_id: string;
  student_id: string;
  proposed_date: string;
  proposed_start: string;
  proposed_end: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  teacher_response: string;
  created_at?: string;
  resolved_at?: string | null;
  session_title: string;
  session_date: string;
  session_start: string;
  session_end: string;
  class_id: string;
  class_name: string;
  student_name: string;
  student_email: string;
};

/** List reschedule requests (teacher: their classes; student: own). */
export async function listRescheduleRequests(
  status?: "pending" | "approved" | "rejected",
): Promise<RescheduleRequest[]> {
  const params = status ? `?status=${status}` : "";
  const response = await apiFetch(`/reschedule-requests${params}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load reschedule requests"));
  }

  const data = (await response.json()) as { requests: RescheduleRequest[] };
  return data.requests;
}

/** Student submits a reschedule request / 学生提交改课申请 */
export async function createRescheduleRequest(input: {
  session_id: string;
  proposed_date: string;
  proposed_start: string;
  proposed_end: string;
  reason: string;
}): Promise<RescheduleRequest> {
  const response = await apiFetch("/reschedule-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to submit request"));
  }

  const data = (await response.json()) as { request: RescheduleRequest };
  return data.request;
}

/** Teacher approves a reschedule request / 教师批准改课 */
export async function approveRescheduleRequest(
  requestId: string,
  teacherResponse?: string,
): Promise<RescheduleRequest> {
  const response = await apiFetch(`/reschedule-requests/${requestId}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacher_response: teacherResponse ?? "" }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to approve request"));
  }

  const data = (await response.json()) as { request: RescheduleRequest };
  return data.request;
}

/** Teacher rejects a reschedule request / 教师拒绝改课 */
export async function rejectRescheduleRequest(
  requestId: string,
  teacherResponse?: string,
): Promise<RescheduleRequest> {
  const response = await apiFetch(`/reschedule-requests/${requestId}/reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacher_response: teacherResponse ?? "" }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to reject request"));
  }

  const data = (await response.json()) as { request: RescheduleRequest };
  return data.request;
}

export type AssignmentSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  content: string;
  file_name: string;
  file_download_url?: string | null;
  grade: string | null;
  feedback: string;
  submitted_at: string | null;
};

export type AssignmentItem = {
  id: string;
  class_id: string;
  class_name: string;
  color: string;
  title: string;
  description: string;
  due_date: string | null;
  attachment_url: string;
  created_at?: string;
  updated_at?: string;
  my_submission?: AssignmentSubmission | null;
  past_due?: boolean;
};

/** List assignments for classes the user can access */
export async function listAssignments(classId?: string): Promise<AssignmentItem[]> {
  const params = new URLSearchParams();
  if (classId) {
    params.set("class_id", classId);
  }
  const query = params.toString();
  const response = await apiFetch(`/assignments${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load assignments"));
  }

  const data = (await response.json()) as { assignments: AssignmentItem[] };
  return data.assignments ?? [];
}

/** Teacher creates an assignment for a class */
export async function createAssignment(input: {
  class_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  attachment_url?: string;
}): Promise<{ assignment: AssignmentItem; students_notified: number }> {
  const response = await apiFetch("/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create assignment"));
  }

  return (await response.json()) as {
    assignment: AssignmentItem;
    students_notified: number;
  };
}

/** Teacher deletes an assignment */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  const response = await apiFetch(`/assignments/${assignmentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete assignment"));
  }
}

/** Student submits or resubmits an assignment */
export async function submitAssignment(
  assignmentId: string,
  input: { content?: string; file?: File | null },
): Promise<AssignmentSubmission> {
  const form = new FormData();
  if (input.content?.trim()) {
    form.append("content", input.content.trim());
  }
  if (input.file) {
    form.append("file", input.file);
  }

  const response = await apiFetch(`/assignments/${assignmentId}/submit`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to submit assignment"));
  }

  const data = (await response.json()) as { submission: AssignmentSubmission };
  return data.submission;
}

/** Teacher lists submissions for an assignment */
export async function listAssignmentSubmissions(
  assignmentId: string,
): Promise<AssignmentSubmission[]> {
  const response = await apiFetch(`/assignments/${assignmentId}/submissions`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load submissions"));
  }

  const data = (await response.json()) as { submissions: AssignmentSubmission[] };
  return data.submissions ?? [];
}

/** Teacher grades a submission */
export async function gradeSubmission(
  submissionId: string,
  input: { grade: string; feedback?: string },
): Promise<AssignmentSubmission> {
  const response = await apiFetch(`/submissions/${submissionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to grade submission"));
  }

  const data = (await response.json()) as { submission: AssignmentSubmission };
  return data.submission;
}

export type NotificationType =
  | "schedule_changed"
  | "reschedule_requested"
  | "reschedule_resolved"
  | "session_scheduled"
  | "assignment_published"
  | "assignment_submitted"
  | "assignment_graded";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  related_id: string | null;
  created_at?: string;
};

export type NotificationsResponse = {
  notifications: NotificationItem[];
  unread_count: number;
};

export type DashboardPendingGradeItem = {
  submission_id: string;
  assignment_id: string;
  assignment_title: string;
  class_name: string;
  student_name: string;
  submitted_at: string | null;
};

export type DashboardOpenAssignmentItem = {
  assignment_id: string;
  title: string;
  class_name: string;
  due_date: string | null;
  past_due: boolean;
};

export type DashboardSummary = {
  role: string;
  unread_notifications: number;
  recent_notifications: NotificationItem[];
  pending_grades: number;
  pending_reschedules: number;
  open_assignments: number;
  pending_grade_items: DashboardPendingGradeItem[];
  open_assignment_items: DashboardOpenAssignmentItem[];
};

/** Aggregated counts and recent items for the dashboard */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiFetch("/dashboard/summary", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load dashboard summary"));
  }

  return (await response.json()) as DashboardSummary;
}

/** List in-app notifications for the current user */
export async function listNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (options?.unreadOnly) {
    params.set("unread_only", "true");
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  const response = await apiFetch(`/notifications${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load notifications"));
  }

  return (await response.json()) as NotificationsResponse;
}

/** Mark a single notification as read */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationItem> {
  const response = await apiFetch(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to mark notification as read"));
  }

  const data = (await response.json()) as { notification: NotificationItem };
  return data.notification;
}

/** Mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  const response = await apiFetch("/notifications/read-all", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to mark all as read"));
  }
}

/** --- Teacher AI (DeepSeek) --- */

export type AiChatRole = "user" | "assistant";

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
};

export type AiStreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_start"; name: string; label?: string }
  | { type: "tool_done"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AiStatus = {
  configured: boolean;
  model: string;
  read_tools?: boolean;
};

/** Whether DeepSeek is configured on the backend */
export async function getAiStatus(): Promise<AiStatus> {
  const response = await apiFetch("/ai/status", { method: "GET" });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load AI status"));
  }
  return (await response.json()) as AiStatus;
}

/**
 * Stream a teacher chat completion (SSE).
 * Events: token chunks, done, or error.
 */
export async function streamAiChat(
  messages: AiChatMessage[],
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiFetch("/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    onEvent({
      type: "error",
      message: await readApiError(response, "AI request failed"),
    });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onEvent({ type: "error", message: "Streaming is not supported in this browser" });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .map((row) => row.trim())
        .find((row) => row.startsWith("data:"));
      if (!line) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (!payload) {
        continue;
      }
      try {
        const event = JSON.parse(payload) as AiStreamEvent;
        onEvent(event);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

/** 知识点：
 * 1: async and await -> 异步编程 因为网络请求需要时间 await means wait for the response to come back before moving on to the next line of code//
 * response.ok -> 判断请求是否成功 200-299 为成功 其他为失败//
 * logic 错误的两层嵌套 -> 第一层是response.ok 第二层是try catch 读取错误信息 -> 无论读不读得到都会抛出错误信息//
 * 发请求 → 等回复 → 判断成功还是失败 → 成功就返回数据，失败就抛错误
 * */