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

## 与 Tauri 版的关系

- 前端 `src/` 从 `memflow-desktop/src` 复制，仅 `@tauri-apps/api/*` 导入替换为 `@/lib/invoke` 与 `@/lib/window` 桥接层
- IPC 命令名、参数、响应与 Rust command 一一对应（`electron/ipc.ts` 显式注册）
- 本地数据库表结构与 Rust 版（user_version 2）一致，数据文件可互换
- 原生支付（membership_subscribe_native / token_recharge_native）暂为明确报错，待接网页支付

## 里程碑

- [x] M1.1 壳跑通（脚手架 + 全命令移植 + 类型检查 + 冒烟）
- [x] M1.1+ IPC 参数归一化（camelCase→snake_case，对齐 Tauri v2 行为）
- [x] TS 版 memflow-cli v1（status/auth/review/decks/cards/groups/quota，node:sqlite 回退）
- [ ] M1.2 核心链路联调（复习/评分/outbox/409，按 docs/parity.md 验收）
- [ ] M1.3 功能 parity（市场/会员/多账号/快捷键）
- [ ] M1.4 electron-builder 三平台发布 + release 模块登记
