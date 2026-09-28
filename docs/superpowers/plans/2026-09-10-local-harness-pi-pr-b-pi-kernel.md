# PR-B Pi Kernel Bridge Implementation Plan

> **Superseded on 2026-09-27.** Do not implement this plan. The project owner approved the smaller serial-tool design and four-commit execution plan in [PR-B Minimal Serial Pi Kernel Implementation Plan](2026-09-27-local-harness-pi-pr-b-minimal-serial.md). This file remains only as design history.

English | [中文](2026-09-10-local-harness-pi-pr-b-pi-kernel.zh.md)

Fences marked `ts design` are planned implementation excerpts checked for syntax only, not available APIs. Their omitted host dependencies must be wired and pass source typechecking and contract tests in the owning implementation task.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive DSH Agents with `@earendil-works/pi-agent-core@0.85.1` while DSH retains Session, LLM, Tools, Approval, Prompt, Goal/Plan, Skill, and MCP ownership; prove the single source of conversation/execution recovery truth and crash barriers through contract tests.

**Architecture:** Add the private `@local-harness/pi-agent-loop` package. Its `PiAgentLoop` inherits PR-A's DSH `AgentLoop`, overrides only the machine-construction seam, and never duplicates the AgentFactory lifecycle. A typed `KernelDriver` isolates Pi types; `SessionCommitPort`, `DshModelStreamBridge`, and `DshToolBridge` connect DSH services. One Pi run equals one DSH turn; a Pi turn equals a DSH step; DSH next-turn never enters the Pi follow-up queue. The V1 KernelDriver is a conversational tool-loop seam, not a general agent graph.

**Tech Stack:** TypeScript、Cordis、Vitest、DSH Agent/Session/LLM/Tools APIs、`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`。

---

## Upstream rereading checklist

Read completely before starting:

- DSH: `docs/cookbook/adding-a-package.md`; `packages/core/agent/src/index.ts`, `runtime-types.ts`; PR-A's `AgentLoopMachine`/`AgentMachineCreateInput`/`createMachine()` in `packages/core/agent-loop/src/index.ts`, plus `agent.ts`, `inbox.ts`, `assistant-stream.ts`, `runtime-context.ts`, `tool-calls.ts`, and all tests; `packages/core/tools/src/index.ts`; `packages/session/session-persistence/src/handle.ts`; JSONL persistence, projection, and interrupted-turn repair; `packages/llm/llm/src/message.ts`, `types.ts`, `llm-pi-ai/src/adapter.ts`, `context.ts`, `stream.ts`; `packages/api/session-controller/src/commands.ts`; `packages/compaction/compaction-basic/src/index.ts`, `tests/compaction-loop-repro.spec.ts`; `packages/compaction/command-compact/src/index.ts`, `tests/command-compact.spec.ts`.
- Pi: `agent/src/agent.ts` under Pi's `packages` directory, `agent-loop.ts`, `types.ts`, and corresponding tests; `packages/ai/src/utils/event-stream.ts` and OpenAI Responses/Completions event implementations.
- Codex: review only the safety boundaries of approval/tool calls and session completion; do not copy runtime code.

## Task B1: Create the private Pi loop package and lock dependency boundaries

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
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

- [ ] Create a branch from main with PR-A merged.

  Run: `git switch -c pr-b/pi-kernel`

- [ ] First write failing boundary-verifier tests. Place each of the following imports into a temporary source tree and assert rejection:

  ```ts design
  import '@earendil-works/pi-agent-core/harness/session'
  import '@earendil-works/pi-agent-core/harness/context'
  import '@earendil-works/pi-agent-core/harness/runtime/reducer'
  ```

  Then assert that the root entry `@earendil-works/pi-agent-core` is allowed only in `packages/core/agent-loop-pi/src/pi-kernel-driver.ts` and that package's tests; Client, Session schema, Tool, and LLM packages must not import it.

