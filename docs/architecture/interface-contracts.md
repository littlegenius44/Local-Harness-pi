# Local-Harness-pi V1 接口契约

文档版本：1.0-draft

契约版本：`1`

适用架构：DSH 产品平台 + Pi 执行内核 + 单一 DSH 会话事实源

## 1. 目的

本文定义 V1 中实现者必须遵守的语义接口。代码标识可以按上游实际导出做小幅调整，但所有权、事件顺序、错误和幂等规则不得改变。

V1 不再创建一个与 DSH 平行的 REST daemon。桌面 UI 与 Host 继续使用 DSH 现有 Typert/Client 服务；本文的 Harness Command/Event 是传输无关的语义契约，可以映射到现有 DSH 方法和事件，而不是要求再复制一套服务。

## 2. 依赖方向

允许的依赖方向：

```text
DSH UI/Client
  -> DSH Host Agent API
  -> DshPiAgentFactory / DshPiAgent
  -> KernelDriver
  -> PiKernelDriver
  -> @earendil-works/pi-agent-core

DshPiAgent
  -> DSH Session / LLM / Tools / Prompt / Goal / Plan / Skills / MCP
```

禁止的反向依赖：

- DSH Client/UI import Pi 类型。
- DSH Session event schema import Pi 类型。
- DSH Tool 或 LLM service 调用 Pi Session/Harness。
- PiKernelDriver 直接写磁盘、SQLite 或前端 store。

建议用依赖规则测试锁定该边界。

## 3. 公共基础类型

以下定义表达语义；项目中应优先复用 DSH branded types：

```ts
export type ProtocolVersion = 1

export type SessionId = string & { readonly __brand: 'SessionId' }
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type MessageId = string & { readonly __brand: 'MessageId' }
export type ToolCallId = string & { readonly __brand: 'ToolCallId' }
export type RunId = string & { readonly __brand: 'RunId' }
export type SessionSeq = number & { readonly __brand: 'SessionSeq' }

export interface TurnPosition {
  readonly turn: number
  readonly step: number
}

export interface StableFailure {
  readonly domain: 'MODEL' | 'TOOL' | 'SESSION' | 'KERNEL' | 'PROTOCOL' | 'SECURITY'
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly causeCode?: string
  readonly details?: Readonly<Record<string, unknown>>
}
```

约束：

- `turn`、`step` 和 `SessionSeq` 必须为安全非负整数；turn/step 从 1 开始，seq 遵循 DSH 现有定义。
- 所有跨进程值必须通过 DSH lossless JSON 边界。
- `details` 必须先脱敏，不能包含 Error 对象、AbortSignal、API key、文件字节或函数。
- 外部可见错误逻辑依赖 `code`，不能解析 `message`。

## 4. KernelDriver 契约

`KernelDriver` 是未来更换内核的最小 seam。它不定义 Session、模型设置、Tool Registry 或 UI。

```ts
export type KernelId = 'pi'

export interface KernelDescriptor {
  readonly id: KernelId
  readonly version: string
  readonly capabilities: Readonly<{
    streaming: true
    tools: true
    parallelTools: boolean
    steering: boolean
    reasoning: boolean
    images: boolean
  }>
}

export interface FrozenModelSelection {
  readonly provider: string
  readonly model: string
  readonly wireApi: 'openai-responses' | 'openai-completions'
  readonly reasoningEffort?: string
  readonly maxTokens?: number
  readonly contextWindow?: number
  readonly inputModalities: readonly ('text' | 'image')[]
  readonly generation: number
}

export interface KernelToolSchema {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
  readonly executionMode: 'parallel' | 'sequential'
}

export interface KernelContextSnapshot {
  readonly sessionId: SessionId
  readonly systemPrompt: string
  readonly messages: readonly unknown[]
  readonly tools: readonly KernelToolSchema[]
  readonly model: FrozenModelSelection
  readonly sessionSurfaceGeneration: number
}

export interface KernelRunInput {
  readonly runId: RunId
  readonly sessionId: SessionId
  readonly turn: number
  readonly initialMessages: readonly unknown[]
  readonly initialContext: KernelContextSnapshot
  readonly signal: AbortSignal
}

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

export type KernelRunResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'cancelled'; readonly reason: unknown }
  | { readonly kind: 'failed'; readonly failure: StableFailure }
```

