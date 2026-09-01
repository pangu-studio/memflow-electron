# memflow-electron

MemFlow 桌面端 Electron 重构（Phase 1，方案见 `../docs/design/ts-fsrs-electron-cordis-roadmap.md`）。

薄客户端：业务数据全在云端 REST，本地 SQLite（better-sqlite3，WAL）仅存 `sync_meta` KV 与 `pending_reviews` 评分 outbox。FSRS 计算走 `@nssai/scheduler`（golden 向量与 rs-fsrs 6.6.1 对拍锁定）。

## 结构

```
electron/          主进程（TypeScript）
├── main.ts        入口：窗口、IPC 注册
├── ipc.ts         命令注册表（46 个命令，命名与 Tauri 契约一致）
├── config.ts      API 环境解析（api_config.json 覆盖）
├── auth.ts        微信扫码/邮箱登录（移植自 src-tauri/src/auth.rs）
├── accounts.ts    多账号（accounts.json）
├── authToken.ts   token 存储兼容层
├── cloud.ts       内容域云端 REST（移植自 cloud.rs）
├── review.ts      评分三件套编排（write-ahead/幂等/409 重算）
├── db.ts          SQLite outbox + KV
├── market.ts / membership.ts / token.ts   市场/会员/灵光点
├── cli.ts         CLI 安装状态（内嵌分发暂缺，返回明确错误）
└── preload.ts     contextBridge（window.memflowInvoke / memflowWindow）
src/               渲染进程（复用自 memflow-desktop/src，invoke/window 已桥接）
scripts/dev.mjs    开发模式（esbuild watch + vite + electron）
```

## 开发

```bash
npm install
npm run rebuild:sqlite   # better-sqlite3 需匹配 Electron ABI（仅首次/升级 Electron 后）
npm run dev              # vite :1420 + electron 热重载

# 受限沙箱环境（CI/无特权）：
MEMFLOW_ELECTRON_ARGS="--no-sandbox" MEMFLOW_DATA_DIR=/tmp/memflow-e npm run dev
```

## 网络调试（抓包）

- **dev 模式**：纯 REST 命令（cloud_* / auth REST / market 浏览 / submit_review）由 renderer 直接发 fetch——DevTools Network 面板可见；console 标注 `[rest] <cmd>` / `[ipc] <cmd>`。base 覆盖：`localStorage.memflow_api_base`（默认 `http://localhost:8080`）
- **生产模式**：恒走主进程 IPC（`window.memflowInvoke`）
- 有状态命令（token/账号/outbox/api_env/文件对话框）任何模式都走 IPC

## 与 Tauri 版的关系

- 前端 `src/` 从 `memflow-desktop/src` 复制，仅 `@tauri-apps/api/*` 导入替换为 `@/lib/invoke` 与 `@/lib/window` 桥接层
- IPC 命令名、参数、响应与 Rust command 一一对应（`electron/ipc.ts` 显式注册）
- 本地数据库表结构与 Rust 版（user_version 2）一致，数据文件可互换
- 原生支付（membership_subscribe_native / token_recharge_native）暂为明确报错，待接网页支付

## 里程碑

```bash
npm run dist          # 全平台安装包（release/）
npm run rebuild:sqlite  # Electron ABI 变更后重建原生模块（build.npmRebuild 已关，electron-builder 不再自动重建）

# 发版（上传 OSS + 登记 + 发布，一步完成）：
MEMFLOW_ADMIN_EMAIL=... MEMFLOW_ADMIN_PASSWORD=... \
  node scripts/publish-release.mjs --version 0.1.0 --platform darwin-aarch64 \
  --file release/MemFlow-0.1.0-arm64.dmg --notes "首发"
```

> dmg 打包依赖 macOS `hdiutil`，受限沙箱环境会失败——在正常终端执行即可。
> 代码签名：未配置时产出未签名包（macOS 用户需右键打开）；配置 `CSC_LINK`/`CSC_KEY_PASSWORD` 环境变量后 electron-builder 自动签名。
> Windows 安装包：`npx electron-builder --win nsis --x64`；Linux：`--linux AppImage`。

## Phase 2 插件化（Cordis）

- [x] M2.1 适配层（pluginApi/runtime/events，唯一直 import cordis 隔离 runtime.ts，cordis 4.0.0-rc.9 pin）+ @nssai/plugin-api 类型包（packages/plugin-api，8 单测）+ CommandRegistry + 7 核心服务；61 项既有自动化零修改全绿
- [x] M2.2 四个可禁用功能插件（com.memflow.market/stats/membership/markdown-extras）+ plugins.json 启停 + /plugins 插件管理页 + test:plugins 12 项
- [x] M2.3 UI Registry：贡献点广播 + 动态路由收敛（PluginRoute 兜底页）+ PluginSlot/PluginErrorBoundary；ui-smoke 21 项全绿
- [ ] @nssai/plugin-api 发 npm 0.1.0（npm pack 校验通过，待用户 OTP：`cd packages/plugin-api && npm publish`）
- 设计文档：../docs/design/cordis-plugin-architecture.md；Phase 3 立项：../docs/design/plugin-marketplace-phase3.md

- [x] M1.1 壳跑通（脚手架 + 全命令移植 + 类型检查 + 冒烟）
- [x] M1.1+ IPC 参数归一化（camelCase→snake_case，对齐 Tauri v2 行为）
- [x] TS 版 memflow-cli v1（status/auth/review/decks/cards/groups/quota，node:sqlite 回退）
- [x] M1.2 核心链路 API 级集成测试全绿（`npm run test:m12  # 亦可用：test:409 / test:billing / test:market / test:ui / test:prod` 17 项 + `test:409` 重算路径，真实本地后端）；UI 级按 docs/parity.md 人工验收
- [x] M1.3 UI 级冒烟（CDP 驱动真实窗口）：登录态启动/牌组列表/复习页/空格翻面/UI 驱动评分到"今日复习完成"/⌘P 命令面板/零控制台错误，`node scripts/ui-smoke.mjs`
- [x] M1.4 electron-builder 配置（mac dmg/win nsis/linux AppImage，`--mac --dir` 产物已验证）+ 自动更新模块（复用 /api/release/desktop/latest，sha256 校验 + 系统对话框确认安装）
- [ ] M1.4 正式发版：图标、代码签名、上传 OSS + release 模块登记（admin 操作）
