# Local-Harness-pi V1 总体架构设计

文档日期：2026-09-09

架构状态：已由项目所有者确认

文档状态：待最终审阅

目标版本：V1

## 1. 最终定义

Local-Harness-pi 的 V1 架构固定为：

> **DSH 产品平台 + Pi 执行内核 + 单一 DSH 会话事实源。**

这里的“替换 DSH 内核”有严格边界：仅替换 DSH 默认的 Agent Loop 执行实现，不替换 DSH 的 Electron 桌面壳、Web UI、Agent 注册与生命周期、会话事件模型、持久化、模型配置、工具注册与权限、Goal/Plan、Skills、MCP、附件、设置和插件平台。

Pi 只负责一次 Agent 运行中的模型—工具—模型迭代、流式执行和运行中队列协同。Pi 不拥有持久化会话、不维护第二份可恢复 transcript、不加载第二套 Skills/MCP、不单独执行权限策略，也不独立决定模型配置。

## 2. 设计依据与固定来源

本设计已按以下源码基线复核：

| 来源 | 固定提交或版本 | 本项目采用内容 |
|---|---|---|
| DeepSeek Harness | `b2e3b2a0125854567a4a5fcba75782e42fe84901` | Electron、Web UI、Cordis 组合、Agent/Session/LLM/Tools 服务、JSONL/Zstd 会话、SQLite 派生搜索、Goal/Plan、Skills/MCP、附件和更新框架 |
| Pi | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99`，npm `0.85.1` | `@earendil-works/pi-agent-core` 的 `Agent`/`runAgentLoop`、事件和工具调用循环 |
| OpenAI Codex | `73a1148c9c775c2a4616ce5096291740a00ed68a` | 设置页和输入框“+”菜单的交互参考、工具审批与安全边界参考 |

实施约束：

1. 每个实施 PR 开始前，执行者必须重新阅读该 PR 涉及的 DSH、Pi 和 Codex 源文件。
2. PR 描述必须记录实际使用的三个上游 commit hash；hash 发生变化时必须附兼容性差异。
3. DSH 和 Pi 均按 MIT 许可证保留来源声明；Codex 只作设计参考，V1 不复制或链接其 Rust 运行时。
4. 上游升级不得与功能修改混在同一 PR。

## 3. 目标

V1 必须达到以下结果：

1. 用户可以在 Windows Electron 桌面应用中打开工作区、创建或恢复会话并完成真实代码任务。
2. Agent 的执行行为由 Pi Agent Core 驱动，但所有可恢复状态只写入 DSH Session。
3. 本地与云端模型均通过 OpenAI-compatible 接口配置和调用。
4. DSH 的工具、审批、工作区限制、Goal、Plan、Skills 和 MCP 在 Pi 循环下保持可用。
5. 前端沿用 DSH 整体布局，在设置页和输入框“+”菜单提供 Codex 风格的工具与能力入口。
6. 异常退出后能够恢复已提交会话，不重复执行结果未知的副作用工具。
7. 内核边界允许以后增加其他内核，但 V1 只交付 Pi。

## 4. 非目标

以下内容明确不属于 V1：

- Qwen Code 内核、双内核运行或内核对比器。
- 自研 Agent 微内核、全新的插件框架或全新的会话数据库。
- Pi `AgentHarness` 的会话、JSONL、SQLite、Compaction、Skills 和完整 Coding Agent 外壳。
- 对外提供 OpenAI `/v1/responses` 或 `/v1/chat/completions` 兼容服务器。V1 的 OpenAI-compatible 是模型出站调用契约，不是公开网关。
- Anthropic Messages、Gemini 或厂商专有 API 的直接接入。
- Codex 官方 Office/PDF 插件的复制或再分发。
- Word/Excel/PDF 编辑、完整 Playwright 浏览器自动化、签名自动安装更新和全面安全加固。
- 多 Agent 编排、远程执行节点、移动端或浏览器独立客户端。

这些排除项不能以“顺便重构”名义进入 V1。

## 5. 总体所有权

| 能力 | V1 唯一所有者 | 说明 |
|---|---|---|
| 桌面进程、窗口、IPC、打包 | DSH Electron | 保留 DSH 主进程/Host 进程拆分 |
| 前端布局与状态投影 | DSH Web/Client | 只做品牌与入口调整 |
| Agent 注册、创建、恢复、销毁 | DSH `AgentRegistry`/`AgentFactory` | Pi 不注册第二个 Agent 身份 |
| Agent 迭代执行 | Pi Agent Core | 由适配器托管，运行态可丢弃 |
| 会话事实源 | DSH `Session` + JSONL/Zstd | 所有可恢复事实只追加到这里 |
| 会话搜索 | DSH SQLite FTS | 派生索引，可删除并重建，不是事实源 |
| 模型路由与凭据 | DSH LLM + `llm-pi-ai` | Pi 只接收当前请求的冻结模型描述 |
| 工具目录、执行、审批、限制 | DSH Tools | Pi 工具只是代理包装 |
| Goal、Plan | DSH Goal/Plan | 继续产生 DSH Session 事件 |
| Skills、MCP | DSH Skill/MCP | 继续通过 DSH 工具和 Prompt 组装进入运行 |
| 附件与 PDF 预览 | DSH Attachment/Preview | V1 只预览，不编辑 |
| 更新 | DSH updater | Alpha 默认关闭自动安装，仅检查和手动下载提示 |

所有权冲突时以本表为准。任何新增组件都不得偷偷持久化第二份对话历史。

## 6. 源码组合策略

`Local-Harness-pi` 是一个新的 GitHub 仓库，不是运行时同时启动三个仓库。首个源码导入应采用固定 DSH 快照，保留 DSH 原许可证和来源；随后只在本仓库中维护必要差异。

Pi 不整仓复制。V1 增加精确版本依赖：

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.85.1"
  }
}
```

