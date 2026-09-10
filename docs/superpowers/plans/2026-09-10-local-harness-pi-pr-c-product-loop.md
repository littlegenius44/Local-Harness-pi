# PR-C V1 Product Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pi 内核桥稳定后，完成 OpenAI-compatible 本地/云端配置、图形化 MCP 管理、能力设置页、Composer “+”菜单、会话资料库、紧凑工具卡、Goal/Plan/Skill/PDF/网页能力验证、手动更新和 Windows 发布闭环。

**Architecture:** 所有设置和能力状态继续来自 DSH Host service/settings/projection；前端只增加可替换的导航与展示。GUI-managed MCP records 进入 `local-harness.mcp` DSH settings namespace，再由 Host 动态挂载现有 DSH MCP Client；固定 composition MCP 只读。Composer 快捷入口执行现有 DSH command/source 或打开同一 settings section，不维护第二套 Goal/Plan/Skill/MCP 状态。

**Tech Stack:** DSH Client slots/settings/remotes、React、TypeScript、Vitest browser tests、Electron updater、OpenAI Responses/Chat Completions mock server。

---

## 上游复读清单

开工前完整阅读：

- DSH Client：`ui-conversation` 的 `InputBar.tsx`、`apply.ts`、`contract/slots.ts`；`ui-input-trigger`；`ui-commands`；`ui-goal`；`ui-plan`；`ui-skill`；`ui-settings*`；`ui-tool`；`ui-attachment`；`ui-sidebar-documentpreview`；相关 unit/E2E tests。
- DSH Host：`docs/cookbook/adding-a-package.md`；`llm-pi-ai/src/config.ts`、`adapter.ts`、`catalog.ts`、`discovery.ts`、`provider.ts`、`stream.ts`；`web/web-fetch-http/src/network.ts` 及网络测试；`settings/settings` 与 `api/settings-controller`；`credentials/credentials` 与 `api/settings-controller/src/credentials.ts`；`host/plugin-inventory`；`mcp/mcp-client/src/index.ts`、`transport.ts`、`connection.ts` 及全部 tests；`api/remotes` 的 forwarded-event allowlist 和 Typert selection；`api/session-controller`；`apps/desktop/src/update-coordinator.ts`、`main.ts`、`ipc.ts`。
- Codex：设置导航、Composer “+”菜单和紧凑工具展示；只采用交互原则，不复制源码。
- Pi：核对 0.85.1 OpenAI Responses/Completions model metadata，不在本 PR 改内核协议。

## Task C1：限制并完善 V1 OpenAI-compatible route

**Files:**

