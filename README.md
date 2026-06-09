# Shapp DevTool

本地轻应用调试工具，用于在桌面环境中仿真和调试 Shapp 轻应用。

## 功能

- 📁 打开应用文件夹，读取 `app.manifest.json`
- 🖥️ 前端预览（手机框架 + 本地静态服务器，支持拖入文件夹）
- ▶️ API 调用：指定方法名 + JSON 参数，spawn Deno 进程执行后端逻辑
- 📝 实时日志流（按级别过滤）
- 🗄️ 数据库检查器：浏览应用本地 SQLite 表，支持自定义 SQL 查询
- 🔄 热重载：`frontend/` 变更自动刷新预览，`backend/` 变更提示下次生效
- 📷 截图 & 录屏：可保存为应用封面 / 轮播图 / 自定义路径

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 构建工具 | electron-vite 3 |
| 打包 | electron-builder 25（Win NSIS · Mac DMG · Linux AppImage）|
| UI | React 18 + TypeScript 5 + CSS Modules |
| 状态管理 | Zustand 5 |
| 执行引擎 | Bundled Deno 二进制（spawn 方式）|
| 本地数据库 | better-sqlite3 11 |
| 文件监听 | chokidar 4 |

## 目录结构

```
src/devTool/
├── electron/               # 主进程
│   ├── main.ts             # 窗口 + IPC 注册
│   ├── preload.ts          # contextBridge API
│   ├── store.ts            # 轻量持久化（JSON 文件）
│   ├── ipc/
│   │   ├── package.ts      # 应用文件夹管理
│   │   ├── execution.ts    # Deno 进程管理
│   │   ├── kv.ts           # SQLite 表浏览器
│   │   ├── server.ts       # 静态服务器 IPC
│   │   └── capture.ts      # 截图 / 录屏保存
│   ├── server/
│   │   └── static.ts       # 本地 HTTP 静态服务器
│   └── watcher/
│       └── hotReload.ts    # chokidar 文件监听
├── renderer/               # 渲染进程（React）
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── layouts/MainLayout.tsx
│       ├── pages/WelcomePage.tsx
│       ├── components/
│       │   ├── Titlebar/
│       │   ├── Sidebar/
│       │   ├── TabBar/
│       │   ├── tabs/        # PreviewTab · LogTab · DbTab · RunTab
│       │   └── modals/      # CapturePanel
│       ├── stores/          # Zustand stores
│       └── types/ipc.ts     # IPC 类型定义
├── resources/
│   └── deno-runner.ts      # Deno 执行脚本（随应用打包）
├── tests/
│   └── runner/
│       └── runner_test.ts  # Deno runner 集成测试
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── deno.json               # Deno 测试配置
└── tsconfig.json
```

## 快速开始

### 1. 安装依赖

确保已安装：
- Node.js 20+ 和 pnpm
- Deno 2.x（用于运行测试和开发时执行应用逻辑）

```bash
cd src/devTool
pnpm install
```

### 2. 准备 Deno 二进制（Windows 打包会自动补齐）

将对应平台的 Deno 可执行文件放入 `resources/deno/` 目录：

```
resources/deno/
├── deno-win32-x64.exe
├── deno-win32-arm64.exe
├── deno-darwin-x64
└── deno-darwin-arm64
```

从 https://github.com/denoland/deno/releases 下载对应版本（建议 2.x）。

在 Windows 上执行 `pnpm run pack:win` 时，会先自动下载缺失的 `deno-win32-x64.exe` 和 `deno-win32-arm64.exe` 到 `resources/deno/`，避免打出的安装包缺少运行时。

开发模式无需此步骤——DevTool 会直接使用系统 `deno` 命令。

### 3. 启动开发模式

```bash
pnpm dev
```

这将启动 electron-vite 开发服务器并打开 Electron 窗口。

### 4. 运行 Deno 集成测试

```bash
deno test --allow-all tests/
```

或使用快捷任务：

```bash
deno task test
```

### 5. 打包

```bash
# Windows
pnpm pack:win

# macOS
pnpm pack:mac

# 所有平台
pnpm pack:all
```

打包产物输出至 `dist-installer/`。

## 应用包结构要求

DevTool 要求被调试的应用目录包含：

```
my-app/
├── app.manifest.json       # 必需：应用元信息
├── frontend/               # 可选：前端静态文件
│   └── index.html
└── backend/
    └── main.ts             # 后端入口（调用 serve()）
```

`app.manifest.json` 示例：

```json
{
  "id": "com.example.myapp",
  "name": "My App",
  "version": "1.0.0",
  "entry": {
    "frontend": "frontend/index.html",
    "backend": "backend/main.ts"
  },
  "capabilities": ["db", "auth"],
  "permissions": [
    { "scope": "db.notes.read", "reason": "读取笔记列表" },
    { "scope": "db.notes.write", "reason": "创建/更新笔记" }
  ]
}
```

## 本地数据库

DevTool 为每个应用在 `{appDir}/.devtool/state.db` 创建独立的 SQLite 数据库，作为 `ctx.db` 的后端存储。可在「数据库」选项卡中直接浏览和查询。

## 与生产环境的差异

| 特性 | 生产环境 | DevTool |
|---|---|---|
| 执行引擎 | Deno（服务器上） | Deno（本机 spawn）|
| 数据库 | PostgreSQL / 云 SQLite | 本地 SQLite |
| 存储（storage） | 对象存储 | 不可用（抛出错误）|
| 权限检查 | 严格执行 | 由 Mock Scopes 配置 |
| 认证 | JWT 验证 | Mock 用户（userId 可配置）|
