# Agent Machine Seam Rectification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不复制 DSH `AgentFactory` 生命周期的前提下接入 Pi conversational tool-loop，并把消息边界、唯一事实源和 PR-B 前置门禁收紧到可直接实现的程度。

**Architecture:** PR-A 在 DSH `AgentLoop` 中提取一个行为中性的 `createMachine()` protected seam，默认仍构造 `ReactLoopAgent`；PR-B 的 `PiAgentLoop` 继承该类，只替换 machine 构造。Kernel 边界直接使用 DSH canonical `Message`、`ContentBlock` 和 `StreamChunk`，不创建第三套 Local Harness 消息 IR。DSH Session 只垄断会影响恢复后模型行为的 conversation/execution facts，领域数据仍由各自服务拥有。

**Tech Stack:** TypeScript 6、Cordis、DSH Agent/Session/LLM APIs、Vitest、`@earendil-works/pi-agent-core@0.85.1`。

---

## 0. 与正在实施的 PR-A 协调

截至 2026-09-18，GitHub 上没有可见的 PR-A Draft PR 或远端分支，本地也只有 `main`。因此本计划只更新 `main` 上的权威文档，不重置、覆盖或猜测另一任务中的未提交代码。

另一任务继续 PR-A 前必须：

- [ ] 先在其工作区提交当前 checkpoint；存在未提交修改时不得 rebase。
- [ ] 获取并整合本次文档提交。

  ```powershell
  git status --short
  git fetch origin
  git rebase origin/main
  ```

  若 PR-A 已推送且不适合 rebase，使用 `git merge origin/main`，禁止 force-push 覆盖他人提交。

- [ ] 确认当前分支包含本文档，并把下方 Task R1 作为 PR-A 的新 Task A6；原 Draft PR 证据任务顺延为 A7。
- [ ] 只有完成 DSH 固定快照导入后才实施 R1；在尚无 `packages/core/agent-loop` 时不得手写占位文件。

## Task R1：在 PR-A 提取行为中性的 machine 构造 seam

**Files:**

- Modify: `packages/core/agent-loop/src/index.ts`
- Create: `packages/core/agent-loop/tests/agent-machine-seam.spec.ts`
- Modify: `packages/core/agent-loop/README.md`
- Modify: `packages/core/agent-loop/README.zh.md`
- Modify when required by doc-sync: `packages/core/agent-loop/README.i18n.yaml`

- [ ] 重新阅读固定 DSH commit 中 `packages/core/agent-loop/src/index.ts`、`agent.ts`、全部生命周期测试，以及 `packages/core/agent/src/types.ts`、`runtime-types.ts`。记录直接构造 `ReactLoopAgent` 的位置和 `AgentLoop` 对 machine 实际使用的成员。

- [ ] 先写失败测试。测试通过一个测试子类覆盖构造 hook，并断言 create 与 resume 都使用注入 machine；同时复用/补充现有测试，断言默认 `AgentLoop` 仍构造 `ReactLoopAgent`，发布顺序、失败回滚、dispose 顺序和配置启动行为不变。

  ```powershell
  pnpm vitest run packages/core/agent-loop/tests/agent-machine-seam.spec.ts
  ```

  Expected: 新 hook 尚不存在，类型检查或测试失败。

- [ ] 在 `index.ts` 增加最小 public seam。标识名可因上游现有导出冲突微调，但形状必须等价：

  ```ts
  import type { Scope } from '@deepseek-ai/dsh-scope'

  export interface AgentLoopMachine extends Agent {
    readonly scope: Scope
  }

  export interface AgentMachineCreateInput {
    readonly ctx: Context
    readonly id: SessionId
    readonly options: AgentOptions
    readonly session: Session
  }

  export class AgentLoop extends Service implements AgentFactory {
    protected createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
      return new ReactLoopAgent(input.ctx, input.id, input.options, input.session)
    }
  }
  ```

  将 `PreparedAgent.agent` 和内部 `machine` 类型改为 `AgentLoopMachine`，唯一直接构造点改为：

  ```ts
  machine = this.createMachine({ ctx: loopCtx, id, options, session })
  ```

  禁止把 `prepare()`、`setupAndPublish()`、`createAgent()`、`resume()`、registry 发布、write handle 或 rollback 做成 Pi 专用 override 点；本 seam 只负责构造 machine。

