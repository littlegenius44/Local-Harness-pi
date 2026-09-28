# PR-B 最简串行 Pi 内核实施计划

[English](2026-09-27-local-harness-pi-pr-b-minimal-serial.md) | 中文

> **给自主执行 Agent：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，逐项执行本文计划。所有步骤都用 checkbox（`- [ ]`）跟踪。

**目标：** 用 Pi Agent Core 替换默认 DSH conversational loop，同时由 DSH 唯一负责 Agent 生命周期、Session、LLM、工具、审批、Prompt 组装和崩溃恢复；V1 工具只串行执行，全部实现固定为四个提交。

**架构：** `PiAgentLoop` 继承 PR-A 的 `AgentLoop`，只覆盖 `createMachine()`。`DshPiAgent` 实现 DSH Agent 契约并启动窄接口 `KernelDriver`；`PiKernelDriver` 直接调用 Pi 低层 `runAgentLoop()`，固定 `toolExecution: 'sequential'`，因此不产生第二套 Pi 队列或持久 transcript。持久性直接复用 DSH 现有 `ctx.sessions.flush(session)` 与 `session-checkpoint-policy`；PR-B 只补消息 ACK 和 turn settled 两个 await 点。

**技术栈：** TypeScript、Cordis、Vitest、DSH Agent/Session/LLM/Tools API、`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`、pnpm 11.7.0。

---

## 已确认范围和非目标

项目所有者于 2026-09-27 确认以下缩减：

- Pi V1 工具调用始终串行；`KernelDescriptor.capabilities.parallelTools` 固定为 `false`，`maxParallelToolCalls` 不改变 Pi 执行。
- 并行 dispatch、完成顺序事件、源顺序重排 buffer 及其 crash matrix 移至 V1.1 的 `PARALLEL-110`。
- 直接使用 Pi 低层 `runAgentLoop()`；不得实例化有状态 Pi `Agent`，不得使用其 steering/follow-up queue，不得 import Pi Harness。
- 不新增 `AgentDurability`、`SessionDurabilityPort`、write-handle router 或 `ToolCommitBuffer`。
- 不新增 OpenAI mock server；单元测试使用 DSH adapter double，最后一个 smoke case 复用现有 `llm-pi-ai` mock 基础设施。
- 只在 machine 测试内保留一个很小的 fake `KernelDriver`；没有第二内核前，不建设可复用的多内核 conformance framework。

PR-B 仍必须证明：默认组合只有一个 AgentFactory；DSH 是唯一恢复事实源；三类 durability barrier 有效；DSH 工具完整策略链以串行方式执行；取消与 Compaction generation 刷新正确；生产依赖不含 Pi Harness。

## 开工前源码重读

编辑代码前先记录 `AGENTS.md` 中的固定 hash，然后完整阅读且只阅读以下相关文件：

- DSH：`docs/cookbook/adding-a-package.md`；`packages/core/agent-loop/src/index.ts`、`agent.ts`、`inbox.ts`、`assistant-stream.ts`、`runtime-context.ts`；`packages/core/tools/src/index.ts`；`packages/core/session/src/index.ts`；`packages/session/session-checkpoint-policy/src/index.ts`；`packages/api/session-controller/src/commands.ts`；`packages/llm/llm-pi-ai/src/adapter.ts`、`context.ts`、`stream.ts`。
- Pi：`agent/src/agent-loop.ts`、`types.ts`；`ai/src/utils/event-stream.ts`；`streamSimple` 使用的 OpenAI Responses/Completions event 实现。
- Codex：只读 V1 设计中指定的工具审批/取消边界和 turn completion 行为；不得复制 Codex runtime 代码。

四个提交之间不要反复重读三个完整仓库。首次把源码锚点和决定写进 PR 描述；仅当实现疑点涉及某个文件时才重新打开它。

## 锁定文件职责

生产文件：

