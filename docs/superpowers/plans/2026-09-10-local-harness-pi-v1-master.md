# Local-Harness-pi V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新的 `Local-Harness-pi` 仓库中，以固定 DSH 源码为产品平台，只替换 Agent Loop 为 Pi Agent Core，并完成 Windows Electron V1 产品闭环。

**Architecture:** 保留 DSH Electron、Client、Session、LLM、Tools、Goal/Plan、Skill 和 MCP 所有权；新增 `@local-harness/pi-agent-loop` 作为唯一活动 `AgentFactory`。GUI-managed MCP 仅增加 DSH settings/Host 控制面，执行仍使用同一个 DSH MCP Client 与 Tool Registry。DSH append-only Session 是唯一可恢复事实源，Pi 状态、Client transient state 和 SQLite 搜索索引都只允许作为派生状态。

**Tech Stack:** Node.js 22.19+、pnpm 11.7.0、TypeScript 6、Electron 44、React、Cordis、Vitest 及其 browser runner、`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`。

---

## 0. 计划集与执行顺序

本主计划只负责顺序、门禁和 PR 交付。具体代码步骤在三个子计划中：

1. [PR-A：DSH 基线与产品边界](2026-09-10-local-harness-pi-pr-a-dsh-baseline.md)
2. [PR-B：Pi 内核桥接](2026-09-10-local-harness-pi-pr-b-pi-kernel.md)
3. [PR-C：V1 产品闭环](2026-09-10-local-harness-pi-pr-c-product-loop.md)

依赖顺序固定为 `PR-A -> PR-B -> PR-C`。方案 2 的 About/许可属于 PR-A，Compaction/会话内核回归属于 PR-B，GUI-managed MCP 与完整产品回归属于 PR-C，不另开第四条长期分支。只有 PR-B 单个 diff 超过约 2,500 行手写业务代码或连续两轮复审仍无法收敛时，才允许按子计划规定拆为 B1/B2；不得把 MCP 或 UI 与 PR-B 平行开发后再猜测接口。

### 需求到任务的追踪

| 需求 | 实施任务 | 主要验收证据 |
|---|---|---|
| `PLAT-001`–`PLAT-003` | A1–A5、C8、C9 | Windows unsigned NSIS、版本锁、来源与许可证门禁 |
| `FR-001`–`FR-004` | A3–A5、C9 | workspace/单实例/窗口安全、About/离线许可与 Windows smoke |
| `FR-010`–`FR-019` | B3、B4、B8–B10、C7、C9 | Agent 生命周期、消息确认、恢复、Compaction、会话整理/分叉/搜索/导出矩阵 |
| `FR-020`–`FR-025` | B1–B9 | dependency boundary、KernelDriver conformance、唯一 AgentFactory |
| `FR-030`–`FR-037` | B4、C1、C9 | 本地/云端 Responses 与 Completions、首次启动及发现回退矩阵 |
| `FR-040`–`FR-047` | B5、B6、B10、C6、C7 | 工具、审批、workspace、失败、上下文、Diff/Terminal 与工具卡测试 |
| `FR-050`–`FR-052` | C5、C7、C9 | `/goal`、`/plan`、Plus 菜单与恢复测试 |
| `FR-060`–`FR-067` | C2–C5、C7、C9 | Skill、MCP CRUD/CAS/凭据、插件清单、有效权限与失败隔离测试 |
| `FR-070`–`FR-072` | C5、C7、C9 | 附件、PDF 预览、Web tools 产品流 |
| `FR-073`–`FR-074` | V1.1 | V1 越界扫描和 known-limitations 记录 |
| `FR-080`–`FR-083` | C1、C4–C6 | settings section、单一状态源、Plus 菜单与折叠工具卡 |
| `FR-090`–`FR-091` | C8、C9 | 手工检查/下载、不可达安装路径与失败隔离测试 |
| `FR-092` | V1.1 | V1 越界扫描和 known-limitations 记录 |
| `NFR-001`–`NFR-006` | B3–B10、C6、C7、C9 | Session ordering、三类 flush、Compaction、crash/SQLite 重建矩阵 |
| `NFR-010`–`NFR-014` | A5、B4、B5、C1–C4、C8、C9 | credential/network/Electron/MCP/plugin/log redaction 矩阵 |
| `NFR-020`–`NFR-022` | B7–B10、C3、C4、C9 | 基线对比、缓存上界、MCP reconcile、取消与资源回收测试 |
| `NFR-030`–`NFR-032` | C4–C7、C9 | 键盘、错误操作建议和状态可理解性测试 |
| `TEST-001`–`TEST-006` | A2、A3、B1、B10、C1、C3、C7、C9 | source/dependency、model、tool、recovery、product、安全矩阵 |
| `AC-001`–`AC-010` | B10、C1、C3、C5、C7、C9 | 本地/云模型、恢复、共存、UI 去重、首次启动、会话库、MCP 与长会话端到端证据 |

