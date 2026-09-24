# rimworld_lab — 在 dsh 里 agent 驱动 RimWorld

## 目的

让 dsh(DeepSeek Harness)会话里的 agent 观测并操控 RimWorld。游戏能力的唯一来源是 RLE 侧交付的双 MCP(gabs-rimbridge + rimapi),本实验区只做三件事:把它们正式接进 dsh(`dsh-rimworld-lab` bundle)、提供冒烟任务与流程 skill、维护状态与收尾文档。历史路线(收编 RIMAPI Python 客户端 + 自研语义工具层 + TS worker 插件)已于 2026-09-05 删除,决策记录见 [status.md](status.md) 与 [task-delete-superseded-tools.md](task-delete-superseded-tools.md),删除前内容可通过 `git log --diff-filter=D -- rimworld_lab/` 定位历史提交后恢复。

## 目录构成

| 资产 | 作用 |
|---|---|
| [bundle/](bundle/README.md) | `dsh-rimworld-lab` 正式 bundle:两个 mcp-client 实例的接线层,装进 profile 即得全部工具 |
| [m1-rimapi-smoke/](m1-rimapi-smoke/README.md) | 双 MCP 全链路冒烟(启动→载档→观测);patch.yml 为自包含分发形态 |
| [m0-gabs-smoke/](m0-gabs-smoke/README.md) | gabs 段历史冒烟(只起游戏不涉 RIMAPI) |
| [game-startup/SKILL.md](game-startup/SKILL.md) | 只起游戏的流程 skill(待改写为双 MCP 启动顺序,见收尾清单) |
| [status.md](status.md) / [requirements.md](requirements.md) | 主线状态与需求文档(Phase P 转向待回填) |
| [wrapup-checklist.md](wrapup-checklist.md) | 收尾清单与未确认问题(唯一待办池) |
| [task-delete-superseded-tools.md](task-delete-superseded-tools.md) | 删除旧工具层的 qdev 交付文档 |
| roadmap.md / framework-plan.md | 历史路线文档,不再更新 |

## MCP 构成

两个 stdio MCP server 由 dsh 经 `@deepseek-ai/dsh-mcp-client` 拉起为子进程,职责不重叠:

| server | 上游 | 职责 | 工具面 |
|---|---|---|---|
| `gabs-rimbridge` | GABS v1.1.1(GABP/TCP 5174) | 游戏进程启动、存档加载、就绪等待、UI/截图自动化 | 13 个 `games_*` 顶层工具;`rimworld_*` 细粒度工具经 `games_call_tool` 路由 |
| `rimapi` | rimapi-mcp v4.0.2(HTTP/SSE 8765,随游戏进程加载) | 游戏运行期批量观测与动作下发 | 22 个 `rimapi_*`:观测 10(含 `drain_events` 事件轮询)+ 动作 12 |

挂载后模型可见工具名 `mcp__<serverName>__<工具名>`,共 35 个。两个 server 都可独立拉起,不需要先起游戏——游戏未运行时 `rimapi_ping` 返回 False 而非报错,"先挂插件、后起游戏"成立。

**启动顺序**(agent 视角):`games_start`(120s)→ `load_game_ready`/`start_debug_game_ready`(readiness=mapData)→ `rimapi_ping` 为 True 后再用全部 `rimapi_*`;tick 级步进、UI 操作、截图回到 `rimworld_*`。

**静默兜底告警**:`get_game_state`/`get_resources`(失败返回硬编码默认值)/`get_threats`/`get_alerts`/`get_weather` 失真不报错;关键决策前先 ping,数值敏感判断用 `get_research` 等无兜底工具交叉验证。

**上游真源**:`x-games/x-rimworld/RLE/configs/harness-mcp.v1.json`(连接配置)与 `RLE/docs/rimapi-mcp/README.md`(工具目录、事件轮询、错误语义);其变更后按 diff 同步 `bundle/cordis.patch.yml` 并 bump version。

## 使用方法

**安装**(每台设备、每个要用的 profile 一次;本机 headless 与 web 已装):

```bash
pnpm dsh plugin --profile web add /Volumes/machub_app/proj/agent/deepseek-harness/rimworld_lab/bundle
```

**验证**:

```bash
pnpm dsh --profile web --dump-config | grep -A2 rimworld-   # 组合里两行 mcp-client
# 会话里问 agent 工具面 → 35 个 mcp__*;server 进程名下有 gabs/rimapi-mcp 子进程
```

**跑冒烟**(会启动 Steam + RimWorld):

```bash
cd /Volumes/machub_app/proj/agent/deepseek-harness
pnpm dsh --profile headless "$(cat rimworld_lab/m1-rimapi-smoke/smoke-task.md)"
```

**跨设备迁移**:bundle 目录推 git 后 `dsh plugin --profile <name> add git+https://...`;路径差异用 env 覆盖(`RIMWORLD_GABS_BIN`/`RIMWORLD_GABS_STATE_DIR`/`RIMWORLD_RIMAPI_MCP_BIN`/`RIMWORLD_RIMAPI_URL`,缺省为主力机布局),详见 [bundle/README.md](bundle/README.md)。

**注意**:不要在 profile 用户层手写同名 serverName 的 mcp-client 行(重复即装载失败);配置层改动经 config-only HMR 热生效,bundle 层增删需重启该 profile 的常驻进程;web 上的可见位置为 设置→插件市场→已安装 与 Plugin Analyzer 设置页。