- [ ] Run the failing tests.

  Run: `pnpm vitest run scripts/tests/verify-pi-kernel-boundary.spec.ts`

- [ ] Create the package manifest. Use the DSH peer dependency set from `packages/core/agent-loop/package.json`, and add:

  ```json
  {
    "name": "@local-harness/pi-agent-loop",
    "version": "0.1.5-alpha.2",
    "private": true,
    "type": "module",
    "main": "lib/index.js",
    "types": "lib/types/index.d.ts",
    "dependencies": {
      "@deepseek-ai/dsh-agent-loop": "workspace:*",
      "@earendil-works/pi-agent-core": "0.85.1",
      "@earendil-works/pi-ai": "0.85.1"
    }
  }
  ```

  Retain the DSH package's dependencies on `@deepseek-ai/dsh-brand`, `dsh-util-values`, Schemastery, and Zod. The production dependency on `@deepseek-ai/dsh-agent-loop` inherits the sole lifecycle implementation; it does not activate a second Cordis plugin. Do not add Pi CLI, coding-agent, or harness subpaths.

- [ ] Register the project following DSH `docs/cookbook/adding-a-package.md`: add an exact source alias for `@local-harness/pi-agent-loop` in `tsconfig.base.json` and a `packages/core/agent-loop-pi` project reference in `tsconfig.host.json`; never add it to the Client aggregate. Follow the core Agent Loop README template to document Pi boundaries, direct model context, and known limitations; run `pnpm run doc-sync` and commit the paired files.

- [ ] Add exact `@earendil-works/pi-agent-core@0.85.1` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`; run `pnpm install` to update the lockfile.

- [ ] Add to root `package.json`:

  ```json
  {
    "scripts": {
      "check:local-harness:kernel": "tsx scripts/verify-pi-kernel-boundary.ts",
      "check:local-harness": "pnpm run check:local-harness:sources && pnpm run check:local-harness:kernel"
    }
  }
  ```

- [ ] Run tests and exact dependency checks.

  Run:

  ```powershell
  pnpm vitest run scripts/tests/verify-pi-kernel-boundary.spec.ts
  pnpm run check:local-harness
  pnpm why @earendil-works/pi-agent-core
  ```

  Expected: the verifier passes; only the new package imports the production root entry; the version is `0.85.1`.

- [ ] Commit.

  Run:

  ```powershell
  git add packages/core/agent-loop-pi scripts/verify-pi-kernel-boundary.ts scripts/tests/verify-pi-kernel-boundary.spec.ts package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.host.json
  git commit -m "build: add the pinned Pi kernel package"
  ```

## Task B2: Define kernel-independent contracts and a reusable conformance suite

**Files:**

- Create: `packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts`
- Create: `packages/core/agent-loop-pi/tests/mock-kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] First write conformance cases: strictly serial awaited events, mandatory first `run.started`, balanced steps, paired tool start/end, final `run.completed`, rejection of a second concurrent run, and idempotent abort with the first reason winning.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] Implement `kernel-driver.ts` exactly as sections 4–5 of `docs/architecture/interface-contracts.md` specify. Fix the core public face as:

  ```ts design
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

  `KernelEvent` uses `run.started`, `step.started`, `message.started/delta/completed`, `tool.started/progress/completed`, `step.completed`, and `run.completed`; this file must not import Pi types. It must reuse `Message`, `ContentBlock`, and `StreamChunk` from `@deepseek-ai/dsh-llm`: context/initial messages are `readonly Message[]`, message events use `Message`, deltas use `StreamChunk`, and tool result content uses `readonly ContentBlock[]`. Tool arguments, abort reasons, and redacted metadata may remain `unknown` at their validation boundaries; do not create a third Local Harness message IR.

- [ ] The mock driver reuses the same ordered dispatch:

  ```ts design
  for (const event of events) {
    if (signal.aborted) break
    await sink.onEvent(event, signal)
  }
  ```

  `settled` must complete after the final `onEvent` resolves.

- [ ] Run tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`