- `packages/core/agent-loop/src/index.ts`：从 package root 导出四个已经存在的可复用 machine helper；不改变 lifecycle 行为。
- `packages/core/agent-loop-pi/src/kernel-driver.ts`：只用 DSH 类型的 Kernel 契约，不含 Pi import。
- `packages/core/agent-loop-pi/src/message-conversion.ts`：DSH/Pi 进程内消息转换。
- `packages/core/agent-loop-pi/src/stream-conversion.ts`：DSH `StreamChunk` → Pi assistant event。
- `packages/core/agent-loop-pi/src/model-bridge.ts`：每次从 DSH Session/LLM 重建并冻结请求。
- `packages/core/agent-loop-pi/src/tool-bridge.ts`：调用 `ctx.tools.execute()` 的串行 Pi 工具代理。
- `packages/core/agent-loop-pi/src/pi-kernel-driver.ts`：生产代码中唯一 import Pi loop 函数的文件；converter 可 import Pi 类型，但其他生产文件不得调用 Pi runtime 行为。
- `packages/core/agent-loop-pi/src/event-bridge.ts`：校验 Pi event 顺序并提交 DSH turn/step/message/tool facts。
- `packages/core/agent-loop-pi/src/pi-agent.ts`：DSH Agent 状态、Inbox、取消、maintenance 与“一次 Kernel run 对应一次 DSH turn”的编排。
- `packages/core/agent-loop-pi/src/index.ts`：`PiAgentLoop` 插件和 `createMachine()` 覆盖。
- `packages/core/agent-loop-pi/README.md`、`README.zh.md` 与 `README.i18n.yaml`：package boundary、模型上下文影响和串行工具限制。
- `tsconfig.base.json`、`tsconfig.host.json` 与 `pnpm-workspace.yaml`：精确 local alias、仅 Host 的 project reference 和精确 Pi package release-age 例外。

测试文件：

- `packages/core/agent-loop-pi/tests/boundary.spec.ts`
- `packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- `packages/core/agent-loop-pi/tests/tool-durability.spec.ts`
- `packages/core/agent-loop-pi/tests/integration.spec.ts`
- `packages/api/session-controller/tests/commands-durability.host.spec.ts`

不得创建 `session-commit.ts`、`durability.ts`、`tool-commit-buffer.ts`、`kernel-driver.conformance.ts` 或新的 HTTP fixture server。

## 提交 1：加入最小 Kernel 边界与模型桥

**文件：**

- Create：`packages/core/agent-loop-pi/package.json`
- Create：`packages/core/agent-loop-pi/tsconfig.json`
- Create：`packages/core/agent-loop-pi/tsdown.config.ts`
- Create：`packages/core/agent-loop-pi/README.md`
- Create：`packages/core/agent-loop-pi/README.zh.md`
- Create：`packages/core/agent-loop-pi/README.i18n.yaml`
- Create：`packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create：`packages/core/agent-loop-pi/src/message-conversion.ts`
- Create：`packages/core/agent-loop-pi/src/stream-conversion.ts`
- Create：`packages/core/agent-loop-pi/src/model-bridge.ts`
- Create：`packages/core/agent-loop-pi/src/index.ts`（此时只导出契约；插件激活仍在提交 4）
- Create：`packages/core/agent-loop-pi/tests/boundary.spec.ts`
- Modify：`tsconfig.base.json`
- Modify：`tsconfig.host.json`
- Modify：`pnpm-workspace.yaml`

- [ ] **步骤 1：先写 package boundary 与转换失败测试**

测试必须断言：

- package 是 private ESM，并把两个 Pi package 固定为 `0.85.1`；
- package version 为 `0.1.5-alpha.2`，存在精确 `@local-harness/pi-agent-loop` alias，只有 Host aggregate 引用它，并且包含 DSH 要求的 README 配对记录；
- `kernel-driver.ts` 只 import DSH 类型，public surface 不泄漏 Pi 类型；
- descriptor 为 `{ id: 'pi', version: '0.85.1', capabilities: { streaming: true, tools: true, parallelTools: false, steering: true, reasoning: true, images: true } }`；
- Unicode、空文本、reasoning、图片引用、嵌套工具参数和错误工具结果保留顺序与稳定 ID；
- DSH stream 的文本/reasoning/tool-call/usage/finish chunk 转为合法 Pi event stream；
- 缺失 finish、畸形 JSON 工具参数和不支持 block 以稳定 `KERNEL_*` code 失败。

