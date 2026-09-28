# Local-Harness-pi Session Consistency and Recovery Specification

English | [中文](session-consistency.zh.md)

Document version: 1.1

Applicable release: V1

Highest principle: the DSH Session log is the only source of session truth

## 1. Problem to solve

This project explicitly avoids storing separate execution and display records, where a misaligned write or migration can cause lost, duplicated, out-of-order, or unrecoverable messages.

V1 therefore eliminates the second authoritative writer instead of synchronizing dual writes:

- DSH append-only Session log: authoritative and recoverable.
- DSH SQLite FTS: derived, disposable, and rebuildable.
- Pi Agent state: disposable runtime cache for the current process.
- Frontend store: disposable display projection for the current page.
- Diagnostic logs/telemetry: observations that cannot be used for recovery.

Any fact that changes model input, tool results, Goal/Plan, permission results, or the user queue after recovery must first exist in DSH Session.

## 2. Authoritative data categories

### 2.1 Data that must be written to DSH Session

- Session header, workspace/cwd, parent-child lineage, creation time, and origin.
- Request header/context and a recoverable description of model route/model/reasoning configuration.
- System, User, Assistant, and Tool Result messages.
- turn/start、turn/end、step/start、step/end。
- tool/call, tool/result, and call/result associations.
- Agent Inbox splices, including the projection facts required for pending, claim, and cancel.
- Goal changes.
- Plan mode changes.
- Compaction/replace surface events.
- Synthetic closers appended during recovery.

### 2.2 Data excluded from DSH Session content

- Per-character/token assistant UI frames; preserve them in the original DSH format only when required by the final assistant event's embedded stream.
- High-frequency transient tool progress frames.
- UI preferences such as spinners, expanded/collapsed state, and panel sizes.
- SQLite FTS tokens/rankings/snippets.
- Pi pendingToolCalls、isStreaming、listener、AbortController。
- API keys, Authorization headers, or raw attachment bytes.

### 2.3 Attachments

DSH Attachment Store persists attachment bytes. Session stores immutable references, types, and required metadata. A Session reference is the authoritative relationship; Attachment Store is dedicated content storage for that reference, not a second conversation record.

## 3. Storage locations

Actual paths must derive from Electron `app.getPath('userData')` and the DSH path service, not the process cwd. Logical layout:

```text
<userData>/harness/         Electron 为 Host 设置的 DSH_HOME
  sessions/                DSH JSONL/Zstd generations
  session-search.db        DSH SQLite 派生索引
  attachments/             DSH 附件内容
  settings/                DSH 设置与凭据引用
```

The implementation should retain DSH project/session directory encoding so cwd remains readable and sessionId is safe as a single path segment without collisions. Filenames and specific directories may follow upstream changes, but the three storage categories must not share one database file.

## 4. Physical format

V1 uses the Zstandard mode of DSH `session-persistence-jsonl` by default:

- One directory per session.
- One immutable historical file per format generation.
- The first frame in the current generation is the header.
- Each subsequent durable append batch is a separate Zstd frame with a checksum.
- `compression='none'` is only for diagnostics or a new dedicated root; compression modes are not mixed within one root.

Published older generations are not rewritten in place. Migration creates a higher-version successor and leaves the source bytes unchanged.

## 5. Core invariants

### INV-S01 Single identity

An active Agent's `agent.id` must equal `agent.session.id`. UI routes, approvals, tool calls, and runtime events must all carry the same sessionId.

### INV-S02 Single writer

A session has at most one write handle within a backend instance, within a process, and across processes. Contenders must receive `SESSION_WRITE_CONFLICT`.

### INV-S03 Append only

Committed events are never modified in place or deleted, and their seq values are never reused. Corrections append new events or use a supported generation migration.

### INV-S04 Continuous sequence

Logical event seq values are continuous and monotonic. A Client that detects a seq gap reloads the snapshot; it must not insert placeholder events to fill the gap.

### INV-S05 Balanced boundaries

Turns/steps in a stable session prefix must follow this nesting order:

- step/start can occur only after turn/start.
- At most one step is open at a time.
- step/end must match the currently open step.
- No step is open before turn/end.
- The previous turn has ended before a new turn starts.

If the physical data is valid but the last turn was interrupted, recovery appends synthetic closers before publishing it.

### INV-S06 Tool pairing

