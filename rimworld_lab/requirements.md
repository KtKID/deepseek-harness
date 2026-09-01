# RIMAPI 收编与语义工具:Python 层 + DSH 按角色供 tools

> spec: rimworld_lab/status.md §二/§三(2026-08-31 拍板);DSH 侧机制调研结论(ctx.tools 注册/作用域/preset/subprocess seam,2026-08-31)
> feat: 无(主线 Phase R/T/P 的需求前置)
> 创建: 2026-09-01

## ① 需求

### 功能方向

把 RLE 的 RIMAPI 客户端层(5 文件)收编进 rimworld_lab,成为本实验的 API 真源;在其上实现语义化工具——一个工具覆盖一个语义领域,参数分发具体操作,细粒度 REST 端点不直接暴露给模型;按使用频率分批交付,首批覆盖获取信息、建造、存档读档;最终以 DSH 插件形态提供工具,支持给不同 agent 分配不同工具子集(而非全部塞给每个 agent),且卸载插件即干净移除其工具与进程资源。

### 功能边界

**做**:

- Phase R(无游戏可做):复制 `RLE/src/rle/rimapi/` 5 文件(client/schemas/api_catalog/sse_client/__init__)到 `rimworld_lab/rimapi/`,改包内相对导入,剥 `__pycache__`;补 terrain pin 失效信号;keyless 回放单测(fixture 对拍 2026-08-31 实机直调结果)。
- Phase T(需真机验证):8 个执行型读/控制工具(见 ③ 工具清单),执行体直接调收编 `RimAPIClient`;工具子集机制扩展到读工具;rle-api LLM 回路实测完整决策链。
- Phase P:两个 DSH 包——`rimworld-runtime`(provider:`ctx.rimworld` 服务,持有唯一 Python worker,ndjson JSON-RPC over stdio,经 `ctx.subprocess` seam 拉起)+ `tool-rimworld`(consumer:按 `config.tools` 注册语义工具子集,execute 委托服务);preset 按 agent 圈选工具;schema 漂移哨兵测试;可运行 example 快照。

**不做**:

- admission(P1)、episode controller(M2)、web 面(后续阶段)。
- GABS 的收编或其"收缩为启动器"的实现(仅约定分工,见待决 2)。
- 后置批次端点:factions/threats/world/things/animals/plants/def_all/quests/camera 截图(base64 图像走 DSH 图像 content 需单独设计)。
- pydantic→TS schema 自动生成管线:TS 侧手工 `defineTool`,配漂移哨兵测试兜底。
- 精确推 tick:RIMAPI speed 仅 0/3,episode 推进暂留 GABS `step_game_ticks`。
- `save_management` 的 `list` 动作:RIMAPI 无列档端点。

### 不能破坏的不变量

1. **RLE 仓库零写入**,其既有测试保持通过。
2. **卸载即净,两级语义**:consumer fiber dispose → 恰好该 scope 的工具出注册表,其他 agent 工具面不变,worker 存活;provider dispose → `ctx.rimworld` 注销、worker 进程树终结、pending 请求以明确错误拒绝(不悬挂到超时)。实现约束:工具注册只经 `ctx.tools.register`(注册即 effect),服务只经 `super(ctx, name)`,子进程只经 `ctx.subprocess`;无模块级全局状态。session log 中历史调用记录不抹除(append-only,模型可见 ⟺ 可重建)。
3. **单写者**:一个会话一个 provider 实例一个 worker,全部写操作经同一 worker 串行;GABS/RimBridge 侧写面不得并行打开。
4. **模型可见 ⟺ 可 log**:每个工具声明 `output: { schema, render }`;`map_info(kind=summary)` 的 render 输出与 prompts 包的 MAP_SUMMARY 文案格式逐字兼容(SHELTER/FARM/STOCKPILE SITE 坐标锚点),坐标必须可直接被写工具引用。
5. **写工具命名维持**:既有 14 个写工具 action_type 同名迁移;DSH 层加 `rimworld_` 前缀防碰撞。
6. **fail loud**:`config.tools` 出现未知名装载即抛;装配/校验对坏调用记录错误、不修复。
7. **pin 失效信号生效**:经本客户端 `load_game()` → 无条件清;`game_state` 比对 game_tick 回落 → 清;map id 变化 → 清。失效后重算,不沿用旧选址。

## ② 测试用例(先写,此刻失败)

### Phase R unit(test_rimapi,httpx.MockTransport 回放实机 fixture)

