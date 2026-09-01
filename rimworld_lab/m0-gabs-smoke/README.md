# M0 链路冒烟:DSH → GABS MCP → RimWorld(不需要 RLE)

一次性验证:DSH 主 agent 通过 mcp-client 调 GABS 工具,启动游戏并读取地图信息。
不涉及 RLE 进程与 RIMAPI(8765);地图读取走 RimBridge 的 `rimworld_list_zones` /
`rimworld_get_cells_info`。

## 前置(已验证)

- GABS 配置有效:`gabs games doctor rimworld --configDir state` → Launch Mode=SteamManaged、
  app 294100、配置 valid(2026-08-31 实测通过,历史成功启动 9 次)。
- Steam 可登录(SteamManaged 启动依赖)。
- `gabs server` 不带 `--configDir` 时 gameCount=0——patch.yml 已显式带 state 目录。
- bridge.json 当前 0644(GABS 建议收紧到 0600:文件在 `tools/GABS/state/rimworld/`,
  含 per-launch bridge token;不阻塞冒烟)。

## 跑法(二选一,取决于主 agent 用哪个 LLM)

A. 有 DeepSeek key(用你 settings 里的 deepseek-v4-pro):

```bash
cd /Volumes/machub_app/proj/agent/deepseek-harness
DEEPSEEK_API_KEY=sk-... pnpm dsh --profile headless \
  --patch rimworld_lab/m0-gabs-smoke/patch.yml \
  "$(cat rimworld_lab/m0-gabs-smoke/smoke-task.md)"
```

B. 用本机 LM Studio(qwen3.8-27b-mlx):需要临时改 `~/.dsh/settings.yaml` 两处——
`llm-deepseek.models` 增加一条 `{id: qwen3.8-27b-mlx, name: Qwen3.8-27B, contextWindow: 131072}`,
`agent-default-model.model` 改为 `qwen3.8-27b-mlx`——然后:

```bash
DEEPSEEK_API_KEY=lm-studio DEEPSEEK_BASE_URL=http://localhost:1234/v1 pnpm dsh --profile headless \
  --patch rimworld_lab/m0-gabs-smoke/patch.yml \
  "$(cat rimworld_lab/m0-gabs-smoke/smoke-task.md)"
```

跑完把 settings 改回 deepseek-v4-pro。LM Studio 侧模型保持当前加载即可。

## 预期结果

- 会话工具面出现 `mcp__gabs__*`(games_status/games_start/games_call_tool 等;
  RimWorld 细粒度工具经 games_call_tool 路由,名如 `rimworld_rimbridge_ping`)。
- RimWorld 被拉起并连桥;ping 返回 pong;测试殖民地就绪。
- `list_zones` / `get_cells_info` 返回真实地图 JSON(zones 类型与数量、格子内容)。
- 全程工具调用与结果进 DSH session log(可回放)。

## 已知偏离与后续

- transport 用 stdio(mcp-client 拉起并托管 `gabs server` 进程),roadmap 写的是
  Streamable HTTP :17681——stdio 免守护进程管理,冒烟等价;HTTP 形态待确认
  `gabs server` 是否有对应参数后再切。
- 加载用的是 `start_debug_game_ready`(免存档、最快);M0 正式验收仍按 roadmap
  用精确 `saveName` + `load_game_ready(playable)` + `step_game_ticks` 验证 T1−T0=600。
- RimBridge 与 RIMAPI 观测不对等的实情:MCP 缺的是**整幅地形网格的一次性导出**
  (RIMAPI `GET /api/v1/map/terrain` 返回网格+调色板);所谓"推荐选址
  (SHELTER/FARM/STOCKPILE)"从来不是 mod 能力,是 RLE Python 客户端
  (`src/rle/rimapi/client.py` 的 `_find_clear_rect`)在本地从网格算的。
  MAP_SUMMARY 级观测要么继续走 RIMAPI 网格 + RLE 分析,要么后续给 MCP 补桥。
