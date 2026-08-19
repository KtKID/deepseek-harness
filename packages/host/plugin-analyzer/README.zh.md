# @deepseek-ai/dsh-host-plugin-analyzer

[English](README.md) | 中文

为已启用 Cordis Loader 插件提供只读 Host 行为画像。该网关把 [`pluginInventory/list`](../plugin-inventory/README.md) 的 Loader 身份与公开 registry、Fiber、effect、注入和反射诊断结合，再通过直接 Remote 方法 `pluginAnalyzer/snapshot` 公开结果。

每个条目画像包含根 Fiber 与子 Fiber 阶段、递归 effect 标签、listener 事件名、提供的服务名、声明依赖、精确的已解析提供方、缺失依赖，以及直接／传递依赖方条目 id。缺少可识别非 group Loader 所有者的运行时 Fiber 保留在 `runtimeOnlyFibers`。网关会针对根 Fiber 缺失、Fiber 失败、依赖缺失，以及其他隔离位置存在同名实现派生诊断。

收集器通过自身 Fiber 订阅 Cordis 生命周期事件，并保留一段进程本地连续序列。`historyLimit` 限制记录数量，`historyWindowMs` 限制记录时长；两个字段均为经过校验的配置。`observedSince` 标记收集器的时间起点，已存在的 Fiber 在下一次观测到阶段变化前使用该起点。

快照包含公开名称与结构关系。快照省略服务值、插件配置、事件 payload、Error 对象、stack、prompt、Tool 参数、凭据和 session 内容。框架持有的诊断标签会被规范化，任意自定义 effect 文本变为 `custom effect`，类似路径的 token 变为 `[redacted]`。快照生成期间不会调用被检查服务。网关卸载会移除自身 listener 与保留历史，每项被检查注册保持不变。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `historyLimit` | `1000` | 所有 Host Fiber 合计保留的生命周期记录上限 |
| `historyWindowMs` | `3600000` | 生命周期记录最长保留毫秒数 |

## 模型体验

无。本包通过 Host Remote 公开开发者诊断，不注册模型可见输入或 Tool。

#### KV Cache 影响

无；收集器不组装提供方请求。

## 已知限制与暂缓事项

- 活动维度报告已注册 listener 名称和显式来源 `registrations-only`；dispatch 频率与耗时等待专用 Dispatch Inspector 提供方。
- 生命周期历史从收集器挂载时开始，并随收集器或进程 teardown 清空。
- Cordis 公开诊断当前只公开失败阶段，没有可安全传输的公开错误记录，因此诊断只携带失败 Fiber 身份。
- Client Loader 与 UI slot 观测、快照比较和 JSON 导出保留给 Plugin Analyzer 提案的后续阶段。
- 每次快照都会遍历当前 Loader 条目、存活 Fiber、递归 effect 与反射服务实现。