- [ ] **步骤 2：运行聚焦测试并确认 RED**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/boundary.spec.ts
```

预期：FAIL，因为新 package 和 export 尚不存在。

- [ ] **步骤 3：实现窄 public contract**

直接实现 `docs/architecture/interface-contracts.zh.md` 第 4–5 节的精确 public type。该文档是规范来源：不得另建使用普通 string ID 的缩水副本，不得省略 `initialContext`，也不得替换 `StableFailure`。descriptor 固定为：

```ts design
export const PI_KERNEL_DESCRIPTOR = {
  id: 'pi',
  version: '0.85.1',
  capabilities: {
    streaming: true,
    tools: true,
    parallelTools: false,
    steering: true,
    reasoning: true,
    images: true,
  },
} as const satisfies KernelDescriptor
```

`kernel-driver.ts` 直接使用契约中的 branded `RunId`、`SessionId`、`MessageId`、`ToolCallId`、`TurnPosition`、`KernelContextSnapshot` 与 `StableFailure`。此文件不得 import Pi。Pi 类型只存在于 converters、`model-bridge.ts` 与 `pi-kernel-driver.ts`。

- [ ] **步骤 4：实现请求重建与 stream conversion**

严格实现 `docs/architecture/interface-contracts.zh.md` 第 9 与第 12 节定义的 `StepPreparer` 和 `DshModelStreamBridge`。`StepPreparer` 冻结 `PreparedKernelStep`；随后 `DshModelStreamBridge.stream(step, piContext, signal)` 执行 DSH `agent/request`、调用 `llm.prepareCall()`、从 `session.deriveMessages()` 取得 provider message，并使用 `preparedCall.stream(request) ?? ctx.llm.stream(request)`。不得把 Pi 内存 transcript 当成 provider request 的事实源。

`PiKernelDriver` 只持有一个 current `PreparedKernelStep`。稳定的 Pi `StreamFn` 只消费该 step 一次；重复调用或未 prepare 调用必须失败，不得读取 Pi 侧 credential，并委托 `DshModelStreamBridge.stream()`。bridge 把每个原始 DSH `StreamChunk` 同时送入同一个 `AssistantStreamAttempt` 并转换成 Pi assistant event。收到 Pi assistant `message_end` 时，以 DSH attempt 的 block/usage/finish 完成持久化，不得把 Pi final message 再序列化回 DSH。这样 DSH 保持精确 transcript 与 retry/error authority，Pi 只负责 event ordering。

stream 前冻结 request config，传递 DSH session ID，并保留 DSH retry/error classification。转换失败必须停止 run，不得静默丢 block。严格按 DSH cookbook 注册 package：在 `tsconfig.base.json` 增加 `@local-harness/pi-agent-loop`，只在 `tsconfig.host.json` 增加 `packages/core/agent-loop-pi`，在 `minimumReleaseAgeExclude` 增加 `@earendil-works/pi-agent-core@0.85.1`，并运行 `doc-sync` 生成 package README 配对；不得增加 Client project reference。

- [ ] **步骤 5：运行 package 检查并提交**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/boundary.spec.ts
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
corepack pnpm run check:local-harness:sources
corepack pnpm run doc-sync
```

预期：PASS；source gate 证明 Pi 依赖版本精确，package/document gate 接受新增的 private Host package。Pi Harness 源码 import 缺失由提交 4 的 boundary scan 检查。

```powershell
git add packages/core/agent-loop-pi tsconfig.base.json tsconfig.host.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add minimal pi kernel boundary"
```

## 提交 2：用 Pi 低层串行 loop 驱动 DSH turn

**文件：**

- Create：`packages/core/agent-loop-pi/src/pi-kernel-driver.ts`
- Create：`packages/core/agent-loop-pi/src/event-bridge.ts`
- Create：`packages/core/agent-loop-pi/src/pi-agent.ts`
- Create：`packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- Modify：`packages/core/agent-loop/src/index.ts`
- Modify：`packages/core/agent-loop/tests/agent-machine-seam.spec.ts`

- [ ] **步骤 1：先写 machine 与 event-order 失败测试**

使用测试文件内的 fake `KernelDriver`，只覆盖：

- idle → running → idle；
- 一个 Kernel run 等于一个 DSH turn；
- Pi `turn_start`/`turn_end` 等于一个 DSH step；
- 每个已 claim 的 DSH user message 恰好在 Pi prompt `message_end` 提交一次，并发生在稳定 StreamFn 构造请求之前；
- next-step steering 加入当前 run，next-turn 输入启动后续 run；
- `cancel({ kind: 'user' }, { keepInbox: true })` 中断当前 run 并保留排队输入；
- dispose 等待 Kernel settlement 与 scope dispose；
- 重复或错序 start/end 以 `KERNEL_EVENT_ORDER` 停止；
- 所有 sink Promise 完成前，`run.completed` 不得对外 settled。

- [ ] **步骤 2：运行聚焦测试并确认 RED**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts
```

