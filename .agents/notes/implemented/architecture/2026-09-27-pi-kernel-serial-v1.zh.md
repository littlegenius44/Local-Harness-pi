# Agent Note: Pi 内核串行 V1 边界

Status: implemented

[English](2026-09-27-pi-kernel-serial-v1.md) | 中文

## 问题

Local-Harness-pi 需要 Pi 的对话式工具循环，同时不能在 DSH 旁边建立第二个 agent 工厂、transcript 或恢复存储。实现必须能根据下列已审查源码固定版本复现：

- DeepSeek Harness：`b2e3b2a0125854567a4a5fcba75782e42fe84901`
- earendil-works/pi：`acaa253cc8e3f159e6100b6f3874861b1f0bfc99`（`pi-agent-core` 与 `pi-ai` `0.85.1`）
- openai/codex 设计参考：`73a1148c9c775c2a4616ce5096291740a00ed68a`

## 决策

base 与独立 `sdk-minimal` 组合仅激活一个 agent 工厂：`@local-harness/pi-agent-loop`。`PiAgentLoop` 继承 DSH `AgentLoop` 工厂，只替换其 machine 构造钩子。它不会实现第二个工厂，也不拥有会话创建、恢复、发布或资源释放。DSH agent-loop invariant 继续作为兼容性检查器启用，并不是第二个工厂。

machine 直接调用 Pi 的底层 `runAgentLoop()`。它不构造 Pi `Agent`，不使用 Pi Harness 的会话、skill 或压缩模块，也不创建 Pi 持久化存储。DSH Session 事件与投影是对话、队列、执行、压缩和恢复的唯一真源。每个步骤的提供方请求都根据当前 DSH Session 派生状态重新构建。

## 持久性证据

- 提示词确认：新的和幂等的 `session/prompt` 请求会在持久 inbox 变更后等待 `sessions.flush()`，然后才返回成功。
- 工具副作用之前：等待完成的 Pi `tool_execution_start` 桥先追加 `tool/call`；随后，现有会话检查点策略会在公开 `ctx.tools.execute()` 流水线内刷新该前缀，之后顶层工具正文才能运行。
- 轮次结算：`DshPiAgent` 追加 `turn/end` 并等待 `sessions.flush()`，然后才能回到外部可见的 idle 状态。

工具调用、错误、审批结果、展示元数据、附加上下文和 `concludesTurn` 均保留为 DSH 工具运行时结果。工具结果通过 `sourceEventSeqs` 引用其准确的 `tool/call` 序号。

模型流桥会为持久化的 assistant 尝试保留准确的 DSH chunk，其中包括 token 用量与结束原因。工具调用 JSON 会被解析供 Pi 执行，同时为 DSH `tool/call` 关系保留其准确的序列化形式。

## 考虑过的替代方案

**同时挂载 React 循环和 Pi 循环。** 否决该方案，因为两个实时 agent 工厂会争夺生命周期与 Session 所有权。

**使用 Pi Agent 或 Pi Harness 持久化。** 否决该方案，因为第二份 transcript 或恢复机制可能确认 DSH 尚未持久化的状态，并在崩溃后发生分歧。

**在 V1 启用 Pi 并行工具。** 否决该方案，因为并发完成时的持久调用/结果顺序与取消行为尚未定义。

## 后果

产品获得 Pi 的底层对话循环，同时保留 DSH 生命周期、工具策略、会话修复、压缩与崩溃恢复。代价是 Pi 工具执行被有意限制为串行。Pi 循环选项和每个 Pi 代理都使用串行执行，因此该 machine 有意忽略继承的 DSH `maxParallelToolCalls` 设置。`PARALLEL-110` 是计划中启用 Pi 并行工具执行的唯一途径；在改变此边界之前，它必须先定义持久化顺序。
