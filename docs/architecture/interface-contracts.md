# Local-Harness-pi V1 Interface Contracts

English | [中文](interface-contracts.zh.md)

Fences marked `ts design` are planned implementation excerpts checked for syntax only, not available APIs. Their omitted host dependencies must be wired and pass source typechecking and contract tests in the owning implementation task.

Document version: 1.3

Contract version: `1`

Applicable architecture: DSH product platform + Pi conversational tool-loop kernel + a single DSH conversation/execution recovery source of truth

## 1. Purpose

This document defines the semantic interfaces that V1 implementations must follow. Code identifiers may be adjusted slightly to match upstream exports, but ownership, event ordering, errors, and idempotency rules must not change.

V1 does not create a REST daemon parallel to DSH. The desktop UI and Host continue using existing DSH Typert/Client services. Harness Commands/Events here are transport-independent semantic contracts that map to existing DSH methods and events; they do not require a duplicate service layer.

## 2. Dependency direction

Allowed dependency direction:

```text
DSH UI/Client
  -> DSH Host Agent API
  -> PiAgentLoop (extends DSH AgentLoop) / DshPiAgent
  -> KernelDriver
  -> PiKernelDriver
  -> @earendil-works/pi-agent-core

DshPiAgent
  -> DSH Session / LLM / Tools / Prompt / Goal / Plan / Skills / MCP
```

Forbidden reverse dependencies:

- DSH Client/UI importing Pi types.
- DSH Session event schemas importing Pi types.
- DSH Tool or LLM services calling Pi Session/Harness.
- PiKernelDriver directly writing disk, SQLite, or frontend stores.

Dependency-rule tests are recommended to enforce this boundary.

## 3. Shared basic types

These definitions express semantics; implementations should prefer existing DSH branded types:

```ts design
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
  readonly domain: 'MODEL' | 'TOOL' | 'SESSION' | 'KERNEL' | 'PROTOCOL' | 'SECURITY' | 'MCP'
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly causeCode?: string
  readonly details?: Readonly<Record<string, unknown>>
}
```

Constraints:

- `turn`, `step`, and `SessionSeq` must be safe nonnegative integers; turn/step start at 1, while seq follows the existing DSH definition.
- Every cross-process value must pass through the DSH lossless JSON boundary.
- Sanitize `details` first. It must not contain Error objects, AbortSignals, API keys, file bytes, or functions.
- Externally visible error logic must use `code`, not parse `message`.

## 4. KernelDriver contract

`KernelDriver` is the minimal seam for replacing the conversational tool-loop kernel. It defines no Session, model settings, Tool Registry, UI, general agent graph, multi-agent orchestration, or arbitrary background workflow. Its public interface directly reuses canonical DSH message types without creating a Local Harness message IR:

```ts design
import type { ContentBlock, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
```

