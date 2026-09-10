# PR-C V1 Product Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pi 内核桥稳定后，完成 OpenAI-compatible 本地/云端配置、能力设置页、Composer “+”菜单、紧凑工具卡、Goal/Plan/Skill/MCP/PDF/网页能力验证、手动更新和 Windows 发布闭环。

**Architecture:** 所有设置和能力状态继续来自 DSH Host service/settings/projection；前端只增加可替换的导航与展示。Composer 快捷入口执行现有 DSH command/source 或打开同一 settings section，不维护第二套 Goal/Plan/Skill/MCP 状态。

**Tech Stack:** DSH Client slots/settings/remotes、React、TypeScript、Vitest browser tests、Electron updater、OpenAI Responses/Chat Completions mock server。

---

## 上游复读清单

开工前完整阅读：

- DSH Client：`ui-conversation` 的 `InputBar.tsx`、`apply.ts`、`contract/slots.ts`；`ui-input-trigger`；`ui-commands`；`ui-goal`；`ui-plan`；`ui-skill`；`ui-settings*`；`ui-tool`；`ui-attachment`；`ui-sidebar-documentpreview`；相关 unit/E2E tests。
- DSH Host：`llm-pi-ai/src/config.ts`、`catalog.ts`、`discovery.ts`、`provider.ts`；`host/plugin-inventory`；`mcp/mcp-client`；`api/session-controller`；`apps/desktop/src/update-coordinator.ts`、`main.ts`、`ipc.ts`。
- Codex：设置导航、Composer “+”菜单和紧凑工具展示；只采用交互原则，不复制源码。
- Pi：核对 0.85.1 OpenAI Responses/Completions model metadata，不在本 PR 改内核协议。

## Task C1：限制并完善 V1 OpenAI-compatible route

**Files:**

- Modify: `packages/llm/llm-pi-ai/src/config.ts`
- Modify: `packages/llm/llm-pi-ai/src/discovery.ts`
- Modify: `packages/llm/llm-pi-ai/tests/config.spec.ts`
- Modify: `packages/llm/llm-pi-ai/tests/egress.spec.ts`
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`

- [ ] 先写 route validation 失败测试：local HTTP 允许 `127.0.0.0/8`、`::1` 和 DNS 解析结果全为 loopback 的 `localhost`；拒绝远程 HTTP、URL userinfo、重定向到非 loopback；cloud 只允许 HTTPS；headers 大小写不敏感地拒绝 authorization/proxy-authorization/cookie/set-cookie。

- [ ] 先写 wire API 测试：新建/修改 route 必须显式为 `openai-responses` 或 `openai-completions`；其他 Pi protocols 全部被 V1 写入路径拒绝；不得按 URL 猜 protocol。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/egress.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

- [ ] 在 `PiAiProviderProfile` 增加产品字段：

  ```ts
  location?: 'local' | 'cloud'
  ```

  对所有由 Models UI 创建或改变且声明 `baseURL` 的 route，`location` 和 `api` 必填。固定上游 catalog 的未修改只读条目可以继续缺省，以兼容读取，但 V1 UI 不提供非 OpenAI protocol 的创建入口。

- [ ] 增加纯验证函数：

  ```ts
  export function assertV1OpenAiRoute(provider: string, profile: PiAiProviderProfile): void
  ```

  它在 `assertServiceable` 和 discovery 前运行；credential 仍只接受 `apiKeyEnv` credential reference。

- [ ] ProviderEditor 增加“本地/云端”和“Responses/Chat Completions”显式选择；保存对象继续走 `SettingsScopeBinder` 与 existing credential operation。API key 输入不得进入 component snapshot、settings mutation 或 console。

- [ ] 默认 composition 不再激活 `@deepseek-ai/dsh-llm-deepseek`。`agent-default-model` 的引导值固定为 `local-openai/qwen3.8-27B`，但不预置未知端口或凭据；Models onboarding 创建同名 route、显式选择协议和 baseURL，并在保存成功后原子更新默认 selection。route 未配置时 Send 保持禁用且不发请求。用户可在 onboarding 中覆盖 provider/model id，以服从本地服务 `/v1/models` 返回值；云端配置同样从 Models 页面创建。保留 DSH DeepSeek 源码包用于上游兼容，但不在 V1 默认 profile 激活。

- [ ] 运行聚焦测试和 mock model matrix。

  Run:

  ```powershell
  pnpm vitest run packages/llm/llm-pi-ai/tests packages/client/ui-settings-models/tests
  pnpm run check:local-harness
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/llm/llm-pi-ai packages/client/ui-settings-models packages/bundle/base
  git commit -m "feat: constrain V1 to explicit OpenAI-compatible routes"
  ```

## Task C2：增加安全的能力清单 Remote

**Files:**

- Create: `packages/api/session-controller/src/capabilities.ts`
- Create: `packages/api/session-controller/tests/capabilities.host.spec.ts`
- Modify: `packages/api/session-controller/src/index.ts`
- Modify: `packages/host/plugin-inventory/src/types.ts`
- Modify: `packages/host/plugin-inventory/src/index.ts`
- Modify: `packages/host/plugin-inventory/tests/inventory.spec.ts`

- [ ] 先写 Host 测试，期望 response 只有安全元数据：

  ```ts
  export interface CapabilitySnapshot {
    readonly sessionId?: SessionId
    readonly tools: readonly {
      name: string
      source: 'builtin' | 'mcp'
      serverName?: string
    }[]
    readonly mcp: readonly {
      entryId: PluginEntryId
      serverName: string
      transport: 'stdio' | 'streamable-http'
      phase: PluginFiberPhase
      toolCount: number
    }[]
  }
  ```

- [ ] 测试必须证明 response 不含 MCP command args、env、HTTP headers、credential reference value、tool schema arguments 或文件路径。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/api/session-controller/tests/capabilities.host.spec.ts packages/host/plugin-inventory/tests/inventory.spec.ts`

