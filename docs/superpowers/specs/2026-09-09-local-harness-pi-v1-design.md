# Local-Harness-pi V1 Overall Architecture Design

English | [中文](2026-09-09-local-harness-pi-v1-design.zh.md)

Document date: 2026-09-09

Architecture status: confirmed by the project owner

Document status: confirmed

Target version: V1

## 1. Final definition

The Local-Harness-pi V1 architecture is fixed as:

> **DSH product platform + Pi conversational tool-loop kernel + a single DSH source of conversation/execution recovery truth.**

“Replacing the DSH kernel” has strict boundaries: replace only DSH's default Agent Loop execution implementation, retaining DSH's Electron shell, Web UI, Agent registration/lifecycle, session event model, persistence, model configuration, tool registration/permissions, Goal/Plan, Skills, MCP, attachments, settings, and plugin platform.

Pi owns only model–tool–model iteration, streaming execution, and in-run queue coordination during one Agent run. It owns no persistent session, maintains no second recoverable transcript, loads no second Skills/MCP system, enforces no independent permission policy, and does not independently choose model configuration.

## 2. Design basis and pinned sources

This design was reviewed against these source baselines:

| Source | Pinned commit or version | Adopted content |
|---|---|---|
| DeepSeek Harness | `b2e3b2a0125854567a4a5fcba75782e42fe84901` | Electron, Web UI, Cordis composition, Agent/Session/LLM/Tools services, JSONL/Zstd sessions, derived SQLite search, Goal/Plan, Skills/MCP, attachments, and update framework |
| Pi | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99`, npm `0.85.1` | `Agent`/`runAgentLoop`, events, and tool-call loop from `@earendil-works/pi-agent-core` |
| OpenAI Codex | `73a1148c9c775c2a4616ce5096291740a00ed68a` | Interaction reference for settings and the input “+” menu; reference for tool approval and safety boundaries |

Implementation constraints:

1. Before each implementation PR, the implementer must reread the DSH, Pi, and Codex source files relevant to it.
2. PR descriptions must record all three upstream commit hashes actually used; changed hashes require compatibility differences.
3. Preserve MIT source attribution for DSH and Pi; Codex is a design reference only, and V1 neither copies nor links its Rust runtime.
4. Never combine upstream upgrades with feature changes in one PR.

## 3. Goals

V1 must deliver these outcomes:

1. Users can open workspaces, create or restore sessions, and complete real coding tasks in a Windows Electron desktop app.
2. Pi Agent Core drives Agent execution, while all recoverable state is written only to DSH Session.
3. Local and cloud models are configured and called through OpenAI-compatible interfaces.
4. DSH tools, approval, workspace restrictions, Goal, Plan, Skills, and MCP remain usable under the Pi loop.
5. The frontend retains DSH's overall layout, with Codex-style tool/capability entries in settings and the input “+” menu.
6. Abnormal exit allows recovery of committed sessions without reexecuting side-effecting tools whose outcomes are unknown.
7. The kernel boundary permits future kernels, but V1 ships only Pi.

## 4. Non-goals

The following are explicitly outside V1:

- Qwen Code kernel, dual-kernel execution, or a kernel comparator.
- A custom Agent microkernel, new plugin framework, or new session database.
- Pi `AgentHarness` Session, JSONL, SQLite, Compaction, Skills, and full Coding Agent shell.
- A public OpenAI `/v1/responses` or `/v1/chat/completions` compatible server. V1 OpenAI-compatible means the outbound model-call contract, not a public gateway.
- Direct Anthropic Messages, Gemini, or vendor-specific API integration.
- Copying or redistributing official Codex Office/PDF plugins.
- Word/Excel/PDF editing, full Playwright browser automation, signed automatic update installation, or comprehensive security hardening.
- Multi-Agent orchestration, remote execution nodes, mobile clients, or standalone browser clients.

These exclusions must not enter V1 as incidental refactoring.

## 5. Overall ownership

| Capability | Sole V1 owner | Notes |
|---|---|---|
| Desktop processes, windows, IPC, packaging | DSH Electron | Preserve the DSH main/Host process split |
| Frontend layout and state projections | DSH Web/Client | Adjust branding and entry points only |
| Agent registration, creation, recovery, disposal | DSH `AgentRegistry`/`AgentFactory` | Pi registers no second Agent identity |
| Agent conversational tool loop | Pi Agent Core | Loop Engine; adapter-hosted, disposable runtime state |
| Conversation/execution source of truth | DSH `Session` + JSONL/Zstd | Append every fact affecting recovered model behavior here only |
| Session search | DSH SQLite FTS | Derived, disposable, rebuildable index, never the source of truth |
| Model routing and credentials | DSH LLM + `llm-pi-ai` | Pi receives only the current request's frozen model description |
| Tool catalog, execution, approval, restrictions | DSH Tools | Pi tools are proxy wrappers only |
| Goal, Plan | DSH Goal/Plan | Continue producing DSH Session events |
| Skills, MCP | DSH Skill/MCP | Continue entering runs through DSH tools and Prompt assembly |
| Attachments and PDF preview | DSH Attachment/Preview | V1 previews only, no editing |
| Updates | DSH updater | Alpha disables automatic installation by default; checks and manual-download prompts only |

This table resolves ownership conflicts. No new component may silently persist a second conversation history. “Source of truth” specifically concerns conversation and execution recovery: domain services may independently persist Decision, Evidence, Artifact, and similar domain objects, but must not duplicate transcripts/execution state or bypass DSH Session; domain references and state changes affecting later model behavior must enter Session through stable refs/events.

## 6. Source composition strategy

`Local-Harness-pi` is a new GitHub repository, not three repositories launched together at runtime. The initial source import should use a pinned DSH snapshot, preserving its original license and attribution; maintain only necessary differences in this repository afterward.

Do not copy the entire Pi repository. V1 adds an exact-version dependency:

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.85.1"
  }
}
```

