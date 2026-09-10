# Local-Harness-pi 会话一致性与恢复规范

文档版本：1.0

适用版本：V1

最高原则：只有 DSH Session log 是会话事实源

## 1. 要解决的问题

本项目明确避免“运行记录和展示记录各存一套，某次写入或迁移没有对齐，导致消息丢失、重复、错序或无法恢复”的设计。

因此 V1 不采用双写同步，而是消除第二个权威写入点：

- DSH append-only Session log：权威、可恢复。
- DSH SQLite FTS：派生、可丢弃、可重建。
- Pi Agent state：当前进程的运行缓存，可丢弃。
- 前端 store：当前页面的显示投影，可丢弃。
- 诊断日志/telemetry：观察数据，不可用于恢复。

任何恢复后会改变模型输入、工具结果、Goal/Plan、权限结果或用户队列的事实，必须先存在于 DSH Session。

## 2. 权威数据分类

### 2.1 必须写入 DSH Session

- Session header、workspace/cwd、父子 lineage、创建时间和来源。
- request header/context 及模型 route/model/推理配置的可恢复描述。
- System、User、Assistant、Tool Result 消息。
- turn/start、turn/end、step/start、step/end。
- tool/call、tool/result 及 call/result 关联。
- Agent Inbox splice，包括 pending、claim、cancel 所需投影事实。
- Goal 变更。
- Plan 模式变更。
- Compaction/replace surface 事件。
- 恢复时追加的 synthetic closer。

### 2.2 不写入 DSH Session 正文

- assistant 每个字符/token 的 UI frame；只在最终 assistant event 的 embedded stream 需要时按 DSH 原格式保存。
- tool progress 的高频临时帧。
- spinner、展开/折叠、面板尺寸等 UI 偏好。
- SQLite FTS token/排名/snippet。
- Pi pendingToolCalls、isStreaming、listener、AbortController。
- API key、Authorization header 或附件原始字节。

### 2.3 附件

附件字节由 DSH Attachment Store 持久化，Session 保存不可变引用、类型和必要元数据。Session 引用是权威关系，Attachment Store 是该引用的专用内容存储，不构成第二份对话记录。

## 3. 存储位置

实际路径必须从 Electron `app.getPath('userData')` 和 DSH path service 推导，不能依赖进程 cwd。逻辑布局：

```text
<userData>/
  sessions/                DSH JSONL/Zstd generations
  session-search.db        DSH SQLite 派生索引
  attachments/             DSH 附件内容
  settings/                DSH 设置与凭据引用
```

实现应沿用 DSH 项目/会话目录编码，确保 cwd 可读、sessionId 单路径段安全且无碰撞。文件名和具体目录可以沿上游变化，但三类存储不得混在同一个数据库文件。

## 4. 物理格式

V1 默认使用 DSH `session-persistence-jsonl` 的 Zstandard 模式：

- 每个会话一个目录。
- 每个格式 generation 一个不可变历史文件。
- 当前 generation 首 frame 为 header。
- 后续每个 durable append batch 为独立、有 checksum 的 Zstd frame。
- `compression='none'` 仅用于诊断或新建专用 root，不在同一 root 混用。

已发布旧 generation 不原位重写。迁移创建更高版本 successor，来源保持字节不变。

## 5. 核心不变量

### INV-S01 单一身份

活动 Agent 的 `agent.id` 必须等于 `agent.session.id`。UI route、approval、tool call 和 runtime event 都必须携带同一 sessionId。

### INV-S02 单写者

同一 session 在一个 backend 实例、一个进程和跨进程层面最多一个 write handle。竞争者必须收到 `SESSION_WRITE_CONFLICT`。

### INV-S03 只追加

已提交 event 不原位修改、不删除、不复用 seq。需要纠正时追加新事件或通过受支持的 generation migration。

### INV-S04 连续序列

逻辑 event seq 连续且单调。Client 发现 seq 缺口时重载 snapshot，禁止自行插入占位事件填缝。

### INV-S05 边界平衡

稳定会话前缀中的 turn/step 必须满足嵌套顺序：

- turn/start 后才能 step/start。
- 同时最多一个开放 step。
- step/end 必须对应当前开放 step。
- turn/end 前无开放 step。
- 新 turn 前上一个 turn 已结束。

