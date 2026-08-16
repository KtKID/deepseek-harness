# Plugin Doctor MVP

[English](README.md) | 中文

## 用户原始需求

> 你开始实现这个插件，注意插件都是独立目录，不要污染整个框架

## 目标与边界

新增独立的 `@deepseek-ai/dsh-client-ui-settings-plugin-doctor` 浏览器插件。它复用 `pluginInventory/list` 获取当前 Loader 快照，只诊断已启用插件，并在现有“插件”设置分区展示运行状态、汇总、失败和手动刷新流程。

实现主体、测试、样式、字典、README 和 invariant 全部归属 `packages/client/ui-settings-plugin-doctor/`。共享装配面只新增 `tsconfig.client.json` 项目引用、`packages/bundle/web-app/package.json` 依赖和 `packages/bundle/web-app/cordis.patch.yml` Loader 条目。现有 Cordis、Host inventory、API remotes、插件列表和设置分区逻辑保持原样。

## 现状理解

- Host 的 `pluginInventory/list` 已通过 `ctx.loader.entries()` 返回 `entryId`、`moduleName`、`enabled` 和根 Fiber `fiberPhase`。
- `settings.plugins.tab` 已允许独立浏览器插件注册页面，并通过 `ctx.slots.inject()` 跟随声明方重载和自身卸载。
- `fiberPhase` 的现有取值为 `pending | loading | active | failed | unloading | null`，足够形成 MVP 状态。

## 不变量

- 诊断只包含 `enabled === true` 的 Loader 条目。
- 状态映射固定为：`active → running`、`pending → pending`、`loading → starting`、`failed → failed`、`unloading → stopping`、`null → not-mounted`。
- `entryId` 保持行身份；显示名称只由 `moduleName` 派生。
- 远程错误只展示通用产品文案；传输细节不进入界面。
- 插件卸载后，其字典和 `settings.plugins.tab` 贡献均被清理。

## 实现路径

1. 用纯函数 `diagnose(snapshot)` 完成过滤、状态映射和汇总。
2. 组件在首次挂载和用户点击刷新时调用注入的 `list()`，随后渲染摘要与已启用插件行。
3. 浏览器入口注册 `doctor` 标签页并复用 `ctx.remote.pluginInventory.list()`。
4. 通过 Web bundle 的声明面装配独立包，并补齐包级文档、invariant 和产品快照。

## 测试

- 纯函数测试覆盖全部六种 Fiber phase、停用条目过滤、顺序／身份和汇总。
- 组件测试覆盖加载、成功、空列表、通用失败、重试／刷新和卸载后的异步结果。
- 浏览器插件测试覆盖 slot 注册／释放、本地化、懒 Remote 读取和声明方重载。
- Web 组合测试和 keyless 浏览器快照覆盖真实 Loader → Remote → Plugin Doctor 展示流程。

## 风险

Q1。实现遵循已有 inventory tab 模式，新增一个包和三个声明式运行时装配点；不新增协议、Host 服务、Cordis hook 或持久化格式。

## Definition of Done

- [x] DoD 1：独立包骨架、bundle 装配和包级 invariant 完整，现有实现文件保持独立。
- [x] DoD 2：`diagnose(snapshot)` 只输出已启用插件，六种状态映射和 enabled/running/non-running 汇总均有测试。
- [x] DoD 3：Doctor 标签页完成懒取数、处理、展示、通用失败、手动刷新和卸载清理，组件与 slot 生命周期测试通过。
- [x] DoD 4：README 双语、Client 目录索引、implemented Agent Note、真实 Web 组合、浏览器快照和相关质量门同步完成。

## 执行清单

- [x] 记录实现前 `git status --short --untracked-files=all` 与 `git diff --name-only`。
- [x] 先提交聚焦测试并记录预期红灯。
- [x] 实现独立插件包。
- [x] 只修改三个共享运行时装配声明。
- [x] 运行聚焦测试、GUI 测试、Web replay、类型检查、lint、文档门和 diff 检查。
- [x] 编写 `dev-report.md`，记录每项 DoD 的证据与剩余风险。