```ts design
export type KernelId = 'pi'

export interface KernelDescriptor {
  readonly id: KernelId
  readonly version: string
  readonly capabilities: Readonly<{
    streaming: true
    tools: true
    parallelTools: false
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
  readonly executionMode: 'sequential'
}

export interface KernelContextSnapshot {
  readonly sessionId: SessionId
  readonly systemPrompt: string
  readonly messages: readonly Message[]
  readonly tools: readonly KernelToolSchema[]
  readonly model: FrozenModelSelection
  readonly sessionSurfaceGeneration: number
}

export interface KernelRunInput {
  readonly runId: RunId
  readonly sessionId: SessionId
  readonly turn: number
  readonly initialMessages: readonly Message[]
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

Mandatory rules:

1. `start()` must synchronously return one unique `KernelRun` and drive events asynchronously.
2. Await `onEvent()` serially in event order within a `KernelRun`; do not enter a subsequent phase that affects external state before committing the previous event.
3. `settled` completes only after the last sink call finishes.
4. `abort()` is idempotent; the first reason wins.
5. The Driver does not persist `KernelRunInput` or events.
6. The Driver must not start a second concurrent run for the same DSH Agent.

V1 fixes `PiKernelDriver.descriptor.id` to `pi`. Configuration must not expose a selector for nonexistent kernels; extend `KernelId` when adding future kernels.

## 5. KernelEvent contract

Kernel events use product terminology. Raw Pi events exist only inside `PiKernelDriver`:

```ts design
export type KernelEvent =
  | { readonly type: 'run.started'; readonly runId: RunId }
  | { readonly type: 'step.started'; readonly position: TurnPosition }
  | {
      readonly type: 'message.started'
      readonly position: TurnPosition
      readonly message: Message
    }
  | {
      readonly type: 'message.delta'
      readonly position: TurnPosition
      readonly messageId: MessageId
      readonly streamRevision: number
      readonly delta: StreamChunk
    }
  | {
      readonly type: 'message.completed'
      readonly position: TurnPosition
      readonly message: Message
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

Event state machine:

- The first event must be `run.started`.
- Every step must begin with `step.started` and end with `step.completed`.
- Each step allows only one assistant `message.completed`.
- `tool.started` must follow completion of the assistant message containing that call.
- `tool.completed` must reference a callId that has started but has not completed.
- `run.completed` must be the final event and occur exactly once.
- Stop execution with `KERNEL_EVENT_ORDER` when an event violates these conditions.

## 6. Pi event mapping

`PiKernelDriver` must use this mapping:

| Pi AgentEvent | KernelEvent | Notes |
|---|---|---|
| `agent_start` | `run.started` | Once per Pi prompt/run |
| `turn_start` | `step.started` | step increments within the DSH turn |
| `message_start` | `message.started` | user/assistant/toolResult are all possible |
| `message_update` | `message.delta` | assistant only |
| `message_end` | `message.completed` | Complete-message barrier |
| `tool_execution_start` | `tool.started` | sourceIndex follows assistant toolCall order |
| `tool_execution_update` | `tool.progress` | Do not persist raw partials |
| `tool_execution_end` | `tool.completed` | Cache execution completion first; do not immediately commit a durable result |
| `turn_end` | `step.completed` | toolResults must already have been delivered in source order |
| `agent_end` | `run.completed` | The run settles only after the sink finishes |

Pi `Agent.subscribe()` must use an async listener. The lower-level observational `EventStream`, which does not await listeners, cannot serve as a commit barrier. Implementations using `runAgentLoop` must supply and await `AgentEventSink` for equivalent barrier semantics.

## 7. DSH Agent machine construction seam

DSH `AgentLoop` remains the sole `AgentFactory` lifecycle implementation. PR-A adds this behavior-neutral seam to the pinned baseline; the default still creates `ReactLoopAgent`:

```ts design
import type { Scope } from '@deepseek-ai/dsh-scope'

export interface AgentLoopMachine extends Agent {
  readonly scope: Scope
}

export interface AgentMachineCreateInput {
  readonly ctx: Context
  readonly id: SessionId
  readonly options: AgentOptions
  readonly session: Session
}

export class AgentLoop extends Service implements AgentFactory {
  protected createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
    return new ReactLoopAgent(input.ctx, input.id, input.options, input.session)
  }
}
```

The Pi package subclasses it and overrides only this construction point:

```ts design
export class PiAgentLoop extends AgentLoop {
  protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
    return new DshPiAgent(input.ctx, input.id, input.options, input.session)
  }
}
```

Do not override or copy `prepare()`, `setupAndPublish()`, `createAgent()`, `resume()`, write ownership, registry publication, or rollback. The parent must preserve this pinned DSH ordering:

1. Prepare an unpublished Session.
2. Acquire the persistence write handle.
3. Create an unpublished Agent scope.
4. Await `setup`, then call `setupCommit.commit()` synchronously.
5. Write the unpersisted seed/suffix.
6. Enter the Session registry before the Agent registry.
7. Publish `session/created` before `agent/created`.
8. Publish `agent/session-start`.
9. Return an `AgentHandle` owning the unique disposal capability.

Failure at any step requires reverse-order cleanup. Any started created notification must eventually pair with a disposed notification.

`resume()` must additionally:

1. Acquire write ownership for the same session first.
2. Read the physically valid committed prefix.
3. Append semantic repair events using DSH `interruptedTurnClosers`.
4. Construct `DshPiAgent` through `createMachine()` from the repaired DSH Session.
5. Never restore the in-memory Pi transcript.

## 8. DshPiAgent contract

```ts design
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

Behavior requirements:

- The Inbox must remain a projection of durable DSH `agent/inbox/spliced` events; the Pi queue is not a source of truth.
- `followup()` is equivalent to `send(message, 'next-turn', true)`.
- `steer()` is equivalent to `send(message, 'next-step', true)`.
- `inject()` is equivalent to `send(message, 'next-step', false)`.
- Convert DSH next-step input to a Pi steering message only after it is claimed.
- Pi `getFollowUpMessages` always returns an empty array in V1; the DSH driver starts a new run for next-turn input.
- `whenIdle()` must follow replacement runs started during cancellation cleanup until activity truly stops.
- Maintenance and active runs are mutually exclusive, matching the original DSH contract.

## 9. StepPreparation contract

Produce an immutable `PreparedKernelStep` before each Pi turn:

```ts design
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

Preparation order:

1. Claim this step's messages from the DSH Inbox.
2. Assemble the DSH System Prompt and tool schemas.
3. Call the DSH `agent/pre-step` waterfall.
4. If rejected, neither append `step/start` nor call the model.
5. If accepted, freeze prompt/context/model/tool snapshots.
6. Append `step/start` and any required `system/message` when Pi `turn_start` arrives.
7. Append each accepted user message once at the Pi user `message_end` barrier.
8. Call DSH `agent/request` and prepare the request header/context before requesting the provider.

Cancellation during asynchronous preparation must not leave a spurious `step/start` record for a step that was never entered.

## 10. DSH Session commit and durability reuse

PR-B creates no Session commit or durability service. `DshPiAgent` and its event bridge append execution facts through the existing DSH `Session.append()` API, and durability barriers call the existing `ctx.sessions.flush(session)` API. The persistence plugin remains the sole owner of the write handle.

Requirements:

- Commit each translated kernel event once; duplicate or illegal event order raises `KERNEL_EVENT_ORDER` instead of silently appending.
- A `tool/result` includes its matching `tool/call` seq in `sourceEventSeqs`.
- Emit live assistant streams only through DSH `agent/assistant-stream`; only the final assistant settlement creates a durable `assistant/message` or `assistant/attempt`.
- Abort the Pi run immediately if a Session append fails; do not execute a later tool.
- `append()` is a logical commit. Crash durability is promised only after successful `ctx.sessions.flush(session)`.
- `SessionCommandController.prompt()` awaits `ctx.sessions.flush(agent.session)` before both first-time and idempotent accepted responses.
- The existing `session-checkpoint-policy` awaits the same API after each committed top-level `tool/call` and before the actual DSH tool body.
- `DshPiAgent` appends `turn/end`, then awaits `ctx.sessions.flush(this.session)`, then exposes success/idle.
- A required flush failure maps to `SESSION_WRITE_FAILED` and prevents success acknowledgement.

## 11. ModelRoute configuration contract

Configuration continues to use DSH `llm-pi-ai` settings. The normalized V1 structure is:

```ts design
export interface OpenAiCompatibleRoute {
  readonly id: string
  readonly displayName: string
  readonly location: 'local' | 'cloud'
  readonly baseUrl: string
  readonly wireApi: 'openai-responses' | 'openai-completions'
  readonly credentialRef?: string
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

Validation:

- `id` is nonempty and unique within routes.
- Every `baseUrl` rejects URL userinfo, query, and fragment.
- For `location=local`, hosts are limited to `127.0.0.0/8`, `::1`, or `localhost` resolving exclusively to loopback; only HTTP/HTTPS schemes are allowed.
- For `location=cloud`, the scheme must be HTTPS.
- `credentialRef` accepts only a reference, never plaintext keys.
- V1 product routes reject arbitrary `headers`. Only Host may construct standard OpenAI `Authorization: Bearer` after resolving `credentialRef` at each step. Public attribution headers internal to the pinned DSH upstream catalog are not product configuration and must not be projected to Client.
- `contextWindow` and token values are positive safe integers.
- Normalize only excess trailing slashes; do not add or remove `/v1`. The declared provider/wire adapter constructs endpoints.
- V1 routes use HTTP SSE exclusively; product write paths reject `websocket`, `websocket-cached`, and `auto` transports to prevent bypassing the shared fetch policy.
- Every V1 product route containing `location` must use the Harness-owned API-key authentication seam: credentials are optional for `local` and mandatory for `cloud`. A matching Pi installed-catalog route id must not inherit its environment variables, OAuth store, or provider-native authentication.

### 11.1 Shared Guarded Fetch contract

Model routes and `streamable-http` MCP must use `@local-harness/guarded-fetch`, not independently implement redirect, DNS, or proxy rules. This Host-only mechanism package depends on neither Pi, the MCP SDK, DSH Session, nor Client:

```ts design
export interface GuardedFetchPolicy {
  readonly destination: 'loopback' | 'https'
  readonly credentialBound: boolean
  readonly maxRedirects: 5
}

export interface GuardedFetchHandle {
  readonly fetch: typeof globalThis.fetch
  dispose(): Promise<void>
}

export function createGuardedFetch(policy: GuardedFetchPolicy): GuardedFetchHandle
```

Required behavior:

- `loopback` accepts only `http:`/`https:` with all DNS answers in `127.0.0.0/8` or `::1`; `https` accepts only `https:`. Both reject userinfo, query, fragment, non-HTTP(S) URLs, and empty hostnames.
- Apply the same destination policy to the initial request and every redirect hop. Connect using that request's verified DNS answer set; the transport must not resolve a different address after validation. Follow the pinned DSH `packages/web/web-fetch-http/src/network.ts` `createPinnedLookup()` and request-scoped Undici Agent design, without importing upstream private `/src` paths.
- Use `redirect: 'manual'`. Follow only method/body-preserving 307/308 redirects, at most five hops. Reject 301/302/303, invalid/missing Location, a sixth hop, and non-replayable bodies; cancel/release the current response body.
- When `credentialBound=true`, prohibit cross-origin redirects; compare origins by normalized URL scheme/hostname/effective port. Callers must not copy credentials to another origin on redirect.
- Do not read `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, or proxy credentials. V1 model/MCP routes are explicit user destinations; system proxy integration requires future controlled configuration.
- The handle tracks all active request-scoped dispatchers. `dispose()` first aborts active requests, then waits for response bodies/dispatchers to close. Normal completion, cancellation, and error of the final Response must all release the dispatcher.

When calling `snapshot.models.streamSimple()`, the Pi adapter supplies the handle's `fetch` as `SimpleStreamOptions.fetch`; model discovery uses the same factory. DSH MCP Client passes the corresponding handle's `fetch` to `StreamableHTTPClientTransport`. WebSocket transports are outside this contract, so V1 model configuration prohibits WebSockets.

## 12. DshModelStreamBridge

```ts design
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

`stream()` returns Pi `AssistantMessageEvent`, but that type must not escape the Pi adapter package.

Processing order:

1. Obtain the step's `LlmCallConfig` through DSH `agent/request`.
2. Call DSH `llm.prepareCall()` and freeze the adapter snapshot and retry policy.
3. Generate `GenerateOptions` from context reconstructed from DSH Session.
4. Call the prepared call stream; use DSH `llm.stream()` when no prepared stream exists.
5. Convert DSH `StreamChunk` to Pi assistant events.
6. Each DSH request retry creates a new assistant attempt without duplicating durable user/tool messages.

Stream conversion must support:

- text start/delta/end。
- reasoning start/delta/end。
- tool-call start/arguments delta/end。
- usage。
- stop, tool-calls, max-tokens, aborted, and error finishes.
- Replay state remains in the DSH assistant source; temporary Pi messages need not persist it.

If a stream ends without a valid terminal finish, return `MODEL_STREAM_CLOSED` and commit `assistant/attempt`.

## 13. Message conversion contract

DSH Message is the canonical product format. Conversion must meet these rules:

- Preserve ordering of text, reasoning, image references, tool calls, and tool results.
- DSH raw JSON and Pi parsed objects for tool call arguments must remain semantically equivalent after round trips; invalid JSON fails before execution.
- messageId, toolCallId, provider, model, usage, and error status remain traceable.
- UI-only, Goal/Plan, and runtime state must not masquerade as LLM conversation messages; DSH prompt projection determines their model visibility.
- Do not drop a block and continue after conversion failure; return `KERNEL_MESSAGE_CONVERSION`.

Each converter must have round-trip fixtures covering at least Unicode, empty strings, nested JSON, image references, reasoning, two source-ordered serial tool calls, and error tool results.

## 14. DshToolBridge

```ts design
export interface DshToolCall {
  readonly callId: ToolCallId
  readonly name: string
  readonly arguments: unknown
  readonly sourceIndex: number
}

export interface DshToolBridgeResult {
  readonly callId: ToolCallId
  readonly sourceIndex: number
  readonly content: readonly ContentBlock[]
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

`snapshot()` calls DSH `tools.schemas(agent)` and returns a deeply frozen copy. Pi `parameters` may reuse that JSON Schema. Pi validates incoming arguments, but DSH `tools.execute()` must still repeat authoritative validation and policy enforcement.

`execute()` must call:

```ts design
ctx.tools.execute({
  callId,
  name,
  arguments,
  agent,
  signal,
})
```

Do not call `ToolDefinition.execute()`: that bypasses approval, guards, timeouts, around dispatch, result finalization, and observers.

Bridge rules for Pi `AgentTool.execute()` and `afterToolCall`:

1. Call DSH `tools.execute()` and cache the complete `DshToolBridgeResult`.
2. Return Pi-compatible content/details from `AgentTool.execute()`.
3. In `afterToolCall`, restore DSH `isError`, content, meta, additionalContexts, and concludesTurn from the cache.
4. Pi `tool_execution_end` only marks execution complete; durable commit is allowed only after the corresponding toolResult `message_end` arrives.
5. Release cached entries after durable tool result commit or abort cleanup.
6. A cache miss is `KERNEL_TOOL_RESULT_MISSING`.

V1 fixes both Pi's loop-level `toolExecution` and each proxy's `executionMode` to `sequential`. The cache therefore holds at most the current call result, and a second tool body cannot start until the first result has entered the DSH Session.

Before step 1 actually enters `tools.execute()`, the event bridge must have committed the corresponding `tool/call` and completed `flush('before-tool-effect')`. The await barrier of the Pi async event listener prevents the tool body from crossing this durability boundary.

This prevents Pi's default convenience contract that failures must throw from swallowing structured DSH error content.

## 15. Serial tool ordering

V1 executes tool calls strictly in the assistant's source order:

1. Await the translated `tool_execution_start` sink.
2. Append `tool/call` and let the existing checkpoint policy finish its flush.
3. Enter `ctx.tools.execute()` for that call.
4. Await Pi's tool-result `message_end` and append `tool/result` with the matching call seq.
5. Clear the one-call cache before the next call may start.

Cancellation before a later call starts produces the existing DSH `TOOL_ABORTED_BEFORE_DISPATCH` result where required by recovery rules. No parallel dispatch, completion reordering, or `ToolCommitBuffer` exists in V1. Those semantics are reserved for `PARALLEL-110`.

## 16. Approval contract

Approval does not enter KernelDriver. The DSH Tools pipeline is its sole owner:

```ts design
export type ApprovalDecision =
  | { readonly kind: 'allowed-once' }
  | { readonly kind: 'denied'; readonly reason?: string }
```

The UI identity of an approval request includes at least:

```ts design
export interface ApprovalRequestView {
  readonly sessionId: SessionId
  readonly callId: ToolCallId
  readonly toolName: string
  readonly summary: string
  readonly argumentsPreview: unknown
  readonly requestedCapabilities: readonly string[]
}
```

Accept only the first valid decision for a callId. Decisions arriving for cancelled or finished calls return `TOOL_APPROVAL_STALE`; never apply them to a new call.

## 17. Harness Command semantic contract

These commands map to existing DSH Host APIs; no new network endpoints are required:

```ts design
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

Command envelope:

```ts design
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

Idempotency rules:

- `commandId` deduplicates in-process/connection retries; it does not become a second long-term conversation record.
- The final idempotency identity of `agent.send` is `messageId`; a duplicate messageId within the same session returns the original acceptance result.
- Return successful `agent.send` results only after the Inbox splice completes `flush('message-ack')`.
- The final idempotency identity of `approval.resolve` is `(sessionId, callId)`.
- When Host stops responding to a non-idempotent command, Client must query DSH state before deciding whether to retry.

## 18. Harness Event semantic contract

Host sends two event classes to UI:

```ts design
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

Here `kind='durable'` means the event belongs to the authoritative, persistable DSH Session domain; it does not mean every envelope receives a separate fsync before reaching Client. Crash durability is guaranteed by the message acknowledgement, before-effect, and turn-settled `flush()` barriers.

Client rules:

- Durable deduplication key: `(sessionId, seq)`.
- Runtime deduplication key: `(sessionId, runId, revision)`.
- revision strictly increases within a run; a new run starts at 1.
- Runtime state must not enter frontend durable storage.
- Remove converged runtime frames after the corresponding durable assistant/tool event arrives.
- Discard old runtime state on session switches or snapshot generation changes.
- On a seq gap, stop incremental projection and reload the snapshot from DSH Session Query; do not infer missing content.

## 19. Client Snapshot contract

Reconnects and session switches use snapshot + cursor:

```ts design
export interface SessionViewSnapshot {
  readonly sessionId: SessionId
  readonly generation: number
  readonly throughSeq: SessionSeq | null
  readonly header: unknown
  readonly events: readonly unknown[]
  readonly projections: Readonly<Record<string, unknown>>
}
```

Snapshots must derive entirely from DSH Session/Projection. The frontend atomically replaces its durable view, then accepts increments with `seq > throughSeq`. Events arriving during a snapshot request may be buffered but must ultimately be deduplicated and gaps reconciled by seq.

## 20. Goal, Plan, Skill, and MCP interfaces

V1 creates no Pi-specific interfaces:

- Goal: call DSH Goal service; results are `goal/change` Session events.
- Plan: call DSH Plan service; results are `plan/mode` Session events and scoped tool restrictions.
- Skill: call DSH Skill registry/filesystem; results enter DSH System Prompt assembly.
- MCP: call DSH MCP Client; tools enter DSH Tool Registry.

KernelDriver receives only the assembled `KernelContextSnapshot`. Direct `SKILL.md` scanning, `.mcp.json` reading, or Goal/Plan management inside the Pi package is an architecture violation.

### 20.1 GUI-managed MCP configuration types

GUI-managed MCP adds only a DSH Host configuration control plane, not a second MCP Client. Configuration resides in DSH settings namespace `local-harness.mcp`. For each enabled record, Host dynamically mounts one `@deepseek-ai/dsh-mcp-client` fiber in the deployment-global/root layer of DSH Tool Registry. All Agent scopes inherit it under DSH rules; do not duplicate connections or configuration per session. Instances of the same package in the fixed composition remain Loader-managed and read-only.

```ts design
export type McpManagedServerId = string & { readonly __brand: 'McpManagedServerId' }

export interface McpCredentialBinding {
  /** POSIX credential reference; the resolved value never crosses Host. */
  readonly credentialRef: string
  /** Visible, non-secret prefix such as `Bearer `; CR/LF is forbidden. */
  readonly prefix?: string
}

export interface McpReconnectPolicyInput {
  readonly enabled: boolean
  readonly initialDelayMs: number
  readonly maxDelayMs: number
  readonly maxAttempts: number
}

export interface McpServerCommonInput {
  readonly serverName: string
  readonly toolCallTimeoutMs: number
  readonly reconnect: McpReconnectPolicyInput
}

export interface McpStdioServerInput extends McpServerCommonInput {
  readonly transport: 'stdio'
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  /** Environment variable name -> Host credential binding. */
  readonly env: Readonly<Record<string, McpCredentialBinding>>
}

export interface McpHttpServerInput extends McpServerCommonInput {
  readonly transport: 'streamable-http'
  readonly url: string
  /** Request header name -> Host credential binding. */
  readonly headers: Readonly<Record<string, McpCredentialBinding>>
}

export type McpManagedServerInput = McpStdioServerInput | McpHttpServerInput

export interface McpManagedServerRecord {
  readonly id: McpManagedServerId
  readonly enabled: boolean
  readonly config: McpManagedServerInput
}

export interface McpServerRuntimeView {
  readonly id: McpManagedServerId
  /** Monotonic per id; increments for every phase transition, independent of configRevision. */
  readonly revision: number
  readonly phase: 'disabled' | 'applying' | 'active' | 'error'
  readonly toolCount: number
  readonly errorCode?: string
  readonly errorMessage?: string
}

export interface McpCompositionServerView {
  readonly origin: 'composition'
  readonly entryId: string
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly phase: 'pending' | 'active' | 'failed' | 'disabled'
  readonly toolCount: number
}

export interface McpConfigurationSnapshot {
  readonly configRevision: number
  readonly managed: readonly McpManagedServerRecord[]
  readonly runtime: readonly McpServerRuntimeView[]
  readonly composition: readonly McpCompositionServerView[]
}
```

`McpConfigurationSnapshot` is sanitized: it may return credential reference names and public prefixes, but never resolved values, stdio child environments, final HTTP headers, tool arguments, or file content. Query credential availability through existing `credentials.describe(refs)`, without duplicating a secret-read API.

Input limits: at most 64 GUI-managed servers; at most 128 args and 64 env/header bindings per server; `serverName` matches `[A-Za-z0-9_-]{1,32}`; credential references match `[A-Za-z_][A-Za-z0-9_]*`; prefixes have at most 128 UTF-8 bytes and no CR/LF; timeout/reconnect values respect the DSH MCP Client schema bounds.

stdio `command` is a nonempty executable/path; reject NUL, CR/LF, and command+args combined into a shell string. Pass `args` unchanged as an array to DSH transport. An omitted `cwd` becomes an empty string; a supplied value must be a Host-normalized absolute directory. Explicit env names must not start with `DSH_`. HTTP URLs reject userinfo, query, and fragment; allow HTTPS, or HTTP only with hostname `localhost`/a loopback IP literal. At connection time, `localhost` must resolve exclusively to loopback. DSH MCP Client HTTP fetch must use `redirect: 'manual'`: allow only method/body-preserving 307/308 redirects, reapply the same URL policy to every Location, and follow at most five hops. Reject 301/302/303, missing/invalid Location, and excess hops. Any credential-bound header prohibits cross-origin redirects; never copy resolved headers to a new origin. Header names must be RFC tokens; reject `Host`, `Content-Length`, `Connection`, `Cookie`, and `Proxy-Authorization`. `Authorization` is allowed only with a value from a credential binding.

### 20.2 MCP configuration Remote

Host adds the `mcpConfiguration` Typert namespace with these fixed business methods:

```ts design
export interface McpMutationResult {
  readonly targetId: McpManagedServerId
  readonly snapshot: McpConfigurationSnapshot
  /** Config is already committed even when runtime application reports error. */
  readonly application: {
    readonly phase: 'disabled' | 'applying' | 'active' | 'error' | 'removed'
    readonly errorCode?: string
    readonly errorMessage?: string
  }
}

export interface McpConfigurationRemote {
  list(): Promise<McpConfigurationSnapshot>
  create(
    input: McpManagedServerInput,
    expectedRevision: number,
  ): Promise<McpMutationResult>
  update(
    id: McpManagedServerId,
    input: McpManagedServerInput,
    expectedRevision: number,
    acknowledgeToolRename: boolean,
  ): Promise<McpMutationResult>
  setEnabled(
    id: McpManagedServerId,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<McpMutationResult>
  remove(
    id: McpManagedServerId,
    expectedRevision: number,
  ): Promise<McpMutationResult>
  reconnect(id: McpManagedServerId): Promise<McpMutationResult>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'mcp/config-conflict': { readonly expected: number; readonly actual: number }
    'mcp/config-invalid': { readonly field: string }
    'mcp/not-found': { readonly id: McpManagedServerId }
    'mcp/credential-missing': { readonly id: McpManagedServerId; readonly ref: string }
    'mcp/server-name-conflict': { readonly serverName: string }
    'mcp/tool-rename-unacknowledged': { readonly from: string; readonly to: string }
    'mcp/server-disabled': { readonly id: McpManagedServerId }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** @mode emit */
    'mcp-configuration/status'(view: McpServerRuntimeView): void
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends
    Record<'mcp-configuration/status', true> {}
}
```

Timing and concurrency rules:

1. Host generates the id for `create`, ignores any Client id, and always persists `enabled=false`.
2. `create/update/setEnabled/remove` compare-and-swap the entire `local-harness.mcp` user section using `expectedRevision`. On revision mismatch, throw `RemoteError('mcp/config-conflict', ...)` before resolving credentials or disposing/creating fibers; map it to `MCP_CONFIG_CONFLICT` at the Client boundary.
3. Complete validation before commit. When enabling or updating an enabled record, Host first verifies all references through `ctx.credentials.resolve()`, without caching or returning resolved values.
4. `serverName` is unique across GUI-managed records and Loader composition MCP entries. Changing `serverName` requires `acknowledgeToolRename=true` before committing.
5. The settings commit is the sole configuration commit point. After commit, reconcile only the target id: stop the old fiber and await DSH MCP Client disposal quiescence, then resolve current credentials and mount the new fiber. Do not reload sibling MCP servers or base tools.
6. After configuration commits, mutations must not throw business exceptions implying nothing was written. Report external server startup failure through `application.phase='error'` and runtime views; retain configuration for correction or reconnection.
7. `setEnabled(false)` and `remove` wait for the target fiber to stop; remove does not call `credentials.unset`. `reconnect` leaves config revision unchanged and rebuilds only an enabled target; disabled/not-found return their respective stable errors.
8. Host listens to `settings/document-updated` and `credentials/reference-updated`. Diff external configuration by id; credential changes rebuild only enabled records referencing that ref. Serialize concurrent reconciliation per id; late status from an old generation must not overwrite a new revision.
9. The `mcp-configuration/status` runtime event contains only `McpServerRuntimeView`; its revision is a monotonically increasing runtime sequence per id. Client drops stale status by `(id, revision)`. Declare the event in Cordis `Events`, add it to the `emit` allowlist of `API_REMOTE_FORWARDED_EVENTS`, and supply Client key types through `TypertRemoteEventSelection`. Do not write status to Session or localStorage.

Implementation filenames may follow DSH package conventions, but namespace, field semantics, commit points, and error codes must not change.

## 21. Error codes

V1 fixes at least these error codes:

| Domain | Error code | retryable |
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
| MCP | `MCP_CONFIG_CONFLICT` | true |
| MCP | `MCP_CONFIG_INVALID` | false |
| MCP | `MCP_CONFIG_NOT_FOUND` | false |
| MCP | `MCP_CREDENTIAL_MISSING` | false |
| MCP | `MCP_SERVER_NAME_CONFLICT` | false |
| MCP | `MCP_TOOL_RENAME_UNACKNOWLEDGED` | false |
| MCP | `MCP_SERVER_DISABLED` | false |
| MCP | `MCP_APPLY_FAILED` | true |

When mapping upstream errors, retain their code in `causeCode`; product logic reads only codes from this table.

MCP Remote uses existing DSH wire `RemoteError` names with this fixed mapping: `mcp/config-conflict -> MCP_CONFIG_CONFLICT`, `mcp/config-invalid -> MCP_CONFIG_INVALID`, `mcp/not-found -> MCP_CONFIG_NOT_FOUND`, `mcp/credential-missing -> MCP_CREDENTIAL_MISSING`, `mcp/server-name-conflict -> MCP_SERVER_NAME_CONFLICT`, `mcp/tool-rename-unacknowledged -> MCP_TOOL_RENAME_UNACKNOWLEDGED`, and `mcp/server-disabled -> MCP_SERVER_DISABLED`. `MCP_APPLY_FAILED` is post-commit runtime/application state, not a Remote rejection implying configuration was not saved.

## 22. Cancellation and shutdown order

Cancellation order:

1. Record DSH AgentCancelCause and handle queued input according to `keepInbox`.
2. abort Pi run/provider signal。
3. Started DSH tools receive the fused signal and reach quiescence.
4. Generate aborted results for declared tool calls that have not started.
5. Commit assistant attempts, tool results, `step/end`, and `turn/end(aborted)`.
6. Complete `flush('turn-settled')`.
7. Wait for every event sink.
8. Transition status to idle.

AgentHandle disposal order:

1. Cancel with the `disposed` cause.
2. await `whenIdle()`。
3. dispose Agent scope。
4. close/flush Session write handle。
5. Remove from Agent/Session registries.
6. Release owner/factory bookkeeping.

Do not close Session before cancelling Pi: late events could otherwise write through a closed handle.

## 23. Protocol versions and compatibility

- V1 fixes `protocolVersion` to `1`.
- Host must return `PROTOCOL_VERSION_UNSUPPORTED` for unknown major versions.
- When optional fields are added within the same major version, old Clients ignore unknown display fields but must not ignore permission or security fields.
- DSH owns Session event format versions, separate from Harness protocolVersion.
- Kernel descriptor version records the Pi package version and does not participate in Session decoding.

## 24. Contract test checklist

Implementations must provide focused contract coverage for at least:

1. Legal Kernel event order and every class of illegal order.
2. Async sink commit barriers.
3. First-cause cancellation and idempotency.
4. Default React behavior through the DSH AgentLoop seam and publication/rollback/disposal order inherited by the Pi subclass.
5. next-turn/next-step/keepInbox semantics.
6. DSH↔Pi message/stream round trip。
7. Model freezing per step and switching at the next step.
8. No bypass of the DSH tool pipeline.
9. Two tool calls execute and commit serially in source order, with no overlapping bodies.
10. approval stale/duplicate。
11. Client durable/runtime deduplication and snapshot reload on seq gaps.
12. Pi starts no new tools after Session append failure.
13. All three flush barriers: message ack, tool effect, and turn settled. Flush failure must never return success.
14. After DSH automatic/manual/context-overflow compaction, Pi reads only the new surface generation; failure neither overwrites the old surface nor retries forever.
15. MCP create defaults to disabled, whole-record CAS, cross-source name conflicts, tool rename acknowledgement, and committed-but-apply-error semantics.
16. MCP credential values never leave Host; rotation restarts only referencing records, and per-server reconciliation leaves sibling servers unaffected.

A small test-local fake KernelDriver must cover DSH machine lifecycle and illegal event order; PiKernelDriver uses the focused conversion, tool, recovery, and integration cases above. A reusable cross-kernel conformance suite is required only when a second production kernel is proposed.