物理有效但最后一个 turn 中断时，由恢复流程追加 synthetic closer 后再发布。

### INV-S06 工具配对

每个 `tool/result` 必须引用同 step 中唯一 `tool/call` 的 seq；每个已完成 step 中的 `tool/call` 最终必须有一个 result。

### INV-S07 assistant 唯一提交

一次模型 attempt 最多形成一个 durable `assistant/message`；失败或中断且无可提交消息时形成 `assistant/attempt`。同 attempt 不允许两者都追加为完成结果。

### INV-S08 Inbox 权威

尚未接纳的输入只由 `agent/inbox/spliced` 投影决定。Pi queue 和 UI optimistic item 不得恢复成新输入。

### INV-S09 配置可解释

每个模型 step 的 request header/context 必须能够说明 provider、model、工具 surface 和 request series。配置中途变化只从下一个 step 生效。

### INV-S10 派生层不反写

SQLite、Pi state 和 UI snapshot 绝不生成或覆盖 DSH Session event。它们只能读 Session 或消费 live notification。

### INV-S11 完成屏障

UI 显示“完成”、Agent 进入 idle 或 Host 返回成功之前，该阶段要求的 Session append 必须已在 DSH Session 内提交，并完成对应的 `flush()` durability barrier。Session append 或 flush 失败时运行必须失败。

### INV-S12 错误不伪装成功

corruption、迁移拒绝、写入失败、事件顺序违规和 tool outcome unknown 都必须可见。禁止丢弃错误事件后将 turn 标为 completed。

## 6. Session 写入路径

正常路径的逻辑顺序：

1. 用户命令以唯一 messageId 追加 Inbox splice。
2. Agent driver 打开 turn，追加 `turn/start`。
3. pre-step 接纳消息后追加 `step/start`。
4. 追加 system 更新和被接纳的 `user/message`。
5. 追加/更新 request header/context。
6. 模型流以 runtime frame 提供 UI；完成后追加一个 `assistant/message` 或 `assistant/attempt`。
7. 对每个工具先追加 `tool/call`，再进入 DSH Tools pipeline。
8. 结果按 assistant 源顺序追加 `tool/result`。
9. 追加 `step/end`。
10. 无更多工具或 steering 时追加 `turn/end`。
11. 完成 turn durability barrier 后才对外报告完成或 idle。

DSH `Session.append()` 是逻辑提交点：它同步验证事件、分配 seq、更新投影并通知持久化路径。它本身不等于通用 persistence 的抗崩溃保证。AgentHandle 关闭前必须 drain/close write handle，规定的外部承诺点必须显式 `flush()`。

## 7. 运行中状态与 durable 收敛

### 7.1 Assistant 流

Host 为每个流 frame 生成：

- `sessionId`
- `runId`
- 单调 `revision`
- Pi attempt/tool 相关标识

前端只在内存中展示。最终 `assistant/message` 带 DSH seq 到达后，前端用 durable 投影替换该 frame。

如果流中断：

- 有可用 content 时，按 DSH 规则提交 interrupted assistant message。
- 没有可用 content 时，提交 assistant attempt。
- 旧 runtime frame 在状态收敛或重连时丢弃。

### 7.2 Tool progress

progress 只用于当前执行 UI。最终 tool/result 是唯一恢复来源。重新打开会话不重放 progress 动画。

### 7.3 Approval

等待审批是运行态，但审批决定必须通过 DSH 工具策略与对应 callId 关联。应用退出时未决审批不会转移到新 call；恢复后该工具结果按中断规则收敛为 outcome unknown 或 aborted。

## 8. 持久化提交与 fsync

沿用 DSH backend 语义：

- 新 Session 在第一次 append 或显式 flush 前可以不物化。
- 第一次物化使用 no-overwrite publish，避免同 ID 覆盖。
- `append()` 成功表示批次被接受、排序并对同 backend 后续读可见，但 backend 可以缓冲物理写入。
- 只有 `flush()` 成功才承诺此前所有 acknowledged append 抗崩溃。
- 物理写入或 fsync 失败不得把失败批次伪装为 durable。
- committed event 永不重写。
- handle close 必须等待缓冲事件写入和 fsync。

V1 不另加一套 WAL，而是固定使用 DSH persistence flush seam。必须执行三个 durability barrier：

