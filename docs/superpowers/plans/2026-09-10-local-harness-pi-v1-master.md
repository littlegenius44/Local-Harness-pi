# Local-Harness-pi V1 Implementation Plan

English | [中文](2026-09-10-local-harness-pi-v1-master.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the new `Local-Harness-pi` repository, use pinned DSH source as the product platform, replace only Agent Loop with Pi Agent Core, and complete the Windows Electron V1 product workflow.

**Architecture:** Preserve DSH ownership of Electron, Client, Session, LLM, Tools, Goal/Plan, Skill, and MCP. PR-A extracts a behavior-neutral machine-construction seam from DSH `AgentLoop`; `@local-harness/pi-agent-loop` inherits that lifecycle and becomes the sole active `AgentFactory`. GUI-managed MCP adds only a DSH settings/Host control plane; execution still uses the same DSH MCP Client and Tool Registry. DSH append-only Session is the sole source of conversation/execution recovery truth; Pi state, Client transient state, and SQLite search indexes are derived only. Domain Decision/Evidence/Artifact objects may have their own owners/stores but must not duplicate transcripts or execution logs.

**Tech Stack:** Node.js 22.19+, pnpm 11.7.0, TypeScript 6, Electron 44, React, Cordis, Vitest and its browser runner, `@earendil-works/pi-agent-core@0.85.1`, and `@earendil-works/pi-ai@0.85.1`.

---

## 0. Plan set and execution order

This master plan owns sequencing, gates, and PR delivery only. Detailed implementation steps are in three subplans:

1. [PR-A: DSH baseline, product boundaries, and machine seam](2026-09-10-local-harness-pi-pr-a-dsh-baseline.md)
2. [PR-B: Pi kernel bridge](2026-09-10-local-harness-pi-pr-b-pi-kernel.md)
3. [PR-C: Complete V1 product workflow](2026-09-10-local-harness-pi-pr-c-product-loop.md)

Dependency order is fixed as `PR-A -> PR-B -> PR-C`. The [Agent Machine Seam Rectification Plan](2026-09-18-agent-machine-seam-rectification.md) folds this architecture correction into unfinished PR-A/PR-B rather than creating A.5: the machine seam belongs to PR-A; typed Kernel contracts and the `PiAgentLoop` subclass belong to PR-B. Option 2 About/licenses belong to PR-A, Compaction/session-kernel regression to PR-B, and GUI-managed MCP/full product regression to PR-C; do not create a fourth long-lived branch. Only if one PR-B diff exceeds roughly 2,500 handwritten business-code lines or cannot converge after two consecutive review rounds may it split into B1/B2 as specified by its subplan. Do not develop MCP/UI in parallel with PR-B and guess the interfaces afterward.

### Requirement-to-task traceability

| Requirements | Implementation tasks | Main acceptance evidence |
|---|---|---|
| `PLAT-001`–`PLAT-003` | A1–A7, C8, C9 | Windows unsigned NSIS, version locks, provenance/license gates, default AgentLoop regression |
| `FR-001`–`FR-004` | A3–A5, C9 | Workspace/single-instance/window security, About/offline licenses, Windows smoke |
| `FR-010`–`FR-019` | B3, B4, B8–B10, C7, C9 | Agent lifecycle, message acknowledgement, recovery, Compaction, session organization/fork/search/export matrix |
| `FR-020`–`FR-025` | B1–B9 | Dependency boundary, KernelDriver conformance, sole AgentFactory |
| `FR-030`–`FR-037` | B4, C1, C9 | Local/cloud Responses and Completions, first launch and discovery fallback matrix |
| `FR-040`–`FR-047` | B5, B6, B10, C6, C7 | Tool, approval, workspace, failure, context, Diff/Terminal, and tool-card tests |
| `FR-050`–`FR-052` | C5, C7, C9 | `/goal`, `/plan`, Plus menu, and recovery tests |
| `FR-060`–`FR-067` | C2–C5, C7, C9 | Skill, MCP CRUD/CAS/credentials, plugin inventory, effective permissions, failure-isolation tests |
| `FR-070`–`FR-072` | C5, C7, C9 | Attachments, PDF preview, Web tools product flow |
| `FR-073`–`FR-074` | V1.1 | V1 scope-violation scan and known-limitations record |
| `FR-080`–`FR-083` | C1, C4–C6 | Settings sections, single state source, Plus menu, collapsed tool cards |
| `FR-090`–`FR-091` | C8, C9 | Manual check/download, unreachable installation path, failure-isolation tests |
| `FR-092` | V1.1 | V1 scope-violation scan and known-limitations record |
| `NFR-001`–`NFR-006` | B3–B10, C6, C7, C9 | Session ordering, three flush barriers, Compaction, crash/SQLite rebuild matrix |
| `NFR-010`–`NFR-014` | A5, B4, B5, C1–C4, C8, C9 | Credential/network/Electron/MCP/plugin/log-redaction matrix |
| `NFR-020`–`NFR-022` | B7–B10, C3, C4, C9 | Baseline comparison, cache bounds, MCP reconcile, cancellation/resource-cleanup tests |
| `NFR-030`–`NFR-032` | C4–C7, C9 | Keyboard, actionable errors, and understandable-state tests |
| `TEST-001`–`TEST-006` | A2, A3, B1, B10, C1, C3, C7, C9 | Source/dependency, model, tool, recovery, product, and security matrices |
| `AC-001`–`AC-010` | B10, C1, C3, C5, C7, C9 | Local/cloud models, recovery, coexistence, UI deduplication, first launch, session library, MCP, and long-session end-to-end evidence |

Only the authoritative requirements document may change requirement priority; this table demonstrates coverage without duplicating requirement content.

## 1. Fixed inputs

### Upstream versions

- DeepSeek Harness：`b2e3b2a0125854567a4a5fcba75782e42fe84901`
- Pi：`acaa253cc8e3f159e6100b6f3874861b1f0bfc99`
- Pi npm: `@earendil-works/pi-agent-core@0.85.1` and `@earendil-works/pi-ai@0.85.1`
- Codex interaction reference: `73a1148c9c775c2a4616ce5096291740a00ed68a`
- Initial Local-Harness-pi product version: inherit the pinned DSH baseline `0.1.5-alpha.2` directly without a mechanical workspace-wide version rewrite. Original DSH packages remain governed by the DSH family gate; all new `@local-harness/*` packages are non-publishable private workspace members, with A2's Local verifier independently enforcing equal versions and no `publishConfig`.

### Authoritative project documents

- `docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md`
- `docs/requirements/v1-requirements.md`
- `docs/architecture/interface-contracts.md`
- `docs/architecture/session-consistency.md`

Resolve authority by responsibility, not a simple linear ranking: requirements own V1/V1.1 scope, priority, and acceptance criteria; overall design owns component ownership and dependency direction; session consistency owns Session persistence, ordering, and recovery; interface contracts own types, timing, and error codes; this master plan and subplans own task sequence and commit boundaries. If conflicts remain within one responsibility, stop implementation immediately and first correct all affected documents in one commit; implementers must not change product boundaries through code.

## 2. Starting protocol for every PR

- [ ] Confirm a clean working tree before creating the PR branch.

  Run: `git status --short`

  Expected: no output. If output exists, handle only files belonging to this task; never overwrite user changes.

- [ ] Verify the current branch contains the preceding PR's commits.

  Run: `git log --oneline --decorate -8`

  Expected: PR-A starts from the documentation baseline; PR-B contains PR-A; PR-C contains PR-B.

- [ ] Reread upstream source files listed in the current PR subplan and record actual hashes.

  Run:

  ```powershell
  git -C E:\AI\_reference\deepseek-harness-current rev-parse HEAD
  git -C E:\AI\_reference\pi rev-parse HEAD
  git -C E:\AI\_reference\codex rev-parse HEAD
  ```

  Expected: exact match with fixed inputs. Otherwise return to the pinned commits; do not upgrade incidentally.

- [ ] If creating a workspace package, first reread pinned DSH `docs/cookbook/adding-a-package.md`; for a Client package also reread `packages/client/AGENTS.md`. Every `@local-harness/*` package must use `0.1.5-alpha.2`, private ESM, standard exports, README/README.i18n, an exact `tsconfig.base.json` alias, and membership in only one aggregate: `tsconfig.host.json` or `tsconfig.client.json`. Run `pnpm run doc-sync` and commit generated paired READMEs; do not postpone project-reference fixes until the end of the PR.

- [ ] Run the subplan's starting baseline tests and retain commands/results in the PR description.

- [ ] Use test-driven development: first add a failing test for each behavior, confirm its failure reason, then implement the minimum change.

- [ ] Commit after completing each independent behavior, using the subplan's commit message.

## 3. GitHub collaboration protocol

The current local repository has no `origin`. Before the first cloud push, the project owner must create an empty GitHub repository named `Local-Harness-pi` and configure its URL as `origin`; implementers must not guess the account, organization, or visibility on the owner's behalf.

- [ ] Verify remote identity before the first push.

  Run: `git remote -v`

  Expected: only the owner-confirmed `origin`; the URL ends in repository name `Local-Harness-pi`.

- [ ] Publish branches with ordinary push, without automatic force-push.

  Run: `git push -u origin HEAD`

- [ ] Create a Draft PR for every cloud checkpoint with these fixed titles:

  - `feat: establish the Local-Harness-pi DSH baseline`
  - `feat: replace the DSH loop with the Pi kernel driver`
  - `feat: complete the Local-Harness-pi V1 desktop flow`

- [ ] PR descriptions must include all three upstream hashes, requirement IDs, actual test commands/results, known risks, rollback, and unimplemented V1.1 content.

- [ ] AI may independently push additional commits and update Draft PRs, but must not merge, disable failing checks, or change repository visibility.

## 4. Three observable checkpoints

### Checkpoint A: Buildable product platform

After PR-A, users can see the complete DSH baseline, provenance, Local-Harness-pi branding, secure Electron window configuration, and isolated data directories on GitHub. The original DSH Agent Loop still runs; this proves platform baseline health only.

Blockers: unknown provenance, mismatched upstream hashes, weakened Electron isolation, desktop data written to shared `~/.dsh`, or failing baseline tests.

### Checkpoint B / M0 Kernel Integration: Pi becomes the sole Loop Engine

After PR-B, default composition registers exactly one `AgentFactory`: `PiAgentLoop` inherits the DSH `AgentLoop` lifecycle and drives the conversational tool-loop through Pi Agent Core only via the machine seam; models, tools, and all durable events still use DSH services. Recovery reads only DSH Session, with flush barriers before tool side effects and turn completion. M0 is the formal PR-C go/no-go, not an external release.

Blockers: production dependencies include Pi Harness Session/Skills/Compaction; Pi copies or reimplements AgentFactory lifecycle; base activates a second factory; Pi directly executes tools or reads model keys; UI reads Pi events; a second transcript exists; parallel tools write Session in completion order; or flush failure still returns success. M0 excludes Tool Effect Taxonomy, Evidence/Critic stores, general agent graphs, and multi-Agent orchestration.

### Checkpoint C: Deliverable V1

After PR-C, local/cloud OpenAI-compatible routes, first launch, settings, Composer '+' menu, Goal/Plan/Skill, GUI-managed MCP, session library, Diff/Terminal, attachments/PDF, approval, recovery, and Windows packaging form a complete product workflow.

Blockers: cloud routes allow HTTP; local routes access non-loopback addresses; credentials enter settings JSON/logs/Session; Client/Pi holds MCP configuration copies; CAS conflicts are overwritten; one MCP failure breaks other tools; session organization or Compaction regresses; automatic update installation defaults on; or Windows installer smoke fails.

## 5. Global release gates

- [ ] Dependency and architecture gates.

  Run:

  ```powershell
  pnpm install --frozen-lockfile
  pnpm run release:verify --family dsh
  pnpm run constraints
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run test:docs
  ```

  Expected: every exit code is 0.

- [ ] Run the complete unit/contract suite.

  Run: `pnpm run test`

  Expected: all pass; real-API cases may self-skip without keys only under existing DSH policy.

- [ ] Run keyless Session replay and Web E2E.

  Run:

  ```powershell
  pnpm run test:snapshot
  pnpm run test:web
  pnpm run test:gui
  ```

  Expected: all pass without duplicate assistant messages or old-session transient frames.

- [ ] Build the Windows unpacked desktop and unsigned NSIS installer.

  Run:

  ```powershell
  pnpm run build
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:dir
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64
  ```

  Expected: a launchable unpacked Windows app and manually installable unsigned NSIS Alpha; signing, automatic installation, and rollback are not V1 gates.

- [ ] Run the manual model matrix and record it in release evidence without committing keys.

  1. Local OpenAI Chat Completions: text, tools, cancellation.
  2. Local OpenAI Responses: text, tools, cancellation.
  3. One actual loopback service.
  4. One HTTPS OpenAI-compatible cloud route.

- [ ] Run the crash-recovery matrix: kill after user-message acknowledgement, during assistant streaming, after `tool/call` flush before body, after body before result, after turn end, before/after Compaction generation commit, after context-overflow compaction before retry, and rebuild after SQLite index removal.

- [ ] Run the product-completeness matrix: initial model onboarding; session rename/search/archive/restore/fork/export; Diff/Terminal; About/offline licenses; MCP stdio/HTTP create-disable-enable-edit-conflict-reconnect-remove. MCP secret markers must not appear in DOM, Remote snapshots, Session, or logs; one MCP failure must not remove sibling MCP or built-in tools.

- [ ] Run all four NFR-020 performance gates: cold start, additional Host-delta-to-DOM latency, idle Electron + Host process-tree memory, and listing 1000 sessions. Use C9's fixed scripts and identical hardware/fixtures, retaining raw samples.

- [ ] Confirm no V1.1 scope violations.

  Run: `git grep -n -E "playwright|computer.use|office.edit|pdf.edit|autoDownload|autoInstall" -- packages apps`

  Expected: only existing DSH tests/dependencies or explicitly disabled configuration; no new V1.1 implementation from this project.

## 6. Time and quota control

### 6.1 Estimation assumptions

Estimates assume one main Codex implementing serially and another Codex independently reviewing only at each Draft PR checkpoint; five working days per week with roughly 4–6 effective engineering hours per day; no pinned-upstream upgrades; and endpoints for local/cloud smoke tests available at release time. Waiting for user review, Plus weekly-quota resets, real-model service failures, or GitHub failures increases calendar time but not net working days.

A full GPT-5.6 Sol Plus weekly quota is a relative capacity unit, not a permanently fixed request count. Implementers read current account usage at each PR's start and before long test matrices; do not remove P0 tests to fit quotas.

### 6.2 Net effort by phase

- PR-A: 5–6 working days, roughly 0.7–1.0 full weekly quotas. Source import, provenance locks, complete product/Web/model identity, About/licenses, data isolation, Electron security, and behavior-neutral Agent machine seam.
- PR-B: 7–10 working days, roughly 1.2–1.8 full weekly quotas. Typed conversational KernelDriver, model/tool bridges, durability, inherited Pi machine, recovery, and DSH Compaction compatibility; this is the critical path.
- PR-C: 7–9 working days, roughly 1.0–1.4 full weekly quotas. Shared guarded-fetch, OpenAI route/onboarding, GUI-managed MCP, settings/Plus menu, session/Diff/Terminal regression, updates, and Desktop E2E.
- `main` stabilization and release: 3–4 working days, roughly 0.3–0.5 full weekly quotas. Fix discovered defects, rerun matrices, and prepare release evidence only; add no features.

Total: 22–29 net working days and roughly 3.2–4.7 full weekly quotas. The normal baseline is 25 working days, approximately five calendar weeks and 3.9 full weekly quotas; even optimistic scheduling uses five weeks, with a conservative sixth week reserved.

### 6.3 Suggested weekly schedule

- Week 1: finish PR-A. Reach checkpoint A on working day 5–6; if everything passes early, use remaining quota only for B1–B2 source rereading and failing tests, without starting UI early.
- Week 2: complete B3–B6, covering messages/context, models, tools, and Session commit bridge.
- Week 3: complete B7–B10, crash/compaction matrix, and M0. Do not start PR-C code depending on real Pi semantics before PR-B/M0 passes.
- Week 4: complete C1–C4: shared guarded-fetch, model onboarding, capability inventory, Host MCP, and MCP/UI settings.
- Week 5: complete C5–C9 and checkpoint C, then run all gates on `main` for the first time.
- Week 6 (conservative buffer): handle only cross-package type generation, Windows packaging, MCP process cleanup, performance gates, or independently reviewed defects; do not consume this week without defects.

### 6.4 Quota and deferral rules

- Weekly priority is fixed: Session/durability/recovery > Pi tool/model workflow > MCP credential/CAS/isolation > OpenAI route > Desktop E2E > visual refinement.
- If the current quota cannot cover one task's failing test -> implementation -> complete verification -> commit, do not start it. Instead reread source, review, verify documents, or run focused tests for implemented tasks, resuming from task boundaries after reset.
- The current baseline approves no P1 deferrals; all P1 requirements listed in the requirements document must be implemented and accepted. Later explicit owner-approved reductions first update requirements, traceability, and corresponding PR plans; FR-004, FR-017, FR-019, FR-066, FR-067, and all P0 tests can never be dropped to meet a deadline.
- After two consecutive days without code progress, classify the cause: quota waiting does not change the plan; pinned-upstream test failures use stabilization allowance; interface disagreements return to authoritative documents, never an implementer's unilateral new architecture.

## 7. Definition of completion

V1 may be marked complete only when all conditions hold:

- [ ] All three PRs have human review and are merged into `main`.
- [ ] Section 5 gates rerun on `main` with a recorded commit hash.
- [ ] A clean Windows 11 x64 environment completes installation, initial model configuration, one tool task with Diff/Terminal, MCP configuration/call, session organization/search/export, exit/recovery, and uninstallation.
- [ ] Release notes clearly list V1.1 exclusions and known limitations.
- [ ] GitHub Release provides manual downloads only; Alpha never downloads or installs automatically.
- [ ] README marks V1 implemented and links release evidence.
