---
name: memflow
description: 用 memflow-cli 创建/管理 MemFlow 记忆卡片。当用户要求把笔记、文档、对话要点制成记忆卡、批量制卡、导入 Markdown 为卡片、或管理牌组/分组/复习时使用。
min-cli-version: "0.2.0"
---

# memflow CLI

MemFlow 桌面端的命令行入口（单二进制双模式：CLI 与 GUI 是同一个可执行文件）。供 AI 编程工具（Claude Code / OpenClaw / Codex / WorkBuddy 等）与高级用户管理分组、牌组、卡片与复习。

**CLI 是云端客户端**：所有数据操作直接请求 MemFlow 云端 REST API，云端是唯一数据源。CLI 不再读写本地 SQLite 业务表，没有离线编辑，也没有同步协议——写入即上云。使用前必须先登录。

## 寻址（如何找到 memflow-cli）

按以下顺序定位，命中即用：

1. **PATH 中的 `memflow-cli`**（用户在桌面端「设置 → 命令行工具」点过"安装"后可用）
2. **macOS 默认路径**：`/Applications/MemFlow.app/Contents/MacOS/memflow --cli <args...>`
3. 都找不到 → 提示用户："请在 MemFlow 桌面端打开设置，点击安装命令行工具"

本文余下示例统一写作 `memflow-cli`，按实际寻址结果替换。

## 登录（必做第一步）

```bash
memflow-cli auth login --email you@example.com --password 'your-password'
```

- 凭证保存在 `auth_token.json`，**与桌面端 GUI 共享登录态**（任一侧退出/失效，两侧同时失效）；桌面端已登录时 CLI 无需再 login。
- 未登录或 token 失效时，数据命令会返回鉴权错误 → 重新执行 `auth login`。

## AI 制卡标准工作流

```bash
# 0. 登录（仅需一次，token 与桌面端共享，持久化在 auth_token.json）
memflow-cli auth login --email you@example.com --password 'your-password'

# 1. 探查：现有牌组 + 会员配额（决定能生成多少张）
memflow-cli decks list            # 分页响应 {decks, total, ...}，牌组多时按 page 翻页
memflow-cli quota show

# 2. 幂等建组（存在即返回，不会重复创建）
memflow-cli decks ensure --name "英语词汇"    # → {"created": bool, "deck": {...}}

# 3. 批量制卡（JSON 数组，经文件或 stdin 传入；或 Markdown 笔记直接导入）
memflow-cli cards batch-create --deck "英语词汇" --file cards.json
cat cards.json | memflow-cli cards batch-create --deck "英语词汇" --file -
memflow-cli cards batch-create --deck "英语词汇" --format md --file notes.md   # Markdown 模式

# 4. 完成：写入即上云。提示用户到桌面端刷新牌组列表预览新卡片
```

### 制卡输入格式（batch-create）

JSON 数组，每项：

```json
[{"front": "apple 的中文是？", "back": "苹果", "card_type": "qa", "sort_order": 0}]
```

- `front`（必填）：问题面，Markdown。cloze 卡用 `{{c1::答案}}` 挖空语法写在 front 里。
- `back`：答案面，Markdown。**qa 卡必填**，cloze 卡可省略。
- `card_type`：`qa`（默认）或 `cloze`。
- `sort_order`：可选排序值。
- front 与牌组内已有卡片（或本批内）重复的条目自动进 `skipped`，不会重复制卡——重复导入同一份文件是安全的。
- `--partial`：配额预检超限时只创建到上限（被截断的条目进 `skipped`，输出含 `truncated` 数）；默认整批拒绝（`quota_exceeded`）。
- 输出含 `quota_warning` 字段时（配额用量 ≥90%），AI 应主动提醒用户接近上限并建议升级或清理。

### Markdown 模式（--format md）

笔记即卡片：无需构造 JSON，直接导入 Markdown 文件（或 stdin）。解析规则：

| 规则 | 说明 |
|---|---|
| `#` 一级标题 | 忽略（视为文档标题） |
| `##` 二级标题 | front；标题到下一个 `##`/`Q:` 之间的正文 = back |
| `Q:` / `A:` 行（支持全角 `Q：`/`A：`） | 显式问答对，`A:` 到下一个 `Q:`/`##` 为止 |
| 含 `{{cN::...}}` 挖空 | 自动判为 cloze：挖空所在文本整体为 front，back 为空（`##` 段正文中出现挖空时正文整体为 front，标题仅作分组） |
| sort_order | 按在文档中出现的顺序自动赋值 |

示例见 `examples/cards.md`。精细控制（显式 card_type/sort_order/元数据）仍用 JSON 模式。

### 卡片写作规范（给 AI）

- 一卡一知识点；front 尽量是明确的问题，back 给出简洁答案与必要解释。
- 善用 Markdown：列表、代码块、加粗；不要写裸 HTML（渲染端不支持）。
- 单卡正反面建议各不超过 ~300 字；一个主题超过 20 张时考虑拆多个牌组。
- **先查配额再定量**：`quota show` 的 `card_limit_per_deck`（0=不限）与 `decks list` 的现有卡数决定本批可生成量；超限会被 `quota_exceeded` 拒绝整批。

## 命令清单