DSH already uses `@earendil-works/pi-ai@0.85.1`. Both Pi packages must stay at the same version. The package-manager lockfile is a release input; range-based upgrades are forbidden.

Proposed new package:

```text
packages/core/agent-loop-pi/
  src/
    index.ts
    pi-agent.ts
    kernel-driver.ts
    model-bridge.ts
    tool-bridge.ts
    event-bridge.ts
    session-projector.ts
    invariant.ts
  tests/
```

PR-A must first extract a behavior-neutral protected machine-construction seam in DSH `packages/core/agent-loop`, still constructing `ReactLoopAgent` by default. The new package inherits DSH `AgentLoop` and overrides only that seam to construct `DshPiAgent`; it must not duplicate `AgentFactory`, SessionPreparation, creation/recovery, registry publication, or reverse-order cleanup. Both machines thereby share upstream lifecycle fixes automatically, while default composition still loads one AgentFactory.

In default composition:

- Remove the activated `@deepseek-ai/dsh-agent-loop` entry.
- Activate `@local-harness/pi-agent-loop` at the same position.
- Preserve all other DSH service ordering and configuration.
- Fail immediately with a locatable error if startup finds zero or multiple AgentFactories.

## 7. Why Pi Agent Core instead of Pi AgentHarness

Pi `AgentHarness` already has its own Session, JSONL, SQLite, recovery, Compaction, Skills, Tools, and runtime driver. Embedding all of it in DSH creates two persistence and lifecycle systems, precisely what this project avoids.

V1 allows importing:

- `runAgentLoop`
- Agent Core types such as `AgentEvent`, `AgentTool`, and `AgentContext`

V1 deliberately does not construct the stateful Pi `Agent`; DSH Inbox and `DshPiAgent` remain the only live queue/lifecycle owners.

V1 forbids runtime dependencies on:

- `@earendil-works/pi-agent-core/harness/session`
- Pi JSONL/SQLite session backend
- Pi Harness compaction
- Pi Harness skills loader
- Pi Harness built-in coding tools

