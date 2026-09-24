# 删除被 rimapi-mcp 取代的本地 tools 层

> spec: 无,独立任务(rimworld_lab/status.md §三 Phase P 转向的收尾第一步)
> 创建: 2026-09-05

## ① 需求

### 功能方向

RLE 侧已交付 rimapi-mcp(22 个 `rimapi_*` 工具),dsh 侧经 `dsh-rimworld-lab`
bundle 正式接线并验证。本地 rimworld_lab 里为旧路线(TS 插件 + Python worker)
准备的工具层、收编客户端层、映射产物与独立 LLM 回路 skill 不再有消费方,删除,
让 lab 目录只保留仍在用的资产。

### 功能边界

- 做:删除 4 组共 27 个文件——`tool-protocol/` 全部 17 个(工具定义/装配/提示词/
  生成器/测试/文档)、`rimapi/` 收编客户端 7 个、`API-MAP.md` + `api-map.json`
  生成产物 2 个、`rle-api/SKILL.md` 1 个;清空 `__pycache__` 残留
- 不做:保留资产的改造(status.md / requirements.md / README.md 回填、
  game-startup skill 改写,见 wrapup-checklist.md 后续条目);git 提交;
  向上游登记能力缺口(清单已列在 wrapup-checklist.md)
- 修正:上一轮对话口头报"35 个文件"有误,实际 27 个(35 混入了保留文件)

### 不能破坏的不变量

- dsh 两个 profile 的 RimWorld 双 MCP 接线不受影响:bundle 层组合仍含两行
  mcp-client,headless 无 key boot 仍能拉起 rimapi-mcp 并完成任务
- 保留资产原样:bundle/、m0-gabs-smoke/、m1-rimapi-smoke/、game-startup/、
  status.md、requirements.md、README.md、roadmap.md、framework-plan.md、.gitignore
- 仓库工作区不引入新错误:删除仅限 rimworld_lab 内,git 状态只显示这 27 个
  文件的删除(不含其他意外改动)
- 可回溯:删除内容全部在 git 历史中,可通过 `git log --diff-filter=D -- rimworld_lab/` 定位删除提交后恢复

## ② 测试用例(先写,此刻失败)

### unit(树断言,纯 shell)

- `deleted-gone`:27 个路径全部不存在 → 功能方向
  此刻红:全部仍存在
- `kept-intact`:10 项保留资产全部存在 → 不变量 2(此刻绿,删除后仍须绿)
- `no-stale-refs`:保留的非文档资产(bundle/、m0-gabs-smoke/patch.yml、
  m1-rimapi-smoke/patch.yml)不引用被删模块(tool-protocol/api_catalog/
  read_catalog/rimapi\/client/api-map) → 不变量 2(此刻绿,删除后仍须绿)

### smoke(dsh 链路不受影响)

- `dump-rows`:`pnpm dsh --profile headless --dump-config` 输出恰好 2 行
  `name: '@deepseek-ai/dsh-mcp-client'` 且来自 `# == dsh-rimworld-lab` 层 → 不变量 1
- `keyless-boot`:`env -u DEEPSEEK_API_KEY pnpm dsh --profile headless "reply with: ok"`
  输出 ok 且日志出现 rimapi-mcp 启动 → 不变量 1

### e2e(按需)

不需要,依据:删除动作的最终消费者检查就是上述 smoke(真实 dsh 组合 + 真实
子进程拉起);真机游戏链路属 m1 冒烟,是收尾清单的独立条目。

## ③ 技术实现

### 实现步骤

1. `git rm -r` 四组路径(暂存删除,不提交)
2. `rm -rf` 清 `tool-protocol/`、`rimapi/`、`rle-api/` 目录残留(`__pycache__`
   为 gitignore 物理残留)
3. 跑 ② 全部断言与 smoke,绿后填 ④

### 涉及文件

- 删除:tool-protocol/**(17)、rimapi/**(7)、API-MAP.md、api-map.json、
  rle-api/SKILL.md
- 新增:本文档、wrapup-checklist.md(收尾清单,含未确认问题)

## ④ 验证结果

### 测试输出(2026-09-05,删除前红 → 删除后绿)

删除前:

```
清单数: 27 删除 / 16 保留
deleted-gone: 0/27 不存在 -> RED(预期,删除前)
kept-intact: PASS
no-stale-refs: PASS
```

删除后:

```
deleted-gone: 27/27 -> PASS
kept-intact: PASS
no-stale-refs: PASS
dump-rows: 2   (--dump-config 中 mcp-client 行数,来自 # == dsh-rimworld-lab 层)
keyless-boot: ok(日志含 rimapi-mcp stdio 启动;SSE retry 为等游戏上线,预期)
```

### 不变量回归

- `git status --short -- rimworld_lab` 暂存删除恰好 27 项,无其他改动;
  仓库其余部分仅既有的未跟踪条目(sessions/ 等),零波及。
- 双 MCP 接线经 bundle 层照常组合并真实拉起子进程(见 smoke 输出)。
- 删除内容均在 git 历史中,用 `git log --diff-filter=D -- rimworld_lab/` 定位删除提交后可恢复。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内(未动保留资产与上游仓库)
- [x] 不变量未破坏