- `test_terrain_rle_decode_matches_field_capture` → 边界:250×250 网格、11824 项游程展开 62500 格、调色板分类 → 功能方向/不变量 7
- `test_siting_analysis_matches_field_capture` → 边界:中心 (129,137) 及三个选址矩形对拍 → 功能方向
- `test_envelope_unwrap_variants` → 边界:`{success,data}`、裸列表、envelope-only 写响应 → 功能方向
- `test_pin_invalidated_on_load/tick_regression/map_change` → 不变量 7
- `test_standalone_import` → 边界:仅 pydantic+httpx 依赖 → 功能方向

### Phase T unit(tools 包扩展)

- 8 个工具的 schema 形状与枚举(kind/action 枚举、map_id 默认值)→ 功能方向
- 角色子集:map_analyst 获得读集(原为空)、builder 获得读+建造+控制集 → 功能方向
- kind→客户端方法分发(mock 客户端)→ 功能方向

### Phase T smoke(需真机)

- rle-api 回路:模型调 `map_info` 拿到真实 MAP_SUMMARY,后续写工具坐标取自其中(非编造)→ 验收标准

### Phase P unit

- `config.tools` 子集注册:挂载后 `ctx.tools.schemas()` 恰为子集;未知名装载即抛 → 功能方向/不变量 6
- dispose 即净:consumer dispose → 其工具从 `schemas()` 消失;双 agent 场景互不影响 → 不变量 2
- provider dispose:服务注销、spawn 的子进程退出、pending 请求以 disposal 错误拒绝 → 不变量 2
- 漂移哨兵:TS `defineTool` 注册面 vs worker `catalog` 方法返回的 Python 侧名+schema 对拍 → 不变量 4 的前置

### Phase P snapshot / e2e

- snapshot:`examples/rimworld-lab` 起本地 fixture HTTP 服务回放录制的 RIMAPI 响应,断言 transcript 含真实形状 MAP_SUMMARY(keyless)→ 测试政策
- e2e:m0-gabs-smoke 正式化——dsh 会话主 agent 调 `rimworld_*` 拿真实游戏数据(需真机,opt-in)

## ③ 技术实现

### 工具清单(首批)