Dependency checking must be a CI gate: any forbidden entry above in the production dependency graph fails it.

## 8. Agent runtime boundaries

The adapter has three layers:

1. `PiAgentLoop`: inherits DSH `AgentLoop` and overrides only protected `createMachine()`; the superclass owns the entire `AgentFactory` lifecycle.
2. `DshPiAgent`: implements the DSH `Agent` runtime interface and owns DSH Inbox, state, and each disposable low-level Pi run.
3. `PiKernelDriver`: the sole component interacting directly with Pi Agent Core; it exposes a stable, kernel-independent minimal conversational tool-loop interface, not a general agent graph/runtime in V1.

The Pi Agent transcript is only a derived cache in the current process:

- Project from the DSH Session surface on creation and recovery.
- Rebuild context, tools, and model from DSH Session before every Pi turn.
- Translate and commit final Pi events to DSH Session before reporting stable completion upward.
- Discard Pi state at process exit; recovery reads only DSH.

This allows a future KernelDriver without changing session format or frontend protocol.

## 9. Turn/Step semantic alignment

DSH and Pi define “turn” differently, so fix this mapping:

| Pi lifecycle | DSH semantics |
|---|---|
| One `Agent.prompt()`/low-level run | One DSH turn |
| Pi `turn_start` | One DSH `step/start` |
| One Pi assistant response and its tool batch | One DSH step |
| Pi `turn_end` | DSH `step/end` |
| Pi `agent_end` | DSH `turn/end` |

DSH `next-step` Inbox corresponds to the Pi steering boundary; DSH `next-turn` Inbox always remains the next independent DSH turn and must never enter the Pi follow-up queue.

Initial input and in-run steering both pass through DSH `agent/pre-step` first. Rejected steps must issue no model request. Rebuild System Prompt, tool schemas, model configuration, and session history from DSH before each step.

## 10. Event commit principles

Pi events are not a persistence protocol. The adapter maps them to two output classes:

- Durable: official events appended to DSH Session.
- Ephemeral: in-process events for streaming UI only, ultimately converging through replacement by durable events.

Key mappings:

| Pi event | Handling |
|---|---|
| `agent_start` | Publish DSH `agent/status=running` without a second record |
| `turn_start` | Append `step/start` |
| user `message_end` | Append the pre-step-approved `user/message`, once per messageId |
| assistant `message_update` | Publish `agent/assistant-stream`, with no separate UI database |
| assistant `message_end` | Append `assistant/message`, or `assistant/attempt` on failure |
| `tool_execution_start` | Append `tool/call` before allowing entry into the DSH tool execution pipeline |
| `tool_execution_update` | Publish transient progress only |
| tool-result `message_end` | Append `tool/result` in model-call order, referencing the corresponding call seq |
| `turn_end` | Append `step/end` |
| `agent_end` | Append `turn/end`, then converge to idle |

V1 fixes Pi tool execution to serial source order. A later tool body cannot start before the preceding tool result enters DSH Session; the kernel descriptor reports `parallelTools: false`, and no reorder buffer exists. Argument-aware parallel execution and its recovery matrix are deferred to `PARALLEL-110`.

`Session.append()` is a logical commit, not a general crash-durability promise. V1 additionally requires successful `flush()` on the Session write handle before acknowledging user-message acceptance to Client, before each `tool/call` enters actual execution, and before externally completing `turn/end` and entering idle. Stop the run immediately if flush fails.

## 11. Model plane

DSH settings and `llm-pi-ai` are the sole model-configuration owners. V1 supports two OpenAI-compatible route classes:

- Local: llama.cpp, Ollama, LM Studio, vLLM, or another compatible service on loopback.
- Cloud: OpenAI or a compatible cloud provider over HTTPS.

Every route explicitly declares `openai-responses` or `openai-completions` wire API. Never infer protocol from URL alone.

