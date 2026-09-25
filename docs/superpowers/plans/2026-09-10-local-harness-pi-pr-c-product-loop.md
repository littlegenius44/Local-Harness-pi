# PR-C V1 Product Loop Implementation Plan

English | [中文](2026-09-10-local-harness-pi-pr-c-product-loop.zh.md)

Fences marked `ts design` are planned implementation excerpts checked for syntax only, not available APIs. Their omitted host dependencies must be wired and pass source typechecking and contract tests in the owning implementation task.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After stabilizing the Pi kernel bridge, complete local/cloud OpenAI-compatible configuration, graphical MCP management, capability settings, the Composer “+” menu, the session library, compact tool cards, Goal/Plan/Skill/PDF/web capability verification, manual updates, and the Windows release workflow.

**Architecture:** All settings and capability state remain in DSH Host services/settings/projections; the frontend adds replaceable navigation and presentation only. GUI-managed MCP records enter the `local-harness.mcp` DSH settings namespace, then Host dynamically mounts the existing DSH MCP Client; fixed-composition MCP remains read-only. Composer shortcuts execute existing DSH commands/sources or open the same settings section, without a second set of Goal/Plan/Skill/MCP state.

**Tech Stack:** DSH Client slots/settings/remotes、React、TypeScript、Vitest browser tests、Electron updater、OpenAI Responses/Chat Completions mock server。

---

## Upstream rereading checklist

Read completely before starting:

- DSH Client: `ui-conversation`'s `InputBar.tsx`, `apply.ts`, `contract/slots.ts`; `ui-input-trigger`; `ui-commands`; `ui-goal`; `ui-plan`; `ui-skill`; `ui-settings*`; `ui-tool`; `ui-attachment`; `ui-sidebar-documentpreview`; related unit/E2E tests.
- DSH Host: `docs/cookbook/adding-a-package.md`; `llm-pi-ai/src/config.ts`, `adapter.ts`, `catalog.ts`, `discovery.ts`, `provider.ts`, `stream.ts`; `web/web-fetch-http/src/network.ts` and network tests; `settings/settings` and `api/settings-controller`; `credentials/credentials` and `api/settings-controller/src/credentials.ts`; `host/plugin-inventory`; `mcp/mcp-client/src/index.ts`, `transport.ts`, `connection.ts`, and all tests; `api/remotes` forwarded-event allowlist and Typert selection; `api/session-controller`; `apps/desktop/src/update-coordinator.ts`, `main.ts`, `ipc.ts`.
- Codex: settings navigation, Composer “+” menu, and compact tool presentation; adopt interaction principles only, never copy source.
- Pi: check 0.85.1 OpenAI Responses/Completions model metadata; do not change the kernel protocol in this PR.

## Task C1: Constrain and complete the V1 OpenAI-compatible route

**Files:**