1. **消息确认屏障**：Host 向 Client 返回用户消息“已接纳”前，flush Inbox splice。
2. **副作用前屏障**：每个 `tool/call` 追加后、工具 body 开始前 flush。这样即使工具产生外部副作用后崩溃，恢复也知道结果未知，而不会误判为未调用。
3. **Turn 完成屏障**：`turn/end` 追加后、Agent 进入 idle 或成功返回前 flush。

这些屏障优先于性能；后续只能在证明相同安全语义的前提下合并批次，不能删除。

## 9. 崩溃恢复算法

恢复必须按以下顺序：

1. 解析并验证 sessionId 的存储路径。
2. 选择数字最高的 canonical generation。
3. 获取 write ownership；失败则停止。
4. 扫描 header 和物理 frames。
5. 对 torn tail 执行物理恢复。
6. 将历史 generation 迁移为当前逻辑事件，但只在 write open 时发布 successor。
7. 对逻辑事件运行结构验证。
8. 计算开放 turn/step 和悬空 tool calls。
9. 追加 DSH synthetic closers。
10. 从修复后的事件创建 DSH Session/Projection。
11. 创建空的 Pi 运行态并从 DSH surface 投影上下文。
12. 发布 Session、Agent 和 UI snapshot。

恢复中任一步失败不得发布半配置 Agent。

## 10. 物理尾部处理

| 情况 | 处理 |
|---|---|
| raw JSONL 最后一行不完整 | 丢弃该不完整尾行，保留此前完整行 |
| 最终 Zstd frame 被截断 | 恢复 frame 中完整解码的 JSONL 记录；写 handle 首次追加前截断 torn bytes 并持久重写恢复记录 |
| 完整 frame checksum 失败 | `SESSION_CORRUPT`，拒绝打开 |
| 完整 frame 解压失败 | `SESSION_CORRUPT`，拒绝打开 |
| 完整 JSON 结构不符合格式 | `SESSION_CORRUPT` 或迁移拒绝，不能按普通 torn tail 截断 |
| 同 root 出现不匹配 compression | 拒绝，不能混合回退 |
| 存在不支持的未来 generation | `SESSION_MIGRATION_REFUSED`，保留原文件 |

“尽量打开”不能覆盖完整已提交 frame 的损坏，因为这会让用户误以为历史可靠。

## 11. 语义中断修复

### 11.1 请求尚未形成 durable assistant/tool call

追加必要的 assistant attempt、step/end 和 turn/end(aborted/error)。用户可以手工重试；系统不得伪造 assistant 内容。

### 11.2 Tool call 已记录，body 明确未开始

追加 `tool/result`，错误码 `TOOL_NOT_STARTED` 或上游等价码，说明安全重试可由下一轮模型决定。

### 11.3 Tool body 可能已开始，结果未记录

追加 `tool/result`：

```json
{
  "isError": true,
  "error": {
    "code": "TOOL_OUTCOME_UNKNOWN",
    "message": "The tool may have produced external effects before the session was interrupted. Verify state before retrying."
  }
}
```

必须遵守：

- 不自动重放。
- 模型下一轮收到该错误。
- UI 标记“结果未知”，而不是普通失败。
- 用户可以检查 diff、文件、命令输出或外部系统后再决定。

### 11.4 Tool result 已记录，step/end 缺失

只追加 step/end 和 turn/end 修复，不再次执行工具。

### 11.5 Assistant 完成但 turn/end 缺失

根据 assistant stop reason 和后续工具配对状态追加正确的 step/turn closer，不能一律标 completed。

## 12. 幂等和重复消息

### 12.1 User message

`(sessionId, messageId)` 是唯一身份。相同内容和相同 ID 的重试返回已接纳状态；相同 ID 不同内容返回 `PROTOCOL_INVALID_ENVELOPE`。

### 12.2 Tool call

`(sessionId, callId)` 在一个 request series 内唯一。相同 callId 再次到达 bridge 是内核不变量错误，不能重新执行。

### 12.3 Approval

`(sessionId, callId)` 只消费第一个决定。重复相同决定返回原结果；冲突决定返回 stale/conflict。

### 12.4 Client event

- Durable：按 `(sessionId, seq)` 去重。
- Runtime：按 `(sessionId, runId, revision)` 去重。

Client 不以消息文本、时间戳或数组位置判断重复。

