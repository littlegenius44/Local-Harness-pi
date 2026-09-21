# Local-Harness-pi Desktop

English | [中文](README.zh.md)

## Summary

The Electron application displays the DSH Web UI with Local-Harness-pi branding and keeps desktop data in its own application directory. The current PR-A work establishes the DSH baseline, product identity, offline notices, and desktop isolation. Pi kernel integration belongs to PR-B and is not available in this stage.

## Table of Contents

- [Data ownership](#data-ownership)
- [Development and packaging](#development-and-packaging)
- [Runtime and security](#runtime-and-security)
- [Known limitations](#known-limitations)

-----
<a id="data-ownership"></a>
## Data ownership

The desktop Host receives `DSH_HOME` from Electron as `join(app.getPath('userData'), 'harness')`. An inherited shell `DSH_HOME` does not select the desktop data root. Sessions, settings, credentials, and workspace state therefore use the desktop application's directory rather than the CLI's default home. [main.ts](src/main.ts) and [host-process.ts](src/host-process.ts) own this selection and child environment.

Under that home, Electron owns `profiles/desktop`, the desktop pnpm store, staging directories, activation journal, and rollback profile. It takes a single-instance lock before accessing the profile. Package changes install into staging and run a backend health check before activation; [project-manager.ts](src/project-manager.ts) owns recovery after interruption.

Development uses `apps/desktop/.desktop-build/development/electron-user-data/harness` for Harness state and `apps/desktop/.desktop-build/development/project` for the disposable npm project. Browser data stays in the parent `electron-user-data` directory. [dev.ts](scripts/dev.ts) owns these paths.

-----
<a id="development-and-packaging"></a>
## Development and packaging

The root [package manifest](../../package.json) declares `dev:desktop` for building and launching the workspace, `start:desktop` for launching existing builds, and `package:desktop:win:x64` for the Windows x64 packaging pipeline. These are development entry points; this reference does not certify an installed application. The release owner must record a successful build, first launch, and offline restart before distributing an installer.

Windows Alpha packaging is unsigned and requires manual installation. Its default application ID is `io.localharness.pi`; artifact names use `Local-Harness-pi`. The packaging configuration omits a Windows update publisher, and the completion record marks `installation: manual` and `signed: false`. Windows signing fields and upload credentials are removed from packaging subprocess environments. See [builder configuration](electron-builder.config.mjs) and [target packaging](scripts/package-target.ts).

The inherited macOS signing and notarization scripts are outside Windows V1 acceptance. They do not establish a supported Local-Harness-pi macOS release or an authorized upstream update destination.

-----
<a id="runtime-and-security"></a>
## Runtime and security

<details>
<summary>Implementation internals — click to expand</summary>

The packaged shell uses a bundled upstream Node.js child and bundled pnpm. The offline seed contains the version-matched first-party packages and dependency store. The application uses `dsh-app://` and framed byte pipes for client requests; Node IPC carries lifecycle control. The product transport opens no listening Web port. Development debugger ports are separate from this transport.

The main renderer receives a protocol marker; the management renderer receives constrained plugin and update operations. [Window options](src/window-options.ts), sender checks, and navigation restrictions in [main.ts](src/main.ts) define the Electron restrictions. The DSH protocol, npm scopes, and preload identifiers remain compatibility identifiers.

The seed store merge copies content directories without a JavaScript file filter and merges each version's SQLite package index separately. Existing plugin records survive; verified seed records and files replace matching entries. [seed-store.ts](src/seed-store.ts) owns this operation.

The updater requires a packaged application with `app-update.yml`. Windows Alpha does not configure that update channel. [update-coordinator.ts](src/update-coordinator.ts) owns this condition; signed automatic updates are outside V1.

About information and the packaged `THIRD_PARTY_NOTICES.txt` identify DSH and Pi and state that Local-Harness-pi is not an official OpenAI or DeepSeek product. Codex is a design reference only. [Product identity](../../packages/util/product-identity/README.md) and [upstream provenance](../../UPSTREAM.md) own the attribution data.

</details>

-----
<a id="known-limitations"></a>
## Known limitations

- PR-A source changes are not a claim that all V1 desktop acceptance checks have passed; follow the PR-A plan (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`).
- Pi execution, session reconciliation through the Pi bridge, and the complete V1 product loop remain separate PR-B and PR-C work.
- Desktop plugin lifecycle scripts require the desktop project's reviewed `allowBuilds` policy.

### Dev Note

This page describes source ownership and release constraints. Installer qualification remains the release owner's responsibility.
