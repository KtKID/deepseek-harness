---
description: "可安装的插件与 profile 健康检查，提供 CLI 和模型工具。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-plugin-doctor`

[English](README.md) | 中文

## 概述
## 目录

- [检查范围](#checks)
- [CLI](#cli)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

- [开发备注](#dev-note)


Plugin Doctor 是一个可安装的 profile 组合包、独立 CLI 与模型工具，用于检查 DeepSeek Harness 插件组合包和已落盘的 profile。本包从 [`zoahdev/dsh-plugin-doctor`](https://github.com/zoahdev/dsh-plugin-doctor) 移植而来；[`LICENSE.zoahdev`](LICENSE.zoahdev) 保留上游 MIT 声明。

组合包 patch 插入一条 `plugin-doctor` 配置行。该插件注册 `plugin_check`；CLI 提供相同的静态组合包检查，并增加 profile、环境、构建、打包与全新 profile 安装诊断。

<a id="checks"></a>
## 检查范围

静态组合包检查覆盖 manifest、patch YAML 与插入 id、构建入口、发布文件白名单、pre-execute listener 副作用、shell 启动模式，以及可选的 `dsh-poison-guard` 供应链扫描。Profile 检查覆盖真实目录形式的重复 `@deepseek-ai/*` 包、manifest BOM、超大文件、无法解析的入口、缺失的运行时依赖或原生模块，以及持久化日志中未配对的工具调用与结果。

Manifest 检查允许发布 tarball 的包省略 `prepare` 脚本。它会单独给出 `source-install` 警告，因为缺少生命周期构建时，直接从 git 安装需要预构建产物。

<a id="cli"></a>
## CLI

```sh
dsh-plugin-doctor /absolute/plugin/path
dsh-plugin-doctor --build /absolute/plugin/path
dsh-plugin-doctor --full /absolute/plugin/path
dsh-plugin-doctor --supply-chain /absolute/plugin/path
dsh-plugin-doctor --profile "$DSH_HOME/profiles/web" --json
dsh-plugin-doctor --env
dsh-plugin-doctor env explain DEEPSEEK_API_KEY
```

`--build` 运行目标包的构建脚本。`--full` 把目标打包到隔离的临时目录，将 tarball 安装到临时 profile，确认组合配置中存在 patch 插入的 id，随后删除临时 profile。`--supply-chain` 显式启用可选的 `dsh-poison-guard` 可执行程序；普通静态检查保持无进程执行。独立 CLI 在启动子进程前清除环境中疑似凭据和 `DSH_*` 变量，再合并临时 `DSH_HOME` 等显式归属变量。

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型可见内容

模型看到生成的 [`plugin_check` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plugin-doctor)，参数包含绝对路径 `dir`、可选 `build` 和可选 `full`。静态调用直接检查文件。`build=true` 或 `full=true` 的调用通过 `tools/pre-execute` 请求批准；批准后的命令经 `ctx.shell` 执行，并使用调用 session 解析出的 sandbox policy、输出上限、超时与取消信号。

#### Token 影响

工具可见期间，schema 产生固定输入成本。结果按每项检查一条有界文本写入历史，直到 compaction。

#### KV Cache 影响

插件配置与工具可见性保持不变时，schema 的请求前缀稳定。插件启用、销毁或按 scope 限制工具时，缓存可能从首个变化的工具定义 token 起失效；结果追加在可复用前缀之后。

### 结果

#### 模型可见内容

每项检查渲染为 `[PASS|WARN|FAIL] <name>: <detail>`，末尾为 `ALL CHECKS PASSED` 或 `SOME CHECKS FAILED`。结构化结果同时包含 `ok` 与完整检查数组。

#### Token 影响

结果成本随检查详情和执行命令失败内容变化。命令输出在进入结果前截断，保留的结果会留在历史中直到 compaction。

#### KV Cache 影响

结果追加在可复用请求前缀之后，不会使更早的缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **静态安全检查采用启发式规则** — 源码模式与 `dsh-poison-guard` 结果用于定位人工复核目标，无法证明插件绝对安全。
- **模型工具不调用外部供应链扫描程序** — 其静态路径不创建进程；独立 CLI 仅在传入 `--supply-chain` 时调用可选扫描程序。
- **Full 模式只修改临时 profile** — 它验证组合配置与插件 id，不执行 provider API 或用户工作流。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