## 13. 并行工具

Pi 可以并行执行工具，但 Session 事件保持模型源顺序：

1. 按 assistant content 中的 tool call 顺序分配 `sourceIndex`。
2. `tool/call` 按 sourceIndex 追加。
3. 执行结果可以乱序返回并更新 live UI。
4. durable tool/result 进入 `ToolCommitBuffer`。
5. 仅当从下一个 sourceIndex 开始连续就绪时批量提交。
6. step/end 前 buffer 必须为空。

这让重放、模型输入和 UI 在不同机器上保持确定性。

## 14. SQLite 派生索引

SQLite FTS 只保存从 DSH persisted/live Session 观察得到的搜索文档和 generation/cursor 状态。

要求：

- 使用独立数据库路径。
- 数据库带应用所有权标记；未知 user table 时拒绝占用。
- 每条索引记录可追溯到 sessionId、event seq 和 persistence revision。
- reconciliation 以 Session 为输入，不能以 SQLite 内容纠正 Session。
- 搜索禁用或索引打不开时，精确会话读取仍可工作。
- 游标包含 index generation；重建后旧游标失效而不是返回错误页。

### 14.1 重建触发

以下情况触发索引重建或新 generation：

- 数据库不存在。
- schema/version 不匹配且支持重建。
- 索引 corruption。
- persistence revision 与记录不一致。
- 用户显式选择“重建会话搜索索引”。

重建应先关闭索引 owner，将旧文件移动为带时间戳的单文件备份，再创建新索引。应用确认新索引可用前不自动删除备份。

### 14.2 重建期间 UI

- 会话列表和直接打开仍可用。
- 全文搜索显示“索引构建中”及进度。
- 搜索结果只在一个明确 generation 内分页。
- 重建失败显示错误，但不把会话标为丢失。

## 15. 前端投影和重连

重连流程：

1. Client 请求 `SessionViewSnapshot`。
2. Host 返回 `generation`、`throughSeq`、events 和 projections。
3. Client 原子替换 durable state。
4. Client 丢弃不匹配 sessionId/runId/generation 的 runtime frames。
5. Client 应用 `seq > throughSeq` 的增量。
6. 出现 gap、重复内容冲突或投影异常时再次请求 snapshot。

前端可以将 panel layout 等 UI 偏好写入 local storage，但以下内容禁止进入 local storage/IndexedDB：

- 完整 transcript。
- pending Inbox。
- approval truth。
- Goal/Plan truth。
- tool result truth。
- API key。

## 16. Compaction 与 surface replacement

Compaction 仍由 DSH 负责。其结果通过 DSH Session event 和 surface generation 表达。

Pi 必须：

- 在每个 step 前读取当前 surface。
- surface generation 改变时完全替换 Pi context，不将旧数组继续拼接。
- 保留 DSH request header/series 语义。
- 不运行 Pi Harness compaction。

Client 必须：

- durable 历史仍按 event log 可审计。
- 当前模型上下文和简化 UI 按 surface projection 展示。
- generation 变化时清理旧 transient frame。

## 17. Goal、Plan、Skill 与 MCP 的会话关系

- Goal/Plan 是 Session event，因此可恢复。
- Skill 源文件和 MCP server 配置不是 Session 正文；Session 记录的是由其产生的模型消息、工具调用和结果。
- 恢复时先恢复 Session，再装载当前 Agent scope 的 Skill/MCP。
- 如果历史中使用的 Skill/MCP 当前缺失，会话仍可打开；下一次调用显示 capability unavailable，不能删除历史 tool event。
- Tool schema 变化会开启新的 request series/header，不篡改旧 header。

## 18. Session 格式迁移

迁移要求：

- 只支持 DSH format catalog 中明确列出的相邻迁移链。
- read open 可以在内存中解码为当前逻辑格式，但不发布 successor。
- write open 迁移、验证、重新检查源 revision 后，以 no-overwrite 方式发布 successor。
- 源文件 drift 时拒绝发布并重新准备。
- 迁移后旧 generation 保留。
- 不支持降级写回。
- compression 变更使用新 root，不在迁移中混做。

Local-Harness-pi 新增的 kernel 事件不得进入 Session format；只允许追加 DSH 已声明或经过正式 schema 版本化的新事件。