- [ ] `PluginInventoryEntry` 只增加经过 allowlist 的可选元数据。仅当 moduleName 为 `@deepseek-ai/dsh-mcp-client` 时，从 loader config 读取并验证 `serverName`、`transport`；其他 config 字段一律不投影。

- [ ] `capabilities/list` 接收可选 sessionId。存在 live agent 时从该 Agent scope 的 `tools.schemas(agent)` 读取可见工具，按 `mcp__<serverName>__` 计数；不存在 session 时工具数组为空但仍返回配置/失败中的 MCP entry。Skills 继续使用现有 `skills/list` Remote，不复制其目录或缓存。

- [ ] 运行 Typert generator 和测试。

  Run:

  ```powershell
  pnpm run build:lib:host
  pnpm run typecheck:contracts-ready
  pnpm vitest run packages/api/session-controller/tests/capabilities.host.spec.ts packages/host/plugin-inventory/tests/inventory.spec.ts
  ```

  `build:lib:host` 生成 Typert Remote artifacts；不得手改生成目录后跳过 `typecheck:contracts-ready`。

- [ ] 提交。

  Run:

  ```powershell
  git add packages/api/session-controller packages/host/plugin-inventory packages/api/remotes
  git commit -m "feat: expose a redacted capability inventory"
  ```

## Task C3：补齐 Tools、Skills、MCP、Experimental 设置分区

**Files:**

- Create: `packages/client/ui-settings-capabilities/package.json`
- Create: `packages/client/ui-settings-capabilities/tsconfig.json`
- Create: `packages/client/ui-settings-capabilities/tsdown.config.ts`
- Create: `packages/client/ui-settings-capabilities/src/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/ToolsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/SkillsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/ExperimentalSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/store.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/locales.ts`
- Create: `packages/client/ui-settings-capabilities/tests/apply.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/store.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/sections.client.spec.tsx`
- Modify: `packages/bundle/web-app/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`

