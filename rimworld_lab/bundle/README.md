# dsh-rimworld-lab — RimWorld 双 MCP 接线 bundle

**给使用者的一句话**:安装 `dsh-rimworld-lab` 这一个插件,即同时获得两个 RimWorld
MCP(gabs-rimbridge 管游戏启动/存档、rimapi 管运行期观测/动作,共 35 个
`mcp__*` 工具);在 web 设置→插件市场→已安装 里卸载它,两个 MCP 连同其子进程
一起移除,重启后不留任何配置残留。装与卸都是单一单元,不存在"只装一半"。

一个纯组合层的 dsh profile bundle(零逻辑代码):把两个 MCP server 以
`@deepseek-ai/dsh-mcp-client` 实例插进任意 profile 的组合。

- **gabs-rimbridge** — 游戏进程启动/存档加载,13 个 `games_*` 顶层工具,
  `rimworld_*` 细粒度工具经 `games_call_tool` 路由。
- **rimapi** — 运行期观测/动作,22 个 `rimapi_*` 工具;游戏未启动时
  `rimapi_ping` 返回 False 不报错,所以"先挂插件、后起游戏"成立。

挂载后模型可见工具名:`mcp__gabs-rimbridge__games_*`、`mcp__rimapi__rimapi_*`。

## 安装(每个设备、每个要用的 profile 一次)

```bash
# 本机(路径安装;相对路径会按调用目录锚定,建议绝对路径)
pnpm dsh plugin --profile web add /Volumes/machub_app/proj/agent/deepseek-harness/rimworld_lab/bundle
pnpm dsh plugin --profile headless add /Volumes/machub_app/proj/agent/deepseek-harness/rimworld_lab/bundle

# 迁移到其他设备:推到 git 后
pnpm dsh plugin --profile web add git+https://<host>/<org>/rimworld-lab-bundle.git
# pnpm ≥10 会拦 git 依赖的 prepare 构建脚本:按报错把 key 加进
# ~/.dsh/profiles/<name>/pnpm-workspace.yaml 的 allowBuilds 再重跑。
```

安装后 profile 的 `dsh.profile.bundles` 自动登记本包(`dsh plugin` 的
reconcile 语义);**不要**再在 profile 用户层手写同名 serverName 的
mcp-client 行——重复 serverName 装载即抛(mcp-client 防静默 shadowing)。

## 换设备的路径覆盖

`cordis.patch.yml` 里四个路径经 env 参数化(缺省值 = 主力机布局):

| env | 缺省 | 说明 |
|---|---|---|
| `RIMWORLD_GABS_BIN` | `.../x-rimworld/tools/GABS/gabs` | gabs 可执行文件 |
| `RIMWORLD_GABS_STATE_DIR` | `.../x-rimworld/tools/GABS/state` | gabs 配置目录(不带则 gameCount=0) |
| `RIMWORLD_RIMAPI_MCP_BIN` | `.../x-rimworld/RLE/.venv/bin/rimapi-mcp` | rimapi-mcp(先在 RLE 仓库 `uv sync --extra mcp`) |
| `RIMWORLD_RIMAPI_URL` | `http://localhost:8765` | RIMAPI HTTP 端点 |

设备差异也可以不动 env:在目标设备的 profile 用户层用 id-targeted 行覆盖
`rimworld-gabs-bridge` / `rimworld-rimapi` 的 `config.command` 等字段。

## 前置与验证

- 目标设备的 dsh 应用须携带 `@deepseek-ai/dsh-mcp-client`(apps/cli 依赖内,
  同版本安装即满足)。
- 装载失败 fail loud(`failOnStartupError: true` 只覆盖 MCP 握手与工具同步,
  游戏在不在线不算装载失败)。
- 组合验证(不求值 `!!js`):`pnpm dsh --profile web --dump-config | grep rimworld-`
- 运行验证:会话工具面出现 35 个 `mcp__*` 工具;server 进程名下有
  `gabs`/`rimapi-mcp` 子进程。
- 真机冒烟:deepseek-harness 仓库 `rimworld_lab/m1-rimapi-smoke/smoke-task.md`。

## 更新与卸载

- 上游配置真源是 `x-games/x-rimworld/RLE/configs/harness-mcp.v1.json`;
  其变更后按 diff 改 `cordis.patch.yml` 并 bump version。
- 卸载:`pnpm dsh plugin --profile <name> remove dsh-rimworld-lab`,
  reconcile 会自动把它移出 bundles 层。