每个需求只能由其权威需求文档改变优先级；本表用于证明覆盖关系，不复制需求正文。

## 1. 固定输入

### 上游版本

- DeepSeek Harness：`b2e3b2a0125854567a4a5fcba75782e42fe84901`
- Pi：`acaa253cc8e3f159e6100b6f3874861b1f0bfc99`
- Pi npm：`@earendil-works/pi-agent-core@0.85.1` 与 `@earendil-works/pi-ai@0.85.1`
- Codex 交互参考：`73a1148c9c775c2a4616ce5096291740a00ed68a`
- Local-Harness-pi 首个产品版本：直接继承固定 DSH 基线 `0.1.5-alpha.2`，不做全 workspace 机械改版。DSH 原包仍由 DSH family gate 管理；新增 `@local-harness/*` 全部是不可发布的 private workspace member，由 A2 的 Local verifier 单独强制同版本、无 `publishConfig`。

### 权威项目文档

- `docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md`
- `docs/requirements/v1-requirements.md`
- `docs/architecture/interface-contracts.md`
- `docs/architecture/session-consistency.md`

文档按职责而非简单线性排序裁决：V1/V1.1 范围、优先级和验收标准以需求规格为准；组件所有权和依赖方向以总体设计为准；Session 持久化、排序和恢复以会话一致性文档为准；类型、时序和错误码以接口契约为准；任务顺序和提交边界以本主计划和子计划为准。若同一职责内仍冲突，立即停止实现并在同一提交中先修正所有受影响文档；执行者不得通过代码自行改变产品边界。

## 2. 每个 PR 的开工协议

- [ ] 创建 PR 分支前确认工作区干净。

  Run: `git status --short`

  Expected: 无输出。若有输出，只处理属于当前任务的文件；不得覆盖用户修改。

- [ ] 核对当前分支包含前序 PR 的提交。

  Run: `git log --oneline --decorate -8`

  Expected: PR-A 从文档基线开始；PR-B 包含 PR-A；PR-C 包含 PR-B。

- [ ] 重读当前 PR 子计划列出的上游源文件，并记录实际 hash。

  Run:

  ```powershell
  git -C E:\AI\_reference\deepseek-harness-current rev-parse HEAD
  git -C E:\AI\_reference\pi rev-parse HEAD
  git -C E:\AI\_reference\codex rev-parse HEAD
  ```

  Expected: 与“固定输入”完全相同。若不同，切回固定提交；不得顺便升级。

- [ ] 当前 PR 若创建 workspace package，先重读固定 DSH `docs/cookbook/adding-a-package.md`；创建 Client package 时再重读 `packages/client/AGENTS.md`。每个 `@local-harness/*` 包都必须使用 `0.1.5-alpha.2`、private ESM、标准 exports、README/README.i18n、`tsconfig.base.json` 精确 alias，并且只加入 `tsconfig.host.json` 或 `tsconfig.client.json` 一个 aggregate。运行 `pnpm run doc-sync`，提交生成的配对 README；不得等到 PR 末尾才修 project reference。

- [ ] 运行子计划指定的开工基线测试并保存命令与结果到 PR 描述。

- [ ] 使用测试驱动：每项行为先加入失败测试，确认失败原因正确，再写最小实现。

- [ ] 每完成一个独立行为提交一次；提交消息使用子计划给出的文本。

## 3. GitHub 协作协议

当前本地仓库没有 `origin`。首次云端推送前，项目所有者需要在 GitHub 创建空仓库 `Local-Harness-pi` 并把其 URL 配置为 `origin`；执行者不得代替所有者猜测账号、组织或公开性。

- [ ] 在首次 push 前验证远端身份。

  Run: `git remote -v`

  Expected: 只有经项目所有者确认的 `origin`；URL 末尾仓库名为 `Local-Harness-pi`。

- [ ] 使用普通 push 发布分支，不自动 force-push。

  Run: `git push -u origin HEAD`

- [ ] 每个云端检查点创建 Draft PR；PR 标题固定如下：

  - `feat: establish the Local-Harness-pi DSH baseline`
  - `feat: replace the DSH loop with the Pi kernel driver`
  - `feat: complete the Local-Harness-pi V1 desktop flow`

