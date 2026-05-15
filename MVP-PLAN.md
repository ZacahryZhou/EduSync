# EduSync MVP 开发计划
> 专为新手定制 · 目标：7周内交付可测试的 MVP
> 更新于 2026-03-31

---

## 🎯 MVP 目标范围（给老师测试用）

**做什么（MVP 核心）：**
- ✅ 老师可以注册 / 登录
- ✅ 学生可以注册 / 登录
- ✅ 老师可以创建和管理班级
- ✅ 老师可以创建课程安排（日历上可见）
- ✅ 学生加入班级后能看到自己的课程

**暂时不做（等 MVP 通过后再加）：**
- ❌ 作业系统（后期）
- ❌ 学费/余额管理（后期）
- ❌ 通知系统（后期）
- ❌ 改课申请（后期）
- ❌ PDF 报告（后期）

> 🧠 **为什么这样划分？** MVP 的核心是"能用起来"，不是"功能最多"。
> 让老师先登录进去、看到班级和课程表，这就是成功！

---

## ⏱ 时间规划总览

| 阶段 | 内容 | 时间 | 里程碑 |
|---|---|---|---|
| 第 0 周 | 开发环境准备 + 基础概念 | 3-5天 | 前后端都能跑起来 |
| 第 1-2 周 | 后端基础 + 数据库 + 认证 | 2周 | 能注册/登录 + Postman 测试通过 |
| 第 3 周 | 前端接入认证（登录页）| 1周 | 浏览器里能真实登录 |
| 第 4 周 | 班级功能（前端+后端）| 1周 | 老师能创建班级 |
| 第 5 周 | 日历/课程功能（前端+后端）| 1周 | 能看到真实课程安排 |
| 第 6 周 | 测试 + 修 Bug + 部署 | 1周 | 🎉 老师可以在线测试！ |
| 第 7 周（缓冲）| 优化 + 问题处理 | 1周 | 备用周，不慌 |

**总计：6-7周 ≈ 1.5个月** ✅ 符合你 1-2 个月的目标

---

## 📅 详细周计划

---

### 第 0 周：开发环境准备（3-5天）

> **目标**：让前端和后端都能在你电脑上跑起来

**每天任务（2-3小时/天）：**

#### Day 1-2：前端跑起来
```bash
# 在 EduSync 文件夹里运行
npm install
npm run dev
# 浏览器打开 http://localhost:8080 能看到界面 = 成功！
```
- [ ] 看懂 `src/App.tsx`（路由是什么？）
- [ ] 看懂 `src/pages/Dashboard.tsx`（一个页面的结构）
- [ ] 知道 `src/lib/mock-data.ts` 是干什么的

#### Day 3-4：后端跑起来
```bash
cd backend
pip install flask flask-cors python-dotenv
python run.py
# 浏览器打开 http://localhost:5000 看到 "HOME OK" = 成功！
```
- [ ] 理解什么是 API（类比：前端是点菜的客人，后端是厨房，API 是菜单）
- [ ] 用浏览器访问 `http://localhost:5000/test` 看到结果

