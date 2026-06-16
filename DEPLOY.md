# EduSync 上线指南（Vercel 前端 + Railway 后端）

按顺序做，不要跳步。预计 30–60 分钟（第一次）。

---

## 上线前检查

- [ ] 本地 `npm run build` 能成功
- [ ] 本地后端 `cd backend && python run.py` 能跑
- [ ] Supabase 里已跑过 `backend/sql/create_mvp_tables.sql` 和 `fix_*.sql`
- [ ] 手边有：`backend/.env` 里的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`

---

## 第 0 步：把代码推到 GitHub

Vercel 和 Railway 都从 GitHub 拉代码。

```bash
cd /Users/yixinzhou/Desktop/EduSync
git status
git add .
git commit -m "Prepare deployment: VITE_API_URL, vercel.json, Railway Procfile"
git push origin main
```

如果 push 失败，先在 GitHub 网页确认仓库 `fanxiaotuGod/EduSync` 你有权限。

---

## 第 1 步：部署后端（Railway）

### 1.1 注册 / 登录

1. 打开 https://railway.app
2. 用 **GitHub** 登录（和 Vercel 同一个 GitHub 账号最省事）

### 1.2 新建项目

1. 点 **New Project**
2. 选 **Deploy from GitHub repo**
3. 选仓库 **fanxiaotuGod/EduSync**
4. 若提示授权 GitHub，点 **Configure** 并允许 Railway 访问该仓库

### 1.3 配置服务（重要）

Railway 默认可能从仓库根目录构建，需要改成 **只部署 backend**：

1. 点进创建出来的 **Service**
2. 打开 **Settings**
3. 找到 **Root Directory**（或 **Source** → Root Directory）
4. 填：`backend`
5. 保存

### 1.4 启动命令（一般自动识别 Procfile）

确认 **Settings** → **Deploy** 里 Start Command 为（或等价于）：

```text
gunicorn run:app --bind 0.0.0.0:$PORT
```

仓库里已有 `backend/Procfile`，Root Directory 设为 `backend` 后通常会生效。

### 1.5 环境变量

打开 **Variables**，添加（值从本地 `backend/.env` 复制）：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 项目 URL | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 密钥（保密） | `eyJ...` |
| `FRONTEND_URL` | 先填 `http://localhost:8080`，第 2 步后再改 | 见下文 |
| `FLASK_ENV` | `production` | `production` |
| `DEEPSEEK_API_KEY` | 老师 AI 助手（DeepSeek） | `sk-...` |
| `DEEPSEEK_API_BASE` | 可选 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 可选 | `deepseek-chat` |

**不要**把 `.env` 提交到 Git；只在 Railway 网页里填。本地 `backend/.env` 里的 key **不会**随 `git push` 上传。

### 1.6 生成公网域名

1. **Settings** → **Networking** → **Generate Domain**
2. 会得到类似：`https://edusync-production-xxxx.up.railway.app`
3. **记下这个地址**，后面叫 **后端地址**

### 1.7 验证后端

浏览器打开：

```text
https://你的后端地址/api/health
```

应看到：`{"status":"ok"}`（或类似 JSON）。

若 502 / 崩溃：在 Railway **Deployments** → 点最新部署 → **View Logs** 看报错（常见：环境变量名写错、Root Directory 不是 `backend`）。

---

## 第 2 步：部署前端（Vercel）

### 2.1 注册 / 登录

1. 打开 https://vercel.com
2. 用 **GitHub** 登录

### 2.2 导入项目

1. **Add New…** → **Project**
2. 选 **Import** `fanxiaotuGod/EduSync`
3. **Framework Preset**：Vite（一般自动识别）
4. **Root Directory**：留空（仓库根目录）
5. **Build Command**：`npm run build`（默认）
6. **Output Directory**：`dist`（默认）

### 2.3 环境变量（部署前就要加）

在 **Environment Variables** 里添加：

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://你的后端地址/api` |
| `VITE_SUPABASE_URL` | Supabase Project URL（Settings → API） |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon** public key（不是 service_role） |

