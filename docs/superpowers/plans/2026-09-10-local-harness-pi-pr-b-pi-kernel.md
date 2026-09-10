# PR-B Pi Kernel Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@earendil-works/pi-agent-core@0.85.1` 驱动 DSH Agent，但继续由 DSH 拥有 Session、LLM、Tools、Approval、Prompt、Goal/Plan、Skill 和 MCP，并通过契约测试证明单一会话事实源与崩溃屏障。

**Architecture:** 新增私有包 `@local-harness/pi-agent-loop`。包内以 `KernelDriver` 隔离 Pi 类型，以 `SessionCommitPort`、`DshModelStreamBridge`、`DshToolBridge` 连接 DSH 服务。一次 Pi run 等于一个 DSH turn；Pi turn 等于 DSH step；DSH next-turn 不进入 Pi follow-up queue。

**Tech Stack:** TypeScript、Cordis、Vitest、DSH Agent/Session/LLM/Tools APIs、`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`。

---

## 上游复读清单

开工前完整阅读：

- DSH：`packages/core/agent/src/index.ts`、`runtime-types.ts`；`packages/core/agent-loop/src/index.ts`、`agent.ts`、`inbox.ts`、`assistant-stream.ts`、`runtime-context.ts`、`tool-calls.ts`、全部 tests；`packages/core/tools/src/index.ts`；`packages/session/session-persistence/src/handle.ts`；JSONL persistence、projection 和 interrupted-turn repair；`packages/llm/llm-pi-ai/src/adapter.ts`、`context.ts`、`stream.ts`；`packages/api/session-controller/src/commands.ts`。
- Pi：`packages/agent/src/agent.ts`、`agent-loop.ts`、`types.ts`、对应 tests；`packages/ai/src/utils/event-stream.ts` 和 OpenAI Responses/Completions event implementations。
- Codex：只复核审批/工具调用和会话完成的安全边界，不复制运行时代码。

## Task B1：创建 Pi loop 私有包并锁死依赖边界

**Files:**