| Command | Description |
|---|---|
| `auth login --email <e> --password <p>` | Log in to the cloud; token persisted in `auth_token.json` (shared with the GUI session) |
| `auth logout` | Remove the stored CLI token |
| `auth whoami` | Show the currently logged-in account |
| `groups list [--keyword <k>] [--page n] [--page-size m]` | 分页列出分组，返回 `{groups, total, page, page_size}`；keyword 匹配名称/描述 |
| `groups list --tree [--parent <id>]` | 全量分组树（与 --keyword/--page/--page-size 互斥） |
| `groups get <id>` | Show a single group with deck count |
| `groups create --name <n> [--description <d>] [--parent <id>]` | Create a new group |
| `groups update <id> [--name] [--description] [--parent]` | Update an existing group (merge with current) |
| `groups delete <id> [--yes]` | Delete a group |
| `decks list [--keyword <k>] [--page n] [--page-size m]` | 分页列出牌组，返回 `{decks, total, page, page_size}`；keyword 匹配名称/描述；page_size 默认 20、最大 100 |
| `decks get <id>` | Show a deck with card count |
| `decks create --name <n> [--description <d>] [--group <id>]` | Create a deck |
| `decks ensure --name <n> [--description <d>] [--group <id>]` | Idempotent: return existing deck by exact name or create it |
| `decks update <id> [--name] [--description] [--group]` | Update a deck |
| `decks delete <id> [--yes]` | Delete a deck (cascades to cards) |
| `cards list --deck <id>` | List cards in a deck |
| `cards get <id>` | Show a card with review state |
| `cards create --deck <id> --front <t> --back <t> [-t qa\|cloze]` | Create a card |
| `cards batch-create --deck <id\|name> --file <path\|-> [--format json\|md] [--partial]` | Batch create cards from JSON array or Markdown notes; duplicate fronts are skipped; `--partial` creates up to the quota limit instead of rejecting the whole batch |
| `cards update <id> [--front] [--back]` | Update a card |
| `cards delete <id> [--yes]` | Delete a card |
| `cards search <query>` | Full-text search across cards |
| `review queue [--limit n]` | Show due review queue |
| `review do <card_id> --rating <1-4>` | Submit a review (client-side FSRS, cloud persistence) |
| `review stats` | Show today's review statistics |
| `quota show` | Membership quota from the cloud (tier, deck_limit, card_limit_per_deck) |
| `skill show` | 输出本 skill 的 SKILL.md 全文到 stdout（agent 无需安装即可读取工作流） |
| `skill install [--target auto\|claude\|openclaw] [--scope user\|project] [--dir <skills根目录>]` | 把本 skill（SKILL.md + examples）写入 agent 技能目录；幂等，重复执行即更新 |
| `skill status` | 各 agent 的 skill 安装状态与版本匹配检查 |
| `status` | Summary: login state, API environment, pending review outbox, CLI install state |

注意：`sync` 子命令已移除——CLI 直接写云端，无需也无法"触发同步"。

## 全局 Flags

| Flag | Description |
|---|---|
| `--app-env <ENV\|URL>` | 指定本次请求的 API 环境：`prod`/`staging`/`test` 或直接 http(s) URL；仅本次生效、不落盘，优先级高于 `api_config.json` |
| `-y, --yes` | Skip destructive confirmation prompts |

## I/O 契约（AI 工具必读）

- **stdout**：漂亮打印的 JSON（命令结果），可用 `jq` 解析。
- **stderr**：单行 `{"error": ...}`（结构化错误对象），**退出码 1**。
- **破坏性操作**（delete）：需 `--yes` 或交互确认；非交互场景总是传 `--yes`。

### 错误处理表

| 错误（stderr JSON） | 含义 | AI 应采取的动作 |
|---|---|---|
| `{"error":"quota_exceeded","limit":N,"current":M,"requested":K}` | 本批卡片超会员每牌组上限（云端写入时权威校验） | 减少本批数量至 `limit-current`、拆到多个牌组、改用 `--partial` 只创建到上限，或提示用户升级会员；**不要重试相同请求** |
| `{"error":"deck_not_found: ..."}` | 牌组 id/名称不存在 | 先 `decks ensure` 建组 |
| `{"error":"empty_input"}` | batch-create 输入为空 | 检查 JSON 构造逻辑 |
| `{"error":"create_failed","created":N,"card_ids":[...]}` | 批量中途失败 | 已创建的 N 张有效；报告用户并检查 detail |
| `{"error":"invalid JSON: ..."}` | 输入不是合法 JSON 数组 | 修正 JSON 后重试 |
| 鉴权错误（401/未登录） | token 缺失或过期 | 重新执行 `auth login` 后重试 |
| 网络错误 | 云端不可达 | 报告用户检查网络后重试（CLI 无离线队列） |

### 会员配额语义

- CLI 写入直接到达云端，云端在写入时**权威校验**配额：超限的写请求立即被拒（`quota_exceeded`），不会产生"先落地后打标"的中间态。
- 批量制卡用 `--partial` 可在超限场景只创建到上限；否则整批拒绝。

## 示例文件

- `examples/cards.qa.json` — 问答卡批量输入样例（JSON 模式）
- `examples/cards.cloze.json` — 填空卡批量输入样例（JSON 模式）
- `examples/cards.md` — Markdown 模式输入样例（`--format md`）

## 架构说明

- CLI 与 GUI 是**同一个可执行文件**（`main.rs` argv 分派）；`src-tauri` 仍保留 `[[bin]] memflow-cli` 开发 target（`cargo build --bin memflow-cli`）。
- CLI 是云端 REST API 的薄客户端：登录态存于 `auth_token.json`，API 环境覆盖存于 `api_config.json`（均与 GUI 共享），所有数据命令带 token 请求云端，云端是唯一数据源。
- 本地不再保存业务数据（无 SQLite 业务表），因此 CLI 无离线编辑、无同步协议；网络不可用时命令直接失败。
- FSRS 调度在评分提交时完成（本地计算 + 云端权威确认，含离线 outbox 重放，由 GUI/运行时处理），CLI 的 `review do` 直接提交评分。
