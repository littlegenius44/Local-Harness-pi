# Local-Harness-pi

[English](README.md) | 中文

`Local-Harness-pi` 是一个以 DeepSeek Harness（DSH）为产品平台、以 Pi 为对话式工具循环内核的本地优先桌面 Coding Agent。

项目已确认的架构定义是：

> **DSH 产品平台 + Pi 对话式工具循环内核 + 单一 DSH 对话/执行恢复事实源。**

当前仓库已导入固定的 DSH 源码，并已通过继承的 DSH Agent 工厂接入串行 Pi 对话式工具循环内核。DSH Session 仍是唯一的对话与执行恢复事实源。当前代码仍处于 V1 验收阶段，不代表完整版本已交付。实施者应先阅读下列文档，并按来源基线核对上游源码后执行计划。

内部 `dsh` 包名、协议和事件名是上游兼容标识，不是第二个产品。来源和许可见 [UPSTREAM.md](UPSTREAM.md)，桌面开发说明见 [桌面 README](apps/desktop/README.zh.md)。

<a id="run"></a>
## 运行状态

当前面向开发验收，尚未发布可用的 V1 安装包。Markdown 读取集成测试覆盖中文文件名、公式、代码块、表格与分页；桌面到模型的完整流程仍待后续阶段验证。

<a id="run-from-source"></a>
## 从源码验证

本次构建使用 Node.js 24.17.0 和仓库固定的 pnpm 11.7.0。安装依赖后，`pnpm run build:official` 构建前后端，`pnpm run build:desktop` 编译桌面程序。Windows 开发版打包入口为 `pnpm run package:desktop:win:x64:dir`；已在本地独立目录完成基线安装包的首次启动、重启与卸载测试。命令、打包限制和冷启动耗时见[验收记录](.agents/notes/proposed/architecture/2026-09-12-local-harness-pi-baseline-and-isolation.zh.md)。

## 文档入口

- [总体架构设计](docs/superpowers/specs/2026-09-09-local-harness-pi-v1-design.zh.md)
- [V1 需求规格](docs/requirements/v1-requirements.zh.md)
- [接口契约](docs/architecture/interface-contracts.zh.md)
- [会话一致性与恢复](docs/architecture/session-consistency.zh.md)

## 实施计划

- [Agent machine 构造入口与 PR-A/PR-B 整改](docs/superpowers/plans/2026-09-18-agent-machine-seam-rectification.zh.md)

- [V1 主计划与三个 Draft PR 检查点](docs/superpowers/plans/2026-09-10-local-harness-pi-v1-master.zh.md)
- [PR-A：DSH 源码基线、桌面品牌与安全边界](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.zh.md)
- [PR-B：最简串行 Pi Agent Core 内核桥与单一对话/执行恢复事实源](docs/superpowers/plans/2026-09-27-local-harness-pi-pr-b-minimal-serial.zh.md)
- [PR-C：OpenAI-compatible 配置与 V1 桌面产品闭环](docs/superpowers/plans/2026-09-10-local-harness-pi-pr-c-product-loop.zh.md)

## 当前状态

- 架构方向：已确认
- V1/V1.1 范围：已确认
- 需求与接口文档：已确认
- 实施计划：已完成
- PR-A：源码已导入，基线构建、测试、文档和独立安装器测试通过；Draft PR 交接进行中
- PR-B：四阶段串行 Pi 内核桥已实现；完整验收证据见 [Pi 内核串行 V1 边界记录](.agents/notes/implemented/architecture/2026-09-27-pi-kernel-serial-v1.zh.md)
- PR-C：尚未开始

## 上游来源基线

| 项目 | 用途 | 固定版本 |
|---|---|---|
| `deepseek-ai/deepseek-harness` | 产品平台和唯一对话/执行恢复事实源 | `b2e3b2a0125854567a4a5fcba75782e42fe84901` |
| `earendil-works/pi` | 对话式工具循环内核 | `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` / `0.85.1` |
| `openai/codex` | 交互、安全与工具入口参考，不作为运行时依赖 | `73a1148c9c775c2a4616ce5096291740a00ed68a` |

以上固定版本用于保证设计可复现。实施者不得在未记录兼容性差异的情况下静默升级上游版本。
