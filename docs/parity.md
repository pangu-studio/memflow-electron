# MemFlow Electron 功能 parity 清单（M1.3 验收用）

> 对照基准：memflow-desktop（Tauri 版）同账号行为。
> 验收方式：同一账号分别在 Tauri 版与 Electron 版操作，逐项核对。
> 自动化已覆盖项（2026-09）：登录/牌组/卡片/复习评分/409/统计/设置/outbox/多账号（`npm run test:m12`、`test:409`）、计费域（`test:billing` 11 项）、UI 级（`test:ui` 10 项 CDP 冒烟）。以下清单中 ✅=已验证，⬜=待人工抽查。

## 登录与账号（M1.1）

- [ ] 微信扫码登录：二维码展示 → 手机确认 → 自动进入主界面
- [ ] 邮箱登录：正确/错误密码提示
- [ ] 登录后 `auth_register_account` 建档：切账号菜单可见当前账号
- [ ] 多账号：切换、移除（含 suggested_next 建议）
- [ ] 重启应用后 token 恢复（auth_load_token）

## 牌组/卡片/分组（M1.1）

- [ ] 牌组列表、创建、编辑、删除（物理删除级联提示）
- [ ] 分组 CRUD、拖拽/移动牌组到分组
- [ ] 卡片列表分页、创建（qa/cloze）、编辑、删除
- [ ] 标签词汇表（cloud_list_tags）与标签重命名/删除
- [ ] 牌组导出（.mfdeck，系统保存对话框）

## 复习核心链路（M1.2）

- [x] 复习队列加载（全部/按牌组 scope）
- [x] 四档评分：间隔预览按钮数值与 Tauri 版一致（同一状态同一评分）
- [x] 评分提交成功：服务端权威状态返回，今日计数 +1
- [ ] **离线评分**：断网评分 → toast"已保存到离线队列" → 恢复网络自动 flush
- [ ] **409 重算**：模拟版本冲突（两端同时评分），本地基于权威状态重算成功
- [ ] 409 反复冲突留队，下次 flush 成功
- [ ] 毒消息：删除卡片后重放其离线事件 → 丢弃不堵队列
- [ ] outbox 角标数量正确（get_pending_review_count）
- [ ] FSRS 个性化参数/保留率设置生效（与设置页一致）

## 设置/统计（M1.2）

- [x] 复习设置读取/更新（daily_limit、timezone、weights w）
- [x] 今日统计、右侧栏统计、Stats 页数据与 Tauri 版一致
- [ ] API 环境：release 可切换 prod/staging/custom；dev 硬门控报错

## 市场/会员/灵光点（M1.3）

- [x] 市场列表（分类/搜索/排序/分页）、详情、预览、购买、导入
- [x] 会员计划列表、订阅状态、配额刷新与缓存
- [x] 灵光点余额、套餐、流水
- [x] 原生支付：明确报错提示（Electron 版暂未实现，预期行为）

## 系统与体验（M1.3）

- [x] 快捷键：⌘P / ⌘B / ⌘⇧B（自动化）；⌘R 待人工
- [x] 主题：默认暗黑、浅色切换（light 主题 data-theme + CSS 变量自动化验证）
- [x] TopBar 窗口控制（最小化/最大化/关闭）
- [ ] CLI 安装状态展示（未安装态）
- [x] CLI（TS 版）：`memflow status` / `auth status` / `decks list` / `review queue` 与桌面端共享 token 存储

## 数据兼容

- [ ] 用 Tauri 版的 `memflow.db` 替换 Electron 数据目录 → outbox 队列可读、可 flush（表结构 user_version 2 一致）
