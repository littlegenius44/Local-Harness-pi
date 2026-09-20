# Agent Machine Seam Rectification Implementation Plan

English | [中文](2026-09-18-agent-machine-seam-rectification.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Pi conversational tool-loop without duplicating the DSH `AgentFactory` lifecycle, and make the message boundary, single source of truth, and PR-B prerequisites directly implementable.

**Architecture:** PR-A extracts a behavior-neutral protected `createMachine()` seam from DSH `AgentLoop`, defaulting to `ReactLoopAgent`; PR-B subclasses it as `PiAgentLoop` and replaces only machine construction. The Kernel boundary directly uses canonical DSH `Message`, `ContentBlock`, and `StreamChunk` types, without a third Local Harness message IR. DSH Session exclusively owns conversation/execution facts that affect model behavior after recovery; domain services retain ownership of domain data.

**Tech Stack:** TypeScript 6, Cordis, DSH Agent/Session/LLM APIs, Vitest, `@earendil-works/pi-agent-core@0.85.1`.

---

## 0. Coordinate with PR-A in progress

As of 2026-09-18, GitHub had no visible PR-A Draft PR or remote branch, and the local checkout contained only `main`. This plan therefore updates only the authoritative documents on `main`; it does not reset, overwrite, or guess at uncommitted code in another task.

Before continuing PR-A, the other task must:

- [ ] Commit its current workspace checkpoint first; do not rebase with uncommitted changes.
- [ ] Fetch and integrate this documentation commit.

  ```powershell
  git status --short
  git fetch origin
  git rebase origin/main
  ```

  If PR-A has been pushed and rebasing is inappropriate, use `git merge origin/main`. Never force-push over another contributor's commits.

- [ ] Confirm that the current branch contains this document. Make Task R1 below the new PR-A Task A6; move the Draft PR evidence task to A7.
- [ ] Implement R1 only after importing the pinned DSH snapshot. Do not create placeholder files before `packages/core/agent-loop` exists.

## Task R1: Extract behavior-neutral machine construction in PR-A

**Files:**

- Modify: `packages/core/agent-loop/src/index.ts`
- Create: `packages/core/agent-loop/tests/agent-machine-seam.spec.ts`
- Modify: `packages/core/agent-loop/README.md`
- Modify: `packages/core/agent-loop/README.zh.md`
- Modify when required by doc-sync: `packages/core/agent-loop/README.i18n.yaml`

- [ ] Reread `packages/core/agent-loop/src/index.ts`, `agent.ts`, all lifecycle tests, and `packages/core/agent/src/types.ts` and `runtime-types.ts` at the pinned DSH commit. Record the direct `ReactLoopAgent` construction site and the machine members actually used by `AgentLoop`.

- [ ] Write failing tests first. Override the construction hook in a test subclass and assert that create and resume both use the injected machine. Reuse or extend existing tests to prove that default `AgentLoop` still constructs `ReactLoopAgent`, preserving publication order, failure rollback, disposal order, and configured startup behavior.

  ```powershell
  pnpm vitest run packages/core/agent-loop/tests/agent-machine-seam.spec.ts
  ```

  Expected: The new hook does not exist yet, so type checking or tests fail.

- [ ] Add the minimal public seam in `index.ts`. Names may be adjusted for existing upstream export conflicts, but the shape must remain equivalent:

  ```ts
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

  Change `PreparedAgent.agent` and the internal `machine` type to `AgentLoopMachine`, and replace the sole direct construction site with:

  ```ts
  machine = this.createMachine({ ctx: loopCtx, id, options, session })
  ```

  Do not turn `prepare()`, `setupAndPublish()`, `createAgent()`, `resume()`, registry publication, write handles, or rollback into Pi-specific override points. This seam constructs only the machine.

- [ ] Test hook exceptions, owner/factory abort, create/resume, and default disposal paths. A fake machine returned by a subclass must have a real `Scope`; do not hide interface gaps with type assertions.

- [ ] Document that hook inputs are read-only during construction, implementations must not retain a second Session write handle, and subclass machines must still obey the DSH `Agent` runtime contract.

- [ ] Run the focused checks and commit.

  ```powershell
  pnpm vitest run packages/core/agent-loop/tests
  pnpm --filter @deepseek-ai/dsh-agent-loop run typecheck
  pnpm run build:lib
  pnpm run test:docs
  git diff --check
  git add packages/core/agent-loop/src/index.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/core/agent-loop/README.md packages/core/agent-loop/README.zh.md packages/core/agent-loop/README.i18n.yaml
  git commit -m "refactor: expose DSH agent machine construction seam"
  ```

  If doc-sync did not change `README.i18n.yaml`, do not manufacture a change for the commit.

## Task R2: Use DSH canonical types at the Kernel boundary in PR-B

**Files:**

- Create: `packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/src/message-converter.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/message-converter.spec.ts`

- [ ] Use `readonly Message[]` for `KernelContextSnapshot.messages` and `KernelRunInput.initialMessages`; DSH `Message` for message started/completed (narrow to `AssistantMessage` only when proven assistant-only); DSH `StreamChunk` for deltas; and `readonly ContentBlock[]` for tool result content.

  ```ts
  import type { ContentBlock, Message, StreamChunk } from '@deepseek-ai/dsh-llm'

  export interface KernelContextSnapshot {
    readonly messages: readonly Message[]
  }

  export type KernelEvent =
    | { readonly type: 'message.started'; readonly message: Message; /* position */ }
    | { readonly type: 'message.delta'; readonly delta: StreamChunk; /* ids */ }
    | { readonly type: 'message.completed'; readonly message: Message; /* position */ }
  ```

- [ ] Keep genuinely opaque values as `unknown`: tool arguments before schema validation, abort reasons, sanitized error details, and private Pi metadata. Do not create Local Harness `Message`, `ContentBlock`, or `StreamChunk` types merely to remove `unknown`.

- [ ] Cover Unicode, images, reasoning, parallel tool calls, error tool results, and unknown metadata with fixtures. DSH→Pi→DSH conversion must preserve stable ids, source, content, and finish reason.

- [ ] Run and commit.

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/message-converter.spec.ts
  pnpm run typecheck
  git add packages/core/agent-loop-pi/src/kernel-driver.ts packages/core/agent-loop-pi/src/message-converter.ts packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/message-converter.spec.ts
  git commit -m "feat: define the typed conversational kernel boundary"
  ```

## Task R3: Install the Pi machine through inheritance in PR-B

**Files:**

- Create: `packages/core/agent-loop-pi/src/index.ts`
- Create: `packages/core/agent-loop-pi/src/pi-agent.ts`
- Create: `packages/core/agent-loop-pi/tests/apply.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/lifecycle.spec.ts`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `scripts/verify-pi-kernel-boundary.ts`

- [ ] Add a workspace production dependency from `@local-harness/pi-agent-loop` to `@deepseek-ai/dsh-agent-loop`. Inherit the lifecycle without copying its source:

  ```ts
  import { AgentLoop, type AgentLoopMachine, type AgentMachineCreateInput } from '@deepseek-ai/dsh-agent-loop'

  export class PiAgentLoop extends AgentLoop {
    protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
      return new DshPiAgent(input.ctx, input.id, input.options, input.session)
    }
  }

  export default PiAgentLoop
  ```

- [ ] `DshPiAgent` implements only DSH `Agent`/`AgentLoopMachine` runtime semantics and `scope`; it must not implement `AgentFactory`, open Session persistence handles, or publish registry lifecycle events.

- [ ] The base composition activates only `@local-harness/pi-agent-loop`. It may depend on the DSH agent-loop superclass. Checks prohibit a second factory activated by Cordis, copied lifecycle source, and Pi Harness subpaths; they do not prohibit DSH agent-loop in the lock graph.

- [ ] Run the existing DSH create/resume/failure matrix against `PiAgentLoop` to prove that inheritance preserves rollback, created/disposed pairing, write ownership, and reverse-order disposal. Add static checks: the Pi package must not declare `implements AgentFactory` or copy `setupAndPublish`/`resumeWith`.

- [ ] Run and commit.

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/apply.spec.ts packages/core/agent-loop-pi/tests/lifecycle.spec.ts
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run build:lib
  git add packages/core/agent-loop-pi packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml scripts/verify-pi-kernel-boundary.ts
  git commit -m "feat: install Pi through the DSH machine seam"
  ```

## Task R4: Make the end of PR-B the formal M0 checkpoint

**Files:**

- Modify: `.github/pull_request_template.md`
- Create: `.agents/notes/architecture/YYYY-MM-DD-pi-kernel-session-ownership.md`
- Test: `packages/core/agent-loop-pi/tests/contract-matrix.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/crash-recovery.e2e.ts`
- Test: `packages/core/agent-loop-pi/tests/compaction-through-pi.integration.spec.ts`

- [ ] Mark `M0 Kernel Integration` after PR-B passes. M0 is the go/no-go for starting PR-C, not the public V1 release.
- [ ] M0 must prove exactly one factory in the default composition; Pi owns only the conversational model-tool loop; DSH Session is conversation/execution recovery truth; recovery never reads a Pi store; and all three flush barriers, out-of-order tool commits, Compaction generations, and the crash matrix pass.
- [ ] M0 introduces no Tool Effect Taxonomy, Evidence/Critic store, general agent graph, multi-agent orchestration, or new domain databases. Future domain services may own `Decision`, `Evidence`, and `Artifact`, but references, state changes, and execution results affecting model behavior after recovery must enter DSH Session as stable refs/events.
- [ ] Attach complete command output, pinned upstream hashes, failure injection points, and known limitations to the Draft PR. If any item fails, do not start PR-C changes that depend on real Pi behavior.

## Task R5: Integration, review, and handoff

- [ ] Complete R1 in PR-A on a commit containing this rectification document. Add the `AgentLoop` seam diff and default React regression evidence to the PR description.
- [ ] Base PR-B only on merged PR-A. Do not temporarily cherry-pick the seam and maintain separate versions on two long-lived branches.
- [ ] Independent review must check each item: exactly one direct default `ReactLoopAgent` construction site; Pi overrides only `createMachine`; no `DshPiAgentFactory`; no `unknown[]` in public Kernel message fields; and the base activates only one factory.
- [ ] Before merging, run:

  ```powershell
  rg -n "DshPiAgentFactory|implements AgentFactory|messages: readonly unknown\[\]|initialMessages: readonly unknown\[\]" packages/core/agent-loop-pi
  pnpm run check:local-harness
  pnpm run test:snapshot
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run build
  git diff --check
  ```

  Expected: `rg` finds no matches, and every other command passes.

## Schedule impact

- PR-A: Changes from 4–5 days to 5–6 days for the seam, regression tests, and documentation synchronization.
- PR-B: Changes from 8–11 days to 7–10 days by removing duplicate factory lifecycle implementation and maintenance.
- PR-C: Remains 7–9 days; `main` stabilization remains 3–4 days.
- Total net work remains 22–29 days. One day of high-risk architecture work moves forward into PR-A, reducing duplicate lifecycle implementation and review in PR-B.

This plan preserves the user-confirmed V1 product scope and corrects only implementation boundaries and check ordering.
