# Agent Note: Local-Harness-pi baseline and desktop isolation

Status: proposed

English | [中文](2026-09-12-local-harness-pi-baseline-and-isolation.zh.md)

## Problem

The approved product combines a DSH platform with a Pi execution kernel and one DSH durable session. Importing the platform alone does not deliver that composition. Product branding, data ownership, and release attribution must be explicit before kernel work and desktop distribution.

## Proposal

Follow the approved PR-A plan (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`) before the Pi bridge and product-loop work. Preserve DSH internal npm scopes, plugin IDs, and protocol identifiers; change product-visible identity and place desktop Harness data below Electron `userData/harness`. Windows Alpha uses manual unsigned installation.

## Fixed baseline and current status

[source-lock.json](../../../../docs/upstream/source-lock.json) records DSH `b2e3b2a0125854567a4a5fcba75782e42fe84901`, Pi `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` with packages at `0.85.1`, and Codex `73a1148c9c775c2a4616ce5096291740a00ed68a`. Codex is a design reference only; its source is not redistributed.

PR-A has source changes for the imported baseline, identity, notices, and desktop isolation. This note remains proposed because complete PR-A acceptance and installed-artifact qualification are not recorded here. Pi kernel integration is not implemented by these changes. A declared Pi dependency or an About version is not evidence of an active Pi kernel.

The inherited [Electron packaging note](../../implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.md) remains the DSH baseline rationale for its seed and process design. This proposal changes only the fork's data ownership and Windows release policy; it does not supersede the full upstream mechanism or authorize upstream release infrastructure.

## Construction and startup constraints

The [machine rectification plan](../../../../docs/superpowers/plans/2026-09-18-agent-machine-seam-rectification.md) requires the parent DSH factory to retain write ownership, recovery, publication, and teardown. Its protected construction hook defaults to `ReactLoopAgent`; injected machines expose the same Agent contract and a real Scope. This does not activate Pi.

Desktop seed content copies exclude version-root SQLite indexes from bulk copying by enumerating those roots separately. Content directories use unfiltered recursive copies; indexes merge after content copying, preserving installed plugin records. The content and index ownership remain unchanged. Artifact launch evidence must establish any startup improvement; passing copy tests alone does not qualify an installer.

## Alternatives considered

**Rename all DSH identifiers.** The approved plan retains internal compatibility identifiers because a broad rename creates unrelated work without improving product separation.

**A second durable Pi session store.** The approved architecture rejects this option because recovery and model-visible state must have one DSH source of truth.

## Acceptance criteria

- Record passing provenance and product-package checks against the fixed inputs.
- Verify identity and offline notices through Host, Web, and desktop consumers.
- Verify that inherited `DSH_HOME` cannot redirect desktop state, and that sandbox, context isolation, and navigation restrictions remain enforced.
- Build and qualify the Windows artifact, including first launch and restart, before claiming PR-A complete; record failures and unexecuted checks explicitly.

## Risks

Unsigned Alpha installers can trigger operating-system trust prompts. Inherited macOS and upload scripts do not make those release paths supported for this fork. Product identity and isolated data directories do not establish Pi execution, Markdown task completion, or the full V1 acceptance result.