- [ ] 先写 slot registration 测试，断言 section ids 和顺序固定：`models=10`（已有）、`tools=20`、`skills=30`、`mcp=40`、`experimental=90`。全部 copy 经 typed zh/en locale。

- [ ] 新包 manifest 固定使用 `"name": "@local-harness/ui-settings-capabilities"`、`"private": true`、ESM 和 DSH Client package 的标准 `main/types/exports`。依赖与 peer dependency 以 `ui-settings-plugins` 为模板，只加入实际 import 的 workspace 包；`web-app` 通过 workspace dependency 和现有 Client plugin row 加载它。

- [ ] 先写 store 测试：同一连接 generation 内 capability、plugin inventory 和 skills 请求 single-flight；Host invalidation/connection reset 刷新；无当前 session 时 Skills/MCP 显示配置状态而不伪造 live tool count。

- [ ] ToolsSection 复用现有 DSH settings scopes 和 `ui-settings-plugins` 的 Bash/Web Search/Agent Loop controllers；抽取并 export 共享 controller，而不是复制一份设置。增加 permission preset、workspace、network 和 MCP 有效权限摘要；完整编辑仍落同一个 Host settings document。V1 将 DSH 已安装执行插件视为受信任源码，基础拒绝继续由 DSH workspace/network/approval/`tools/pre-execute` 策略执行；不新增未执行的便携 manifest 权限字段。

- [ ] SkillsSection 在当前 session 存在时调用既有 `skills/list`，显示来源、model/user invocable、冲突或加载错误；无 session 时给出“打开工作区会话后检查”的状态。不得扫描浏览器文件系统或缓存 `SKILL.md` 正文。

- [ ] McpSection 合并 `pluginInventory.list()` 和 `capabilities/list(sessionId)`，显示 serverName、transport、fiber/connection phase、toolCount；单个失败不隐藏其他 server。编辑按钮打开原 Host settings document，不在 Client 存 MCP config 副本。

- [ ] ExperimentalSection V1 只显示明确关闭的未来能力说明，不提供 Qwen Code 内核、Office 编辑、完整浏览器自动化或自动安装开关。

- [ ] 运行测试与 Web composition build。

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-settings-capabilities/tests
  pnpm run build:web
  pnpm run typecheck
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/client/ui-settings-capabilities packages/client/ui-settings-plugins packages/bundle/web-app
  git commit -m "feat: add capability-focused settings sections"
  ```

## Task C4：增加设置导航 service 和 Composer “+”能力菜单

**Files:**

- Create: `packages/client/ui-settings/src/client/navigation.ts`
- Modify: `packages/client/ui-settings/src/client/index.ts`
- Modify: `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`
- Test: `packages/client/ui-settings-general/tests/settings-navigation.client.spec.tsx`
- Create: `packages/client/ui-conversation/src/client/skeleton/ComposerAddMenu.tsx`
- Create: `packages/client/ui-conversation/src/client/skeleton/ComposerAddMenu.module.css`
- Modify: `packages/client/ui-conversation/src/client/contract/slots.ts`
- Modify: `packages/client/ui-conversation/src/client/apply.ts`
- Modify: `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`
- Modify: `packages/client/ui-conversation/src/client/locales.ts`
- Test: `packages/client/ui-conversation/tests/composer-add-menu.client.spec.tsx`
- E2E: `apps/web/tests/composer-add-menu.e2e.ts`

- [ ] 先写 settings navigation 测试：`ctx.settingsNavigation.open('mcp')` 打开 Settings 并选中已注册 section；不存在 id 返回稳定错误且不打开空 panel；请求只存在内存，不写 localStorage。

- [ ] 实现 root service：

  ```ts
  export interface SettingsNavigationRequest {
    readonly revision: number
    readonly sectionId: string
  }

  export class SettingsNavigationService extends Service {
    readonly requests: ObservableSnapshot<SettingsNavigationRequest | null>
    open(sectionId: string): void
  }
  ```

  `SettingsRoot` 订阅 request，在 ledger 中验证 sectionId 后设置 panel open 和 active section；处理 revision 后不清除 durable state，因为这里没有 durable state。

- [ ] 把 Composer 注入从只支持 command 改为通用 source：

  ```ts
  toggleInputSource: ((source: 'command' | 'skill', selection: EditSelection) => void) | undefined
  ```

  实现继续调用 existing `inputTriggers.toggleSource(source, ...)`；不得另写技能搜索。

- [ ] 先写菜单测试，固定条目和行为：

  1. Attachment：触发现有 hidden file input。
  2. Skill：打开 existing `skill` input source。
  3. MCP：打开 settings `mcp`。
  4. Tools & Permissions：打开 settings `tools`。
  5. Goal：调用 existing command path `/goal`。
  6. Plan：根据 DSH plan projection 调用 `/plan` 或 `/plan off`。
  7. Commands：打开 existing `command` input source。

  菜单用 `role=menu`/`menuitem`，支持 Enter、方向键、Escape、outside click 和焦点归还。

- [ ] 用 `ComposerAddMenu` 替换 Plus 按钮直接打开 command list 的行为。附件必须进入 Plus 菜单；是否保留 paperclip 作为冗余快捷键由现有布局测试决定，但 Plus 路径必须完整可用。

- [ ] Goal/Plan label 和状态只读 DSH projection/command availability；Skills/MCP 只读现有 Remote/store；不得在 React state 或 localStorage 保存能力开关。

- [ ] 运行测试。

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-settings-general/tests/settings-navigation.client.spec.tsx packages/client/ui-conversation/tests/composer-add-menu.client.spec.tsx
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/composer-add-menu.e2e.ts
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/client/ui-settings packages/client/ui-settings-general packages/client/ui-conversation apps/web/tests/composer-add-menu.e2e.ts
  git commit -m "feat: add the unified Composer capability menu"
  ```

