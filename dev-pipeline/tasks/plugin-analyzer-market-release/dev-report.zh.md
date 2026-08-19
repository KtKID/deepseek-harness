# Plugin Analyzer 市场发布开发报告

[English](dev-report.md) | 中文

## 结果

Plugin Analyzer 现在通过公开组合包 `@deepseek-ai/dsh-plugin-analyzer` 交付。该组合包拥有可安装的 patch 层，并直接依赖 Host 实现 `@deepseek-ai/dsh-host-plugin-analyzer` 与 Client 实现 `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer`。

仓库组合把 Plugin Analyzer 保持为选择启用功能。安装组合包会增加一个 Host Loader 条目和一个 Client Loader 条目；卸载会撤回设置标签页、Host 监听器、生成的 Remote namespace 与 profile bundle 条目。

## 包归属

| 包 | 目录 | 发布职责 |
|---|---|---|
| `@deepseek-ai/dsh-plugin-analyzer` | `packages/bundle/plugin-analyzer/` | 公开安装目标；拥有 `dsh.bundle.patch` 与 `cordis.patch.yml`。 |
| `@deepseek-ai/dsh-host-plugin-analyzer` | `packages/host/plugin-analyzer/` | Host 数据收集、有界历史、Remote 服务、配置与生命周期清理。 |
| `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer` | `packages/client/ui-settings-plugin-analyzer/` | 设置 UI、生成的 Remote 贡献、本地化与卸载清理。 |

发布顺序为 Host、Client、组合包。三个包均使用版本 `0.1.0-rc.5`，打包后的组合包会把 workspace 依赖转换为兼容的 registry 版本范围。

## 发现并修复的问题

| 问题 | 原因与后果 | 修复与当前状态 |
|---|---|---|
| 原公开入口是 `packages/host/plugin-analyze` 下的 Host 叶子包。 | Host 实现包缺少组合包 manifest 与 profile patch，CLI 和 Market 无法获得完整可安装组合。 | 新增 `packages/bundle/plugin-analyzer`，补齐公开元数据、exports、files、许可证、patch 声明及每个 patch 包的直接依赖。 |
| 活动标识中仍有 `plugin-analyze`、`pluginAnalyze` 与 `PluginAnalyze`。 | 产品改名只覆盖了部分目录、npm 包、service、组件、快照、文档与任务。 | 活动标识统一为 `plugin-analyzer`、`pluginAnalyzer` 与 `PluginAnalyzer`；旧标识只保留在明确的改名清单与历史证据中。 |
| `dsh-web-app` 与 `dsh-api-remotes` 默认组装 Plugin Analyzer。 | 用户安装公开组合包前，所有 Web profile 已包含该实现；卸载无法移除完整功能。 | 从内置组合删除 Analyzer 条目与依赖。选择启用的组合包现已拥有两个 Loader 条目，Client 包拥有生成的 Remote 贡献。 |
| Client 在同一个 Fiber 中挂载并消费生成的 Remote namespace。 | Cordis inject 解析无法在所需子作用域观察 namespace 贡献，真实 Web 设置路径会显示通用错误。 | 把挂载与 UI 消费拆分为父子 Fiber。清理流程先释放 UI 子 Fiber，再撤回 Remote 贡献；真实 Web replay 已通过。 |
| 生成模块归属通过目录短名称匹配包。 | Host 和组合包的目录叶子名称均为 `plugin-analyzer`，Host 模块图因此链接到公开组合包。 | 图生成器现在从各包 npm 名称解析归属；回归测试覆盖不同包组使用相同目录叶子名称的情况。 |
| workspace 门禁缺少组合包专用登记。 | 新 `cordis.patch.yml` 未登记到 package-file extras，Knip 把 patch 专用直接依赖报告为未使用。 | 在 workspace constraints 登记 patch 文件，并在 Knip 中限定两个 patch 专用依赖。Analyzer 聚焦的 constraints、Knip、包 invariant 与构建产物门禁均通过。 |
| 任务开发报告仍在描述早期内置 Client MVP。 | 该文档早于独立打包与最终 Analyzer 名称。 | 用当前组合包拓扑、发布清单、验证证据与外部阻塞项替换任务和报告。 |

## 验证证据

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/host/plugin-analyzer/tests packages/client/ui-settings-plugin-analyzer/tests packages/bundle/plugin-analyzer/tests scripts/gen-doc-graphs.spec.ts` | 8 个文件通过；24 个测试通过。 |
| `pnpm run test:gui` | 278 个文件通过；3,776 个测试通过；1 个测试跳过。 |
| `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 1 个文件通过；8 个测试通过，并应用选择启用的 Analyzer 层。 |
| `pnpm run build:lib:host`、`pnpm run build:lib:client` 与 `pnpm run build:web` | 通过。 |
| `pnpm run typecheck` | 通过。 |
| `pnpm run lint` | 删除一次失败诊断构建产生的源码平面编译残留后通过。 |
| Analyzer 聚焦的包 README、路径、invariant、配置、约束、目录、模块图、NodeNext、运行时闭包、vendored link、Publint 与 Knip 门禁 | 通过。 |
| `pnpm run doc-sync` | 28 个文档门禁通过；0 个失败，0 个跳过。 |
| `node packages/bundle/plugin-doctor/lib/bin.js packages/bundle/plugin-analyzer` | 全部静态检查通过；保留预期的构建 tarball 源码安装警告与可选供应链扫描器关闭警告。 |

## 打包证据

`pnpm pack` 生成三个隔离归档。Host 归档包含 17 个文件，Client 归档包含 14 个文件，公开组合包归档包含 10 个文件。文件清单包含已构建的 `lib/` 产物，并排除 `src/`、JavaScript source map 与 declaration map。

源码 checkout CLI smoke 已把组合包安装到隔离 profile，`--dump-config` 显示组合包、两个 patch 条目与经过校验的 Host 默认值。CLI 卸载随后把 profile 恢复为基础组合包集合。

真实本地 Web 预览已通过：在链接组合包的同时，把 Host 与 Client checkout 作为普通 profile 依赖加入。pnpm 会把 `link:` 目标的依赖保留在 profile 根目录之外，Client 模块扫描器从该根目录解析包 manifest。页面显示 134 个已启用插件、134 个运行中插件、0 个关注项、0 个缺失依赖，浏览器控制台错误为 0。

外部打包产物安装仍是发布门禁。registry 当前缺少尚未发布的 Host 与 Client Analyzer 包，受限网络运行也无法解析 registry 元数据。发布实现包后即可执行该门禁。

## 剩余发布阻塞项

- 确认 `@deepseek-ai` scope 的 npm 发布权限，并保留三个包名。
- 发布 Host 与 Client `0.1.0-rc.5`，随后发布同一兼容版本的组合包。
- 在干净临时 profile 中只从 registry 安装组合包，确认传递 Host 与 Client 包可从 profile 根目录解析，检查 `--dump-config`，启动 Web profile，运行完整 Plugin Doctor，并验证卸载。
- 使用包、许可证、仓库、权限、数据使用、截图、支持与验证信息填写当前 Market 表单。
- 单独清理仓库级 `hygiene` 基线：`rescope-vendor:check` 当前报告 26 个既有 Cordis runner/UI/文档残留，完整 Knip 报告另一款 Plugin Doctor 的 `dsh-poison-guard` binary 登记。Analyzer 聚焦门禁均已通过。

先发布 Host 与 Client 包，再发布公开组合包，并通过干净 registry 安装完成验证。
