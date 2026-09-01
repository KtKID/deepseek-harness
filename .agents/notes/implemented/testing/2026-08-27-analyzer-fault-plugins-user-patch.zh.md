# Agent Note: 作为用户 patch 层本地包的分析器故障插件

Status: implemented

[English](2026-08-27-analyzer-fault-plugins-user-patch.md) | 中文

## 问题

Plugin Analyzer 诊断四种 Cordis Loader 状态：注入服务缺失、子 Fiber 失败、另一 isolation 位置存在同名提供方，以及已启用行没有存活的根 Fiber。装配后的 Web 场景把这些状态做成 `apps/web/tests/plugin-analyzer-fixtures/` 下的测试专用 overlay 插件，并依赖 Loader builtin 和启动后的 `_dispose()`。那条路径不是开发者往正在运行的 web profile 插入插件的方式。

生产启动（`assertEntriesActivated`）会拒绝一直处于等待中、或没有存活根 Fiber 的已启用行。用组合包或开机 patch 插入这些状态会使 `dsh web` 失败。启动之后还能加行的官方组合层，是被监视的 profile 用户 patch。

## 决策

`examples/analyzer-fault-plugins` 是名为 `dsh-analyzer-fault-plugins` 的本地 npm 包。它遵循[打包与安装](../../../../docs/user/develop/basic/publish.md)的包目录约定，并导出五个 ESM 插件模块。它不声明 `dsh.bundle`，因此 `dsh plugin add` 只把它装成 profile 的普通依赖，不插入 Loader 行。

每种诊断一个目录（`unread-mail/`、`nested-crash/`、`self-unload/`、`isolated-inbox/`），里面是插件模块和 `patch.yml`。隔离是同一目录里的消费者加上分组提供方。激活方式是在 Web 运行时，把该目录的 `patch.yml` 追加到 `$DSH_HOME/profiles/<name>/cordis.patch.yml`；卸载则是删除该片段。patch 行使用包名，而不是相对路径。

- `unread-mail` 注入 `unreadMailStore`，没有任何提供方。
- `nested-crash` 挂载一个 `apply` 会抛错的子插件，并吞掉该拒绝，避免变成进程级未处理拒绝。
- `isolated-inbox` 在将 `isolatedInbox` 隔在 `isolated-inbox-store` 周围的 `cordis:group` 之外注入该服务。
- `self-unload` 在 `apply` 返回后调用 Loader 配置项的 `_dispose()`。`ctx.fiber.dispose()` 会把该行标为禁用，从而让 Plugin Analyzer 不再列出它。

[Web 诊断 fixture](../feature/2026-08-26-plugin-analyzer-diagnostic-ui-and-fault-fixtures.md) 仍是 e2e overlay。本包不替换它们。

## 备选方案

**声明 `dsh.bundle` 并用 `dsh plugin add` 安装。** 组合包层在启动时应用。四种状态里有三种无法通过 `assertEntriesActivated`，Web 将无法启动。

**Plugin Analyzer 用 Debug 开关去 `Loader.create` 夹具。** 那会让观察者改动被观察的树，也不是用户 patch 路径。

**复用 `apps/web/tests/plugin-analyzer-fixtures/`。** 那些模块依赖测试专用 Loader builtin 和 harness 的 `_dispose()`，也不是可安装的包。

**用 `ctx.fiber.dispose()` 制造根 Fiber 丢失。** Loader 的自卸载钩子会禁用该行，Plugin Analyzer 不再把它当作已启用项列出。

## 后果

- 开发者只需安装一次 checkout，然后通过编辑正在运行的 Web 的 profile 用户 patch 来开关诊断。
- `unread-mail`、`isolated-inbox` 和 `self-unload` 不得出现在进程启动时。
- 示例测试通过真实 Loader 导入路径固定每个模块；它们使用绝对文件路径，因为它们不是 profile。
- 本包不进入已交付的 Plugin Analyzer 和 Web 组合包 patch。