Each `tool/result` must reference the seq of a unique `tool/call` in the same step; each `tool/call` in a completed step must eventually have one result.

### INV-S07 Single assistant commit

A model attempt produces at most one durable `assistant/message`; a failed or interrupted attempt without a committable message produces an `assistant/attempt`. Both must not be appended as completion results for the same attempt.

### INV-S08 Inbox authority

Only the `agent/inbox/spliced` projection determines inputs that have not yet been accepted. Pi queue entries and optimistic UI items must not be recovered as new inputs.

### INV-S09 Explainable configuration

Each model step's request header/context must identify its provider, model, tool surface, and request series. Mid-step configuration changes take effect only from the next step.

### INV-S10 Derived layers never write back

SQLite, Pi state, and UI snapshots never generate or overwrite DSH Session events. They can only read Session or consume live notifications.

### INV-S11 Completion barrier

Before the UI displays completion, the Agent enters idle, or Host returns success, the Session appends required for that phase must be committed in DSH Session and complete the corresponding `flush()` durability barrier. A Session append or flush failure must fail the run.

### INV-S12 Errors never masquerade as success

Corruption, migration refusal, write failure, event-order violations, and unknown tool outcomes must all be visible. Error events must not be discarded to mark a turn completed.

## 6. Session write path

Logical order of the normal path:

1. Append a user command as an Inbox splice with a unique messageId.
2. The Agent driver opens a turn and appends `turn/start`.
3. Append `step/start` after pre-step accepts messages.
4. Append system updates and accepted `user/message` events.
5. Append/update the request header/context.
6. Deliver model streaming to the UI through runtime frames; append one `assistant/message` or `assistant/attempt` on completion.
7. For each tool, append `tool/call` before entering the DSH Tools pipeline.
8. Append `tool/result` events in assistant source order.
9. Append `step/end`.
10. Append `turn/end` when no further tools or steering remain.
11. Report completion or idle externally only after the turn durability barrier completes.

DSH `Session.append()` is the logical commit point: it synchronously validates events, assigns seq values, updates projections, and notifies the persistence path. It does not by itself provide the crash-resistance guarantee of general persistence. Before AgentHandle closes, it must drain/close the write handle; specified external commitment points must explicitly call `flush()`.

## 7. Convergence from runtime state to durable state

### 7.1 Assistant stream

Host generates the following for each stream frame:

- `sessionId`
- `runId`
- Monotonic `revision`
- Pi attempt/tool identifiers

The frontend displays frames only in memory. When the final `assistant/message` arrives with its DSH seq, the frontend replaces the frame with the durable projection.

If the stream is interrupted:

- Commit an interrupted assistant message under DSH rules when usable content exists.
- Commit an assistant attempt when no usable content exists.
- Discard old runtime frames when state converges or the Client reconnects.

### 7.2 Tool progress

Progress is only for the currently executing UI. The final tool/result is the only recovery source. Reopening a session does not replay progress animations.

### 7.3 Approval

Waiting for approval is runtime state, but approval decisions must be associated with the corresponding callId through DSH tool policy. An approval pending at application exit does not transfer to a new call; after recovery, that tool result converges to outcome unknown or aborted under interruption rules.

## 8. Persistence commits and fsync

Retain DSH backend semantics:

- A new Session may remain unmaterialized until its first append or explicit flush.
- Initial materialization uses no-overwrite publication to prevent overwriting the same ID.
- Successful `append()` means the batch is accepted, ordered, and visible to subsequent reads on the same backend, but the backend may buffer physical writes.
- Only successful `flush()` guarantees crash resistance for all previously acknowledged appends.
- Physical write or fsync failure must not present the failed batch as durable.
- Committed events are never rewritten.
- Handle close must wait for buffered events to be written and fsynced.

V1 uses the DSH persistence flush seam and does not add a separate WAL. Three durability barriers are mandatory:

1. **Message acknowledgement barrier**: flush the Inbox splice before Host returns an accepted acknowledgement for the user message to Client.
2. **Pre-side-effect barrier**: flush after each `tool/call` append and before its tool body starts. Recovery then knows the outcome is unknown if a crash follows external tool side effects, rather than incorrectly treating the tool as never called.
3. **Turn completion barrier**: flush after appending `turn/end` and before the Agent enters idle or returns success.

