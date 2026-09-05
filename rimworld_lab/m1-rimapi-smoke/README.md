# M1 链路冒烟:DSH → 双 MCP(gabs-rimbridge + rimapi)→ RimWorld

[m0-gabs-smoke](../m0-gabs-smoke/README.md) 只验证了 gabs 段;本模块补上 RLE 侧
新交付的 rimapi MCP(22 个 `rimapi_*` 工具),验证"启动游戏 → 载档 → 运行期观测"
的完整读链路。不涉及写操作与 RLE 跑局。

## 前置(2026-09-05 实测)

- **不需要 RLE 侧先启动任何东西**。两个 server 都是 stdio 子进程,由 dsh 自己拉起;
  游戏未运行、8765 不通时握手与工具发现照常完成(rimapi v4.0.2:22 工具;gabs
  v1.1.1:13 个 `games_*` 顶层工具,`rimworld_*` 细粒度工具经 `games_call_tool`
  路由——m0 结论)。游戏本身的启动是链路内的第 2 步,不是前置。
- Steam 可登录(SteamManaged 启动依赖);gabs 配置有效(m0 前置)。
- [patch.yml](patch.yml) 翻译自 `x-rimworld/RLE/configs/harness-mcp.v1.json`
  (绝对路径版);那边更新配置后按 diff 同步此处。

## 跑法(同 m0,二选一)

> 2026-09-05 起两个实例已常驻写入本机两个 profile 的用户层
> (`~/.dsh/profiles/headless/cordis.patch.yml` 与 `~/.dsh/profiles/web/cordis.patch.yml`,
> config-only HMR 热生效,改完无需重启 server),平时直接 `pnpm dsh --profile headless "<task>"`
> 即可,`--patch` 仅作自包含分发形态保留。web 层热生效证据:web server 名下出现
> `gabs`/`rimapi-mcp` 子进程。

A. 有 DeepSeek key:

```bash
cd /Volumes/machub_app/proj/agent/deepseek-harness
DEEPSEEK_API_KEY=sk-... pnpm dsh --profile headless \
  --patch rimworld_lab/m1-rimapi-smoke/patch.yml \
  "$(cat rimworld_lab/m1-rimapi-smoke/smoke-task.md)"
```

B. 本机 LM Studio:按 m0 README 的 B 方案临时改 `~/.dsh/settings.yaml`
(qwen3.8-27b-mlx),再同上跑,跑完改回 deepseek-v4-pro。

## 预期结果

- 会话工具面出现 `mcp__gabs-rimbridge__games_*`(13 个)与
  `mcp__rimapi__rimapi_*`(22 个)。
- 载档完成后 `rimapi_ping` 返回 True;`get_game_state`/`drain_events`/`get_map`
  返回真实游戏数据。
- 全程工具调用与结果进 DSH session log(可回放)。

## 已知缺口(冒烟时顺带验证)

- `rimapi_get_map` 工具表面不含地形网格/选址分析(MAP_SUMMARY)。若实测确认无
  选址锚点,向 RLE 侧提 rimapi2mcp 增工具需求——建造坐标"逐字取自 MAP_SUMMARY"
  的锚是既有设计(issue #26 教训:无稳定锚点蓝图会散落)。
- 静默兜底工具(`get_game_state`/`get_resources`/`get_threats`/`get_alerts`/
  `get_weather`)失败时返回默认值不报错;数值敏感的判断以 `get_research` 等
  无兜底工具交叉验证(上游 README 的告警清单)。