- [ ] 测试 hook 抛错、owner/factory abort、create/resume、dispose 的默认路径。子类返回的 fake machine 必须具有真实 `Scope`，不可用类型断言掩盖接口缺口。

- [ ] 文档明确：hook 的输入在一次构造中只读；实现不得保留第二份 Session write handle；子类 machine 仍必须遵守 DSH `Agent` 运行契约。

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

  若 `README.i18n.yaml` 未被 doc-sync 修改，不把不存在的修改强加进提交。

## Task R2：在 PR-B 把 Kernel 边界改为 DSH canonical types

**Files:**

- Create: `packages/core/agent-loop-pi/src/kernel-driver.ts`
- Create: `packages/core/agent-loop-pi/src/message-converter.ts`
- Create: `packages/core/agent-loop-pi/tests/kernel-driver.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/message-converter.spec.ts`

- [ ] `KernelContextSnapshot.messages` 与 `KernelRunInput.initialMessages` 使用 `readonly Message[]`；message started/completed 使用 DSH `Message`（可证明为 assistant-only 时收窄为 `AssistantMessage`）；delta 使用 DSH `StreamChunk`；工具结果 content 使用 `readonly ContentBlock[]`。

  ```ts
  import type { ContentBlock, Message, StreamChunk } from '@deepseek-ai/dsh-llm'

  export interface KernelContextSnapshot {
    readonly messages: readonly Message[]
  }

  export type KernelEvent =
    | { readonly type: 'message.started'; readonly message: Message; /* position */ }
    | { readonly type: 'message.delta'; readonly delta: StreamChunk; /* ids */ }
    | { readonly type: 'message.completed'; readonly message: Message; /* position */ }
  ```

- [ ] 保留真正不透明的值为 `unknown`：工具 arguments 在 schema 校验前、abort reason、脱敏错误 details、Pi 私有 metadata。不得为了消灭 `unknown` 新建 Local Harness `Message`、`ContentBlock` 或 `StreamChunk`。

- [ ] 用 fixture 覆盖 Unicode、图片、reasoning、并行 tool call、error tool result 和未知 metadata；DSH→Pi→DSH 转换不得丢失稳定 id、source、content 或 finish reason。