注意：

- 末尾是 **`/api`**，不要多斜杠
- 示例：`https://edusync-production-xxxx.up.railway.app/api`
- Google 登录需要上面两个 `VITE_SUPABASE_*` 变量；改完后要 **Redeploy**

### 2.4 部署

点 **Deploy**，等 1–3 分钟。

成功后得到类似：`https://edusync-xxx.vercel.app` — **记下，叫前端地址**。

### 2.5 更新后端的 CORS（推荐）

回到 **Railway** → 你的服务 → **Variables**：

- 把 `FRONTEND_URL` 改成：`https://你的前端地址`（不要末尾斜杠）

保存后会自动重新部署。当前代码 `CORS(app)` 较宽松，这步主要是为以后收紧 CORS 做准备。

---

## 第 3 步：线上验收

用浏览器打开 **前端地址**：

1. [ ] 自动跳到 `/login`
2. [ ] **注册** 老师账号 → 能进 Dashboard
3. [ ] **Classes** → 创建班级 → 看到班级码
4. [ ] **Calendar** → 添加一节课
5. [ ] 退出，**注册/登录学生** → 用班级码加入 → Calendar 能看到课

若登录报 **Network Error** 或 **Failed to fetch**：

- 检查 Vercel 里 `VITE_API_URL` 是否正确
- 改环境变量后要在 Vercel **Redeploy** 一次（Vite 在构建时注入变量）
- 浏览器 F12 → Network，看请求是否打到 Railway 域名

---

## Google 一键登录配置（可选）

代码已支持；上线前在 Supabase + Google Cloud 配一次即可。

### 1. Google Cloud Console

1. 打开 https://console.cloud.google.com → APIs & Services → Credentials
2. **Create Credentials** → **OAuth client ID** → Application type: **Web application**
3. **Authorized redirect URIs** 添加（在 Supabase 控制台 Authentication → Providers → Google 页面可复制）：
   - `https://你的项目ID.supabase.co/auth/v1/callback`
4. 记下 **Client ID** 和 **Client Secret**

### 2. Supabase Dashboard

1. **Authentication** → **Providers** → **Google** → Enable
2. 填入 Google Client ID / Secret
3. **Authentication** → **URL Configuration**：
   - **Site URL**：`https://你的Vercel前端地址`
   - **Redirect URLs** 添加：
     - `https://你的Vercel前端地址/auth/callback`
     - `http://localhost:5173/auth/callback`（本地开发）

### 3. 本地 `.env`（仓库根目录，不要提交）

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon...
```

首次 Google 登录会弹窗选择 Teacher / Student；老用户直接进 Dashboard。

---

## 常见问题

### Q: 只部署 Vercel 可以吗？

不行。API 在 Flask 后端，必须 Railway（或 Render 等）也上线。

### Q: 改了 VITE_API_URL 不生效？

在 Vercel：**Deployments** → 最新一次 → **⋯** → **Redeploy**（必须重新 build）。

### Q: Railway 日志 `ModuleNotFoundError: app`

Root Directory 必须是 `backend`，且 `run.py` 在 `backend/` 下。

### Q: Supabase 表报错 column does not exist

在 Supabase SQL Editor 执行：

- `backend/sql/fix_class_groups_schema.sql`
- `backend/sql/fix_sessions_schema.sql`

### Q: 本地开发还要改什么吗？

本地不用设 `VITE_API_URL` 也会回退到 `http://127.0.0.1:5000/api`。

可选：复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

---

## 完成后你拥有的地址

| 用途 | 地址 |
|------|------|
| 给老师测试（前端） | `https://xxx.vercel.app` |
| 后端健康检查 | `https://xxx.railway.app/api/health` |
| 数据库 | Supabase 控制台（不变） |

把 **前端地址** 发给老师即可；不要泄露 `SUPABASE_SERVICE_ROLE_KEY`。

---

## 下一步（可选）

- 在 Vercel 绑定自定义域名
- Railway 固定自定义域名（付费计划）
- 把 `MVP-PLAN.md` 第 6 周测试清单勾完
