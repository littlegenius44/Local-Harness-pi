# Local-Harness-pi V1 Requirements Specification

English | [中文](v1-requirements.zh.md)

Document version: 1.3

Applicable release: V1

Architecture baseline: DSH product platform + Pi conversational tool-loop kernel + a single DSH source of conversation/execution recovery truth

## 1. Normative terminology

- **MUST**: a V1 release blocker.
- **SHOULD**: must be implemented unless a sufficient justification is recorded.
- **MAY**: optional behavior that does not affect V1 acceptance.
- **MUST NOT**: prohibited in the implementation.
- **P0**: release is prohibited if missing.
- **P1**: should be included in V1; deferral requires project-owner confirmation.
- **P2**: explicitly assigned to V1.1 or later.

This handoff plan approves no P1 deferrals: FR-025, FR-047, FR-052, FR-064, FR-065, FR-071, FR-072, FR-083, NFR-020, NFR-030, NFR-031, and NFR-032 are all included in V1 implementation and acceptance. Implementers must not remove them from V1 on their own; any later owner-approved scope change must first update the requirements, traceability matrix, and corresponding PR plan.

Requirement IDs are stable references. Retain IDs when rewriting requirements; mark removed requirements deprecated without reusing their numbers.

## 2. Product positioning

Local-Harness-pi is a desktop Coding Agent for local code workspaces. It provides a complete DSH-style desktop experience, runs coding tasks with Pi Agent Core, and lets users switch between local and cloud OpenAI-compatible models.

V1's core value is to verify that the following combination works reliably, rather than create a new Agent platform:

1. Existing DSH desktop, session, tool, and plugin capabilities remain complete.
2. The Pi loop can serve as the sole execution kernel.
3. Sessions have one authoritative record and recover from crashes.

## 3. Target users and primary tasks

### 3.1 Target users

- Individual developers using an Agent to write, explain, and fix code in local Windows projects.
- Users who want local models for code privacy while retaining the option to switch to cloud models.
- Advanced users needing Skills, MCP, Goal/Plan, and reviewable tool execution.

### 3.2 Primary tasks

- Open a local workspace and ask questions.
- Have the Agent search, read, and modify files and run commands.
- Review tool calls, diffs, and terminal output.
- Handle permission confirmations before tool execution.
- Switch local/cloud models and reasoning effort.
- Use Skill, MCP, Goal, and Plan modes.
- Restore and continue the original session after closing the application.

## 4. Release platforms and compatibility

### PLAT-001 (P0) Windows release target

Windows 11 x64 is the official V1 release and acceptance target. Windows 10 22H2 may be compatible but is not the sole release-blocking environment. macOS and Linux retain DSH source compatibility and are outside V1 binary release gates.

Acceptance:

- The installer installs, launches, and uninstalls in a clean Windows 11 x64 user environment.
- V1 Alpha is an unsigned NSIS installer for manual installation. Its release page must explicitly state the SmartScreen warning and SHA-256; code signing, automatic installation, and rollback belong to FR-092/V1.1.
- Application data is written to an application-specific directory under Electron `userData`.
- Project files are modified only within the user-selected workspace.

### PLAT-002 (P0) Pinned runtime versions

Node/Electron/pnpm versions must inherit the pinned DSH baseline; Pi Agent Core and Pi AI must both be pinned to `0.85.1`. The lockfile must be committed.

### PLAT-003 (P0) Licenses and provenance

Preserve DSH and Pi MIT licenses and source attribution. Codex is a design reference only; its Apache-2.0 source snippets must not be copied into this project without provenance and license review.

## 5. Workspace and desktop shell

### FR-001 (P0) Open a workspace

Users must be able to open an existing local directory with the system directory picker. Host must resolve its real path and create or reuse a DSH Workspace.

Acceptance:

- Non-directories, unreadable directories, and stale paths display actionable errors.
- Case variants or symlink aliases of the same path must not create two logical Workspaces.
- Recent workspaces can be reopened from the sidebar.

### FR-002 (P0) Single instance and deep links

Retain DSH single-instance behavior. Workspace or session arguments from a second launch should be forwarded to the existing instance; unknown or invalid arguments must not enter the renderer directly.