DSH 已使用 `@earendil-works/pi-ai@0.85.1`。两个 Pi 包必须保持同一版本。包管理锁文件是发布输入的一部分，不允许范围升级。

建议新增包：

```text
packages/core/agent-loop-pi/
  src/
    index.ts
    pi-agent.ts
    kernel-driver.ts
    model-bridge.ts
    tool-bridge.ts
    event-bridge.ts
    session-projector.ts
    invariant.ts
  tests/
```

该包应从 DSH `packages/core/agent-loop` 复用 AgentFactory 生命周期、SessionPreparation、创建/恢复和逆序清理逻辑，仅替换 `ReactLoopAgent` 以及与其紧耦合的执行实现。不得为了减少代码重复而同时装载两个 AgentFactory。

默认组合文件中：

- 移除激活的 `@deepseek-ai/dsh-agent-loop` 条目。
- 在相同位置激活 `@local-harness/pi-agent-loop`。
- 保持其余 DSH 服务顺序和配置不变。
- 启动时若发现零个或多个 AgentFactory，必须立即失败并给出可定位错误。

## 7. 为什么使用 Pi Agent Core 而不是 Pi AgentHarness

Pi `AgentHarness` 已经包含自己的 Session、JSONL、SQLite、恢复、Compaction、Skills、Tools 和运行时驱动。把它整体放入 DSH 会形成两个持久化面和两个生命周期面，正是本项目要避免的问题。

V1 允许导入：

- `Agent`
- `runAgentLoop` / `runAgentLoopContinue`（若具体实现需要）
- `AgentEvent`、`AgentTool`、`AgentContext` 等 Agent Core 类型

V1 禁止运行时依赖：

- `@earendil-works/pi-agent-core/harness/session`
- Pi JSONL/SQLite session backend
- Pi Harness compaction
- Pi Harness skills loader
- Pi Harness built-in coding tools

依赖检查应作为 CI 门禁：生产依赖图中出现以上禁用入口即失败。

## 8. Agent 运行边界

适配层由三层组成：

1. `DshPiAgentFactory`：实现 DSH `AgentFactory`，复用 DSH 已有创建、恢复、发布和销毁顺序。
2. `DshPiAgent`：实现 DSH `Agent` 运行接口，拥有 DSH Inbox、状态和 Pi 运行实例。
3. `PiKernelDriver`：唯一与 Pi Agent Core 直接交互的组件，暴露稳定、内核无关的最小接口。

Pi Agent 的 transcript 只是当前进程中的派生缓存：

- 新建和恢复时从 DSH Session surface 投影。
- 每个 Pi turn 开始前再次以 DSH Session 重建上下文、工具和模型。
- Pi 最终事件先翻译并提交到 DSH Session，才可向上报告稳定完成。
- 进程退出后 Pi 状态直接丢弃；恢复只读 DSH。