## Task C5：收紧工具卡和 transient-to-durable 收敛

**Files:**

- Modify: `packages/client/ui-tool/src/client/tool/ToolCallTree.tsx`
- Modify: corresponding `packages/client/ui-tool/src/client/**/*.module.css`
- Modify: `packages/client/ui-tool/tests/tool-call-tree.client.spec.tsx`
- Modify: `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`
- Modify: `packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts`
- E2E: `apps/web/tests/tool-card-compact.e2e.ts`
- E2E: `apps/web/tests/session-stream-convergence.e2e.ts`

- [ ] 先写工具卡测试：默认只显示状态、工具名、短目标、已记录 duration 和结果摘要；raw arguments/output/error/meta 只在展开后出现；错误和审批等待仍无需展开即可辨认。

- [ ] duration 只由 durable call/result timestamp 或现有 projection 计算；历史事件没有时间时省略，不用 `Date.now()` 伪造 replay 值。

- [ ] 先写会话收敛测试：同 messageId 的 transient revision 单调替换；对应 durable seq 到达后原位替换；切换 session 后旧 session delta 被丢弃；重连从 DSH snapshot 重建，不保留浏览器 durable chat 副本。

- [ ] 只在测试证明确有缺口时修改 assistant projection；若固定 DSH 已满足收敛，保留源码并只提交回归测试。不得更改 Session schema 来实现视觉折叠。