- [ ] Commit.

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/kernel-driver.ts packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts packages/core/agent-loop-pi/tests/mock-kernel-driver.ts packages/core/agent-loop-pi/tests/kernel-driver.spec.ts
  git commit -m "feat: define the kernel driver contract"
  ```

## Task B3: Implement DSH/Pi message conversion and context rebuilding at every step

**Files:**

- Create: `packages/core/agent-loop-pi/src/message-conversion.ts`
- Create: `packages/core/agent-loop-pi/src/step-preparer.ts`
- Test: `packages/core/agent-loop-pi/tests/message-conversion.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/step-preparer.spec.ts`

- [ ] First write round-trip fixtures: Unicode, empty text, reasoning, multiple image references, nested tool arguments, parallel tool calls, and error tool results. Assert preservation of block order, messageId, callId, and provider/model/usage.

- [ ] First write step-preparation tests: reproject from the DSH Session surface every time; rejection by DSH `agent/pre-step` produces neither `step/start` nor a model call; settings changes affect only the next step. Then construct the original generation 1 surface and generation 2 compaction surface; assert that Pi messages from the second `prepare()` come exclusively from generation 2, neither reference the first returned array nor contain shadowed original nodes.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts`

- [ ] Implement explicit conversion functions; do not use JSON stringify on an entire message to disguise a type conversion:

  ```ts design
  export function toPiMessages(messages: readonly DshMessage[]): AgentMessage[]
  export function fromPiMessage(message: AgentMessage): DshMessage
  export function toolArguments(raw: string): unknown
  ```

  Failure to parse `toolArguments` returns `KERNEL_MESSAGE_CONVERSION`; never discard a malformed block and continue.

- [ ] Implement `StepPreparer.prepare()` in this fixed order: claim DSH Inbox -> assemble System Prompt/tools -> `agent/pre-step` -> freeze model/tool/context -> return `PreparedKernelStep`. Defensively copy and deeply freeze context, tools, model, and message arrays.

- [ ] Run tests and commit.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts
  git add packages/core/agent-loop-pi/src/message-conversion.ts packages/core/agent-loop-pi/src/step-preparer.ts packages/core/agent-loop-pi/tests/message-conversion.spec.ts packages/core/agent-loop-pi/tests/step-preparer.spec.ts
  git commit -m "feat: rebuild Pi context from DSH session state"
  ```

## Task B4: Implement the DSH-owned model stream bridge

**Files:**

- Create: `packages/core/agent-loop-pi/src/model-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/stream-conversion.ts`
- Test: `packages/core/agent-loop-pi/tests/model-bridge.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/stream-conversion.spec.ts`

- [ ] First write failing tests: text, reasoning, tool-call arguments delta, usage, stop/tool-calls/max-tokens/error/aborted; a source stream without terminal finish must produce `MODEL_STREAM_CLOSED`; settings changes within a step cannot alter the frozen route.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts`

- [ ] `DshModelStreamBridge.resolve()` returns `FrozenModelSelection` only through DSH model selection and the LLM catalog. `stream()` must call `agent/request`, `llm.prepareCall()`, and the pinned DSH Agent Loop's `agent/request-error` waterfall/retry path, never read settings files or the credential store directly. `MODEL_CONTEXT_WINDOW_EXCEEDED` retries the current step only when the DSH compaction listener successfully publishes a new surface; ordinary transport retries and compaction retries use DSH's existing separate budgets, and the Pi driver adds no third counter.

- [ ] Build the Pi stream with `createAssistantMessageEventStream()`. The conversion producer must catch every error and push a terminal `error` event; never let `StreamFn` reject:

  ```ts design
  const stream = createAssistantMessageEventStream()
  void pumpDshChunks(prepared, stream, signal).catch(error => {
    stream.push({ type: 'error', error: failureAssistantMessage(error, prepared.model) })
  })
  return stream
  ```

  `pumpDshChunks` builds the Pi partial message from DSH `block-start`/delta/`block-end`/usage/finish; terminal finish pushes `done` or `error` exactly once.