The Pi kernel uses `DshModelStreamBridge`: convert Pi request context to DSH `GenerateOptions`, execute DSH `agent/request`/`llm.prepareCall`/retry policy, then convert DSH `StreamChunk` back to Pi `AssistantMessageEvent`. This bidirectional conversion is deliberate: DSH settings, credentials, frozen requests, attachments, error classification, and retries remain effective.

Pi's `Model` object is a frozen description for one step, not the configuration source of truth. Settings changed mid-response affect only the next step.

V1 implements no public OpenAI-compatible inbound gateway; desktop UI/CLI continue calling DSH Harness/Agent APIs.

## 12. Tools, approval, and permissions

`DshToolBridge` wraps visible tools from the current Agent scope's DSH `tools.schemas(agent)` as Pi `AgentTool`. Actual execution must call DSH `tools.execute()`, never tool functions directly.

Both Pi's loop-level `toolExecution` and each proxy's `executionMode` are fixed to `sequential` in V1. The inherited DSH `maxParallelToolCalls` setting does not change the Pi machine.

This preserves:

- Tool visibility and scope restrictions.
- Schema validation.
- Workspace/path policies.
- Ask/allow/deny approval.
- Timeout, cancellation, and safety policies.
- `tools/result` observers.
- tool presentation metadata。
- `additionalContexts` and `concludesTurn`.

Pi `beforeToolCall`/`afterToolCall` serve bridging only, not another permission system. When DSH returns an error, the bridge must expose an `isError=true` ToolResult to Pi while writing original DSH content, error info, and meta losslessly into Session.

## 13. Goal, Plan, Skills, and MCP

All these capabilities reuse DSH:

- `/goal` continues writing `goal/change` through DSH Goal.
- `/plan` continues writing `plan/mode` through DSH Plan Mode and restricting the tool set.
- DSH filesystem loader continues discovering Skills, which enter System Prompt through progressive disclosure.
- DSH MCP Client continues managing MCP connections and registering tools in DSH Tool Registry.

The Pi kernel sees only DSH-assembled prompts and tool snapshots. Local Skills, MCP tools, and Goal/Plan therefore need no Pi-specific adapter and create no second state.

V1 plugin capability is limited to loading users' own compatible Skills/MCP configurations. Never promise direct distribution of OpenAI curated plugins.

Graphical MCP management is not another MCP runtime: Host stores GUI-managed server records in the `local-harness.mcp` DSH settings namespace and dynamically mounts existing DSH MCP Clients by record. Fixed-composition MCP remains read-only; both sources share one `serverName` uniqueness check, DSH Tool Registry, and permission pipeline. Client receives only redacted configuration/runtime state; DSH credential store still resolves values within Host.

V1 permission pages display and edit only workspace, command, network, approval, and MCP settings actually enforced by DSH. Installed executable DSH plugin packages are trusted source; V1 adds no portable permission manifest the runtime cannot fully enforce. Cross-source manifests, fine-grained grants, signing, and trust chains belong to V1.1.

## 14. Frontend design boundaries

V1 retains DSH page structure, navigation, session list, workspaces, message/tool cards, Diff/Terminal, settings, and plugin inventory.

Required adjustments:

1. Change product chrome branding, PWA, favicon, sidebar, and empty-session marks to Local-Harness-pi, with fixed app ID `io.localharness.pi`; use a neutral `LHπ` mark, never the official DSH wordmark/fish logo. Keep DSH naming only in attribution, licenses, developer docs, and internal compatibility identifiers.
2. Add unified Models, Tools & Permissions, Skills, MCP, and Experimental settings sections.
3. Composer “+” offers attachments, Skill, MCP/tools, Goal, and Plan; its state reads the same configuration service as settings.
4. Tool cards show summary, status, and duration by default, with arguments/raw output collapsed.
5. Streaming assistant content uses transient revisions; corresponding DSH durable seq converges in place without duplicate messages.
6. On session switching, frontend discards old-session transient frames and reprojects from DSH Session/Query.
7. Settings supports GUI-managed MCP create/edit/remove, enable/disable, conflict handling, and per-server reconnect; composition MCP remains read-only.
8. Preserve DSH session rename, body search, archive/restore, fork, export, and Diff/Terminal presentation.
9. Help/About shows product version, pinned upstream versions, and offline third-party licenses.
10. Web profile disables DSH's default model-identity sentence and injects Local-Harness-pi identity through composition; model-visible Web GUI context names the product accurately and may state it is built on DeepSeek Harness.

