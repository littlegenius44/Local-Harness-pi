# PR-A DSH Baseline and Product Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把固定 DSH 快照导入新仓库，保留来源与内部兼容标识，完成 Local-Harness-pi 产品品牌、Windows 数据隔离和 Electron 安全基线，并证明未接 Pi 时平台仍可构建运行。

**Architecture:** 采用源码快照而非运行时多仓组合。保留 DSH npm scope、Cordis plugin id、`dsh-app` 自定义协议和 preload 内部对象名，以避免无收益的大范围改名；只改产品可见标识与桌面专用数据根。PR-A 不修改 Agent Loop 行为。

**Tech Stack:** Git、pnpm workspace、TypeScript、Electron 44、Vitest、electron-builder。

---

## 上游复读清单

开工前完整阅读：

- DSH：根 `AGENTS.md`、`docs/architecture.md`、`docs/defensive-patterns.md`、`apps/desktop/src/main.ts`、`host-process.ts`、`paths.ts`、`ipc.ts`、`preload.ts`、`project-manager.ts`、`update-coordinator.ts`、`electron-builder.config.mjs`、对应 `apps/desktop/tests/*.spec.ts`。
- Codex：桌面安全、设置和 Composer 入口相关实现；只参考交互与安全原则，不复制 Apache-2.0 代码。
- Pi：本 PR 不接入运行时，只核对 `packages/agent/package.json` 的许可证和版本。

## Task A1：导入固定 DSH 源码快照

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Create: `docs/upstream/dsh-root-agents.md`
- Import: DSH commit `b2e3b2a0125854567a4a5fcba75782e42fe84901` 的其余 tracked files

- [ ] 创建分支并确认文档基线。

  Run:

  ```powershell
  git switch -c pr-a/dsh-baseline
  git status --short
  git log -1 --oneline
  ```

  Expected: 工作区干净，最新提交包含已批准的设计文档。

- [ ] 保存 DSH 根规则副本，确保解决根文件冲突后仍可查阅完整上游约束。

  Run:

  ```powershell
  New-Item -ItemType Directory -Force .\docs\upstream
  Copy-Item -LiteralPath E:\AI\_reference\deepseek-harness-current\AGENTS.md -Destination .\docs\upstream\dsh-root-agents.md
  git add docs/upstream/dsh-root-agents.md
  git commit -m "docs: preserve the DSH repository rules"
  ```

- [ ] 以 unrelated-history merge 导入固定 commit，保留上游历史和 MIT 来源。

  Run:

  ```powershell
  git remote add dsh-upstream https://github.com/deepseek-ai/deepseek-harness.git
  git fetch --no-tags dsh-upstream b2e3b2a0125854567a4a5fcba75782e42fe84901
  git merge --allow-unrelated-histories --no-commit b2e3b2a0125854567a4a5fcba75782e42fe84901
  ```

  Expected: 只允许 `README.md` 和 `AGENTS.md` 出现 add/add 冲突。若还有冲突，停止导入并核对固定 commit，不做批量覆盖。

- [ ] 对两个已知冲突保留 Local-Harness-pi 版本，然后补入上游规则链接。

  Run:

  ```powershell
  git restore --source=HEAD --staged --worktree -- README.md AGENTS.md
  git add README.md AGENTS.md docs/upstream/dsh-root-agents.md
  git status --short
  ```

  在 `AGENTS.md`“开始工作前”加入：

  ```md
  5. DSH 继承代码还必须遵循 [固定上游根规则](docs/upstream/dsh-root-agents.md) 以及各子目录 `AGENTS.md`；与本文件冲突时以本文件的产品架构和删除限制为准。
  ```

  Expected: 不再有 unmerged path；设计文档仍存在。

- [ ] 校验导入树与来源。

  Run:

  ```powershell
  git diff --name-only --diff-filter=U
  Test-Path .\apps\desktop\src\main.ts
  Test-Path .\packages\core\agent-loop\src\index.ts
  Test-Path .\LICENSE
  ```

  Expected: 第一条无输出，后三条均为 `True`。

- [ ] 提交导入。

  Run:

  ```powershell
  git add -A
  git diff --cached --check
  git commit -m "chore: import the pinned DSH source baseline"
  ```

## Task A2：记录机器可校验的来源和许可证

**Files:**

- Create: `UPSTREAM.md`
- Create: `docs/upstream/source-lock.json`
- Create: `scripts/verify-local-harness-sources.ts`
- Modify: `package.json`
- Test: `scripts/tests/verify-local-harness-sources.spec.ts`