- [ ] Prove that credentials are resolved only inside the DSH prepared call and no key appears in test snapshots or errors.

- [ ] Run tests and commit.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts
  git add packages/core/agent-loop-pi/src/model-bridge.ts packages/core/agent-loop-pi/src/stream-conversion.ts packages/core/agent-loop-pi/tests/model-bridge.spec.ts packages/core/agent-loop-pi/tests/stream-conversion.spec.ts
  git commit -m "feat: route Pi model streams through DSH LLM"
  ```

## Task B5: Implement the tool bridge and durability barrier before side effects

**Files:**

- Create: `packages/core/agent-loop-pi/src/tool-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/tool-commit-buffer.ts`
- Test: `packages/core/agent-loop-pi/tests/tool-bridge.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts`

- [ ] First write failing tests covering schema snapshots, unknown tools, invalid arguments, approval allow/deny, timeout, cancel, tool throws, `additionalContexts`, `concludesTurn`, and two parallel tools completing in reverse order but committing in source order.

- [ ] Add strict ordering tests: record a marker on the first line of the tool body; assert that `commitToolCall` and `flush('before-tool-effect')` have occurred before it. Make flush reject and assert the body never executes.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts`

- [ ] `snapshot()` deeply freezes `ctx.tools.schemas(agent)`. The Pi wrapper's `execute` calls only:

  ```ts design
  ctx.tools.execute({
    callId: call.callId,
    name: call.name,
    arguments: call.arguments,
    agent,
    signal,
  })
  ```

  Do not call `ToolDefinition.execute()` or repeat approval in Pi hooks.

- [ ] In the awaited sink for Pi `tool_execution_start`: append `tool/call` -> save call seq -> await `flush('before-tool-effect')` -> allow the wrapper body to continue. Cache the complete DSH result by callId; Pi content/details are runtime representations only.

- [ ] `ToolCommitBuffer` may drain only after receiving both execution completion and toolResult `message_end`; emit continuously from the smallest uncommitted sourceIndex; call `assertEmptyAtStepEnd()` at step end.

- [ ] Run tests and commit.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts
  git add packages/core/agent-loop-pi/src/tool-bridge.ts packages/core/agent-loop-pi/src/tool-commit-buffer.ts packages/core/agent-loop-pi/tests/tool-bridge.spec.ts packages/core/agent-loop-pi/tests/tool-commit-buffer.spec.ts
  git commit -m "feat: execute Pi tools through the DSH pipeline"
  ```

## Task B6: Implement SessionCommitPort and the event state machine

**Files:**

- Create: `packages/core/agent-loop-pi/src/session-commit.ts`
- Create: `packages/core/agent-loop-pi/src/event-projector.ts`
- Create: `packages/core/agent-loop-pi/src/invariant.ts`
- Test: `packages/core/agent-loop-pi/tests/session-commit.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/event-projector.spec.ts`

- [ ] First write the failing event-state-machine matrix: missing run start, nested step, duplicate assistant complete, unknown call result, nonempty tool buffer at step end, events after run complete, and repeated event index.

- [ ] First write durable mapping tests: assistant deltas publish only transient events; assistant complete appends one durable message; tool-result `sourceEventSeqs` exactly match the corresponding call seq; run complete appends turn/end and then flushes.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts`

- [ ] `SessionCommitPort` only wraps the AgentFactory's existing DSH Session and write handle:

  ```ts design
  class SessionCommitPortExcerpt {
    async flush(reason: FlushReason, signal?: AbortSignal): Promise<void> {
      try {
        await this.write.flush(signal)
      } catch (cause) {
        throw stableFailure('SESSION', 'SESSION_WRITE_FAILED', reason, cause)
      }
    }
  }
  ```

  It creates no files, holds no SQLite database, and saves no separate events. Each `(runId,eventIndex)` has a one-time commit ledger; duplicates immediately throw `KERNEL_EVENT_ORDER`.