这保证以后增加另一个 KernelDriver 时无需改变会话格式或前端协议。

## 9. Turn/Step 语义对齐

DSH 与 Pi 对 “turn” 的定义不同，因此必须固定如下映射：

| Pi 生命周期 | DSH 语义 |
|---|---|
| 一次 `Agent.prompt()`/低层 run | 一个 DSH turn |
| Pi `turn_start` | 一个 DSH `step/start` |
| Pi 一次 assistant 响应及其工具批次 | 一个 DSH step |
| Pi `turn_end` | DSH `step/end` |
| Pi `agent_end` | DSH `turn/end` |

DSH `next-step` Inbox 对应 Pi steering 边界；DSH `next-turn` Inbox 始终保持为下一次独立 DSH turn，不得接入 Pi follow-up queue。

初始输入和中途 steering 都先通过 DSH `agent/pre-step` 扩展点。被拒绝的 step 不得触发模型请求。System Prompt、工具 schema、模型配置和会话历史在每个 step 开始前从 DSH 重建。

## 10. 事件提交原则

Pi 事件不是持久化协议。适配器将其映射为两类输出：

- Durable：追加到 DSH Session 的正式事件。
- Ephemeral：只用于流式 UI 的进程内事件，最终必须由 durable event 收敛替换。

关键映射：

| Pi 事件 | 处理 |
|---|---|
| `agent_start` | 发布 DSH `agent/status=running`，不写第二份记录 |
| `turn_start` | 追加 `step/start` |
| user `message_end` | 追加已通过 pre-step 的 `user/message`，同一 messageId 只写一次 |
| assistant `message_update` | 发布 `agent/assistant-stream`，不落独立 UI 数据库 |
| assistant `message_end` | 追加 `assistant/message` 或失败时 `assistant/attempt` |
| `tool_execution_start` | 追加 `tool/call` 后才允许进入 DSH 工具执行管线 |
| `tool_execution_update` | 仅发布瞬时进度 |
| tool-result `message_end` | 按模型调用顺序追加 `tool/result`，引用对应 call seq |
| `turn_end` | 追加 `step/end` |
| `agent_end` | 追加 `turn/end`，随后状态收敛为 idle |

并行工具可能按完成时间发出 `tool_execution_end`，但 durable `tool/result` 必须按 assistant 中的源顺序提交。适配器必须维护有界重排缓冲区，不能用完成顺序写日志。

`Session.append()` 是逻辑提交而不是通用的抗崩溃承诺。V1 额外要求以下 durability barrier：用户消息向 Client 确认为已接纳前、每个 `tool/call` 进入实际工具执行前、`turn/end` 对外完成和 Agent 进入 idle 前，必须对该 Session 的 write handle 执行并成功完成 `flush()`。flush 失败立即停止运行。

## 11. 模型平面

DSH 设置和 `llm-pi-ai` 是唯一模型配置所有者。V1 支持两类 OpenAI-compatible route：

- Local：loopback 地址上的 llama.cpp、Ollama、LM Studio、vLLM 或其他兼容服务。
- Cloud：HTTPS 上的 OpenAI 或兼容云提供商。

每个 route 明确声明 `openai-responses` 或 `openai-completions` wire API。不得仅依靠 URL 猜测协议。

Pi 内核使用 `DshModelStreamBridge`：它把 Pi 请求上下文转换为 DSH `GenerateOptions`，执行 DSH `agent/request`/`llm.prepareCall`/重试策略，再把 DSH `StreamChunk` 转回 Pi `AssistantMessageEvent`。这层双向转换是有意的：它让 DSH 的设置、凭据、冻结请求、附件、错误分类和重试继续生效。

Pi 的 `Model` 对象只是单次 step 的冻结描述，不是配置事实源。模型设置在回复中途改变时只影响下一个 step。

V1 不实现公开 OpenAI-compatible 入站网关；桌面 UI/CLI 继续调用 DSH 的 Harness/Agent API。

## 12. 工具、审批与权限

`DshToolBridge` 把当前 Agent scope 中 DSH `tools.schemas(agent)` 的可见工具包装成 Pi `AgentTool`。真正执行必须调用 DSH `tools.execute()`，不得直接调用工具函数。

这样可以保留：

- 工具可见性和 scope restriction。
- schema 校验。
- workspace/path 策略。
- ask/allow/deny 审批。
- timeout、取消和安全策略。
- `tools/result` 观察者。
- tool presentation metadata。
- `additionalContexts` 和 `concludesTurn`。

