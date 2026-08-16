# @deepseek-ai/dsh-client-ui-settings-plugin-doctor

[English](README.md) | 中文

Web 设置中的只读**插件诊断**标签页。这个独立 Client 插件向 `settings.plugins.tab` 贡献 `doctor` 条目；它的 Node 入口不包含 Host 行为。标签页首次挂载及用户选择**刷新**时，会通过 [`api-remotes`](../../api/remotes/README.md) 懒调用 `ctx.remote.pluginInventory.list()`。

插件诊断从 Host 持有的 Loader 清单派生一份时点诊断。它按 Loader 顺序保留已启用的非 group 条目，并把根 Fiber 阶段映射为“运行中”“等待中”“启动中”“失败”“停止中”或“未挂载”。汇总卡片从同一批行计算已启用、运行中与非运行中数量。每行展示紧凑名称、精确模块标识与派生状态；展开后展示 Loader 条目 id 和原始 Cordis 阶段。已停用条目继续由独立的[插件列表](../ui-settings-plugin-inventory/README.md)展示。

Remote 失败会产生本地通用文案与重试操作。注册使用 `ctx.slots.inject()`，因此延迟声明、重新声明、本地化变化与插件 teardown 都会正确增加或移除标签页，且无需 import“插件”分区拥有方。

## 模型体验

无，因为本包只在浏览器设置中展示 Host 持有的部署快照，不注册任何模型可见输入或 Tool。

#### KV Cache 影响

无；本包不组装提供方请求。

## 已知限制与暂缓事项

- **显式时点刷新**：标签页不订阅 Loader 生命周期变化，也不保留历史。
- **根 Fiber 观察**：“未挂载”表示已启用的 Loader 条目没有存活的根 Fiber；当前清单字段无法区分 import 失败、回滚或其他生命周期原因。
- **进程配置清单**：磁盘上存在但没有 Loader 条目的包缺少已配置的运行时身份，因此不进入结果。
