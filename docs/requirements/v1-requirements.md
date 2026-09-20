# Local-Harness-pi V1 需求规格

文档版本：1.2

适用版本：V1

架构基线：DSH 产品平台 + Pi 对话式工具循环内核 + 单一 DSH 对话/执行恢复事实源

## 1. 规范用语

- **必须（MUST）**：V1 发布阻断条件。
- **应该（SHOULD）**：除非有记录充分理由，否则必须实现。
- **可以（MAY）**：不影响 V1 验收的可选行为。
- **禁止（MUST NOT）**：实现中不得出现。
- **P0**：缺失则不能发布。
- **P1**：V1 应包含；若延期必须由项目所有者确认。
- **P2**：明确进入 V1.1 或以后。

本交接计划没有批准任何 P1 延期：FR-025、FR-047、FR-052、FR-064、FR-065、FR-071、FR-072、FR-083、NFR-020、NFR-030、NFR-031 和 NFR-032 均纳入 V1 实施与验收。执行者不得自行把它们移出 V1；若项目所有者以后调整范围，必须先更新需求、追踪矩阵和对应 PR 计划。

需求 ID 是稳定引用。重写需求时保留 ID；删除需求时标记废弃，不复用编号。

## 2. 产品定位

Local-Harness-pi 是面向本地代码工作区的桌面 Coding Agent。它提供 DSH 风格的完整桌面产品体验，使用 Pi Agent Core 运行代码任务，并允许用户在本地 OpenAI-compatible 模型与云端 OpenAI-compatible 模型之间切换。

V1 的核心价值不是创造新的 Agent 平台，而是验证以下组合可以稳定工作：

1. DSH 已有桌面、会话、工具和插件能力保持完整。
2. Pi 循环可以成为唯一执行内核。
3. 会话只有一个权威记录且可从崩溃中恢复。

## 3. 目标用户和主要任务

### 3.1 目标用户

- 在 Windows 本地项目中使用 Agent 编写、解释和修复代码的个人开发者。
- 希望使用本地模型保护代码隐私，同时需要时切换云模型的用户。
- 需要 Skills、MCP、Goal/Plan 和可审查工具过程的高级用户。

### 3.2 主要任务

- 打开一个本地工作区并提问。
- 让 Agent 搜索、读取、修改文件并运行命令。
- 审查工具调用、差异和终端输出。
- 在工具执行前处理权限确认。
- 切换本地/云端模型及推理强度。
- 使用 Skill、MCP、Goal 和 Plan 模式。
- 关闭应用后恢复原会话并继续。

## 4. 发布平台与兼容性

### PLAT-001（P0）Windows 发布目标

V1 的正式发布和验收目标是 Windows 11 x64。Windows 10 22H2 可以兼容，但不作为阻断发布的唯一环境。macOS 和 Linux 保留 DSH 源码兼容性，不属于 V1 二进制发布门禁。

验收：

- 安装包可在干净 Windows 11 x64 用户环境安装、启动和卸载。
- V1 Alpha 为未签名 NSIS 手工安装包，发布页必须明示 SmartScreen 警告和 SHA-256；代码签名、自动安装与回滚属于 FR-092/V1.1。
- 应用数据写入 Electron `userData` 下的应用专用目录。
- 项目文件只在用户选定工作区内修改。

### PLAT-002（P0）运行时版本固定

Node/Electron/pnpm 版本必须继承固定 DSH 基线；Pi Agent Core 与 Pi AI 必须固定同一 `0.85.1` 版本。锁文件必须提交。

### PLAT-003（P0）许可证和来源

必须保留 DSH 和 Pi 的 MIT 许可证与来源说明。Codex 只作为设计参考，不得将其 Apache-2.0 源码片段复制到本项目而不进行来源和许可证审查。

## 5. 工作区与桌面壳

### FR-001（P0）打开工作区

用户必须能够通过系统目录选择器打开一个现有本地目录。Host 必须解析真实路径并创建或复用 DSH Workspace。

验收：

- 非目录、不可读目录和已失效路径显示可行动错误。
- 同一路径的大小写或符号链接别名不得创建两个逻辑 Workspace。
- 最近工作区可以从侧栏重新打开。

### FR-002（P0）单实例与深链接

必须保留 DSH 单实例行为。第二次启动携带的工作区或会话参数应转交现有实例；未知或非法参数不得直接进入 renderer。