- Modify: `packages/llm/llm-pi-ai/src/config.ts`
- Modify: `packages/llm/llm-pi-ai/src/adapter.ts`
- Modify: `packages/llm/llm-pi-ai/src/index.ts`
- Modify: `packages/llm/llm-pi-ai/src/discovery.ts`
- Modify: `packages/llm/llm-pi-ai/src/provider.ts`
- Modify: `packages/llm/llm-pi-ai/package.json`
- Modify: `packages/llm/llm-pi-ai/tests/config.spec.ts`
- Modify: `packages/llm/llm-pi-ai/tests/egress.spec.ts`
- Modify: `packages/llm/llm-pi-ai/tests/adapter.spec.ts`
- Create: `packages/llm/llm-pi-ai/tests/provider-v1-auth.spec.ts`
- Create: `packages/util/guarded-fetch/package.json`
- Create: `packages/util/guarded-fetch/tsconfig.json`
- Create: `packages/util/guarded-fetch/tsdown.config.ts`
- Create: `packages/util/guarded-fetch/README.md`
- Create: `packages/util/guarded-fetch/README.i18n.yaml`
- Create: `packages/util/guarded-fetch/src/index.ts`
- Create: `packages/util/guarded-fetch/src/network.ts`
- Create: `packages/util/guarded-fetch/tests/guarded-fetch.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/tests/readiness.client.spec.ts`
- Modify: `packages/client/ui-settings-models/tests/welcome-store.client.spec.ts`
- Create: `apps/web/tests/onboarding-openai-compatible.e2e.ts`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`

- [ ] First write failing route-validation tests: local HTTP/HTTPS allows `127.0.0.0/8`, `::1`, and `localhost` only when every DNS result is loopback; reject remote HTTP and redirects outside loopback; both local/cloud reject URL userinfo/query/fragment, and cloud permits HTTPS only; V1 product writes reject any nonempty `headers` and non-SSE transport, and Host alone constructs standard OpenAI Authorization from the `apiKeyEnv` credential reference. Internal public headers from the pinned upstream catalog never enter UI snapshots.

- [ ] First write wire API tests: creating/modifying a route requires explicit `openai-responses` or `openai-completions`; V1 writes reject all other Pi protocols; never infer protocol from URL.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/egress.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

- [ ] Add product fields to `PiAiProviderProfile`:

  ```ts design
  interface ProviderProfileExcerpt {
    location?: 'local' | 'cloud'
  }
  ```

  Every route created or changed through Models UI that declares `baseURL` requires `location` and `api`. Unmodified read-only entries from the pinned upstream catalog may retain defaults for read compatibility, but V1 UI offers no way to create non-OpenAI protocols.

- [ ] Add a pure validation function:

  ```ts design
  export function assertV1OpenAiRoute(provider: string, profile: PiAiProviderProfile): void
  ```

  Run it before `assertServiceable` and discovery; credentials still accept only `apiKeyEnv` credential references, and UI-created/modified routes reject arbitrary headers. Never write secrets into settings to reuse DSH's general `headers` field.

- [ ] First create `@local-harness/guarded-fetch@0.1.5-alpha.2` following interface contract 11.1. Extract the “resolve DNS once -> validate every result -> request-scoped Undici Agent pinned lookup -> body/dispatcher cleanup” pattern from pinned DSH `web-fetch-http/src/network.ts`, adapting it to two explicit destinations, `loopback | https`; never directly import `@deepseek-ai/dsh-web-fetch-http/src/*`. Tests must cover IPv4/IPv6/localhost, mixed loopback/non-loopback DNS, DNS rebinding pinning, same-origin 307/308, credential-bearing cross-origin 307/308, 301/302/303, the sixth redirect, non-replayable bodies, abort, cleanup after normal completion/cancellation/error, and no reading of system proxy environment variables.

  The package manifest is private ESM, `version` is `0.1.5-alpha.2`, and direct dependencies use the exact versions already in the lockfile: `undici: 8.10.0` and `ipaddr.js: 2.5.0`; follow the DSH util package README template to describe Host-only use, zero direct model context, and limitations. Add an exact `@local-harness/guarded-fetch` source alias in `tsconfig.base.json` and a project reference in `tsconfig.host.json`. Run `pnpm run doc-sync` to generate paired READMEs; if `README.zh.md` is generated, commit it with this task.

- [ ] Add a factory to `PiAiAdapterOptions` that creates a `GuardedFetchHandle` from the frozen profile; `streamWithSnapshot()` passes `handle.fetch` to `streamSimple()` and awaits disposal after completion, cancellation, or error. Discovery gets fetch from the same factory. Local profiles use `destination='loopback'`; cloud profiles use `destination='https'`; `credentialBound` reflects whether the profile declares `apiKeyEnv`. Add `@local-harness/guarded-fetch: workspace:*` to `llm-pi-ai/package.json`. Tests capture `SimpleStreamOptions.fetch` inside the mock Pi API to prove neither model streaming nor discovery falls back to `globalThis.fetch`, and credentials are sent only to the origin locked by the handle.

- [ ] For profiles containing `location`, `provider.ts` forces Harness-owned `harnessApiKeyAuth`; even provider keys matching the Pi installed catalog (such as `openai`/`openai-codex`) must not inherit its OAuth, credential store, or ambient environment discovery. Pass empty auth for local profiles without `apiKeyEnv`; reject cloud profiles missing `apiKeyEnv` before saving. Tests set marker values in `OPENAI_API_KEY`/the Pi OAuth store, issue a keyless local request, and assert the marker never enters headers, errors, logs, or Session; separately prove explicit DSH credentials resolve exactly once in the current step.

- [ ] Add explicit “Local/Cloud” and “Responses/Chat Completions” choices to ProviderEditor; saving continues through `SettingsScopeBinder` and the existing credential operation. API key input must never enter component snapshots, settings mutations, or console output.

- [ ] Lock the first-launch state machine; implementers must not invent skip conditions:

  1. No serviceable provider: Welcome/Onboarding opens automatically, Composer Send is disabled, and submit events never reach Host.
  2. Loopback route: `apiKeyEnv` may be empty; after saving succeeds and model id/serviceability pass, close onboarding and atomically update the default selection.
  3. Cloud route: ready requires both `apiKeyEnv` and `credentials.describe(ref).configured=true`; dismissing the dialog leaves Send disabled.
  4. Discovery failure: preserve the current draft, existing manual models, and credential state; show the error code together with the “Enter model id manually” action.
  5. Default model changes write DSH `agent-default-model` settings; in-session changes use existing session selection and affect only the next step.

  `onboarding-openai-compatible.e2e.ts` uses two keyless fixtures: loopback `/v1/models` without a key, and an HTTPS-shaped mock adapter requiring Authorization. Never read real user credentials.

- [ ] Default composition no longer activates `@deepseek-ai/dsh-llm-deepseek`. Because DSH `agent-default-model` schema requires nonempty provider/model, composition uses only the non-callable bootstrap selection `local-openai/unconfigured`; never hardcode a Qwen or cloud model id as the product default or preset an unknown port or credentials. Models onboarding creates the user's chosen route with explicit protocol and baseURL, then atomically writes the real provider/model to default selection after route validation succeeds. While selection remains `local-openai/unconfigured` or the corresponding route/model is missing, Send must stay disabled and issue no requests. Users may discover values through `/v1/models` or enter model ids manually; local and cloud routes share this flow. Retain the DSH DeepSeek source package for upstream compatibility, but do not activate it in the V1 default profile.

- [ ] Run focused tests and the mock model matrix.

  Run:

  ```powershell
  pnpm vitest run packages/llm/llm-pi-ai/tests packages/client/ui-settings-models/tests
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/onboarding-openai-compatible.e2e.ts
  pnpm run check:local-harness
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/llm/llm-pi-ai packages/util/guarded-fetch packages/client/ui-settings-models packages/bundle/base apps/web/tests/onboarding-openai-compatible.e2e.ts tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
  git commit -m "feat: constrain V1 to explicit OpenAI-compatible routes"
  ```

## Task C2: Add a safe capability-inventory Remote

**Files:**

- Create: `packages/api/session-controller/src/capabilities.ts`
- Create: `packages/api/session-controller/tests/capabilities.host.spec.ts`
- Modify: `packages/api/session-controller/src/index.ts`
- Modify: `packages/api/session-controller/package.json`
- Modify: `packages/host/plugin-inventory/src/types.ts`
- Modify: `packages/host/plugin-inventory/src/index.ts`
- Modify: `packages/host/plugin-inventory/tests/inventory.spec.ts`

- [ ] First write Host tests expecting only safe metadata in the response:

  ```ts design
  export interface CapabilitySnapshot {
    readonly sessionId?: SessionId
    readonly product: {
      readonly name: 'Local-Harness-pi'
      readonly version: '0.1.5-alpha.2'
      readonly appId: 'io.localharness.pi'
      readonly officialDisclaimer: string
      readonly dsh: { readonly commit: string; readonly license: 'MIT' }
      readonly pi: { readonly version: '0.85.1'; readonly license: 'MIT' }
      readonly codex: { readonly commit: string; readonly usage: 'design-reference-only' }
      readonly thirdPartyNotices: string
    }
    readonly tools: readonly {
      name: string
      source: 'builtin' | 'mcp'
      serverName?: string
    }[]
    readonly mcp: readonly {
      entryId: PluginEntryId
      serverName: string
      transport: 'stdio' | 'streamable-http'
      phase: PluginFiberPhase
      toolCount: number
    }[]
  }
  ```

- [ ] Generate `product` only from Host-only `@local-harness/product-identity`; add the workspace dependency to `session-controller/package.json`. Tests compare Remote fields individually against that package's exports and prove the full notice is readable offline. The response must not contain local notice paths, MCP command args, env, HTTP headers, credential reference values, tool schema arguments, or workspace file paths.

- [ ] Run the failing tests.

  Run: `pnpm vitest run packages/api/session-controller/tests/capabilities.host.spec.ts packages/host/plugin-inventory/tests/inventory.spec.ts`

- [ ] Add only allowlisted optional metadata to `PluginInventoryEntry`. Read and validate `serverName` and `transport` from loader config only when moduleName is `@deepseek-ai/dsh-mcp-client`; project no other config fields.

- [ ] `capabilities/list` accepts optional sessionId. With a live agent, read visible tools from that Agent scope's `tools.schemas(agent)` and count by `mcp__<serverName>__`; without a session, return an empty tools array while still returning configured/failed MCP entries. Skills continue using the existing `skills/list` Remote; never duplicate its directory or cache.

- [ ] Run the Typert generator and tests.

  Run:

  ```powershell
  pnpm run build:lib:host
  pnpm run typecheck:contracts-ready
  pnpm vitest run packages/api/session-controller/tests/capabilities.host.spec.ts packages/host/plugin-inventory/tests/inventory.spec.ts
  ```

  `build:lib:host` generates Typert Remote artifacts; never hand-edit generated directories and skip `typecheck:contracts-ready`.

- [ ] Commit.

  Run:

  ```powershell
  git add packages/api/session-controller packages/host/plugin-inventory packages/api/remotes pnpm-lock.yaml
  git commit -m "feat: expose a redacted capability inventory"
  ```

## Task C3: Implement Host-owned MCP configuration and per-server reconciliation

**Files:**

- Create: `packages/mcp/mcp-configuration/package.json`
- Create: `packages/mcp/mcp-configuration/tsconfig.json`
- Create: `packages/mcp/mcp-configuration/tsdown.config.ts`
- Create: `packages/mcp/mcp-configuration/README.md`
- Create: `packages/mcp/mcp-configuration/README.i18n.yaml`
- Create: `packages/mcp/mcp-configuration/src/types.ts`
- Create: `packages/mcp/mcp-configuration/src/config.ts`
- Create: `packages/mcp/mcp-configuration/src/reconciler.ts`
- Create: `packages/mcp/mcp-configuration/src/index.ts`
- Create: `packages/mcp/mcp-configuration/tests/config.spec.ts`
- Create: `packages/mcp/mcp-configuration/tests/reconciler.spec.ts`
- Modify: `packages/mcp/mcp-client/package.json`
- Modify: `packages/mcp/mcp-client/src/transport.ts`
- Modify: `packages/mcp/mcp-client/tests/egress.spec.ts`
- Create: `packages/api/mcp-configuration-controller/package.json`
- Create: `packages/api/mcp-configuration-controller/tsconfig.json`
- Create: `packages/api/mcp-configuration-controller/tsdown.config.ts`
- Create: `packages/api/mcp-configuration-controller/README.md`
- Create: `packages/api/mcp-configuration-controller/README.i18n.yaml`
- Create: `packages/api/mcp-configuration-controller/src/types.ts`
- Create: `packages/api/mcp-configuration-controller/src/index.ts`
- Create: `packages/api/mcp-configuration-controller/tests/controller.host.spec.ts`
- Modify: `packages/api/remotes/src/index.ts`
- Modify: `packages/api/remotes/src/remote-events.ts`
- Modify: `packages/api/remotes/src/types.ts`
- Modify: `packages/api/remotes/package.json`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

- [ ] Before creating packages, write config tests covering every input bound in section 20.1 of `docs/architecture/interface-contracts.md`. The table must include 65 servers, 129 args, 65 bindings, invalid/duplicate `serverName`, invalid credential refs, CR/LF prefixes, `DSH_` env, shell command strings, relative cwd, HTTP userinfo/query/fragment, remote HTTP, localhost/loopback IP HTTP, HTTPS, forbidden headers, and valid Authorization credential bindings.

- [ ] Never build a separate MCP transport/client. MCP config chooses shared `@local-harness/guarded-fetch` policy from the initial URL: loopback HTTP/HTTPS uses `destination='loopback'`; other addresses require HTTPS and `destination='https'`; any credential-bound header sets `credentialBound=true`. Add `@local-harness/guarded-fetch: workspace:*` to `mcp-client/package.json`; `transport.ts` passes handle.fetch to SDK `StreamableHTTPClientTransport` and awaits handle.dispose on fiber disposal. The GUI config validator reuses guarded-fetch's exported pure URL/DNS policy instead of writing `http-url-policy.ts`. MCP tests rerun the integration subset of shared policy: loopback/HTTPS, userinfo, same-origin 307, credential-bearing cross-origin 307, 302, the sixth redirect, abort, and response-body closure; adjust existing proxy tests to assert models/MCP do not read system proxies while preserving DSH `web_fetch`'s own proxy behavior.

- [ ] Fix the package manifest as private ESM:

  ```json
  {
    "name": "@local-harness/mcp-configuration",
    "version": "0.1.5-alpha.2",
    "private": true,
    "type": "module"
  }
  ```

  `@local-harness/mcp-configuration` depends only on actually imported DSH settings, credentials, tools, MCP Client, schema, and `@local-harness/guarded-fetch`; the API package is fixed as `@local-harness/api-mcp-configuration-controller@0.1.5-alpha.2` and depends only on MCP configuration, Typert/Remote, and required DSH API packages. Neither may depend on Pi packages or Client UI. Write the DSH-template README/README.i18n for each new Host package and run `pnpm run doc-sync`; add exact source aliases for `@local-harness/mcp-configuration` and `@local-harness/api-mcp-configuration-controller` in `tsconfig.base.json`, and project references for `packages/mcp/mcp-configuration` and `packages/api/mcp-configuration-controller` in `tsconfig.host.json`; never add them to the Client aggregate.

- [ ] Register only `SETTINGS_NAMESPACE = 'local-harness.mcp'` in `config.ts`. The user section has only `servers: McpManagedServerRecord[]`; base is `{ servers: [] }`. After generating the id, Host uses DSH settings CAS for the entire servers array; write no separate JSON/YAML files and never persist runtime phase into settings.

- [ ] First write failing reconciler tests using the real DSH Tool Registry and mock MCP transport, with fixed assertions:

  - Create remains disabled with no transport; enabling without credentials returns `MCP_CREDENTIAL_MISSING`.
  - Enable resolves only binding references and passes resolved values to DSH MCP Client config; snapshots, logger output, and errors contain no such values.
  - Updating A disposes/remounts only A; B's fiber identity, tool generation, and active call remain unchanged.
  - Initial sync failure of one server records `MCP_APPLY_FAILED`; other servers and builtin tools remain present.
  - Updating credential A restarts only servers referencing A; two rapid revisions serialize, and an old completion cannot overwrite the new phase.
  - Disable/remove awaits DSH MCP Client disposal; remove never calls `credentials.unset`.

- [ ] `McpConfigurationReconciler` mounts GUI-managed DSH MCP Clients in the Host root tool scope so Agent child scopes see managed tools through the existing DSH scoped registry. Fix internal state as:

  ```ts design
  interface AppliedServer {
    readonly id: McpManagedServerId
    readonly configRevision: number
    readonly generation: number
    readonly dispose: () => void | Promise<void>
  }

  const applied = new Map<McpManagedServerId, AppliedServer>()
  const queues = new Map<McpManagedServerId, Promise<void>>()
  ```

  Operations for each id chain onto its own queue; different ids may run concurrently. Mount the existing `@deepseek-ai/dsh-mcp-client` plugin; never duplicate transport, reconnect, tool registration, or tool execution. Add real-scope tests proving a root managed tool is visible to two Agent scopes and disappears from both on disposal; this is the DSH Tool Registry deployment-global layer contract, not an Agent Preset overlay, and creates no per-session connection/config copies.

- [ ] Write failing API controller tests first, then implement `list/create/update/setEnabled/remove/reconnect` exactly as interface contract 20.2 specifies. Business rejections throw DSH `RemoteError` with the exact `mcp/*` wire code; Client maps to the corresponding `MCP_*` semantic code only at the boundary. CAS occurs after validation but before credential resolution/fiber mutation. `create` discards Client id and forces disabled; reject unacknowledged renames and composition/managed name conflicts before commit.

- [ ] Mutations separate commit from apply: failed CAS changes no runtime state; successful CAS returns the latest snapshot and `application.phase='error'` even if connection fails, never throws an error implying configuration was not saved. The `mcp-configuration/status` Cordis event emits only `McpServerRuntimeView`, never config or credentials; add the same-named `emit` entry to the `@deepseek-ai/dsh-api-remotes` forwarded-event allowlist and expose it to Client through `TypertRemoteEventSelection`.

- [ ] Load configuration service and controller after settings, credentials, and tools in base composition; add no default server. Run generation and tests:

  ```powershell
  pnpm run build:lib:host
  pnpm run typecheck:contracts-ready
  pnpm vitest run packages/mcp/mcp-configuration/tests packages/api/mcp-configuration-controller/tests packages/mcp/mcp-client/tests
  pnpm run check:local-harness
  ```

  Expected: all pass; `git grep -n "@earendil-works/pi" -- packages/mcp/mcp-configuration packages/api/mcp-configuration-controller` produces no output.

- [ ] Commit:

  ```powershell
  git add packages/mcp/mcp-client packages/mcp/mcp-configuration packages/api/mcp-configuration-controller packages/api/remotes packages/bundle/base pnpm-lock.yaml tsconfig.base.json tsconfig.host.json
  git commit -m "feat: add host-owned MCP configuration management"
  ```

## Task C4: Complete Tools, Skills, MCP, Experimental, and About settings sections

**Files:**

- Create: `packages/client/ui-settings-capabilities/package.json`
- Create: `packages/client/ui-settings-capabilities/tsconfig.json`
- Create: `packages/client/ui-settings-capabilities/tsdown.config.ts`
- Create: `packages/client/ui-settings-capabilities/README.md`
- Create: `packages/client/ui-settings-capabilities/README.i18n.yaml`
- Create: `packages/client/ui-settings-capabilities/src/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/index.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/ToolsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/SkillsSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpServerDialog.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/McpCredentialBindingsEditor.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/ExperimentalSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/AboutSection.tsx`
- Create: `packages/client/ui-settings-capabilities/src/client/notices.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/store.ts`
- Create: `packages/client/ui-settings-capabilities/src/client/locales.ts`
- Create: `packages/client/ui-settings-capabilities/tests/apply.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/store.client.spec.ts`
- Create: `packages/client/ui-settings-capabilities/tests/sections.client.spec.tsx`
- Modify: `packages/bundle/web-app/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.client.json`

- [ ] First write slot-registration tests asserting fixed section ids and order: `models=10` (existing), `tools=20`, `skills=30`, `mcp=40`, `experimental=90`, `about=100`. All copy uses typed zh/en locales.

- [ ] Fix the new package manifest to `"name": "@local-harness/ui-settings-capabilities"`, `"version": "0.1.5-alpha.2"`, `"private": true`, ESM, and standard DSH Client package `main/types/exports`. Use `ui-settings-plugins` as the dependency/peer-dependency template, adding only actually imported DSH Client/Remote workspace packages; never depend on Host-only `@local-harness/product-identity`. `web-app` loads it through a workspace dependency and existing Client plugin row.

  Following `packages/client/AGENTS.md` and the DSH client package template, add the `dsh.client` manifest, `./client` export, client tsdown preset, and README/README.i18n; add exact `@local-harness/ui-settings-capabilities` and `/client` aliases in `tsconfig.base.json`, and a single project reference in `tsconfig.client.json`, never the Host aggregate. Run `pnpm install` and `pnpm run doc-sync`, committing generated README.zh.md too.

- [ ] First write store tests: capability, plugin inventory, and skills requests are single-flight within one connection generation; Host invalidation/connection reset refreshes them; without a current session, Skills/MCP show configuration state without inventing live tool counts.

- [ ] ToolsSection reuses existing DSH settings scopes and the Bash/Web Search/Agent Loop controllers from `ui-settings-plugins`; extract and export shared controllers instead of copying settings. Add summaries of permission preset, workspace, network, and effective MCP permissions; full editing still targets the same Host settings document. V1 treats installed DSH execution plugins as trusted source; basic denials remain enforced by DSH workspace/network/approval/`tools/pre-execute` policies; add no unenforced portable manifest permission fields.

- [ ] With a current session, SkillsSection calls existing `skills/list` to display source, model/user invocability, conflicts, or load errors; without a session, show “Open a workspace session to inspect”. Never scan the browser filesystem or cache `SKILL.md` bodies.

- [ ] McpSection combines `mcpConfiguration.list()`, `pluginInventory.list()`, and `capabilities/list(sessionId)`: composition rows show “Provided by configuration, read-only”; managed rows offer Edit, Enable/Disable, Reconnect, Remove. One failure must not hide other servers. Client store holds only uncommitted drafts and the current Remote snapshot; reread after connection-generation changes, with no localStorage/IndexedDB writes.

  On first enabling a stdio row, UI must show a local-process risk confirmation with executable, individual args, cwd, and env reference names (never values); HTTP rows show origin and header names. Cancellation issues no `setEnabled`; Host records a redacted diagnostic audit for actual enable mutations (server id/name, transport, and time, excluding args, URL path/query, ref/value), never in Session.

- [ ] McpServerDialog uses structured fields, never a command-line textarea. New entries default disabled; switching transport clears fields of the other arm; each args line is one array item. Each credential editor row edits env/header name, credential reference, and public prefix; secret values go only through the existing one-way `credentials.set(ref, value)` operation, while the page shows only configured/source/writable.

- [ ] Test each save/error interaction: CAS conflicts preserve the draft and show Reload/Compare without automatic retry; rename warns about tool-name changes and passes `acknowledgeToolRename=true` on second confirmation; apply errors show “Configuration saved, connection failed” and Reconnect; remove states that credentials remain; missing credentials disable Enable and focus the corresponding binding.

- [ ] V1 ExperimentalSection shows descriptions of explicitly disabled future capabilities only, with no switches for Qwen Code kernel, Office editing, full browser automation, or automatic installation.

- [ ] AboutSection reads only the `product` Remote projection from `capabilities/list`, showing product version, pinned DSH/Pi/Codex references, and full DSH/Pi MIT texts offline; `notices.ts` only sections `product.thirdPartyNotices` for UI, never declares version constants or reads local paths. Host tests already compare against authoritative exports from `apps/desktop/resources/THIRD_PARTY_NOTICES.txt`; Client tests verify rendering only. External links use the safe external-open component; license texts remain expandable offline.

- [ ] Run tests and the Web composition build.

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-settings-capabilities/tests
  pnpm run build:web
  pnpm run typecheck
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/client/ui-settings-capabilities packages/client/ui-settings-plugins packages/bundle/web-app pnpm-lock.yaml tsconfig.base.json tsconfig.client.json
  git commit -m "feat: add capability-focused settings sections"
  ```

## Task C5: Add a settings navigation service and Composer “+” capability menu

**Files:**

- Create: `packages/client/ui-settings/src/client/navigation.ts`
- Modify: `packages/client/ui-settings/src/client/index.ts`
- Modify: `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`
- Create: `packages/client/ui-settings-general/tests/settings-navigation.client.spec.tsx`
- Create: `packages/client/ui-conversation/src/client/skeleton/ComposerAddMenu.tsx`
- Create: `packages/client/ui-conversation/src/client/skeleton/ComposerAddMenu.module.css`
- Modify: `packages/client/ui-conversation/src/client/contract/slots.ts`
- Modify: `packages/client/ui-conversation/src/client/apply.ts`
- Modify: `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`
- Modify: `packages/client/ui-conversation/src/client/locales.ts`
- Create: `packages/client/ui-conversation/tests/composer-add-menu.client.spec.tsx`
- E2E: `apps/web/tests/composer-add-menu.e2e.ts`

- [ ] First write settings-navigation tests: `ctx.settingsNavigation.open('mcp')` opens Settings and selects the registered section; a missing id returns a stable error without opening an empty panel; requests remain in memory, never localStorage.

- [ ] Implement the root service:

  ```ts design
  export interface SettingsNavigationRequest {
    readonly revision: number
    readonly sectionId: string
  }

  export class SettingsNavigationService extends Service {
    readonly requests: ObservableSnapshot<SettingsNavigationRequest | null>
    open(sectionId: string): void
  }
  ```

  `SettingsRoot` subscribes to requests, validates sectionId in the ledger, and sets panel open and active section; handling a revision clears no durable state because none exists here.

- [ ] Generalize Composer injection from command-only to any source:

  ```ts design
  interface ComposerInjectionExcerpt {
    toggleInputSource: ((source: 'command' | 'skill', selection: EditSelection) => void) | undefined
  }
  ```

  The implementation continues calling existing `inputTriggers.toggleSource(source, ...)`; never write separate skill search.

- [ ] First write menu tests with fixed items and behavior:

  1. Attachment: trigger the existing hidden file input.
  2. Skill: open the existing `skill` input source.
  3. MCP: open settings `mcp`.
  4. Tools & Permissions: open settings `tools`.
  5. Goal: invoke the existing `/goal` command path.
  6. Plan: invoke `/plan` or `/plan off` based on the DSH plan projection.
  7. Commands: open the existing `command` input source.

  Use `role=menu`/`menuitem`; support Enter, arrow keys, Escape, outside click, and focus restoration.

- [ ] Replace the Plus button's direct command-list opening with `ComposerAddMenu`. Attachments must be available through Plus; existing layout tests determine whether to retain the paperclip as a redundant shortcut, but the Plus path must work fully.

- [ ] Goal/Plan labels and state read only DSH projections/command availability; Skills/MCP read only existing Remotes/stores; never save capability switches in React state or localStorage.

- [ ] Run tests.

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-settings-general/tests/settings-navigation.client.spec.tsx packages/client/ui-conversation/tests/composer-add-menu.client.spec.tsx
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/composer-add-menu.e2e.ts
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/client/ui-settings packages/client/ui-settings-general packages/client/ui-conversation apps/web/tests/composer-add-menu.e2e.ts
  git commit -m "feat: add the unified Composer capability menu"
  ```

## Task C6: Compact tool cards and converge transient to durable state

**Files:**

- Modify: `packages/client/ui-tool/src/client/tool/ToolCallTree.tsx`
- Modify: corresponding `packages/client/ui-tool/src/client/**/*.module.css`
- Modify: `packages/client/ui-tool/tests/tool-call-tree.client.spec.tsx`
- Modify: `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`
- Modify: `packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts`
- E2E: `apps/web/tests/tool-card-compact.e2e.ts`
- E2E: `apps/web/tests/session-stream-convergence.e2e.ts`

- [ ] First write tool-card tests: default display includes only status, tool name, short target, recorded duration, and result summary; raw arguments/output/error/meta appear only when expanded; errors and pending approval remain recognizable while collapsed.

- [ ] Calculate duration only from durable call/result timestamps or existing projections; omit it when historical events lack time, never fabricate replay values with `Date.now()`.

- [ ] First write session-convergence tests: transient revisions for the same messageId replace monotonically; the corresponding durable seq replaces in place; discard old-session deltas after session switching; reconnect rebuilds from DSH snapshot without a browser-side durable chat copy.

- [ ] Change assistant projection only if tests prove a gap; if pinned DSH already converges correctly, retain its source and commit regression tests only. Never change Session schema for visual collapsing.

- [ ] Run tests and E2E.

  Run:

  ```powershell
  pnpm vitest run packages/client/ui-tool/tests packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/tool-card-compact.e2e.ts apps/web/tests/session-stream-convergence.e2e.ts
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add packages/client/ui-tool packages/client/ui-chat apps/web/tests/tool-card-compact.e2e.ts apps/web/tests/session-stream-convergence.e2e.ts
  git commit -m "feat: compact tool cards and lock stream convergence"
  ```

## Task C7: Verify reused capabilities and the complete product workflow

**Files:**

- Modify tests: `apps/web/tests/goal-bar.e2e.ts`
- Modify tests: `apps/web/tests/plan-control-row.e2e.ts`
- Modify tests: `apps/web/tests/skill-user-invoke.e2e.ts`
- Create: `apps/web/tests/mcp-tool-through-pi.e2e.ts`
- Create: `apps/web/tests/mcp-configuration.e2e.ts`
- Modify tests: `apps/web/tests/document-preview.e2e.ts`
- Create: `apps/web/tests/web-tools-through-pi.e2e.ts`
- Create: `apps/web/tests/session-library-through-pi.e2e.ts`
- Create: `apps/web/tests/diff-through-pi.e2e.ts`
- Modify tests: `apps/web/tests/message-actions.e2e.ts`
- Modify tests: `apps/web/tests/chat-continuous-conversation.e2e.ts`
- Modify tests: `apps/web/tests/queue-actions.e2e.ts`
- Modify tests: `apps/web/tests/steering.e2e.ts`
- Modify tests: `apps/web/tests/message-feedback.e2e.ts`
- Modify tests: `apps/web/tests/pwsh-terminal.e2e.ts`
- Modify tests: `apps/web/tests/navigation-panes.e2e.ts`
- Modify tests: `apps/web/tests/workspace-management.e2e.ts`
- Modify: `packages/bundle/web-app/cordis.patch.yml`

- [ ] Goal tests assert `/goal` and the Plus entry produce the same `goal/change` projection; GoalBar remains consistent after recovery.

- [ ] Plan tests assert that after `/plan`, the next step's DSH tool schema is restricted, Plus shows exit state, and `/plan off` restores it; never read Pi state.

- [ ] Skill tests assert existing progressive disclosure: the directory listing does not put all SKILL.md files in the prompt; selection reads the body; Pi receives only DSH assembled context.

- [ ] In `packages/bundle/web-app/cordis.patch.yml`, change the existing `session-query-sqlite` row exactly to `path: !!js dshHomePath('session-search.db')` and `openAt: first-search`. Preserve base bundle `openAt: never` so the desktop product choice does not spread to CLI/other profiles; test scaffolds may continue overriding it explicitly to `:memory:`.

- [ ] MCP tests start DSH's fixture server, register an `mcp__*` tool through DSH MCP Client, invoke it through the Pi tool wrapper, and verify Session still records DSH `tool/call`/`tool/result`.

- [ ] MCP configuration E2E follows AC-009 exactly: create disabled stdio -> credential set -> enable -> call -> add HTTP -> make stdio fail -> HTTP/builtin remain available -> stale revision update -> acknowledged rename -> reconnect -> remove. Each step asserts Host snapshot, current Agent tool schema, and DSH Session history; test secrets must not appear in DOM, Remote snapshots, logs, or Session.

- [ ] Session-library E2E reuses only DSH commands/UI: the first completed turn generates exactly one `session/title`; manual rename survives restart without automatic-title overwrite; first body query triggers `first-search`; archive hides from the default list and the archive filter restores visibility; the final fork event is a balanced turn; Header and `/export` contents match. Sessions still open directly after SQLite corruption; failed rebuilding does not change Session available state.

- [ ] Preserve existing DSH everyday-session regression coverage: `message-actions` copy/fork only at completed turns, `chat-continuous-conversation` multiple continuous turns, `queue-actions` queue editing, `steering` next-step, and `message-feedback` user feedback. Run these tests under the new default composition; never point them back to ReactLoopAgent to pass.

- [ ] Diff/Terminal regression: invoke patch and PowerShell through Pi; Diff cards show durable file deltas, Terminal cards/`pwsh-terminal.e2e.ts` show exit codes, truncation, and cancellation; refresh restores from durable events without Pi runtime frames.

- [ ] PDF tests verify attachment references and previews only, with explicitly no edit button. Web tests verify `web_fetch`/`web_search` still pass through DSH egress/approval; add no Playwright/Computer-use product dependency.

- [ ] Run capability E2E.

  Run:

  ```powershell
  pnpm run build
  pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/goal-bar.e2e.ts apps/web/tests/plan-control-row.e2e.ts apps/web/tests/skill-user-invoke.e2e.ts apps/web/tests/mcp-tool-through-pi.e2e.ts apps/web/tests/mcp-configuration.e2e.ts apps/web/tests/document-preview.e2e.ts apps/web/tests/web-tools-through-pi.e2e.ts apps/web/tests/session-library-through-pi.e2e.ts apps/web/tests/diff-through-pi.e2e.ts apps/web/tests/message-actions.e2e.ts apps/web/tests/chat-continuous-conversation.e2e.ts apps/web/tests/queue-actions.e2e.ts apps/web/tests/steering.e2e.ts apps/web/tests/message-feedback.e2e.ts apps/web/tests/pwsh-terminal.e2e.ts apps/web/tests/navigation-panes.e2e.ts apps/web/tests/workspace-management.e2e.ts
  ```

- [ ] Commit.

  Run:

  ```powershell
  git add apps/web/tests packages/bundle/web-app/cordis.patch.yml
  git commit -m "test: prove DSH capabilities through the Pi loop"
  ```

## Task C8: Make Alpha updates manual checks and manual downloads

**Files:**

- Modify: `apps/desktop/src/update-coordinator.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/ipc.ts`
- Modify: `apps/desktop/src/preload.ts`
- Modify: `apps/desktop/src/locale.ts`
- Modify: `apps/desktop/scripts/desktop-auto-update-environment.mjs`
- Modify: `apps/desktop/tests/update-coordinator.spec.ts`
- Modify: `apps/desktop/tests/desktop-auto-update-environment.spec.ts`

- [ ] First write failing tests: no automatic check after startup; `autoDownload=false`; no install/quitAndInstall IPC; manual checks return only an HTTPS download page for available versions; reject invalid/HTTP download pages; failed checks neither block startup nor repeatedly open dialogs.

- [ ] Remove startup `setTimeout(() => checkAndPrompt(false), 10_000)` behavior. Retain the “Check for updates” menu.

- [ ] Add `downloadUrl` to the available arm of `DesktopUpdateState`, sourced from an explicitly configured HTTPS release page in the packaging environment. Main process opens it with Electron `shell.openExternal()`; sender validation and URL revalidation must occur in main process.

- [ ] Remove the renderer-callable install method and `updatesInstall` channel. V1 never calls `downloadUpdate()` or `quitAndInstall()`; signed auto-install code may remain as unwired V1.1 groundwork, but boundary tests must prove it unreachable.

- [ ] Run tests.

  Run: `pnpm vitest run apps/desktop/tests/update-coordinator.spec.ts apps/desktop/tests/desktop-auto-update-environment.spec.ts apps/desktop/tests/locale.spec.ts`

- [ ] Commit.

  Run:

  ```powershell
  git add apps/desktop
  git commit -m "feat: make Alpha updates check-and-download only"
  ```

## Task C9: Complete Windows V1 E2E, release evidence, and Draft PR

**Files:**

- Create: `apps/desktop/tests/v1-product-flow.e2e.ts`
- Create: `scripts/measure-local-harness-v1.ts`
- Create: `scripts/tests/measure-local-harness-v1.spec.ts`
- Modify: `package.json`
- Create: `docs/release/v1-alpha-checklist.md`
- Create: `docs/release/v1-alpha-known-limitations.md`
- Create: `docs/release/v1-alpha-performance.json`
- Create: `.agents/notes/architecture/2026-09-10-v1-client-capability-surfaces.md`
- Modify: `README.md`

- [ ] Desktop E2E runs real Electron plus mock OpenAI server, covering first model onboarding, open/reopen workspace, create/rename/search/archive/restore/fork/export session, streaming reply, approval allow/deny, Diff, Terminal, steer, queue, cancel, Goal, Plan, Skill, graphical MCP configuration/calls, attachments, PDF previews, About/offline licenses, and exit/recovery.

- [ ] Tests directly terminate the Host process to verify all three durability barriers; restart opens from DSH Session. Assert session bodies still open without SQLite and search recovers after rebuilding; use a small-window mock to complete all three AC-010 automatic/context-overflow/manual compaction paths.

- [ ] Add `measure-local-harness-v1.ts`: launch pinned DSH and candidate roots using the same mock provider, fixed workspace, and hardware. For cold start and latency from first Host assistant delta to DOM presentation, warm up twice and sample ten times per group; for idle process-tree memory, capture working sets of all Electron/Host child processes after ready and 60 seconds without tasks, five samples per group; generate 1000 sessions in two independent DSH_HOME directories using the same repeatable fixture generator, then sample ten times from Session Query request to stable list DOM. Never copy user-profile data.

  Output JSON must include both commits, Node/Electron/Windows versions, raw samples, and conclusions for all four thresholds; exit nonzero if cold-start median regresses over 15%, added latency exceeds 100ms, idle process-tree memory regresses over 20%, or 1000-session list median regresses over 15%. Unit tests use deterministic clock/process samples to verify median, process-tree summation, thresholds, and JSON redaction.

  Add fixed entries to `package.json`:

  ```json
  {
    "scripts": {
      "benchmark:local-harness:v1": "tsx scripts/measure-local-harness-v1.ts"
    }
  }
  ```

  Before launch, the script must verify baseline root HEAD equals the pinned DSH hash and both roots have build artifacts; if missing, print build commands and exit without automatically installing dependencies or downloading files.

- [ ] Desktop E2E uses unique marker text to cover diagnostic-log redaction: default logs, errors, redacted diagnostic export, and release evidence must contain no API key, MCP credential, final HTTP header, prompt, assistant body, raw tool output, file content, or attachment bytes. Full Session export is a user-selected content export requiring a content warning first; never incorrectly assert it is redacted. Also verify explicit bounds on capability stores, MCP per-id reconciliation queues, tool commit buffers, and listener queues, with no timer, subscriber, MCP child process, or Session write-handle leaks after cancel/dispose.

- [ ] Release limitations explicitly list: no Qwen Code kernel, public OpenAI inbound gateway, Office/PDF editing, full browser automation, or automatic update installation; macOS/Linux are not V1 binary gates.

- [ ] Run all gates.

  Run:

  ```powershell
  pnpm install --frozen-lockfile
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run test
  pnpm run test:snapshot
  pnpm run test:web
  pnpm run test:gui
  pnpm run test:docs
  pnpm run build
  pnpm run benchmark:local-harness:v1 -- --baseline-root E:\AI\_reference\deepseek-harness-current --candidate-root E:\AI\Local-Harness-pi --output docs/release/v1-alpha-performance.json
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:dir
  pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64
  git diff --check
  ```

- [ ] On clean Windows 11 x64, verify NSIS SHA-256 first, then install -> first launch -> local/cloud model smoke -> exit -> uninstall, confirming the uninstaller preserves user-selected workspace files. Record only results, artifact hash, model id, route type, and time in the checklist, never baseURL queries, headers, or keys; explicitly state the Alpha is unsigned and may trigger SmartScreen warnings.

- [ ] Commit evidence, push, and create a Draft PR.

  Run:

  ```powershell
  git add apps/desktop/tests/v1-product-flow.e2e.ts scripts/measure-local-harness-v1.ts scripts/tests/measure-local-harness-v1.spec.ts package.json docs/release README.md .agents/notes/architecture/2026-09-10-v1-client-capability-surfaces.md
  git commit -m "test: complete the Local-Harness-pi V1 product flow"
  git push -u origin pr-c/v1-product-loop
  gh pr create --draft --title "feat: complete the Local-Harness-pi V1 desktop flow" --body-file .\.github\pull_request_template.md
  ```

  Do not automatically merge the PR or create a public Release here; the project owner decides after reviewing all three checkpoints.

## PR-C effort and handoff gates

- Estimated net effort: 7–9 working days, approximately 1.0–1.4 full GPT-5.6 Sol Plus weekly quotas; shared guarded-fetch and model/MCP wiring take approximately 1–1.5 days, replacing the two separate redirect implementations without adding duplicate effort.
- Day 1: C1; day 2: C2; days 3–4: C3 Host MCP; days 4–5: C4–C5 UI; days 5–7: C6–C8; days 7–9: C9, Windows packages, and fixes. Overlapping days mean sequential switching within a workday, not authorization to edit the same file in parallel.
- C3 is the longest risk item: if any CAS, credential-redaction, per-server reconciliation, or root-scope visibility test fails, never bypass it with browser-local configuration, per-session configuration, or a Pi MCP Client.
- Completion requires AC-001–AC-010, TEST-005/006, Windows unpacked and unsigned NSIS install/uninstall smoke, all four performance gates, and all release gates to pass; the Draft PR description lists actual model smoke tests and all known limitations.