- Create: `packages/core/agent-loop-pi/package.json`
- Create: `packages/core/agent-loop-pi/tsconfig.json`
- Create: `packages/core/agent-loop-pi/tsdown.config.ts`
- Create: `packages/core/agent-loop-pi/README.md`
- Create: `packages/core/agent-loop-pi/README.zh.md`
- Create: `packages/core/agent-loop-pi/README.i18n.yaml`
- Create: `scripts/verify-pi-kernel-boundary.ts`
- Create: `scripts/tests/verify-pi-kernel-boundary.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

- [ ] 从已合入的 PR-A 主线创建分支。

  Run: `git switch -c pr-b/pi-kernel`

- [ ] 先写 boundary verifier 的失败测试。测试向临时 source tree 分别放入以下 import，并断言拒绝：

  ```ts
  import '@earendil-works/pi-agent-core/harness/session'
  import '@earendil-works/pi-agent-core/harness/context'
  import '@earendil-works/pi-agent-core/harness/runtime/reducer'
  ```

  再断言根入口 `@earendil-works/pi-agent-core` 只允许出现在 `packages/core/agent-loop-pi/src/pi-kernel-driver.ts` 和该包测试中；Client、Session schema、Tool、LLM 包不得 import 它。

- [ ] 运行失败测试。

  Run: `pnpm vitest run scripts/tests/verify-pi-kernel-boundary.spec.ts`

- [ ] 创建 package manifest。使用 `packages/core/agent-loop/package.json` 的 DSH peer dependency 集，增加：

  ```json
  {
    "name": "@local-harness/pi-agent-loop",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "lib/index.js",
    "types": "lib/types/index.d.ts",
    "dependencies": {
      "@earendil-works/pi-agent-core": "0.85.1",
      "@earendil-works/pi-ai": "0.85.1"
    }
  }
  ```

  保留 DSH 包中的 `@deepseek-ai/dsh-brand`、`dsh-util-values`、Schemastery、Zod 依赖。不得加入 Pi CLI、coding-agent 或 harness 子路径。

- [ ] 在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 增加精确 `@earendil-works/pi-agent-core@0.85.1`；运行 `pnpm install` 更新 lockfile。

- [ ] root `package.json` 增加：

  ```json
  {
    "scripts": {
      "check:local-harness:kernel": "tsx scripts/verify-pi-kernel-boundary.ts",
      "check:local-harness": "pnpm run check:local-harness:sources && pnpm run check:local-harness:kernel"
    }
  }
  ```

- [ ] 运行测试和精确依赖检查。

  Run:

  ```powershell
  pnpm vitest run scripts/tests/verify-pi-kernel-boundary.spec.ts
  pnpm run check:local-harness
  pnpm why @earendil-works/pi-agent-core
  ```

  Expected: verifier 通过；生产根入口只有新包；版本为 `0.85.1`。

- [ ] 提交。

  Run:

  ```powershell
  git add packages/core/agent-loop-pi scripts/verify-pi-kernel-boundary.ts scripts/tests/verify-pi-kernel-boundary.spec.ts package.json pnpm-workspace.yaml pnpm-lock.yaml
  git commit -m "build: add the pinned Pi kernel package"
  ```

## Task B2：定义内核无关契约和可复用 conformance suite

**Files:**

- Create: `packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts`
- Create: `packages/core/agent-loop-pi/tests/mock-kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] 先写 conformance cases：事件严格串行 await、首事件必须 `run.started`、step 平衡、tool start/end 配对、`run.completed` 最后、第二个并发 run 拒绝、abort 幂等且第一次原因获胜。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] 实现 `kernel-driver.ts`，逐字遵循 `docs/architecture/interface-contracts.md` 第 4–5 节。核心 public face 固定为：

  ```ts
  export type KernelId = 'pi'

  export interface KernelEventSink {
    onEvent(event: KernelEvent, signal: AbortSignal): Promise<void>
  }

  export interface KernelRun {
    readonly runId: RunId
    readonly settled: Promise<KernelRunResult>
    abort(reason: unknown): void
  }

  export interface KernelDriver {
    readonly descriptor: KernelDescriptor
    start(input: KernelRunInput, sink: KernelEventSink): KernelRun
  }
  ```

  `KernelEvent` 使用 `run.started`、`step.started`、`message.started/delta/completed`、`tool.started/progress/completed`、`step.completed`、`run.completed`；此文件不得 import Pi 类型。

- [ ] Mock driver 复用同一个 ordered dispatch：

  ```ts
  for (const event of events) {
    if (signal.aborted) break
    await sink.onEvent(event, signal)
  }
  ```

  `settled` 必须在最后一次 `onEvent` resolve 后完成。

- [ ] 运行测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] 提交。

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/kernel-driver.ts packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts packages/core/agent-loop-pi/tests/mock-kernel-driver.ts packages/core/agent-loop-pi/tests/kernel-driver.spec.ts
  git commit -m "feat: define the kernel driver contract"
  ```

## Task B3：实现 DSH/Pi 消息转换与每 step 上下文重建

**Files:**

- Create: `packages/core/agent-loop-pi/src/message-conversion.ts`
- Create: `packages/core/agent-loop-pi/src/step-preparer.ts`
- Test: `packages/core/agent-loop-pi/tests/message-conversion.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/step-preparer.spec.ts`

- [ ] 先写 round-trip fixtures：Unicode、空文本、reasoning、多图片引用、嵌套 tool arguments、并行 tool calls、error tool result。断言 block 顺序、messageId、callId、provider/model/usage 不丢失。

- [ ] 先写 step preparation 测试：每次都从 DSH Session surface 重新投影；DSH `agent/pre-step` reject 时没有 `step/start` 和模型调用；设置变化只影响下一 step。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts`

