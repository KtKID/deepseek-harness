# RimWorld Lab 状态与下一阶段计划

> 更新:2026-08-31。本文档是工作总结与执行计划;路线背景见 roadmap.md,原框架方案存档于 framework-plan.md(不再更新)。当前主线:**收编 RIMAPI 客户端层 → 语义化工具 → DSH 插件提供 tools**。

## 一、已完成(2026-08-31)

1. **方案与边界**:framework-plan.md——host 插件 + 薄 bundle、pydantic→TS 协议生成管线、GABS 门面、web 面,M0-M2 映射;功能边界表(GABS 管控制/RLE 管观测评分/lab 管协议与编排)。
2. **实验 A Phase 1(tool-protocol 模块)**:`tools/` 包 14 个写动作工具(pydantic 参数模型,schema 与校验同源)+ 装配器(tool_calls→ActionPlan,逐条校验、错误收集、不修复)+ `prompts/` 包协议版提示词(角色文案从 RLE 类提取零漂移;map_analyst 有记录改写)。25 测试绿;RLE 全量 621 测试回归绿;RLE 仓库零写入。顺带修两个协议 bug:tend 的 `doctor_pawn_id`→executor 实读的 `doctor_id`(旧值被静默丢弃);`priority: 1-10` 从未被执行器读取,移除。
3. **rle-api skill**(→ `rimworld_lab/rle-api/`):任意 OpenAI 兼容 LLM 挂工具的调用说明。LM Studio 实测(qwen3.8-27b-mlx,construction_planner):一次 14 个并行 tool_calls、装配 0 错误、每殖民者一条 work_priority、坐标取自 MAP_SUMMARY、只用了本角色 3 个工具未越权。验证结论:`</think>` 预填与 tools 兼容;NO_PROXY 防系统代理 503。
4. **GABS/RimBridge MCP 表面核对**:125 个工具。有底层地图原语(`get_cell_info`/`get_cells_info` ≤1024 格、`list_zones`、`list_areas`、`flood_fill_cells`),无整幅地形网格导出。**不对等真相:推荐选址从来不是 mod 能力**——RIMAPI 只给游程编码网格+调色板,选址是 RLE 客户端 `_find_clear_rect` 本地算的。
5. **m0-gabs-smoke 模块**:DSH + mcp-client(stdio 拉起 `gabs server`,必须带 `--configDir state` 否则 gameCount=0)的冒烟配置与任务文本;LLM 选择(DeepSeek key / LM Studio)待定,未跑。
6. **game-startup skill**(→ `rimworld_lab/game-startup/`):只起游戏的流程(GABS doctor→启动→桥接验证→8765 确认→"有地图数据需先载档"前提),去掉 RLE 跑局与日志流部分。
7. **实机链路验证(零 RLE、零 DSH)**:GABS 起游戏(pid 48148)→ 人载存档 → 直调 `GET /api/v1/{game/state,colonists,map/zones,map/terrain}` → 脚本就地复刻选址分析,产出真实 MAP_SUMMARY(250×250 网格,RLE 编码 11824 项展开 62500 格;中心 (129,137) 及三个选址矩形)。
8. **认知沉淀**:terrain 响应为 RLE 游程编码一维数组(`[count, 下标, ...]`);`_terrain_summary_pin` 是一次性冻结缓存——优化的不是速度而是**稳定性**(issue #26:每 tick 按殖民者位置均值重算锚点,推荐坐标漂移,"选址追着建造者跑",10 个庇护所蓝图散落无一完成);pin 无失效逻辑,换图/重载不刷新,移植时必须补失效信号。

## 一·五、本轮新增(2026-09-01,详见 requirements.md ④)

9. **Phase R 完成**:rimapi 5 文件收编进 `rimworld_lab/rimapi/`(相对导入、零 rle 依赖、`trust_env=False` 保留),补 pin 失效三信号(load 经客户端清除 / game_tick 回落清除 / 按 map_id 键控),加 transport 测试 seam;10 个 MockTransport 回放测试绿。注意:fixture 是按实机响应形状手工构造的合成数据,真机复拍后以实测校正。
10. **Phase T Python 层就绪**:`tool-protocol/tools/read_catalog.py` 8 个读/控制工具(game_state/map_info/colonists/resources/alerts/research_info/save_management/pause_control,Literal 枚举进 schema,执行体调收编客户端)+ ROLE_READ_TOOLS 角色读子集 + format_map_summary(与 base_role 文案逐字对齐);12 个单测绿,tool-protocol 全部 37 绿。真机 LLM 回路待跑。
11. **API-MAP 生成系统**(2026-09-01):`ReadToolSpec.endpoints` 声明式映射 + `gen_api_map.py` 生成 API-MAP.md/api-map.json(顶部中文警示,禁手编);覆盖统计 GAME_CONTROL 5/5 · READ 15/46 · WRITE 14/29,未覆盖端点表即待办池;client↔catalog 漂移核对揪出 8 条 client-only path(含 /api/v1/colonist vs /api/v1/colonist/detailed)。守门 7 测:新鲜度对拍 + 三类非法输入拒绝。增删顺序见 README.md。

## 二、架构决策(2026-08-31 拍板)

1. **收编 RIMAPI 客户端层**:把 `RLE/src/rle/rimapi/`(5 个文件:`client.py`、`schemas.py`、`api_catalog.py`、`sse_client.py`、`__init__.py`)复制进 rimworld_lab 复用。**已验证:该目录零依赖 RLE 其他模块,外部仅 pydantic + httpx,复制即用**。RLE 仓库自此完全可不用。
2. **tools 直接调 Python 接口**:工具的执行体调用收编后的 `RimAPIClient` 方法,GET/POST 由接口内部完成(`trust_env=False` 已内建,免疫系统代理坑)。
3. **语义化工具,不与 API 一一对应**:一个 tool 覆盖一个语义领域,参数分发具体操作。例:`save_management(action=list|load|save, saveName?, readiness?)`;`map_info(kind=summary|zones|terrain)`。细粒度 REST 端点留在 Python 层,不直接暴露给模型。已有的 14 个写工具命名维持(action_type 同名),新读工具按此原则设计。
4. **API 层处理好后制作 DSH 插件;插件的基础功能是提供 tools**(读 + 写)。admission(P1)、episode controller(M2)、web 面后置。

对 roadmap 的修订影响:P2"正式 tool 名/参数由 TypeScript 源码拥有"调整为——**模型可见 schema 属插件层,API 语义与执行属本 Python 层**(Python 层成为 API 真源,TS 移植管线仅在需要时做)。待统一后回写 roadmap。

## 三、接下来做的(顺序)

> 详细需求、测试用例与技术设计已定稿:[requirements.md](requirements.md)(含 DSH 侧按 agent 分工具与卸载即净的机制结论)。

### Phase R:收编 API 层(无游戏可做)——✅ 2026-09-01 完成(见 §一·五 与 requirements.md ④)
- 复制 5 文件到 `rimworld_lab/rimapi/`,剥离 `__pycache__`,确认独立 import(仅 pydantic+httpx)。
- 补 pin 失效信号(game_tick 回落 / map id 变化 / 重载),消除"换图用旧选址"坑。
- keyless 单测:fixture 回放或 mock httpx,对拍 2026-08-31 实机直调结果(terrain 解码、选址、信封解析)。
- 验收:`python -c "from rimworld_lab_rimapi ..."` 可用(或包内相对结构),测试绿。

### Phase T:语义化读工具(需真机验证)——Python 层已就绪(§一·五),剩真机 LLM 回路
- `tools/` 包新增**执行型**读工具(调收编接口):`game_state`、`map_info(kind=...)`(含选址分析→MAP_SUMMARY)、`colonists`、`save_management(action=...)`、`pause_control(action=pause|unpause)` 等,清单以"语义领域 × 参数"原则定稿。
- 在 rle-api 的 LLM 回路里实测:模型调 `map_info` 拿到真实 MAP_SUMMARY 并给出真实坐标的决策。
- 验收:一次完整"模型→工具→真机 GET→真实数据回上下文→模型基于真实坐标决策"的回路。

### Phase P:DSH 插件(基础功能 = 提供 tools)
- `packages/host/rimworld-lab` 插件,注册上述语义工具。
- **一个待决机械问题**:DSH 插件是 TypeScript,如何调用 Python 接口层——
  (a) TS 工具 execute 起常驻 stdio JSON-RPC worker(Python,持有收编层与连接)——**推荐**:单一真源、连接复用;
  (b) 每次调用起一次性 CLI 子进程——最简单,慢;
  (c) 把收编层包成 MCP server 走 mcp-client——零 TS 插件代码,但"插件提供 tools"退化为组合配置。
- 验收:dsh 会话中主 agent 调 `rimworld_lab_*` 工具拿到真实游戏数据(m0-gabs-smoke 的正式化)。

### 之后(不在本阶段)
写工具执行链与单写者约束、llm/stream admission(P1)、episode controller(M2)、web 面与 rle.log/rle.ctrl 协议管线(真源改到收编层后管线随之调整)。

## 四、资产索引(rimworld_lab/)

| 目录/文件 | 内容 | 状态 |
|---|---|---|
| roadmap.md | 原始路线(P1/P2 决策、M0-M4) | 部分将被 §二 决策修订 |
| framework-plan.md | 原框架方案(存档) | 不再更新 |
| status.md | 本文 | 持续更新 |
| requirements.md | Phase R/T/P 需求文档(工具清单/不变量/测试用例/设计) | 定稿待实现 |
| README.md | API-MAP 生成系统说明(产物/数据源/再生成/增删顺序) | 交付 |
| API-MAP.md / api-map.json | 工具↔API 对应关系(生成物,禁手编) | 生成器:tool-protocol/tools/gen_api_map.py |
| tool-protocol/ | 实验 A:tools 包(14 写工具+装配)、prompts 包、task 文档、runner 设计 | 交付,25 测试绿 |
| rle-api/ | 任意 LLM 挂工具的调用说明 skill | 交付,实测过 |
| game-startup/ | 只起游戏流程 skill | 交付,实测过 |
| m0-gabs-smoke/ | DSH+GABS 冒烟配置 | 待跑(LLM A/B 未定) |

## 五、待决问题

1. **插件调 Python 的机制**:Phase P 的 (a)/(b)/(c),倾向 (a)。
2. **控制链分工**:按决策 3 的示例,存档读写/暂停走 RIMAPI 接口工具,则 GABS 收缩为"游戏进程启动器";roadmap 原文(启动/加载/推进全走 GABS/RimBridge,含 step_game_ticks 精确推进)需与之对齐后回写——RIMAPI 侧能否精确推 tick 待验证(speed 只有 0/3)。
3. **写路径单写者**:RIMAPI 直写(RimAPIClient 写方法)与 GABS/RimBridge 写并存会破坏"每 episode 单一写 owner"不变量,Phase T 扩展到写工具前必须先定。
