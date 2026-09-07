---
description: "选择启用的 Host 插件行为诊断与 Web 设置标签页组合包。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-plugin-analyzer

[English](README.md) | 中文

## 概述
## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

- [开发备注](#dev-note)


面向 Web profile 的可安装 Plugin Analyzer 组合包。它声明的 `cordis.patch.yml` 层挂载 Host 行为收集器与 Client 设置标签页；两个实现包均由本组合包归属。

通过 profile 管理器安装和删除组合包：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer
dsh plugin --profile web remove @deepseek-ai/dsh-plugin-analyzer
```

安装会把本包追加到 profile 的 `dsh.profile.bundles` 列表。组合包插入 `plugin-analyzer` 与 `ui-settings-plugin-analyzer` 配置项；删除会撤回两个配置项、`pluginAnalyzer` Remote namespace、Host 生命周期监听器、Settings slot 贡献与包依赖。随发行版交付的 Web 组合包不携带这两个配置项，因此 Plugin Analyzer 保持选择启用。

Host 配置项默认使用 `historyLimit: 1000` 与 `historyWindowMs: 3600000`。后续 profile patch 可以替换该配置项的完整配置。快照语义、脱敏与配置限制见 [Host 包](../../host/plugin-analyzer/README.zh.md)，设置行为见 [Client 包](../../client/ui-settings-plugin-analyzer/README.zh.md)。

registry 与 tarball 版本包含组合包和两个实现包预构建的 `lib/` 产物。Git 源码分发还需要自包含的 `prepare` 构建，并由消费方在 pnpm `allowBuilds` 中授权；本 monorepo 包面向预构建 registry 发布路径。

本地 monorepo 预览需要把组合包、Host 与 Client checkout 目录作为普通 profile 依赖加入。pnpm 不会把 `link:` 目标的依赖提升到 profile 根目录，Client 模块扫描器从该根目录解析包 manifest。registry 安装使用已发布组合包的依赖图，并继续作为必需的发布验证。

<a id="model-experience"></a>
## 模型体验

间接影响，仅通过本组合包挂载的 Host 与 Client 包；这些包不注册面向模型的输入或 Tool。

#### KV Cache effect

无；组合后的包不组装 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 本组合包需要兼容 DeepSeek Harness 安装提供 Web profile 的 API gateway、Client runtime、Settings slots、locale 服务与 Host 插件 inventory。
- 使用 `@deepseek-ai` 发布需要拥有该 registry scope 的权限；第三方发布者应使用自己控制的 scope，并同步更新组合包依赖与 patch 元数据中的包名。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