预期：FAIL，因为 Pi machine 尚不存在。

- [ ] **步骤 3：实现不含有状态 Pi Agent 的 Driver**

`PiKernelDriver` import `runAgentLoop` 并固定：

```ts design
await runAgentLoop(
  toPiMessages(input.initialMessages),
  toPiContext(input.initialContext),
  {
    model: toPiModel(currentStep.model),
    convertToLlm: messages => messages as PiMessage[],
    getSteeringMessages,
    getFollowUpMessages: async () => [],
    prepareNextTurn,
    toolExecution: 'sequential',
  },
  emitPiEvent,
  signal,
  streamPreparedDshStep,
)
```

调用前由 DSH 打开 turn，`StepPreparer` claim 初始 input，但不提前 append `user/message`；这些 admitted message 成为 `input.initialMessages`。Pi 发出 prompt `message_start`/`message_end`，awaited event sink 在稳定 StreamFn 构造 provider request 前只 append 一次对应 DSH user fact。每个后续 Pi turn 都由 `getSteeringMessages` 提供新 prepared step 的 admitted message，`prepareNextTurn` 安装同一 step 并返回转换后的替换 `context` 与 `model`。不得 import 或构造 Pi `Agent`。每个 translated sink event 完成后，才允许下一个会影响外部状态的 transition。abort 只接受第一个 reason。

- [ ] **步骤 4：复用 DSH 组件实现 `DshPiAgent`**

从 `@deepseek-ai/dsh-agent-loop` package root 导出现有 `ReactLoopInbox`、`AssistantStreamAttempt`、`SystemPromptProjection` 与 `RuntimeContextProjection`，再从 package root import。不得增加 `./src/*` export，也不得复制实现。root export 变更只能暴露 API；React machine 行为不变，既有 seam test 必须通过。

`DshPiAgent` 必须：

- 实现现有 DSH `Agent`/`AgentLoopMachine` surface；
- DSH Inbox 是 Host 唯一可见队列；
- 打开 DSH turn 时只 claim 一次 `next-turn`；
- 只通过 `getSteeringMessages` 向 Pi 提供 `next-step`；
- initial step 与后续 step 共用契约中的唯一 `StepPreparer.prepare(target)` 路径：claim 指定 Inbox input，组装 DSH prompt/tools，执行 `agent/pre-step`，冻结 accepted `PreparedKernelStep`，不得提前 append step 或 user fact；
- 每个 Pi step 前重建 system prompt、tools、model selection 与 `session.deriveMessages()`；`prepareNextTurn` 安装 prepared step 并返回转换后的替换 Pi `context` 与 `model`；
- Pi `turn_start` 时 append DSH `step/start` 与所需 system fact；随后在对应 Pi prompt `message_end` 上只 append 一次每个 admitted DSH user message；assistant 与 tool-result event 再创建各自的 DSH fact；
- initial step 准备前 append DSH `turn/start`；Pi `turn_end` 时 append `step/end`；仅在 Pi `agent_end` 或受控失败后 append `turn/end`；
- 所有退出路径都生成配平的 `turn/start`、`step/start`、`step/end`、`turn/end`；
- Pi state 可丢弃，并能只从 DSH Session 重建。