强制规则：

1. `start()` 必须同步返回唯一 `KernelRun`，并异步驱动事件。
2. 同一 `KernelRun` 的 `onEvent()` 按事件顺序串行 await；上一个事件未提交前不能进入会影响外部状态的下一阶段。
3. `settled` 在最后一个 sink 调用结束后才完成。
4. `abort()` 幂等；第一次原因获胜。
5. Driver 不持久化 `KernelRunInput` 或事件。
6. Driver 不允许并发启动同一 DSH Agent 的第二个 run。

V1 `PiKernelDriver.descriptor.id` 固定为 `pi`。配置文件不提供不存在的内核选择器；未来增加内核时再扩展 `KernelId`。

## 5. KernelEvent 契约

内核事件使用产品侧术语，Pi 原始事件只存在于 `PiKernelDriver` 内部：

```ts
export type KernelEvent =
  | { readonly type: 'run.started'; readonly runId: RunId }
  | { readonly type: 'step.started'; readonly position: TurnPosition }
  | {
      readonly type: 'message.started'
      readonly position: TurnPosition
      readonly message: unknown
    }
  | {
      readonly type: 'message.delta'
      readonly position: TurnPosition
      readonly messageId: MessageId
      readonly streamRevision: number
      readonly delta: unknown
    }
  | {
      readonly type: 'message.completed'
      readonly position: TurnPosition
      readonly message: unknown
    }
  | {
      readonly type: 'tool.started'
      readonly position: TurnPosition
      readonly callId: ToolCallId
      readonly name: string
      readonly arguments: unknown
      readonly sourceIndex: number
    }
  | {
      readonly type: 'tool.progress'
      readonly position: TurnPosition
      readonly callId: ToolCallId
      readonly revision: number
      readonly partial: unknown
    }
  | {
      readonly type: 'tool.completed'
      readonly position: TurnPosition
      readonly callId: ToolCallId
      readonly sourceIndex: number
      readonly result: DshToolBridgeResult
    }
  | {
      readonly type: 'step.completed'
      readonly position: TurnPosition
      readonly reason: 'completed' | 'tool-calls' | 'max-tokens' | 'error' | 'aborted'
    }
  | {
      readonly type: 'run.completed'
      readonly turn: number
      readonly reason: DshTurnEndReason
    }
```

事件状态机：

- 第一事件必须是 `run.started`。
- 每个 step 必须以 `step.started` 开始，以 `step.completed` 结束。
- 同一 step 只允许一个 assistant `message.completed`。
- `tool.started` 必须位于包含该 call 的 assistant 完成之后。
- `tool.completed` 必须引用已 started 且未 completed 的 callId。
- `run.completed` 必须为最后事件，只出现一次。
- 事件越过这些条件时停止运行并产生 `KERNEL_EVENT_ORDER`。

## 6. Pi 事件映射

`PiKernelDriver` 固定按下表转换：

| Pi AgentEvent | KernelEvent | 备注 |
|---|---|---|
| `agent_start` | `run.started` | 一次 Pi prompt/run 只发一次 |
| `turn_start` | `step.started` | step 在 DSH turn 内递增 |
| `message_start` | `message.started` | user/assistant/toolResult 均可出现 |
| `message_update` | `message.delta` | 只允许 assistant |
| `message_end` | `message.completed` | 完整消息屏障 |
| `tool_execution_start` | `tool.started` | sourceIndex 由 assistant toolCall 顺序决定 |
| `tool_execution_update` | `tool.progress` | 不持久化 raw partial |
| `tool_execution_end` | `tool.completed` | 结果先进入执行完成缓存，不立即提交 durable result |
| `turn_end` | `step.completed` | toolResult 必须已按源顺序交付 |
| `agent_end` | `run.completed` | sink 完成后 run 才 settle |

