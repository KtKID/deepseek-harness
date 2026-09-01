执行 RimWorld 控制链冒烟,逐步汇报每一步的工具调用与返回摘要:

1. 调用 mcp__gabs__games_status 查看 rimworld 当前状态。
2. 若游戏未运行:调用 mcp__gabs__games_start(gameId 为 rimworld,超时给 120 秒),等待 started_connected;若已运行则跳过。
3. 调用 mcp__gabs__games_call_tool 执行 rimworld_rimbridge_ping,确认桥接连通(应返回 pong)。
4. 调用 games_call_tool 执行 rimworld_start_debug_game_ready,从主菜单启动内置测试殖民地并等待就绪。
5. 地图信息验证:先调用 games_call_tool 执行 rimworld_get_camera_state 拿到当前相机中心;再执行 rimworld_list_zones;最后以相机中心为矩形中心执行 rimworld_get_cells_info(8x8)。汇报:区域数量与类型、格子内容摘要(地形/物体/蓝图/设计标记)。
6. 给出结论:DSH → 工具 → GABS → RimBridge → RimWorld 每一环是否打通。

约束:只做读取与启动,不执行任何游戏内写操作(不建造、不改设置、不征召)。
