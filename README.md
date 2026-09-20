# Local-Harness-pi

[简体中文](README.zh.md)

`Local-Harness-pi` is a local-first desktop Coding Agent designed around DeepSeek Harness (DSH) as its product platform and Pi as its execution kernel.

The confirmed architecture is:

> **DSH product platform + Pi execution kernel + a single DSH Session source of truth.**

The repository contains the pinned DSH source and is completing PR-A acceptance for desktop identity, isolated data storage, and security. The Pi execution kernel is not connected; this code is not a complete V1 release. Contributors must read the documents below and verify the pinned upstream source before executing the plans.

Internal `dsh` package names, protocols, and events preserve upstream compatibility; they do not identify a second product. See [UPSTREAM.md](UPSTREAM.md) for provenance and licenses and the [desktop README](apps/desktop/README.md) for desktop development.

<a id="run"></a>
## Run status

This checkout is under development acceptance. No usable V1 installer has been released. Markdown integration tests cover Chinese filenames, formulas, code blocks, tables, and pagination; the complete desktop-to-model workflow awaits later stages.

<a id="run-from-source"></a>
## Verify from source

The completed build used Node.js 24.17.0 and the repository-pinned pnpm 11.7.0. After installing dependencies, `pnpm run build:official` builds the frontend and backend, and `pnpm run build:desktop` compiles the desktop shell. The Windows development packaging entry is `pnpm run package:desktop:win:x64:dir`; packaging and launch acceptance remain incomplete.

## Documents

- [Overall architecture](docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md)
- [V1 requirements](docs/requirements/v1-requirements.md)
- [Interface contracts](docs/architecture/interface-contracts.md)
- [Session consistency and recovery](docs/architecture/session-consistency.md)

## Implementation plans

- [V1 master plan and three Draft PR checkpoints](docs/superpowers/plans/2026-09-10-local-harness-pi-v1-master.md)
- [PR-A: DSH baseline, desktop identity, and security](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md)
- [PR-B: Pi Agent Core bridge and single Session source of truth](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-b-pi-kernel.md)
- [PR-C: OpenAI-compatible configuration and V1 desktop workflow](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-c-product-loop.md)

## Current status

- Architecture: confirmed
- V1/V1.1 scope: confirmed
- Requirements and contracts: confirmed
- Implementation plans: complete
- PR-A: source imported, complete build passed, documentation and packaging acceptance in progress
- PR-B / PR-C: not started

## Upstream baseline

| Project | Purpose | Pinned version |
|---|---|---|
| `deepseek-ai/deepseek-harness` | Product platform and single Session source of truth | `b2e3b2a0125854567a4a5fcba75782e42fe84901` |
| `earendil-works/pi` | Execution kernel | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` / `0.85.1` |
| `openai/codex` | Interaction, security, and tool-entry design reference; no runtime dependency | `73a1148c9c775c2a4616ce5096291740a00ed68a` |

These pins make the design reproducible. Contributors must not silently upgrade upstream versions without recording compatibility differences.
