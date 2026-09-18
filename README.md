# Local-Harness-pi

`Local-Harness-pi` 是一个以 DeepSeek Harness（DSH）为产品平台、以 Pi 为执行内核的本地优先桌面 Coding Agent。

项目已确认的架构定义是：

> **DSH 产品平台 + Pi 对话式工具循环内核 + 单一 DSH 对话/执行恢复事实源。**

当前仓库只包含已确认的 V1 设计、契约和可执行实施计划，不包含实现代码。后续代码执行者应先阅读下列文档，并按文档中的来源基线重新核对上游源码后再执行计划。

## 文档入口

- [总体架构设计](docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.md)
- [V1 需求规格](docs/requirements/v1-requirements.md)
- [接口契约](docs/architecture/interface-contracts.md)
- [会话一致性与恢复](docs/architecture/session-consistency.md)

## 实施计划

- [V1 主计划与三个 Draft PR 检查点](docs/superpowers/plans/2026-09-10-local-harness-pi-v1-master.md)
- [Agent machine seam 架构整改与 PR-A/PR-B 纳入计划](docs/superpowers/plans/2026-09-18-agent-machine-seam-rectification.md)
- [PR-A：DSH 源码基线、桌面品牌与安全边界](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md)
- [PR-B：Pi Agent Core 内核桥与单一对话/执行恢复事实源](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-b-pi-kernel.md)
- [PR-C：OpenAI-compatible 配置与 V1 桌面产品闭环](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-c-product-loop.md)

## 当前状态

- 架构方向：已确认
- V1/V1.1 范围：已确认
- 需求与接口文档：已确认
- 实施计划：已完成
- 实现代码：尚未开始

## 上游来源基线

| 项目 | 用途 | 固定版本 |
|---|---|---|
| `deepseek-ai/deepseek-harness` | 产品平台和唯一对话/执行恢复事实源 | `b2e3b2a0125854567a4a5fcba75782e42fe84901` |
| `earendil-works/pi` | 对话式工具循环内核 | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` / `0.85.1` |
| `openai/codex` | 交互、安全与工具入口参考，不作为运行时依赖 | `73a1148c9c775c2a4616ce5096291740a00ed68a` |

以上固定版本用于保证设计可复现。实施者不得在未记录兼容性差异的情况下静默升级上游版本。
