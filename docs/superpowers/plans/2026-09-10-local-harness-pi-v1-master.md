# Local-Harness-pi V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新的 `Local-Harness-pi` 仓库中，以固定 DSH 源码为产品平台，只替换 Agent Loop 为 Pi Agent Core，并完成 Windows Electron V1 产品闭环。

**Architecture:** 保留 DSH Electron、Client、Session、LLM、Tools、Goal/Plan、Skill 和 MCP 所有权；新增 `@local-harness/pi-agent-loop` 作为唯一活动 `AgentFactory`。DSH append-only Session 是唯一可恢复事实源，Pi 状态、Client transient state 和 SQLite 搜索索引都只允许作为派生状态。

**Tech Stack:** Node.js 22.19+、pnpm 11.7.0、TypeScript 6、Electron 44、React、Cordis、Vitest 及其 browser runner、`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`。

---

## 0. 计划集与执行顺序

本主计划只负责顺序、门禁和 PR 交付。具体代码步骤在三个子计划中：

1. [PR-A：DSH 基线与产品边界](2026-09-10-local-harness-pi-pr-a-dsh-baseline.md)
2. [PR-B：Pi 内核桥接](2026-09-10-local-harness-pi-pr-b-pi-kernel.md)
3. [PR-C：V1 产品闭环](2026-09-10-local-harness-pi-pr-c-product-loop.md)

依赖顺序固定为 `PR-A -> PR-B -> PR-C`。只有 PR-B 单个 diff 超过约 2,500 行手写业务代码或连续两轮复审仍无法收敛时，才允许按子计划规定拆为 B1/B2；不得创建第四条长期并行产品分支。

### 需求到任务的追踪

| 需求 | 实施任务 | 主要验收证据 |
|---|---|---|
| `FR-001`–`FR-004` | A3–A5、C8 | workspace/单实例/窗口安全测试与 Windows smoke |
| `FR-010`–`FR-018` | B8–B10、C5、C8 | Agent 生命周期、消息确认、恢复、分叉与搜索矩阵 |
| `FR-020`–`FR-025` | B1–B9 | dependency boundary、KernelDriver conformance、唯一 AgentFactory |
| `FR-030`–`FR-037` | B4、C1、C8 | 本地/云端 Responses 与 Completions mock/real route 矩阵 |
| `FR-040`–`FR-047` | B5、B6、B10、C5 | 工具、审批、workspace、失败、上下文与工具卡测试 |
| `FR-050`–`FR-052` | C4、C6、C8 | `/goal`、`/plan`、Plus 菜单与恢复测试 |
| `FR-060`–`FR-065` | C2、C3、C6、C8 | Skill/MCP/插件清单、有效权限摘要与失败隔离测试 |
| `FR-070`–`FR-072` | C4、C6、C8 | 附件、PDF 预览、Web tools 产品流 |
| `FR-073`–`FR-074` | V1.1 | V1 越界扫描和 known-limitations 记录 |
| `FR-080`–`FR-083` | C1–C5 | settings section、单一状态源、Plus 菜单与折叠工具卡 |
| `FR-090`–`FR-091` | C7、C8 | 手工检查/下载、不可达安装路径与失败隔离测试 |
| `FR-092` | V1.1 | V1 越界扫描和 known-limitations 记录 |
| `NFR-001`–`NFR-006` | B5、B6、B9、B10、C5、C8 | Session ordering、三类 flush、crash/SQLite 重建矩阵 |
| `NFR-010`–`NFR-014` | A5、B4、B5、C1、C2、C7、C8 | credential/network/Electron/plugin/log redaction 矩阵 |
| `NFR-020`–`NFR-022` | B7–B10、C3、C8 | 基线对比、缓存上界、取消与资源回收测试 |
| `NFR-030`–`NFR-032` | C3–C5、C8 | 键盘、错误操作建议和状态可理解性测试 |
| `TEST-001`–`TEST-006` | A2、B1、B10、C6、C8 | source/dependency、model、tool、recovery、product、安全矩阵 |