- [ ] PR 描述必须含：三项上游 hash、需求 ID、实际测试命令与结果、已知风险、回滚方式、未实现的 V1.1 内容。

- [ ] AI 可以自主推送新增提交并更新 Draft PR，但不得自行点击 merge、关闭失败检查或更改仓库可见性。

## 4. 三个可观察检查点

### 检查点 A：产品平台可构建

完成 PR-A 后，用户能在 GitHub 看到完整 DSH 基线、来源声明、Local-Harness-pi 品牌、安全 Electron 窗口配置及隔离的数据目录。此时仍使用 DSH 原 Agent Loop，仅用于证明平台基线健康。

阻断条件：来源不明、上游 hash 不一致、Electron 隔离设置回退、桌面数据写入共享 `~/.dsh`、基线测试失败。

### 检查点 B：Pi 成为唯一内核

完成 PR-B 后，默认组合恰好注册一个 `AgentFactory`，由 Pi Agent Core 驱动；模型、工具和所有 durable event 仍走 DSH 服务。恢复只读 DSH Session，工具副作用前和 turn 完成前都有 flush barrier。

阻断条件：生产依赖含 Pi Harness Session/Skills/Compaction、Pi 直接执行工具或读模型 key、UI 读取 Pi event、存在第二份 transcript、并行工具按完成顺序写 Session、flush 失败仍返回成功。

### 检查点 C：V1 可交付

完成 PR-C 后，本地/云端 OpenAI-compatible route、首次启动、设置页、Composer “+”菜单、Goal/Plan/Skill、GUI-managed MCP、会话资料库、Diff/Terminal、附件/PDF、审批、恢复和 Windows 打包形成产品闭环。

阻断条件：云 route 允许 HTTP、本地 route 可访问非 loopback、凭据进入设置 JSON/日志/Session、MCP 配置存在 Client/Pi 副本、CAS 冲突被覆盖、一个 MCP 失败拖垮其他工具、会话整理或 Compaction 回归、自动安装更新默认开启、Windows 安装包 smoke 失败。

## 5. 全局发布门禁

- [ ] 依赖与架构门禁。

  Run:

  ```powershell
  pnpm install --frozen-lockfile
  pnpm run release:verify --family dsh
  pnpm run constraints
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run test:docs
  ```

  Expected: 全部退出码为 0。

- [ ] 执行完整 unit/contract suite。

  Run: `pnpm run test`

  Expected: 全部通过；真实 API 用例只可按 DSH 既有策略在无密钥时自跳过。

- [ ] 执行 keyless Session replay 与 Web E2E。

  Run:

  ```powershell
  pnpm run test:snapshot
  pnpm run test:web
  pnpm run test:gui
  ```

  Expected: 全部通过，不出现重复 assistant 消息或旧 session transient frame。

- [ ] 执行 Windows 桌面目录打包和未签名 NSIS 安装包。

  Run:

  ```powershell
  pnpm run build
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:dir
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64
  ```

  Expected: 生成可启动的 unpacked Windows 应用和可手工安装的未签名 NSIS Alpha；签名、自动安装与回滚不是 V1 门禁。

- [ ] 运行手工模型矩阵并在 release evidence 中记录，不提交密钥。

  1. 本地 OpenAI Chat Completions：文本、工具、取消。
  2. 本地 OpenAI Responses：文本、工具、取消。
  3. 一个 loopback 实际服务。
  4. 一个 HTTPS OpenAI-compatible 云 route。

- [ ] 运行崩溃恢复矩阵：用户消息确认后 kill、assistant stream 中 kill、`tool/call` flush 后 body 前 kill、body 后 result 前 kill、turn end 后 kill、Compaction generation commit 前/后 kill、context-overflow compaction 后重试前 kill、SQLite 索引移除后重建。

- [ ] 运行产品完整性矩阵：首次模型 onboarding、会话重命名/搜索/归档/恢复/分叉/导出、Diff/Terminal、About/离线许可、MCP stdio/HTTP create-disable-enable-edit-conflict-reconnect-remove。MCP secret marker 不得出现在 DOM、Remote snapshot、Session 或日志；一个 MCP failure 不得移除兄弟 MCP 或 builtin tools。

- [ ] 运行 NFR-020 四项性能门禁：冷启动、Host delta 到 DOM 附加延迟、Electron + Host 进程树空闲内存、1000 会话列表加载；使用 C9 固定脚本与同一硬件/fixture，保留原始样本。

- [ ] 确认没有 V1.1 越界内容。

  Run: `git grep -n -E "playwright|computer.use|office.edit|pdf.edit|autoDownload|autoInstall" -- packages apps`

  Expected: 仅出现 DSH 既有测试/依赖或明确关闭的配置；不得出现本项目新增的 V1.1 实现。