- [ ] 实现显式转换函数，不用 JSON stringify 整条 message 偷换类型：

  ```ts
  export function toPiMessages(messages: readonly DshMessage[]): AgentMessage[]
  export function fromPiMessage(message: AgentMessage): DshMessage
  export function toolArguments(raw: string): unknown
  ```

  `toolArguments` 解析失败返回 `KERNEL_MESSAGE_CONVERSION`；不得丢弃坏 block 后继续。

- [ ] 实现 `StepPreparer.prepare()` 固定顺序：claim DSH Inbox -> assemble System Prompt/tools -> `agent/pre-step` -> freeze model/tool/context -> 返回 `PreparedKernelStep`。对 context、tools、model 和 message arrays 做防御性复制及深冻结。

- [ ] 运行测试并提交。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts
  git add packages/core/agent-loop-pi/src/message-conversion.ts packages/core/agent-loop-pi/src/step-preparer.ts packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts
  git commit -m "feat: rebuild Pi context from DSH session state"
  ```

## Task B4：实现 DSH-owned 模型流桥

**Files:**

- Create: `packages/core/agent-loop-pi/src/model-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/stream-conversion.ts`
- Test: `packages/core/agent-loop-pi/tests/model-bridge.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/stream-conversion.spec.ts`

- [ ] 先写失败测试：text、reasoning、tool-call arguments delta、usage、stop/tool-calls/max-tokens/error/aborted；源流无 terminal finish 时必须生成 `MODEL_STREAM_CLOSED`；一次 step 内设置变更不改变冻结 route。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts`

- [ ] `DshModelStreamBridge.resolve()` 只通过 DSH model selection 和 LLM catalog 返回 `FrozenModelSelection`。`stream()` 固定调用 `agent/request`、`llm.prepareCall()` 和 DSH retry path，不直接读取 settings 文件或 credential store。

- [ ] 使用 `createAssistantMessageEventStream()` 构建 Pi stream。转换 producer 必须捕获所有错误并推入 terminal `error` event；不得让 `StreamFn` reject：

  ```ts
  const stream = createAssistantMessageEventStream()
  void pumpDshChunks(prepared, stream, signal).catch(error => {
    stream.push({ type: 'error', error: failureAssistantMessage(error, prepared.model) })
  })
  return stream
  ```

  `pumpDshChunks` 对 DSH `block-start`/delta/`block-end`/usage/finish 建立 Pi partial message；terminal finish 只 push 一次 `done` 或 `error`。

- [ ] 证明 credential 只由 DSH prepared call 内部解析，测试快照和错误中不出现 key。

- [ ] 运行测试并提交。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts
  git add packages/core/agent-loop-pi/src/model-bridge.ts packages/core/agent-loop-pi/src/stream-conversion.ts packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts
  git commit -m "feat: route Pi model streams through DSH LLM"
  ```

## Task B5：实现工具桥和副作用前 durability barrier

**Files:**

- Create: `packages/core/agent-loop-pi/src/tool-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/tool-commit-buffer.ts`
- Test: `packages/core/agent-loop-pi/tests/tool-bridge.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts`

- [ ] 先写失败测试，覆盖：schema snapshot、未知工具、坏参数、approval allow/deny、timeout、cancel、工具 throw、`additionalContexts`、`concludesTurn`、两个并行工具反序完成但源序提交。

- [ ] 添加严格时序测试：在工具 body 的第一行记录 marker；断言 marker 之前已经发生 `commitToolCall` 和 `flush('before-tool-effect')`。让 flush reject，断言 body 从未执行。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts`

- [ ] `snapshot()` 深冻结 `ctx.tools.schemas(agent)`。Pi wrapper 的 `execute` 只调用：

  ```ts
  ctx.tools.execute({
    callId: call.callId,
    name: call.name,
    arguments: call.arguments,
    agent,
    signal,
  })
  ```

  禁止调用 `ToolDefinition.execute()`，禁止在 Pi hooks 重做审批。