Pi `Agent.subscribe()` 必须使用 async listener，不能使用低层只观察而不等待的 `EventStream` 作为提交屏障。若实现使用 `runAgentLoop`，必须传入并 await `AgentEventSink`，达到同等屏障语义。

## 7. DSH AgentFactory 适配

DSH 公共接口保持上游形状：

```ts
export class DshPiAgentFactory implements AgentFactory {
  createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>
  resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
}
```

实现必须复用或等价保持 DSH 固定基线中的顺序：

1. 准备未发布的 Session。
2. 获取 persistence write handle。
3. 创建未发布的 Agent scope。
4. await `setup`，然后同步 `setupCommit.commit()`。
5. 写入未持久化 seed/suffix。
6. 先进入 Session registry，再进入 Agent registry。
7. 先发布 `session/created`，再发布 `agent/created`。
8. 发布 `agent/session-start`。
9. 返回拥有唯一 dispose capability 的 `AgentHandle`。

任一步失败都必须逆序清理，已开始的 created 通知必须最终配对 disposed 通知。

`resume()` 额外必须：

1. 先获取同 session 的 write ownership。
2. 读取物理有效的 committed prefix。
3. 使用 DSH `interruptedTurnClosers` 追加语义修复事件。
4. 由修复后的 DSH Session 构造 `DshPiAgent`。
5. 绝不恢复 Pi 内存 transcript。

## 8. DshPiAgent 契约

```ts
export class DshPiAgent implements DshAgent {
  readonly id: SessionId
  readonly session: Session
  readonly inbox: Inbox
  readonly options: AgentOptions
  readonly ctx: Context
  readonly status: 'idle' | 'running'

  send(message: UserMessage, target: 'next-turn' | 'next-step', wakeup: boolean): void
  followup(message: UserMessage): void
  steer(message: UserMessage): void
  inject(message: UserMessage): void
  cancel(cause: AgentCancelCause, options?: { keepInbox?: boolean }): void
  whenIdle(): Promise<void>
  runMaintenance<T>(job: (signal: AbortSignal) => Promise<T>): Promise<T>
}
```

行为要求：

- Inbox 必须继续由 DSH durable `agent/inbox/spliced` 投影，不使用 Pi queue 作为事实源。
- `followup()` 等价于 `send(message, 'next-turn', true)`。
- `steer()` 等价于 `send(message, 'next-step', true)`。
- `inject()` 等价于 `send(message, 'next-step', false)`。
- 只有 DSH next-step 被 claim 后才转换为 Pi steering message。
- Pi `getFollowUpMessages` 在 V1 始终返回空数组；next-turn 由 DSH driver 开新 run。
- `whenIdle()` 必须追踪取消收尾期间启动的替代 run，直到真正无活动。
- maintenance 与活跃 run 互斥，行为与 DSH 原契约相同。

## 9. StepPreparation 契约

每个 Pi turn 前必须形成不可变的 `PreparedKernelStep`：

```ts
export interface PreparedKernelStep {
  readonly position: TurnPosition
  readonly admittedMessages: readonly UserMessage[]
  readonly prompt: Readonly<{
    rendered: string
    sections: readonly unknown[]
    tools: readonly KernelToolSchema[]
  }>
  readonly model: FrozenModelSelection
  readonly context: KernelContextSnapshot
  readonly startsRequestSeries: boolean
}

export interface StepPreparer {
  prepare(
    agent: DshAgent,
    target: 'next-turn' | 'next-step',
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }>
}
```

准备顺序：

1. 从 DSH Inbox claim 本 step 的消息。
2. 组装 DSH System Prompt 和工具 schema。
3. 调用 DSH `agent/pre-step` waterfall。
4. 若拒绝，不能追加 `step/start` 或调用模型。
5. 若接纳，冻结 prompt/context/model/tool 快照。
6. Pi `turn_start` 到达时追加 `step/start` 和必要的 `system/message`。
7. 接纳的 user message 在 Pi user `message_end` 屏障追加一次。
8. provider 请求前调用 DSH `agent/request` 并准备 request header/context。

任何异步准备期间取消，都不得留下只有 `step/start` 而没有实际进入 step 的伪记录。