## 6. 时间与额度控制

### 6.1 估算口径

以下估算假定：一个主要 Codex 串行实现，另一个 Codex 只在每个 Draft PR 检查点独立复审；每周 5 个工作日、每天约 4–6 小时有效工程时间；固定上游版本不升级；本地与云端 smoke 所需 endpoint 在发布阶段可用。等待用户审阅、Plus 周额度重置、真实模型服务故障和 GitHub 故障只增加日历时间，不计入净工作日。

“一个 GPT-5.6 Sol Plus 完整周额度”是相对容量单位，不假定永久固定的请求数。执行者在每个 PR 开始和长测试矩阵前读取当时账户用量；不得为了适配额度删除 P0 测试。

### 6.2 分段净工作量

- PR-A：4–5 个工作日，约 0.6–0.8 个完整周额度。内容为源码导入、来源锁、完整产品/Web/模型身份、About/许可、数据隔离和 Electron 安全。
- PR-B：8–11 个工作日，约 1.3–2.0 个完整周额度。内容为 KernelDriver、模型/工具桥、durability、恢复和 DSH Compaction 兼容；这是关键路径。
- PR-C：7–9 个工作日，约 1.0–1.4 个完整周额度。内容为共享 guarded-fetch、OpenAI route/onboarding、GUI-managed MCP、设置/Plus 菜单、会话/Diff/Terminal 回归、更新和 Desktop E2E。
- `main` 稳定化与发布：3–4 个工作日，约 0.3–0.5 个完整周额度。只修复已发现缺陷、重跑矩阵和制作 release evidence，不增加功能。

总计为 22–29 个净工作日、约 3.2–4.7 个完整周额度。常规基准取 25 个工作日、约 5 个日历周和 3.9 个完整周额度；乐观也按 5 周安排，保守预留第 6 周。

### 6.3 建议周历

- 第 1 周：完成 PR-A。第 5 个工作日形成检查点 A；若提前全绿，剩余额度只用于 B1–B2 的源码复读和失败测试，不抢跑 UI。
- 第 2 周：完成 B3–B6，即消息/context、模型、工具和 Session commit bridge。
- 第 3 周：完成 B7–B10、crash/compaction matrix 和检查点 B。PR-B 未通过前不得开始依赖真实 Pi 语义的 PR-C 代码。
- 第 4 周：完成 C1–C4，即共享 guarded-fetch、模型 onboarding、能力 inventory、Host MCP 和 MCP/UI settings。
- 第 5 周：完成 C5–C9、检查点 C，并在 `main` 运行第一次全量门禁。
- 第 6 周（保守余量）：只处理跨包类型生成、Windows 打包、MCP 进程清理、性能门禁或独立复审发现的问题；没有缺陷时不消耗该周。

### 6.4 额度与延期规则

- 每个周额度优先级固定为：Session/durability/恢复 > Pi 工具与模型闭环 > MCP credential/CAS/隔离 > OpenAI route > Desktop E2E > 视觉微调。
- 当前周期剩余额度不足以完成一个任务的“失败测试 -> 实现 -> 完整验证 -> commit”时，不开始该任务；改做源码复读、review、文档核对或已实现任务的聚焦测试，并在额度重置后从任务边界继续。
- 当前基线没有已批准的 P1 延期；需求文档列出的全部 P1 都要实施和验收。若项目所有者以后明确批准缩减，只能先更新需求、追踪矩阵和对应 PR 计划；FR-004、FR-017、FR-019、FR-066、FR-067 以及所有 P0 测试在任何情况下都不能作为赶工项删除。
- 连续两天无代码进展时先分类：额度等待不改计划；固定上游测试失败进入稳定化预算；接口理解不一致必须回到权威文档，不允许实现者自行选择新架构。

## 7. 完成定义

只有同时满足下列条件才可把 V1 标记为完成：

- [ ] 三个 PR 均经人工审阅并合入 `main`。
- [ ] `main` 上重新运行第 5 节门禁并记录 commit hash。
- [ ] Windows 11 x64 干净环境完成安装、首次模型配置、一次含 Diff/Terminal 的工具任务、MCP 配置与调用、会话整理/搜索/导出、退出恢复和卸载。
- [ ] 发布说明清楚列出 V1.1 排除项与已知限制。
- [ ] GitHub Release 只提供手动下载；Alpha 不自动下载、不自动安装。
- [ ] README 状态更新为 V1 已实现，并链接 release evidence。