每个需求只能由其权威需求文档改变优先级；本表用于证明覆盖关系，不复制需求正文。

## 1. 固定输入

### 上游版本

- DeepSeek Harness：`b2e3b2a0125854567a4a5fcba75782e42fe84901`
- Pi：`acaa253cc8e3f159e6100b6f3874861b1f0bfc99`
- Pi npm：`@earendil-works/pi-agent-core@0.85.1` 与 `@earendil-works/pi-ai@0.85.1`
- Codex 交互参考：`73a1148c9c775c2a4616ce5096291740a00ed68a`

### 权威项目文档

- `docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md`
- `docs/requirements/v1-requirements.md`
- `docs/architecture/interface-contracts.md`
- `docs/architecture/session-consistency.md`

发生冲突时，按总体设计、会话一致性、接口契约、需求规格的顺序处理。执行者不得通过代码自行改变 V1/V1.1 边界。

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

完成 PR-C 后，本地/云端 OpenAI-compatible route、设置页、Composer “+”菜单、Goal/Plan/Skill/MCP、附件/PDF、审批、恢复和 Windows 打包形成产品闭环。

阻断条件：云 route 允许 HTTP、本地 route 可访问非 loopback、凭据进入设置 JSON/日志/Session、自动安装更新默认开启、Windows 安装包 smoke 失败。

## 5. 全局发布门禁

- [ ] 依赖与架构门禁。

  Run:

  ```powershell
  pnpm install --frozen-lockfile
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

- [ ] 执行 Windows 桌面目录打包与 smoke。

  Run:

  ```powershell
  pnpm run build
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:dir
  ```

  Expected: 生成可启动的 unpacked Windows 应用。签名安装与自动更新不是 V1 门禁。

- [ ] 运行手工模型矩阵并在 release evidence 中记录，不提交密钥。

  1. 本地 OpenAI Chat Completions：文本、工具、取消。
  2. 本地 OpenAI Responses：文本、工具、取消。
  3. 一个 loopback 实际服务。
  4. 一个 HTTPS OpenAI-compatible 云 route。

- [ ] 运行崩溃恢复矩阵：用户消息确认后 kill、assistant stream 中 kill、`tool/call` flush 后 body 前 kill、body 后 result 前 kill、turn end 后 kill、SQLite 索引移除后重建。

- [ ] 确认没有 V1.1 越界内容。

  Run: `git grep -n -E "playwright|computer.use|office.edit|pdf.edit|autoDownload|autoInstall" -- packages apps`

  Expected: 仅出现 DSH 既有测试/依赖或明确关闭的配置；不得出现本项目新增的 V1.1 实现。

## 6. 时间与额度控制

按一个主要 Codex 执行实现、另一个 Codex 做独立复审估算：

- PR-A：2–3 个工作日，约 0.3–0.5 个 GPT-5.6 Sol Plus 周额度。
- PR-B：7–10 个工作日，约 1.1–1.6 个周额度。
- PR-C：4–6 个工作日，约 0.6–0.9 个周额度。
- 修复与最终发布：2–3 个工作日，约 0.3–0.5 个周额度。

总计约 3–4 个日历周、2.3–3.5 个完整周额度。额度优先级固定为：Session/工具一致性 > Pi 运行闭环 > OpenAI route > 桌面 E2E > 视觉微调。额度紧张时只能延期 P1 项，不得放宽 P0 不变量。

## 7. 完成定义

只有同时满足下列条件才可把 V1 标记为完成：

- [ ] 三个 PR 均经人工审阅并合入 `main`。
- [ ] `main` 上重新运行第 5 节门禁并记录 commit hash。
- [ ] Windows 11 x64 干净环境完成安装、启动、模型配置、一次工具任务、退出恢复和卸载。
- [ ] 发布说明清楚列出 V1.1 排除项与已知限制。
- [ ] GitHub Release 只提供手动下载；Alpha 不自动下载、不自动安装。
- [ ] README 状态更新为 V1 已实现，并链接 release evidence。