### FR-003 (P0) Desktop security isolation

The renderer must retain `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, and `webSecurity=true`. The preload layer exposes only a minimal schema-validated API.

### FR-004 (P0) Product identity, About, and licenses

Window title, PWA name, sidebar/empty-session branding, installer name, application data directory, About, and release artifact names must consistently use `Local-Harness-pi`; the application ID is fixed as `io.localharness.pi`. The Windows desktop Help menu must provide About, showing the application version, pinned DSH commit, Pi package version, and a statement that this is not an official OpenAI/DeepSeek product; the same entry must open the third-party license file distributed with the installer. Desktop and Web must not use the official DSH wordmark, fish logo, or favicon as this product's identity; V1 uses the repository's neutral `LHπ` logo without introducing new third-party trademark assets.

Acceptance:

- `THIRD_PARTY_NOTICES.txt` lists at least the DSH and Pi repositories, pinned versions/commits, and MIT licenses; Codex is identified only as an Apache-2.0 design reference, without implying distribution of Codex source.
- About and license access work offline without depending on GitHub availability.
- Packaging tests prove that the license file is present in the Windows unpacked artifact; the window/PWA/sidebar/empty session/first welcome page must not display `DeepSeek Harness` as the current product name.
- `DeepSeek Harness` is allowed only in accurate upstream attribution contexts (About, third-party licenses, `UPSTREAM.md`, source/developer documentation) and internal compatibility identifiers. Do not mechanically rename `@deepseek-ai/dsh-*` package names, Cordis plugin IDs, the `dsh-app` scheme, `window.dshDesktop`, `DSH_*` environment variables, Session/remote event types, or the `dsh` CLI executable.
- The desktop Web profile must disable the default DSH model identity sentence and inject the `Local-Harness-pi` identity; model-facing Web GUI context must not call the current product DeepSeek Harness, but may accurately state that it is built on DeepSeek Harness.

## 6. Sessions and messages

### FR-010 (P0) Create a session

When a user creates a session in a workspace, the system must generate one unique `sessionId` shared by the DSH Agent and DSH Session. Agent scope, Session, UI routes, and logs must not generate a second conversation ID.

### FR-011 (P0) Send an ordinary message

A message sent while idle must enter the DSH `next-turn` Inbox, durably record the inbox splice, and wake the Pi-driven Agent. Once a step accepts the input, it becomes one DSH `user/message`.

Host acknowledges acceptance to Client only after that Inbox splice passes the Session durability barrier. Acceptance: double-clicking send or retrying the network request must not duplicate the same `messageId`; the message remains recoverable if Host is forcefully terminated after acknowledgement.

### FR-012 (P0) Steer and Follow-up

- Immediate steering during execution enters `next-step` and reaches the nearest Pi turn after the current model response and already-started tool batch complete.
- An ordinary follow-up enters `next-turn` and starts a separate turn after the current DSH turn ends.
- The UI must clearly distinguish sent, queued, and accepted states.

### FR-013 (P0) Streaming assistant messages

The frontend must display incremental text, reasoning, and tool-call arguments. Streamed content is transient; arrival of the DSH durable assistant event must replace it in place without retaining two messages.

### FR-014 (P0) Cancellation

Users can cancel the current run. Cancellation must:

- Abort the current provider stream.
- Propagate the signal to started DSH tools.
- Wait for started tools to reach quiescence.
- Write valid closing events for started steps/turns that did not finish normally.
- Clear unaccepted queued input by default; retain it when `keepInbox` is explicit.

### FR-015 (P0) Restore a session

After restarting, the application must restore sessions from DSH JSONL/Zstd Session. Recovery must neither read a Pi session store nor reconstruct content from SQLite FTS.

### FR-016 (P0) Session listing and search

List identity, title, workspace, and availability come from DSH Session/Query. Title/metadata search must work directly; content full-text search opens DSH SQLite FTS on demand when the user first submits a non-empty query, without requiring configuration-file edits. When the index is missing, corrupt, or rebuilding, sessions remain openable from authoritative logs; the UI must distinguish indexing from index failure with retry, and must not report lost sessions.

### FR-017 (P0) Session organization, forking, and export

Retain existing DSH entries for session renaming, search, archive, unarchive, fork, and export. Archive is the only default removal action in V1; do not add a permanent session deletion button.

Acceptance:

- DSH Session/Query persists rename and archive state consistently across restarts.
- Archived sessions are absent from the default list but can be opened and unarchived through the archive filter.
- Forking copies only a balanced prefix of completed events and records `parentSession`; it must not copy open steps, dangling tool calls, or Pi runtime objects.
- The Header and `/export` must export the same DSH Session generation; full export explicitly warns that it may contain prompts, code, and tool output.

### FR-018 (P0) Single writer

A session can have only one active writer at a time. A second process or recovery operation must fail explicitly instead of using last-writer-wins behavior.

### FR-019 (P0) Long-session compaction

DSH Compaction and surface replacement must retain responsibility for long-session compaction. Pi Harness Compaction is prohibited in production dependencies; Pi must read the latest DSH surface generation at every step.

Acceptance:

- Integration tests cover automatic pressure triggers, single compaction recovery after provider context overflow, and manual `/compact`.
- After successful compaction, the next step uses only the new surface without appending the old Pi transcript back; original durable event history remains auditable.
- Failed compaction must not overwrite the old surface; if compaction is definitively impossible, return an actionable error instead of retrying indefinitely.
- After restart, recover from DSH compaction/surface events without reading a Pi session store.

## 7. Pi execution kernel

### FR-020 (P0) Sole active kernel

V1's default composition must activate exactly one AgentFactory, `@local-harness/pi-agent-loop`. This implementation must inherit DSH `AgentLoop` creation, recovery, publication, rollback, and disposal lifecycle, constructing `DshPiAgent` only through the protected machine-construction seam; the original DSH ReactLoopAgent must not activate simultaneously, and the Pi package must not copy or reimplement a second AgentFactory lifecycle.

### FR-021 (P0) Pi dependency boundary

Production runtime may use only Pi Agent Core's low-level `runAgentLoop()`, events, and tool types. V1 must not construct the stateful Pi `Agent`. Loading Pi Harness Session, Skills, Compaction, and built-in coding tools is prohibited.

### FR-022 (P0) Context reconstruction

Before each model step, Pi context must be rebuilt from the current DSH Session surface, DSH System Prompt assembly, DSH Tool schemas, and DSH model selection. The previous step's in-memory Pi transcript must not be the sole input.

### FR-023 (P0) Event barriers

Kernel event-sink promises must be awaited in order. `agent_end` may transition the DSH Agent to idle only after all DSH Session appends, the end-of-turn `ctx.sessions.flush(session)`, and required cleanup complete.

### FR-024 (P0) Turn/Step mapping

One Pi run maps to one DSH turn; each Pi `turn_start`/`turn_end` maps to one DSH step. A state machine must validate this mapping; an invalid order immediately raises `KERNEL_EVENT_ORDER` and stops execution.

### FR-025 (P1) Future kernel interface

Pi must sit behind `KernelDriver`. DSH Agent/UI/Session must not import Pi event types. V1 `KernelDriver` abstracts only the conversational model-tool loop and does not promise general agent graphs, multi-Agent orchestration, or arbitrary background workflows. V1 requires no second implementation; a small test-local fake driver is sufficient for machine contract tests.

### FR-026 (P0) Serial V1 tool execution

The Pi-backed V1 loop must execute tool calls serially in assistant source order. Its kernel descriptor reports `parallelTools: false`; each Pi proxy reports sequential execution; and `maxParallelToolCalls` does not alter the Pi machine. Parallel dispatch and commit reordering belong to `PARALLEL-110` and are not V1 acceptance requirements.

## 8. Model configuration and invocation

### FR-030 (P0) Local OpenAI-compatible route

Users must be able to configure loopback `baseUrl`, wire API, model ID, context window, maximum output tokens, and reasoning effort. HTTP is allowed only for loopback addresses; remote non-TLS URLs must be rejected. Base URLs prohibit userinfo, query, and fragment components; credentials must not be hidden in URLs.

### FR-031 (P0) Cloud OpenAI-compatible route

Users must be able to configure HTTPS `baseUrl`, wire API, model ID, and credential reference. Base URLs prohibit userinfo, query, and fragment components. API keys must not be stored in ordinary settings JSON, Session, logs, or UI state snapshots. V1 does not expose arbitrary request-header editing; only Host may construct standard OpenAI Authorization from a credential reference.

### FR-032 (P0) Explicit wire API

A route must explicitly select:

- `openai-responses`
- `openai-completions`

Do not infer it automatically from whether the path contains `/responses`.

### FR-033 (P0) Model discovery and manual models

Users can refresh a provider's model list when discovery is supported; otherwise they can declare models manually. Discovery failure must not delete existing usable manual configuration.

### FR-034 (P0) Request freezing

Provider, model, reasoning, maxTokens, resolved credentials, and provider snapshot must be frozen before the first await in a step. Settings changes affect only subsequent steps.

### FR-035 (P0) Capability validation

Before making a request, validate image input, reasoning level, tool calls, and context capacity. Explicitly unsupported capabilities should return stable error codes rather than being silently dropped.

### FR-036 (P0) Errors and retries

Classify authentication, rate limiting, quota, timeout, context overflow, invalid requests, server errors, and transport interruption. Retries use DSH policy and record attempts; cancellation, authentication failure, invalid requests, and definitive context overflow must not be blindly retried.

### FR-037 (P0) V1 outbound scope

V1 model connections implement only outbound OpenAI-compatible calls. Direct Anthropic/Gemini protocols and an inbound OpenAI-compatible gateway must not become implicit V1 dependencies.

V1 model streaming is fixed to HTTP SSE; WebSocket transport must not appear in the product write path. Model discovery, model streaming, and HTTP MCP must reuse one Host guarded-fetch implementation, enforcing consistent initial URL, DNS pinning, redirect, credential-origin, and resource-release policies.

## 9. Tools and permissions

### FR-040 (P0) DSH tool catalog

Tools visible to Pi must come from the current Agent scope's DSH `tools.schemas()` snapshot. Tools hidden by Plan mode, preset, or policy must not appear in Pi schemas.

### FR-041 (P0) Unified execution pipeline

Every Pi tool call must enter DSH `tools.execute()`. Preserve tool arguments, callId, agent, and AbortSignal.

### FR-042 (P0) Durable tool-call ordering

`tool/call` must be appended and pass that Session's `flush()` durability barrier before the tool body starts; `tool/result` must be appended only after body/policy execution fully ends and reference the corresponding call seq. Parallel results are written in assistant source order.

### FR-043 (P0) Approval

When a tool policy is `ask`, the UI shows its name, key arguments, risk explanation, and scope. Execution requires `allowed-once` or permission from the current policy. Denial must produce a model-visible structured error result.

### FR-044 (P0) Workspace restrictions

File reads/writes, search, patches, and command working directories must stay within the authorized workspace. Validate paths after normalization and symlink resolution; tests must cover path traversal, UNC/device paths, and alias bypasses.

### FR-045 (P0) Tool failures

Unknown tools, schema errors, approval denial, timeout, cancellation, invalid output, and execution exceptions must converge to one `tool/call` + `tool/result` pair unless Session itself can no longer be written.

### FR-046 (P0) Additional context and early termination

DSH `additionalContexts` must enter the next step after results; `concludesTurn` must map to Pi batch termination, stopping automatic model invocation only when all results in the batch request termination.

### FR-047 (P1) Tool presentation

Tool cards display status, name, brief objective, duration, and result summary by default. Arguments, full output, errors, and metadata can be expanded. Session replay should reconstruct presentation from durable events.

## 10. Goal and Plan

### FR-050 (P0) Goal

Retain DSH `/goal` capability and UI entry. Goal creation, updates, completion, and blocked state must be written to DSH `goal/change` and reconstructed after recovery.

### FR-051 (P0) Plan

Retain DSH `/plan` capability and UI entry. Plan mode state is written to DSH `plan/mode`; entering Plan must apply tool restrictions to Pi's next tool snapshot.

### FR-052 (P1) Consistent settings and shortcuts

The settings page and Composer '+' menu must read the same DSH client state for Goal/Plan display, without maintaining separate booleans.

## 11. Skills, MCP, and plugins

### FR-060 (P0) Skill discovery

Reuse DSH Skill/Skill Filesystem. Discover Skill metadata first; read `SKILL.md` and necessary references only after a match, avoiding loading every skill's full content into context.

### FR-061 (P0) Skill scope

Skills from global, workspace, and plugin sources must retain deterministic precedence and conflict diagnostics. Paths must not escape the declared Skill root.

### FR-062 (P0) MCP Client

Reuse DSH MCP Client with the local-process and HTTP transports already available in V1. Connection failure should be isolated to that server without preventing other servers or built-in tools from loading.

### FR-063 (P0) Unified MCP tool registration

MCP tools must register with DSH Tool Registry before ToolBridge exposes them to Pi. Pi does not directly own a second MCP client.

### FR-064 (P1) Plugin inventory

The plugin page should show loaded plugins' Skills, MCP, permission declarations, provenance, and load errors. V1 does not promise installation or redistribution of OpenAI curated plugins.

### FR-065 (P1) Plugin permission declarations

V1 must display effective file, command, network, and MCP permissions declared and enforced by DSH settings/composition; baseline denial remains enforced by DSH workspace, network, approval, and `tools/pre-execute` policies. V1 treats installed executable DSH plugin packages as trusted source and does not add a portable manifest permission field it cannot fully enforce. Cross-source plugin manifests, fine-grained grants, signatures, and trust chains belong to V1.1.

### FR-066 (P0) Graphical MCP management

The settings page must let users graphically add, edit, enable, disable, and remove GUI-managed MCP servers, showing connection phase, last error, and tool count. Support DSH MCP Client's existing `stdio` and `streamable-http` transports; MCP rows provided by fixed composition are read-only and cannot be overridden by the UI.

GUI-managed server fields are fixed: stable record ID, unique `serverName`, transport, `toolCallTimeoutMs`, reconnection policy, plus:

- `stdio`: `command`, `args[]`, optional `cwd`, and environment-variable-name bindings to credential references.
- `streamable-http`: `url` and HTTP-header-name bindings to credential references; public Authorization prefixes such as `Bearer ` may be stored separately, but credential values must not enter configuration.

V1 does not provide an arbitrary shell command-line text box; `command` and each argument must be passed as separate fields to DSH stdio transport without shell expansion.

### FR-067 (P0) MCP configuration consistency and application

Host must persist GUI-managed MCP configuration in the `local-harness.mcp` DSH settings namespace; Client must not store a copy. Enabled records mount once in DSH Tool Registry's deployment-global/root layer, and all Agent scopes inherit the same tool generation; do not create per-session MCP configuration or connection copies. Every write must carry a document revision and update the complete server record through compare-and-swap; concurrent edits return a stable conflict, not last-writer-wins overwriting.

Application rules are fixed:

- New records default to `enabled=false`; enable only after all referenced credentials resolve.
- Successful saving means configuration was atomically committed, not that the external server is connected; runtime phase is returned independently as `applying | active | error | disabled`.
- Rebuild only changed DSH MCP Client fibers; do not interrupt other servers or built-in tools.
- Changing `serverName` changes model-visible tool names, so display a warning and require `acknowledgeToolRename=true` in the request.
- Removal deletes configuration and stops that server without automatically deleting credential references, which may be shared by other configurations.
- A credential update restarts only servers referencing it; resolved values never return to Client, Session, logs, or inventory.
- Reject `serverName` conflicts between composition MCP and GUI-managed MCP before committing.
- HTTP MCP permits only HTTPS, or HTTP whose hostname is `localhost` or a loopback IP literal; URLs prohibit userinfo, query, and fragment components. Revalidate every redirect hop; requests with credential-bound headers must not follow cross-origin redirects.

## 12. Attachments, PDF, and browser

### FR-070 (P0) Attachments

The Composer '+' menu allows selecting attachments already supported by DSH. File bytes reside in DSH Attachment Store; Session stores only references and metadata.

### FR-071 (P1) PDF preview

V1 must retain DSH PDF preview. Preview failure must not damage a session and does not imply PDF editing support.

### FR-072 (P1) Basic web capabilities

V1 retains DSH `web_search`, `web_fetch`, and opening links in the system browser. Network access follows DSH egress/approval settings.

### FR-073 (P2) Office/PDF editing

Word, Excel, and PDF creation or editing plugins belong to V1.1 and are not V1 release conditions.

### FR-074 (P2) Full browser automation

Playwright/Computer-use, authenticated state, downloads, and page interaction belong to V1.1 and are not V1 release conditions.

## 13. Settings and interaction entry points

### FR-080 (P0) Settings sections

The settings page provides at least:

- Models: routes, models, reasoning, and connectivity tests.
- Tools & Permissions: default policies, workspace, and network.
- Skills: sources, enabled state, and errors.
- MCP: servers, transports, connection state, and tool counts.
- Experimental: experimental options disabled by default.
- About: versions, pinned upstream provenance, and offline third-party license access.

### FR-081 (P0) Composer '+' menu

The '+' menu provides at least attachments, Skill, MCP/tools, Goal, and Plan. It provides frequent actions only; full configuration opens the settings page.

### FR-082 (P0) Single configuration source

The settings page, '+' menu, model selector, and Host must use the same DSH settings/service state. Frontend local storage may retain only non-authoritative UI preferences, never model keys or permission facts.

### FR-083 (P1) Collapsible tool calls

The default view should resemble Codex's compact status presentation, showing raw arguments/output only when expanded. This adjustment must not change DSH durable events or tool execution semantics.

## 14. Updates and releases

### FR-090 (P0) Update policy

Retain DSH updater code, but disable automatic downloading and installation by default in Alpha builds. On explicit user checks, the application may query GitHub Release and show version, notes, and a manual download link.

### FR-091 (P0) Failure isolation

Failed update checks must not prevent startup or repeatedly display dialogs. Logs must not contain GitHub tokens or private system information.

### FR-092 (P2) Signed automatic installation

Signature verification, automatic downloading, automatic installation, rollback, and forced updates belong to V1.1.

## 15. Session data quality and recovery

### NFR-001 (P0) Single source of truth

Any conversation or execution fact that can affect model behavior after recovery must exist in DSH Session. Pi memory, SQLite FTS, React stores, logs, and telemetry must not become supplementary sources of truth. Domain objects such as Decision, Evidence, and Artifact may have independent storage owned by domain services, but their stable references, state changes, and results affecting model context or execution recovery must be written to DSH Session; domain storage must not copy transcripts or become an implicit execution log.

### NFR-002 (P0) Appending and immutability

Committed Session events must not be updated in place. Format changes migrate through a new generation; older generations remain immutable.

### NFR-003 (P0) Crash recovery

An incomplete trailing raw JSONL line may be discarded; a torn Zstd tail recovers only complete records. Checksum, decompression, or structural failure in a complete frame must report corruption instead of being silently repaired.

### NFR-004 (P0) Unknown outcome

Side-effect outcomes with recorded `tool/call` but no `tool/result` must be marked `TOOL_OUTCOME_UNKNOWN`. The system may recommend verification but must not automatically repeat execution.

### NFR-005 (P0) Rebuildable index

After the SQLite derived index is deleted or corrupted, the system must rebuild it by reading only DSH Session; sessions remain directly openable before rebuilding.

### NFR-006 (P0) Durability barriers

The Session write handle's `flush()` must be called and complete successfully at these boundaries: before Client acknowledges user-message acceptance, before a tool body starts, and before turn completion/Agent idle. Successful `append()` followed by failed `flush()` cannot return success.

## 16. Security and privacy

### NFR-010 (P0) Credentials

Only DSH credential store/reference may resolve credentials. All user-visible configuration exports, Sessions, errors, and diagnostic bundles must redact secrets.

### NFR-011 (P0) Network

Local routes permit only loopback HTTP/HTTPS; cloud routes require HTTPS. Revalidate the final URL after redirects. V1 product routes with `location` must not inherit Pi catalog OAuth/ambient auth, system proxy credentials, or arbitrary environment Authorization; local routes without credentials must be truly keyless, while cloud routes use only explicit DSH credential references.

### NFR-012（P0）Electron

The renderer is prohibited from directly accessing Node, the filesystem, shell, or credential store. All privileged behavior goes through Host interfaces and permission policies.

### NFR-013 (P0) Plugins

Plugin load errors should be isolated and displayed. External programs, network, and file permissions declared by plugins are auditable on first use. Unknown manifest fields cannot expand permissions.

### NFR-014 (P0) Content logging

Default diagnostic logs exclude prompts, assistant content, raw tool output, file content, and attachment bytes. Explicitly describe the scope when users choose to export full diagnostics.

## 17. Performance and reliability

### NFR-020 (P1) Relative performance gates

On the same fixed workspace and mock provider, relative to the pinned DSH baseline:

- Median cold startup must not regress by more than 15%.
- Additional median latency from the first Host stream event to UI presentation must not exceed 100ms.
- Idle memory must not regress by more than 20%.
- Listing 1000 historical sessions must not regress by more than 15%.

If the DSH baseline itself fluctuates, attach raw measurements for project-owner judgment; do not remove features to pass the gates.

### NFR-021 (P0) Bounded caches

Pi event sequencing, stream deltas, the single active serial tool-result cache, tool output previews, and Session projection buffers must have explicit bounds. Large output should retain DSH truncation or attachment/spill policies.

### NFR-022 (P0) Resource cleanup

Cancellation, session closure, workspace changes, and application exit must await cleanup of providers, tools, Session handles, and scoped services. No background promise may continue writing to an old Session.

## 18. Accessibility and usability

### NFR-030 (P1) Keyboard operation

Sending, cancellation, opening the '+' menu, selecting a model, opening settings, and dismissing dialogs must be possible by keyboard. Approval dialogs must not leave focus on the background page.

### NFR-031 (P1) Actionable errors

Errors display at least a stable error code, brief cause, and next action. Model connection errors should distinguish base URL, authentication, missing model, and network failures.

### NFR-032 (P1) Understandable status

The UI must distinguish waiting for model, streaming, awaiting approval, executing tools, cancelling, recovering, and idle. One perpetual spinner cannot represent all states.

## 19. Testing and release acceptance

### TEST-001 (P0) Source and dependency gates

- Pinned upstream hashes/versions match documentation.
- The lockfile contains no floating Pi versions.
- Production dependencies exclude Pi Harness Session/Skills/Compaction.
- Default composition has exactly one AgentFactory.

### TEST-002 (P0) Model matrix

Verify at least:

1. Local mock OpenAI Chat Completions: text, tools, streaming, cancellation, and errors.
2. Local mock OpenAI Responses: text, tools, streaming, cancellation, and errors.
3. A manual smoke test of one real loopback-compatible service.
4. A controlled smoke test of one real HTTPS OpenAI-compatible cloud route; CI may skip without a key, but release records must contain results.

### TEST-003 (P0) Tool matrix

Cover at least file reading, search, patch, shell, unknown tools, schema errors, approval allow/deny, timeout, cancellation, two tool calls executing and committing serially in assistant source order, `additionalContexts`, and `concludesTurn`. Assert that the Pi kernel never overlaps two tool bodies.

### TEST-004 (P0) Session recovery matrix

Cover at least:

- Recovery after exiting while idle.
- Interrupted assistant streaming.
- Tool call recorded, body not started.
- Body started, result not recorded.
- Step ended, turn not ended.
- raw torn line。
- Zstd torn final frame。
- Complete-frame checksum corruption.
- Missing or corrupt SQLite files.
- A second writer contending for the same session.
- Termination and recovery after automatic/manual compaction.
- Successful retry after context overflow triggers one DSH compaction; compaction failure does not loop.

### TEST-005 (P0) Product capability matrix

Goal, Plan, Skill, MCP, attachments, PDF preview, model switching, settings, and the '+' menu must each have at least one integration or desktop E2E case. Also cover first model configuration, session rename/search/archive/restore/fork/export, Diff, Terminal, About/licenses, and MCP stdio/HTTP add, enable/disable, edit, conflicts, failure isolation, and removal.

### TEST-006 (P0) Security matrix

Cover at least IPC sender rejection, navigation/window-open rejection, path traversal, symlink escape, remote HTTP model-route rejection, credential redaction, and unauthorized network tools.

## 20. V1 end-to-end acceptance scenarios

### AC-001 Local model completes a code change

Given a loopback OpenAI-compatible model and a test workspace, the user requests a cross-file bug fix. The Agent should read files, obtain required approvals, apply a patch, run tests, and show the diff; after restart, the same complete session remains visible and resumable.

### AC-002 Cloud model changes take effect at step boundaries

Changing model settings during execution leaves the current stream on its original provider/model; the next Pi turn uses the new configuration, and the Session request header explains the change.

### AC-003 Unknown tool outcome is not replayed

Forcefully terminate Host after a side-effecting shell tool starts. Recovery shows `TOOL_OUTCOME_UNKNOWN`; the Agent does not automatically rerun the command and prompts the user to verify external state.

### AC-004 Derived-index corruption does not lose sessions

Corrupt the SQLite FTS file after closing the application. After restart, the application can still directly open JSONL/Zstd sessions and trigger index rebuilding.

### AC-005 Goal/Plan/Skill/MCP coexistence

In one session, set a Goal, enter Plan, trigger a filesystem Skill, call an MCP tool, and exit Plan. Recovery projects all state correctly; Pi has no second plugin or plan record.

### AC-006 No duplicate frontend messages

During high-latency streaming, tool calls, and rapid session switching, each durable messageId appears once; late transient frames from old sessions are discarded.

### AC-007 First launch and model fallback

A clean profile's first launch must open Models onboarding and disable Send. Sending becomes available after configuring a keyless loopback route; a cloud route without credentials remains unavailable. Failed model discovery preserves the manually entered model ID; fixing the connection makes it usable without recreating the session.

### AC-008 Complete session-library workflow

Users can rename a session, search its content, archive and restore it from archive view, fork a completed turn, and export the current generation; after each operation and application restart, listing and opening results remain consistent.

### AC-009 Complete MCP management workflow

The user adds a stdio server disabled by default, configures its credential reference, enables it, and calls a tool; then adds an HTTP server. If one server fails to connect, the other and built-in tools remain usable. A revision conflict during editing preserves the local draft and requires refresh; removal makes the corresponding tools disappear while historical tool events remain displayable.

### AC-010 Complete long-session workflow

Use a small context-window mock route to reach the automatic compaction threshold, and separately test `/compact` and provider context-overflow paths. Continue with a tool-calling turn after compaction; after restart, model surface, complete audit history, and UI projection remain consistent.

## 21. Definition of Done

V1 is complete only when all of the following hold:

- All P0 requirements pass, and any P1 deferral has an explicit project-owner record.
- TEST-001 through TEST-006 have reproducible commands and results.
- AC-001 through AC-010 have evidence.
- No Pi durable session, second chat DB, or frontend persistent transcript exists.
- The Windows 11 installer passes a clean-environment smoke test.
- License, provenance, settings migration, session format, and known-limitations documentation is complete.
- Code review has no unresolved P0/P1 defects.

## 22. V1.1 requirements pool

V1.1 candidate requirements are fixed:

- DOC-110: Word document creation, editing, and rendering-validation plugin.
- SHEET-110: Excel workbook creation, editing, formula calculation, and rendering-validation plugin.
- PDF-110: PDF creation, editing, forms, and visual-inspection plugin.
- BROWSER-110: Playwright browser automation with an independent permission domain.
- UPDATE-110: Signed automatic updates, installation rollback, and release-key workflow.
- SECURITY-110: Plugin signatures, fine-grained capability grants, network isolation, and audit export.
- PARALLEL-110: Argument-aware parallel Pi tool scheduling, bounded out-of-order completion buffering, source-order durable commits, and its crash/recovery matrix.

Before V1 release, retain only extension interfaces for these requirements; do not implement them early.

## 23. PR traceability

| Requirement scope | Primary PR |
|---|---|
| PLAT, FR-001–004, baseline NFR-010–014 | PR-A |
| FR-010–019、FR-020–026、FR-030–037、FR-040–047、NFR-001–006、TEST-001–004、AC-010 | PR-B |
| FR-050–052、FR-060–067、FR-070–074、FR-080–083、FR-090–092、NFR-020–032、TEST-005–006、AC-001–009 | PR-C |

PR-C must follow passing PR-B recovery and contract tests; the UI must not permanently bypass the real Pi/DSH bridge through mocks.