## 10. SessionCommitPort

只有这个端口把内核运行事实写入 DSH Session：

```ts
export interface SessionCommitPort {
  startTurn(turn: number): SessionSeq
  startStep(position: TurnPosition): SessionSeq
  commitSystemMessages(step: PreparedKernelStep): readonly SessionSeq[]
  commitUserMessage(position: TurnPosition, message: UserMessage): SessionSeq
  commitAssistant(
    position: TurnPosition,
    message: unknown,
    stream: unknown,
    usage?: unknown,
  ): SessionSeq
  commitAssistantAttempt(position: TurnPosition, attempt: unknown): SessionSeq
  commitToolCall(position: TurnPosition, call: DshToolCall): SessionSeq
  commitToolResult(
    position: TurnPosition,
    result: DshToolBridgeResult,
    callSeq: SessionSeq,
  ): SessionSeq
  endStep(position: TurnPosition): SessionSeq
  endTurn(turn: number, reason: DshTurnEndReason): SessionSeq
  flush(reason: 'message-ack' | 'before-tool-effect' | 'turn-settled', signal?: AbortSignal): Promise<void>
}

export interface SessionDurabilityPort {
  flush(
    sessionId: SessionId,
    reason: 'message-ack' | 'before-tool-effect' | 'turn-settled',
    signal?: AbortSignal,
  ): Promise<void>
}
```

端口要求：

- 方法内部只调用 DSH `Session.append()` 和既有投影服务。
- 每个 `(runId, eventIndex)` 只允许提交一次；重复调用触发不变量错误，不能静默追加。
- `commitToolResult` 必须带对应 `callSeq` 作为 `sourceEventSeqs`。
- assistant 的 live stream 只通过 DSH `agent/assistant-stream` 发出；最终 `commitAssistant` 才形成 durable message。
- Session append 失败立即中止 Pi run；不能继续执行后续工具。
- `append()` 只表示逻辑提交；只有 `flush()` 成功才承诺抗崩溃。
- Host 确认用户消息已接纳前必须 `flush('message-ack')`。
- 每个 `tool/call` 提交后、实际工具 body 开始前必须 `flush('before-tool-effect')`。
- `turn/end` 后、运行成功或 idle 对外可见前必须 `flush('turn-settled')`。
- flush 失败映射为 `SESSION_WRITE_FAILED` 并停止运行。

`SessionDurabilityPort` 只把 sessionId 路由到 AgentFactory 已拥有的 DSH write handle，不创建新 handle、不保存 event，也不是第二个持久化服务。Host 的异步发送命令通过该端口等待消息确认屏障。

## 11. ModelRoute 配置契约

配置继续进入 DSH `llm-pi-ai` settings。V1 规范化结构为：

```ts
export interface OpenAiCompatibleRoute {
  readonly id: string
  readonly displayName: string
  readonly location: 'local' | 'cloud'
  readonly baseUrl: string
  readonly wireApi: 'openai-responses' | 'openai-completions'
  readonly credentialRef?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly models: readonly OpenAiCompatibleModel[]
  readonly timeoutMs?: number
  readonly streamIdleTimeoutMs?: number
  readonly retryPolicy?: Readonly<{
    maxAttempts: number
    initialDelayMs: number
    maxDelayMs: number
  }>
}

export interface OpenAiCompatibleModel {
  readonly id: string
  readonly displayName?: string
  readonly contextWindow: number
  readonly maxTokens?: number
  readonly input: readonly ('text' | 'image')[]
  readonly reasoningLevels?: readonly ('off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max')[]
}
```

验证：

- `id` 非空且在 routes 内唯一。
- `location=local` 时 HTTP 只允许 `127.0.0.0/8`、`::1` 或解析后仅为 loopback 的 `localhost`；禁止 URL userinfo。
- `location=cloud` 时 scheme 必须为 HTTPS。
- `headers` 键大小写不敏感地拒绝 `authorization`、`proxy-authorization`、`cookie` 和 `set-cookie`。
- `credentialRef` 只能是引用，不接受 key 明文。
- `contextWindow` 和 token 值为正安全整数。
- 路径只去除多余尾斜杠，不擅自添加或删除 `/v1`；endpoint 由声明的 provider/wire adapter 构造。

