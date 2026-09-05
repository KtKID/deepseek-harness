执行 RimWorld 双 MCP 全链路冒烟,逐步汇报每一步的工具调用与返回摘要:

启动段(gabs-rimbridge):

1. 调用 mcp__gabs-rimbridge__games_status 查看 rimworld 当前状态。
2. 若游戏未运行:调用 mcp__gabs-rimbridge__games_start(gameId 为 rimworld,超时给
   120 秒),等待 started_connected;若已运行则跳过。
3. 载入殖民地:优先调用 mcp__gabs-rimbridge__games_call_tool 执行
   rimworld_load_game_ready(saveName 取可用的最新存档,readiness 为 mapData,
   ignoreModCompatibility 为 true);没有可用存档则改执行
   rimworld_start_debug_game_ready(readiness 为 mapData)。

观测段(rimapi):

4. 调用 mcp__rimapi__rimapi_ping,应返回 True。若返回 False,说明 RIMAPI 未随
   游戏加载到位——停下报告,不要继续调用其他 rimapi_* 工具。
5. 调用 mcp__rimapi__rimapi_get_game_state,汇报殖民地/殖民者/资源/科研概要。
6. 调用 mcp__rimapi__rimapi_drain_events,汇报事件数、remaining 与 dropped_total。
7. 调用 mcp__rimapi__rimapi_get_map,汇报建筑/蓝图/区域/矿脉摘要;特别说明返回
   里是否含可用作建造坐标锚点的选址信息(SHELTER/FARM/STOCKPILE 类推荐位点)。

结论:DSH → 两个 MCP server → RimWorld 每一环是否打通;rimapi 工具面是否已覆盖
推荐选址锚点——没有就明确说没有。

约束:只做启动、载档与读取,不执行任何游戏内写操作(不建造、不改设置、不征召、
不暂停、不存档)。
