# Agent Note: Local-Harness-pi 基线与桌面隔离

Status: proposed

[English](2026-09-12-local-harness-pi-baseline-and-isolation.md) | 中文

## 问题

已批准的产品组合是 DSH 平台、Pi 执行内核和唯一 DSH 持久会话。仅导入平台并不能交付这一组合。在内核开发与桌面分发前，必须明确产品品牌、数据归属和发布来源。

## 提案

按照已批准的 PR-A 计划 (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`) 执行，再开展 Pi 桥接和产品闭环工作。保留 DSH 内部 npm scope、插件 ID 和协议标识；调整产品可见身份，并将桌面 Harness 数据置于 Electron `userData/harness` 下。Windows Alpha 使用未签名手动安装。

## 固定基线与当前状态

[source-lock.json](../../../../docs/upstream/source-lock.json) 记录 DSH `b2e3b2a0125854567a4a5fcba75782e42fe84901`、Pi `acaa253cc8e3f159e6100b6f3874861b1f0bfc99` 及包版本 `0.85.1`，以及 Codex `73a1148c9c775c2a4616ce5096291740a00ed68a`。Codex 仅用于设计参考，不重新分发其源码。

PR-A 已有导入基线、身份、许可声明和桌面隔离的源码变更。由于 Draft PR 与人工交接仍待完成，状态保持 proposed。这些变更尚未实现 Pi 内核接入。声明 Pi 依赖或在关于界面显示版本不能证明 Pi 内核已启用。

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

## 验证断点：2026-09-25

正式构建产出 265 个 DSH 包，以及私有桌面 Host、vendor 依赖和原生入口包。重建 seed 通过离线安装；其中 agent-loop 压缩包与最新打包结果逐字节一致，包含受保护的 machine 构造入口。锁文件冻结安装、来源检查、仓库类型检查、Host 构建后的完整 lint 和桌面编译均通过。桌面测试 96/96、machine seam 测试 8/8、文档网站测试 69/69、设计与路径门禁测试 8/8 通过。完整文档检查 34/34 通过，包含全部快速文档检查。

Windows 未签名 NSIS 安装包为 193,520,733 字节，SHA-256 为 `D84D956207A7497C7EA7A68F78BB0FE176601C33FD4C7FE7AAB20BE68E7FF877`，签名状态为 NotSigned。它成功安装到独立测试目录，启动至欢迎页/API Key 配置页，并以退出码 0 卸载，独立测试数据仍保留。使用该数据重新安装后，58,780 ms 到达配置页，随后再次成功卸载。安装包构建于 9 月 23 日；后续验收改动涉及文档、测试、门禁和生成的 slot 元数据。这是基线预览，不是最终 V1 发行版。

全新数据首次启动耗时分别为：目录包 494,547 ms、安装后应用 434,390 ms。验证了产品名称、sandbox、上下文隔离、禁用 Node integration 和 web security。未输入凭据或发送模型请求。这些是启动观测，不代表性能验收通过；对比性能门禁属于 PR-C。本机长路径环境仍使用外部短路径 staging 方案打包，尚非经过认证的干净机器打包流程。

四份缺失的设计/计划双语配对及中文入口链接已补齐。生成的事件、配置和 slot 目录与当前源码一致。Draft PR 与人工审阅仍是交接边界；此断点不激活 Pi，也不授权 PR-B、合并或公开发布。

## 回退边界

PR-A 不修改持久化 Session schema。源码回退必须保留独立 Electron 用户数据目录及其 profile 备份；不得让上游 CLI 使用桌面数据根目录，或让两个 writer 同时访问它。继承的 project manager 继续拥有 staging 激活与回退。回退源码不代表允许删除用户工作区，也不能把未经测试的旧二进制视为兼容较新 profile。

## 设计文档检查

已批准的 Local-Harness 计划与接口规格包含待实施 API 和代码片段，并非当前包的可运行示例。文档类型门禁对其 `ts design` 代码块检查语法并单独报告；只有五份明确列出的设计文档允许使用该标记。普通 `ts` 示例继续完整编译，现有未检查代码块的比例上限不变。省略的语法容器予以补全，不引入虚假的 API 实现。PR-B/PR-C 仍须对实际实现执行类型检查和契约测试。

包路径门禁只把实施计划中明确声明的精确 `Create` 目标视为该文件内的待创建路径；修改路径、未声明引用、通配符、越界路径和当前包文档仍执行正常的存在性检查。外部 Pi 路径明确标示上游目录。生成目录从源码刷新；Windows 文档图片越界测试使用带显式 unlink 清理的目录 junction，使相同的 realpath 边界断言无需文件符号链接权限。
