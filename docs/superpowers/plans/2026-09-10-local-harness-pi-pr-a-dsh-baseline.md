# PR-A DSH Baseline and Product Boundary Implementation Plan

English | [中文](2026-09-10-local-harness-pi-pr-a-dsh-baseline.zh.md)

Fences marked `ts design` are planned implementation excerpts checked for syntax only, not available APIs. Their omitted host dependencies must be wired and pass source typechecking and contract tests in the owning implementation task.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the pinned DSH snapshot into the new repository, retain provenance and internal compatibility identifiers, establish Local-Harness-pi product branding, offline About/third-party licenses, Windows data isolation, and the Electron security baseline, extract a behavior-neutral Agent machine construction seam, and prove the platform builds and runs before Pi integration.

**Architecture:** Use a source snapshot rather than runtime composition across repositories. Retain DSH npm scope, Cordis plugin IDs, the `dsh-app` custom protocol, and internal preload object names to avoid broad renaming without benefit; change only product-visible identity and the desktop-specific data root. PR-A does not change Agent Loop semantics; it extracts only a protected machine-construction seam that still constructs `ReactLoopAgent` by default for PR-B to inherit.

**Tech Stack:** Git、pnpm workspace、TypeScript、Electron 44、Vitest、electron-builder。

---

## Upstream rereading checklist

Read fully before starting:

- DSH: root `AGENTS.md`, `BRAND_GUIDELINES.md`, `docs/architecture.md`, `docs/defensive-patterns.md`, `docs/cookbook/adding-a-package.md`, `scripts/check-workspace-constraints.ts`, and `scripts/client-build-environment.ts`; `apps/desktop/src/main.ts`, `host-process.ts`, `paths.ts`, `ipc.ts`, `preload.ts`, `project-manager.ts`, `update-coordinator.ts`, `electron-builder.config.mjs`, and corresponding `apps/desktop/tests/*.spec.ts`; branding, welcome, and system-prompt implementations and tests in `apps/web/public/manifest.webmanifest`, `apps/web/index.html`, `packages/client/ui-brand-official`, `packages/client/ui-settings-models`, and `packages/bundle/web-app`; `packages/core/agent-loop/src/index.ts`, `agent.ts`, all lifecycle tests, and `packages/core/agent/src/types.ts` and `runtime-types.ts`.
- Codex: desktop security, settings, and Composer entry implementations; reference only interaction and security principles, without copying Apache-2.0 code.
- Pi: this PR does not integrate runtime code; verify only the license and version in `agent/package.json` under Pi's `packages` directory.

## Task A1: Import the pinned DSH source snapshot

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Create: `docs/upstream/dsh-root-agents.md`
- Import: remaining tracked files from DSH commit `b2e3b2a0125854567a4a5fcba75782e42fe84901`

- [ ] Create the branch and confirm the documentation baseline.

  Run:

  ```powershell
  git switch -c pr-a/dsh-baseline
  git status --short
  git log -1 --oneline
  ```

  Expected: clean working tree; the latest commit contains the approved design documents.

- [ ] Preserve a copy of DSH root instructions so complete upstream constraints remain accessible after resolving root-file conflicts.

  Run:

  ```powershell
  New-Item -ItemType Directory -Force .\docs\upstream
  Copy-Item -LiteralPath E:\AI\_reference\deepseek-harness-current\AGENTS.md -Destination .\docs\upstream\dsh-root-agents.md
  git add docs/upstream/dsh-root-agents.md
  git commit -m "docs: preserve the DSH repository rules"
  ```

- [ ] Import the pinned commit with an unrelated-history merge, retaining upstream history and MIT provenance.

  Run:

  ```powershell
  git remote add dsh-upstream https://github.com/deepseek-ai/deepseek-harness.git
  git fetch --no-tags dsh-upstream b2e3b2a0125854567a4a5fcba75782e42fe84901
  git merge --allow-unrelated-histories --no-commit b2e3b2a0125854567a4a5fcba75782e42fe84901
  ```

  Expected: add/add conflicts only in `README.md` and `AGENTS.md`. If other conflicts appear, stop importing and verify the pinned commit; do not overwrite in bulk.

