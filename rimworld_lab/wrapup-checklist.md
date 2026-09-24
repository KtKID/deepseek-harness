# rimworld_lab 收尾清单(Phase P 转向:rimapi-mcp 组合路线)

> 更新:2026-09-05。主线从"TS 插件 + Python worker 自研工具层"转向
> "RLE 侧 rimapi-mcp + dsh 侧 mcp-client 组合"。本清单是转向后的唯一待办池,
> 完成一项勾一项;未确认问题单列,阻塞与否已标注。

## 已完成(2026-09-05)

- [x] 双 MCP 接线验证:rimapi-mcp v4.0.2(22 工具)、gabs-rimbridge v1.1.1
  (13 个 `games_*`)均可独立 stdio 拉起,不需要先起游戏/RLE 侧进程
- [x] headless 真会话验证 35 个 `mcp__*` 工具可见
- [x] 正式化为 `dsh-rimworld-lab` bundle(见 bundle/README.md),经
  `dsh plugin add` 装进 headless 与 web 两个 profile(正式 reconcile 路径)
- [x] 路径参数化(`!!js` env,缺省主力机布局),支持跨设备迁移(git add 或 npm)
- [x] 两个 profile 用户层手写行清除(避免重复 serverName 装载冲突)
- [x] web server 重启装载 bundle 层(127.0.0.1:60060,子进程 gabs + rimapi-mcp 在)
- [x] 删除被取代的本地 tools 层 27 文件(task-delete-superseded-tools.md,
  27/27 断言绿,dsh 链路回归通过)

## 待办(顺序)

- [ ] **真机 m1 冒烟**:跑 m1-rimapi-smoke/smoke-task.md(开 Steam/RimWorld,
  games_start → 载档 → rimapi_ping=True → 观测链),第 7 步顺带裁决选址缺口
- [ ] **status.md / requirements.md 回填**:Phase P 从"rimworld-runtime provider +
  tool-rimworld consumer 两包"改为"dsh-rimworld-lab bundle + mcp-client";
  §五待决 1(插件调 Python 机制)以 (c) 落地关闭;删除决定落档
- [x] **README.md 重写**(2026-09-05):lab 总览——目的、目录构成、MCP 构成、使用方法
- [ ] **game-startup/SKILL.md 改写**:双 MCP 启动顺序 + 事件轮询节奏 +
  静默兜底清单(上游 docs/rimapi-mcp/README.md 的四类约定进模型视野)
- [ ] **bundle 推 git 仓库**(托管位置未定,见未确认 5),跨设备迁移才算闭环
- [ ] (可选)按角色分工具子集:主 agent 全量;子 agent 用 tool-subagent
  `toolFilter.allow`,零新代码——待真实多 agent 场景验证必要性

## 未确认问题

### 对上游(RLE 侧)

1. **选址分析缺口(阻塞建造质量,建议冒烟后立刻提)**:rimapi-mcp 22 工具中
   未见地形网格/选址输出(MAP_SUMMARY、SHELTER/FARM/STOCKPILE 锚点)。
   本地兜底已删(rimapi/client.py,可从 git 历史(`git log --diff-filter=D -- rimworld_lab/`)捞);坐标无锚会重演
   issue #26(蓝图散落)。若确认缺 → 提 rimapi2mcp 增 map_terrain/siting 工具。
2. **6 个缺失写工具是否在 rimapi2mcp 待办**:growing_zone、stockpile_zone、
   time_assignment、bed_rest、tend、research_stop(本地工具层已删,不阻塞冒烟)。
3. **terrain pin 失效三信号是否进了 rimapi-mcp**:load 清 / game_tick 回落清 /
   map_id 键控(pin 已随收编层迁入上游进程,失效语义归上游维护)。
4. **多会话共享形态**:stdio 每会话一进程一条 SSE(当前);何时切 HTTP 长驻
   (rimapi-mcp --transport http --port 8800 + mcp-client streamable-http,
   "一条 SSE、一个 terrain pin"收敛)——待多会话并发需求出现再定。

### 本机/流程

5. **bundle 的 git 托管位置未定**:迁移目标设备前要定(自建 git / npm scope)。
6. **web 会话工具面复确认**:web server 重启后(2026-09-05 15:5x,PID 18647)
   需在原 web 会话再问一次工具面,确认 35 个 `mcp__*`(用户操作项)。
7. **uv/venv 冷启动开销**:rimapi-mcp 二进制直启(已不用 uv run 包壳)很快,
   但 RLE 侧 `uv sync --extra mcp` 重建 venv 后二进制路径不变性未验证——
   换设备按 bundle/README.md 的 env 覆盖即可,本机无需动作。

## 资产现状(删除后)

| 资产 | 状态 |
|---|---|
| bundle/ | dsh-rimworld-lab 正式 bundle(已装 headless+web) |
| m1-rimapi-smoke/ | 冒烟任务+预期(待真机跑);patch.yml 降级为自包含分发形态 |
| m0-gabs-smoke/ | 历史冒烟(gabs 段,已跑通链路的一半验证) |
| game-startup/SKILL.md | 待改写(收尾待办) |
| status.md / requirements.md / README.md | 待回填/重写(收尾待办) |
| roadmap.md / framework-plan.md | 历史文档,不再更新 |
| task-delete-superseded-tools.md | 本轮删除任务的 qdev 交付文档 |
| 已删:tool-protocol/、rimapi/、API-MAP.*、rle-api/ | git 历史(`git log --diff-filter=D -- rimworld_lab/`)可恢复 |