| 工具 | 参数 | 合并的端点 | 类别 |
|---|---|---|---|
| `game_state` | `kind: status\|overview` | game/state + 轻聚合 | 读 |
| `map_info` | `kind: summary\|zones\|rooms\|buildings\|power\|ore\|weather\|farm`,`map_id?` | map/* + 本地选址分析 | 读 |
| `colonists` | `kind: basic\|detailed\|positions`,`id?` | colonists* | 读 |
| `resources` | `kind: summary\|stored` | resources/* | 读 |
| `alerts` | — | ui/alerts | 读 |
| `research_info` | `kind: summary\|tree\|progress` | research/* | 读 |
| `save_management` | `action: save\|load`,`save_name` | game/save、game/load | 控制 |
| `pause_control` | `action: pause\|unpause`,`speed?`(1-3) | game/speed | 控制 |

写侧 14 个维持:blueprint、designate_area、growing_zone、stockpile_zone、work_priority、draft、move、job_assign、time_assignment、bed_rest、tend、toggle_power、research_target、research_stop。UI 渲染意图:读工具 generic/kind:'read';建造类 kind:'edit';存档与暂停 kind:'execute'。并发安全:读 true,写与控制 false。

### Phase R

1. 复制改导入:`from rle.rimapi.schemas import ...` → 相对导入。
2. pin 失效三信号进 `RimAPIClient`(见不变量 7)。
3. fixture 放 `rimworld_lab/rimapi/tests/fixtures/`,录自 2026-08-31 实机直调。
4. 验收:`from rimworld_lab.rimapi import RimAPIClient` 独立可用,测试绿。

### Phase T

1. `tool-protocol/tools/` 扩展 `ToolSpec`:8 个读/控制工具,pydantic 参数模型(schema 与校验同源),execute 调收编客户端。
2. catalog 给工具标语义域,`ROLE_TOOL_NAMES` 机制扩展读工具。
3. 验收:一次完整"模型→工具→真机 GET→真实数据回上下文→模型基于真实坐标决策"回路。

### Phase P

结构(provider/consumer 拆分,单写者与卸载语义共同要求):

```
packages/host/rimworld-runtime/   provider,会话挂一次
  RimworldRuntime extends Service → ctx.rimworld
  唯一 Python worker:rimworld_lab/rimapi/worker.py(ndjson JSON-RPC,
  {id,method,params}/{id,ok,result|error},asyncio 单循环持一个 RimAPIClient)
  经 ctx.subprocess 拉起;pending 表 + dispose 时统一 abort

packages/host/tool-rimworld/      consumer,每个 preset/agent scope 挂 N 份
  按 config.tools 注册子集;execute 委托 ctx.rimworld
```

Config(schemastery,无硬编码 tunable):`baseUrl`(默认 `http://localhost:8765`)、`python {command,args}`、`tools: string[]`(缺省全部,未知名抛)、`toolTimeoutMs`(存档/载档放宽)。

按 agent 圈选(preset,`agentPresets.roots` 指向 `rimworld_lab/presets`):

```yaml
# presets/analyst/agent.cordis.yml
- id: rimworld-lab
  name: '@deepseek-ai/dsh-tool-rimworld'
  config:
    python: { command: .venv/bin/python, args: [rimworld_lab/rimapi/worker.py] }
    tools: [game_state, map_info, colonists, resources, alerts]
# presets/builder/agent.cordis.yml → tools: [game_state, map_info, colonists,
#   blueprint, designate_area, growing_zone, stockpile_zone, save_management, pause_control]
```

动态子 agent 用 `tool-subagent` 的 `toolFilter: {allow: [...]}`,零新代码;`ctx.tools.restrict` 兜底。同一插件多实例分别落各 scope 层,互不可见。

### 待决(不阻塞)

1. 工具前缀 `rimworld_`(本文件采用)vs status.md 草写的 `rimworld_lab_*`,纯命名取舍。
2. GABS 收缩为启动器的具体落地(本任务只写分工约定进文档)。
3. RIMAPI 精确推 tick 是否可行(speed 仅 0/3,status.md §五.2 已登记)。
4. 写路径单写者的跨会话语义(episode 边界由谁持有)。

### 涉及文件(2026-09-01 实际交付)

- rimworld_lab/rimapi/{__init__,client,schemas,api_catalog,sse_client}.py:收编副本,相对导入,零 rle 依赖
- rimworld_lab/rimapi/client.py:transport 测试 seam + pin 失效三信号(_invalidate_terrain_pin)
- rimworld_lab/rimapi/tests/{conftest.py,test_client.py}:10 个 MockTransport 回放测试
- rimworld_lab/tool-protocol/tools/read_catalog.py:8 个读/控制工具 + ROLE_READ_TOOLS + format_map_summary
- rimworld_lab/tool-protocol/tools/tests/test_read_catalog.py:12 个单测(stub 客户端分发断言)
- rimworld_lab/tool-protocol/tools/tests/conftest.py:补 rimworld_lab 根路径(rimapi.schemas 可导入)
- rimworld_lab/tool-protocol/tools/__init__.py:导出面扩展

## ④ 验证结果

### 测试输出(2026-09-01,于 RLE uv 环境 `uv run pytest`)

Phase R(rimworld_lab/rimapi/tests):

```
..........                                                              [100%]
10 passed in 0.10s
```

Phase R 验收:rimworld_lab 根上 `import rimapi` 独立可用;grep 确认副本零 `rle` 导入。

Phase T 单测(rimapi + tool-protocol 全部,含既有 25 个):

```
...............................................                        [100%]
47 passed in 0.16s
```

RLE 回归(全量,排除 4 个本任务开始前即无法收集的测试模块,见偏离说明):

```
576 passed in 19.18s
```

### 偏离与说明

- **fixture 为合成数据**:未找到 2026-08-31 实机直调的原始 JSON 存档,测试按当时确认的响应形状(RLE 游程网格+调色板、`{"success,data}` 信封、game/state 的 `game_tick` 字段)手工构造 40×40 网格,选址期望逐格推演得出;真机复拍后如有偏差,以实测修 fixture。
- **RLE 既有损坏与本任务无关**:RLE 工作区 26 处改动均为开始前既有,其中 4 个测试模块无法收集(tests/unit/test_base_role.py 被改、3 个未跟踪的 test_self_evo_* 引用尚不存在的 rle.orchestration.self_evo.config);本任务对 RLE 零写入,故回归数字为排除后的 576(status.md 此前基线 621 是在 self_evo 改动出现之前测得)。
- **Phase T smoke 未跑**:模型→工具→真机 GET→真实坐标决策的完整回路需 RimWorld + RIMAPI 在线,待真机;单测以 stub 客户端锁定分发与文案。
- Phase P(DSH 两包)未开始。

### 结论

- [x] Phase R 所有需求点被测试覆盖且真实跑过通过
- [x] Phase T 单测层通过;smoke 与 Phase P 待后续
- [x] 实现在边界内(RLE 零写入)
- [x] 不变量未破坏(卸载语义/单写者属 Phase P 交付,Python 层已埋点:pin 失效信号)