- [ ] **步骤 5：运行 machine 测试并提交**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
```

预期：PASS，原 React machine-seam regression 保持通过。

```powershell
git add packages/core/agent-loop/src/index.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/core/agent-loop-pi/src/pi-kernel-driver.ts packages/core/agent-loop-pi/src/event-bridge.ts packages/core/agent-loop-pi/src/pi-agent.ts packages/core/agent-loop-pi/tests/pi-agent.spec.ts
git commit -m "feat: drive dsh turns with pi core"
```

## 提交 3：桥接串行 DSH 工具并复用 durability checkpoint

**文件：**

- Create：`packages/core/agent-loop-pi/src/tool-bridge.ts`
- Create：`packages/core/agent-loop-pi/tests/tool-durability.spec.ts`
- Modify：`packages/api/session-controller/src/commands.ts`
- Create：`packages/api/session-controller/tests/commands-durability.host.spec.ts`

- [ ] **步骤 1：先写工具和 flush 失败测试**

覆盖：

- 可见 DSH schema 转为 Pi tool 时不改变 schema JSON；
- 调用按 assistant source order 串行执行；
- 每个 body 都通过 `ctx.tools.execute()`，并携带 owning Agent 与 signal；
- unknown tool、非法参数、approval allow/deny、timeout、cancel、tool throw、`additionalContexts`、`concludesTurn` 均保留 DSH result content/error/meta；
- `tool/call` 已提交且 `session-checkpoint-policy` flush 完成后 body 才开始；
- 首次 prompt 和幂等 request-ID 命中都 await `ctx.sessions.flush(agent.session)`；
- `turn/end` append 后，Pi machine 才 await turn-settled flush；
- 任一强制 flush 拒绝时不得返回 success 或进入 idle acknowledgement。

- [ ] **步骤 2：运行聚焦测试并确认 RED**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
```

预期：FAIL，因为串行 bridge 与消息 ACK barrier 尚不存在。

- [ ] **步骤 3：实现串行 Tool Bridge**

每个 proxy 必须进入 public DSH pipeline：

```ts design
const result = await ctx.tools.execute({
  callId,
  name,
  arguments: params,
  agent,
  signal,
})
```

Pi 固定 `toolExecution: 'sequential'`，每个 proxy 固定 `executionMode: 'sequential'`。在 `execute()` 开始前，从 awaited `tool_execution_start` event append 匹配的 DSH `tool/call`。只按 `callId` 缓存当前调用结果，直到 tool-result `message_end` 以 `sourceEventSeqs: [callSeq]` 提交 `tool/result`；随后或 abort 时立即清除。

不得实现 reorder buffer；前一个结果提交前，第二个工具不得启动。

- [ ] **步骤 4：补齐两个 durability await**

`SessionCommandController.prompt()` 中：

```ts design
if (hasPromptRequest(agent, request.requestId)) {
  await this.ctx.sessions.flush(agent.session)
  return { accepted: true }
}
```

在 `agent.followup(message)` 或 `agent.steer(message)` 与 `binding.commit()` 之后：

```ts design
await this.ctx.sessions.flush(agent.session)
return { accepted: true }
```

`DshPiAgent` append `turn/end` 后、对外进入 idle 前：

```ts design
await this.ctx.sessions.flush(this.session)
```

不得新增 service 或访问私有 write handle。现有 checkpoint policy 继续唯一负责 pre-model/pre-tool durability。

- [ ] **步骤 5：运行聚焦与 policy regression 后提交**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts packages/session/session-checkpoint-policy/tests
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
```

预期：PASS，ordering probe 看到每个工具 body 前 flush 已完成。

```powershell
git add packages/core/agent-loop-pi/src/tool-bridge.ts packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/src/commands.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
git commit -m "feat: bridge serial tools and durability"
```

## 提交 4：激活 Pi loop 并证明 M0 边界

**文件：**

- Modify：`packages/core/agent-loop-pi/src/index.ts`
- Create：`packages/core/agent-loop-pi/tests/integration.spec.ts`
- Modify：`packages/bundle/base/package.json`
- Modify：`packages/bundle/base/cordis.patch.yml`
- Modify：`packages/bundle/base/tests/base.spec.ts`
- Create：`.agents/notes/architecture/2026-09-27-pi-kernel-serial-v1.md`
- Modify：`.github/pull_request_template.md`
- Modify：`README.md`

- [ ] **步骤 1：先写 composition 与 recovery 失败测试**

表驱动 integration test 必须覆盖：

- base 激活 `@local-harness/pi-agent-loop`，不激活 `@deepseek-ai/dsh-agent-loop`；
- 只有一个 live `AgentFactory`；
- 文本 stream 与一次串行工具 round 经 DSH LLM adapter double 完成；
- 模型 streaming 和工具执行期间的 cancellation；
- model error 与非法 Kernel event；
- assistant stream 中断后的 resume；
- 已提交 tool call 但无 result 时修复为 unknown outcome，绝不 replay body；
- manual/automatic compaction 的 surface generation 在下一个 Pi step 被读取；
- session recovery 不读取任何 Pi store；
- 复用现有 `llm-pi-ai` OpenAI-compatible mock smoke case 抵达 Pi machine，不新增 server fixture。

- [ ] **步骤 2：运行聚焦 integration test 并确认 RED**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/integration.spec.ts packages/bundle/base/tests/base.spec.ts
```