#### Day 5：注册 Supabase
- [ ] 去 [supabase.com](https://supabase.com) 注册账号（免费）
- [ ] 创建一个新项目，名字叫 `edusync`
- [ ] 在 Project Settings → API 找到：
  - `Project URL`（复制保存）
  - `service_role` key（复制保存，**不要泄露！**）

**💡 本周你会学到：**
- HTTP 是什么（前后端通信的方式）
- npm 和 pip 是什么（包管理器）
- 什么是端口（8080 vs 5000）

---

### 第 1 周：后端架构 + 数据库（BE-01）

> **目标**：搭建好后端框架，在 Supabase 建好所有数据库表

**每天任务（3-4小时/天）：**

#### Day 1-2：完善 Flask 结构
按照这个结构新建文件（让 Claude 帮你写每一个文件）：
```
backend/
├── app/
│   ├── __init__.py    ← 修改（加入 blueprint 注册）
│   ├── config.py      ← 新建
│   ├── extensions.py  ← 新建（Supabase 连接）
│   └── blueprints/
│       └── auth.py    ← 新建（先建一个空的）
├── .env               ← 新建（填入你的 Supabase 密钥）
├── .env.example       ← 新建
└── requirements.txt   ← 新建
```

**`.env` 文件内容（不上传 GitHub！）：**
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...（你的 service_role key）
JWT_SECRET=随便写一个长字符串比如abc123xyz456def789
FLASK_ENV=development
FRONTEND_URL=http://localhost:8080
```

- [ ] `GET /api/health` 返回 `{"status": "ok"}` = Day 2 完成目标

#### Day 3-5：建数据库表
在 Supabase 控制台 → SQL Editor，**一张一张地**执行以下 SQL：

**顺序很重要！按这个顺序来：**
1. `companies` 表
2. `users` 表（依赖 companies）
3. `class_groups` 表（依赖 users）
4. `class_enrollments` 表（依赖 class_groups）
5. `sessions` 表（依赖 class_groups）

（SQL 代码直接从 README.md 里复制）

- [ ] 每建完一张表，在 Supabase Table Editor 里能看到它 = 成功
- [ ] 手动 INSERT 一行数据进去试试

**💡 本周你会学到：**
- 什么是数据库表、主键、外键
- 什么是环境变量（为什么密钥不能放在代码里）
- Flask Blueprint 是什么（把 API 分组管理）

---

### 第 2 周：用户认证 API（BE-02 到 BE-06）

> **目标**：写好注册/登录接口，用 Thunder Client 测试通过

**先安装测试工具：**
在 VS Code 里搜索并安装插件：**Thunder Client**（免费的 API 测试工具）

#### Day 1-2：Admin 注册（BE-02）
```
POST /api/auth/register/admin
Body: { "company_name": "测试补习班", "email": "test@test.com", "password": "123456" }
期望返回: { "token": "eyJ...", "user": {...} }
```

- [ ] 用 Thunder Client 发这个请求，能收到 token = 成功

#### Day 3：Student 注册（BE-04）
```
POST /api/auth/register/student
Body: { "name": "张三", "email": "s@test.com", "password": "123456", "grade": "Grade 10" }
```

#### Day 4：登录接口（BE-05）
```
POST /api/auth/login
Body: { "email": "test@test.com", "password": "123456" }
期望返回: { "token": "eyJ...", "role": "admin" }
```

#### Day 5：JWT 保护路由（BE-06）
- [ ] 写 `@require_auth` 装饰器
- [ ] 测试：不带 token 访问受保护路由 → 返回 401
- [ ] 测试：带 token 访问 → 返回正常数据

**本周完成标志：**
- Thunder Client 里能注册 admin、student
- 能登录拿到 token
- 用 token 访问 `GET /api/users/me` 能看到自己的信息

**💡 本周你会学到：**
- 密码不能明文存储（bcrypt 是什么）
- JWT Token 是什么（像门票一样）
- HTTP 状态码：200 成功、401 未授权、403 禁止、400 参数错误

---

### 第 3 周：前端接入认证

> **目标**：在浏览器里能真实注册账号 + 登录跳转页面

#### Day 1-2：新建登录页面
新建文件：`src/pages/LoginPage.tsx`
- 让 Claude 帮你生成一个登录表单（包含 email + 密码输入框）
- 提交时调用 `POST /api/auth/login`

#### Day 3：新建认证上下文
新建文件：`src/context/AuthContext.tsx`
- 存储当前用户信息（名字、角色）
- 登录成功后把 token 存到 localStorage

#### Day 4：新建 API 工具文件
新建文件：`src/lib/api.ts`
```typescript
// 这个文件封装所有 API 请求，自动带上 token
const BASE_URL = "http://localhost:5000/api"
```

#### Day 5：路由保护
- 未登录的人访问任何页面 → 自动跳转到 `/login`
- 登录成功后 → 跳转到 `/`（Dashboard）
- 右上角显示当前用户名字

**本周完成标志：**
在浏览器里：
1. 进入 `http://localhost:8080` → 自动跳转到登录页
2. 填写 email + 密码 → 点击登录
3. 成功进入 Dashboard，右上角显示用户名 🎉

**💡 本周你会学到：**
- React Context（全局状态）
- localStorage（浏览器存储）
- fetch API 怎么发 HTTP 请求
- CORS 是什么（前后端跨域问题怎么解决）

---

### 第 4 周：班级管理（前端 + 后端）

> **目标**：老师能创建班级，学生能加入班级

#### Day 1-2：后端班级 API（BE-08）
```
POST /api/classes         ← 老师创建班级
GET  /api/classes         ← 老师查看自己的班级
PATCH /api/classes/:id    ← 编辑班级
DELETE /api/classes/:id   ← 删除班级
```

#### Day 3：后端学生加入 API（BE-09 简化版）
```
POST /api/classes/join    ← 学生用班级码加入
Body: { "class_code": "MATH-A1" }
```

#### Day 4-5：前端 ClassesPage 连接真实数据
- 把 `mockClasses` 替换成 `useQuery` 从 API 获取
- 添加"创建班级"弹窗表单
- 添加"用班级码加入"功能（学生视图）

**本周完成标志：**
1. 老师登录 → 点"创建班级" → 填写表单 → 保存
2. 刷新页面 → 班级还在（存到数据库了）
3. 学生登录 → 输入班级码 → 成功加入

---

### 第 5 周：日历 + 课程管理

> **目标**：老师能创建课程，日历上能看到真实课程

#### Day 1-2：后端课程 API（BE-10 简化版）
```
POST /api/sessions        ← 创建课程（先只做单次，不做循环）
GET  /api/sessions        ← 获取课程列表（支持 ?month=2026-04 过滤）
```

#### Day 3-5：前端 CalendarPage 连接真实数据
- 把 `mockSessions` 替换成真实 API
- 添加"新建课程"弹窗

**本周完成标志：**
1. 老师登录 → 点日历某天 → 新建课程 → 保存
2. 日历上能看到新建的课程卡片
3. 学生登录 → 在日历上能看到已加入班级的课程

---

### 第 6 周：测试 + 修 Bug + 部署

> **目标**：让老师可以在线访问，不需要在你电脑上运行

#### Day 1-2：全面测试
自己当 "老师" 和 "学生" 走一遍完整流程，找出问题

测试清单：
- [ ] 老师注册 + 登录
- [ ] 老师创建班级
- [ ] 学生注册 + 登录 + 加入班级
- [ ] 老师创建课程
- [ ] 学生看到课程

#### Day 3-4：部署前端到 Vercel（OPS-08）
1. 去 [vercel.com](https://vercel.com)，连接你的 GitHub
2. 导入 EduSync 仓库
3. 填写 `VITE_API_URL` 环境变量
4. 点击部署，等待完成

#### Day 5：处理老师反馈
- 让老师试用
- 记录问题
- 优先修复影响使用的 Bug

---

### 第 7 周（缓冲周）

> 这周是 **备用周**，专门用来处理：
- 上一周没完成的任务
- 老师反馈的 Bug
- 意外遇到的技术难题

---

## 📊 每周检查清单

每周五花 30 分钟做一次回顾：

```
本周完成了什么？
________________

遇到什么困难？
________________

下周的优先任务？
________________

是否需要调整计划？
________________
```

---

## 🆘 卡住了怎么办？

**遇到 Bug 先按这个顺序：**
1. 看报错信息（红色的字）→ 复制错误信息
2. 问 Claude："我遇到这个错误：[粘贴错误]，我的代码是：[粘贴代码]"
3. 如果还不行 → Google 搜索错误信息
4. 实在不行 → 暂时跳过，记录下来，做下一个任务

**每个功能的开发节奏：**
```
后端（Flask）: 先写 → 用 Thunder Client 测试 → 通过
        ↓
前端（React）: 再写 → 在浏览器里测试 → 通过
```

**永远先做后端，再做前端！**

---

## 🛠 工具清单

| 工具 | 用途 | 获取方式 |
|---|---|---|
| VS Code | 写代码 | 已有 |
| Thunder Client | 测试后端 API | VS Code 插件搜索安装 |
| Supabase | 数据库 + Auth | supabase.com 注册 |
| Vercel | 部署前端 | vercel.com 注册 |
| Git | 版本控制 | 已有 |
| Claude | 解答问题 + 写代码 | 已在用 |

---

## 🧠 学习资源（用到时再看，不用提前全看）

| 主题 | 推荐方式 |
|---|---|
| Flask 基础 | 问 Claude："帮我解释一下 Flask Blueprint 是什么" |
| React Hooks | 问 Claude："useEffect 和 useState 有什么区别" |
| Supabase | 直接看 supabase.com 的官方文档（有中文） |
| SQL 基础 | 问 Claude："解释一下这段 SQL 语句" |
| JWT | 问 Claude："JWT token 是怎么工作的" |

> 💡 **学习原则**：遇到不懂的就学，不要提前学一大堆用不到的东西！

---

## 🎉 MVP 完成时你会拥有

- 一个**真实运行的全栈 Web 应用**
- **React + TypeScript 前端**，部署在 Vercel（有公开网址）
- **Python Flask 后端**，连接真实数据库
- **用户认证系统**（注册/登录/JWT）
- **班级管理 + 日历课程**功能
- 你的第一个**可以展示给别人的项目** 🚀

---

*计划版本 v1.0 · 如果时间进度不对，随时和 Claude 说，我帮你调整！*

20626/5/14 Thursday:
I finished the first and the second week of my mvp plan and the first day of the thrid day, I am going to follow this plan.