## 19. 备份、导出与人工恢复

V1 最低要求：

- 应用可以显示 Session 权威文件的只读位置。
- 诊断导出默认只包含 header、event type/seq、错误码和版本，不包含正文和密钥。
- 用户选择完整导出时明确告知可能包含代码、prompt 和工具输出。
- 恢复操作不覆盖原 generation；先创建副本或 successor。

V1 不实现云同步。将用户数据同步到云端必须另立威胁模型和冲突协议。

## 20. 故障矩阵

| 故障点 | 已知 durable 状态 | 恢复行为 | 自动重放 |
|---|---|---|---:|
| 用户点击发送后 Host 退出 | 可能只有 Inbox splice | 恢复 pending Inbox 或已接纳 user message | 否，由 Agent 正常领取 |
| provider 请求前退出 | step/user 已提交，无 assistant | 追加 attempt/closer，可提示重试 | 否 |
| provider 流中退出 | partial runtime；可能 embedded stream prefix | 提交 interrupted message/attempt 和 closer | 否 |
| tool/call 前退出 | assistant 含调用，无 call event | 按 DSH 修复为未开始 | 否 |
| tool body 中退出 | tool/call，无 result | `TOOL_OUTCOME_UNKNOWN` | 严禁 |
| tool/result 后退出 | call/result 已配对 | 追加 step/turn closer | 否 |
| persistence append 失败 | 内存可能有未落盘 event | 运行失败并停止；只恢复已 fsync prefix | 否 |
| SQLite 失败 | Session 正常 | 禁用搜索或重建 | 不适用 |
| renderer 崩溃 | Host/Session 正常 | snapshot + 增量重连 | 不适用 |
| Host 崩溃 | 仅物理 committed prefix | 完整恢复算法 | 仅用户明确重试 |

## 21. 完整性检查

每次恢复至少验证：

- Header/sessionId/path 一致。
- format version 与文件名一致。
- seq 连续。
- event lossless JSON。
- turn/step 平衡或仅最后尾部可修复。
- tool call/result 配对和 sourceEventSeqs。
- messageId/callId 在所需作用域唯一。
- request header 可重建。
- compaction/surface generation 单调。
- persisted revision 与打开时观察一致。

运行中 debug/test 构建还应持续验证 Agent id、Session id、开放 position、Pi event state 和 commit buffer。

## 22. 必须执行的恢复测试

### 22.1 进程级测试

每个场景使用子进程执行到指定 fault injection point 后强制终止，再由新进程恢复：

1. header 首次物化期间。
2. raw line 中间。
3. Zstd final frame 中间。
4. assistant text delta 中间。
5. assistant 完成、commit 前。
6. tool/call commit 后、tool body 前。
7. tool body 已产生外部文件后、result 前。
8. tool/result 后、step/end 前。
9. step/end 后、turn/end 前。
10. close/flush 期间。

### 22.2 并发测试

- 两进程同时 resume 同一 session，只有一个成功。
- live writer 持有时搜索索引可观察 committed prefix，不获得写权。
- 配置更新与模型请求竞争时，当前 step 使用冻结快照。
- 并行工具以反向完成顺序结束，Session 仍按源顺序。

### 22.3 属性测试

对合法 event 序列随机插入单点中断，验证恢复结果始终是原 committed prefix 加允许的 synthetic closers，不产生重复原事件。

## 23. 发布门禁

以下任一现象阻断发布：

- 出现 Pi session 文件或第二个会话数据库。
- UI 重启后依赖 local storage 才能看到完整消息。
- tool outcome unknown 被自动重试。
- SQLite 损坏导致权威会话打不开。
- 同 session 两个 writer 均成功。
- transient 和 durable assistant 同时显示为两条消息。
- Session append 失败后工具仍继续执行。
- 完整 checksum corruption 被静默截断。

## 24. 运维诊断

诊断页面应报告但不暴露正文：

- Session id、安全缩写路径和当前 generation。
- persistence format/compression/revision。
- 是否有 write owner。
- event count、last seq、last closed turn/step。
- SQLite index generation 和 last reconciliation revision。
- 当前 Kernel id/version，仅作运行信息。
- 最近一个稳定错误码。

这些信息足以判断“权威日志、派生索引、运行缓存”哪一层异常，而无需比较两份聊天记录。