These barriers take precedence over performance. Later batching may combine them only with proof of equivalent safety semantics; it cannot remove them.

## 9. Crash recovery algorithm

Recovery must follow this order:

1. Resolve and validate the sessionId storage path.
2. Select the canonical generation with the highest number.
3. Acquire write ownership; stop if acquisition fails.
4. Scan the header and physical frames.
5. Perform physical recovery of a torn tail.
6. Migrate historical generations to current logical events, but publish a successor only on write open.
7. Validate the structure of logical events.
8. Determine open turns/steps and dangling tool calls.
9. Append DSH synthetic closers.
10. Create DSH Session/Projection from repaired events.
11. Create empty Pi runtime state and project context from the DSH surface.
12. Publish Session, Agent, and the UI snapshot.

A failure at any recovery step must not publish a partially configured Agent.

## 10. Physical tail handling

| Condition | Handling |
|---|---|
| Incomplete final raw JSONL line | Discard the incomplete trailing line and retain all preceding complete lines |
| Truncated final Zstd frame | Recover fully decoded JSONL records in the frame; truncate torn bytes and durably rewrite recovered records before the write handle's first append |
| Complete frame fails checksum validation | Return `SESSION_CORRUPT` and refuse to open |
| Complete frame fails decompression | Return `SESSION_CORRUPT` and refuse to open |
| Complete JSON structure violates the format | Return `SESSION_CORRUPT` or refuse migration; do not truncate it as an ordinary torn tail |
| Mismatched compression within the same root | Refuse; no mixed-mode fallback |
| Unsupported future generation exists | Return `SESSION_MIGRATION_REFUSED` and preserve original files |

Best-effort opening must not hide corruption in complete committed frames, because that would mislead the user into trusting the history.

## 11. Semantic interruption repair

### 11.1 Request has not produced a durable assistant/tool call

Append the required assistant attempt, step/end, and turn/end(aborted/error). The user can retry manually; the system must not fabricate assistant content.

### 11.2 Tool call recorded, body definitely not started

Append `tool/result` with `TOOL_NOT_STARTED` or its upstream equivalent, indicating that the model can decide on a safe retry in the next turn.

### 11.3 Tool body may have started, result not recorded

Append `tool/result`:

```json
{
  "isError": true,
  "error": {
    "code": "TOOL_OUTCOME_UNKNOWN",
    "message": "The tool may have produced external effects before the session was interrupted. Verify state before retrying."
  }
}
```

Mandatory behavior:

- Do not replay automatically.
- Deliver the error to the model in the next turn.
- Mark the UI as outcome unknown rather than an ordinary failure.
- Let the user inspect diffs, files, command output, or external systems before deciding.

### 11.4 Tool result recorded, step/end missing

Append only step/end and turn/end repairs; do not execute the tool again.

### 11.5 Assistant complete, turn/end missing

Append the correct step/turn closer according to the assistant stop reason and subsequent tool-pairing state; do not mark every case completed.

## 12. Idempotency and duplicate messages

### 12.1 User message

`(sessionId, messageId)` is the unique identity. A retry with the same content and ID returns accepted status; the same ID with different content returns `PROTOCOL_INVALID_ENVELOPE`.

### 12.2 Tool call

`(sessionId, callId)` is unique within a request series. The same callId reaching the bridge again is a kernel invariant error and must not execute again.

### 12.3 Approval

`(sessionId, callId)` consumes only the first decision. An identical repeated decision returns the original result; a conflicting decision returns stale/conflict.

### 12.4 Client event

- Durable: deduplicate by `(sessionId, seq)`.
- Runtime: deduplicate by `(sessionId, runId, revision)`.

Client does not identify duplicates by message text, timestamps, or array position.

## 13. Serial Pi tools in V1

Pi V1 executes tools serially in assistant source order:

1. Assign `sourceIndex` in assistant-content order.
2. Append one `tool/call` and finish the pre-effect flush.
3. Execute that call through DSH Tools.
4. Append its linked `tool/result` before starting the next call.
5. Append `step/end` only after the last result settles.

This requires no reorder buffer and keeps replay, model input, and UI deterministic. Parallel Pi tools and their crash-recovery contract belong to `PARALLEL-110`.

## 14. SQLite derived index

SQLite FTS stores only search documents and generation/cursor state observed from DSH persisted/live Session.