预期：FAIL，因为 base 仍挂载 React loop。

- [ ] **步骤 3：安装继承式 AgentLoop 插件**

PR-B 唯一新增 factory class：

```ts design
export class PiAgentLoop extends AgentLoop {
  protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
    return new DshPiAgent(input.ctx, input.id, input.options, input.session)
  }
}

export default PiAgentLoop
```

替换 base bundle row 与 dependency，不得同时挂载两个 loop。Pi package 不得出现 `implements AgentFactory`、session create/resume、registry publication 或 handle ownership。

- [ ] **步骤 4：记录 M0 证据与已知限制**

architecture note 和 PR template 必须写明：

- 固定 DSH/Pi/Codex hash；
- 恰好一个 AgentFactory；
- Pi 只使用低层 `runAgentLoop()`；
- DSH Session 是唯一 recovery truth；
- message-ack、before-tool-effect、turn-settled 三类 flush 证据；
- Pi V1 工具串行，Pi machine 有意忽略 `maxParallelToolCalls`；
- 以后只有 `PARALLEL-110` 可以引入 Pi 并行工具执行。

- [ ] **步骤 5：运行完整 PR-B 门禁**

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests packages/api/session-controller/tests/commands-durability.host.spec.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/compaction/command-compact/tests/command-compact.spec.ts packages/bundle/base/tests/base.spec.ts
corepack pnpm run check:local-harness:sources
corepack pnpm run test:snapshot
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run hygiene
corepack pnpm run build
```

预期：全部命令 exit `0`。若全仓存在无关 baseline failure，必须附准确 command/output，并单独证明所有 changed-package gate；不得把改动包失败标成 baseline noise。

- [ ] **步骤 6：运行 boundary scan 并提交**

```powershell
rg -n "AgentHarness|harness/session|harness/skills|harness/compaction|ToolCommitBuffer|AgentDurability|SessionDurabilityPort|implements AgentFactory" packages/core/agent-loop-pi
rg -n "@deepseek-ai/dsh-agent-loop'|@local-harness/pi-agent-loop" packages/bundle/base
```

预期：第一条命令不命中生产代码禁用引用；第二条只显示 Pi loop 是 base 的 active factory dependency/row。

```powershell
git add packages/core/agent-loop-pi/src/index.ts packages/core/agent-loop-pi/tests/integration.spec.ts packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml packages/bundle/base/tests/base.spec.ts .agents/notes/architecture/2026-09-27-pi-kernel-serial-v1.md .github/pull_request_template.md README.md
git commit -m "feat: activate the pi agent loop"
```

## 工期与 token 控制

- 预计净实现时间：3–5 个工作日，约 0.5–0.9 个 GPT-5.6 Sol Plus 周额度。
- 提交 1：1–1.5 日；提交 2：1–1.5 日；提交 3：0.5–1 日；提交 4 与修复：0.5–1 日。
- 每个提交只加载本文、上一个 commit diff 与本提交文件；不得加载无关 frontend、MCP、Office/PDF 或 packaging 源码。
- 提交期间只跑聚焦 RED/GREEN 测试；完整门禁只在提交 4 跑一次。
- 除非手写 production code 超过 2,500 行，或连续两轮 review 无法收敛，否则不得拆 PR-B。

## 完成定义

只有四个提交均存在、聚焦测试通过、完整门禁输出已记录、base 恰好一个 Pi-backed AgentFactory、崩溃恢复只依赖 DSH Session、三类 flush barrier 均有证据、串行工具限制已写入文档时，PR-B 才算完成。Pi 并行工具执行不属于 PR-B 或 V1 验收。