- [ ] 在 Pi `tool_execution_start` 的 awaited sink 中：append `tool/call` -> 保存 call seq -> await `flush('before-tool-effect')` -> 允许 wrapper body 继续。完整 DSH result 缓存到 callId；Pi content/details 只是运行格式。

- [ ] `ToolCommitBuffer` 只有同时收到执行完成和 toolResult `message_end` 才可 drain；从最小未提交 sourceIndex 连续输出；step end 调用 `assertEmptyAtStepEnd()`。

- [ ] 运行测试并提交。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts
  git add packages/core/agent-loop-pi/src/tool-bridge.ts packages/core/agent-loop-pi/src/tool-commit-buffer.ts packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts
  git commit -m "feat: execute Pi tools through the DSH pipeline"
  ```

## Task B6：实现 SessionCommitPort 和事件状态机

**Files:**

- Create: `packages/core/agent-loop-pi/src/session-commit.ts`
- Create: `packages/core/agent-loop-pi/src/event-projector.ts`
- Create: `packages/core/agent-loop-pi/src/invariant.ts`
- Test: `packages/core/agent-loop-pi/tests/session-commit.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/event-projector.spec.ts`

- [ ] 先写事件状态机失败矩阵：缺 run start、嵌套 step、双 assistant complete、未知 call result、step 未清空 tool buffer、run complete 后还有 event、重复 event index。

- [ ] 先写 durable 映射测试：assistant delta 只发布 transient；assistant complete 追加一次 durable message；tool result 的 `sourceEventSeqs` 精确为对应 call seq；run complete 追加 turn/end 后 flush。

- [ ] 运行失败测试。

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts`

- [ ] `SessionCommitPort` 只包装 AgentFactory 已有的 DSH Session 和 write handle：

  ```ts
  async flush(reason: FlushReason, signal?: AbortSignal): Promise<void> {
    try {
      await this.write.flush(signal)
    } catch (cause) {
      throw stableFailure('SESSION', 'SESSION_WRITE_FAILED', reason, cause)
    }
  }
  ```

  不创建文件、不持有 SQLite、不另存 event。每个 `(runId,eventIndex)` 有一次性提交 ledger；重复直接抛 `KERNEL_EVENT_ORDER`。

- [ ] `EventProjector.onEvent()` 使用 closed-union switch。`message.delta` 发布 DSH `agent/assistant-stream`；`message.completed` 和 tool results 才 append；`run.completed` 的顺序固定为 append turn/end -> `flush('turn-settled')` -> 发布 idle。

- [ ] 运行测试并提交。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts
  git add packages/core/agent-loop-pi/src/session-commit.ts packages/core/agent-loop-pi/src/event-projector.ts packages/core/agent-loop-pi/src/invariant.ts packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts
  git commit -m "feat: commit Pi events to the DSH session log"
  ```

## Task B7：实现 PiKernelDriver

**Files:**

- Create: `packages/core/agent-loop-pi/src/pi-kernel-driver.ts`
- Test: `packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts`
- Modify: `packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts`

- [ ] 让同一 conformance suite 分别运行 MockKernelDriver 和 PiKernelDriver；先确认 Pi 实现失败。

- [ ] 构造 Pi `Agent` 时显式传入 DSH model `streamFn`、DSH tool wrappers、`steeringMode: 'one-at-a-time'`、`followUpMode: 'one-at-a-time'`。`getFollowUpMessages` 的产品语义必须始终为空；DSH next-turn 在外层开新 run。

- [ ] 使用 async subscriber 串行桥接：

  ```ts
  const unsubscribe = piAgent.subscribe(async (event, signal) => {
    await sink.onEvent(toKernelEvent(event, positions), signal)
  })
  ```

  run cleanup 必须在 `piAgent.prompt()` settle、最后一个 listener settle 和 unsubscribe 后完成。`abort()` 同时中止 provider 和已开始工具。

- [ ] 对 Pi sourceIndex 以 assistant toolCall block 顺序计算，不以 `tool_execution_end` 完成顺序计算。

- [ ] 运行测试和 boundary gate。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts
  pnpm run check:local-harness:kernel
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/pi-kernel-driver.ts packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts
  git commit -m "feat: drive DSH turns with Pi Agent Core"
  ```