V1 does no comprehensive visual redesign. Codex informs entry points and interaction details; DSH remains the visual/layout foundation.

## 15. Session consistency

The session system has one source of truth: the DSH append-only Session log. SQLite, Pi memory, and frontend state are derived layers.

Required invariants:

- Agent id exactly equals Session id.
- At most one simultaneous write owner per Session.
- Durable seq increases monotonically and is never reused.
- Assistant/tool durable events commit to DSH Session before external completion, with `flush()` completed at prescribed durability barriers.
- Crash recovery reads only a fully committed prefix; reject corrupt complete frames, never silently truncate them.
- A committed `tool/call` without `tool/result` receives a `TOOL_OUTCOME_UNKNOWN` repair result; never automatically replay side-effecting tools.
- SQLite FTS may be cleared and rebuilt; index content must never overwrite Session.
- Frontend must not own an independent durable chat database.
- DSH Compaction exclusively owns long-session compaction; automatic pressure, context overflow, and `/compact` publish only DSH surface generations, with no Pi compaction copy.

See “Session Consistency and Recovery” for detailed rules.

## 16. Security baseline

V1 must preserve or strengthen these Electron settings:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- Renderer accesses Host only through a minimal preload API.
- IPC validates sender, argument schema, and workspace/session identity.
- Block unapproved navigation, window opening, and custom protocols.
- Local models allow only loopback by default; cloud routes require HTTPS by default.
- Custom HTTP headers must not store plaintext API keys; credentials use DSH credential references.
- File-tool paths must remain inside authorized workspaces after resolving symlinks.
- Network tools default disabled or are controlled by allowlists/approval.
- Logs, Session, and errors must not contain secrets.

Full browser automation, plugin-signing chains, and comprehensive penetration hardening belong to V1.1.

## 17. V1 and V1.1 boundary

### V1

- DSH Electron/UI product platform.
- Pi Agent Core execution loop.
- DSH single Session source of truth and recovery.
- OpenAI-compatible local/cloud models.
- DSH Tools/Approvals/Workspace。
- Goal、Plan、Skills、MCP。
- Graphical MCP create/edit/remove, enable/disable, failure isolation, and reconnect.
- Attachments and PDF previews.
- `web_search`, `web_fetch`, and external browser opening.
- GitHub Release checks and manual-download prompts; Alpha disables automatic installation by default.
- Baseline security, recovery, E2E, and packaging verification.

### V1.1

- Word/Excel/PDF creation and editing plugins.
- Full Playwright/Computer-use browser automation.
- Signing, automatic downloads/installations, and rollback updates.
- Finer-grained plugin permissions, network isolation, auditing, and security hardening.
- An OpenAI-compatible inbound Harness Gateway remains outside V1.1; only a separately approved future version may add it.

## 18. Failure handling

Failures must be layered and diagnosable:

- `MODEL_*`: authentication, rate limits, timeout, context overflow, invalid requests, transport interruption.
- `TOOL_*`: unknown tools, approval denial, execution failure, timeout, unknown outcomes.
- `SESSION_*`: writes, lock conflicts, corruption, migration rejection, recovery failure.
- `KERNEL_*`: invalid Pi events, bridge-state-machine mismatch, abnormal termination.
- `PROTOCOL_*`: Host/Client version or envelope validation failure.

Model/tool business failures should produce structured DSH Session results; persistence and bridge-invariant failures must stop the current run, never pretend completion.

## 19. Observability and privacy

V1 logs a safe short sessionId, runId, turn/step, provider route, model id, event type, duration, and error code. By default, omit user-message bodies, tool output, file contents, API keys, and Authorization headers.