- [ ] 运行测试和 E2E。

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-tool/tests packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/tool-card-compact.e2e.ts apps/web/tests/session-stream-convergence.e2e.ts
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/client/ui-tool packages/client/ui-chat apps/web/tests/tool-card-compact.e2e.ts apps/web/tests/session-stream-convergence.e2e.ts
  git commit -m "feat: compact tool cards and lock stream convergence"
  ```

## Task C6：验证复用能力，不重复实现 Goal/Plan/Skill/MCP/PDF/Web

**Files:**

- Modify tests: `apps/web/tests/goal-bar.e2e.ts`
- Modify tests: `apps/web/tests/plan-control-row.e2e.ts`
- Modify tests: `apps/web/tests/skill-user-invoke.e2e.ts`
- Create: `apps/web/tests/mcp-tool-through-pi.e2e.ts`
- Modify tests: `apps/web/tests/document-preview.e2e.ts`
- Create: `apps/web/tests/web-tools-through-pi.e2e.ts`
- Modify: `packages/bundle/web-app/cordis.patch.yml` only if a shipped plugin is missing

- [ ] Goal test断言 `/goal` 和 Plus 入口都产生同一 `goal/change` projection；恢复后 GoalBar 一致。

- [ ] Plan test断言进入 `/plan` 后下一 step 的 DSH tool schema 已受限制，Plus 菜单显示退出状态，`/plan off` 后恢复；不读取 Pi state。

- [ ] Skill test断言现有 progressive disclosure：目录列表不把全部 SKILL.md 放进 prompt，选中后才读取正文；Pi 只收到 DSH assembled context。

- [ ] MCP test 启动 DSH 自带 fixture server，经 DSH MCP Client 注册 `mcp__*` tool，经 Pi tool wrapper 调用，最后 Session 中仍是 DSH `tool/call`/`tool/result`。

- [ ] PDF test只验证附件引用和预览，明确没有编辑按钮。Web test验证 `web_fetch`/`web_search` 仍进入 DSH egress/approval；不引入 Playwright/Computer-use 产品依赖。

- [ ] 运行能力 E2E。

  Run:

  ```powershell
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/goal-bar.e2e.ts apps/web/tests/plan-control-row.e2e.ts apps/web/tests/skill-user-invoke.e2e.ts apps/web/tests/mcp-tool-through-pi.e2e.ts apps/web/tests/document-preview.e2e.ts apps/web/tests/web-tools-through-pi.e2e.ts
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add apps/web/tests packages/bundle/web-app/cordis.patch.yml
  git commit -m "test: prove DSH capabilities through the Pi loop"
  ```

## Task C7：把 Alpha 更新改为手动检查和手动下载

**Files:**

- Modify: `apps/desktop/src/update-coordinator.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/ipc.ts`
- Modify: `apps/desktop/src/preload.ts`
- Modify: `apps/desktop/src/locale.ts`
- Modify: `apps/desktop/scripts/desktop-auto-update-environment.mjs`
- Modify: `apps/desktop/tests/update-coordinator.spec.ts`
- Modify: `apps/desktop/tests/desktop-auto-update-environment.spec.ts`

- [ ] 先写失败测试：启动后不自动 check；`autoDownload=false`；没有 install/quitAndInstall IPC；手工检查发现版本时只返回 HTTPS download page；非法或 HTTP download page 被拒绝；检查失败不阻止启动且不循环弹窗。

- [ ] 删除启动后的 `setTimeout(() => checkAndPrompt(false), 10_000)` 行为。保留菜单“检查更新”。

- [ ] `DesktopUpdateState` 的 available arm 增加 `downloadUrl`，来源为打包环境显式配置的 HTTPS release page。主进程用 Electron `shell.openExternal()` 打开；sender 校验和 URL 再验证必须在 main process 完成。

- [ ] 移除 renderer 可调用的 install 方法和 `updatesInstall` channel。V1 不调用 `downloadUpdate()` 或 `quitAndInstall()`；签名自动安装代码可以保留为未接线的 V1.1 基础，但 boundary test 必须证明不可达。

- [ ] 运行测试。

  Run: `pnpm vitest run apps/desktop/tests/update-coordinator.spec.ts apps/desktop/tests/desktop-auto-update-environment.spec.ts apps/desktop/tests/locale.spec.ts`

- [ ] 提交。

  Run:

  ```powershell
  git add apps/desktop
  git commit -m "feat: make Alpha updates check-and-download only"
  ```

## Task C8：完成 Windows V1 E2E、发布证据和 Draft PR

**Files:**

- Create: `apps/desktop/tests/v1-product-flow.e2e.ts`
- Create: `scripts/measure-local-harness-v1.ts`
- Create: `scripts/tests/measure-local-harness-v1.spec.ts`
- Modify: `package.json`
- Create: `docs/release/v1-alpha-checklist.md`
- Create: `docs/release/v1-alpha-known-limitations.md`
- Create: `docs/release/v1-alpha-performance.json`
- Create: `.agents/notes/architecture/2026-09-10-v1-client-capability-surfaces.md`
- Modify: `README.md`

- [ ] Desktop E2E 运行真实 Electron + mock OpenAI server，覆盖：打开 workspace、创建 session、流式 reply、审批 allow/deny、工具修改、steer、queue、cancel、Goal、Plan、Skill、MCP、附件、PDF 预览、退出恢复。

- [ ] 测试直接终止 Host 进程验证三类 durability barrier；重启后从 DSH Session 打开。断言 SQLite 缺失时正文仍可打开，重建后搜索恢复。

- [ ] 增加 `measure-local-harness-v1.ts`：同一 mock provider、固定工作区和硬件上分别启动固定 DSH root 与候选 root，每组预热 2 次、采样 10 次；记录冷启动中位数以及首个 Host assistant delta 到 DOM 呈现的附加中位延迟。输出 JSON 必须包含两端 commit、Node/Electron/Windows 版本、原始样本和阈值结论；冷启动回退超过 15% 或附加延迟超过 100ms 时退出非零。单元测试用确定时钟验证 median、阈值和 JSON 脱敏。

  `package.json` 增加固定入口：

  ```json
  {
    "scripts": {
      "benchmark:local-harness:v1": "tsx scripts/measure-local-harness-v1.ts"
    }
  }
  ```

  脚本启动前必须验证 baseline root 的 HEAD 等于固定 DSH hash、两个 root 的 build artifacts 均存在，缺失时给出构建命令并退出，不自动安装依赖或下载文件。

- [ ] Desktop E2E 使用唯一 marker 文本覆盖诊断日志脱敏：默认日志、错误、Session export 和 release evidence 不得出现 API key、prompt、assistant 正文、工具 raw output、文件内容或附件字节。另验证 capability stores、tool commit buffer、listener queues 有明确上界，cancel/dispose 后没有 timer、subscriber、child process 或 write handle 泄漏。

- [ ] 发布限制明确列出：无 Qwen Code 内核、无公开 OpenAI 入站 gateway、无 Office/PDF 编辑、无完整浏览器自动化、无自动安装更新、macOS/Linux 不作 V1 二进制门禁。

- [ ] 运行完整门禁。

  Run:

  ```powershell
  pnpm install --frozen-lockfile
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run test
  pnpm run test:snapshot
  pnpm run test:web
  pnpm run test:gui
  pnpm run test:docs
  pnpm run build
  pnpm run benchmark:local-harness:v1 -- --baseline-root E:\AI\_reference\deepseek-harness-current --candidate-root E:\AI\Local-Harness-pi --output docs/release/v1-alpha-performance.json
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:dir
  git diff --check
  ```

- [ ] 在干净 Windows 11 x64 环境手工运行本地和云端 model smoke；只把结果、模型 id、route 类型和时间写入 checklist，不记录 baseURL query、headers 或 key。

- [ ] 提交证据、推送并创建 Draft PR。

  Run:

  ```powershell
  git add apps/desktop/tests/v1-product-flow.e2e.ts scripts/measure-local-harness-v1.ts scripts/tests/measure-local-harness-v1.spec.ts package.json docs/release README.md .agents/notes/architecture/2026-09-10-v1-client-capability-surfaces.md
  git commit -m "test: complete the Local-Harness-pi V1 product flow"
  git push -u origin pr-c/v1-product-loop
  gh pr create --draft --title "feat: complete the Local-Harness-pi V1 desktop flow" --body-file .\.github\pull_request_template.md
  ```

  不得在本步骤自动合并 PR 或创建公开 Release；由项目所有者审阅三个检查点后决定。
