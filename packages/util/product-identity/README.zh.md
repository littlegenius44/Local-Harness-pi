---
description: "在 Host 管理的产品界面中显示 Local-Harness-pi 身份与离线许可声明。"
kind: "package-library"
---
# @local-harness/product-identity

[English](README.md) | 中文

## 概述

Host 调用方可以在离线情况下显示产品名称、发布版本、上游来源和第三方许可声明。桌面关于信息和 Host 管理的产品响应使用这些共享值。此私有库不会激活插件或修改会话。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----
<a id="use-this-package"></a>
## 使用此包

需要呈现身份或许可声明的 Host 代码使用 [src/index.ts](src/index.ts) 中的导出。`productIdentity` 包含固定元数据，`thirdPartyNotices` 包含 UTF-8 许可文本。此包没有挂载配置，也没有独立安装流程。

-----
<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

模块导出不可变元数据与静态许可文本，不依赖运行时外部包。[上游来源](../../../UPSTREAM.md) 定义来源策略。此库不存在需要核对的独立变化状态或观测值，因此无需运行时 invariant 配套模块。

</details>

-----
<a id="model-experience"></a>
## 模型体验

无，因为此库仅提供 Host 管理的身份和许可文本。

#### KV Cache 影响

此包不构造模型输入，也不改变提示词缓存前缀。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- 导出的 Pi 版本是来源元数据，不能证明 Pi 内核已经接入。
- 这些值是发布常量，不是对已安装依赖的运行时扫描结果。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

无。

</details>
