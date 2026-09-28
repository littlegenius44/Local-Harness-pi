# Agent Note: Pi kernel serial V1 boundary

Status: implemented

English | [中文](2026-09-27-pi-kernel-serial-v1.zh.md)

## Problem

Local-Harness-pi needs Pi's conversational tool loop without creating a second Agent factory, transcript, or recovery store beside DSH. The implementation must remain reproducible against these reviewed source pins:

- DeepSeek Harness: `b2e3b2a0125854567a4a5fcba75782e42fe84901`
- earendil-works/pi: `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` (`pi-agent-core` and `pi-ai` `0.85.1`)
- openai/codex design reference: `73a1148c9c775c2a4616ce5096291740a00ed68a`

## Decision

The base and standalone `sdk-minimal` compositions activate exactly one Agent factory: `@local-harness/pi-agent-loop`. `PiAgentLoop` inherits the DSH `AgentLoop` factory and replaces only its machine construction hook. It neither implements a second factory nor owns session creation, resume, publication, or teardown. The DSH agent-loop invariant remains active as the compatibility checker; it is not a second factory.

The machine calls Pi's low-level `runAgentLoop()` directly. It does not construct Pi `Agent`, use Pi Harness session/skill/compaction modules, or create a Pi persistence store. DSH Session events and projections are the only conversation, queue, execution, compaction, and recovery truth. Provider requests are rebuilt from the current DSH Session-derived state for every step.

## Durability evidence

- Prompt acknowledgement: new and idempotent `session/prompt` requests await `sessions.flush()` after the durable inbox mutation before returning success.
- Before tool effect: the awaited Pi `tool_execution_start` bridge appends `tool/call`; the existing session checkpoint policy then flushes that prefix inside the public `ctx.tools.execute()` pipeline before a top-level tool body can run.
- Turn settled: `DshPiAgent` appends `turn/end` and awaits `sessions.flush()` before it can transition back to externally idle.

Tool calls, errors, approval outcomes, presentation metadata, additional contexts, and `concludesTurn` remain DSH tool-runtime results. Tool results cite their exact `tool/call` sequence through `sourceEventSeqs`.

The model stream bridge retains the exact DSH chunks for the durable assistant attempt, including token usage and finish reason. Tool-call JSON is parsed for Pi execution while its exact serialized form is retained for the DSH `tool/call` relationship.

## Alternatives considered

**Mount both the React loop and Pi loop.** Rejected because two live Agent factories would compete for lifecycle and Session ownership.

**Use Pi Agent or Pi Harness persistence.** Rejected because a second transcript or recovery mechanism can acknowledge state that DSH has not made durable and can diverge after a crash.

**Enable parallel Pi tools in V1.** Rejected because durable call/result ordering and cancellation behavior have not been specified across concurrent completions.

## Consequences

The product gains Pi's low-level conversational loop while retaining DSH lifecycle, tool policy, session repair, compaction, and crash recovery. The cost is deliberately serial Pi tool execution. Both the Pi loop option and every Pi proxy use sequential execution, so the inherited DSH `maxParallelToolCalls` setting is intentionally ignored by this machine. `PARALLEL-110` is the only planned route for parallel Pi tool execution; it must define durable ordering before changing this boundary.
