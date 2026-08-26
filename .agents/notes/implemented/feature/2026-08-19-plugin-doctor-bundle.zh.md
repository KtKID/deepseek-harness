# Agent Note：Plugin Doctor 第一方 bundle 移植

Status: implemented

[English](2026-08-19-plugin-doctor-bundle.md) | 中文

## 问题

[`zoahdev/dsh-plugin-doctor`](https://github.com/zoahdev/dsh-plugin-doctor) 原本是树外可安装组合包。把源码放在仓库根目录会绕开 `packages/<group>/<package>` workspace、包命名、构建、invariant、文档与快照门禁。它的模型工具 `plugin_check` 还可以直接在 `execute()` 中启动构建、打包与 profile 安装命令，没有经过 harness 的批准 waterfall 和已配置 shell sandbox。

## 决策

把实现移植到 `packages/bundle/plugin-doctor`，包名为 `@deepseek-ai/dsh-plugin-doctor`。该包继续归入 bundle，因为 `cordis.patch.yml` 插入模型插件，manifest 声明 `dsh.bundle.patch`。它发布三个封闭入口：插件 API、invariant companion 与独立 `dsh-plugin-doctor` CLI。[`LICENSE.zoahdev`](../../../../packages/bundle/plugin-doctor/LICENSE.zoahdev) 保留上游 MIT 声明。

该包拥有两条执行路径：

- 独立 CLI 仅在传入 `--supply-chain` 时运行可选 `dsh-poison-guard`；普通静态检查保持无进程执行。构建、打包与临时 profile 检查需要各自的显式 CLI 模式。直接子进程通过不启用 shell 的 `execa` 执行，设置超时与输出上限，在适用路径传递取消信号，并使用共享 `scrubbedParentEnv()` 环境基底。
- 模型工具的静态检查不创建进程。`build=true` 与 `full=true` 从 `tools/pre-execute` 返回 `ask`；批准后的调用把每条命令交给 `ctx.shell`，使用调用 session 经 `ctx.sandboxPolicy` 解析的策略、超时、输出上限和取消信号。

Full 模式创建独占的临时 home 与打包目录，只接受该目录中生成的唯一 tarball，在临时 `DSH_HOME` 下安装，确认组合配置包含 patch id，并在 `finally` 中删除 home。缺少 `prepare` 脚本会产生 `source-install` 警告，因为发布 tarball 可以预先包含构建产物。

## 模型可见行为

组合包注册一个 `plugin_check` schema，参数为绝对路径 `dir`、可选 `build` 和可选 `full`。结果为每项检查保留一条 `[PASS|WARN|FAIL]` 文本，并追加最终成功／失败文本。ACP example 增加专用 Plugin Doctor 组合与 keyless snapshot header class，固定组装后的 schema，同时保持默认 example 的工具列表不变。

## 验证

- Package 测试覆盖静态诊断、profile 检查、环境来源、工具调用配对、批准 delegation、静态路径不创建进程、sandbox 构建路由、full 模式临时目录清理、取消、CLI 源码启动与 invariant 注册。
- 面向模型的 adapter 与 invariant companion 达到逐文件 100% 覆盖率门禁。四个移植的诊断引擎在扩充上游分支矩阵期间使用具名临时覆盖率排除，并继续运行聚焦回归测试。
- Package TypeScript project 通过 workspace reference 构建。
- Keyless ACP replay snapshot 启动真实的替代组合，并在请求工具 schema 中固定 `plugin_check`。
- Workspace constraints、package invariant、生成的工具／配置目录、翻译配对、聚焦文档门禁与构建后发布 smoke 共同覆盖 monorepo 接线。

## 考虑过的替代方案

**把 clone 仓库保留在 workspace 根目录。** 该位置适合树外开发，但会绕过迁移需要加入的第一方 workspace 归属和 package 门禁。

**把运行时放进 `packages/host`。** Plugin Doctor 注册模型工具和可安装 patch 层，不拥有 Host Remote 或 Web transport。Bundle 分组能直接表达其组合职责。

**允许模型工具直接 spawn 命令。** 直接 spawn 无法继承部署的批准与 sandbox policy。Shell consumer 路径保留既有执行控制与取消语义。

## 后果

- 第一方归属位于 `packages/bundle/plugin-doctor`；`packages/host/plugin-analyzer` 继续拥有独立的运行时可观测职责。
- 静态发现属于复核信号。正则检查和可选外部扫描程序无法证明不存在恶意行为。
- Full 模式在隔离 profile 中证明打包与组合身份。Provider API 行为和终端用户工作流属于其他验证表面。
- `doctor.ts`、`env.ts`、`env-explain.ts` 与 `session-log.ts` 在 `vitest.config.ts` 中带有显式临时覆盖率债务；其聚焦测试保持启用，四项排除的移除工作记录在门禁旁。