- [ ] `EventProjector.onEvent()` uses a closed-union switch. `message.delta` publishes DSH `agent/assistant-stream`; only `message.completed` and tool results append; `run.completed` follows the fixed order append turn/end -> `flush('turn-settled')` -> publish idle.

- [ ] Run tests and commit.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts
  git add packages/core/agent-loop-pi/src/session-commit.ts packages/core/agent-loop-pi/src/event-projector.ts packages/core/agent-loop-pi/src/invariant.ts packages/core/agent-loop-pi/tests/session-commit.spec.ts packages/core/agent-loop-pi/tests/event-projector.spec.ts
  git commit -m "feat: commit Pi events to the DSH session log"
  ```

## Task B7: Implement PiKernelDriver

**Files:**

- Create: `packages/core/agent-loop-pi/src/pi-kernel-driver.ts`
- Test: `packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts`
- Modify: `packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts`

- [ ] Run the same conformance suite against MockKernelDriver and PiKernelDriver; first confirm the Pi implementation fails.

- [ ] Construct Pi `Agent` with explicit DSH model `streamFn`, DSH tool wrappers, `steeringMode: 'one-at-a-time'`, and `followUpMode: 'one-at-a-time'`. The product semantics of `getFollowUpMessages` must always be empty; DSH next-turn starts a new run in the outer layer.

- [ ] Bridge serially using an async subscriber:

  ```ts design
  const unsubscribe = piAgent.subscribe(async (event, signal) => {
    await sink.onEvent(toKernelEvent(event, positions), signal)
  })
  ```

  Run cleanup must complete after `piAgent.prompt()` settles, the last listener settles, and unsubscribe completes. `abort()` stops both the provider and tools that have started.

- [ ] Compute Pi sourceIndex from assistant toolCall block order, never `tool_execution_end` completion order.

- [ ] Run tests and the boundary gate.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts
  pnpm run check:local-harness:kernel
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/pi-kernel-driver.ts packages/core/agent-loop-pi/tests/pi-kernel-driver.spec.ts packages/core/agent-loop-pi/tests/kernel-driver.conformance.ts
  git commit -m "feat: drive DSH turns with Pi Agent Core"
  ```

## Task B8: Integrate the DshPiAgent lifecycle, Inbox, and message acknowledgment barrier

**Files:**

- Create: `packages/core/agent/src/durability.ts`
- Modify: `packages/core/agent/src/index.ts`
- Create: `packages/core/agent-loop-pi/src/inbox.ts`
- Create: `packages/core/agent-loop-pi/src/pi-agent.ts`
- Modify: `packages/api/session-controller/src/commands.ts`
- Modify: `packages/api/session-controller/package.json`
- Test: `packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- Create: `packages/api/session-controller/tests/commands-durability.host.spec.ts`

- [ ] Define an implementation-independent port in core Agent:

  ```ts design
  export type AgentFlushReason = 'message-ack' | 'before-tool-effect' | 'turn-settled'

  export abstract class AgentDurability extends Service {
    abstract flush(sessionId: SessionId, reason: AgentFlushReason, signal?: AbortSignal): Promise<void>
  }
  ```

  Agent Loop Pi provides this service and routes sessionId to the sole write handle; API depends only on the core Agent definition, not the Pi package.

- [ ] Copy the pinned DSH `inbox.ts` persistent splice behavior with namespace adjustments only; preserve `replace/remove`, claim, wakeup, and projection semantics.

- [ ] First write `DshPiAgent` tests: followup -> next-turn; steer/inject -> next-step; no second run while running; cancel awaits tool quiescence; `whenIdle()` includes cancellation cleanup; maintenance and run are mutually exclusive.

- [ ] In `ApiSessionCommands.prompt()`, after `agent.followup/steer(message)` and file binding commit complete, require:

  ```ts design
  await this.ctx.agentDurability.flush(agent.id, 'message-ack')
  return { accepted: true }
  ```

  An idempotent `requestId` hit on an existing prompt must confirm the corresponding splice is durable; map flush rejection to `session/write-failed`, never return accepted.

- [ ] Run tests and commit.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
  git add packages/core/agent/src/durability.ts packages/core/agent/src/index.ts packages/core/agent-loop-pi/src/inbox.ts packages/core/agent-loop-pi/src/pi-agent.ts packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/api/session-controller/src/commands.ts packages/api/session-controller/package.json packages/api/session-controller/tests/commands-durability.host.spec.ts
  git commit -m "feat: preserve DSH inbox semantics around Pi runs"
  ```

