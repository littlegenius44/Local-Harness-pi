---
description: "在 DSH 管理生命周期与会话权威的前提下，通过 Pi 低层串行循环运行智能体。"
kind: "package-reference"
---
# @local-harness/pi-agent-loop

[English](README.md) | 中文

## 概述

此私有 Host 包是 Local-Harness-pi 的可替换内核边界。它把不可变的 DSH 步骤快照映射到 Pi 低层循环，再把 Pi 的顺序事件翻译回 DSH 事实。DSH Session 始终是唯一恢复来源，V1 工具执行固定为串行。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

`KernelDriver` 及其事件词汇仅包含产品类型和 DSH 类型。Pi 特有的消息与流类型保留在包边界内部。每个步骤都从 DSH Session 派生的上下文重新构建提供方请求；Pi 内存转录永远不是提供方请求的权威来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`kernel-driver.ts` 管理稳定的产品边界。转换器把 DSH 事实映射为进程内 Pi 值，模型桥接器消费不可变的步骤快照。此包不新增持久化存储，也不拥有第二个 Session 写句柄。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### DSH 派生的会话请求

#### 模型看到的内容

提供方看到 DSH 为已接受步骤组装的系统提示词、`DSH Session` 派生消息和工具模式。Pi 内存转录不会作为另一份来源提供给模型。

#### Token 影响

此包不添加独立文本；其 token 影响就是当前步骤选定的 DSH 派生请求。

#### KV Cache 影响

此包保持 DSH 派生请求的顺序。系统提示词、工具快照、模型路由或会话表面代次发生变化时，下一步骤的提供方前缀可能改变。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- V1 工具采用串行执行；并行执行延期到 `PARALLEL-110`。
- 当前只实现 Pi 内核；为未来内核保留边界，但不会为尚不存在的实现暴露选择器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

不得在 `kernel-driver.ts` 中导入 Pi。恢复与提供方请求构建必须继续读取 DSH Session 状态。

</details>