## Task B8：接入 DshPiAgent 生命周期、Inbox 和消息确认屏障

**Files:**

- Create: `packages/core/agent/src/durability.ts`
- Modify: `packages/core/agent/src/index.ts`
- Create: `packages/core/agent-loop-pi/src/inbox.ts`
- Create: `packages/core/agent-loop-pi/src/pi-agent.ts`
- Modify: `packages/api/session-controller/src/commands.ts`
- Modify: `packages/api/session-controller/package.json`
- Test: `packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- Create: `packages/api/session-controller/tests/commands-durability.host.spec.ts`

- [ ] 在 core Agent 定义实现无关端口：

  ```ts
  export type AgentFlushReason = 'message-ack' | 'before-tool-effect' | 'turn-settled'

  export abstract class AgentDurability extends Service {
    abstract flush(sessionId: SessionId, reason: AgentFlushReason, signal?: AbortSignal): Promise<void>
  }
  ```

  Agent Loop Pi 提供该 service 并把 sessionId 路由到唯一 write handle；API 只依赖 core Agent 定义，不依赖 Pi package。

- [ ] 复制固定 DSH `inbox.ts` 的持久 splice 行为并只做命名空间调整；保持 `replace/remove`、claim、wakeup 和投影语义。

- [ ] 先写 `DshPiAgent` 测试：followup -> next-turn；steer/inject -> next-step；running 时没有第二 run；cancel 等待工具 quiescence；`whenIdle()` 包含取消收尾；maintenance 与 run 互斥。

- [ ] 在 `ApiSessionCommands.prompt()` 中，`agent.followup/steer(message)` 与 file binding commit 完成后，必须：

  ```ts
  await this.ctx.agentDurability.flush(agent.id, 'message-ack')
  return { accepted: true }
  ```

  幂等 `requestId` 命中已存在 prompt 时必须确认对应 splice 已持久；flush reject 映射 `session/write-failed`，不能返回 accepted。

- [ ] 运行测试并提交。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
  git add packages/core/agent/src/durability.ts packages/core/agent/src/index.ts packages/core/agent-loop-pi/src/inbox.ts packages/core/agent-loop-pi/src/pi-agent.ts packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/api/session-controller/src/commands.ts packages/api/session-controller/package.json packages/api/session-controller/tests/commands-durability.host.spec.ts
  git commit -m "feat: preserve DSH inbox semantics around Pi runs"
  ```

## Task B9：复用 AgentFactory 创建/恢复事务并切换默认组合

**Files:**

- Create: `packages/core/agent-loop-pi/src/index.ts`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Test: `packages/core/agent-loop-pi/tests/apply.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/lifecycle.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/recovery.spec.ts`
- Modify: `scripts/verify-pi-kernel-boundary.ts`

- [ ] 从固定 DSH `agent-loop/src/index.ts` 逐段复用 SessionPreparation、write handle、scope setup/commit、registry publish、created/disposed pairing 和逆序 rollback；只把 `ReactLoopAgent` 构造替换为 `DshPiAgent`。

- [ ] 先写创建失败点参数化测试：Session prepare、write ownership、scope setup、seed append、session register、agent register、created listener。每个失败点断言无泄漏 handle/scope/registry entry。

- [ ] 先写恢复测试：只从 committed DSH prefix 恢复；调用 `interruptedTurnClosers`；开放 tool call 收敛为 `TOOL_OUTCOME_UNKNOWN`，绝不重新执行；Pi state/messages 没有恢复入口。