## 12. DshModelStreamBridge

```ts
export interface DshModelStreamBridge {
  resolve(
    agent: DshAgent,
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<FrozenModelSelection>

  stream(
    step: PreparedKernelStep,
    piContext: unknown,
    signal: AbortSignal,
  ): AsyncIterable<unknown>
}
```

`stream()` 返回 Pi `AssistantMessageEvent`，但该类型不得泄露出 Pi adapter 包。

处理顺序：

1. 通过 DSH `agent/request` 取得 step 的 `LlmCallConfig`。
2. 调用 DSH `llm.prepareCall()`，冻结 adapter snapshot 和 retry policy。
3. 从 DSH Session 重建的上下文生成 `GenerateOptions`。
4. 调用 prepared call stream；没有 prepared stream 时调用 DSH `llm.stream()`。
5. 将 DSH `StreamChunk` 转换为 Pi assistant events。
6. DSH request retry 每次产生新的 assistant attempt，但不重复 user/tool durable message。

流转换必须支持：

- text start/delta/end。
- reasoning start/delta/end。
- tool-call start/arguments delta/end。
- usage。
- stop、tool-calls、max-tokens、aborted 和 error finish。
- replay state 仍存于 DSH assistant source；Pi 临时消息可不持久保存它。

若 stream 未发合法 terminal finish 就结束，返回 `MODEL_STREAM_CLOSED`，并提交 `assistant/attempt`。

## 13. 消息转换契约

DSH Message 是产品侧 canonical format。转换必须满足：

- text、reasoning、image reference、tool call 和 tool result 的顺序不变。
- tool call arguments 的 DSH raw JSON 与 Pi parsed object 往返后语义相同；非法 JSON 在执行前失败。
- messageId、toolCallId、provider、model、usage 和 error 状态可追溯。
- UI-only、Goal/Plan 和 runtime 状态不能伪装为 LLM 对话消息；它们通过 DSH prompt projection 决定是否模型可见。
- 转换失败不得丢弃 block 后继续；返回 `KERNEL_MESSAGE_CONVERSION`。

每个转换器必须有 round-trip fixture，至少覆盖 Unicode、空字符串、嵌套 JSON、图片引用、reasoning、并行 tool calls 和 error tool result。

## 14. DshToolBridge

```ts
export interface DshToolCall {
  readonly callId: ToolCallId
  readonly name: string
  readonly arguments: unknown
  readonly sourceIndex: number
}

export interface DshToolBridgeResult {
  readonly callId: ToolCallId
  readonly sourceIndex: number
  readonly content: readonly unknown[]
  readonly isError: boolean
  readonly error?: Readonly<{ name?: string; code?: string; message: string }>
  readonly meta?: unknown
  readonly additionalContexts?: readonly UserMessage[]
  readonly concludesTurn?: true
}

export interface DshToolBridge {
  snapshot(agent: DshAgent): readonly KernelToolSchema[]
  createPiTools(agent: DshAgent, snapshot: readonly KernelToolSchema[]): readonly unknown[]
  execute(
    agent: DshAgent,
    call: DshToolCall,
    signal: AbortSignal,
  ): Promise<DshToolBridgeResult>
}
```

`snapshot()` 调用 DSH `tools.schemas(agent)`，输出深冻结副本。Pi `parameters` 可以使用同一 JSON Schema；Pi 会做入站验证，但 DSH `tools.execute()` 仍必须再次执行权威校验和策略。

`execute()` 必须调用：

```ts
ctx.tools.execute({
  callId,
  name,
  arguments,
  agent,
  signal,
})
```

不得调用 `ToolDefinition.execute()`，否则会绕过审批、guard、timeout、around dispatch、结果 finalization 和观察者。

Pi `AgentTool.execute()` 与 `afterToolCall` 的桥接规则：