## Task B9: Install Pi through the DSH machine seam and switch the default composition

**Files:**

- Create: `packages/core/agent-loop-pi/src/index.ts`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Test: `packages/core/agent-loop-pi/tests/apply.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/lifecycle.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/recovery.spec.ts`
- Modify: `scripts/verify-pi-kernel-boundary.ts`

- [ ] `PiAgentLoop extends AgentLoop` overrides only PR-A's protected `createMachine(input)` and returns `new DshPiAgent(...)`. Never copy or reimplement SessionPreparation, write handle, scope setup/commit, registry publish, created/disposed pairing, create/resume, or reverse-order rollback.

- [ ] Reuse the DSH lifecycle contract with `PiAgentLoop` and write parameterized creation-failure tests: Session prepare, write ownership, scope setup, seed append, session register, agent register, and created listener. Assert no leaked handle/scope/registry entry at every failure point; a static gate rejects copies of `implements AgentFactory`, `setupAndPublish`, or `resumeWith` in the Pi package.

- [ ] First write recovery tests: recover only from the committed DSH prefix; call `interruptedTurnClosers`; resolve open tool calls as `TOOL_OUTCOME_UNKNOWN`, never execute them again; Pi state/messages have no recovery entry.

- [ ] Replace the base dependency:

  ```json
  "@local-harness/pi-agent-loop": "workspace:*"
  ```

  Base directly activates only the new package; the new package inherits `@deepseek-ai/dsh-agent-loop` through a workspace dependency, but the latter must not appear as a second Cordis plugin configuration. Retain the original package source and tests as the sole lifecycle implementation. Change the same position in `cordis.patch.yml` to:

  ```yaml
  - id: agent-loop
    name: '@local-harness/pi-agent-loop'
  ```

- [ ] The boundary verifier parses the base patch and asserts exactly one active `AgentFactory`, named as the new package; it also parses the production source/lock graph, allowing the new package to depend on the DSH agent-loop superclass but rejecting a second activated Agent Loop, duplicated lifecycle identifiers, or any Pi harness subpath.

