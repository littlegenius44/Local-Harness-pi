# Agent Note: Local-Harness-pi 基线与桌面隔离

Status: proposed

[English](2026-09-12-local-harness-pi-baseline-and-isolation.md) | 中文

## 问题

已批准的产品组合是 DSH 平台、Pi 执行内核和唯一 DSH 持久会话。仅导入平台并不能交付这一组合。在内核开发与桌面分发前，必须明确产品品牌、数据归属和发布来源。

## 提案

按照已批准的 PR-A 计划 (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`) 执行，再开展 Pi 桥接和产品闭环工作。保留 DSH 内部 npm scope、插件 ID 和协议标识；调整产品可见身份，并将桌面 Harness 数据置于 Electron `userData/harness` 下。Windows Alpha 使用未签名手动安装。

## 固定基线与当前状态

[source-lock.json](../../../../docs/upstream/source-lock.json) 记录 DSH `b2e3b2a0125854567a4a5fcba75782e42fe84901`、Pi `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` 及包版本 `0.85.1`，以及 Codex `73a1148c9c775c2a4616ce5096291740a00ed68a`。Codex 仅用于设计参考，不重新分发其源码。

PR-A 已有导入基线、身份、许可声明和桌面隔离的源码变更。由于本记录尚未包含完整 PR-A 验收和安装产物验证，状态保持 proposed。这些变更尚未实现 Pi 内核接入。声明 Pi 依赖或在关于界面显示版本不能证明 Pi 内核已启用。

继承的 [Electron 打包记录](../../implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md) 仍保留 DSH 基线的 seed 与进程设计依据。本提案仅改变派生产品的数据归属与 Windows 发布策略，不取代完整上游机制，也不授权使用上游发布基础设施。

## 构造与启动约束

[machine 整改计划](../../../../docs/superpowers/plans/2026-09-18-agent-machine-seam-rectification.zh.md) 要求 DSH 父类工厂保留写权限、恢复、发布与销毁的所有权。protected 构造 hook 默认创建 `ReactLoopAgent`；注入的 machine 暴露相同的 Agent 契约与真实 Scope。这不代表 Pi 已启用。

桌面 seed 内容复制通过单独枚举各版本根目录，将 SQLite 索引排除在批量复制之外。内容目录使用无过滤函数的递归复制；内容复制后再合并索引，保留已安装插件的记录。内容与索引的所有权不变。启动性能改善必须由产物启动证据确认；仅复制测试通过不足以验收安装包。

## 已考虑的替代方案

**重命名全部 DSH 标识。** 已批准计划保留内部兼容标识，因为大范围重命名会引入无关工作，而不会改善产品隔离。

**第二套 Pi 持久会话存储。** 已批准架构拒绝该方案，因为恢复与模型可见状态必须以 DSH 为唯一事实源。

## 验收标准

- 记录针对固定输入通过的来源及产品包检查。
- 通过 Host、Web 和桌面调用方验证产品身份与离线许可声明。
- 验证继承的 `DSH_HOME` 无法重定向桌面状态，并确认 sandbox、上下文隔离和导航限制仍得到执行。
- 在声称 PR-A 完成前构建并验收 Windows 产物，包括首次启动和重启；明确记录失败与未执行检查。

## 风险

未签名 Alpha 安装包可能触发操作系统信任提示。继承的 macOS 与上传脚本不代表派生产品已支持这些发布路径。产品身份与隔离数据目录不能证明 Pi 执行、Markdown 任务完成或完整 V1 验收结果。
