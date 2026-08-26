# Agent Note: Plugin Analyzer 行为画像与可安装组合

Status: implemented

[English](2026-08-17-plugin-analyzer-behavior-observability.md) | 中文

## 问题

Web 插件列表报告 Loader 身份、启用状态与根 Fiber 阶段。单独的根阶段无法解释一个已启用插件贡献什么、解析了哪些声明服务、哪些配置项依赖它，以及它的生命周期最近是否失败或重载。开发者需要把这些事实归因到已配置 Loader 配置项，同时保持不调用被检查服务、不改变被检查注册。

该功能还必须作为一个市场包完成安装与卸载。把 Host 配置项、Client 配置项或生成 Remote 贡献接入随发行版交付的 Web 应用，会让该功能进入默认 profile，并使外部发布与核心应用组合发生耦合。

## 决策

Plugin Analyzer 以选择启用的 `@deepseek-ai/dsh-plugin-analyzer` 组合包交付。它的 `dsh.bundle.patch` 把 `@deepseek-ai/dsh-host-plugin-analyzer` 作为 `plugin-analyzer` 插入，并把 `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer` 作为 `ui-settings-plugin-analyzer` 插入。随发行版交付的 `dsh-web-app` 组合包不包含这两个配置项。安装或删除已发布的 registry 或 tarball 组合包会通过 profile 的有序组合包列表归属完整功能。

Host 包归属观测、脱敏、有界的进程本地生命周期历史、诊断推导与直接 `pluginAnalyzer/snapshot` Typert Remote。Client 包归属生成 Remote 的挂载、`settings.plugins.tab` 配置项 `analyzer`、本地化、诊断展示与 teardown。共享 `dsh-api-remotes` 包提供 `ctx.remote.$mount()` 及应用自有贡献；Plugin Analyzer 导入并挂载自己的生成贡献，使 namespace 生命周期跟随已安装 Client 插件。

### 运行时归因

Host 收集器继续以 `pluginInventory/list` 作为非 group Loader 配置项身份、模块名、启用状态与根阶段的权威。它把每个存活 Fiber 归因到 `ctx.loader.locate(fiber)` 返回的 Loader 配置项，把归属 Fiber 子树按该 `entryId` 分组，并把没有可识别 Loader 所有者的 Fiber 列入 `runtimeOnlyFibers`。

画像包含递归 effect 数量与规范化标签、listener 事件名、提供的服务名、声明依赖、已解析提供方 Fiber、缺失依赖、隔离候选项，以及直接或传递依赖配置项 id。诊断覆盖缺少根 Fiber、Fiber 失败、依赖缺失，以及另一隔离位置存在同名实现。活动字段显式报告 `registrations-only`；listener 注册与 dispatch 执行保持为两种独立事实。

### 生命周期与数据限制

收集器通过自身 Fiber 订阅公开的 `internal/plugin` 与 `internal/status` 事件。`historyLimit` 与 `historyWindowMs` 限制保留的连续序列后缀，`observedSince` 声明观测起点。卸载收集器会移除其 listener 与历史，并保持被检查 Fiber、effect、服务和 listener 不变。

快照包含公开结构名称与关系。它排除插件配置、服务值、事件 payload、Error 对象、stack、prompt、Tool 参数、凭据与 session 内容。框架标签会被规范化，任意自定义 effect 文本变成 `custom effect`，路径类 token 变成 `[redacted]`，快照生成从不调用被检查服务。

### Client 展示

Client 插件先挂载生成的 Host 贡献，再注册标签页。标签页在首次挂载和显式刷新时读取时间点快照，保留已启用 Loader 顺序，并展示汇总、贡献、依赖、诊断与生命周期事实。本地搜索按显示名、完整模块名或 Loader 条目 id 过滤列表，汇总继续描述完整快照。Remote 失败产生本地通用文案和重试操作。Cordis effect 归属机制会在卸载或 HMR 替换时移除 Remote namespace、locale 字典与 slot 贡献。

当前实现展示 Host 观测。Client Loader 归因、slot renderer 健康、逐 listener dispatch 执行、CPU、内存、排序、依赖图可视化、快照比较与脱敏 JSON 导出均位于已交付功能之外。

### 发布与验证

registry 与 tarball 版本包含公开组合包和两个实现包的预构建 `lib/` 产物。组合包把每个 patch 配置项引用的包列为直接依赖，因此常规 registry 安装可以把它们的 manifest 提升到 profile 根目录，供 Loader 与 Client 发现。`link:` 本地组合包会把依赖保留在该根目录之外，因此 monorepo Web 预览把 Host 与 Client checkout 作为普通 profile 依赖加入。Git 源码安装还需要自包含的 `prepare` 构建与明确的 pnpm `allowBuilds` 权限；本 monorepo 包面向预构建 registry 路径。三个包发布前，干净 registry 安装继续作为发布门禁。

单元与 invariant 覆盖固定 Fiber 归因、依赖事实、诊断、脱敏、历史边界、被检查注册保持不变、UI 状态、生成 Remote 挂载与 teardown。Web 浏览器场景在随发行版交付的 base 与 Web 层之上显式应用 Plugin Analyzer 组合包 patch，证明该功能保持选择启用，同时覆盖真实 Loader、Remote 与 Settings 路径。

## Alternatives considered

**从 `dsh-web-app` 挂载 Plugin Analyzer。** 这种方案会让每个 Web profile 激活该功能，并使已安装包的删除无法归属完整生命周期。独立组合包层让安装、配置覆盖与删除拥有一个 profile 级所有者。

**从 `dsh-api-remotes` 挂载生成贡献。** 共享组合会对每个可选市场插件产生构建时依赖。Client 自有挂载保留稳定 Remote 服务，同时让可选包归属自己的 namespace。

**把 `pluginInventory/list` 扩展为行为 API。** Inventory 归属无状态 Loader 投影。保留历史、依赖推导、脱敏与诊断具有独立状态和生命周期，因此 Analyzer Host 包消费 inventory 身份。

**把所有事实折叠成一个健康分。** 可用性、依赖影响、贡献规模与稳定性驱动不同操作。UI 保持底层事实与诊断明确可见。

**要求被检查插件发布 Analyzer callback。** 逐插件集成会产生不一致的指标与生命周期义务。公开 Cordis 诊断提供已交付的结构事实，同时保持被检查插件不变。

## Consequences

- 市场安装使用一个公开组合包名和两个版本兼容的实现依赖；发布时必须让三个产物均可获取。
- 默认 Web profile 保持更小，只在显式安装组合包后增加设置标签页。
- Host 历史从收集器挂载时开始，并在收集器卸载或进程退出时清空；初始 active Fiber 没有更早的转换历史。
- 刷新成本随当前 Loader 配置项、存活 Fiber、effect 与已反射服务实现数量增长。
- 结构诊断支持零侵入归因；dispatch 频率与资源消耗需要专用 instrumentation，并另行决定其数据与开销。
