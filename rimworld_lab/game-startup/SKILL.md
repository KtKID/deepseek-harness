---
name: game-startup
description: 在 rimworld_lab 工具链里只启动 RimWorld 游戏(GABS SteamManaged)+ 验证桥接 + 确认 RIMAPI(8765)就绪的流程,不含 RLE 跑局与日志流。当用户要"启动游戏"、"起游戏"、"验证 8765"、或准备用读工具 GET 地图信息时使用。完整 RLE 跑局+dashboard 监控见 x-rimworld 的 rle-live-monitor skill。
---

# RimWorld 启动流程(仅游戏,不含 RLE)

目的:为 rimworld_lab 的读工具(GET RIMAPI 地图/状态)和链路冒烟提供"游戏在跑、8765 在响应"的前置状态。RLE 跑局进程、serve_dashboard 日志流都不在本流程内。

## 端口/组件拓扑

| 组件 | 是谁 | 谁起 | 没它会怎样 |
|---|---|---|---|
| **GABS**(`tools/GABS/gabs`) | 游戏启动器,MCP server | 手动执行命令 | 游戏起不来 |
| **8765** | RIMAPI mod 的 REST + 游戏事件 SSE(跑在游戏进程里) | 游戏启动自动起 | 读工具/GABS 桥接验证都拿不到游戏数据 |

## 启动流程(2 步)

### 1. 启动游戏(GABS SteamManaged)

1. 预检:`cd /Volumes/machub_app/proj/x-games/x-rimworld/tools/GABS && ./gabs games doctor rimworld --configDir state`,确认 Launch Mode=SteamManaged、app 294100、app id file ready、Configuration: valid;有 bridge.json 权限警告就 `chmod 700 state/rimworld` 目录、`chmod 600 state/rimworld/bridge.json`(文件含 per-launch bridge token)。
2. 启动:`./gabs games start rimworld --configDir state`(CLI),等 started_connected;经 MCP 客户端则 `games_start {gameId: "rimworld", timeout: 120}`。游戏冷启动约 1-2 分钟,Steam 需在线。
3. 验证桥接:`games_call_tool rimworld_rimbridge_get_bridge_status`,要求 `patches.essentialApplied: true`、无 patch failure。`programState: "Entry"` 是正常的(游戏在主菜单)。
4. 确认 RIMAPI 起来:`curl -m 3 http://localhost:8765/api/v1/game/state` 返回 `{success: true, data: {...}}` 信封 JSON。

Mod 链(Harmony 2.4.2.0 → Core → RimBridgeServer → RIMAPI)和 ModsConfig.xml 之前已配好,一般不用动。

### 2. 加载存档(有地图数据的前提)

**`/map/*` 类 GET(terrain/zones/rooms/ore)需要游戏内存在当前地图**——主菜单状态(Entry)下调它们会失败。两种方式:

- **手动**:人在游戏里点存档加载(当前协作模式:agent 起游戏后停下,由人加载)。
- **工具**:`rimworld_load_game_ready`(带 mod 兼容校验,精确 saveName,ready 到 playable)或 `rimworld_start_debug_game_ready`(内置测试局,免存档)。

加载完成后 `curl "http://localhost:8765/api/v1/map/terrain?map_id=0"` 能返回网格数据即就绪。

## 读侧直调(不依赖 RLE 进程)

RIMAPI 是游戏进程内的 HTTP 服务,RLE 只是它的一个客户端;任何 curl/httpx 都能直调。要点:

- 必须带 `map_id`(地形/区域类端点)。
- python 客户端要 `trust_env=False` 或 `NO_PROXY=localhost,127.0.0.1`(系统代理会拦 localhost,503 空 body;curl 不读系统代理无此坑)。
- 响应是 `{success, data}` 信封,取 `data`。
- "推荐选址(SHELTER/FARM/STOCKPILE)"不是 mod 能力:RIMAPI 只给原始地形网格+调色板(0 可建/1 水/2 肥沃),选址是 RLE 客户端 `_find_clear_rect`(`src/rle/rimapi/client.py`)本地算的——脱离 RLE 复刻 MAP_SUMMARY 需把这段分析(~60 行)搬到调用方。

## 踩过的坑(症状 → 原因 → 处理)

| 症状 | 原因 | 处理 |
|---|---|---|
| `gabs server` 起来但 gameCount=0 | 没带 `--configDir state` | 显式传 configDir 或在 tools/GABS 目录下执行 |
| doctor 报 endpoint state file broadly readable | bridge.json 权限 0644 | chmod 600(见上) |
| 桥接验证返回 `programState: "Entry"` | 游戏在主菜单,正常 | 不是错误;地图类调用前先加载存档 |
| curl 8765 返回裸 JSON 但自建客户端解析失败 | 客户端没按 `{success, data}` 信封解析 | 取 `data` 字段 |
| python 直调 8765 全 503 空 body,curl 同款 200 | httpx/openai SDK trust_env 读 macOS 系统代理 | `trust_env=False` 或带 `NO_PROXY` |
| `/map/terrain` 报无当前地图/无效 map_id | 游戏还在主菜单,没有 CurrentMap | 先加载存档或开测试局 |

## 清理

- 停游戏:`./gabs games stop rimworld --configDir state`(或 MCP `games_stop`)。
- GABS state(`state/rimworld/bridge.json` 等)含 token,改完权限保持 0600。
- **不要动 60082(serve_dashboard)和 RLE 跑局进程**——那属于 rle-live-monitor 流程;清理前 `lsof -nP -iTCP:60082 -sTCP:LISTEN` 确认进程归属,不是自己起的不要动(有过误杀断流的前科)。
