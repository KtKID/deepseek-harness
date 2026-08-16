# Plugin Doctor MVP 开发报告

[English](dev-report.md) | 中文

## 结果

独立包 `@deepseek-ai/dsh-client-ui-settings-plugin-doctor` 已在 Web 设置 → 插件 → 插件诊断中提供仅含已启用插件的运行状态诊断。它通过已有 `pluginInventory/list` Remote 获取当前 Loader 快照，在插件内部派生状态与汇总字段，并展示刷新、重试、空列表和行详情状态。

## 归属与数据流

实现、测试、样式、字典、README 和 invariant companion 全部位于 `packages/client/ui-settings-plugin-doctor/`。运行时装配使用三个必需的共享声明：`tsconfig.client.json`、Web bundle 依赖和 Web bundle Loader 条目。生成目录、目录索引、锁文件、Web 组合覆盖与 Agent Note 按项目既有规范登记新包。

```text
ctx.loader.entries()
  -> pluginInventory/list
  -> api-remotes
  -> diagnose(snapshot)
  -> settings.plugins.tab / doctor
```

`diagnose(snapshot)` 按 Loader 顺序保留 `enabled === true` 的条目，并把 `active`、`pending`、`loading`、`failed`、`unloading`、`null` 映射为 `running`、`pending`、`starting`、`failed`、`stopping`、`not-mounted`。界面展示 enabled、running 和 non-running 总数；展开行可查看准确的 Loader `entryId` 和原始 Cordis phase。

## TDD 证据

源码创建前先执行 `pnpm exec vitest run packages/client/ui-settings-plugin-doctor/tests`。Vitest 因引用的源码模块尚不存在而报告四个测试套件失败，形成预期红灯。完成实现后，同一命令通过四个测试文件和十个测试。

定向覆盖率命令为 `pnpm exec vitest run --coverage --coverage.include='packages/client/ui-settings-plugin-doctor/src/**/*.{ts,tsx}' packages/client/ui-settings-plugin-doctor/tests`。语句、分支、函数和行覆盖率均达到 100%。

## Definition of Done 证据

| DoD | 证据 |
|---|---|
| 1 | 新包独立拥有双入口、UI、诊断、本地化、测试、样式、文档和包级 invariant。现有 Cordis 与 Host 实现文件保持原样。 |
| 2 | 纯诊断测试覆盖停用条目过滤、Loader 顺序、身份、六种 phase 映射及 enabled/running/non-running 汇总。 |
| 3 | 组件与浏览器插件测试覆盖初始加载、成功、空状态、通用失败、重试、刷新、行详情、卸载后的异步完成、slot 声明方重载、语言切换和释放。 |
| 4 | Web bundle 在真实 Settings scaffold 中加载此包；replay 验证 Loader 数量、准确模块名、展开详情和 keyless 产品快照。包、目录、bundle、Agent Note 和任务文档的中英文配对完整。 |

## 验证

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/client/ui-settings-plugin-doctor/tests` | 4 个文件通过；10 个测试通过。 |
| 上述定向 Vitest 覆盖率命令 | 语句、分支、函数和行覆盖率均为 100%。 |
| `pnpm run test:gui` | 276 个文件通过；3,767 个测试通过；1 个测试跳过。 |
| `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 8 个测试通过并录制 Plugin Doctor golden。 |
| `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 8 个测试通过并匹配已录制 golden。 |
| `pnpm exec tsc -b tsconfig.client.json --pretty false` | 通过。 |
| `pnpm run build` | 通过，包含 Web refresh 步骤。 |
| `pnpm run lint` | 通过。 |
| `pnpm run doc-sync` | 28/28 文档门通过。 |
| `git diff --check` | 通过。 |

## 剩余限制

- 每次结果都是时间点快照；刷新会获取下一份快照，插件不保留历史。
- `not-mounted` 表示已启用 Loader 条目缺少活跃根 Fiber。当前 Remote 响应无法区分导入失败、回滚或其他生命周期原因。
- 磁盘中存在但缺少 Loader 条目的包在运行进程中没有配置身份与生命周期状态，因此不会进入结果。

原 Cordis Dispatch Inspector proposal 继续作为未来 dispatch 时序与 hook 顺序诊断的独立规格，并保持原文不变。
