# PR-B Minimal Serial Pi Kernel Implementation Plan

English | [中文](2026-09-27-local-harness-pi-pr-b-minimal-serial.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default DSH conversational loop with Pi Agent Core while keeping DSH as the sole owner of Agent lifecycle, Session, LLM, tools, approval, prompt assembly, and crash recovery, using a serial-only V1 tool bridge and exactly four implementation commits.

**Architecture:** `PiAgentLoop` inherits the PR-A `AgentLoop` and overrides only `createMachine()`. `DshPiAgent` owns the DSH Agent contract and starts a narrow `KernelDriver`; `PiKernelDriver` calls Pi's low-level `runAgentLoop()` directly with `toolExecution: 'sequential'`, so no second Pi queue or persistent transcript exists. Existing DSH `ctx.sessions.flush(session)` and `session-checkpoint-policy` provide durability; PR-B adds only the message-ack and turn-settled await sites.

**Tech Stack:** TypeScript, Cordis, Vitest, DSH Agent/Session/LLM/Tools APIs, `@earendil-works/pi-agent-core@0.85.1`, `@earendil-works/pi-ai@0.85.1`, pnpm 11.7.0.

---

## Approved scope and non-goals

The project owner approved these reductions on 2026-09-27:

- Pi V1 tool calls are always serial. `KernelDescriptor.capabilities.parallelTools` is `false`, and `maxParallelToolCalls` does not alter Pi execution.
- Parallel dispatch, completion-order events, source-order reorder buffers, and their crash matrix move to `PARALLEL-110` in V1.1.
- Use Pi's low-level `runAgentLoop()`; do not instantiate the stateful Pi `Agent`, use its steering/follow-up queues, or import Pi Harness.
- Do not add `AgentDurability`, `SessionDurabilityPort`, a write-handle router, or `ToolCommitBuffer`.
- Do not add a second OpenAI mock server. Unit tests use a DSH adapter double; the final smoke test reuses the existing `llm-pi-ai` mock infrastructure.
- Keep one small fake `KernelDriver` inside machine tests. Do not build a reusable multi-kernel conformance framework before a second kernel exists.

PR-B still must prove exactly one default AgentFactory, DSH-only recovery truth, three durability barriers, sequential DSH tool execution through the full policy pipeline, cancellation, compaction generation refresh, and no Pi Harness dependencies.

## Required source reread

Before editing code, record the pinned hashes from `AGENTS.md`, then read only these relevant files completely:

- DSH: `docs/cookbook/adding-a-package.md`; `packages/core/agent-loop/src/index.ts`, `agent.ts`, `inbox.ts`, `assistant-stream.ts`, `runtime-context.ts`; `packages/core/tools/src/index.ts`; `packages/core/session/src/index.ts`; `packages/session/session-checkpoint-policy/src/index.ts`; `packages/api/session-controller/src/commands.ts`; `packages/llm/llm-pi-ai/src/adapter.ts`, `context.ts`, `stream.ts`.
- Pi: `agent/src/agent-loop.ts`, `types.ts`; `ai/src/utils/event-stream.ts`; OpenAI Responses and Completions event implementations used by `streamSimple`.
- Codex: only the tool approval/cancellation boundary and turn-completion behavior identified in the V1 design; no Codex runtime code is copied.

Do not reread the whole three repositories in each commit. Put source anchors and decisions in the PR description once, then reopen a source file only when an implementation uncertainty concerns that file.

## Locked file map

Production files:

- `packages/core/agent-loop/src/index.ts`: root-exports the four already-existing reusable machine helpers; no lifecycle behavior changes.
- `packages/core/agent-loop-pi/src/kernel-driver.ts`: DSH-typed kernel contract; contains no Pi imports.
- `packages/core/agent-loop-pi/src/message-conversion.ts`: DSH/Pi in-memory message conversion.
- `packages/core/agent-loop-pi/src/stream-conversion.ts`: DSH `StreamChunk` to Pi assistant-event conversion.
- `packages/core/agent-loop-pi/src/model-bridge.ts`: rebuild and freeze each request from DSH Session/LLM.
- `packages/core/agent-loop-pi/src/tool-bridge.ts`: serial Pi tool proxies calling `ctx.tools.execute()`.
- `packages/core/agent-loop-pi/src/pi-kernel-driver.ts`: sole production importer of Pi's loop function; converter files may import Pi types but no other production file may invoke Pi runtime behavior.
- `packages/core/agent-loop-pi/src/event-bridge.ts`: validates Pi event order and commits DSH turn/step/message/tool facts.
- `packages/core/agent-loop-pi/src/pi-agent.ts`: DSH Agent state, Inbox, cancellation, maintenance, and one-kernel-run-per-DSH-turn orchestration.
- `packages/core/agent-loop-pi/src/index.ts`: `PiAgentLoop` plugin and `createMachine()` override.
- `packages/core/agent-loop-pi/README.md`, `README.zh.md`, and `README.i18n.yaml`: package boundary, model-context effect, and serial-tool limitation.
- `tsconfig.base.json`, `tsconfig.host.json`, and `pnpm-workspace.yaml`: exact local alias, Host-only project reference, and exact Pi package release-age exception.

Test files:

- `packages/core/agent-loop-pi/tests/boundary.spec.ts`
- `packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- `packages/core/agent-loop-pi/tests/tool-durability.spec.ts`
- `packages/core/agent-loop-pi/tests/integration.spec.ts`
- `packages/api/session-controller/tests/commands-durability.host.spec.ts`

Do not create `session-commit.ts`, `durability.ts`, `tool-commit-buffer.ts`, `kernel-driver.conformance.ts`, or a new HTTP fixture server.

## Commit 1: Add the minimal kernel boundary and model bridge

**Files:**

- Create: `packages/core/agent-loop-pi/package.json`
- Create: `packages/core/agent-loop-pi/tsconfig.json`
- Create: `packages/core/agent-loop-pi/tsdown.config.ts`
- Create: `packages/core/agent-loop-pi/README.md`
- Create: `packages/core/agent-loop-pi/README.zh.md`
- Create: `packages/core/agent-loop-pi/README.i18n.yaml`
- Create: `packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/src/message-conversion.ts`
- Create: `packages/core/agent-loop-pi/src/stream-conversion.ts`
- Create: `packages/core/agent-loop-pi/src/model-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/index.ts` (contract exports only; plugin activation remains in Commit 4)
- Create: `packages/core/agent-loop-pi/tests/boundary.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Write package-boundary and conversion tests**

The tests must assert:

- the package is private ESM and pins both Pi packages to `0.85.1`;
- package version is `0.1.5-alpha.2`, the exact `@local-harness/pi-agent-loop` alias exists, only the Host aggregate references it, and the package has the DSH-required paired README record;
- `kernel-driver.ts` imports only DSH types and exposes no Pi type;
- the descriptor is `{ id: 'pi', version: '0.85.1', capabilities: { streaming: true, tools: true, parallelTools: false, steering: true, reasoning: true, images: true } }`;
- Unicode, empty text, reasoning, image references, nested tool arguments, and error tool results retain order and stable IDs;
- DSH stream text/reasoning/tool-call/usage/finish chunks become a legal Pi event stream;
- missing finish, malformed JSON tool arguments, and unsupported blocks fail with stable `KERNEL_*` codes.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/boundary.spec.ts
```

Expected: FAIL because the new package and exports do not exist.

- [ ] **Step 3: Implement the narrow public contract**

Implement the exact public types in `docs/architecture/interface-contracts.md` sections 4–5. That document is normative: do not create a reduced copy with plain-string IDs, omit `initialContext`, or replace `StableFailure`. The descriptor value is fixed as:

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

`kernel-driver.ts` directly uses the contract's branded `RunId`, `SessionId`, `MessageId`, `ToolCallId`, `TurnPosition`, `KernelContextSnapshot`, and `StableFailure`. Keep Pi imports out of this file. Pi-specific types stay in converters, `model-bridge.ts`, and `pi-kernel-driver.ts`.

- [ ] **Step 4: Implement request rebuilding and stream conversion**

Implement `StepPreparer` and `DshModelStreamBridge` exactly as `docs/architecture/interface-contracts.md` sections 9 and 12 define them. `StepPreparer` freezes `PreparedKernelStep`; `DshModelStreamBridge.stream(step, piContext, signal)` then resolves DSH `agent/request`, calls `llm.prepareCall()`, derives provider messages from `session.deriveMessages()`, and uses `preparedCall.stream(request) ?? ctx.llm.stream(request)`. It must never send the Pi in-memory transcript as the authoritative provider request.

`PiKernelDriver` holds exactly one current `PreparedKernelStep`. Its stable Pi `StreamFn` consumes that step once, rejects reuse or a call without a prepared step, ignores Pi-side credential lookup, and delegates to `DshModelStreamBridge.stream()`. The bridge pushes every original DSH `StreamChunk` through one `AssistantStreamAttempt` while converting the same chunks to Pi assistant events. On Pi assistant `message_end`, settle the attempt from its DSH blocks/usage/finish rather than reserializing Pi's final message. This keeps DSH as the exact transcript and retry/error authority while Pi only drives event order.

Freeze request configuration before streaming, propagate the DSH session ID, and preserve DSH retry/error classification. Conversion errors stop the run; they do not drop content. Register the package exactly as the DSH cookbook requires: add `@local-harness/pi-agent-loop` to `tsconfig.base.json`, add only `packages/core/agent-loop-pi` to `tsconfig.host.json`, add `@earendil-works/pi-agent-core@0.85.1` to `minimumReleaseAgeExclude`, and run `doc-sync` for the paired package README. Do not add a Client project reference.

- [ ] **Step 5: Run package checks and commit**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/boundary.spec.ts
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
corepack pnpm run check:local-harness:sources
corepack pnpm run doc-sync
```

Expected: PASS; the source gate proves exact Pi dependencies and the package/document gates accept the new private Host package. Pi Harness source-import absence is checked by the boundary scan in Commit 4.

Commit:

```powershell
git add packages/core/agent-loop-pi tsconfig.base.json tsconfig.host.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add minimal pi kernel boundary"
```

## Commit 2: Drive DSH turns with Pi's low-level serial loop

**Files:**

- Create: `packages/core/agent-loop-pi/src/pi-kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/src/event-bridge.ts`
- Create: `packages/core/agent-loop-pi/src/pi-agent.ts`
- Create: `packages/core/agent-loop-pi/tests/pi-agent.spec.ts`
- Modify: `packages/core/agent-loop/src/index.ts`
- Modify: `packages/core/agent-loop/tests/agent-machine-seam.spec.ts`

- [ ] **Step 1: Write failing machine and event-order tests**

Use a test-local fake `KernelDriver`. Cover exactly:

- idle → running → idle status;
- one kernel run equals one DSH turn;
- Pi `turn_start`/`turn_end` equals one DSH step;
- each claimed DSH user message is committed exactly once at Pi prompt `message_end`, before the stable StreamFn constructs its request;
- next-step steering joins the active run, while next-turn input starts a later run;
- `cancel({ kind: 'user' }, { keepInbox: true })` aborts the current run and preserves queued input;
- disposal waits for kernel settlement and scope disposal;
- illegal duplicate/start/end event order stops with `KERNEL_EVENT_ORDER`;
- `run.completed` is not externally settled until all event sink promises finish.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts
```

Expected: FAIL because the Pi machine does not exist.

- [ ] **Step 3: Implement the Pi driver with no stateful Pi Agent**

`PiKernelDriver` must import `runAgentLoop` and configure:

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

Before this call, DSH opens the turn and `StepPreparer` claims the initial input without appending a `user/message`; those admitted messages become `input.initialMessages`. Pi emits their prompt `message_start`/`message_end`, and the awaited event sink appends each DSH user fact once before the stable StreamFn constructs the provider request. For every later Pi turn, `getSteeringMessages` supplies the newly prepared step's admitted messages and `prepareNextTurn` installs that same step while returning its converted replacement `context` and `model`. Do not import or construct Pi `Agent`. Await every translated sink event before emitting or processing the next external-state transition. The first abort reason wins.

- [ ] **Step 4: Implement `DshPiAgent` by reusing DSH components**

Root-export the existing `ReactLoopInbox`, `AssistantStreamAttempt`, `SystemPromptProjection`, and `RuntimeContextProjection` from `@deepseek-ai/dsh-agent-loop`, then import them from that package root. Do not add `./src/*` exports and do not copy their implementations. The root-export change is API exposure only; the React machine remains behavior-identical and its existing seam test must pass.

`DshPiAgent` must:

- implement the existing DSH `Agent`/`AgentLoopMachine` surface;
- keep DSH Inbox as the only queue visible to Host;
- claim `next-turn` once when opening a DSH turn;
- expose `next-step` messages to Pi only through `getSteeringMessages`;
- use the contract's one `StepPreparer.prepare(target)` path for both the initial step and later steps: claim the selected Inbox input, assemble DSH prompt/tools, run `agent/pre-step`, and freeze the accepted `PreparedKernelStep` without appending a step or user fact early;
- rebuild system prompt, tools, model selection, and `session.deriveMessages()` before every Pi step; `prepareNextTurn` installs the prepared step and returns its converted replacement Pi `context` and `model`;
- append DSH `step/start` and required system facts on Pi `turn_start`, then append each admitted DSH user message once on its Pi prompt `message_end`; assistant and tool-result events create their corresponding DSH facts later;
- append DSH `turn/start` before preparing the initial step, append `step/end` on Pi `turn_end`, and append `turn/end` only after Pi `agent_end` or a contained failure;
- append balanced `turn/start`, `step/start`, `step/end`, and `turn/end` records on every exit path;
- keep Pi state disposable and reconstructible from DSH Session.

- [ ] **Step 5: Run machine tests and commit**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/pi-agent.spec.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
```

Expected: PASS; the original React machine-seam regression remains green.

Commit:

```powershell
git add packages/core/agent-loop/src/index.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/core/agent-loop-pi/src/pi-kernel-driver.ts packages/core/agent-loop-pi/src/event-bridge.ts packages/core/agent-loop-pi/src/pi-agent.ts packages/core/agent-loop-pi/tests/pi-agent.spec.ts
git commit -m "feat: drive dsh turns with pi core"
```

## Commit 3: Bridge serial DSH tools and reuse durability checkpoints

**Files:**

- Create: `packages/core/agent-loop-pi/src/tool-bridge.ts`
- Create: `packages/core/agent-loop-pi/tests/tool-durability.spec.ts`
- Modify: `packages/api/session-controller/src/commands.ts`
- Create: `packages/api/session-controller/tests/commands-durability.host.spec.ts`

- [ ] **Step 1: Write failing tool and flush tests**

Cover:

- visible DSH schemas become Pi tools without changing schema JSON;
- calls execute one at a time in assistant source order;
- every body enters through `ctx.tools.execute()` with the owning Agent and signal;
- unknown tool, invalid arguments, approval allow/deny, timeout, cancellation, thrown tool, `additionalContexts`, and `concludesTurn` preserve DSH result content/error/meta;
- `tool/call` is committed and `session-checkpoint-policy` flush finishes before the body starts;
- prompt acceptance and idempotent request-ID hits await `ctx.sessions.flush(agent.session)`;
- `turn/end` is appended before the Pi machine awaits the turn-settled flush;
- any required flush rejection prevents success/idle acknowledgement.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
```

Expected: FAIL because the serial bridge and message ACK barrier do not exist.

- [ ] **Step 3: Implement the serial tool bridge**

Every proxy must call the public DSH pipeline:

```ts design
const result = await ctx.tools.execute({
  callId,
  name,
  arguments: params,
  agent,
  signal,
})
```

Configure Pi with `toolExecution: 'sequential'` and every proxy with `executionMode: 'sequential'`. Append the matching DSH `tool/call` from the awaited `tool_execution_start` event before `execute()` begins. Cache only the current call's result by `callId` until its tool-result `message_end` commits `tool/result` with `sourceEventSeqs: [callSeq]`; clear it immediately afterward or on abort.

Do not add a reorder buffer. A second tool cannot start until the first result has committed.

- [ ] **Step 4: Add the two missing durability awaits**

In `SessionCommandController.prompt()`:

```ts design
if (hasPromptRequest(agent, request.requestId)) {
  await this.ctx.sessions.flush(agent.session)
  return { accepted: true }
}
```

After `agent.followup(message)` or `agent.steer(message)` and `binding.commit()`:

```ts design
await this.ctx.sessions.flush(agent.session)
return { accepted: true }
```

In `DshPiAgent`, after appending `turn/end` and before transitioning to externally visible idle:

```ts design
await this.ctx.sessions.flush(this.session)
```

Do not add a new service or route to a private write handle. The existing checkpoint policy remains the only pre-model/pre-tool durability policy.

- [ ] **Step 5: Run focused and policy regressions, then commit**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/tests/commands-durability.host.spec.ts packages/session/session-checkpoint-policy/tests
corepack pnpm exec tsc -p packages/core/agent-loop-pi/tsconfig.json --noEmit
```

Expected: PASS; the ordering probe observes flush completion before each tool body.

Commit:

```powershell
git add packages/core/agent-loop-pi/src/tool-bridge.ts packages/core/agent-loop-pi/tests/tool-durability.spec.ts packages/api/session-controller/src/commands.ts packages/api/session-controller/tests/commands-durability.host.spec.ts
git commit -m "feat: bridge serial tools and durability"
```

## Commit 4: Activate the Pi loop and prove the M0 boundary

**Files:**

- Modify: `packages/core/agent-loop-pi/src/index.ts`
- Create: `packages/core/agent-loop-pi/tests/integration.spec.ts`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/tests/base.spec.ts`
- Create: `.agents/notes/architecture/2026-09-27-pi-kernel-serial-v1.md`
- Modify: `.github/pull_request_template.md`
- Modify: `README.md`

- [ ] **Step 1: Write failing composition and recovery tests**

The table-driven integration test must cover:

- base composition activates `@local-harness/pi-agent-loop` and not `@deepseek-ai/dsh-agent-loop`;
- exactly one `AgentFactory` is live;
- text stream and one serial tool round through a DSH LLM adapter double;
- cancellation during model streaming and during a tool;
- model error and malformed kernel event;
- resume after interrupted assistant stream;
- committed tool call with no result repairs to unknown outcome and never replays the body;
- manual/automatic compaction surface generation is read on the next Pi step;
- session recovery reads no Pi store;
- the existing `llm-pi-ai` OpenAI-compatible mock smoke case reaches the Pi machine without adding a new server fixture.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests/integration.spec.ts packages/bundle/base/tests/base.spec.ts
```

Expected: FAIL because base still mounts the React loop.

- [ ] **Step 3: Install the inherited AgentLoop plugin**

The only factory class added by PR-B is:

```ts design
export class PiAgentLoop extends AgentLoop {
  protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
    return new DshPiAgent(input.ctx, input.id, input.options, input.session)
  }
}

export default PiAgentLoop
```

Replace the base bundle row and dependency; do not mount both loops. Do not add `implements AgentFactory`, session creation/resume code, registry publication, or handle ownership to the Pi package.

- [ ] **Step 4: Record the M0 evidence and known limitation**

The architecture note and PR template must record:

- pinned DSH/Pi/Codex hashes;
- exactly one AgentFactory;
- Pi uses low-level `runAgentLoop()` only;
- DSH Session is the only recovery truth;
- message-ack, before-tool-effect, and turn-settled flush evidence;
- V1 Pi tools are serial and `maxParallelToolCalls` is intentionally ignored by the Pi machine;
- `PARALLEL-110` is the only planned route to parallel Pi tool execution.

- [ ] **Step 5: Run complete PR-B gates**

Run in this order:

```powershell
corepack pnpm vitest run packages/core/agent-loop-pi/tests packages/api/session-controller/tests/commands-durability.host.spec.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/compaction/command-compact/tests/command-compact.spec.ts packages/bundle/base/tests/base.spec.ts
corepack pnpm run check:local-harness:sources
corepack pnpm run test:snapshot
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run hygiene
corepack pnpm run build
```

Expected: all commands exit `0`. If the full repository has an unrelated baseline failure, attach the exact command/output and prove every changed-package gate separately; do not label a changed-package failure as baseline noise.

- [ ] **Step 6: Run boundary scans and commit**

Run:

```powershell
rg -n "AgentHarness|harness/session|harness/skills|harness/compaction|ToolCommitBuffer|AgentDurability|SessionDurabilityPort|implements AgentFactory" packages/core/agent-loop-pi
rg -n "@deepseek-ai/dsh-agent-loop'|@local-harness/pi-agent-loop" packages/bundle/base
```

Expected: the first command finds no forbidden production reference; the second shows only the Pi loop as the active base factory dependency/row.

Commit:

```powershell
git add packages/core/agent-loop-pi/src/index.ts packages/core/agent-loop-pi/tests/integration.spec.ts packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml packages/bundle/base/tests/base.spec.ts .agents/notes/architecture/2026-09-27-pi-kernel-serial-v1.md .github/pull_request_template.md README.md
git commit -m "feat: activate the pi agent loop"
```

## Effort and token controls

- Estimated net implementation: 3–5 working days, approximately 0.5–0.9 GPT-5.6 Sol Plus weekly quotas.
- Commit 1: 1–1.5 days; Commit 2: 1–1.5 days; Commit 3: 0.5–1 day; Commit 4 and fixes: 0.5–1 day.
- Start each commit from this plan and the previous commit diff. Do not reload unrelated frontend, MCP, Office/PDF, or packaging sources.
- Run only the focused RED/GREEN tests during a commit; run the full gates once in Commit 4.
- Do not split PR-B unless handwritten production code exceeds 2,500 lines or two review rounds cannot converge.

## Definition of done

PR-B is complete only when all four commits exist, their focused tests pass, the full gates have recorded output, base has exactly one Pi-backed AgentFactory, crash recovery depends only on DSH Session, all three flush barriers are proven, and the serial-tool limitation is documented. Parallel Pi tool execution is not part of PR-B or V1 acceptance.