Runtime metrics serve local diagnostics only; no default telemetry upload. Any future cloud telemetry requires separate explicit authorization.

## 20. Testing strategy

Acceptance covers four layers:

1. Unit: message, stream, tool-result, error, and event mappings.
2. Contract: run the same cases against DSH default-loop fixtures and Pi loop, verifying public DSH invariants.
3. Integration: complete local mock OpenAI server, DSH model/tool/session services, and Pi kernel path.
4. Desktop E2E: first model configuration, creation, streaming responses, approval, tools, cancel, recovery, session organization/search/fork/export, long-session compaction, Goal/Plan, Skill/MCP management, Diff/Terminal, PDF previews, About/licenses, and packaging.

Recovery tests must actually terminate child processes to simulate provider stream interruption, exit after tool start, torn append tails, missing/corrupt SQLite, and two processes competing for the same session.

Every “tests pass” claim requires actual commands and results; static review cannot substitute for execution.

## 21. Remotely observable PR boundaries

To let the project owner inspect progress at any time, split V1 into three independently reviewable deliverables:

1. **PR-A: DSH baseline and product boundaries**

   Pinned source, licenses, branding, composition, session/security baseline, and regression tests; no Pi integration.

2. **PR-B: Pi kernel bridge**

   AgentFactory, KernelDriver, model/tool/event bridges, single Session writes, recovery, and compatibility tests.

3. **PR-C: Complete V1 product workflow**

   Settings and “+” menu, Goal/Plan/Skills, graphical MCP, complete session workflow, PDF preview, manual-update prompts, desktop E2E, packaging, and release notes.

If PR-B becomes too large, split only into B1/B2 for “run/model bridge” and “tool/persistence bridge”, yielding at most four PRs. Never create more long-lived branches by technical layer.

## 22. Effort budget

Assuming direct DSH reuse, one primary Codex implementing sequentially, and another Codex reviewing independently:

- Optimistic V1: 18 working days, scheduled over 4 calendar weeks.
- Typical V1: 21 working days, approximately 4–5 calendar weeks.
- Conservative V1: 24 working days, approximately 5 calendar weeks.
- In full GPT-5.6 Sol Plus weekly quotas: approximately 2.5–3.8; quota waiting may extend calendar time without changing net working days.
- V1.1 is outside this plan's committed schedule. For the current four scope categories (Office/PDF editing, full browser automation, signed updates, fine-grained security), a capacity-level estimate only is 4–8 additional calendar weeks and approximately 3–6 full weekly quotas; after V1 stabilizes, write separate requirements, interfaces, and per-PR plans before committing dates, with certificate purchase/issuance waits accounted for separately.

The V1 estimate includes source review, implementation, tests, graphical MCP management, product-workflow regression, approximately 20% integration-fix margin, and rereview; it excludes waiting for human decisions, unavailable real model services, certificate requests, and upstream major upgrades. Never shorten it by dropping Session/Pi/MCP P0 tests; reduce visual polish or defer approved P1 work only.

## 23. Change control

These are architectural changes requiring this document to be updated and confirmed by the project owner first:

- Adding a second persistent Session store.
- Switching to Pi AgentHarness.
- Bypassing DSH Tools/LLM/Approval services.
- Letting the frontend consume raw Pi events directly.
- Adding Qwen Code kernel, a public OpenAI gateway, Office editing, or full browser automation to V1.
- Switching to Tauri or rewriting DSH UI.

Class names, filenames, and purely internal decomposition may change without altering contracts, but PRs must explain the correspondence.

## 24. Document precedence

Resolve conflicts in this order:

1. Ownership, scope, and prohibitions in this overall architecture design.
2. Data invariants in “Session Consistency and Recovery”.
3. Types and ordering in “Interface Contracts”.
4. Product behavior and acceptance criteria in “V1 Requirements Specification”.

Any conflict unresolved by this order requires documentation correction first; implementers must not redirect the project themselves.