- [ ] 替换 base dependency：

  ```json
  "@local-harness/pi-agent-loop": "workspace:*"
  ```

  删除 base 对 `@deepseek-ai/dsh-agent-loop` 的生产依赖，但保留原 package 源码和测试供上游对照。`cordis.patch.yml` 同一位置改为：

  ```yaml
  - id: agent-loop
    name: '@local-harness/pi-agent-loop'
  ```

- [ ] boundary verifier 解析 base patch，断言活动 `AgentFactory` 恰好一个且名称为新包；同时解析 production lock graph，拒绝 Pi harness 子路径和第二 Agent Loop dependency。

- [ ] 运行测试。

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run build:lib
  ```

- [ ] 提交。

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/index.ts packages/core/agent-loop-pi/tests/apply.spec.ts packages/core/agent-loop-pi/tests/lifecycle.spec.ts packages/core/agent-loop-pi/tests/recovery.spec.ts packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml scripts/verify-pi-kernel-boundary.ts
  git commit -m "feat: activate Pi as the only DSH agent loop"
  ```

## Task B10：完成 mock OpenAI、工具与恢复集成矩阵

**Files:**

- Create: `packages/core/agent-loop-pi/tests/fixtures/openai-compatible-server.ts`
- Create: `packages/core/agent-loop-pi/tests/pi-loop.integration.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/crash-recovery.e2e.ts`
- Create: `packages/core/agent-loop-pi/tests/contract-matrix.spec.ts`
- Create: `.agents/notes/architecture/2026-09-10-pi-kernel-session-ownership.md`
- Modify: `packages/core/agent-loop-pi/README.md`
- Modify: `packages/core/agent-loop-pi/README.zh.md`

- [ ] Mock server 实现 Responses 与 Chat Completions 两个显式 endpoint，只绑定 `127.0.0.1` 随机端口；支持文本 delta、tool call、反序工具、429/500、流中断、取消。

- [ ] 集成矩阵至少覆盖需求 `TEST-002`、`TEST-003`、`TEST-004` 的内核相关项。每个用例最终断言 DSH Session event prefix，而不是 Pi 内存 messages。

- [ ] crash harness 用子进程和明确 barrier marker 终止进程；父进程恢复后断言：确认过的消息存在、未确认消息可以不存在、started-without-result 工具为 unknown、无副作用自动重放、turn/step 平衡。

- [ ] Agent Note 记录 Pi 事件与 DSH turn/step 映射、三个 flush barrier、tool result 重排、为何 Pi follow-up queue 不承载 DSH next-turn。

- [ ] 运行完整 PR-B 门禁。

  Run:

  ```powershell
  pnpm run check:local-harness
  pnpm vitest run packages/core/agent-loop-pi/tests packages/api/session-controller/tests/commands-durability.host.spec.ts
  pnpm run test:snapshot
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run build
  git diff --check
  ```

  Expected: 全部通过；无密钥；没有 Pi Session 文件或第二个聊天数据库。

- [ ] 提交文档、推送并创建 Draft PR。

  Run:

  ```powershell
  git add packages/core/agent-loop-pi .agents/notes/architecture/2026-09-10-pi-kernel-session-ownership.md
  git commit -m "test: prove Pi and DSH lifecycle conformance"
  git push -u origin pr-b/pi-kernel
  gh pr create --draft --title "feat: replace the DSH loop with the Pi kernel driver" --body-file .\.github\pull_request_template.md
  ```

## 可选拆分规则

只有触发主计划阈值时才拆：

- B1：Task B1–B4，提交 KernelDriver、消息与 DSH 模型流，但不激活默认组合。
- B2：Task B5–B10，提交工具/Session/AgentFactory 并切换默认组合。

B1 的 public type 仍只在私有 package 内；B1 不得让半成品包进入 base composition。B2 必须基于 B1，不允许平行修改同一 bridge 文件。
