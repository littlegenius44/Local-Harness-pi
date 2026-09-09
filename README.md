# Local-Harness-pi

`Local-Harness-pi` 是一个以 DeepSeek Harness（DSH）为产品平台、以 Pi 为执行内核的本地优先桌面 Coding Agent。

项目已确认的架构定义是：

> **DSH 产品平台 + Pi 执行内核 + 单一 DSH 会话事实源。**

当前仓库只包含已确认的 V1 设计与契约，不包含实现代码。后续代码执行者应先阅读下列文档，并按文档中的来源基线重新核对上游源码后再编写实施计划。

## 文档入口

- [总体架构设计](docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md)
- [V1 需求规格](docs/requirements/v1-requirements.md)
- [接口契约](docs/architecture/interface-contracts.md)
- [会话一致性与恢复](docs/architecture/session-consistency.md)

## 当前状态

- 架构方向：已确认
- V1/V1.1 范围：已确认
- 需求与接口文档：待项目所有者审阅
- 实施计划与代码：尚未开始

## 上游来源基线

| 项目 | 用途 | 固定版本 |
|---|---|---|
| `deepseek-ai/deepseek-harness` | 产品平台和唯一会话事实源 | `b2e3b2a0125854567a4a5fcba75782e42fe84901` |
| `earendil-works/pi` | 执行内核 | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` / `0.85.1` |
| `openai/codex` | 交互、安全与工具入口参考，不作为运行时依赖 | `73a1148c9c775c2a4616ce5096291740a00ed68a` |

以上固定版本用于保证设计可复现。实施者不得在未记录兼容性差异的情况下静默升级上游版本。
