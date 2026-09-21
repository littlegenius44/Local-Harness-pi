# Local-Harness-pi Desktop

[English](README.md) | 中文

## 概述

Electron 应用显示带有 Local-Harness-pi 品牌的 DSH Web UI，并将桌面数据保存在独立应用目录中。当前 PR-A 工作建立 DSH 基线、产品身份、离线许可声明和桌面隔离。Pi 内核接入属于 PR-B，本阶段尚不可用。

## 目录

- [数据归属](#data-ownership)
- [开发与打包](#development-and-packaging)
- [运行时与安全](#runtime-and-security)
- [已知限制](#known-limitations)

-----
<a id="data-ownership"></a>
## 数据归属

桌面 Host 的 `DSH_HOME` 由 Electron 指定为 `join(app.getPath('userData'), 'harness')`。继承自 shell 的 `DSH_HOME` 不会决定桌面数据根目录。因此，会话、设置、凭据和工作区状态使用桌面应用目录，而不是 CLI 的默认 home。[main.ts](src/main.ts) 与 [host-process.ts](src/host-process.ts) 管理这一选择及子进程环境。

在该 home 下，Electron 管理 `profiles/desktop`、桌面 pnpm store、staging 目录、激活日志和回滚 profile。它在访问 profile 前获取单实例锁。包变更先安装到 staging，再执行后端健康检查，然后激活；[project-manager.ts](src/project-manager.ts) 管理中断后的恢复。

开发模式使用 `apps/desktop/.desktop-build/development/electron-user-data/harness` 保存 Harness 状态，使用 `apps/desktop/.desktop-build/development/project` 保存一次性 npm 项目。浏览器数据保存在上一级 `electron-user-data` 目录。[dev.ts](scripts/dev.ts) 定义这些路径。

-----
<a id="development-and-packaging"></a>
## 开发与打包

根目录的 [package manifest](../../package.json) 定义了用于构建并启动工作区的 `dev:desktop`、启动已有构建的 `start:desktop`，以及 Windows x64 打包流程 `package:desktop:win:x64`。这些是开发入口；本参考文档不证明已安装应用通过验收。发布负责人必须在分发安装包前记录成功构建、首次启动和离线重启的结果。

Windows Alpha 打包不签名，采用手动安装。默认应用 ID 是 `io.localharness.pi`，产物名称使用 `Local-Harness-pi`。打包配置不设置 Windows 更新发布方，完成记录标记 `installation: manual` 与 `signed: false`。打包子进程环境会移除 Windows 签名字段和上传凭据。详见 [builder 配置](electron-builder.config.mjs) 与 [目标打包](scripts/package-target.ts)。

继承的 macOS 签名与公证脚本不属于 Windows V1 验收范围。它们不能证明 Local-Harness-pi 已支持 macOS 发布，也不代表获准使用上游更新地址。

-----
<a id="runtime-and-security"></a>
## 运行时与安全

<details>
<summary>实现细节 — 点击展开</summary>

打包后的桌面壳使用内置上游 Node.js 子进程与内置 pnpm。离线 seed 包含版本匹配的第一方包和依赖 store。应用通过 `dsh-app://` 与分帧字节管道传递客户端请求，通过 Node IPC 传递生命周期控制。产品传输不监听 Web 端口；开发调试端口与此传输分开。

主渲染器接收协议标记，管理渲染器接收受限的插件与更新操作。[窗口选项](src/window-options.ts)、发送方检查及 [main.ts](src/main.ts) 中的导航限制定义 Electron 约束。DSH 协议、npm scope 和 preload 标识保留为兼容标识。

seed store 合并时不对内容目录使用 JavaScript 文件过滤函数，并单独合并各版本的 SQLite 包索引。已有插件记录得到保留；已验证的 seed 记录和文件覆盖匹配项。[seed-store.ts](src/seed-store.ts) 负责该操作。

更新器要求应用已打包且存在 `app-update.yml`。Windows Alpha 不配置该更新渠道。[update-coordinator.ts](src/update-coordinator.ts) 管理这一条件；签名自动更新不属于 V1。

关于信息与打包的 `THIRD_PARTY_NOTICES.txt` 标明 DSH 和 Pi 来源，并声明 Local-Harness-pi 不是 OpenAI 或 DeepSeek 官方产品。Codex 仅作为设计参考。[产品身份](../../packages/util/product-identity/README.zh.md) 与 [上游来源](../../UPSTREAM.md) 管理来源数据。

</details>

-----
<a id="known-limitations"></a>
## 已知限制

- PR-A 源码变更不代表全部 V1 桌面验收检查已经通过；请按照 PR-A 计划 (`docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md`) 验收。
- Pi 执行、经 Pi 桥接的会话对账与完整 V1 产品闭环仍属于独立的 PR-B 和 PR-C 工作。
- 桌面插件生命周期脚本需要桌面项目中经过审查的 `allowBuilds` 策略许可。

### 开发备注

本页描述源码归属与发布约束。安装包验收仍由发布负责人负责。
