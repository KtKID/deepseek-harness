# Plugin Analyzer 搜索与 v0.2

[English](README.md) | 中文

> 创建时间：2026-08-20 00:17:32 +0800
> 类型：x-qdev
> 风险等级：Q1
> 审查路线：主 agent 证据闭环

## 用户原始请求

为 Plugin Analyzer 增加搜索，并将版本升级到 v0.2。

## 目标与边界

- 目标：Plugin Analyzer 设置标签页提供“搜索插件”输入框，按显示名、完整模块名或 Loader 条目 ID 即时过滤当前快照中的插件。
- 目标：Host、Client 与安装组合包使用一致的 `0.2.0` 版本。
- 范围外：Host 采集、Remote 数据、诊断规则、列表排序、插件运行状态和 Web profile 组合保持不变。
- 允许改动：Plugin Analyzer Client 的组件、样式、本地化、测试和包文档；真实 Web 设置 e2e 与快照；三个发布包的 manifest；归属 Agent Note；本任务文档。
- 保护区域：现有未提交的 Plugin Doctor bundle、生成目录、运行中的 Web 服务和 `vendor/`。

## 现状理解

- `PluginAnalyzerSettingsTab` 首次挂载或刷新时读取一次 `pluginAnalyzer/snapshot`，`diagnose()` 按 Host 快照顺序产生展示行。
- 展示行已有 `displayName`、`moduleName` 与 `entryId`，搜索可以完全在 Client 本地派生，无需扩展 Remote 或 Host API。
- 展开的详情由 `entryId` 标识；过滤后隐藏该行时应同步收起，避免保留不可见选择状态。
- 三个配套发布包当前均为 `0.1.0-rc.5`，组合包通过 `workspace:^` 依赖 Host 与 Client。
- 工作树基线包含用户已有的 Plugin Doctor bundle 与生成文档等改动；本任务保留这些语义组。

## 不变量

- Host 快照和 Remote 调用次数由现有组件生命周期拥有；输入搜索词不会触发 Remote 请求。验证：组件测试断言 mock 调用次数不变。
- 顶部汇总继续描述完整快照，搜索只过滤列表。验证：搜索后汇总计数保持原值。
- 空查询保留 Host 返回顺序；有查询时保留匹配行的相对顺序。验证：组件测试检查过滤结果。
- 三个发布包版本始终一致。验证：manifest 版本检查。

## 开发清单

| 状态 | 项目 | 完成定义 | 先失败的测试 |
|---|---|---|---|
| ✅ | 搜索交互 | 输入框符合截图语义；大小写不敏感并忽略首尾空格；匹配三种标识；无匹配时显示专用空状态；过滤隐藏已展开行时收起 | 首次组件测试找不到 `Search plugins` 搜索框；最终定向包测试通过 21 项 |
| ✅ | v0.2 发布版本 | Host、Client、bundle manifest 均为 `0.2.0`，Client README 与归属 Agent Note 描述已交付搜索行为 | 首次 manifest 断言输出三项 `0.1.0-rc.5`；最终断言输出三项 `0.2.0` |

## 完成定义与证据

| 完成定义 | 证据计划 | 最终证据 |
|---|---|---|
| 搜索交互 | 定向组件测试先红后绿；GUI 测试覆盖 Client 变更 | 定向包测试通过 21 项；Client 与 Host GUI 范围通过 3,777 项，跳过 1 项 |
| v0.2 发布版本 | 先运行 manifest 断言并观察旧值，再升级并复验；同步双语文档配对 | 三个 manifest 均为 `0.2.0`；双语配对与 `doc-sync` 通过 |
| 可见 UI 组装 | 运行 keyless Web replay 测试 | 快照刷新与回放各通过 8 项测试 |
| 变更边界 | 检查任务路径 diff、`git diff --check` 和 `vendor/` 未改动 | 已审阅任务 diff；`git diff --check` 通过；`git diff --name-only -- vendor/` 输出为空 |

## 风险判断

变更集中在一个已有 Client 设置标签页和三个配套 manifest，现有组件测试与 Web replay 可以覆盖用户可见路径。搜索只派生当前快照，不引入 API、持久化、权限、并发或跨模块状态变更，因此保持 Q1。