Pi 的 `beforeToolCall`/`afterToolCall` 只用于桥接，不再实现一套权限判断。DSH 返回错误时，桥接器必须让 Pi 看到 `isError=true` 的 ToolResult，同时把 DSH 原始 content、error info 和 meta 无损写入 Session。

## 13. Goal、Plan、Skills 与 MCP

这些能力全部复用 DSH：

- `/goal` 继续通过 DSH Goal 服务写 `goal/change`。
- `/plan` 继续通过 DSH Plan Mode 写 `plan/mode` 并约束工具集。
- Skills 继续由 DSH filesystem loader 发现，采用渐进式披露进入 System Prompt。
- MCP 继续由 DSH MCP Client 管理连接并把工具注册到 DSH Tool Registry。

Pi 内核只看见 DSH 组装后的 prompt 和工具快照。因此本地 Skills、MCP tools、Goal/Plan 不需要 Pi 专用适配器，也不会形成第二份状态。

V1 插件能力限定为加载用户自己的兼容 Skills/MCP 配置。不得承诺可直接分发 OpenAI curated 插件。

## 14. 前端设计边界

V1 前端沿用 DSH 页面结构、导航、会话列表、工作区、消息卡片、工具卡片、Diff/Terminal、设置和插件清单。

需要调整的部分：

1. 品牌名和应用标识改为 Local-Harness-pi。
2. 设置页增加统一的 Models、Tools & Permissions、Skills、MCP、Experimental 分区。
3. Composer “+” 菜单提供附件、Skill、MCP/工具、Goal、Plan 入口；其状态与设置页读取同一配置服务。
4. 工具卡片默认显示摘要、状态和持续时间，参数与原始输出折叠显示。
5. 流式 assistant 内容使用 transient revision；收到对应 DSH durable seq 后原位收敛，不能生成重复消息。
6. 会话切换后前端丢弃旧 session 的 transient frame，并从 DSH Session/Query 重新投影。

V1 不做全面视觉重构。Codex 用于入口和交互细节参考，DSH 保持视觉和布局基础。

## 15. 会话一致性

会话系统只有一个事实源：DSH append-only Session log。SQLite、Pi 内存和前端状态都是派生层。

必须满足：

- Agent id 与 Session id 完全相同。
- 每个 Session 同时最多一个 write owner。
- durable seq 单调递增且不复用。
- assistant/tool 的持久事件在对外宣告完成前已提交到 DSH Session，并在规定的 durability barrier 上完成 `flush()`。
- crash 后只恢复完整提交前缀；损坏完整 frame 必须拒绝，不能静默截断。
- `tool/call` 已提交而 `tool/result` 缺失时写 `TOOL_OUTCOME_UNKNOWN` 修复结果；不得自动重放副作用工具。
- SQLite FTS 可以清空重建；任何索引内容都不能回写覆盖 Session。
- 前端不得拥有独立的 durable chat 数据库。

详细规则见《会话一致性与恢复》。

## 16. 安全基线

V1 必须保持或加强以下 Electron 配置：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- renderer 只通过最小 preload API 访问 Host。
- IPC 必须校验 sender、参数 schema、workspace/session 身份。
- 拦截非允许的 navigation、window open 和自定义协议。
- 本地模型默认只允许 loopback；云端 route 默认要求 HTTPS。
- 自定义 HTTP header 中禁止存放明文 API key；凭据使用 DSH credential reference。
- 文件工具路径在解析符号链接后仍必须位于授权 workspace。
- 网络工具默认关闭或受 allowlist/审批控制。
- 日志、Session 和错误信息不得写入密钥。

完整浏览器自动化、插件签名链和全面渗透加固进入 V1.1。

## 17. V1 与 V1.1 边界

### V1

- DSH Electron/UI 产品平台。
- Pi Agent Core 执行循环。
- DSH 单一 Session 事实源及恢复。
- OpenAI-compatible 本地/云端模型。
- DSH Tools/Approvals/Workspace。
- Goal、Plan、Skills、MCP。
- 附件和 PDF 预览。
- `web_search`、`web_fetch` 和外部浏览器打开。
- GitHub Release 检查与手动下载提示；Alpha 默认关闭自动安装。
- 基线安全、恢复、E2E 和打包验证。

### V1.1