1. 调用 DSH `tools.execute()` 并缓存完整 `DshToolBridgeResult`。
2. `AgentTool.execute()` 返回 Pi 可接受的 content/details。
3. `afterToolCall` 从缓存恢复 DSH `isError`、content、meta、additionalContexts 和 concludesTurn。
4. Pi `tool_execution_end` 只标记执行已完成；对应 toolResult `message_end` 到达后才允许 durable commit。
5. 缓存在 durable tool result 提交或 abort 收尾后释放。
6. 未命中缓存视为 `KERNEL_TOOL_RESULT_MISSING`。

在第 1 步实际进入 `tools.execute()` 前，事件桥必须已经提交对应 `tool/call` 并完成 `flush('before-tool-effect')`。Pi async event listener 的 await 屏障保证工具 body 不会越过该持久化边界。

这是为了避免 Pi “失败必须 throw” 的默认便利契约吞掉 DSH 已结构化的错误内容。

## 15. 并行工具与提交重排

```ts
export interface ToolCommitBuffer {
  register(call: DshToolCall, callSeq: SessionSeq): void
  settleExecution(result: DshToolBridgeResult): void
  observeTranscriptResult(callId: ToolCallId): void
  drainReady(): readonly Readonly<{
    call: DshToolCall
    callSeq: SessionSeq
    result: DshToolBridgeResult
  }>[]
  assertEmptyAtStepEnd(): void
}
```

规则：

- `register` 按 `sourceIndex` 严格递增。
- 结果可乱序 `settleExecution`。
- Pi toolResult `message_end` 到达时调用 `observeTranscriptResult`，证明该结果已经进入 Pi transcript。
- `drainReady` 只输出“执行已完成且 transcript 已观察”的条目，并从下一个预期 sourceIndex 连续输出。
- step end 前所有 started call 必须有 result；取消时为未执行 call 生成 `TOOL_ABORTED_BEFORE_DISPATCH`。
- 缓冲大小不能超过当前 assistant 的 tool call 数；超过即 `KERNEL_TOOL_BUFFER_OVERFLOW`。

## 16. Approval 契约

审批不进入 KernelDriver。DSH Tools pipeline 是唯一审批所有者：

```ts
export type ApprovalDecision =
  | { readonly kind: 'allowed-once' }
  | { readonly kind: 'denied'; readonly reason?: string }
```

审批请求的 UI identity 至少包含：

```ts
export interface ApprovalRequestView {
  readonly sessionId: SessionId
  readonly callId: ToolCallId
  readonly toolName: string
  readonly summary: string
  readonly argumentsPreview: unknown
  readonly requestedCapabilities: readonly string[]
}
```

同一 callId 只接受第一次合法决定。决定到达已取消或已结束 call 时返回 `TOOL_APPROVAL_STALE`，不能应用到新调用。

## 17. Harness Command 语义契约

这些命令映射到 DSH 现有 Host API，不要求创建新网络端点：

```ts
export type HarnessCommand =
  | { readonly type: 'workspace.open'; readonly path: string }
  | { readonly type: 'session.create'; readonly workspaceId: WorkspaceId }
  | { readonly type: 'session.resume'; readonly sessionId: SessionId }
  | {
      readonly type: 'agent.send'
      readonly sessionId: SessionId
      readonly messageId: MessageId
      readonly target: 'next-turn' | 'next-step'
      readonly content: readonly unknown[]
      readonly wakeup: boolean
    }
  | {
      readonly type: 'agent.cancel'
      readonly sessionId: SessionId
      readonly keepInbox: boolean
    }
  | {
      readonly type: 'approval.resolve'
      readonly sessionId: SessionId
      readonly callId: ToolCallId
      readonly decision: ApprovalDecision
    }
  | {
      readonly type: 'plan.set'
      readonly sessionId: SessionId
      readonly active: boolean
    }
  | { readonly type: 'goal.change'; readonly sessionId: SessionId; readonly change: unknown }
```

命令 envelope：

```ts
export interface CommandEnvelope<C extends HarnessCommand = HarnessCommand> {
  readonly protocolVersion: 1
  readonly commandId: string
  readonly sentAt: number
  readonly command: C
}

export type CommandResult<T = unknown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: StableFailure }
```

幂等规则：

