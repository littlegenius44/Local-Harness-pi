# PR-A DSH Baseline and Product Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把固定 DSH 快照导入新仓库，保留来源与内部兼容标识，完成 Local-Harness-pi 产品品牌、离线 About/第三方许可、Windows 数据隔离和 Electron 安全基线，提取行为中性的 Agent machine 构造 seam，并证明未接 Pi 时平台仍可构建运行。

**Architecture:** 采用源码快照而非运行时多仓组合。保留 DSH npm scope、Cordis plugin id、`dsh-app` 自定义协议和 preload 内部对象名，以避免无收益的大范围改名；只改产品可见标识与桌面专用数据根。PR-A 不修改 Agent Loop 语义，只提取一个默认仍构造 `ReactLoopAgent` 的 protected machine-construction seam，供 PR-B 继承。

**Tech Stack:** Git、pnpm workspace、TypeScript、Electron 44、Vitest、electron-builder。

---

## 上游复读清单

开工前完整阅读：

- DSH：根 `AGENTS.md`、`BRAND_GUIDELINES.md`、`docs/architecture.md`、`docs/defensive-patterns.md`、`docs/cookbook/adding-a-package.md`、`scripts/check-workspace-constraints.ts`、`scripts/client-build-environment.ts`；`apps/desktop/src/main.ts`、`host-process.ts`、`paths.ts`、`ipc.ts`、`preload.ts`、`project-manager.ts`、`update-coordinator.ts`、`electron-builder.config.mjs` 及对应 `apps/desktop/tests/*.spec.ts`；`apps/web/public/manifest.webmanifest`、`apps/web/index.html`、`packages/client/ui-brand-official`、`packages/client/ui-settings-models` 与 `packages/bundle/web-app` 的品牌、welcome、system-prompt 实现和测试；`packages/core/agent-loop/src/index.ts`、`agent.ts`、全部 lifecycle tests，以及 `packages/core/agent/src/types.ts`、`runtime-types.ts`。
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
  5. DSH 继承代码还必须遵循 A1 创建的 `docs/upstream/dsh-root-agents.md` 固定上游根规则副本以及各子目录 `AGENTS.md`；与本文件冲突时以本文件的产品架构和删除限制为准。
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
- Modify: `packages/llm/llm-pi-ai/package.json`
- Modify: `scripts/check-workspace-constraints.ts`
- Modify: `scripts/check-workspace-constraints.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
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

- [ ] 实现 verifier：使用 `readFile` + `JSON.parse`，逐字段比较上述常量，并读取 `packages/llm/llm-pi-ai/package.json` 与 lockfile，确认已存在的 Pi direct specifier 和 resolved version 都没有 `^`、`~`、workspace 浮动或不同版本。PR-A 允许 `pi-agent-core` 尚未出现；一旦 `packages/core/agent-loop-pi/package.json` 存在，同一 verifier 必须要求 `pi-agent-core` 和 `pi-ai` 两个 direct dependency 及 lock resolution 都精确为 `0.85.1`。verifier 还要动态扫描 `packages/*/*/package.json`：所有 `@local-harness/*` 必须 `private: true`、版本与根 `0.1.5-alpha.2` 一致、不得包含 `publishConfig`。将上游 `@earendil-works/pi-ai` 的 `^0.85.1` 改为精确 `0.85.1`，然后只更新 lockfile：

  Run: `pnpm install --lockfile-only`

- [ ] 调整 DSH workspace constraint 的发布边界。固定 DSH 的 `standardReleaseMemberDirectory` 只按目录判断，任何新 `packages/*/*` 都会被误当作公开 npm release member；不能直接创建 private `@local-harness/*` 包。将判断改为同时查看 manifest：

  - `@local-harness/*` 在普通 `packages/*/*` 目录必须 `private: true`、无 `publishConfig`、版本等于根版本，并继续接受 files/exports/project-reference 通用检查；
  - `@deepseek-ai/dsh-*`、vendor 和现有 app 的发布策略保持原样；
  - 其他未知 scope 不获得 private 例外，避免无意绕过发布门禁。

  `scripts/check-workspace-constraints.spec.ts` 用临时 manifest 覆盖：合法 Local private 包、错误版本、缺 private、带 publishConfig，以及一个现有 DSH public member不受影响。不得通过把整个 `packages/*/*` 从扫描中排除来通过测试。

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
  pnpm run constraints
  ```

  Expected: 全部通过。

- [ ] 提交。

  Run:

  ```powershell
  git add UPSTREAM.md docs/upstream/source-lock.json scripts/verify-local-harness-sources.ts scripts/tests/verify-local-harness-sources.spec.ts scripts/check-workspace-constraints.ts scripts/check-workspace-constraints.spec.ts packages/llm/llm-pi-ai/package.json package.json pnpm-lock.yaml
  git commit -m "docs: lock upstream source provenance"
  ```

## Task A3：建立产品可见品牌、About 和离线许可

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

- [ ] 先写产品身份测试，断言 builder 配置包含：

  ```ts
  expect(config.productName).toBe('Local-Harness-pi')
  expect(config.artifactName).toBe('local-harness-pi-${version}-${os}-${arch}.${ext}')
  expect(config.appId).toBe('io.localharness.pi')
  ```

  同时断言 locale 的启动失败、更新标题和插件窗口标题不再包含 `DeepSeek Harness`；菜单文案包含 About 和第三方许可入口；PWA `name`/`short_name`、初始 HTML 标题、构建期 `DSH_CLIENT_TITLE`、侧栏文本、空会话标志和首次欢迎文案均为 Local-Harness-pi 产品身份。

- [ ] 运行测试并确认失败。

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts`

- [ ] 做最小品牌替换。

  `electron-builder.config.mjs` 的品牌字段固定为：

  ```js
  productName: 'Local-Harness-pi',
  artifactName: 'local-harness-pi-${version}-${os}-${arch}.${ext}',
  win: { /* 保留本任务定义的其他字段 */, icon: 'build/icon.svg' },
  ```

  `apps/desktop/scripts/desktop-release-environment.mjs` 导出 `DEFAULT_DESKTOP_APP_ID = 'io.localharness.pi'`。`resolveDesktopAppId({})` 返回该值；若 `DSH_DESKTOP_APP_ID` 存在但不等于该值则失败，避免 CI 意外生成另一个应用身份。保留 `DSH_DESKTOP_APP_ID` 变量名只为兼容现有 release 脚本。`macos-signature.spec.ts` 同步覆盖默认值、相同显式值和不一致显式值三种情况。

  locale 和插件管理器用户可见文本统一用 `Local-Harness-pi`。将 `scripts/client-build-environment.ts` 的 official `DSH_CLIENT_TITLE` 改为 `Local-Harness-pi`，同步更新它的单元测试和 `dev-web.spec.ts`；保留环境变量名 `DSH_CLIENT_TITLE`，只改值。`apps/web/index.html` 与 `vite.config.ts` 的无环境 fallback 也固定为 `Local-Harness-pi`，防止首帧或非 official 开发构建短暂显示旧名。

  `manifest.webmanifest` 固定 `name: "Local-Harness-pi"`、`short_name: "LH-pi"`。`apps/desktop/build/icon.svg` 是唯一主图：`viewBox="0 0 32 32"`，深色圆角方形底、白色 L 与 π 几何 path、蓝色右上角圆点，所有字形只用 `path/rect/circle`，不得用 `<text>` 或运行时字体。`apps/web/public/favicon.svg` 与主图字节一致；不得复制或描摹 DSH/OpenAI/Pi 官方图形资产。产品身份测试比较两文件 SHA-256，断言 SVG 无 `text/image/use/script` 元素且不含 DSH 原 `FISH_LOGO_PATH`；Windows unpacked/NSIS smoke 必须证明 electron-builder 从该 SVG 生成非默认 Electron 图标。

  现有 `@deepseek-ai/dsh-client-ui-brand-official` 包名为上游兼容标识，不重命名包；但其浏览器实现改为 Local-Harness-pi occupant：侧栏 name 渲染文本 `Local-Harness-pi`，侧栏 mark 与 `conversation.hero.brand.mark` 都渲染同一中性 `LHπ` SVG。`src/client/index.ts` 必须把 hero slot 加入同一组声明感知注册，teardown/HMR 时三个 occupant 一并移除。测试断言三个 slot 都注册、文本/`aria-label` 正确、mark 不再 import 或渲染 `FishLogo`/`BrandWordmark`，并继续覆盖“声明在 apply 前/后”两种顺序。

  首次欢迎页的中英文文案改为 Local-Harness-pi Alpha 声明，必须包含“built on DeepSeek Harness”、非 OpenAI/DeepSeek 官方产品、仅支持 OpenAI-compatible provider、数据默认保存在本机四项事实；同步更新 welcome notice 测试与 Web expected fixture。

  Web profile 的 `system-prompt` 行显式设置 `includeHarnessIdentity: false`，保留当前 `personaSuffix`，并把 `personaPrefix` 固定为 `You are the Local-Harness-pi coding agent powered by the {{model}} model.`。`packages/bundle/web-app/src/index.ts` 的模型可见 Web GUI 文案改为 `Local-Harness-pi Web GUI (built on DeepSeek Harness)`；`DSH_WEB_URL` 变量名继续保留。同步更新 `web-app.spec.ts` 和 Web runtime expected fixture，证明最终 prompt 只出现新的当前产品身份且没有默认 `You are an AI agent powered by DeepSeek Harness.` 句子。

  不得全仓替换 `DeepSeek Harness`。以下内容原样保留：`@deepseek-ai/dsh-*` 包名和 package description、Cordis plugin id、`dsh-app` scheme、`window.dshDesktop`、`DSH_*` 环境变量、Session/remote event type、CLI 可执行名 `dsh`、上游源码文档/测试语料，以及 About/notice 中真实的上游归属。`UPSTREAM.md` 增加一段品牌边界说明并引用固定快照的 `BRAND_GUIDELINES.md`。

- [ ] 把 Windows Alpha 打包收缩为未签名的手工安装流。在 `electron-builder.config.mjs` 的 Windows 分支不再调用 `createWindowsTokenSigner()`/`installWindowsNsisBootstrapSigner()`，固定 `win.forceCodeSigning=false`，保留 `target: ['nsis']`、`oneClick=false` 和可选安装目录。签名脚本保留但 V1 组合不可达；`windows-sign.spec.ts` 必须断言无证书环境也能生成 config、不安装 signer hook，且 NSIS target 仍存在。发布说明必须提示 Windows SmartScreen 可能警告；不得宣称该 Alpha 已签名。

- [ ] 写入离线 notice，测试必须逐项查找以下精确身份：

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

  DSH/Pi 段落后附它们仓库中的完整 MIT license text。Codex 段只说明设计参考和链接，不把 Codex 加入分发组件清单。

- [ ] 创建唯一共享的产品元数据包 `@local-harness/product-identity`，其 public export 固定为：

  为避免一次无产品价值的全 workspace 版本改写，V1 Alpha 直接继承固定 DSH 基线已一致的 `0.1.5-alpha.2`。该包是 `@local-harness/*` private workspace member，不进入 DSH npm release family；A2 增加的 Local verifier 单独要求它与根版本一致并禁止 publish。

  ```ts
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

  `thirdPartyNotices` 必须与 `apps/desktop/resources/THIRD_PARTY_NOTICES.txt` 字节一致。测试同时读取根 `package.json`、`apps/cli/package.json`、`apps/desktop/package.json`、`apps/desktop-host/package.json`、`apps/desktop/scripts/desktop-release-environment.mjs`、`docs/upstream/source-lock.json` 和这两个 export，拒绝产品/release-family version、app ID、commit、Pi version、license 或 notice 字节漂移。该包是 Host-only 权威源：Electron About 直接 import；Web About 只读取 C2 定义的脱敏 Remote 投影，不把此 Host package 加进 Client aggregate，也不在 Client 重写一份常量。

  包放在现有 `packages/util/product-identity` group，manifest 为 private ESM，版本 `0.1.5-alpha.2`；按 DSH util package 模板加入 README/README.i18n，Model Experience 写明零直接模型上下文。`tsconfig.base.json` 增加 `@local-harness/product-identity` 精确 source alias，`tsconfig.host.json` 增加 project reference，禁止同时加入 `tsconfig.client.json`。`apps/desktop/package.json` 增加 `"@local-harness/product-identity": "workspace:*"`，运行 `pnpm install` 和 `pnpm run doc-sync`；生成的 `README.zh.md` 必须一起提交。`main.ts` 的 About detail 必须 import 该包。

- [ ] 把 notice 加入 electron-builder `extraResources`：

  ```js
  { from: resolve(root, 'resources/THIRD_PARTY_NOTICES.txt'), to: 'THIRD_PARTY_NOTICES.txt' },
  ```

  若配置文件已有等价 root 变量，复用现有变量；不得从当前工作目录推导路径。同步更新 macOS/Windows builder 测试，断言 runtime、seed、notice 三项都存在，不用数组下标假定未来顺序。

- [ ] 在现有 Application 菜单中加入 About。`main.ts` 使用 `app.getVersion()`、固定 DSH commit 与 Pi `0.85.1` 形成只读 detail；按钮固定为“关闭”和“第三方许可”。选择许可后只允许 `shell.openPath(join(process.resourcesPath, 'THIRD_PARTY_NOTICES.txt'))`，开发模式改用仓库内 `apps/desktop/resources/THIRD_PARTY_NOTICES.txt`。打开失败显示可行动错误，不接受 renderer 传入路径。

  About detail 必须包含：产品版本、DSH commit、Pi version、`Local-Harness-pi is not an official OpenAI or DeepSeek product.`。将路径选择和 detail 组装提取为 export 纯函数，以便 `product-identity.spec.ts` 不启动 Electron 也能验证。

- [ ] 运行聚焦测试。

  Run: `pnpm vitest run apps/desktop/tests/product-identity.spec.ts apps/desktop/tests/locale.spec.ts apps/desktop/tests/windows-sign.spec.ts apps/desktop/tests/macos-signature.spec.ts scripts/client-build-environment.client.spec.ts scripts/dev-web.spec.ts packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx packages/bundle/web-app/tests/web-app.spec.ts apps/web/tests/pwa-manifest.e2e.ts`

  Expected: 全部通过。

- [ ] 提交。

  Run:

  ```powershell
  git add UPSTREAM.md apps/desktop/electron-builder.config.mjs apps/desktop/build/icon.svg apps/desktop/package.json apps/desktop/scripts/desktop-release-environment.mjs apps/desktop/src/main.ts apps/desktop/src/locale.ts apps/desktop/renderer/plugin-manager.html apps/desktop/renderer/plugin-manager.js apps/desktop/resources/THIRD_PARTY_NOTICES.txt apps/web/index.html apps/web/public/favicon.svg apps/web/public/manifest.webmanifest apps/web/vite.config.ts apps/web/tests/assembled-boot.ts apps/web/tests/pwa-manifest.e2e.ts apps/web/tests/expected/onboarding-deepseek-config/welcome.expected.md apps/web/tests/expected/web-runtime-context/web-surface-prompt.expected.md packages/util/product-identity packages/bundle/web-app/cordis.patch.yml packages/bundle/web-app/src/index.ts packages/bundle/web-app/tests/web-app.spec.ts packages/client/locale/src/locales/en.ts packages/client/locale/src/locales/zh.ts packages/client/ui-brand-official/src/client/Brand.tsx packages/client/ui-brand-official/src/client/index.ts packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx packages/client/ui-settings-models/src/client/locales.ts packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx scripts/client-build-environment.ts scripts/client-build-environment.client.spec.ts scripts/dev-web.spec.ts apps/desktop/tests/locale.spec.ts apps/desktop/tests/macos-signature.spec.ts apps/desktop/tests/windows-sign.spec.ts apps/desktop/tests/product-identity.spec.ts tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
  git commit -m "feat: apply the Local-Harness-pi desktop identity and notices"
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

## Task A6：提取 DSH Agent machine 构造 seam

**Files:**

- Modify: `packages/core/agent-loop/src/index.ts`
- Create: `packages/core/agent-loop/tests/agent-machine-seam.spec.ts`
- Modify: `packages/core/agent-loop/README.md`
- Modify: `packages/core/agent-loop/README.zh.md`
- Modify when required by doc-sync: `packages/core/agent-loop/README.i18n.yaml`

- [ ] 完整执行 [Agent Machine Seam 整改计划](2026-09-18-agent-machine-seam-rectification.md) 的 Task R1。先以测试子类证明 create/resume 都经过构造 seam，默认路径仍返回 `ReactLoopAgent`。

- [ ] 增加 `AgentLoopMachine extends Agent`（唯一额外成员为 DSH lifecycle 所需的 `scope`）和 `AgentMachineCreateInput`；在 `AgentLoop` 中增加 protected `createMachine()`，把唯一 `new ReactLoopAgent(...)` 调用改为该 hook。

- [ ] 禁止开放或覆盖 `prepare()`、`setupAndPublish()`、`createAgent()`、`resume()`、write ownership、registry 发布或 rollback；PR-A 默认 composition 与运行行为不变。

- [ ] 运行聚焦门禁并提交。

  ```powershell
  pnpm vitest run packages/core/agent-loop/tests
  pnpm --filter @deepseek-ai/dsh-agent-loop run typecheck
  pnpm run build:lib
  pnpm run test:docs
  git diff --check
  git add packages/core/agent-loop/src/index.ts packages/core/agent-loop/tests/agent-machine-seam.spec.ts packages/core/agent-loop/README.md packages/core/agent-loop/README.zh.md packages/core/agent-loop/README.i18n.yaml
  git commit -m "refactor: expose DSH agent machine construction seam"
  ```

  若 doc-sync 未修改 `README.i18n.yaml`，从 `git add` 参数中省略该文件。

## Task A7：建立 PR-A 基线证据并提交 Draft PR

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

## PR-A 工期与交接门禁

- 预计净工作量：5–6 个工作日，约 0.7–1.0 个 GPT-5.6 Sol Plus 完整周额度。
- Day 1：A1；Day 2–3：A2–A3（包含 Web/模型身份、品牌资产和 About）；Day 4：A4–A5；Day 5：A6 seam 与 lifecycle 回归；Day 6 作为 Windows/build 修复和 A7 余量。
- 可提前结束条件：A1–A6 全部提交、A7 门禁全绿、unpacked artifact 内存在 notice、Draft PR 已发布。
- 不可顺延到 PR-B：来源锁、产品身份、About/许可、独立 `DSH_HOME`、Electron 安全配置。它们任一失败都阻断 PR-A。
