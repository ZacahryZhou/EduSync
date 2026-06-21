# EduSync 开发启动会议记录
> 整理自第一次完整规划对话 · 2026-03-31

---

## 关于 Zachary（开发者）

- gap year 学生，在加拿大，平时有兼职和其他事情
- 每天可投入时间：2-4小时
- 编程基础：有一定基础（能写简单代码，复杂问题会卡住）
- 开发方式：一边学一边做
- 工具：VS Code + Claude

---

## 关于这个项目

**EduSync** 是一个教育管理平台，做给真实的补习班/私教老师用。

**已有内容：**
- 前端模板：React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 8个页面（Dashboard、Calendar、Classes、Students、Assignments、Tuition、Notifications、Settings）
- 所有页面目前用的是假数据（mock-data.ts）
- Flask 后端骨架（能启动，但只有测试路由）
- GitHub 仓库：https://github.com/fanxiaotuGod/EduSync

**技术栈：**
- 前端：React + TypeScript + Vite + Tailwind + shadcn/ui
- 后端：Python + Flask
- 数据库：Supabase（PostgreSQL）
- 认证：自己写 JWT
- 前端部署：Vercel
- 后端部署：Railway（MVP阶段）

---

## MVP 范围（做给老师测试）

**做：**
- 登录 / 注册（老师 + 学生）
- 班级管理（创建、查看、加入）
- 日历课程（创建、查看）

**不做（MVP 之后再加）：**
- 作业系统
- 学费/余额管理
- 通知系统
- 改课申请
- PDF报告

---

## 7周开发计划

| 周次 | 内容 | 完成标志 | 状态 |
|---|---|---|---|
| 第0周 | 环境准备 + Supabase 注册 | 前后端都能跑 | ✅ |
| 第1周 | Flask 后端结构 + 建数据库表 | `/api/health` 返回 ok | ✅ |
| 第2周 | 注册/登录 API | Thunder Client 测试通过 | ✅ |
| 第3周 | 前端登录页 + 接入真实 API | 浏览器能真实登录 | ✅ |
| 第4周 | 班级功能（前后端） | 老师能创建班级 | 👉 当前 |
| 第5周 | 日历/课程功能（前后端） | 日历上能看到真实课程 | ⬜ |
| 第6周 | 测试 + 部署 Vercel + Railway | 老师拿到链接可以测试 | ⬜ |
| 第7周 | 缓冲周 | 处理 bug 和意外 | ⬜ |

---

## 老师如何测试 MVP

- 前端部署到 **Vercel**（免费，有公开网址）
- 后端部署到 **Railway**（免费额度够，比 VPS 简单）
- 给老师一个链接 + 测试账号，直接在浏览器里测试
- 不需要在 Zachary 的电脑上运行

---

## 准备工作进度

- [x] Node.js v22.14.0 已安装
- [x] Python 3.13.2 已安装
- [x] Git 已安装
- [x] VS Code 已安装
- [x] GitHub 仓库已有
- [x] Supabase 账号已注册，项目已创建（Canada Central）
- [x] 复制保存 Supabase URL + service_role key
- [x] 在 VS Code 安装 Thunder Client 插件
- [x] 创建 backend/.env 文件
- [x] 确认 .gitignore 有保护 .env

---

## Supabase 信息记录

在 Supabase 控制台 → Settings → API Keys → Legacy 标签里找到：

- **Project URL**：`https://xxxx.supabase.co`（在页面顶部）
- **anon key**：`eyJhbG...`（公开的，前端可以用）
- **service_role key**：点 Reveal 显示（**绝对不能公开！只给后端用**）

---

## 下一步（从这里继续）

> 更新于 2026-06-03 · 第 0–3 周已完成

1. 按 `MVP-PLAN.md` **第 4 周**：后端 `POST/GET/PATCH/DELETE /api/classes` + `POST /api/classes/join`
2. Thunder Client 测通后再改 `ClassesPage.tsx`（创建班级、班级码加入）
3. 详细任务见 `MVP-PLAN.md` 第 4 周 Day 1–5

---

## 开发原则（记住这几条）

1. **永远先写后端 API → 用 Thunder Client 测试 → 再写前端**
2. `.env` 文件永远不上传 GitHub
3. 每完成一个小功能就 commit 一次
4. 卡住了先问 Claude，把报错信息完整粘贴过来

---

*这份文件记录了所有启动信息，新对话开始时可以把这个文件给 Claude 看，直接接着做。*
