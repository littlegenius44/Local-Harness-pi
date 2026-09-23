# AGENTS.md

[English](dsh-root-agents.md) | 中文

DeepSeek Harness 是完全基于插件的 Cordis agent harness（智能体框架）。修改 `packages/` 前阅读 [docs/architecture.md](../../docs/architecture.zh.md)；文档遵循 [docs/AGENTS.md](../../docs/AGENTS.md)。

## 尚未稳定的 API 与已发布的 Session 数据

公共 API 尚未稳定；修改时更新所有使用方。[Session 版本与状态](../../docs/session-format-status.zh.md)定义权威来源。[相邻版本迁移](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)可以添加以版本命名的后继文件，但绝不移动、覆盖或删除已提交的 generation；存在前驱不意味着支持回退或降级。SQLite 使用单调递增的 `SCHEMA_VERSION`。

**应用启动。** 受支持的 Node 应用只能通过 `dsh` profile 启动；禁止使用 package bin、demo 或公共 SDK argv 逃逸入口（[规则](../../docs/architecture.zh.md#application-launch)）。

## 仓库布局

```
vendor/      Vendored Cordis source — manifest + sync procedure in vendor/README.md
packages/    @deepseek-ai/dsh-<pkg> workspaces at packages/<group>/<pkg>/
  core/        product API spine: session, system-prompt, tools, agent, agent-loop
  api/         Remote BFF assembly and Typert RPC gateway
  typert/      type graph generator, loader, and runtime registry
  llm/         LLM capability: Service Definition/Consumer + DeepSeek providers
  e2b/         E2B POC: sandbox + FS/subprocess adapters
  shell/        bash capability: Service Definition + local/pwsh providers + shell Consumers
  subprocess/  subprocess capability + local process-tree provider + shared Win32 library
  terminal/         persistent sessions
  fs/          filesystem capability + policy
  lsp/         language-server capability
  skill/       skill provider registry + local impl + catalog/loader tool
  web/         web capability: Service Definition + search/fetch providers + tool Consumer
  compaction/     compaction capability + basic provider
  context/     request-context plugins
  subagent/    subagent capability: Service Definition + providers + delegation Consumers
  bundle/      installable dsh --profile patch-layer bundles
  workflow/    workflow capability + worker-thread provider + tool Consumer
  webhook/     webhook ingress
  todo/        todo_write tool
  plan/        plan mode as logged state
  preset/      per-session agent composition from preset cordis.yml files
  guard/       loop-hygiene + tool-timeout plugins
  self-modification/  the agent inspects/mounts its own plugins
  hooks/       Claude Code/Codex hook bridges + wire-protocol library
  session/     durable session data: persistence, projection, titles, telemetry
  identity/    anonymous identity
  settings/    user-settings capability + file provider
  credentials/ credential/authorization capabilities + env/.env provider
  acp/         automation-only Agent Client Protocol server
  interaction/ approval/interaction capabilities, permission, commands, ask-user
  boot/        shared profile/application boot glue
  sdk/         JSON-RPC protocol + TypeScript client/server
  experimental/ pre-stable prototypes; private by default with explicit public exceptions
  support/     dev/test infrastructure
  util/        zero-dependency utilities
python/      Python SDK/runtime (see python/README.md)
native/      @deepseek-ai/node-addon-system source of record (see native/README.md)
benchmarks/  performance gates
.agents/     Agent workflows and Agent Notes (`notes/`)
docs/        architecture, generated catalogs, postmortems, cookbook (see docs/AGENTS.md)
scripts/     gates and generators
website/     VitePress projection of selected bilingual docs/ sources
```

包分组：[packages/README.md](../../packages/README.zh.md)。

## 命令

```sh
pnpm install            # pnpm workspaces, node ^22.19 || >=24
pnpm run clean           # remove build outputs and safe residue from deleted packages
pnpm run test           # unit tests
pnpm run test:coverage  # CI coverage gate: per-file 100% on packages/*/*/src
pnpm run test:e2e       # real-API tests; self-skip without DEEPSEEK_API_KEY
pnpm run test:expected  # owner-local process expectations
pnpm run test:snapshot  # keyless recorded-session replay through shipped profiles; filter: -t <name>
pnpm run test:snapshot:record  # re-record expected outputs (needs key)
pnpm run typecheck
pnpm run lint
pnpm run duplication    # cross-file TypeScript clone detection
pnpm run build          # tsc emits lib/types, tsdown bundles runtime
pnpm run hygiene        # publint + workspace/package/dependency checks + NodeNext consumer check
pnpm run check:windows-wine  # ONLY when diagnosing a known Windows failure (needs wine); CI owns this signal
pnpm run doc-sync       # all documentation gates; leaf list in scripts/run-gates.ts
pnpm run test:docs      # quick documentation checks (no build; doc-quick aggregate)
pnpm run website:build  # VitePress build (doubles as dead-link check)
pnpm dsh --profile headless "task"  # run one task from source (needs DEEPSEEK_API_KEY)
pnpm run demo:ptc -- "task"  # headless PTC mode run (needs key)
```

### 主机沙箱故障

如果必要的 `gh`、`pnpm`、构建、测试或生成器命令因沙箱阻止凭据、网络、IPC、监听或嵌套 `sandbox-exec` 而失败，应使用最小范围的主机权限提升原样重试。必须有沙箱阻断的证据；绝不绕过测试失败或产品沙箱。

### 在本地运行相关检查

推送前通过 [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md)运行检查；只报告实际执行的命令。执行 `gh stack sync` 后立即验证；检查通过前不得合并。

- 证据与变更对象对应：聚焦行为测试、模型或用户输出快照、文档的 `doc-sync`（文档同步门禁）、发布路径的构建产物冒烟测试，以及 provider 的真实 API e2e。
- 不默认运行全套测试，也不为提交或推送重复已通过的检查。全面覆盖和平台矩阵由 CI 负责；只有显式要求、诊断 CI 或无法缩小范围的全仓库变更，才在本地演练全部检查。
- CI 覆盖率门禁是 `test:coverage`，不是 `test`（[原因](../../docs/testing.zh.md)）。

## 密钥 / .env

真实 API 测试和 demo 读取 `DEEPSEEK_API_KEY`、可选的 `DEEPSEEK_BASE_URL` 和根目录 `.env`。cordis.yml 允许在插件 `config` 和条目 `disabled` 下使用 `!!js`（绝不使用 `!js`）；其他元数据保持字面值，因此条件组合也使用 overlay（[入门](../../docs/cordis-primer.zh.md#loader-configuration)）。绝不提交凭据。缺少密钥时 CI e2e 跳过；密钥策略由 [testing.md](../../docs/testing.zh.md)维护。

## 约定

- 所有 npm 包均为 `@deepseek-ai/dsh-<name>`；内置上游包重新设置 scope（[映射](../../docs/rescope.zh.md)）并设为 `private: true`。每个 harness 包都将 `@deepseek-ai/cordis` 声明为 peerDependency 和 devDependency。
- 全部使用 ESM（`"type": "module"`）。跨包使用包名，本地相对导入使用 `.ts`。配置子进程在普通 Node 下运行构建后的 `lib/`；源码回归使用声明的启动器（[测试策略](../../docs/testing.zh.md#test-subprocess-launch-modes)）。`dsh` CLI（命令行界面）的源码启动通过 tsx 的纯 ESM hook（`node --import tsx/esm`）；其可达模块必须保持 ESM，不能仅提供 CJS 导出——所支持的 engines 范围并非全部提供 Node 原生 TypeScript 模式（[源码启动契约](../../.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md)）。Raw/Web `cordis.yml` 的裸插件必须出现在解析器 manifest 的 `dependencies` 中；由 `verify-cordis-config` 强制检查。
- **注册即 effect**：所有贡献通过 `ctx.effect()` / `ctx.on()`；注册表的 `register()` 返回 dispose（资源释放）函数。
- **运行时不变量断言自己负责的关系。** 只有独立观察可能产生分歧时才发布 `./invariant`。否则省略其源码和接线，并在 README 记录原因；空安装器以及仅检查服务存在、插件元数据、effect 或固定示例的做法无效（[包不变量规则](../../packages/AGENTS.md)）。
- **类型化事件使用声明合并**及可通过合并扩展的映射。事件 JSDoc 需要 `@mode` 和载荷 `@param`；未出现在载荷中的作用域键需要 `@dshScopeScan unsupported`。公共服务方法记录参数和非 void 返回值。`SessionEventMap` 成员默认在读取时必须识别——不认识类型的构建会拒绝日志，除非事件信封带有 `ignorable: true`；只有结构性格式变更才增加 `SESSION_FORMAT_VERSION`（[机制](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)）。
- **按判别标签 switch。** 封闭联合以 `assertNever` 结束；可合并扩展的联合进入有文档说明的 default。
- **Waterfall 监听器必须调用 `next()`** 才能委托后续处理；未调用就返回会短路整个链（[语义](../../docs/cordis-primer.zh.md#cordis-waterfall-semantics)）。
- **模型可见 ⟺ 已记录**：任何进入模型请求的内容都必须能从会话日志重建；新增模型可见输入需要会话事件。
- **通过插件而非修改循环添加行为**：新行为使用已有文档的扩展点；修改 `agent-loop` 必须更新 docs/architecture.md。
- **能力 seam 由 Service Definition / Service Provider / Consumer 角色组成。** 它是完整组合，绝非单个角色；只有角色独立演进时才拆分（[术语表](../../docs/glossary.zh.md#capability-seam)）。
- **优先使用有人维护的依赖而非自行实现**，前提是确实能删除自有代码和测试（[策略](../../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.zh.md)）。
- **包边界显式优于隐式**：默认值解析必须是所属实现中的显式 `resolve(request): Spec` 步骤，不能隐藏为 `run()` 内的 `?? default`（以 `dsh-shell` 的 request/spec 分离为模板）。
- **插件中不得硬编码可调项**：随部署变化的选项应为经过验证、可从 cordis.yml 修改的 `Config` 字段；`DEFAULT_*` 常量或测试 hook 不等于可配置性。协议常量、外部规范和安全不变量保持固定。
- **配置错误必须明确失败**：可独立判断时在加载阶段失败，否则在最早能解析时失败；绝不静默跳过缺失的引用对象。
- **跨边界的不透明 ID 必须带品牌类型**（`dsh-brand` 的 `Branded<B>`），绝不能使用裸 `string`。
- **在同进程的类型化边界信任 TypeScript。** 不要仅针对静态接口已要求的值增加运行时验证、回退或恶意输入测试；在解析器/配置、队列、模型/工具 JSON、持久化/文件、worker、进程和通信边界验证。
- **源码面与产物面绝不混用。** 静态门禁和测试通过 tsconfig `paths` 将工作区导入解析到 `src`，并在干净目录树上通过；使用已构建 `lib/` 的门禁声明该依赖（[布局](../../docs/development.zh.md#typescript-project-layout)）。
- **显式保留编译器分面。** 同时包含 Host 和 Client 程序的包提供分面专用叶配置及仅包含 solution 的根配置；全仓库程序以分面配置为入口，绝不使用根 solution（[布局](../../docs/development.zh.md#typescript-project-layout)）。
- **空 `catch` 必须说明吞掉什么**，以及为什么其他错误不可能到达此处；`try` 仅包含一个语句。
- **注释保持局部性。** 不复述代码，不解释远处行为，除非本地确有必要；不扩展无关注释（[理由](../../.agents/notes/implemented/process/2026-08-09-concrete-prose-names-actors-and-recorded-facts.zh.md)）。
- **并列值优先保持对称**；无法解释的不对称通常意味着遗漏了抽取。
- **测试描述行为而非正确性。** 修改过时行为时同步修改测试，并在 PR（Pull Request）中解释原因。
- **非简单变更必须在同一 PR 中包含 Agent Note；** 只有机械性或局部编辑例外（[范围](../../.agents/notes/README.zh.md#when-to-write-one)）。归档笔记已冻结：绝不编辑，也不将其视为当前权威（[归档策略](../../.agents/notes/README.zh.md#archiving-and-deletion)）。
- **Client UI 文案归 locale 所有。** 产品文字通过类型化字典和 `t` 或已本地化的基础组件属性提供；`verify-client-ui-i18n` 拒绝硬编码文案（[决策](../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。
- **测试策略**——[docs/testing.md](../../docs/testing.zh.md)。每个非简单的模型或产品用户可见变更都更新无需密钥的已录制会话快照；[快照所有权](../../snapshots/AGENTS.md)将顶层目录保留给会话驱动场景，其他预期输出放在所属模块本地。fixture（测试前置数据）在 macOS/Linux 回放；修复 fixture，不修正归一化器来迁就它。
- **提前设计每个工具的 UI 展示。** Host presenter 保持纯函数；Web 卡片从原始事件和持久化结果元数据派生（[操作指南](../../docs/cookbook/adding-a-tool.zh.md)）。
- **为能力 seam、生命周期路径和对话记录输出规划 unit、e2e 和快照覆盖**；缺失的快照测试框架支持纳入同一变更。
- **两个 SDK 都投影循环。** Agent-loop、会话生命周期和 `SessionEventMap` 变更必须在同一 PR 更新 TypeScript 和 Python SDK 的预期输出；`pnpm run test` 两者都不覆盖（[范围](../../docs/testing.zh.md#when-a-snapshot-test-is-required)）。
- **有意识地选择 PR 历史结构。** 拆分独立变更，在传播前修复引入问题的 PR。独立或堆叠分支可向前合并或 rebase。改写使用 `--force-with-lease`，远端移动时中止，绝不直接使用 `--force`；获取更新基线前保留进行中的向前合并检查点（[理由](../../.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.zh.md)）。
- **标签：** 一个 PR 使用一个 `kind/*`、所有相关的 `area/*` 以及原生 Issue Type（[分类](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.zh.md)）。
- TODO 标记：按紧急程度使用 `FIXME`/`TODO`/`XXX`（[语义](../../docs/development.zh.md)）。
- 文件恰好以一个换行结束；提交前由 `git diff --cached --check` 检查。

## 防御性模式

处理生命周期、并发、子进程或清理工作前阅读 [docs/defensive-patterns.md](../../docs/defensive-patterns.zh.md)。

## 类型安全与文档

所有内容在 `strict: true` 和 `noImplicitAny` 下编译；每个保留的 `any` 都解释为何无法收窄。每个模块和导出都用简洁 JSDoc 说明不显然的契约；函数类导出包含 `@param`/`@returns`，由 `verify-export-jsdoc` 强制检查。继承声明的成员、插件协议插槽和构造函数的文档保留在声明它们的 Service Definition、协议或类中。

注释和文档陈述完整契约与上下文，而非推理过程。使用直接、具体的术语，不用比喻。写 `contract`、`boundary` 或 `shape` 前，判断是否有更精确的名称：使用 `response fields`、`JSON validation` 或 `ESM exports`，而非 `response shape`、`validation boundary` 或 `module shape`。`contract` 用于调用方、被调用方、实现者、提供方、生产方或消费方依赖的前置条件、后置条件、不变量、兼容承诺及其他义务。保留字面意义的进程、通信、安全、事务或生命周期边界。不叙述控制流或测试，不保留评审历史，不复述代码。保留行为、失败、时序、所有权和安全使用事实，并链接理由。使用 [dsh-prose-standard](../../.agents/skills/dsh-prose-standard/SKILL.md)作判断。将可机械验证的不变量接入实际执行的顶层门禁，并证明每条改变的验收路径会拒绝无效案例。采用范围窄且有理由的例外，不全局禁用规则。

每次代码变更都附带文档：同步更新受影响的 README 和 JSDoc 契约。日常双语工作遵循 [docs/AGENTS.md](../../docs/AGENTS.md)；只有用户显式调用时才能运行 `dsh-translate-docs`。现状叙述、每段一个物理行、每个事实唯一归属和字数预算也由该文件规定。

## 编辑这些指令

根目录和 `packages/` 的 `CLAUDE.md` 是 `AGENTS.md` 的符号链接；编辑真实文件。每条规则应可独立理解，并链接高层文档。保持清晰时可精简；必要内容确实需要更多空间时，提高 `verify-doc-budgets` 上限。

## 内置上游源码策略

`vendor/` 包是固定版本的源码副本（含上游 SHA 的 manifest 见 [vendor/README.md](../../vendor/README.md)）。按其中的同步流程更新；重新应用或移除已记录的本地修改；重新运行 `pnpm run test && pnpm run build`。
