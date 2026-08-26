# @deepseek-ai/dsh-client-ui-settings-plugin-analyzer

[English](README.md) | 中文

Web 设置中的只读**插件分析**标签页。这个独立 Client 插件挂载生成的 [`pluginAnalyzer`](../../host/plugin-analyzer/README.md) Remote 贡献，使用共享 [`api-remotes`](../../api/remotes/README.md) 服务，并向 `settings.plugins.tab` 贡献 `analyzer` 条目；它的 Node 入口不包含 Host 行为。标签页首次挂载及用户选择**刷新**时，会懒调用 `ctx.remote.pluginAnalyzer.snapshot()`。卸载 Client 插件会一起撤回 Remote namespace、字典与 slot 贡献。

Host 持有的快照按 Loader 顺序保留已启用的非 group 条目，并把根 Fiber 阶段映射为“运行中”“等待中”“启动中”“失败”“停止中”或“未挂载”。汇总卡片展示已启用条目、运行中条目、携带诊断的条目和缺失的已声明依赖。存在诊断时，标签页默认打开**需关注**；**全部插件**保留完整已启用清单。本地搜索按显示名、完整模块名或 Loader 条目 id 过滤所选视图，汇总数字继续描述完整快照。

诊断卡片先展示一条主要结论，再展示已观测原因、直接与传递影响数量、观测时间和安全的下一步操作。展示优先级依次为 `fiber-failed`、`isolation-mismatch`、`missing-dependency`、`missing-root`；携带关联发现的配置项会在默认收起的**技术证据**中保留每个精确诊断类型。健康卡片明确说明当前快照未记录诊断。

技术证据展示观测起点、Fiber 阶段、规范化 effect 标签、提供的服务、声明依赖状态与提供方身份、受影响配置项 id、生命周期转换总数和保留的转换时间线。活动维度标记为 `registrations-only`，让已注册 listener 与实际测量的 dispatch 执行保持清晰区分。已停用条目继续由独立的[插件列表](../ui-settings-plugin-inventory/README.md)展示。

Remote 失败会产生本地通用文案与重试操作。注册使用 `ctx.slots.inject()`，因此延迟声明、重新声明、本地化变化与插件 teardown 都会正确增加或移除标签页，且无需 import“插件”分区拥有方。

## 模型体验

无。本包只在浏览器设置中展示 Host 持有的部署快照，不注册模型可见输入或 Tool。

#### KV Cache 影响

无；本包不组装提供方请求。

## 已知限制与暂缓事项

- 刷新会读取时点快照；生命周期历史由 Host 收集器在多次刷新之间持续保留。
- 当前 UI 展示 Host 平面。Client Loader 与 UI slot 健康状态保留给后续实现阶段。
- dispatch 次数、逐 listener 执行、CPU 和内存在本包内缺少零侵入数据源。
- 快照比较、排序控件、依赖图可视化和脱敏 JSON 导出保留给后续展示阶段。
