# Agent Note: Plugin Analyzer 诊断优先界面与故障 fixture

Status: implemented

[English](2026-08-26-plugin-analyzer-diagnostic-ui-and-fault-fixtures.md) | 中文

## 问题

Plugin Analyzer 过去给予每个已启用 Loader 配置项相同的视觉权重，并优先展示 Fiber 阶段、effect 数量、listener 事件名和服务关系。开发者需要先解释这些框架事实，才能识别需要关注的插件、已观测原因、受影响依赖方和安全修复动作。

Host 收集器已经推导 `missing-root`、`missing-dependency`、`isolation-mismatch` 和 `fiber-failed`。包测试固定了这些 Cordis 状态，真实装配的 Web 场景覆盖健康 profile。面向人的链路还需要真实装配证据，以证明缺陷 Loader 配置项会产生可理解的诊断，并证明修复运行时原因后诊断会消失。

已实现的 [Plugin Analyzer 行为画像](2026-08-17-plugin-analyzer-behavior-observability.zh.md)继续作为 Host 事实、脱敏、零入侵观测、组合包归属和 `registrations-only` 活动语义的权威。本决策拥有 Client 展示和真实装配故障证据。

## 决策

Plugin Analyzer 采用诊断优先的设置界面，并使用确定性的 Web 测试 Cordis 插件覆盖每一种已交付诊断。结论和支持证据先于框架细节展示，默认收起的技术证据保留完整脱敏快照。

### 诊断优先展示

任一已启用配置项携带诊断时，标签页默认打开**需关注**。**全部插件**按 Loader 顺序保留完整已启用清单。本地搜索在所选视图内生效，汇总数字继续描述完整快照。

每张诊断卡片展示一条主要结论、已观测原因、直接与传递影响数量、观测时间和安全的下一步操作。模块名、Loader 配置项 id 和当前状态提供身份与当前运行时状态。健康卡片明确说明当前快照未记录诊断。

主要诊断顺序依次为 `fiber-failed`、`isolation-mismatch`、`missing-dependency`、`missing-root`。这个顺序优先呈现失败生命周期事实和更具体的 isolation 解释。技术证据保留每个精确诊断，包括同一配置项上的关联 `missing-dependency` 与 `isolation-mismatch` 发现。

默认收起的**技术证据**包含 Fiber 列表与阶段、effect 标签、listener 事件名、已提供服务、提供方引用、依赖状态、受影响配置项 id、生命周期历史和 `registrations-only` 活动标签。文本与图标和语义颜色共同表达错误、警告、健康与信息状态。

### 故障 fixture

`apps/web/tests/plugin-analyzer-fixtures/` 拥有四个测试专用 Loader 插件，并使用稳定配置项名称：

- `test-analyze-missing-dependency` 注入 `testAnalyzeMailer`，其可见 isolation 位置初始没有提供方。
- `test-analyze-isolation-mismatch` 注入 `testAnalyzeIsolatedService`，另一个 isolation 位置存在同名提供方；Host 同时报告缺失依赖和 isolation 不匹配。
- `test-analyze-fiber-failed` 创建一个确定性启动失败的子 Fiber；快照会把该抛出记录为可检查文本。
- `test-analyze-missing-root` 在场景 dispose 根 Fiber 后保留已启用 Loader 配置项。

fixture 包位于 `apps/web/tests`，处于 workspace 发布和已交付 profile manifest 范围之外。其 patch 只在专用场景中组合。一个 bundle 测试扫描已交付 analyzer patch、Web patch 和 analyzer 包文件，固定 fixture 配置项名与 fixture 包名均处于这些文件之外。

缺失依赖修复步骤通过场景拥有的 Loader builtin，在消费方可见 isolation 位置注册 `testAnalyzeMailer`。刷新后，消费方从携带诊断的 pending 状态进入诊断列表为空的 active 状态。

### 验证

Host 包测试固定诊断推导、提供方归因、脱敏、生命周期上限和被检查注册保持不变。Client 组件测试固定默认视图选择、本地化结论、主要诊断顺序、完整技术证据、搜索、稳定汇总数字、刷新、加载、失败、空清单、健康和清理行为。

`apps/web/tests/plugin-analyzer-diagnostics.e2e.ts` 启动已交付 base 与 Web 组合包、选择启用的 Plugin Analyzer 组合包和测试专用故障 overlay。真实 Cordis Loader 产生全部四个缺陷配置项，Host 快照携带精确诊断，浏览器渲染其中文结论，修复步骤清除缺失依赖配置项。其 golden 记录诊断汇总和展开的技术证据；computed-style 断言覆盖桌面和 640 像素布局。

现有 `settings-chrome.e2e.ts` 场景继续固定健康的真实装配链路。其 golden 归一化随机 Loader 父级 id，并保留 analyzer 配置项 id 和全部用户可见事实。

### 归属与范围

Client 包拥有诊断分组、本地化文案、所选视图、搜索和展开状态。Host 包拥有运行时事实与诊断类型。Web 测试套件拥有真实装配故障 fixture 及其修复提供方。

派发插桩、CPU 与内存采样、私有错误暴露、持久历史、配置修改和自动修复位于本功能范围之外。已停用配置项清单继续归属独立的插件列表。

## 考虑过的方案

**参数优先行配合 tooltip。** Tooltip 解释单个术语。诊断优先分组为页面提供单一运行焦点，并在技术证据中保留每个参数。

**仅使用 Client 对象 fixture。** Client fixture 高效固定渲染状态。真实装配浏览器场景进一步证明 Loader 归属、Host 收集、Remote 传输、Client 渲染、刷新和诊断移除。

**发布故障插件。** 测试拥有的 Loader 配置项覆盖真实运行时行为。生产组合包和 Market 发现继续只包含用户使用的包。

**单一健康分数。** 明确的服务、Fiber、isolation 和影响事实把每项发现连接到不同修复动作。

## 结果

开发者进入页面后直接看到被诊断子集，阅读可执行解释，并可在原位置展开完整脱敏证据。完整清单和稳定汇总数字保留在相邻标签。关联诊断继续支持专家调查，一条主要解释控制初始阅读顺序。

故障 overlay 新增一条确定性的真实装配回归车道，其运行不依赖模型、网络、凭据、文件系统、时钟竞争或平台特定行为。稳定命名与 bundle 排除断言保持测试组合和已交付组合各自独立。