- [ ] Keep the Local-Harness-pi versions for the two known conflicts, then add upstream-instruction links.

  Run:

  ```powershell
  git restore --source=HEAD --staged --worktree -- README.md AGENTS.md
  git add README.md AGENTS.md docs/upstream/dsh-root-agents.md
  git status --short
  ```

  Add the following to the before-starting section of `AGENTS.md`:

  ```md
  5. DSH 继承代码还必须遵循 A1 创建的 `docs/upstream/dsh-root-agents.md` 固定上游根规则副本以及各子目录 `AGENTS.md`；与本文件冲突时以本文件的产品架构和删除限制为准。
  ```

  Expected: no unmerged paths remain; design documents still exist.

- [ ] Verify the imported tree and provenance.

  Run:

  ```powershell
  git diff --name-only --diff-filter=U
  Test-Path .\apps\desktop\src\main.ts
  Test-Path .\packages\core\agent-loop\src\index.ts
  Test-Path .\LICENSE
  ```

  Expected: no output from the first command; the next three all return `True`.

- [ ] Commit the import.

  Run:

  ```powershell
  git add -A
  git diff --cached --check
  git commit -m "chore: import the pinned DSH source baseline"
  ```

## Task A2: Record machine-verifiable provenance and licenses

**Files:**

- Create: `UPSTREAM.md`
- Create: `docs/upstream/source-lock.json`
- Create: `scripts/verify-local-harness-sources.ts`
- Modify: `packages/llm/llm-pi-ai/package.json`
- Modify: `scripts/check-workspace-constraints.ts`
- Modify: `scripts/check-workspace-constraints.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `scripts/tests/verify-local-harness-sources.spec.ts`

- [ ] First write failing tests requiring exact hashes, Pi versions, and license fields.

  Tests must create a temporary manifest with one altered hash and assert that the verifier rejects it with a nonzero result; then read the real manifest and assert all three DSH/Pi/Codex entries exist.

  The final `source-lock.json` content is fixed:

  ```json
  {
    "schemaVersion": 1,
    "sources": {
      "dsh": {
        "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
        "commit": "b2e3b2a0125854567a4a5fcba75782e42fe84901",
        "license": "MIT"
      },
      "pi": {
        "repository": "https://github.com/earendil-works/pi.git",
        "commit": "acaa253cc8e3f159e6100b6f3874861b1f0bfc99",
        "agentCoreVersion": "0.85.1",
        "piAiVersion": "0.85.1",
        "license": "MIT"
      },
      "codex": {
        "repository": "https://github.com/openai/codex.git",
        "commit": "73a1148c9c775c2a4616ce5096291740a00ed68a",
        "usage": "design-reference-only",
        "license": "Apache-2.0"
      }
    }
  }
  ```

- [ ] Run the failing tests.

  Run: `pnpm vitest run scripts/tests/verify-local-harness-sources.spec.ts`

  Expected: failure because the verifier or manifest does not yet exist.

- [ ] Implement the verifier with `readFile` + `JSON.parse`, comparing the constants above field by field and reading `packages/llm/llm-pi-ai/package.json` and the lockfile to confirm that existing Pi direct specifiers and resolved versions have no `^`, `~`, floating workspace specifiers, or differing versions. PR-A permits `pi-agent-core` to be absent; once `packages/core/agent-loop-pi/package.json` exists, the same verifier must require exact `0.85.1` direct dependencies and lock resolutions for both `pi-agent-core` and `pi-ai`. The verifier also dynamically scans `packages/*/*/package.json`: all `@local-harness/*` packages must be `private: true`, match root version `0.1.5-alpha.2`, and omit `publishConfig`. Change upstream `@earendil-works/pi-ai` from `^0.85.1` to exact `0.85.1`, then update only the lockfile:

  Run: `pnpm install --lockfile-only`

- [ ] Adjust the DSH workspace constraint's publication boundary. The pinned DSH `standardReleaseMemberDirectory` checks only directories, incorrectly treating every new `packages/*/*` as a public npm release member, so private `@local-harness/*` packages cannot be created directly. Make the check inspect the manifest too:

  - `@local-harness/*` in ordinary `packages/*/*` directories must be `private: true`, omit `publishConfig`, match the root version, and remain subject to common files/exports/project-reference checks;
  - Preserve publication policies for `@deepseek-ai/dsh-*`, vendor, and existing apps;
  - Grant no private exception to unknown scopes, avoiding accidental bypass of release gates.

  Temporary manifests in `scripts/check-workspace-constraints.spec.ts` cover a valid Local private package, wrong version, missing private, presence of publishConfig, and an unaffected existing DSH public member. Do not pass tests by excluding all `packages/*/*` from scanning.

  Add to `package.json`:

  ```json
  {
    "scripts": {
      "check:local-harness:sources": "tsx scripts/verify-local-harness-sources.ts"
    }
  }
  ```

- [ ] Write `UPSTREAM.md`, identifying DSH as the source baseline, Pi as the npm kernel dependency, and Codex as design reference only; link all three licenses without claiming to be an official OpenAI or DeepSeek product.

- [ ] Run tests and gates.

  Run:

  ```powershell
  pnpm vitest run scripts/tests/verify-local-harness-sources.spec.ts
  pnpm run check:local-harness:sources
  pnpm run constraints
  ```

  Expected: all pass.

- [ ] Commit.

  Run:

  ```powershell
  git add UPSTREAM.md docs/upstream/source-lock.json scripts/verify-local-harness-sources.ts scripts/tests/verify-local-harness-sources.spec.ts scripts/check-workspace-constraints.ts scripts/check-workspace-constraints.spec.ts packages/llm/llm-pi-ai/package.json package.json pnpm-lock.yaml
  git commit -m "docs: lock upstream source provenance"
  ```

## Task A3: Establish product-visible branding, About, and offline licenses

**Files:**

- Modify: `apps/desktop/electron-builder.config.mjs`
- Create: `apps/desktop/build/icon.svg`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/desktop-release-environment.mjs`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/locale.ts`
- Modify: `apps/desktop/renderer/plugin-manager.html`
- Modify: `apps/desktop/renderer/plugin-manager.js`
- Modify: `apps/web/index.html`
- Modify: `apps/web/public/favicon.svg`
- Modify: `apps/web/public/manifest.webmanifest`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/tests/assembled-boot.ts`
- Modify: `apps/web/tests/pwa-manifest.e2e.ts`
- Modify: `apps/web/tests/expected/onboarding-deepseek-config/welcome.expected.md`
- Modify: `apps/web/tests/expected/web-runtime-context/web-surface-prompt.expected.md`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `packages/bundle/web-app/src/index.ts`
- Modify: `packages/bundle/web-app/tests/web-app.spec.ts`
- Modify: `packages/client/locale/src/locales/en.ts`
- Modify: `packages/client/locale/src/locales/zh.ts`
- Modify: `packages/client/ui-brand-official/src/client/Brand.tsx`
- Modify: `packages/client/ui-brand-official/src/client/index.ts`
- Modify: `packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx`
- Modify: `scripts/client-build-environment.ts`
- Modify: `scripts/client-build-environment.client.spec.ts`
- Modify: `scripts/dev-web.spec.ts`
- Create: `apps/desktop/resources/THIRD_PARTY_NOTICES.txt`
- Create: `packages/util/product-identity/package.json`
- Create: `packages/util/product-identity/tsconfig.json`
- Create: `packages/util/product-identity/tsdown.config.ts`
- Create: `packages/util/product-identity/README.md`
- Create: `packages/util/product-identity/README.i18n.yaml`
- Create: `packages/util/product-identity/src/index.ts`
- Create: `packages/util/product-identity/tests/identity.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/tests/locale.spec.ts`
- Modify: `apps/desktop/tests/macos-signature.spec.ts`
- Modify: `apps/desktop/tests/windows-sign.spec.ts`
- Test: `apps/desktop/tests/product-identity.spec.ts`

- [ ] First write product identity tests asserting that builder configuration contains:

  ```ts design
  expect(config.productName).toBe('Local-Harness-pi')
  expect(config.artifactName).toBe('local-harness-pi-${version}-${os}-${arch}.${ext}')
  expect(config.appId).toBe('io.localharness.pi')
  ```

  Also assert that localized launch failure, update titles, and plugin-window titles no longer contain `DeepSeek Harness`; menus include About and third-party license entries; PWA `name`/`short_name`, initial HTML title, build-time `DSH_CLIENT_TITLE`, sidebar text, empty-session logo, and first welcome copy all use Local-Harness-pi product identity.

- [ ] Run tests and confirm failure.

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts`

- [ ] Make the minimal branding substitutions.

  Branding fields in `electron-builder.config.mjs` are fixed:

  ```js
  productName: 'Local-Harness-pi',
  artifactName: 'local-harness-pi-${version}-${os}-${arch}.${ext}',
  win: { /* 保留本任务定义的其他字段 */, icon: 'build/icon.svg' },
  ```

  Export `DEFAULT_DESKTOP_APP_ID = 'io.localharness.pi'` from `apps/desktop/scripts/desktop-release-environment.mjs`. `resolveDesktopAppId({})` returns it; a present but different `DSH_DESKTOP_APP_ID` fails, preventing CI from accidentally generating another application identity. Retain the variable name only for existing release-script compatibility. Update `macos-signature.spec.ts` to cover the default, identical explicit value, and mismatched explicit value.

  Use `Local-Harness-pi` consistently in localized and plugin-manager user-facing text. Change official `DSH_CLIENT_TITLE` in `scripts/client-build-environment.ts` to `Local-Harness-pi`, updating its unit test and `dev-web.spec.ts`; retain the environment-variable name and change only its value. Fix the no-environment fallback in `apps/web/index.html` and `vite.config.ts` to `Local-Harness-pi` too, preventing the old name from flashing in the first frame or unofficial development builds.

  Fix `manifest.webmanifest` to `name: "Local-Harness-pi"` and `short_name: "LH-pi"`. `apps/desktop/build/icon.svg` is the single master image: `viewBox="0 0 32 32"`, a dark rounded-square background, white geometric L and π paths, and a blue upper-right dot. Glyphs use only `path/rect/circle`, never `<text>` or runtime fonts. `apps/web/public/favicon.svg` must be byte-identical; do not copy or trace official DSH/OpenAI/Pi artwork. Product identity tests compare both files' SHA-256 and assert no `text/image/use/script` elements or original DSH `FISH_LOGO_PATH`; Windows unpacked/NSIS smoke tests must prove electron-builder generates a non-default Electron icon from this SVG.

  Keep the existing `@deepseek-ai/dsh-client-ui-brand-official` package name as an upstream compatibility identifier, but change its browser implementation to a Local-Harness-pi occupant: the sidebar name renders `Local-Harness-pi`, and both sidebar mark and `conversation.hero.brand.mark` render the same neutral `LHπ` SVG. `src/client/index.ts` must include the hero slot in the same declaration-aware registrations; teardown/HMR removes all three occupants together. Tests assert all three slots register, text/`aria-label` are correct, marks no longer import or render `FishLogo`/`BrandWordmark`, and both declaration-before-apply and declaration-after-apply orders remain covered.

  Change English and Chinese first-welcome copy to the Local-Harness-pi Alpha notice, including four facts: built on DeepSeek Harness, not an official OpenAI/DeepSeek product, only OpenAI-compatible providers supported, and data stored locally by default. Update welcome-notice tests and the Web expected fixture.

  Explicitly set `includeHarnessIdentity: false` on the Web profile's `system-prompt` row, preserve its current `personaSuffix`, and fix `personaPrefix` to `You are the Local-Harness-pi coding agent powered by the {{model}} model.`. Change model-visible Web GUI copy in `packages/bundle/web-app/src/index.ts` to `Local-Harness-pi Web GUI (built on DeepSeek Harness)`; retain `DSH_WEB_URL`. Update `web-app.spec.ts` and the Web runtime expected fixture to prove the final prompt contains only the new current-product identity and excludes the default `You are an AI agent powered by DeepSeek Harness.` sentence.

  Do not replace `DeepSeek Harness` across the repository. Preserve `@deepseek-ai/dsh-*` package names and descriptions, Cordis plugin IDs, `dsh-app`, `window.dshDesktop`, `DSH_*` environment variables, Session/remote event types, the `dsh` CLI executable, upstream source documentation/test corpora, and accurate upstream attribution in About/notices. Add a branding-boundary paragraph to `UPSTREAM.md` referring to the pinned snapshot's `BRAND_GUIDELINES.md`.

- [ ] Limit Windows Alpha packaging to unsigned manual installation. The Windows branch of `electron-builder.config.mjs` must not call `createWindowsTokenSigner()`/`installWindowsNsisBootstrapSigner()`; set `win.forceCodeSigning=false` while retaining `target: ['nsis']`, `oneClick=false`, and selectable installation directory. Keep signing scripts unreachable from V1 composition; `windows-sign.spec.ts` asserts configuration works without certificates, no signer hook installs, and the NSIS target remains. Release notes must mention possible Windows SmartScreen warnings and must not claim the Alpha is signed.

- [ ] Write offline notices; tests must locate each exact identity below:

  ```text
  DeepSeek Harness
  https://github.com/deepseek-ai/deepseek-harness
  b2e3b2a0125854567a4a5fcba75782e42fe84901
  MIT License
  Pi
  https://github.com/earendil-works/pi
  @earendil-works/pi-agent-core 0.85.1
  @earendil-works/pi-ai 0.85.1
  OpenAI Codex — design reference only; no Codex source is redistributed
  https://github.com/openai/codex
  73a1148c9c775c2a4616ce5096291740a00ed68a
  Apache License 2.0
  ```

  Append complete MIT license texts from the DSH/Pi repositories after their sections. The Codex section states only design reference and links; do not add Codex to distributed components.

- [ ] Create the sole shared product metadata package `@local-harness/product-identity`, with fixed public exports:

  To avoid a workspace-wide version rewrite without product value, V1 Alpha inherits the pinned DSH baseline's already-consistent `0.1.5-alpha.2`. This package is a private `@local-harness/*` workspace member outside the DSH npm release family; the A2 Local verifier independently enforces root-version equality and prohibits publication.

  ```ts design
  export const productIdentity = Object.freeze({
    name: 'Local-Harness-pi',
    version: '0.1.5-alpha.2',
    appId: 'io.localharness.pi',
    officialDisclaimer: 'Local-Harness-pi is not an official OpenAI or DeepSeek product.',
    dsh: Object.freeze({ commit: 'b2e3b2a0125854567a4a5fcba75782e42fe84901', license: 'MIT' }),
    pi: Object.freeze({ version: '0.85.1', license: 'MIT' }),
    codex: Object.freeze({ commit: '73a1148c9c775c2a4616ce5096291740a00ed68a', usage: 'design-reference-only' }),
  })

  export const thirdPartyNotices: string
  ```

  `thirdPartyNotices` must be byte-identical to `apps/desktop/resources/THIRD_PARTY_NOTICES.txt`. Tests read root `package.json`, `apps/cli/package.json`, `apps/desktop/package.json`, `apps/desktop-host/package.json`, `apps/desktop/scripts/desktop-release-environment.mjs`, `docs/upstream/source-lock.json`, and both exports, rejecting drift in product/release-family versions, app ID, commit, Pi version, license, or notice bytes. This package is the Host-only authority: Electron About imports it directly; Web About reads only the redacted Remote projection defined in C2. Do not add this Host package to the Client aggregate or duplicate constants in Client.

  Place the package in the existing `packages/util/product-identity` group with a private ESM manifest and version `0.1.5-alpha.2`; add README/README.i18n using the DSH util template and state zero direct model context in Model Experience. Add the exact source alias `@local-harness/product-identity` to `tsconfig.base.json` and a project reference to `tsconfig.host.json`, never also to `tsconfig.client.json`. Add `"@local-harness/product-identity": "workspace:*"` to `apps/desktop/package.json`, run `pnpm install` and `pnpm run doc-sync`, and commit generated `README.zh.md` together. About detail in `main.ts` must import this package.

- [ ] Add notices to electron-builder `extraResources`:

  ```js
  { from: resolve(root, 'resources/THIRD_PARTY_NOTICES.txt'), to: 'THIRD_PARTY_NOTICES.txt' },
  ```

  Reuse an equivalent root variable already in the config; do not derive paths from cwd. Update macOS/Windows builder tests to assert runtime, seed, and notices are all present without assuming array positions.

- [ ] Add About to the existing Application menu. `main.ts` creates read-only detail from `app.getVersion()`, the pinned DSH commit, and Pi `0.85.1`; buttons are Close and Third-party licenses. License selection may only call `shell.openPath(join(process.resourcesPath, 'THIRD_PARTY_NOTICES.txt'))`, using repository `apps/desktop/resources/THIRD_PARTY_NOTICES.txt` in development. Display an actionable error if opening fails; accept no renderer-supplied path.

  About detail must contain product version, DSH commit, Pi version, and `Local-Harness-pi is not an official OpenAI or DeepSeek product.`. Extract path selection and detail assembly into exported pure functions so `product-identity.spec.ts` can verify them without starting Electron.

- [ ] Run focused tests.

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts apps/desktop/tests/windows-sign.spec.ts apps/desktop/tests/macos-signature.spec.ts scripts/client-build-environment.client.spec.ts scripts/dev-web.spec.ts packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx packages/bundle/web-app/tests/web-app.spec.ts apps/web/tests/pwa-manifest.e2e.ts`

  Expected: all pass.

- [ ] Commit.

  Run:

  ```powershell
  git add UPSTREAM.md apps/desktop/electron-builder.config.mjs apps/desktop/build/icon.svg apps/desktop/package.json apps/desktop/scripts/desktop-release-environment.mjs apps/desktop/src/main.ts apps/desktop/src/locale.ts apps/desktop/renderer/plugin-manager.html apps/desktop/renderer/plugin-manager.js apps/desktop/resources/THIRD_PARTY_NOTICES.txt apps/web/index.html apps/web/public/favicon.svg apps/web/public/manifest.webmanifest apps/web/vite.config.ts apps/web/tests/assembled-boot.ts apps/web/tests/pwa-manifest.e2e.ts apps/web/tests/expected/onboarding-deepseek-config/welcome.expected.md apps/web/tests/expected/web-runtime-context/web-surface-prompt.expected.md packages/util/product-identity packages/bundle/web-app/cordis.patch.yml packages/bundle/web-app/src/index.ts packages/bundle/web-app/tests/web-app.spec.ts packages/client/locale/src/locales/en.ts packages/client/locale/src/locales/zh.ts packages/client/ui-brand-official/src/client/Brand.tsx packages/client/ui-brand-official/src/client/index.ts packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx packages/client/ui-settings-models/src/client/locales.ts packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx scripts/client-build-environment.ts scripts/client-build-environment.client.spec.ts scripts/dev-web.spec.ts apps/desktop/tests/locale.spec.ts apps/desktop/tests/macos-signature.spec.ts apps/desktop/tests/windows-sign.spec.ts apps/desktop/tests/product-identity.spec.ts tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
  git commit -m "feat: apply the Local-Harness-pi desktop identity and notices"
  ```

## Task A4: Isolate desktop DSH_HOME under Electron userData

**Files:**

- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/host-process.ts`
- Modify: `apps/desktop/src/paths.ts`
- Modify: `apps/desktop/tests/host-process.spec.ts`
- Modify: `apps/desktop/tests/project-manager.spec.ts`
- Test: `apps/desktop/tests/paths.spec.ts`

- [ ] First write failing tests: profile, session dependency root, and pnpm state from `resolveDesktopPaths('C:\\Users\\dev\\AppData\\Roaming\\Local-Harness-pi\\harness')` must all reside under that root; Host spawn environment must contain the same `DSH_HOME` path.

- [ ] Run the failing tests.

  Run: `pnpm vitest run apps/desktop/tests/paths.spec.ts apps/desktop/tests/host-process.spec.ts`

- [ ] Compute the root path only once in `main.ts`:

  ```ts design
  const harnessHome = join(app.getPath('userData'), 'harness')
  const paths = resolveDesktopPaths(harnessHome)
  ```

  Add `harnessHome: string` to the `DesktopHostProcess` constructor and add to the spawn environment:

  ```ts design
  const environment = {
    DSH_HOME: this.harnessHome,
  }
  ```

  Pass the same `harnessHome` to every active and health-check path in `startHost()`. Do not accept this path from the renderer or settings.

- [ ] Verify that development overrides affect only the project directory, not DSH_HOME; verify two desktop instances cannot select different homes and then share a session writer.

- [ ] Run tests.

  Run: `pnpm vitest run apps/desktop/tests/paths.spec.ts apps/desktop/tests/host-process.spec.ts apps/desktop/tests/project-manager.spec.ts`

- [ ] Commit.

  Run:

  ```powershell
  git add apps/desktop/src/main.ts apps/desktop/src/host-process.ts apps/desktop/src/paths.ts apps/desktop/tests/host-process.spec.ts apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/paths.spec.ts
  git commit -m "feat: isolate desktop data under Electron userData"
  ```

## Task A5: Extract Electron security options into regression-testable pure configuration

**Files:**

- Create: `apps/desktop/src/window-options.ts`
- Modify: `apps/desktop/src/main.ts`
- Test: `apps/desktop/tests/window-options.spec.ts`

- [ ] First write failing tests covering the main and plugin windows:

  ```ts design
  expect(options.webPreferences).toMatchObject({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  })
  expect(options.webPreferences?.preload).toBe(preload)
  ```

  Also assert absence of `allowRunningInsecureContent`, `webviewTag`, and remote-module switches.

- [ ] Run the failing tests.

  Run: `pnpm vitest run apps/desktop/tests/window-options.spec.ts`

- [ ] Extract existing BrowserWindow options unchanged into a pure function:

  ```ts design
  export function desktopWindowOptions(preload: string): BrowserWindowConstructorOptions {
    return {
      width: 1280,
      height: 840,
      minWidth: 880,
      minHeight: 600,
      show: false,
      webPreferences: {
        preload,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    }
  }
  ```

  `main.ts` uses `new BrowserWindow(desktopWindowOptions(preload))`, retaining listeners that reject `window.open` and non-`dsh-app:` navigation.

- [ ] Run tests.

  Run: `pnpm vitest run apps/desktop/tests/window-options.spec.ts apps/desktop/tests/host-protocol.spec.ts apps/desktop/tests/single-instance.spec.ts`

- [ ] Commit.

  Run:

  ```powershell
  git add apps/desktop/src/window-options.ts apps/desktop/src/main.ts apps/desktop/tests/window-options.spec.ts
  git commit -m "test: lock the Electron security baseline"
  ```

## Task A6: Extract the DSH Agent machine construction seam

**Files:**

- Modify: `packages/core/agent-loop/src/index.ts`
- Create: `packages/core/agent-loop/tests/agent-machine-seam.spec.ts`
- Modify: `packages/core/agent-loop/README.md`
- Modify: `packages/core/agent-loop/README.zh.md`
- Modify when required by doc-sync: `packages/core/agent-loop/README.i18n.yaml`

- [ ] Execute Task R1 of the [Agent Machine Seam Rectification Plan](2026-09-18-agent-machine-seam-rectification.md) completely. First prove with a test subclass that create/resume both pass through the construction seam and the default path still returns `ReactLoopAgent`.

- [ ] Add `AgentLoopMachine extends Agent` (its sole extra member is `scope`, required by DSH lifecycle) and `AgentMachineCreateInput`; add protected `createMachine()` to `AgentLoop`, replacing the sole `new ReactLoopAgent(...)` call with that hook.

- [ ] Do not expose or override `prepare()`, `setupAndPublish()`, `createAgent()`, `resume()`, write ownership, registry publication, or rollback; PR-A default composition and runtime behavior remain unchanged.

- [ ] Run focused gates and commit.

  ```powershell
  pnpm vitest run packages/core/agent-loop/tests
  pnpm --filter @deepseek-ai/dsh-agent-loop run typecheck
  pnpm run build:lib
  pnpm run test:docs
  git diff --check
  git add packages/core/agent-loop/src/index.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/core/agent-loop/README.md packages/core/agent-loop/README.zh.md packages/core/agent-loop/README.i18n.yaml
  git commit -m "refactor: expose DSH agent machine construction seam"
  ```

  Omit `README.i18n.yaml` from `git add` arguments if doc-sync did not modify it.

## Task A7: Establish PR-A baseline evidence and submit a Draft PR

**Files:**

- Modify: `README.md`
- Create: `.agents/notes/architecture/2026-09-10-local-harness-pi-source-baseline.md`

- [ ] Make README a complete project entry, retaining links to the four authoritative design documents and explaining that internal `dsh` identifiers are upstream compatibility identifiers, not a second product.

- [ ] Record in an Agent Note why the pinned DSH merge is used, why npm scope/protocol/events are not renamed in bulk, how the desktop data root reaches Host, and rollback boundaries.

- [ ] Run focused and repository gates.

  Run:

  ```powershell
  pnpm install --frozen-lockfile
  pnpm run check:local-harness:sources
  pnpm run typecheck
  pnpm run lint
  pnpm vitest run apps/desktop/tests
  pnpm run test:docs
  pnpm run build:desktop
  ```

  Expected: all pass. For known upstream failures in the fixed Windows environment, provide results of the same command on the unmodified baseline and current branch; do not delete tests.

- [ ] Review the staged diff and commit documentation evidence.

  Run:

  ```powershell
  git diff --check
  git status --short
  git add README.md .agents/notes/architecture/2026-09-10-local-harness-pi-source-baseline.md
  git commit -m "docs: record the Local-Harness-pi source baseline"
  ```

- [ ] Push and create a Draft PR. Without a confirmed `origin`, stop only at this step; earlier local completion remains valid.

  Run:

  ```powershell
  git push -u origin pr-a/dsh-baseline
  gh pr create --draft --title "feat: establish the Local-Harness-pi DSH baseline" --body-file .\.github\pull_request_template.md
  ```

  Include actual test results in the PR description without claiming Pi integration.

## PR-A effort and handoff gates

- Estimated net effort: 5–6 working days, approximately 0.7–1.0 full GPT-5.6 Sol Plus weekly quotas.
- Day 1: A1; days 2–3: A2–A3 (including Web/model identity, brand assets, and About); day 4: A4–A5; day 5: A6 seam and lifecycle regression; day 6 provides Windows/build fixes and A7 margin.
- Early completion requires A1–A6 committed, all A7 gates passing, notices present in the unpacked artifact, and a published Draft PR.
- Provenance locks, product identity, About/licenses, isolated `DSH_HOME`, and Electron security cannot be deferred to PR-B. Failure of any one blocks PR-A.
