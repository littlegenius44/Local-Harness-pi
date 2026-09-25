# Agent Note: Local-Harness-pi baseline and desktop isolation

Status: proposed

English | [中文](2026-09-12-local-harness-pi-baseline-and-isolation.zh.md)

## Problem

The approved product combines a DSH platform with a Pi execution kernel and one DSH durable session. Importing the platform alone does not deliver that composition. Product branding, data ownership, and release attribution must be explicit before kernel work and desktop distribution.

## Proposal

Follow the approved PR-A plan (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`) before the Pi bridge and product-loop work. Preserve DSH internal npm scopes, plugin IDs, and protocol identifiers; change product-visible identity and place desktop Harness data below Electron `userData/harness`. Windows Alpha uses manual unsigned installation.

## Fixed baseline and current status

[source-lock.json](../../../../docs/upstream/source-lock.json) records DSH `b2e3b2a0125854567a4a5fcba75782e42fe84901`, Pi `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` with packages at `0.85.1`, and Codex `73a1148c9c775c2a4616ce5096291740a00ed68a`. Codex is a design reference only; its source is not redistributed.

PR-A has source changes for the imported baseline, identity, notices, and desktop isolation. This note remains proposed because the Draft PR and human handoff are still pending. Pi kernel integration is not implemented by these changes. A declared Pi dependency or an About version is not evidence of an active Pi kernel.

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

## Verification checkpoint: 2026-09-25

The official build produced 265 DSH package archives plus the private desktop Host, vendor dependencies, and native entry package. The rebuilt seed passed offline installation; its agent-loop archive matches the newly packed archive byte for byte and contains the protected machine construction hook. Frozen-lockfile installation, provenance verification, repository typechecking, Host build plus full lint, and desktop compilation passed. Desktop tests passed 96/96, machine-seam tests 8/8, documentation-site tests 69/69, and design/path gate tests 8/8. The complete documentation aggregate passed 34/34, including all quick documentation checks.

The unsigned Windows NSIS installer is 193,520,733 bytes with SHA-256 `D84D956207A7497C7EA7A68F78BB0FE176601C33FD4C7FE7AAB20BE68E7FF877` and NotSigned status. It installed into an isolated test directory, launched to welcome/API-key onboarding, and uninstalled with exit 0 while preserving the independent test profile. Reinstallation with that profile reached onboarding again in 58,780 ms and was then uninstalled successfully. The installer was built on September 23; subsequent acceptance changes concern documentation, tests, gates, and generated slot metadata. This is a baseline preview, not a final V1 distribution.

Fresh-profile launches took 494,547 ms for the unpacked artifact and 434,390 ms for the installed artifact. These runs verified product identity, sandbox, context isolation, disabled Node integration, and web security. No credential was entered or model request sent. These are startup observations, not performance acceptance; PR-C owns the comparative performance gates. The local long-path environment still packages through an external short-path staging workaround, not a certified clean-machine packaging workflow.

The four missing design/plan pairs and Chinese entry links are complete. Generated event/config/slot catalogs match current source. A Draft PR and human review remain the handoff boundary; this checkpoint does not activate Pi or authorize PR-B, merge, or public release.

## Rollback boundary

PR-A changes no durable Session schema. Source rollback must preserve the separate Electron user-data directory and its profile backups; do not point the upstream CLI at the desktop home or run two writers against it. The inherited project manager retains staged activation and rollback ownership. Reverting source does not authorize deleting user workspaces or treating an untested older binary as compatible with a newer profile.

## Design-document checks

Approved Local-Harness plans and interface specifications contain prospective APIs and incomplete excerpts rather than runnable current-package examples. Their `ts design` fences are syntax-checked by the documentation typecheck gate and reported separately; only the five named design owners may use this designation. Ordinary `ts` examples retain full compilation, and the existing unchecked-block limit remains unchanged. Missing enclosing declarations are made explicit without introducing fake API implementations. PR-B/PR-C must still typecheck and contract-test their actual implementations.

The package-path gate treats only exact `Create` targets declared in an implementation plan as prospective within that same file; modified paths, undeclared references, globs, traversal, and current-package documents retain ordinary existence checks. External Pi paths identify their upstream directory explicitly. Generated catalogs are refreshed from source; the Windows documentation image-escape fixture uses a directory junction with explicit unlink cleanup so the same realpath containment assertion does not need file-symlink privileges.