Desktop V1 uses the `first-search` opening policy for content indexing: startup and ordinary session listing do not force SQLite open; when the user first submits a non-empty content query, Host opens or creates the index and starts reconciliation. The product must set exactly `path: !!js dshHomePath('session-search.db')` and `openAt: first-search` in the `session-query-sqlite` override in `packages/bundle/web-app/cordis.patch.yml`; retain `openAt: never` in the base bundle without changing defaults for non-Web/desktop profiles. Client localStorage must not determine this policy.

Requirements:

- Use a separate database path.
- Mark database application ownership; refuse to take over a database containing unknown user tables.
- Every index record is traceable to sessionId, event seq, and persistence revision.
- Reconciliation takes Session as input and must not correct Session using SQLite content.
- Exact session reads still work when search is disabled or the index cannot open.
- Cursors include the index generation; rebuilding invalidates old cursors instead of returning an incorrect page.

### 14.1 Rebuild triggers

The following conditions trigger an index rebuild or a new generation:

- The database does not exist.
- Schema/version mismatch with supported rebuilding.
- Index corruption.
- Persistence revision differs from the recorded revision.
- The user explicitly selects rebuild session search index.

Rebuilding should first close the index owner, move the old file to a timestamped single-file backup, then create a new index. The application does not automatically delete the backup before confirming that the new index is usable.

### 14.2 UI during rebuilding

- Session listing and direct opening remain available.
- Full-text search shows indexing status and progress.
- Search results paginate within one explicit generation only.
- A failed rebuild displays an error without marking sessions lost.

## 15. Frontend projection and reconnection

Reconnection flow:

1. Client requests `SessionViewSnapshot`.
2. Host returns `generation`, `throughSeq`, events, and projections.
3. Client atomically replaces durable state.
4. Client discards runtime frames with mismatched sessionId/runId/generation.
5. Client applies deltas with `seq > throughSeq`.
6. A gap, conflicting duplicate content, or a projection anomaly triggers another snapshot request.

The frontend may write UI preferences such as panel layout to local storage, but local storage/IndexedDB must not contain:

- The complete transcript.
- pending Inbox。
- approval truth。
- Goal/Plan truth。
- tool result truth。
- API key。

## 16. Compaction and surface replacement

DSH remains responsible for compaction. DSH Session events and surface generations express its result.

Only three trigger categories are allowed and must be tested: DSH automatic context-pressure policy, the DSH request-error recovery path after an explicit provider context-window-exceeded error, and the user `/compact` command. One provider failure may trigger at most one retry after compaction; if the new surface still exceeds the limit or compaction fails, end the current run with a stable error instead of looping compaction.

Pi must:

- Read the current surface before each step.
- Replace Pi context completely when the surface generation changes, rather than continuing to append to the old array.
- Preserve DSH request header/series semantics.
- Never run Pi Harness compaction.

Client must:

- Keep durable history auditable through the event log.
- Display current model context and the simplified UI according to the surface projection.
- Clear old transient frames when the generation changes.

A compaction commit must fully write the new DSH surface generation before exposing it to the next step. Failure or process interruption leaves the old generation as the current valid surface; recovery can determine the current generation only from complete DSH compaction/surface events. Compaction never deletes, overwrites, or rewrites the original event log.

## 17. Session relationships of Goal, Plan, Skill, and MCP

- Goal/Plan are Session events and are therefore recoverable.
- Skill source files and MCP server configuration are not Session content; Session records the model messages, tool calls, and results they produce.
- Recovery restores Session before loading Skill/MCP for the current Agent scope.
- A session still opens if a Skill/MCP used in its history is currently missing; the next call reports capability unavailable, and historical tool events must not be deleted.
- A tool schema change starts a new request series/header without altering the old header.

## 18. Session format migration

Migration requirements:

- Support only adjacent migration chains explicitly listed in the DSH format catalog.
- Read open may decode into the current logical format in memory, but does not publish a successor.
- Write open publishes a successor without overwriting after migration, validation, and rechecking the source revision.
- Source-file drift rejects publication and requires preparation again.
- Retain older generations after migration.
- Downgrade writes are unsupported.
- Compression changes use a new root and are not combined with migration.

New Local-Harness-pi kernel events must not enter the Session format; only events already declared by DSH or new events with formal schema versioning may be appended.

## 19. Backup, export, and manual recovery