- [ ] 先写失败测试，要求精确 hash、Pi 版本和许可证字段。

  测试必须构造一个修改了单个 hash 的临时 manifest，并断言 verifier 以非零结果拒绝；再读取真实 manifest，断言 DSH/Pi/Codex 三项均存在。

  `source-lock.json` 的最终内容固定为：

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

- [ ] 运行失败测试。

  Run: `pnpm vitest run scripts/tests/verify-local-harness-sources.spec.ts`

  Expected: 因 verifier 或 manifest 尚未存在而失败。

- [ ] 实现 verifier：使用 `readFile` + `JSON.parse`，逐字段比较上述常量，并读取 lockfile 确认 Pi 包版本没有 `^`、`~`、workspace 浮动或不同版本。

  `package.json` 增加：

  ```json
  {
    "scripts": {
      "check:local-harness:sources": "tsx scripts/verify-local-harness-sources.ts"
    }
  }
  ```

- [ ] 写 `UPSTREAM.md`，明确 DSH 是源代码基线、Pi 是 npm 内核依赖、Codex 只作设计参考；链接三份许可证，不宣称 OpenAI 或 DeepSeek 官方产品。

- [ ] 运行测试和门禁。

  Run:

  ```powershell
  pnpm vitest run scripts/tests/verify-local-harness-sources.spec.ts
  pnpm run check:local-harness:sources
  ```

  Expected: 全部通过。

- [ ] 提交。

  Run:

  ```powershell
  git add UPSTREAM.md docs/upstream/source-lock.json scripts/verify-local-harness-sources.ts scripts/tests/verify-local-harness-sources.spec.ts package.json
  git commit -m "docs: lock upstream source provenance"
  ```

## Task A3：建立产品可见品牌，保留内部兼容标识

**Files:**

- Modify: `apps/desktop/electron-builder.config.mjs`
- Modify: `apps/desktop/src/locale.ts`
- Modify: `apps/desktop/renderer/plugin-manager.html`
- Modify: `apps/desktop/renderer/plugin-manager.js`
- Modify: `apps/desktop/tests/locale.spec.ts`
- Modify: `apps/desktop/tests/windows-sign.spec.ts`
- Test: `apps/desktop/tests/product-identity.spec.ts`

- [ ] 先写产品身份测试，断言 builder 配置包含：

  ```ts
  expect(config.productName).toBe('Local-Harness-pi')
  expect(config.artifactName).toBe('local-harness-pi-${version}-${os}-${arch}.${ext}')
  ```

  同时断言 locale 的启动失败、更新标题和插件窗口标题不再包含 `DeepSeek Harness`。

- [ ] 运行测试并确认失败。

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts`

- [ ] 做最小品牌替换。

  `electron-builder.config.mjs` 只改：

  ```js
  productName: 'Local-Harness-pi',
  artifactName: 'local-harness-pi-${version}-${os}-${arch}.${ext}',
  ```

  locale 和插件管理器用户可见文本统一用 `Local-Harness-pi`。不得改以下内部兼容标识：`@deepseek-ai/dsh-*`、Cordis plugin id、`dsh-app` scheme、`window.dshDesktop`、Session event type。

- [ ] 运行聚焦测试。

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts apps/desktop/tests/windows-sign.spec.ts`

  Expected: 全部通过。

- [ ] 提交。

  Run:

  ```powershell
  git add apps/desktop/electron-builder.config.mjs apps/desktop/src/locale.ts apps/desktop/renderer/plugin-manager.html apps/desktop/renderer/plugin-manager.js apps/desktop/tests/locale.spec.ts apps/desktop/tests/windows-sign.spec.ts apps/desktop/tests/product-identity.spec.ts
  git commit -m "feat: apply the Local-Harness-pi desktop identity"
  ```

## Task A4：把桌面 DSH_HOME 隔离到 Electron userData

**Files:**

- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/host-process.ts`
- Modify: `apps/desktop/src/paths.ts`
- Modify: `apps/desktop/tests/host-process.spec.ts`
- Modify: `apps/desktop/tests/project-manager.spec.ts`
- Test: `apps/desktop/tests/paths.spec.ts`

- [ ] 先写失败测试：`resolveDesktopPaths('C:\\Users\\dev\\AppData\\Roaming\\Local-Harness-pi\\harness')` 的 profile、sessions 依赖根和 pnpm 状态都必须位于该根；Host spawn env 必须包含同一路径的 `DSH_HOME`。

- [ ] 运行失败测试。

  Run: `pnpm vitest run apps/desktop/tests/paths.spec.ts apps/desktop/tests/host-process.spec.ts`

- [ ] 在 `main.ts` 只计算一次根路径：

  ```ts
  const harnessHome = join(app.getPath('userData'), 'harness')
  const paths = resolveDesktopPaths(harnessHome)
  ```

  `DesktopHostProcess` 构造函数增加 `harnessHome: string`，spawn env 增加：

  ```ts
  DSH_HOME: this.harnessHome,
  ```

  `startHost()` 的活动和 health-check 路径全部传同一个 `harnessHome`。不得从 renderer 或 settings 接受该路径。

- [ ] 验证开发模式覆盖仍只影响 project directory，不改变 DSH_HOME；验证两个桌面实例不能指向两个 home 后再共享一个 session writer。

- [ ] 运行测试。

  Run: `pnpm vitest run apps/desktop/tests/paths.spec.ts apps/desktop/tests/host-process.spec.ts apps/desktop/tests/project-manager.spec.ts`

- [ ] 提交。

  Run:

  ```powershell
  git add apps/desktop/src/main.ts apps/desktop/src/host-process.ts apps/desktop/src/paths.ts apps/desktop/tests/host-process.spec.ts apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/paths.spec.ts
  git commit -m "feat: isolate desktop data under Electron userData"
  ```

## Task A5：把 Electron 安全选项变成可回归测试的纯配置

**Files:**

- Create: `apps/desktop/src/window-options.ts`
- Modify: `apps/desktop/src/main.ts`
- Test: `apps/desktop/tests/window-options.spec.ts`

- [ ] 先写失败测试，覆盖主窗口和插件窗口：

  ```ts
  expect(options.webPreferences).toMatchObject({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  })
  expect(options.webPreferences?.preload).toBe(preload)
  ```

  另断言没有 `allowRunningInsecureContent`、`webviewTag` 或远程模块开关。

- [ ] 运行失败测试。

  Run: `pnpm vitest run apps/desktop/tests/window-options.spec.ts`

- [ ] 把现有 BrowserWindow options 原样提取为纯函数：

  ```ts
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

  `main.ts` 用 `new BrowserWindow(desktopWindowOptions(preload))`，保留拒绝 `window.open` 和非 `dsh-app:` navigation 的监听器。

- [ ] 运行测试。

  Run: `pnpm vitest run apps/desktop/tests/window-options.spec.ts apps/desktop/tests/host-protocol.spec.ts apps/desktop/tests/single-instance.spec.ts`

- [ ] 提交。

  Run:

  ```powershell
  git add apps/desktop/src/window-options.ts apps/desktop/src/main.ts apps/desktop/tests/window-options.spec.ts
  git commit -m "test: lock the Electron security baseline"
  ```

## Task A6：建立 PR-A 基线证据并提交 Draft PR

**Files:**

- Modify: `README.md`
- Create: `.agents/notes/architecture/2026-09-10-local-harness-pi-source-baseline.md`

- [ ] README 改为完整项目入口，保留四份权威设计文档链接，增加“内部 `dsh` 标识是上游兼容标识，不是第二个产品”的说明。

- [ ] Agent Note 记录：为什么用固定 DSH merge、为什么不批量重命名 npm scope/protocol/event、桌面数据根如何传给 Host、回滚边界。

- [ ] 运行聚焦和仓库门禁。

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

  Expected: 全部通过。若上游自身在固定 Windows 环境有已知失败，必须给出未改基线与当前分支的同命令对比，不得删测试。

- [ ] 检查 staged diff 并提交文档证据。

  Run:

  ```powershell
  git diff --check
  git status --short
  git add README.md .agents/notes/architecture/2026-09-10-local-harness-pi-source-baseline.md
  git commit -m "docs: record the Local-Harness-pi source baseline"
  ```

- [ ] 推送并创建 Draft PR。没有经确认的 `origin` 时只停在本步骤，不影响前面本地完成状态。

  Run:

  ```powershell
  git push -u origin pr-a/dsh-baseline
  gh pr create --draft --title "feat: establish the Local-Harness-pi DSH baseline" --body-file .\.github\pull_request_template.md
  ```

  PR 描述补入实际测试结果，不声称 Pi 已接入。