- [ ] 运行并提交。

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/message-converter.spec.ts
  pnpm run typecheck
  git add packages/core/agent-loop-pi/src/kernel-driver.ts packages/core/agent-loop-pi/src/message-converter.ts packages/core/agent-loop-pi/tests/kernel-driver.spec.ts packages/core/agent-loop-pi/tests/message-converter.spec.ts
  git commit -m "feat: define the typed conversational kernel boundary"
  ```

## Task R3：在 PR-B 以继承方式安装 Pi machine

**Files:**

- Create: `packages/core/agent-loop-pi/src/index.ts`
- Create: `packages/core/agent-loop-pi/src/pi-agent.ts`
- Create: `packages/core/agent-loop-pi/tests/apply.spec.ts`
- Create: `packages/core/agent-loop-pi/tests/lifecycle.spec.ts`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `scripts/verify-pi-kernel-boundary.ts`

- [ ] `@local-harness/pi-agent-loop` 对 `@deepseek-ai/dsh-agent-loop` 建立 workspace production dependency。它继承 lifecycle，不复制其源码：

  ```ts
  import { AgentLoop, type AgentLoopMachine, type AgentMachineCreateInput } from '@deepseek-ai/dsh-agent-loop'

  export class PiAgentLoop extends AgentLoop {
    protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
      return new DshPiAgent(input.ctx, input.id, input.options, input.session)
    }
  }

  export default PiAgentLoop
  ```

- [ ] `DshPiAgent` 只实现 DSH `Agent`/`AgentLoopMachine` 的运行语义和 `scope`；不实现 `AgentFactory`，不打开 Session persistence handle，不发布 registry lifecycle event。

- [ ] base composition 只激活 `@local-harness/pi-agent-loop`。允许它依赖 DSH agent-loop superclass；门禁禁止的是第二个被 Cordis 激活的 factory、复制 lifecycle 源码和 Pi Harness 子路径，不是禁止 lock graph 出现 DSH agent-loop。

- [ ] lifecycle 测试以 `PiAgentLoop` 跑现有 DSH create/resume/failure matrix，证明继承路径保持 rollback、created/disposed pairing、write ownership 和逆序销毁。加入静态门禁：Pi 包不得声明 `implements AgentFactory`，不得复制 `setupAndPublish`/`resumeWith`。

- [ ] 运行并提交。

  ```powershell
  pnpm vitest run packages/core/agent-loop-pi/tests/apply.spec.ts packages/core/agent-loop-pi/tests/lifecycle.spec.ts
  pnpm run check:local-harness
  pnpm run typecheck
  pnpm run build:lib
  git add packages/core/agent-loop-pi packages/bundle/base/package.json packages/bundle/base/cordis.patch.yml scripts/verify-pi-kernel-boundary.ts
  git commit -m "feat: install Pi through the DSH machine seam"
  ```

## Task R4：把 PR-B 结束点设为正式 M0 门禁

**Files:**

- Modify: `.github/pull_request_template.md`
- Create: `.agents/notes/architecture/YYYY-MM-DD-pi-kernel-session-ownership.md`
- Test: `packages/core/agent-loop-pi/tests/contract-matrix.spec.ts`
- Test: `packages/core/agent-loop-pi/tests/crash-recovery.e2e.ts`
- Test: `packages/core/agent-loop-pi/tests/compaction-through-pi.integration.spec.ts`

- [ ] PR-B 通过后标记 `M0 Kernel Integration`。M0 是 PR-C 开工的 go/no-go，不是对外 V1 发布。
- [ ] M0 必须证明：默认组合恰好一个 factory；Pi 只承担 conversational model-tool loop；DSH Session 是 conversation/execution recovery truth；恢复不读取 Pi store；三类 flush barrier、工具乱序提交、Compaction generation 和 crash matrix 全绿。
- [ ] M0 不引入 Tool Effect Taxonomy、Evidence/Critic store、通用 agent graph、多 Agent 编排或新的领域数据库。领域 `Decision`、`Evidence`、`Artifact` 可由后续领域服务拥有，但凡影响恢复后模型行为的引用、状态变化和执行结果必须以稳定 ref/event 进入 DSH Session。
- [ ] 将完整命令输出、固定上游 hash、失败注入点和已知限制附到 Draft PR；任何一项失败都不得开始依赖真实 Pi 行为的 PR-C 修改。

## Task R5：整合、复审与交接

- [ ] PR-A 在包含本整改文档的提交上完成 R1；PR 描述增加 `AgentLoop` seam diff 和默认 React 回归证据。
- [ ] PR-B 只能基于已合入的 PR-A；禁止临时 cherry-pick seam 后让两条长期分支各自维护版本。
- [ ] 独立复审必须逐项检查：只有一个直接 `ReactLoopAgent` 默认构造点、Pi 仅覆盖 `createMachine`、没有 `DshPiAgentFactory`、Kernel 公共消息字段没有 `unknown[]`、base 只激活一个 factory。
- [ ] 合并前执行：

  ```powershell
  rg -n "DshPiAgentFactory|implements AgentFactory|messages: readonly unknown\[\]|initialMessages: readonly unknown\[\]" packages/core/agent-loop-pi
  pnpm run check:local-harness
  pnpm run test:snapshot
  pnpm run typecheck
  pnpm run lint
  pnpm run hygiene
  pnpm run build
  git diff --check
  ```

  Expected: `rg` 无命中，其余命令全绿。

## 工期影响

- PR-A：由 4–5 日调整为 5–6 日，增加 seam、回归测试和文档同步。
- PR-B：由 8–11 日调整为 7–10 日，删除复制与维护 factory lifecycle 的工作。
- PR-C：仍为 7–9 日；`main` 稳定化仍为 3–4 日。
- 总净工作量仍为 22–29 日；变化是把 1 日高风险架构工作前移到 PR-A，并减少 PR-B 的重复生命周期实现与复审面。

本计划不改变用户已确认的 V1 产品范围，只纠正实现边界和门禁顺序。
