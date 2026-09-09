# Local-Harness-pi 执行约束

本文件适用于仓库内全部目录。

## 开始工作前

1. 完整阅读根目录 `README.md` 以及其中链接的总体设计、需求、接口和会话一致性文档。
2. 编写实施计划或代码前，重新阅读该工作项涉及的 DSH、Pi 和 Codex 上游源码；在计划或 PR 中记录 commit hash。
3. 当前正式架构是“DSH 产品平台 + Pi 执行内核 + 单一 DSH 会话事实源”。不得自行恢复双内核、自研微内核或第二套会话存储。
4. 没有经项目所有者审阅的实施计划时，不开始实现。

## 架构红线

- 不使用 Pi `AgentHarness`、Pi Session、Pi Skills、Pi Compaction 或 Pi built-in coding tools。
- 不让 UI、Session schema 或 DSH 公共 API 依赖 Pi 原始事件类型。
- 不绕过 DSH LLM、Tools、Approval、Workspace、Goal、Plan、Skills 或 MCP 服务。
- 不增加第二个 durable transcript、chat database 或前端持久会话副本。
- V1 不加入 Qwen Code 内核、公开 OpenAI 入站网关、Office 编辑、完整浏览器自动化或签名自动安装更新。

## 编辑与验证

- 所有代码和注释使用 UTF-8。
- 先编写或更新能失败的测试，再实现行为。
- 完成声明前运行与改动相称的 unit、contract、integration 和 desktop E2E 测试，并在 PR 中列出命令和结果。
- 保留用户已有修改；不要用 `git reset --hard` 或 `git checkout --` 覆盖工作区。
- 不允许一次删除多个文件。确需删除时逐个列出目标并先征得项目所有者同意。
- 不提交密钥、Authorization header、完整用户会话或测试生成的大文件。

## PR 边界

- 默认按总体设计的 PR-A、PR-B、PR-C 交付；PR-B 只有过大时才能拆为 B1/B2。
- 上游版本升级单独提交，不与功能变更混合。
- 任何触及架构红线、Session schema、持久化所有权或 V1/V1.1 边界的改动，先修改设计文档并取得项目所有者确认。