- Word/Excel/PDF 创建与编辑插件。
- 完整 Playwright/Computer-use 浏览器自动化。
- 签名、自动下载、自动安装和回滚更新。
- 更细粒度插件权限、网络隔离、审计和安全加固。
- OpenAI-compatible 入站 Harness Gateway 仍不属于 V1.1；只有未来经单独批准的版本才可加入。

## 18. 失败处理

失败必须分层并可诊断：

- `MODEL_*`：鉴权、限流、超时、上下文溢出、无效请求、传输中断。
- `TOOL_*`：未知工具、审批拒绝、执行失败、超时、结果未知。
- `SESSION_*`：写入、锁冲突、损坏、迁移拒绝、恢复失败。
- `KERNEL_*`：Pi 事件非法、桥接状态机失配、未正常终止。
- `PROTOCOL_*`：Host/Client 版本或 envelope 校验失败。

模型或工具业务失败应形成 DSH 结构化 Session 结果；Session 持久化失败和桥接不变量失败必须停止当前运行，禁止假装完成。

## 19. 可观测性与隐私

V1 日志记录：sessionId 的安全短标识、runId、turn/step、provider route、model id、event type、duration、error code。默认不记录用户消息正文、工具输出、文件内容、API key 或 Authorization header。

运行指标只做本地诊断，不默认上传遥测。任何未来云遥测必须单独取得明确授权。

## 20. 测试策略

验收必须覆盖四层：

1. Unit：消息、stream、tool result、错误和事件映射。
2. Contract：同一用例分别跑 DSH 默认 loop 测试夹具与 Pi loop，验证 DSH 公共不变量。
3. Integration：本地 mock OpenAI server、DSH model/tool/session 服务、Pi kernel 完整链路。
4. Desktop E2E：创建、流式响应、审批、工具、取消、恢复、Goal/Plan、Skill/MCP、PDF 预览和打包。

恢复测试必须真实终止子进程模拟：provider 流中断、tool start 后退出、append 尾部撕裂、SQLite 缺失/损坏、同 session 双进程竞争。

任何“测试通过”声明必须附实际命令和结果；不得用静态审查代替运行。

## 21. 云端可观察 PR 边界

为便于项目所有者随时查看，V1 建议拆成三个独立可审查成果：

1. **PR-A：DSH 基线与产品边界**

   固定源码、许可证、品牌、组合、会话/安全基线和回归测试；不接 Pi。

2. **PR-B：Pi 内核桥接**

   AgentFactory、KernelDriver、模型/工具/事件桥、单一 Session 写入、恢复与兼容测试。

3. **PR-C：V1 产品闭环**

   设置与“+”菜单、Goal/Plan/Skills/MCP、PDF 预览、手动更新提示、桌面 E2E、打包和发布说明。

如 PR-B diff 过大，只允许按“运行/模型桥”和“工具/持久化桥”拆成 B1/B2，最多形成四个 PR。不能按技术层制造更多长期分支。

## 22. 工期预算

在直接复用 DSH 且不扩大 V1 范围的前提下：

- V1：约 3–4 个日历周。
- 以 GPT-5.6 Sol Plus 的完整周额度衡量：约 2–3 个周额度。
- V1.1：额外 1–2 周，约 0.8–1.5 个周额度。

估算包含源码复核、实现、测试、修复和复审，不包含等待人工决定、模型服务不可用、签名证书申请或上游大版本升级。

## 23. 变更控制

以下变化属于架构变更，必须先更新本文档并取得项目所有者确认：

- 增加第二个持久化 Session store。
- 改用 Pi AgentHarness。
- 绕过 DSH Tools/LLM/Approval 服务。
- 让前端直接消费 Pi 原生事件。
- 在 V1 增加 Qwen Code 内核、公开 OpenAI 网关、Office 编辑或完整浏览器自动化。
- 改用 Tauri 或重写 DSH UI。

类名、文件名和纯内部拆分可以在不改变契约的前提下调整，但 PR 必须说明对应关系。

## 24. 文档间优先级

发生冲突时按以下优先级处理：

1. 本总体架构设计中的所有权、范围和禁止项。
2. 《会话一致性与恢复》中的数据不变量。
3. 《接口契约》中的类型和时序。
4. 《V1 需求规格》中的产品行为和验收条件。

任何无法按此顺序消解的冲突必须先修正文档，不得由代码执行者自行改变方向。