- `commandId` 用于进程内/连接重试去重，不成为第二份长期对话记录。
- `agent.send` 的最终幂等身份是 `messageId`；同 session 重复 messageId 返回原接受结果。
- `agent.send` 的成功结果必须在 Inbox splice 完成 `flush('message-ack')` 后返回。
- `approval.resolve` 的最终幂等身份是 `(sessionId, callId)`。
- 非幂等命令在 Host 失去响应时，Client 必须先查询 DSH 状态再决定是否重试。

## 18. Harness Event 语义契约

Host 向 UI 发两类事件：

```ts
export type HarnessEventEnvelope = DurableEnvelope | RuntimeEnvelope

export interface DurableEnvelope {
  readonly protocolVersion: 1
  readonly kind: 'durable'
  readonly sessionId: SessionId
  readonly seq: SessionSeq
  readonly event: unknown
}

export interface RuntimeEnvelope {
  readonly protocolVersion: 1
  readonly kind: 'runtime'
  readonly sessionId: SessionId
  readonly runId: RunId
  readonly revision: number
  readonly event:
    | { readonly type: 'agent.status'; readonly status: 'idle' | 'running' }
    | { readonly type: 'assistant.stream'; readonly frame: unknown }
    | { readonly type: 'tool.progress'; readonly callId: ToolCallId; readonly partial: unknown }
    | { readonly type: 'approval.requested'; readonly request: ApprovalRequestView }
}
```

这里的 `kind='durable'` 表示事件属于 DSH Session 的权威、可持久化域，不表示每个 envelope 到达 Client 时都单独执行了一次 fsync。抗崩溃承诺由消息确认、副作用前和 turn 完成三个 `flush()` barrier 给出。

Client 规则：

- Durable 去重键是 `(sessionId, seq)`。
- Runtime 去重键是 `(sessionId, runId, revision)`。
- revision 在一个 run 内严格递增；新 run 从 1 开始。
- Runtime 不能写入前端 durable storage。
- 对应 durable assistant/tool event 到达后，删除已收敛的 runtime frame。
- session 切换或 snapshot generation 改变时丢弃旧 runtime state。
- 发现 seq 缺口时停止增量投影并从 DSH Session Query 重载 snapshot，不猜测缺失内容。

## 19. Client Snapshot 契约

重新连接或切换会话使用 snapshot + cursor：

```ts
export interface SessionViewSnapshot {
  readonly sessionId: SessionId
  readonly generation: number
  readonly throughSeq: SessionSeq | null
  readonly header: unknown
  readonly events: readonly unknown[]
  readonly projections: Readonly<Record<string, unknown>>
}
```

Snapshot 必须完全由 DSH Session/Projection 生成。前端先原子替换 durable view，再接受 `seq > throughSeq` 的增量。Snapshot 请求期间收到的事件可以暂存，但最终按 seq 去重和补缝。

## 20. Goal、Plan、Skill 和 MCP 接口

V1 不创建 Pi 专用接口：

- Goal：调用 DSH Goal service；结果为 `goal/change` Session event。
- Plan：调用 DSH Plan service；结果为 `plan/mode` Session event 及 scope tool restriction。
- Skill：调用 DSH Skill registry/filesystem；结果进入 DSH System Prompt assembly。
- MCP：调用 DSH MCP Client；工具进入 DSH Tool Registry。

KernelDriver 只接收组装后的 `KernelContextSnapshot`。若 Pi package 中出现直接扫描 `SKILL.md`、读取 `.mcp.json` 或管理 Goal/Plan 的代码，视为架构违规。

## 21. 错误码

V1 至少固定以下错误码：