- [ ] Run tests.

  Run:

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run build:lib
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/core/agent-loop-pi/src/index.ts packages/core/agent-loop-pi/tests/apply.spec.ts packages/core/agent-loop-pi/tests/lifecycle.spec.ts packages/core/agent-loop-pi/tests/recovery.spec.ts packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml scripts/verify-pi-kernel-boundary.ts
  git commit -m "feat: activate Pi as the only DSH agent loop"
  ```

## Task B10: Complete the mock OpenAI, tool, and recovery integration matrix

**Files:**

- Create: `packages/core/agent-loop-pi/tests/fixtures/openai-compatible-server.ts`
- Create: `packages/core/agent-loop-pi/tests/pi-loop.integration.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/crash-recovery.e2e.ts`
- Create: `packages/core/agent-loop-pi/tests/contract-matrix.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/compaction-through-pi.integration.spec.ts`
- Create: `.agents/notes/architecture/2026-09-10-pi-kernel-session-ownership.md`
- Modify: `packages/core/agent-loop-pi/README.md`
- Modify: `packages/core/agent-loop-pi/README.zh.md`

- [ ] The mock server implements two explicit endpoints, Responses and Chat Completions, and binds only to a random port on `127.0.0.1`; support text deltas, tool calls, reversed tool order, 429/500, stream interruption, and cancellation.

- [ ] The integration matrix covers at least the kernel-related items of requirements `TEST-002`, `TEST-003`, and `TEST-004`. Each case ultimately asserts the DSH Session event prefix, not Pi in-memory messages.

- [ ] The crash harness uses child processes and explicit barrier markers to terminate a process; after recovery, the parent asserts that acknowledged messages exist, unacknowledged messages may be absent, started-without-result tools are unknown, no side effects replay automatically, and turns/steps balance.

- [ ] Add a Pi compaction integration matrix using the small context-window approach from pinned DSH `compaction-loop-repro.spec.ts`, but replace AgentFactory with Pi:

  1. `pressure`: multiple steps with tool results cross the threshold; assert `compaction/start -> summary -> end` falls between the previous `step/end` and next `step/start`.
  2. `context-overflow`: the mock first returns `MODEL_CONTEXT_WINDOW_EXCEEDED`; DSH compacts exactly once and retries the same step successfully with the new surface; assert the transport retry budget was not consumed.
  3. `manual`: execute `/compact` through DSH Commands; assert the next Pi step uses the generation produced by the command.
  4. `failure`: when the summarizer fails or the new surface still exceeds the limit, the old generation remains valid and the run ends with a stable error; record call counts and assert no loop.
  5. `restart`: force termination after compaction/end flush; the first recovered step projects from the DSH surface; no Pi session/compaction files are created in the repository.

  Every case must assert DSH durable events, surface generation, and the message ids actually received by the model; checking only UI text or Pi in-memory state is insufficient.

- [ ] The Agent Note records the Pi event to DSH turn/step mapping, three flush barriers, tool-result reordering, and why the Pi follow-up queue does not carry DSH next-turn.

- [ ] Run all PR-B gates.

  Run:

  ```powershell
  pnpm run check:local-harness
  pnpm vitest run packages/core/agent-loop-pi/tests packages/api/session-controller/tests/commands-durability.host.spec.ts packages/compaction/command-compact/tests/command-compact.spec.ts
  pnpm run test:snapshot
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run build
  git diff --check
  ```

  Expected: all pass; no keys; no Pi Session files or second chat database.

- [ ] Commit documentation, push, and create a Draft PR.

  Run:

  ```powershell
  git add packages/core/agent-loop-pi .agents/notes/architecture/2026-09-10-pi-kernel-session-ownership.md
  git commit -m "test: prove Pi and DSH lifecycle conformance"
  git push -u origin pr-b/pi-kernel
  gh pr create --draft --title "feat: replace the DSH loop with the Pi kernel driver" --body-file .\.github\pull_request_template.md
  ```

## Optional split rules

Split only when the master-plan thresholds trigger:

- B1: Tasks B1–B4 deliver KernelDriver, messages, and the DSH model stream without activating the default composition.
- B2: Tasks B5–B10 deliver tools/Session/Pi machine and switch the default composition.

B1 public types remain inside the private package; B1 must not add an unfinished package to base composition. B2 must build on B1; never edit the same bridge file in parallel.

## PR-B effort and handoff gates

- Estimated net effort: 7–10 working days, approximately 1.2–1.8 full GPT-5.6 Sol Plus weekly quotas.
- Recommended cadence: B1–B3 take 2–3 days, B4–B6 take 2–3 days, B7–B9 take 2 days, and B10/fixes take 1–2 days; never let two agents edit the state machine or SessionCommitPort concurrently.
- Day 3 checks typed KernelDriver/message conversion; day 6 checks model/tools/flush; day 8 checks the sole AgentFactory, inherited lifecycle, recovery, and compaction; days 9–10 are only for failure fixes and rereview.
- PR-B must not include product UI. Completion requires passing the full contract matrix, crash recovery, Pi compaction matrix, and dependency boundary, with actual command output attached to the Draft PR description.
