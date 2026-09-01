# Agent Note: Plugin Analyzer 发布仓库投影

Status: implemented

[English](2026-08-30-plugin-analyzer-publish-repository-projection.md) | 中文

## 问题

Plugin Analyzer 在 DeepSeek Harness workspace 中由一个 bundle 包和独立的 Host、Client 包共同开发。公开 bundle 依赖另外两个包、生成的 Typert 文件、Client bundle、转换后的 workspace 版本范围和预构建声明文件。手工把源码目录复制到另一个 Git 仓库，可能遗漏生成文件、保留 `workspace:` 规格、发布只供 monorepo 使用的文件，或让两处可编辑副本逐渐分叉。

发布仓库需要独立 Git 历史，同时放在当前 checkout 内供本地发布使用。同步命令需要保留该 `.git`、避免父仓库跟踪发布目录，并让只供源码仓库使用的自动化脚本留在发布包之外。

## 决策

项目级 [`dsh-plugin-analyzer-publish-sync`](../../../skills/dsh-plugin-analyzer-publish-sync/SKILL.md) 流程负责把三个 Analyzer 源码包单向投影到 `plugin-analyze-publish/`。父仓库的 `.gitignore` 排除完整目标目录，目标根目录拥有自己的 `.git` 和 `main` 分支。DeepSeek Harness 继续作为可编辑源码的权威位置；目标目录保存供独立审查、版本管理和发布使用的生成产物。

该流程调用一份独立的 [`sync-publish.py`](../../../skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py)。脚本构建两个编译面，分别为 bundle、Host 和 Client 包执行 `pnpm pack`，在检查路径穿越和 tar 成员类型后展开各归档，再把公开 bundle 放在目标根目录，把 Host 与 Client 放在 `packages/` 下。`pnpm pack` 先解析 workspace 包版本范围，脚本随后规范化 manifest 键顺序，让生成字节可重复。

脚本复制 MIT 许可证，把 monorepo 相对 README 链接改写为独立仓库链接或固定源码 commit 的链接，并为改写后的双语文档记录新的 `README.i18n.yaml` 哈希。校验覆盖三个包名和一致版本、bundle patch 声明、实现包直接依赖、必需构建入口，以及 `workspace:` 规格和 `sync-publish.py` 均未进入发布产物。

`.release-source.json` 记录源码 commit、Analyzer 源码路径是否有未提交改动、包身份和每个受管文件的 SHA-256。普通同步只替换声明的受管路径，并保留 `.git` 以及白名单之外由发布仓库拥有的文件。`--check` 在临时目录重新生成投影，并报告缺失、额外或内容变化的受管文件。`--skip-build` 只用于两个编译面已经成功完成后的显式复用。

该流程补充 [Plugin Analyzer 行为与发布决策](../feature/2026-08-17-plugin-analyzer-behavior-observability.md)；后者继续拥有选择启用的 bundle、Host／Client 职责、运行时行为和 registry 安装要求。

## 验证

Python 单元测试覆盖普通 tar 文件提取、父目录穿越拒绝、同步脚本排除、改写后翻译 sidecar 记录、漂移诊断和确定性 manifest 规范化。一次完整 Host 构建和一次完整 Client 构建产出真实同步使用的输入；紧随其后的 `--check --skip-build` 可以复现全部受管文件哈希。Git 检查确认 `plugin-analyze-publish/` 是独立仓库，父 checkout 会忽略该目录。

## 曾考虑的替代方案

**在发布仓库维护可编辑源码副本。** 这种方式会形成两个源码权威位置，并让生成的 Typert、Client JavaScript bundle、声明文件、依赖范围和源码修改分别依赖不同同步规则。投影打包产物可以让发布仓库获得 npm 实际接收的输入。

**使用一次 Git subtree split。** Plugin Analyzer 横跨三个不连续的包目录，还需要源码仓库忽略的构建产物。单前缀 subtree 无法组成可安装包集合，也无法解析 workspace 依赖规格。

**随插件发布同步脚本。** 消费者安装预构建运行时包，无需使用理解 monorepo 的导出器。把脚本放在项目 skill 中，可以阻止它进入 npm tarball 和独立发布仓库。

## 后果

发布仓库是生成产物仓库，因此功能修改先回到三个归属源码包，再执行同步。发布 commit 具有确切源码来源和确定性漂移检查。普通同步会承担两个编译面的构建成本；显式复用模式把新鲜度责任交给调用方所指明的已完成构建。npm 发布、Git commit、push、tag、profile 安装和干净 registry 验证继续作为同步之外的显式发布操作。