| 领域 | 错误码 | retryable |
|---|---|---:|
| MODEL | `MODEL_AUTH` | false |
| MODEL | `MODEL_RATE_LIMIT` | true |
| MODEL | `MODEL_QUOTA_EXCEEDED` | false |
| MODEL | `MODEL_TIMEOUT` | true |
| MODEL | `MODEL_TRANSPORT` | true |
| MODEL | `MODEL_INVALID_REQUEST` | false |
| MODEL | `MODEL_CONTEXT_WINDOW_EXCEEDED` | false |
| MODEL | `MODEL_UNSUPPORTED_CAPABILITY` | false |
| MODEL | `MODEL_STREAM_CLOSED` | true |
| TOOL | `TOOL_UNKNOWN` | false |
| TOOL | `TOOL_INVALID_ARGUMENTS` | false |
| TOOL | `TOOL_APPROVAL_DENIED` | false |
| TOOL | `TOOL_APPROVAL_STALE` | false |
| TOOL | `TOOL_TIMEOUT` | false |
| TOOL | `TOOL_ABORTED_BEFORE_DISPATCH` | false |
| TOOL | `TOOL_OUTCOME_UNKNOWN` | false |
| SESSION | `SESSION_WRITE_FAILED` | false |
| SESSION | `SESSION_WRITE_CONFLICT` | true |
| SESSION | `SESSION_CORRUPT` | false |
| SESSION | `SESSION_MIGRATION_REFUSED` | false |
| KERNEL | `KERNEL_EVENT_ORDER` | false |
| KERNEL | `KERNEL_MESSAGE_CONVERSION` | false |
| KERNEL | `KERNEL_TOOL_RESULT_MISSING` | false |
| KERNEL | `KERNEL_TOOL_BUFFER_OVERFLOW` | false |
| PROTOCOL | `PROTOCOL_VERSION_UNSUPPORTED` | false |
| PROTOCOL | `PROTOCOL_INVALID_ENVELOPE` | false |
| SECURITY | `SECURITY_PATH_OUTSIDE_WORKSPACE` | false |
| SECURITY | `SECURITY_NETWORK_TARGET_DENIED` | false |

映射上游错误时保留上游 code 于 `causeCode`；产品逻辑只读取本表 code。

## 22. 取消和关闭顺序

取消顺序：

1. 记录 DSH AgentCancelCause，按 `keepInbox` 处理队列。
2. abort Pi run/provider signal。
3. 已开始 DSH tool 收到 fused signal 并达到 quiescence。
4. 为未开始的已声明 tool call 生成 aborted result。
5. 提交 assistant attempt、tool results、`step/end` 和 `turn/end(aborted)`。
6. 完成 `flush('turn-settled')`。
7. 等待所有 event sink。
8. 状态切换为 idle。

AgentHandle dispose 顺序：

1. 以 `disposed` 原因取消。
2. await `whenIdle()`。
3. dispose Agent scope。
4. close/flush Session write handle。
5. 从 Agent/Session registry 移除。
6. 释放 owner/factory bookkeeping。

顺序不得改成先关闭 Session 再取消 Pi，否则晚到事件可能写入关闭句柄。

## 23. 协议版本和兼容

- V1 `protocolVersion` 固定为 `1`。
- Host 接收未知主版本必须返回 `PROTOCOL_VERSION_UNSUPPORTED`。
- 同主版本增加可选字段时，旧 Client 忽略未知展示字段，但不能忽略权限或安全字段。
- Session event format 版本由 DSH 管理，不与 Harness protocolVersion 共用。
- Kernel descriptor version 记录 Pi package 版本，不参与 Session 解码。

## 24. 契约测试清单

实现者必须建立可复用 contract suite，至少验证：

1. Kernel event 合法顺序和每类非法顺序。
2. async sink 的提交屏障。
3. cancel 首因和幂等。
4. DSH AgentFactory 发布/回滚/销毁顺序。
5. next-turn/next-step/keepInbox 语义。
6. DSH↔Pi message/stream round trip。
7. 模型 step freeze 与下 step 切换。
8. DSH tool pipeline 未被绕过。
9. 并行工具乱序完成、源顺序提交。
10. approval stale/duplicate。
11. Client durable/runtime 去重与 seq 缺口重载。
12. Session append 失败后 Pi 不再启动新工具。
13. message ack、tool effect 和 turn settled 三类 flush barrier；flush 失败不得返回成功。

Mock KernelDriver 必须通过该 suite；PiKernelDriver 必须复用同一 suite。未来其他内核只有通过相同 suite 才能加入默认组合。