- Modify: `packages/llm/llm-pi-ai/src/config.ts`
- Modify: `packages/llm/llm-pi-ai/src/adapter.ts`
- Modify: `packages/llm/llm-pi-ai/src/index.ts`
- Modify: `packages/llm/llm-pi-ai/src/discovery.ts`
- Modify: `packages/llm/llm-pi-ai/src/provider.ts`
- Modify: `packages/llm/llm-pi-ai/package.json`
- Modify: `packages/llm/llm-pi-ai/tests/config.spec.ts`
- Modify: `packages/llm/llm-pi-ai/tests/egress.spec.ts`
- Modify: `packages/llm/llm-pi-ai/tests/adapter.spec.ts`
- Create: `packages/llm/llm-pi-ai/tests/provider-v1-auth.spec.ts`
- Create: `packages/util/guarded-fetch/package.json`
- Create: `packages/util/guarded-fetch/tsconfig.json`
- Create: `packages/util/guarded-fetch/tsdown.config.ts`
- Create: `packages/util/guarded-fetch/README.md`
- Create: `packages/util/guarded-fetch/README.i18n.yaml`
- Create: `packages/util/guarded-fetch/src/index.ts`
- Create: `packages/util/guarded-fetch/src/network.ts`
- Create: `packages/util/guarded-fetch/tests/guarded-fetch.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/tests/readiness.client.spec.ts`
- Modify: `packages/client/ui-settings-models/tests/welcome-store.client.spec.ts`
- Create: `apps/web/tests/onboarding-openai-compatible.e2e.ts`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`

- [ ] 先写 route validation 失败测试：local HTTP/HTTPS 允许 `127.0.0.0/8`、`::1` 和 DNS 解析结果全为 loopback 的 `localhost`；拒绝远程 HTTP 和重定向到非 loopback；local/cloud 均拒绝 URL userinfo/query/fragment，cloud 只允许 HTTPS；V1 产品写入路径拒绝任何非空 `headers` 和非 SSE transport，标准 OpenAI Authorization 只由 Host 从 `apiKeyEnv` credential reference 构造。固定上游 catalog 的内部公开 header 不进入 UI snapshot。

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

  它在 `assertServiceable` 和 discovery 前运行；credential 仍只接受 `apiKeyEnv` credential reference，且对 UI 创建/修改的 route 拒绝任意 header。不得为了复用 DSH 的通用 `headers` 字段而把 secret 写进 settings。

- [ ] 先按接口契约 11.1 创建 `@local-harness/guarded-fetch@0.1.5-alpha.2`。实现从固定 DSH `web-fetch-http/src/network.ts` 提取“DNS 一次解析 -> 完整结果校验 -> request-scoped Undici Agent pinned lookup -> body/dispatcher 清理”模式，改成 `loopback | https` 两种显式 destination；不得直接 import `@deepseek-ai/dsh-web-fetch-http/src/*`。测试必须覆盖 IPv4/IPv6/localhost、混合 loopback+非 loopback DNS、DNS rebinding pin、同源 307/308、带 credential 跨源 307/308、301/302/303、第 6 跳、不可 replay body、abort、正常读完/取消/异常清理，以及不读取系统 proxy 环境。

  包 manifest 为 private ESM，`version` 为 `0.1.5-alpha.2`，direct dependencies 精确使用当前 lock 已有的 `undici: 8.10.0` 与 `ipaddr.js: 2.5.0`；README 按 DSH util package 模板说明 Host-only、零直接模型上下文和限制。`tsconfig.base.json` 增加 `@local-harness/guarded-fetch` 精确 source alias，`tsconfig.host.json` 增加 project reference。运行 `pnpm run doc-sync` 生成配对 README 后，若生成 `README.zh.md`，必须与本任务一起提交。

- [ ] `PiAiAdapterOptions` 增加按冻结 profile 创建 `GuardedFetchHandle` 的 factory；`streamWithSnapshot()` 把 `handle.fetch` 传入 `streamSimple()`，并在 stream 完成、取消或抛错后 await dispose。discovery 也从同一 factory 取得 fetch。local profile 用 `destination='loopback'`；cloud profile 用 `destination='https'`；`credentialBound` 等于 profile 是否声明 `apiKeyEnv`。`llm-pi-ai/package.json` 增加 `@local-harness/guarded-fetch: workspace:*`。测试在 mock Pi API 内捕获 `SimpleStreamOptions.fetch`，证明模型流和 discovery 都没有落到 `globalThis.fetch`，且 credential 只在 handle 已锁定的 origin 上发送。

- [ ] `provider.ts` 对含 `location` 的 profile 强制选择 Harness-owned `harnessApiKeyAuth`，即使 provider key 与 Pi installed catalog（例如 `openai`/`openai-codex`）同名也不继承其 OAuth、credential store 或 ambient environment discovery。local 无 `apiKeyEnv` 时传空 auth，cloud 缺 `apiKeyEnv` 在保存前拒绝。测试设置带 marker 的 `OPENAI_API_KEY`/Pi OAuth store，再发 keyless local request，断言 marker 未进入 header、错误、日志或 Session；另证明显式 DSH credential 只在当前 step 解析一次。

- [ ] ProviderEditor 增加“本地/云端”和“Responses/Chat Completions”显式选择；保存对象继续走 `SettingsScopeBinder` 与 existing credential operation。API key 输入不得进入 component snapshot、settings mutation 或 console。

- [ ] 锁定首次启动状态机，不允许实现者自行决定跳过条件：

  1. 无 serviceable provider：Welcome/Onboarding 自动打开，Composer Send disabled，提交事件不进入 Host。
  2. loopback route：`apiKeyEnv` 可以为空；保存成功且 model id/serviceability 通过后关闭 onboarding，并原子更新 default selection。
  3. cloud route：`apiKeyEnv` 和 `credentials.describe(ref).configured=true` 都满足才 ready；关闭弹窗不改变 disabled 状态。
  4. discovery 失败：保留当前 draft、已有手工 models 和 credential 状态；错误码与“手工填写 model id”操作同时显示。
  5. 默认模型切换写 DSH `agent-default-model` settings；会话内模型切换走现有 session selection，并只影响下一个 step。

  `onboarding-openai-compatible.e2e.ts` 使用两个 keyless fixture：无 key loopback `/v1/models` 和要求 Authorization 的 HTTPS-shaped mock adapter。不得读取真实用户 credential。

- [ ] 默认 composition 不再激活 `@deepseek-ai/dsh-llm-deepseek`。由于 DSH `agent-default-model` schema 要求非空 provider/model，组合层仅使用不可调用的引导 selection `local-openai/unconfigured`；不得把某个 Qwen 或云模型 id 硬编码成产品默认值，也不得预置未知端口或凭据。Models onboarding 创建用户选择的 route、显式选择协议和 baseURL，并在 route 验证成功后把真实 provider/model 原子写入 default selection。selection 仍为 `local-openai/unconfigured` 或找不到对应 route/model 时，Send 必须保持禁用且不发请求。用户可采用 `/v1/models` 发现值或手工填写 model id；本地与云端 route 都走同一流程。保留 DSH DeepSeek 源码包用于上游兼容，但不在 V1 默认 profile 激活。

- [ ] 运行聚焦测试和 mock model matrix。

  Run:

  ```powershell
  pnpm vitest run packages/llm/llm-pi-ai/tests packages/client/ui-settings-models/tests
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/onboarding-openai-compatible.e2e.ts
  pnpm run check:local-harness
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/llm/llm-pi-ai packages/util/guarded-fetch packages/client/ui-settings-models packages/bundle/base apps/web/tests/onboarding-openai-compatible.e2e.ts tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
  git commit -m "feat: constrain V1 to explicit OpenAI-compatible routes"
  ```

## Task C2：增加安全的能力清单 Remote

**Files:**

- Create: `packages/api/session-controller/src/capabilities.ts`
- Create: `packages/api/session-controller/tests/capabilities.host.spec.ts`
- Modify: `packages/api/session-controller/src/index.ts`
- Modify: `packages/api/session-controller/package.json`
- Modify: `packages/host/plugin-inventory/src/types.ts`
- Modify: `packages/host/plugin-inventory/src/index.ts`
- Modify: `packages/host/plugin-inventory/tests/inventory.spec.ts`

- [ ] 先写 Host 测试，期望 response 只有安全元数据：

  ```ts
  export interface CapabilitySnapshot {
    readonly sessionId?: SessionId
    readonly product: {
      readonly name: 'Local-Harness-pi'
      readonly version: '0.1.5-alpha.2'
      readonly appId: 'io.localharness.pi'
      readonly officialDisclaimer: string
      readonly dsh: { readonly commit: string; readonly license: 'MIT' }
      readonly pi: { readonly version: '0.85.1'; readonly license: 'MIT' }
      readonly codex: { readonly commit: string; readonly usage: 'design-reference-only' }
      readonly thirdPartyNotices: string
    }
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

- [ ] `product` 只能从 Host-only `@local-harness/product-identity` 生成；`session-controller/package.json` 增加 workspace dependency。测试把 Remote 字段逐项与该包 export 对比，并证明 notice 在离线状态完整可读。response 不得包含本地 notice 路径、MCP command args、env、HTTP headers、credential reference value、tool schema arguments 或工作区文件路径。

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
  git add packages/api/session-controller packages/host/plugin-inventory packages/api/remotes pnpm-lock.yaml
  git commit -m "feat: expose a redacted capability inventory"
  ```

## Task C3：实现 Host-owned MCP 配置与单 server reconcile

**Files:**

- Create: `packages/mcp/mcp-configuration/package.json`
- Create: `packages/mcp/mcp-configuration/tsconfig.json`
- Create: `packages/mcp/mcp-configuration/tsdown.config.ts`
- Create: `packages/mcp/mcp-configuration/README.md`
- Create: `packages/mcp/mcp-configuration/README.i18n.yaml`
- Create: `packages/mcp/mcp-configuration/src/types.ts`
- Create: `packages/mcp/mcp-configuration/src/config.ts`
- Create: `packages/mcp/mcp-configuration/src/reconciler.ts`
- Create: `packages/mcp/mcp-configuration/src/index.ts`
- Create: `packages/mcp/mcp-configuration/tests/config.spec.ts`
- Create: `packages/mcp/mcp-configuration/tests/reconciler.spec.ts`
- Modify: `packages/mcp/mcp-client/package.json`
- Modify: `packages/mcp/mcp-client/src/transport.ts`
- Modify: `packages/mcp/mcp-client/tests/egress.spec.ts`
- Create: `packages/api/mcp-configuration-controller/package.json`
- Create: `packages/api/mcp-configuration-controller/tsconfig.json`
- Create: `packages/api/mcp-configuration-controller/tsdown.config.ts`
- Create: `packages/api/mcp-configuration-controller/README.md`
- Create: `packages/api/mcp-configuration-controller/README.i18n.yaml`
- Create: `packages/api/mcp-configuration-controller/src/types.ts`
- Create: `packages/api/mcp-configuration-controller/src/index.ts`
- Create: `packages/api/mcp-configuration-controller/tests/controller.host.spec.ts`
- Modify: `packages/api/remotes/src/index.ts`
- Modify: `packages/api/remotes/src/remote-events.ts`
- Modify: `packages/api/remotes/src/types.ts`
- Modify: `packages/api/remotes/package.json`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

- [ ] 创建包前先写 config 测试，逐项覆盖 `docs/architecture/interface-contracts.md` 第 20.1 节的输入上界。测试表必须包含：65 个 server、129 个 args、65 个 binding、非法/重复 `serverName`、非法 credential ref、CR/LF prefix、`DSH_` env、shell command 字符串、相对 cwd、HTTP userinfo/query/fragment、远程 HTTP、localhost/loopback IP HTTP、HTTPS、禁止 header 和合法 Authorization credential binding。

- [ ] 不自建 MCP transport/client。MCP config 根据初始 URL 选择共享 `@local-harness/guarded-fetch` policy：loopback HTTP/HTTPS 为 `destination='loopback'`，其他地址只能 HTTPS 且为 `destination='https'`；存在任意 credential-bound header 时 `credentialBound=true`。`mcp-client/package.json` 增加 `@local-harness/guarded-fetch: workspace:*`；`transport.ts` 把 handle.fetch 传给 SDK `StreamableHTTPClientTransport`，fiber dispose 时 await handle.dispose。GUI config validator 复用 guarded-fetch 导出的纯 URL/DNS policy，不另写 `http-url-policy.ts`。MCP 测试复跑共享 policy 的集成子集：loopback/HTTPS、userinfo、同源 307、带 credential 跨源 307、302、第 6 跳、abort 和 response body 关闭；既有 proxy 测试调整为断言模型/MCP 不读取系统 proxy，而 DSH `web_fetch` 自身原 proxy 行为保持不变。

- [ ] 包 manifest 固定为私有 ESM：

  ```json
  {
    "name": "@local-harness/mcp-configuration",
    "version": "0.1.5-alpha.2",
    "private": true,
    "type": "module"
  }
  ```

  `@local-harness/mcp-configuration` 只依赖实际 import 的 DSH settings、credentials、tools、MCP Client、schema 和 `@local-harness/guarded-fetch`；API 包固定为 `@local-harness/api-mcp-configuration-controller@0.1.5-alpha.2`，只依赖 MCP configuration、Typert/Remote 与所需 DSH API 包。两者都不得依赖 Pi package 或 Client UI。为两个新 Host 包各写 DSH 模板要求的 README/README.i18n，运行 `pnpm run doc-sync`；`tsconfig.base.json` 分别增加 `@local-harness/mcp-configuration` 和 `@local-harness/api-mcp-configuration-controller` 的精确 source alias，`tsconfig.host.json` 分别增加 `packages/mcp/mcp-configuration` 和 `packages/api/mcp-configuration-controller` project reference，禁止加入 Client aggregate。

- [ ] 在 `config.ts` 注册且只注册 `SETTINGS_NAMESPACE = 'local-harness.mcp'`。user section 的唯一字段是 `servers: McpManagedServerRecord[]`；base 为 `{ servers: [] }`。Host 生成 id 后对完整 servers array 使用 DSH settings CAS，不另写 JSON/YAML 文件，不把 runtime phase 写回 settings。

- [ ] 先写 reconciler 失败测试，使用真实 DSH Tool Registry 和 mock MCP transport，固定断言：

  - create 保持 disabled，没有 transport；enable 缺 credential 返回 `MCP_CREDENTIAL_MISSING`。
  - enable 后只解析 binding 引用并把 resolved 值传给 DSH MCP Client config；snapshot、logger 和 error 没有该值。
  - update A 只 dispose/remount A，B 的 fiber identity、tool generation 和 active call 不变。
  - 一个 server initial sync 失败时记录 `MCP_APPLY_FAILED`，其他 server 和 builtin tool 仍存在。
  - credential A 更新只重启引用 A 的 server；两个快速 revision 串行，旧 completion 不覆盖新 phase。
  - disable/remove 等待 DSH MCP Client disposal；remove 不调用 `credentials.unset`。

- [ ] `McpConfigurationReconciler` 在 Host root tool scope 挂载 GUI-managed DSH MCP Client，使 Agent child scopes 通过现有 DSH scoped registry 看见 managed tools。内部状态固定为：

  ```ts
  interface AppliedServer {
    readonly id: McpManagedServerId
    readonly configRevision: number
    readonly generation: number
    readonly dispose: () => void | Promise<void>
  }

  const applied = new Map<McpManagedServerId, AppliedServer>()
  const queues = new Map<McpManagedServerId, Promise<void>>()
  ```

  每个 id 的操作链接到自己的 queue；不同 id 可以并行。挂载必须调用现有 `@deepseek-ai/dsh-mcp-client` plugin，不复制 transport、reconnect、tool registration 或 tool execution。增加 real-scope 测试，证明 root managed tool 对两个 Agent scope 可见且 dispose 后同时消失；这是 DSH Tool Registry 的 deployment-global layer 契约，不创建 Agent Preset overlay，也不按 session 建连接或配置副本。

- [ ] API controller 先写失败测试，再逐字实现接口契约第 20.2 节的 `list/create/update/setEnabled/remove/reconnect`。业务拒绝抛 DSH `RemoteError` 的精确 `mcp/*` wire code，Client 只在边界层映射为对应 `MCP_*` semantic code；CAS 在 validation 之后、credential resolve/fiber mutation 之前。`create` 丢弃 Client id 并强制 disabled；rename 未 acknowledge 时拒绝；composition/managed 名称冲突在 commit 前拒绝。

- [ ] mutation 返回时遵守“commit 与 apply 分离”：CAS 失败没有任何运行时变化；CAS 成功后即使连接失败也返回最新 snapshot 和 `application.phase='error'`，不得抛出使 UI 误认为配置未保存。`mcp-configuration/status` Cordis event 只发 `McpServerRuntimeView`，不发 config 或 credential；在 `@deepseek-ai/dsh-api-remotes` 的 forwarded-event allowlist 增加同名 `emit` 项，并用 `TypertRemoteEventSelection` 暴露给 Client。

- [ ] 在 base composition 的 settings、credentials、tools 之后加载 configuration service 和 controller；不要加入默认 server。运行生成和测试：

  ```powershell
  pnpm run build:lib:host
  pnpm run typecheck:contracts-ready
  pnpm vitest run packages/mcp/mcp-configuration/tests packages/api/mcp-configuration-controller/tests packages/mcp/mcp-client/tests
  pnpm run check:local-harness
  ```

  Expected: 全部通过；`git grep -n "@earendil-works/pi" -- packages/mcp/mcp-configuration packages/api/mcp-configuration-controller` 无输出。

- [ ] 提交：

  ```powershell
  git add packages/mcp/mcp-client packages/mcp/mcp-configuration packages/api/mcp-configuration-controller packages/api/remotes packages/bundle/base pnpm-lock.yaml tsconfig.base.json tsconfig.host.json
  git commit -m "feat: add host-owned MCP configuration management"
  ```

## Task C4：补齐 Tools、Skills、MCP、Experimental、About 设置分区

**Files:**

- Create: `packages/client/ui-settings-capabilities/package.json`
- Create: `packages/client/ui-settings-capabilities/tsconfig.json`
- Create: `packages/client/ui-settings-capabilities/tsdown.config.ts`
- Create: `packages/client/ui-settings-capabilities/README.md`
- Create: `packages/client/ui-settings-capabilities/README.i18n.yaml`
- Create: `packages/client/ui-settings-capabilities/src/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/ToolsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/SkillsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpServerDialog.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpCredentialBindingsEditor.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/ExperimentalSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/AboutSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/notices.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/store.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/locales.ts`
- Create: `packages/client/ui-settings-capabilities/tests/apply.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/store.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/sections.client.spec.tsx`
- Modify: `packages/bundle/web-app/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.client.json`

- [ ] 先写 slot registration 测试，断言 section ids 和顺序固定：`models=10`（已有）、`tools=20`、`skills=30`、`mcp=40`、`experimental=90`、`about=100`。全部 copy 经 typed zh/en locale。

- [ ] 新包 manifest 固定使用 `"name": "@local-harness/ui-settings-capabilities"`、`"version": "0.1.5-alpha.2"`、`"private": true`、ESM 和 DSH Client package 的标准 `main/types/exports`。依赖与 peer dependency 以 `ui-settings-plugins` 为模板，只加入实际 import 的 DSH Client/Remote workspace 包；禁止依赖 Host-only `@local-harness/product-identity`。`web-app` 通过 workspace dependency 和现有 Client plugin row 加载它。

  按 `packages/client/AGENTS.md` 和 DSH client package 模板加入 `dsh.client` manifest、`./client` export、client tsdown preset、README/README.i18n；`tsconfig.base.json` 增加 `@local-harness/ui-settings-capabilities` 与 `/client` 精确 aliases，`tsconfig.client.json` 增加唯一 project reference，禁止加入 Host aggregate。运行 `pnpm install` 与 `pnpm run doc-sync`，生成的 README.zh.md 一并提交。

- [ ] 先写 store 测试：同一连接 generation 内 capability、plugin inventory 和 skills 请求 single-flight；Host invalidation/connection reset 刷新；无当前 session 时 Skills/MCP 显示配置状态而不伪造 live tool count。

- [ ] ToolsSection 复用现有 DSH settings scopes 和 `ui-settings-plugins` 的 Bash/Web Search/Agent Loop controllers；抽取并 export 共享 controller，而不是复制一份设置。增加 permission preset、workspace、network 和 MCP 有效权限摘要；完整编辑仍落同一个 Host settings document。V1 将 DSH 已安装执行插件视为受信任源码，基础拒绝继续由 DSH workspace/network/approval/`tools/pre-execute` 策略执行；不新增未执行的便携 manifest 权限字段。

- [ ] SkillsSection 在当前 session 存在时调用既有 `skills/list`，显示来源、model/user invocable、冲突或加载错误；无 session 时给出“打开工作区会话后检查”的状态。不得扫描浏览器文件系统或缓存 `SKILL.md` 正文。

- [ ] McpSection 合并 `mcpConfiguration.list()`、`pluginInventory.list()` 和 `capabilities/list(sessionId)`：composition 行带“由配置提供，只读”标记；managed 行提供 Edit、Enable/Disable、Reconnect、Remove。单个失败不隐藏其他 server。Client store 只保存未提交 draft 与当前 Remote snapshot；connection generation 变化后重读，不写 localStorage/IndexedDB。

  首次启用 stdio 行时，UI 必须显示 executable、分项 args、cwd 和 env reference 名（不显示值）的本地进程风险确认；HTTP 行显示 origin 和 header 名。用户取消时不发出 `setEnabled`；Host 对实际 enable mutation 写入脱敏诊断审计（server id/name、transport 和时间，不含 args、URL path/query、ref/value），不写入 Session。

- [ ] McpServerDialog 固定使用结构化字段而非 command line textarea。新建默认 disabled；transport 切换清除另一 arm 的字段；args 每行一个数组项。credential editor 每行编辑 env/header 名、credential reference 和公开 prefix，secret value 只通过既有 `credentials.set(ref, value)` 单向提交，页面只显示 configured/source/writable。

- [ ] 保存和错误交互必须逐项测试：CAS conflict 保留 draft 并显示 Reload/Compare，不自动重试；rename 显示工具名变化警告并在第二次确认时传 `acknowledgeToolRename=true`；apply error 显示“配置已保存，连接失败”及 Reconnect；remove 明确提示 credential 不会删除；缺 credential 时 Enable disabled 并聚焦对应 binding。

- [ ] ExperimentalSection V1 只显示明确关闭的未来能力说明，不提供 Qwen Code 内核、Office 编辑、完整浏览器自动化或自动安装开关。

- [ ] AboutSection 只读取 `capabilities/list` 的 `product` Remote 投影，离线显示产品版本、固定 DSH/Pi/Codex reference 信息和 DSH/Pi MIT 正文；`notices.ts` 只负责把 `product.thirdPartyNotices` 分段用于 UI，不声明版本常量、不读取本地路径。Host 测试已经负责与 `apps/desktop/resources/THIRD_PARTY_NOTICES.txt` 的权威 export 对比，Client 测试只验证渲染。外链使用安全 external-open 组件；没有网络时许可正文仍可展开。

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
  git add packages/client/ui-settings-capabilities packages/client/ui-settings-plugins packages/bundle/web-app pnpm-lock.yaml tsconfig.base.json tsconfig.client.json
  git commit -m "feat: add capability-focused settings sections"
  ```

## Task C5：增加设置导航 service 和 Composer “+”能力菜单

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

## Task C6：收紧工具卡和 transient-to-durable 收敛

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

## Task C7：验证复用能力和完整产品工作流

**Files:**

- Modify tests: `apps/web/tests/goal-bar.e2e.ts`
- Modify tests: `apps/web/tests/plan-control-row.e2e.ts`
- Modify tests: `apps/web/tests/skill-user-invoke.e2e.ts`
- Create: `apps/web/tests/mcp-tool-through-pi.e2e.ts`
- Create: `apps/web/tests/mcp-configuration.e2e.ts`
- Modify tests: `apps/web/tests/document-preview.e2e.ts`
- Create: `apps/web/tests/web-tools-through-pi.e2e.ts`
- Create: `apps/web/tests/session-library-through-pi.e2e.ts`
- Create: `apps/web/tests/diff-through-pi.e2e.ts`
- Modify tests: `apps/web/tests/message-actions.e2e.ts`
- Modify tests: `apps/web/tests/chat-continuous-conversation.e2e.ts`
- Modify tests: `apps/web/tests/queue-actions.e2e.ts`
- Modify tests: `apps/web/tests/steering.e2e.ts`
- Modify tests: `apps/web/tests/message-feedback.e2e.ts`
- Modify tests: `apps/web/tests/pwsh-terminal.e2e.ts`
- Modify tests: `apps/web/tests/navigation-panes.e2e.ts`
- Modify tests: `apps/web/tests/workspace-management.e2e.ts`
- Modify: `packages/bundle/web-app/cordis.patch.yml`

- [ ] Goal test断言 `/goal` 和 Plus 入口都产生同一 `goal/change` projection；恢复后 GoalBar 一致。

- [ ] Plan test断言进入 `/plan` 后下一 step 的 DSH tool schema 已受限制，Plus 菜单显示退出状态，`/plan off` 后恢复；不读取 Pi state。

- [ ] Skill test断言现有 progressive disclosure：目录列表不把全部 SKILL.md 放进 prompt，选中后才读取正文；Pi 只收到 DSH assembled context。

- [ ] 在 `packages/bundle/web-app/cordis.patch.yml` 中将已有 `session-query-sqlite` 行精确改为 `path: !!js dshHomePath('session-search.db')` 和 `openAt: first-search`。不修改 base bundle 的 `openAt: never`，以免把桌面产品选择扩散到 CLI/其他 profile；测试 scaffold 可继续显式覆盖为 `:memory:`。

- [ ] MCP test 启动 DSH 自带 fixture server，经 DSH MCP Client 注册 `mcp__*` tool，经 Pi tool wrapper 调用，最后 Session 中仍是 DSH `tool/call`/`tool/result`。

- [ ] MCP configuration E2E 按 AC-009 固定执行：create disabled stdio -> credential set -> enable -> call -> add HTTP -> make stdio fail -> HTTP/builtin 仍可用 -> stale revision update -> acknowledged rename -> reconnect -> remove。每一步都断言 Host snapshot、当前 Agent tool schema 和 DSH Session 历史；测试 secret 不能出现在 DOM、Remote snapshot、日志或 Session。

- [ ] Session library E2E 只复用 DSH commands/UI：首个完成 turn 生成且只生成一次 `session/title`、手工 rename 后重启且不被自动标题覆盖、首次正文查询触发 `first-search`、archive 后默认列表隐藏、archive filter 恢复、fork 的最后 event 是平衡 turn、Header 与 `/export` 内容一致。破坏 SQLite 后会话仍能直接打开，重建失败不改变 Session available 状态。

- [ ] 保留 DSH 已有日常会话交互回归：`message-actions` 的 copy/只在完成 turn 分叉，`chat-continuous-conversation` 的连续多 turn，`queue-actions` 的队列编辑，`steering` 的 next-step，以及 `message-feedback` 的用户反馈。这些测试在新默认组合下运行；不得为了通过而指回 ReactLoopAgent。

- [ ] Diff/Terminal 回归：用 Pi 调用 patch 和 PowerShell，Diff card 显示 durable file delta，Terminal card/`pwsh-terminal.e2e.ts` 显示退出码、截断和取消；刷新后从 durable event 恢复，不依赖 Pi runtime frame。

- [ ] PDF test只验证附件引用和预览，明确没有编辑按钮。Web test验证 `web_fetch`/`web_search` 仍进入 DSH egress/approval；不引入 Playwright/Computer-use 产品依赖。

- [ ] 运行能力 E2E。

  Run:

  ```powershell
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/goal-bar.e2e.ts apps/web/tests/plan-control-row.e2e.ts apps/web/tests/skill-user-invoke.e2e.ts apps/web/tests/mcp-tool-through-pi.e2e.ts apps/web/tests/mcp-configuration.e2e.ts apps/web/tests/document-preview.e2e.ts apps/web/tests/web-tools-through-pi.e2e.ts apps/web/tests/session-library-through-pi.e2e.ts apps/web/tests/diff-through-pi.e2e.ts apps/web/tests/message-actions.e2e.ts apps/web/tests/chat-continuous-conversation.e2e.ts apps/web/tests/queue-actions.e2e.ts apps/web/tests/steering.e2e.ts apps/web/tests/message-feedback.e2e.ts apps/web/tests/pwsh-terminal.e2e.ts apps/web/tests/navigation-panes.e2e.ts apps/web/tests/workspace-management.e2e.ts
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add apps/web/tests packages/bundle/web-app/cordis.patch.yml
  git commit -m "test: prove DSH capabilities through the Pi loop"
  ```

## Task C8：把 Alpha 更新改为手动检查和手动下载

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

## Task C9：完成 Windows V1 E2E、发布证据和 Draft PR

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

- [ ] Desktop E2E 运行真实 Electron + mock OpenAI server，覆盖：首次模型 onboarding、打开/reopen workspace、创建/重命名/搜索/归档/恢复/分叉/导出 session、流式 reply、审批 allow/deny、Diff、Terminal、steer、queue、cancel、Goal、Plan、Skill、MCP 图形化配置与调用、附件、PDF 预览、About/离线许可、退出恢复。

- [ ] 测试直接终止 Host 进程验证三类 durability barrier；重启后从 DSH Session 打开。断言 SQLite 缺失时正文仍可打开，重建后搜索恢复；使用小 window mock 完成 AC-010 automatic/context-overflow/manual compaction 三条路径。

- [ ] 增加 `measure-local-harness-v1.ts`：同一 mock provider、固定工作区和硬件上分别启动固定 DSH root 与候选 root。冷启动和首个 Host assistant delta 到 DOM 呈现延迟每组预热 2 次、采样 10 次；进程树空闲内存在 ready 后无任务 60 秒时采集 Electron + Host 全部子进程 working set，每组 5 次；1000 会话列表用同一可重复 fixture 生成器写入两个独立 DSH_HOME，从 Session Query 请求开始到列表 DOM 稳定采样 10 次。不从用户 profile 复制数据。

  输出 JSON 必须包含两端 commit、Node/Electron/Windows 版本、原始样本和四项阈值结论；冷启动中位数回退超过 15%、附加延迟超过 100ms、空闲进程树内存回退超过 20%，或 1000 会话列表中位数回退超过 15% 时退出非零。单元测试用确定时钟/进程样本验证 median、进程树求和、阈值和 JSON 脱敏。

  `package.json` 增加固定入口：

  ```json
  {
    "scripts": {
      "benchmark:local-harness:v1": "tsx scripts/measure-local-harness-v1.ts"
    }
  }
  ```

  脚本启动前必须验证 baseline root 的 HEAD 等于固定 DSH hash、两个 root 的 build artifacts 均存在，缺失时给出构建命令并退出，不自动安装依赖或下载文件。

- [ ] Desktop E2E 使用唯一 marker 文本覆盖诊断日志脱敏：默认日志、错误、redacted diagnostic export 和 release evidence 不得出现 API key、MCP credential、最终 HTTP header、prompt、assistant 正文、工具 raw output、文件内容或附件字节。完整 Session export 属于用户明确选择的内容导出，必须先显示内容警告，不把它错误断言为脱敏包。另验证 capability stores、MCP per-id reconcile queue、tool commit buffer、listener queues 有明确上界，cancel/dispose 后没有 timer、subscriber、MCP child process 或 Session write handle 泄漏。

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
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64
  git diff --check
  ```

- [ ] 在干净 Windows 11 x64 环境先校验 NSIS 文件 SHA-256，完成安装 -> 首次启动 -> 本地和云端 model smoke -> 退出 -> 卸载，并确认用户选定的 workspace 文件未被卸载器删除。只把结果、artifact hash、模型 id、route 类型和时间写入 checklist，不记录 baseURL query、headers 或 key；checklist 明示该 Alpha 未签名及可能的 SmartScreen 警告。

- [ ] 提交证据、推送并创建 Draft PR。

  Run:

  ```powershell
  git add apps/desktop/tests/v1-product-flow.e2e.ts scripts/measure-local-harness-v1.ts scripts/tests/measure-local-harness-v1.spec.ts package.json docs/release README.md .agents/notes/architecture/2026-09-10-v1-client-capability-surfaces.md
  git commit -m "test: complete the Local-Harness-pi V1 product flow"
  git push -u origin pr-c/v1-product-loop
  gh pr create --draft --title "feat: complete the Local-Harness-pi V1 desktop flow" --body-file .\.github\pull_request_template.md
  ```

  不得在本步骤自动合并 PR 或创建公开 Release；由项目所有者审阅三个检查点后决定。

## PR-C 工期与交接门禁

- 预计净工作量：7–9 个工作日，约 1.0–1.4 个 GPT-5.6 Sol Plus 完整周额度；其中共享 guarded-fetch 和模型/MCP 两端接线约 1–1.5 日，已取代原本两份重定向实现，不再另加重复工期。
- Day 1：C1；Day 2：C2；Day 3–4：C3 Host MCP；Day 4–5：C4–C5 UI；Day 5–7：C6–C8；Day 7–9：C9、Windows 包和修复。任务有重叠日只表示同一工作日内顺序切换，不授权平行修改同一文件。
- C3 是最长风险项：若 CAS、credential redaction、单 server reconcile 或 root-scope visibility 任一测试失败，不得通过改成浏览器本地配置、每 session 配置或 Pi MCP Client 绕过。
- 可结束条件：AC-001–AC-010、TEST-005/006、Windows unpacked 与未签名 NSIS 安装/卸载 smoke、四项性能门禁和完整发布门禁通过，Draft PR 描述列出实际模型 smoke 与所有已知限制。
