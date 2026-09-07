# deepseek-harness `.agents/skills` 触发时机总结

- 调研日期：2026-08-14
- 来源：`/Volumes/machub_app/proj/agent/deepseek-harness/.agents/skills/`（共 11 个 skill，全部为该仓库的流程规范类 skill）
- 结论：6 个直接对应开发流程（评审、推送、合并、简化、决策记录、UI 演示），5 个属于文档与文案流程。每个 SKILL.md 的 frontmatter `description` 都明确定义了触发时机，如下分组整理。
- 目录关系：`.claude/skills` 是指向 `../.agents/skills` 的符号链接（symlink），并非独立副本。Claude Code 从 `.claude/skills/` 发现 skill，其他 agent 从 `.agents/skills/` 读取，两者共享同一份源文件，`diff -rq` 逐字节一致。

## 开发流程类

### dsh-code-review

- **触发时机**：在 deepseek-harness 仓库里评审一个 PR 时。
- **作用**：为评审者提供仓库标准（AGENTS.md 约定、防御性模式、ADR、质量门禁）和代码本身看不出来的检查项，如生命周期/并发、接口契约、注册清理等。

### dsh-pre-push-checks

- **触发时机**：push、force-push、把 PR 标记为 ready for review、或声称"检查已通过"之前；以及 `gh stack sync` 发布重写分支之后要立即使用。
- **作用**：为本次 diff 挑选最小够用的本地测试集，而不是反射式跑全量套件；含历史重写推送的 lease 保护和 post-sync 校验流程。

### dsh-merging-stacked-prs

- **触发时机**：落地一组依赖堆叠的 PR（A ← B ← C）、合并 base 是另一个开放 PR 分支的 PR，或请求中提到 "stacked PRs" / "PR stack" / "dependent PRs" / 按顺序合并多个相关 PR 时。
- **作用**：强制走 GitHub 官方 stack 功能（`gh stack merge`），禁止手动逐个 merge + retarget；涵盖 stack 链接、刷新、预检、合并、落地验证、分支删除全流程。

### dsh-find-simplifications

- **触发时机**：在仓库里寻找简化机会（死代码、重复、投机性设计、过度构建、手写了现成依赖已有的东西）、撰写提议性 Agent Note、审计/合并被取代的 Agent Note、或从另一个 PR 折叠简化想法时。
- **作用**：要求用调用点证据证明每个候选，而非猜测；涵盖强候选标准、广度调研、手写 vs 依赖判定、Agent Note 撰写与合并。

### dsh-archive-agent-notes

- **触发时机**：添加、审计、修剪、归档、恢复或审查 Agent Note（该仓库的设计决策记录体系）时。
- **作用**：每新增一条 Note 都要触发一次同主题旧记录的被取代检查；规定 implemented 提案按"未来决策价值"决定保留/冻结归档，rejected 提案只在仍能防止重蹈覆辙时保留。

### record-browser-gif

- **触发时机**：被要求制作/录制演示浏览器工作流的 GIF 时；且每个改变产品用户可见 GUI 行为的 PR 必须附一个 GIF。
- **作用**：GIF 必须从该 PR 分支真实构建的服务器 + 真实模型轮次录制，禁止 fixture/mock 替代；规定分帧捕获、确定性编码、独立 assets 分支发布与嵌入 PR 描述的完整流程。

## 文档与文案流程类

### dsh-doc-standards

- **触发时机**：编写、移动、审查或审计仓库文档时——决定文档层级与详略、区分教程/参考、修剪文档冗余、响应 `verify-doc-budgets` 门禁失败，或收到"改进文档 / 审计文档 / 这内容该放哪 / 这文档太长"类请求时。
- **作用**：文档摆放、语料审计、预算与验证的流程入口；文案编辑判断归 dsh-prose-standard 管。

### dsh-prose-standard

- **触发时机**：编写、审查、恢复、修剪或审计仓库中任何文案时，覆盖 Markdown、JSDoc、代码/测试注释、prompt、描述、诊断信息、CLI/UI 字符串，并决定哪些位置必须有文档。
- **作用**：文案编辑总纲（完整命题保留规则）；要求显式 `scope` 输入，缺失则停下报告而不是自行推断。

### dsh-trim-cot-leakage

- **触发时机**：审计或修复"推理转录泄露"式的文案时——死引用 `(decision 7)`、变更叙述（"used to" / "no longer"）、堆叠 PR 视角、面向评审者的辩解、控制流叙述、无标记的计划残留等。
- **作用**：判定标准是"HEAD 上没有任何会话上下文的读者能否解析每个引用"；附 8 类泄露分类法和保留例外清单。

### dsh-doc-site-sync

- **触发时机**：发布、更新、移动、删除文档网站（VitePress）页面；编辑 `website/docs.ts` 映射或导航；诊断页面在站点上缺失；修复投影链接；或网站内容变更后运行 `docs:dev` / `docs:check` / `doc-sync` 时。
- **作用**：仓库 Markdown 是唯一内容源，网站只是被测试的投影；规定 manifest 条目、链接投影规则与验证门禁。

### dsh-translate-docs

- **触发时机**：仅限用户显式点名调用（frontmatter 声明 `disable-model-invocation: true`），普通文档工作、其他 skill 或推断出的翻译需求都不会自动触发它。
- **作用**：扩展双语工作流（briefing 生成、子代理翻译、配对校验）；日常双语更新走 docs/AGENTS.md 的一次性最小路径。

## 整体观察

这套 skill 体系覆盖一条完整的开发流水线：**写文案 → 写/简化代码 → 录 GUI 证据 → 评审 → 推送前检查 → 堆叠 PR 落地 → 决策记录归档**。各环节通过相互引用（如 dsh-pre-push-checks 被 dsh-code-review、dsh-translate-docs 等引用）串成一体，且共同强调两个原则："是指导而非脚本（guidance, not a script/checklist）"、以及以最小够用的证据为行动依据。