Minimum V1 requirements:

- The application can display the read-only location of authoritative Session files.
- Diagnostic exports include only headers, event type/seq, error codes, and versions by default, excluding content and secrets.
- A user choosing full export is explicitly informed that it may contain code, prompts, and tool output.
- Recovery does not overwrite the original generation; create a copy or successor first.

V1 does not implement cloud synchronization. Synchronizing user data to the cloud requires a separate threat model and conflict protocol.

## 20. Failure matrix

| Failure point | Known durable state | Recovery behavior | Automatic replay |
|---|---|---|---:|
| Host exits after the user clicks send | Possibly only an Inbox splice | Restore pending Inbox or accepted user message | No; Agent claims normally |
| Exit before provider request | Step/user committed, no assistant | Append attempt/closer; may prompt a retry | No |
| Exit during provider stream | Partial runtime; possibly embedded stream prefix | Commit interrupted message/attempt and closer | No |
| Exit before tool/call | Assistant contains a call, no call event | Repair as not started under DSH rules | No |
| Exit during tool body | tool/call without result | `TOOL_OUTCOME_UNKNOWN` | Strictly prohibited |
| Exit after tool/result | Call/result paired | Append step/turn closer | No |
| Persistence append fails | Memory may contain unpersisted events | Fail and stop the run; recover only the fsynced prefix | No |
| SQLite fails | Session intact | Disable search or rebuild | Not applicable |
| Renderer crashes | Host/Session intact | Reconnect using snapshot and deltas | Not applicable |
| Host crashes | Only the physically committed prefix | Full recovery algorithm | Only on explicit user retry |

## 21. Integrity checks

Every recovery verifies at least:

- Header/sessionId/path consistency.
- Format version matches the filename.
- Continuous seq values.
- event lossless JSON。
- Balanced turns/steps, or a repairable final tail only.
- Tool call/result pairing and sourceEventSeqs.
- messageId/callId uniqueness within their required scopes.
- Reconstructible request headers.
- Monotonic compaction/surface generations.
- Persisted revision matches the revision observed on open.

Running debug/test builds should also continuously verify Agent id, Session id, open position, Pi event state, and the commit buffer.

## 22. Required recovery tests

### 22.1 Process-level tests

Each scenario runs in a child process until a designated fault injection point, forcefully terminates it, then recovers in a new process:

1. During initial header materialization.
2. In the middle of a raw line.
3. In the middle of the final Zstd frame.
4. In the middle of an assistant text delta.
5. After assistant completion, before commit.
6. After tool/call commit, before the tool body.
7. After the tool body produces an external file, before result.
8. After tool/result, before step/end.
9. After step/end, before turn/end.
10. During close/flush.
11. Before and after committing a new generation for automatic compaction.
12. After compaction triggered by provider context overflow, before the retry request.

### 22.2 Concurrency tests

- Two processes resume the same session concurrently; only one succeeds.
- While a live writer holds ownership, the search index can observe the committed prefix without acquiring write ownership.
- When a configuration update races with a model request, the current step uses a frozen snapshot.
- Two Pi V1 tools requested together never overlap and commit in source order.

### 22.3 Property tests

Insert random single-point interruptions into valid event sequences and verify that recovery always produces the original committed prefix plus permitted synthetic closers, without duplicating original events.

## 23. Release gates

Any of the following blocks release:

- A Pi session file or second session database appears.
- The UI needs local storage to show complete messages after restarting.
- An unknown tool outcome is retried automatically.
- SQLite corruption prevents opening authoritative sessions.
- Two writers both succeed for the same session.
- Transient and durable assistant content appears as two messages simultaneously.
- A tool continues executing after Session append fails.
- Complete-frame checksum corruption is silently truncated.
- Pi Harness Compaction is loaded, or Pi keeps appending to the old transcript after DSH compaction.
- Context overflow creates an infinite compaction/retry loop in one run.

## 24. Operational diagnostics

The diagnostic page should report the following without exposing content:

- Session id, safely abbreviated path, and current generation.
- persistence format/compression/revision。
- Whether a write owner exists.
- event count、last seq、last closed turn/step。
- SQLite index generation and last reconciliation revision.
- Current Kernel id/version, for runtime information only.
- The most recent stable error code.

This information identifies whether the authoritative log, derived index, or runtime cache is faulty without comparing two chat records.