### FR-003（P0）桌面安全隔离

renderer 必须保持 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true` 和 `webSecurity=true`。预加载层只暴露经过 schema 验证的最小 API。

### FR-004（P0）产品标识、关于与许可

窗口标题、PWA 名称、侧栏/空会话品牌、安装包名、应用数据目录、About 和发布产物名必须统一为 `Local-Harness-pi`，应用 ID 固定为 `io.localharness.pi`。Windows 桌面 Help 菜单必须提供 About 入口，显示应用版本、固定 DSH commit、Pi package 版本以及“非 OpenAI/DeepSeek 官方产品”声明；同一入口必须能打开随安装包分发的第三方许可文件。桌面与 Web 不得继续使用 DSH 官方 wordmark、鱼形标志或 favicon 作为本产品标志；V1 使用仓库自带的中性 `LHπ` 标志，不引入新的第三方商标资产。

验收：

- `THIRD_PARTY_NOTICES.txt` 至少列出 DSH、Pi 的仓库、固定版本/commit 和 MIT 许可；Codex 只标记为 Apache-2.0 设计参考，不得暗示分发了 Codex 源码。
- About 与许可入口离线可用，不依赖 GitHub 可达。
- 打包测试必须证明许可文件进入 Windows unpacked artifact；窗口/PWA/侧栏/空会话/首次欢迎页不得把 `DeepSeek Harness` 显示为当前产品名。
- `DeepSeek Harness` 只允许出现在真实上游归属语境（About、第三方许可、`UPSTREAM.md`、源码/开发者文档）和内部兼容标识中。`@deepseek-ai/dsh-*` 包名、Cordis plugin id、`dsh-app` scheme、`window.dshDesktop`、`DSH_*` 环境变量、Session/remote event type 与 CLI 可执行名 `dsh` 不做机械改名。
- 桌面所用 Web profile 必须关闭 DSH 默认模型身份句，并注入 `Local-Harness-pi` 身份；面向模型的 Web GUI 上下文不得把当前产品称为 DeepSeek Harness，但可准确说明它 built on DeepSeek Harness。

## 6. 会话与消息

### FR-010（P0）创建会话

用户在工作区中创建会话时，系统必须生成一个同时用于 DSH Agent 和 DSH Session 的唯一 `sessionId`。在 Agent scope、Session、UI 路由和日志中不得生成第二个对话 ID。

### FR-011（P0）发送普通消息

空闲时发送消息必须进入 DSH `next-turn` Inbox，持久记录 inbox splice，并唤醒 Pi 驱动的 Agent。输入在被 step 接纳后形成一个 DSH `user/message`。

Host 只有在该 Inbox splice 通过 Session durability barrier 后才向 Client 确认为“已接纳”。验收：连续双击发送或网络重试不能造成同一 `messageId` 的重复提交；收到确认后强制结束 Host，消息仍可恢复。

### FR-012（P0）Steer 与 Follow-up

- 运行中“立即调整”进入 `next-step`，在当前模型响应及已开始的工具批次完成后进入最近的 Pi turn。
- 普通追问进入 `next-turn`，当前 DSH turn 结束后单独开始新 turn。
- UI 必须清楚区分已发送、排队和已接纳状态。

### FR-013（P0）流式 assistant 消息

前端必须显示文本、reasoning 和 tool-call 参数的增量。流式内容属于临时状态；收到 DSH durable assistant event 后必须原位替换，不能保留两条消息。

### FR-014（P0）取消

用户可以取消当前运行。取消必须：

- 中止当前 provider stream。
- 将信号传播到已开始的 DSH 工具。
- 等待已开始工具达到 quiescence。
- 为已开始但未正常结束的 step/turn 写入合法闭合事件。
- 默认清除尚未接纳的队列；显式 `keepInbox` 时保留。

### FR-015（P0）恢复会话

应用重启后必须从 DSH JSONL/Zstd Session 恢复会话。恢复不得读取 Pi session store，也不得从 SQLite FTS 反向构造正文。

### FR-016（P0）会话列表和搜索

列表的身份、标题、工作区和可用性来自 DSH Session/Query。标题/元数据搜索必须直接可用；正文全文搜索在用户首次提交非空查询时按需打开 DSH SQLite FTS，不得要求用户编辑配置文件。索引缺失、损坏或重建中时，会话仍可按权威日志打开；UI 必须分别显示“正在建立索引”和“索引失败，可重试”，不得显示“会话丢失”。

### FR-017（P0）会话整理、分叉与导出

必须保留 DSH 已有的会话重命名、搜索、归档、取消归档、分叉和导出入口。归档是 V1 唯一默认移除入口，不增加永久删除会话按钮。

验收：

- 重命名和归档状态由 DSH Session/Query 持久化，重启后保持一致。
- 已归档会话不出现在默认列表，但能从归档筛选中打开并取消归档。
- 分叉只复制平衡的已完成事件前缀并记录 `parentSession`；不得复制开放 step、悬空 tool call 或 Pi 运行时对象。
- Header 与 `/export` 必须导出同一 DSH Session generation；完整导出明确提示可能包含 prompt、代码和工具输出。

### FR-018（P0）单写者

同一 session 同时只能存在一个活动写者。第二个进程或恢复操作必须明确失败，不能进入“最后写入者获胜”。

### FR-019（P0）长会话压缩

长会话压缩必须继续由 DSH Compaction 和 surface replacement 负责。Pi Harness Compaction 禁止进入生产依赖；Pi 每个 step 必须读取最新 DSH surface generation。

验收：

- 自动压力触发、provider 返回上下文溢出后的单次压缩恢复，以及 `/compact` 手工触发均有集成测试。
- 压缩成功后，下一 step 只使用新 surface，不把旧 Pi transcript 追加回来；原始 durable event 历史仍可审计。
- 压缩失败不得覆盖旧 surface；确定无法压缩时返回可行动错误，不进入无限重试。
- 重启后从 DSH compaction/surface event 恢复，不读取 Pi session store。

## 7. Pi 执行内核

### FR-020（P0）唯一活动内核

V1 默认组合必须只激活 `@local-harness/pi-agent-loop` 一个 AgentFactory。该实现必须继承 DSH `AgentLoop` 的创建、恢复、发布、回滚和销毁生命周期，只通过 protected machine-construction seam 构造 `DshPiAgent`；原 DSH ReactLoopAgent 不得同时激活，Pi 包不得复制或重新实现第二套 AgentFactory 生命周期。

### FR-021（P0）Pi 依赖边界

生产运行时只允许使用 Pi Agent Core 的循环、Agent、事件和工具类型。禁止加载 Pi Harness Session、Skills、Compaction 和 built-in coding tools。

### FR-022（P0）上下文重建

每个模型 step 开始前，Pi 上下文必须从当前 DSH Session surface、DSH System Prompt assembly、DSH Tool schemas 和 DSH model selection 重建。不得直接把上一个 step 的 Pi 内存 transcript 当作唯一输入。

### FR-023（P0）事件屏障

Pi `Agent.subscribe()` 的异步 listener 必须按顺序 await。`agent_end` 只有在所有 DSH Session 追加、turn 末尾 `flush()` 和必要收尾完成后才可使 DSH Agent 进入 idle。

### FR-024（P0）Turn/Step 映射

一次 Pi run 对应一个 DSH turn；Pi 每次 `turn_start`/`turn_end` 对应一个 DSH step。映射必须通过状态机验证，非法顺序立即产生 `KERNEL_EVENT_ORDER` 并停止运行。

### FR-025（P1）未来内核接口

Pi 必须位于 `KernelDriver` 之后。DSH Agent/UI/Session 不得 import Pi 事件类型。V1 的 `KernelDriver` 只抽象对话式模型—工具循环，不承诺通用 agent graph、多 Agent 编排或任意后台 workflow。V1 不需要第二实现，但应提供 mock driver 完成契约测试。

## 8. 模型配置与调用

### FR-030（P0）本地 OpenAI-compatible route

用户必须可配置 loopback `baseUrl`、wire API、模型 id、上下文窗口、最大输出 token 和推理强度。HTTP 只允许 loopback 地址；远程非 TLS URL 必须拒绝。base URL 禁止 userinfo、query 和 fragment，credential 不能藏在 URL 中。

### FR-031（P0）云端 OpenAI-compatible route

用户必须可配置 HTTPS `baseUrl`、wire API、模型 id 和 credential reference。base URL 禁止 userinfo、query 和 fragment。API key 不得保存在普通设置 JSON、Session、日志或 UI 状态快照中。V1 不开放任意请求 header 编辑；标准 OpenAI Authorization 只能由 Host 从 credential reference 构造。

### FR-032（P0）显式 wire API

route 必须显式选择：

- `openai-responses`
- `openai-completions`

不得根据路径是否包含 `/responses` 自动猜测。

### FR-033（P0）模型发现与手工模型

支持 provider 模型列表发现时，用户可刷新列表；不支持时可手工声明模型。发现失败不得删除已有可用手工配置。

### FR-034（P0）请求冻结

provider、model、reasoning、maxTokens、凭据解析结果和 provider snapshot 必须在单个 step 第一次 await 前冻结。设置修改只影响后续 step。

### FR-035（P0）能力校验

在发起请求前必须校验：图片输入、reasoning level、tool call 和上下文容量。明确不支持的能力应返回稳定错误码，不得静默丢弃。

### FR-036（P0）错误与重试

鉴权、限流、配额、超时、上下文溢出、无效请求、服务端错误和传输中断必须分类。重试使用 DSH 策略并记录 attempt；取消、鉴权、无效请求和确定的上下文溢出不得盲目重试。

### FR-037（P0）V1 出站限定

V1 模型连接只实现 OpenAI-compatible 出站调用。Anthropic/Gemini 直接协议和 OpenAI-compatible 入站网关均不得作为 V1 隐含依赖。

V1 模型流固定使用 HTTP SSE；WebSocket transport 不得出现在产品写入路径。模型发现、模型流和 HTTP MCP 必须复用同一个 Host guarded-fetch 实现，对初始 URL、DNS pinning、redirect、credential origin 和资源释放执行一致策略。

## 9. 工具和权限

### FR-040（P0）DSH 工具目录

Pi 看见的工具必须来自当前 Agent scope 的 DSH `tools.schemas()` 快照。被 Plan 模式、preset 或策略隐藏的工具不得出现在 Pi schema 中。

### FR-041（P0）统一执行管线

每个 Pi 工具调用必须进入 DSH `tools.execute()`。工具参数、callId、agent 和 AbortSignal 必须保留。

### FR-042（P0）工具调用持久顺序

`tool/call` 必须在工具 body 开始前追加并通过该 Session 的 `flush()` durability barrier；`tool/result` 必须在 body/策略完全结束后追加并引用对应 call seq。并行结果按 assistant 源顺序写入。

### FR-043（P0）审批

工具为 `ask` 时 UI 显示工具名、关键参数、风险说明和作用域。只有 `allowed-once` 或当前策略允许后才能执行。拒绝必须形成模型可见的结构化 error result。

### FR-044（P0）工作区限制

文件读写、搜索、patch 和命令工作目录必须在授权 workspace 内。路径校验必须在规范化并解析符号链接后进行；路径穿越、UNC/设备路径和别名绕过必须有测试。

### FR-045（P0）工具失败

未知工具、schema 错误、审批拒绝、超时、取消、输出无效和执行异常都必须收敛为一组 `tool/call` + `tool/result`，除非 Session 本身已无法写入。

### FR-046（P0）附加上下文与提前终止

DSH `additionalContexts` 必须在结果之后进入下一个 step；`concludesTurn` 必须映射为 Pi batch termination，且仅当该批次全部结果都要求终止时停止自动模型调用。

### FR-047（P1）工具展示

工具卡片默认展示状态、名称、简要目标、持续时间和结果摘要。参数、完整输出、错误和 meta 可以展开。重放会话时展示应由 durable event 重建。

## 10. Goal 与 Plan

### FR-050（P0）Goal

必须保留 DSH `/goal` 能力和 UI 入口。Goal 创建、更新、完成和阻塞状态必须写入 DSH `goal/change`，恢复后可重建。

### FR-051（P0）Plan

必须保留 DSH `/plan` 能力和 UI 入口。Plan 模式状态写入 DSH `plan/mode`；进入 Plan 后工具限制必须对 Pi 下一次工具快照生效。

### FR-052（P1）设置与快捷入口一致

设置页和 Composer “+” 菜单对 Goal/Plan 的显示必须读取同一 DSH client state；不得维护各自布尔值。

## 11. Skills、MCP 与插件

### FR-060（P0）Skills 发现

必须复用 DSH Skill/Skill Filesystem。Skill 元数据先发现，命中后再读取 `SKILL.md` 和必要引用，避免把所有技能正文放入上下文。

### FR-061（P0）Skills 作用域

全局、工作区和插件来源的 Skill 必须保持确定的优先级和冲突诊断。路径不得逃逸声明的 Skill root。

### FR-062（P0）MCP Client

必须复用 DSH MCP Client，支持 V1 已有的本地进程和 HTTP transport。连接失败应隔离到该 server，不得阻止其他 server 或基础工具加载。

### FR-063（P0）MCP 工具统一注册

MCP tools 必须注册到 DSH Tool Registry 后再由 ToolBridge 暴露给 Pi。Pi 不直接持有第二个 MCP client。

### FR-064（P1）插件清单

插件页应显示已加载插件的 Skills、MCP、权限声明、来源和加载错误。V1 不承诺安装或再分发 OpenAI curated 插件。

### FR-065（P1）插件权限声明

V1 必须展示 DSH settings/composition 已声明并实际执行的文件、命令、网络和 MCP 有效权限；基础拒绝继续由 DSH workspace、network、approval 和 `tools/pre-execute` 策略执行。V1 将已安装的 DSH 可执行插件包视为受信任源码，不新增一个无法完整执行的便携 manifest 权限字段。跨来源插件 manifest、细粒度 grant、签名和信任链进入 V1.1。

### FR-066（P0）MCP 图形化管理

设置页必须允许用户图形化新增、编辑、启用、停用和移除 GUI-managed MCP server，并显示连接阶段、最后错误和工具数。支持 DSH MCP Client 已有的 `stdio` 与 `streamable-http` transport；由固定 composition 提供的 MCP 行只读展示，不允许 UI 覆盖。

GUI-managed server 的字段固定为：稳定记录 id、唯一 `serverName`、transport、`toolCallTimeoutMs`、重连策略，以及：

- `stdio`：`command`、`args[]`、可选 `cwd`、环境变量名到 credential reference 的绑定。
- `streamable-http`：`url`、HTTP header 名到 credential reference 的绑定；Authorization 的 `Bearer ` 等公开前缀可以单独保存，credential value 不得进入配置。

V1 不提供任意 shell command line 文本框；`command` 与每个 argument 必须作为独立字段传给 DSH stdio transport，不经过 shell 展开。

### FR-067（P0）MCP 配置一致性与生效

GUI-managed MCP 配置必须由 Host 的 `local-harness.mcp` DSH settings namespace 持久化，Client 不得保存副本。启用记录在 DSH Tool Registry 的 deployment-global/root layer 挂载一次，所有 Agent scope 继承同一 tool generation；不得按 session 建立 MCP 配置或连接副本。每次写入必须携带 document revision 并以 compare-and-swap 更新完整 server record；并发修改返回稳定 conflict，不能最后写入者覆盖。

生效规则固定为：

- 新建记录默认 `enabled=false`；所引用 credential 全部可解析后才能启用。
- 保存成功表示配置已原子提交，不表示外部 server 已连接；运行阶段通过独立状态返回 `applying | active | error | disabled`。
- 只重建发生变化的 DSH MCP Client fiber；其他 server 和基础工具不得中断。
- `serverName` 变化会改变模型可见工具名，必须显示警告并要求请求携带 `acknowledgeToolRename=true`。
- remove 只删除配置并停止该 server，不自动删除 credential reference，因为 reference 可能被其他配置共享。
- credential 更新后只重启引用它的 server；resolved value 绝不返回 Client、Session、日志或 inventory。
- composition MCP 与 GUI-managed MCP 的 `serverName` 冲突必须在提交前拒绝。
- HTTP MCP 只允许 HTTPS，或 hostname 为 `localhost`/loopback IP literal 的 HTTP；URL 禁止 userinfo、query 和 fragment。重定向每跳重新校验，带 credential-bound header 时不得跨 origin 跟随。

## 12. 附件、PDF 和浏览器

### FR-070（P0）附件

Composer “+” 菜单允许选择 DSH 已支持的附件。文件字节存放在 DSH Attachment Store，Session 只保存引用和元数据。

### FR-071（P1）PDF 预览

V1 必须保留 DSH PDF 预览。预览失败不得损坏会话，且不代表支持 PDF 编辑。

### FR-072（P1）基础网页能力

V1 保留 DSH `web_search`、`web_fetch` 和在系统浏览器打开链接。网络访问遵守 DSH egress/approval 设置。

### FR-073（P2）Office/PDF 编辑

Word、Excel、PDF 创建或编辑插件进入 V1.1，不是 V1 发布条件。

### FR-074（P2）完整浏览器自动化

Playwright/Computer-use、登录态、下载和页面交互进入 V1.1，不是 V1 发布条件。

## 13. 设置和交互入口

### FR-080（P0）设置分区

设置页至少提供：

- Models：route、模型、reasoning、连通性测试。
- Tools & Permissions：默认策略、workspace、network。
- Skills：来源、启用状态和错误。
- MCP：server、transport、连接状态和工具数。
- Experimental：默认关闭的实验项。
- About：版本、固定上游来源和离线第三方许可入口。

### FR-081（P0）Composer “+” 菜单

“+” 菜单至少提供：附件、Skill、MCP/工具、Goal、Plan。菜单只提供高频入口；完整配置跳转设置页。

### FR-082（P0）配置单一来源

设置页、“+” 菜单、模型选择器和 Host 必须使用同一 DSH settings/service state。前端本地存储只允许保存非权威 UI 偏好，不得保存模型 key 或权限事实。

### FR-083（P1）工具调用折叠

默认视图应接近 Codex 的紧凑状态展示，展开后才显示 raw arguments/output。此调整不得改变 DSH durable event 或工具执行语义。

## 14. 更新和发布

### FR-090（P0）更新策略

保留 DSH updater 代码，但 Alpha 构建默认关闭自动下载和自动安装。用户显式检查时，可以查询 GitHub Release 并显示版本、说明和手动下载链接。

### FR-091（P0）失败隔离

更新检查失败不得阻止应用启动，也不得反复弹窗。日志不得包含 GitHub token 或系统隐私信息。

### FR-092（P2）签名自动安装

签名验证、自动下载、自动安装、回滚和强制更新进入 V1.1。

## 15. 会话数据质量与恢复

### NFR-001（P0）唯一事实源

任何可以影响恢复后模型行为的对话或执行事实必须存在于 DSH Session。Pi 内存、SQLite FTS、React store、日志或 telemetry 不得成为补充事实源。Decision、Evidence、Artifact 等领域对象可以由领域服务拥有独立存储，但其影响模型上下文或执行恢复的稳定引用、状态变化与结果必须写入 DSH Session；领域存储不得复制 transcript 或成为隐含执行日志。

### NFR-002（P0）追加与不可变性

已提交 Session event 不得原位更新。格式变化通过新 generation 迁移，旧 generation 保留不可变。

### NFR-003（P0）崩溃恢复

原始 JSONL 的不完整尾行可以丢弃；Zstd 的 torn tail 只恢复完整记录。完整 frame 的 checksum、解压或结构失败必须报告 corruption，不能静默修复。

### NFR-004（P0）结果未知

已记录 `tool/call` 而无 `tool/result` 的副作用结果必须标为 `TOOL_OUTCOME_UNKNOWN`。系统可以建议验证，但不得自动重复执行。

### NFR-005（P0）索引可重建

删除或损坏 SQLite 派生索引后，系统必须能只读 DSH Session 重新构建；重建前会话仍可直接打开。

### NFR-006（P0）持久化屏障

以下边界必须调用并成功完成该 Session write handle 的 `flush()`：Client 确认用户消息已接纳前、工具 body 开始前、turn 完成/Agent idle 前。`append()` 成功但 `flush()` 失败不能返回成功状态。

## 16. 安全与隐私

### NFR-010（P0）凭据

凭据只能由 DSH credential store/reference 解析。所有用户可见配置导出、Session、错误和诊断包必须经过密钥脱敏。

### NFR-011（P0）网络

本地 route 只允许 loopback HTTP/HTTPS；云 route 必须 HTTPS。重定向后的最终 URL 也要重新校验。带 `location` 的 V1 产品 route 不得继承 Pi catalog 的 OAuth/ambient auth、系统代理凭据或任意环境 Authorization；本地无 credential route 必须真正 keyless，云 route 只能使用显式 DSH credential reference。

### NFR-012（P0）Electron

禁止 renderer 直接访问 Node、文件系统、shell 或 credential store。所有高权限行为通过 Host 接口和权限策略。

### NFR-013（P0）插件

插件加载错误应被隔离和展示。插件声明的外部程序、网络和文件权限在首次使用时可审计。未知 manifest 字段不能扩大权限。

### NFR-014（P0）内容日志

默认诊断日志不包含 prompt、assistant 正文、工具原始输出、文件内容或附件字节。用户主动导出完整诊断时必须明确说明范围。

## 17. 性能与可靠性

### NFR-020（P1）相对性能门禁

在同一固定工作区和 mock provider 下，相比固定 DSH 基线：

- 冷启动中位数不得回退超过 15%。
- 首个 Host 流事件到 UI 呈现的额外中位延迟不得超过 100ms。
- 空闲内存不得回退超过 20%。
- 1000 个历史会话的列表加载不得回退超过 15%。

若 DSH 基线本身波动，必须附原始测量并由项目所有者判断，不得为通过门禁删除功能。

### NFR-021（P0）有界缓存

Pi event reorder、stream delta、tool output preview 和 Session projection 缓冲区必须有明确上限。大输出应沿用 DSH 截断或附件/spill 策略。

### NFR-022（P0）资源清理

取消、关闭会话、切换工作区和应用退出必须等待 provider、工具、Session handle 和 scoped service 清理。不得留下继续写旧 Session 的后台 promise。

## 18. 可访问性和可用性

### NFR-030（P1）键盘操作

发送、取消、打开“+”菜单、选择模型、打开设置和关闭弹窗必须可用键盘完成。审批弹窗不能把焦点留在后台页面。

### NFR-031（P1）错误可行动

错误至少显示稳定错误码、简明原因和下一步动作。模型连接错误应区分 base URL、鉴权、模型不存在和网络失败。

### NFR-032（P1）状态可理解

UI 必须区分：等待模型、流式生成、等待审批、执行工具、取消中、恢复中和空闲。不能用一个永久 spinner 覆盖所有状态。

## 19. 测试与发布验收

### TEST-001（P0）源码与依赖门禁

- 固定上游 hash/版本与文档一致。
- 锁文件无浮动 Pi 版本。
- 生产依赖图不包含 Pi Harness Session/Skills/Compaction。
- 默认组合恰好一个 AgentFactory。

### TEST-002（P0）模型矩阵

至少验证：

1. 本地 mock OpenAI Chat Completions：文本、工具、流式、取消、错误。
2. 本地 mock OpenAI Responses：文本、工具、流式、取消、错误。
3. 一个真实 loopback 兼容服务的手工 smoke test。
4. 一个真实 HTTPS OpenAI-compatible 云 route 的受控 smoke test；CI 无密钥时可跳过，但发布记录必须包含结果。

### TEST-003（P0）工具矩阵

至少覆盖：读文件、搜索、patch、shell、未知工具、schema 错误、审批 allow/deny、超时、取消、并行完成乱序、`additionalContexts` 和 `concludesTurn`。

### TEST-004（P0）会话恢复矩阵

至少覆盖：

- 空闲退出后恢复。
- assistant 流中断。
- tool call 已记录、body 未开始。
- body 已开始、result 未记录。
- step 已结束、turn 未结束。
- raw torn line。
- Zstd torn final frame。
- 完整 frame checksum corruption。
- SQLite 文件丢失或损坏。
- 同 session 第二写者竞争。
- 自动/手工 compaction 后终止并恢复。
- context overflow 触发一次 DSH compaction 后成功重试；压缩失败不循环。

### TEST-005（P0）产品能力矩阵

Goal、Plan、Skill、MCP、附件、PDF 预览、模型切换、设置与“+”菜单必须各有至少一个集成或桌面 E2E 用例。另必须覆盖首次模型配置、会话重命名/搜索/归档/恢复/分叉/导出、Diff、Terminal、About/许可，以及 MCP stdio/HTTP 的新增、启停、编辑、冲突、失败隔离和移除。

### TEST-006（P0）安全矩阵

至少覆盖：IPC sender 拒绝、navigation/window open 拒绝、路径穿越、符号链接逃逸、远程 HTTP model route 拒绝、凭据脱敏和未授权网络工具。

## 20. V1 端到端验收场景

### AC-001 本地模型完成代码修改

给定一个 loopback OpenAI-compatible 模型和测试工作区，用户要求修改一个跨文件 bug。Agent 应读取文件、获得必要审批、提交 patch、运行测试并展示 diff；重启应用后同一会话完整可见且可继续。

### AC-002 云模型切换在 step 边界生效

运行中修改模型设置，当前流保持原 provider/model，下一 Pi turn 使用新配置；Session 中 request header 能解释这次切换。

### AC-003 工具结果未知不重放

在副作用 shell 工具开始后强制终止 Host。恢复时出现 `TOOL_OUTCOME_UNKNOWN`，Agent 不自动再次运行命令，并提示用户验证外部状态。

### AC-004 派生索引损坏不丢会话

在关闭应用后破坏 SQLite FTS 文件。应用重启仍可直接打开 JSONL/Zstd 会话，并能触发索引重建。

### AC-005 Goal/Plan/Skill/MCP 共存

在一个会话中设置 Goal、进入 Plan、触发一个 filesystem Skill、调用一个 MCP tool，再退出 Plan。全部状态在恢复后正确投影，Pi 无第二份插件或计划记录。

### AC-006 前端无重复消息

在高延迟流式输出、工具调用和快速切换会话场景下，每个 durable messageId 只显示一次；旧 session 的迟到 transient frame 被丢弃。

### AC-007 首次启动与模型回退

干净 profile 首次启动必须打开 Models onboarding 且禁用 Send。配置无 key 的 loopback route 后可以发送；云 route 缺少 credential 时保持不可用。模型发现失败时保留用户手工填写的 model id，修正连接后无需重建会话即可使用。

### AC-008 会话资料库闭环

用户可以重命名会话、按正文搜索、归档并从归档视图恢复、从已完成 turn 分叉、导出当前 generation；每次操作后重启应用，列表与打开结果保持一致。

### AC-009 MCP 管理闭环

用户新增一个默认停用的 stdio server，配置 credential reference 后启用并调用工具；再新增一个 HTTP server。一个 server 连接失败时另一个及基础工具仍可用。编辑产生 revision conflict 时保留本地草稿并要求刷新；移除后对应工具消失、历史 tool event 仍可显示。

### AC-010 长会话闭环

使用小 context-window mock route 推进到自动压缩阈值，并分别测试 `/compact` 与 provider context-overflow 路径。压缩后继续一次包含工具调用的 turn，重启后模型 surface、完整审计历史和 UI projection 均一致。

## 21. Definition of Done

V1 只有同时满足以下条件才完成：

- 所有 P0 需求通过，P1 延期均有项目所有者明确记录。
- TEST-001 至 TEST-006 有可重复命令和结果。
- AC-001 至 AC-010 有证据。
- 没有 Pi durable session、第二个 chat DB 或前端持久 transcript。
- Windows 11 安装包经过干净环境 smoke test。
- 许可证、来源、设置迁移、会话格式与已知限制文档齐全。
- 代码复审没有未解决的 P0/P1 缺陷。

## 22. V1.1 需求池

V1.1 候选需求固定为：

- DOC-110：Word 文档创建、编辑和渲染验证插件。
- SHEET-110：Excel 工作簿创建、编辑、公式计算和渲染验证插件。
- PDF-110：PDF 创建、编辑、表单和视觉检查插件。
- BROWSER-110：Playwright 浏览器自动化及独立权限域。
- UPDATE-110：签名自动更新、安装回滚和发布密钥流程。
- SECURITY-110：插件签名、细粒度 capability grant、网络隔离和审计导出。

这些需求在 V1 发布前只能保留扩展接口，不能提前实现。

## 23. PR 追踪

| 需求范围 | 主要 PR |
|---|---|
| PLAT、FR-001–004、基础 NFR-010–014 | PR-A |
| FR-010–019、FR-020–025、FR-030–037、FR-040–047、NFR-001–006、TEST-001–004、AC-010 | PR-B |
| FR-050–052、FR-060–067、FR-070–074、FR-080–083、FR-090–092、NFR-020–032、TEST-005–006、AC-001–009 | PR-C |

PR-C 必须建立在 PR-B 的恢复和契约测试通过之后；UI 不得通过 mock 永久绕过真实 Pi/DSH 桥接。
