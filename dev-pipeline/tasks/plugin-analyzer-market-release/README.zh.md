# Plugin Analyzer 市场发布

[English](README.md) | 中文

## 目标

把 Plugin Analyzer 发布为 DeepSeek Harness 插件流程接受的选择启用型可安装组合包。执行 `dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer` 后，系统必须增加一个组合包层、激活 Host 收集器和 Client 设置贡献；安装前，随发行版交付的 Web profile 保持原有组成。

仓库内的[插件打包教程](../../../docs/user/develop/basic/publish.zh.md)、[CLI 行为参考](../../../apps/cli/reference/README.zh.md#plugin-management)、[组合包规则](../../../packages/bundle/README.zh.md)与[包规则](../../../packages/AGENTS.md)共同定义验收标准。市场外部表单字段与发布者账号审核属于本源码任务之外的发布操作。

## 包归属

- `packages/bundle/plugin-analyzer/` 归属公开安装目标、`dsh.bundle.patch`、patch 配置项与传递运行时依赖。
- `packages/host/plugin-analyzer/` 归属 Host 观测、经过校验的历史配置、`pluginAnalyzer/snapshot` Remote 与自身 invariant。
- `packages/client/ui-settings-plugin-analyzer/` 归属生成 Remote 的挂载、Plugin Analyzer 标签页、本地化、展示与自身 invariant。
- `packages/bundle/web-app/` 与 `packages/api/remotes/` 只提供已安装插件消费的稳定扩展服务；二者不携带 Plugin Analyzer 配置项或生成贡献。

## 实现清单

- [x] 把当前产品标识中的 `plugin-analyze` / `pluginAnalyze` / `PluginAnalyze` 全部改为 `plugin-analyzer` / `pluginAnalyzer` / `PluginAnalyzer`；另一款静态检查产品继续使用 Plugin Doctor 标识，旧名称只保留在明确的历史报告中。
- [x] 新增 `@deepseek-ai/dsh-plugin-analyzer`，补齐公开包元数据、`files`、`exports`、许可证、`dsh.bundle.patch`，并把 patch 引用的每个包列为直接依赖。
- [x] 通过组合包 patch 插入唯一的 `plugin-analyzer` 与 `ui-settings-plugin-analyzer` 配置项，并提供经过校验的 Host 默认值。
- [x] 由已安装的 Client 插件挂载生成的 Host Remote 贡献，卸载时撤回 `remote.pluginAnalyzer` namespace。
- [x] 从 `dsh-web-app` 删除 Plugin Analyzer 依赖与配置项，从共享 `dsh-api-remotes` 组合删除其生成贡献。
- [x] 让每个实现包只属于一个编译聚合，更新 workspace 路径与引用，并从归属源重新生成包目录、配置目录、模块图、事件归属表和 Client slot 目录。
- [x] 更新双语包 README 与 implemented Agent Note，使名称、归属、配置、安全排除项、生命周期历史、安装和卸载均匹配交付组合。
- [x] 增加单元测试、invariant、HMR 卸载、组合包 manifest、patch 依赖和真实 Web Loader 组合覆盖；真实组合必须显式应用选择启用的组合包层。
- [ ] 构建全部发布入口，创建隔离的 `pnpm pack`，检查 tarball 内容，把 tarball 安装进临时 Web profile，验证 `--dump-config`，启动 profile，再删除该包。
- [ ] 运行聚焦测试、typecheck、lint、`hygiene`、`doc-sync`、`git diff --check`，并用 Plugin Doctor 检查打包后的组合包；只记录实际执行的命令。

## 发布清单

- [ ] 确认拥有 `@deepseek-ai` npm scope 的发布权限并保留 `@deepseek-ai/dsh-plugin-analyzer`；没有该权限时使用发布者自己的 scope。
- [ ] 以兼容版本发布 Host、Client 和组合包，并确保包中包含各自的 `lib/` 产物；registry 与 tarball 安装无需安装时构建授权。
- [ ] 在干净机器执行 `dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer`，随后确认组合包进入 `dsh.profile.bundles`，且两个 patch 配置项出现在 `dsh --profile web --dump-config` 中。
- [ ] 执行 `dsh plugin --profile web remove @deepseek-ai/dsh-plugin-analyzer`，随后确认组合包层、设置标签页、Host 监听器、Remote namespace 与包依赖均已移除。
- [ ] 提交当前市场表单要求的打包产物、包名、版本、仓库、许可证、README、权限／数据使用声明、截图、验证证据与支持联系方式。

## 完成定义

- [x] 公开安装目标通过静态 manifest、patch、依赖、入口与 files 检查。
- [ ] 打包后的组合包在启用可选供应链扫描器时通过 Plugin Doctor。
- [ ] 干净 profile 只安装 registry 中的公开组合包即可出现 Plugin Analyzer，并在删除组合包后移除完整功能。
- [x] 对活动源码与当前文档的搜索在获准历史证据之外找不到过时的 Plugin Analyze 标识。
- [ ] 打包产物可以在临时 profile 中安装和启动，不依赖 monorepo workspace 解析。
- [x] 上述每项源码、文档、生成产物、测试与发布门禁均有已记录证据或明确发布阻塞项。
