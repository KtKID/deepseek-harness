理解了。两路探查已完成(RLE 的 pydantic 协议、DSH 的 bundle/插件规范、web/subprocess/MCP 能力现状),下面是我作为负责人给出的理解和方案。

## 我对任务的理解

**负载补充**:LM Studio 侧已用 `--parallel 7` 解决后端接待能力,roadmap P1 的 lab 级 `llm/stream` admission(`maxConcurrentLlmRequests: 2|3`)保留为 M1 的 DSH 侧最终约束,不再是当前卡点。我会在 roadmap P1"现状"里补记这个事实,不改决策本身。

**功能边界**(这是你强调的重点,我先说死):

| 归属 | 内容 | rimworld-lab 是否实现 |
|---|---|---|
| GABS + RimBridgeServer | 启动、加载、暂停、读、动作执行、精确 tick | 否,只通过 `dsh-mcp-client`(Streamable HTTP → `:17681/mcp`)调用 |
| RLE | 观测投影(`build_observation`)、动作领域校验、scenario、score、metrics | 否,RLE 不改一行,作为子进程 + import 语义上的 environment package 存在 |
| rle.log / rle.ctrl / rle.obs 协议 | pydantic 是唯一真源,协议已冻结 v1 | 只消费;禁止在 TS 侧私扩 kind |
| rimworld-lab(DSH) | LLM admission、typed tools、episode controller、commit 权、启动编排、web 面 | 是 |

**"接管启动流程"的含义**:把 rle-live-monitor skill 里的 4 步手动流程(GABS 起游戏 → 带 env 起 RLE → 起 60082 流服务 → 验证 dashboard)变成插件编排——GABS 走 MCP 工具、RLE 走 `ctx.subprocess` 受管子进程、日志流和控制面改由插件自己的 HTTP 面承接。**不是**让 DSH agent 在 M0 就写游戏(M1 commit 路径才开),也**不是**改写 RLE 的内部逻辑。

**"面向消息协议编程 + pydantic 自动产数据结构"**:RLE 已有 `gen_log_protocol.py` / `gen_control_protocol.py` 导出完整 JSON Schema(rle.log v1 的 19 kind 判别联合天然包含 rle.obs;rimapi-dashboard 已有成熟的 schema→TS 流水线先例)。插件侧复用同一条链:pydantic → JSON Schema → 生成的 TS 类型 → 插件(事件解析、tool、session event)和 web UI 共用。RLE 侧拥有的协议由 pydantic 生成;**lab 自己拥有的面(typed tool 名/参数/枚举、lab 事件)由 TypeScript 源码持有**——这正好和 roadmap P2 的"正式 tool 名由 TS 源码拥有"一致,两个真源各管各的。

## 方案

### 1. 包结构:host 插件 + 薄 bundle(遵循仓库现行规范)

- `packages/host/rimworld-lab/`(`@deepseek-ai/dsh-rimworld-lab`)——插件实现本体。仓库惯例是 bundle 薄组合、真插件住 host(如 `plugin-analyzer` 的做法);roadmap"bundle + 少量 glue"的本意是避免过早抽通用 capability 包,而 rimworld-lab 是 lab 专属实现,不是通用能力,放 host 不违背该意图。
- `packages/bundle/rimworld-lab/`(`@deepseek-ai/dsh-rimworld-lab-bundle`?按 `dsh-plugin-analyzer` 命名惯例定)——`cordis.patch.yml` 组合行:`mcp-client`(serverName `gabs`,streamable-http)、`rimworld-lab` 插件行、webServer 行;`package.json` 带 `dsh.bundle.patch` manifest。
- 运行入口:示例 leaf(仿 `examples/`)或 `dsh --profile rimworld-lab` 文档化配置。
- tsconfig face 注册进 `tsconfig.host.json`,README 三件套(`.md`/`.zh.md`/`.i18n.yaml`,含 Model Experience 与 Known Limitations 段),Agent Note 同 PR。

### 2. 协议生成管线(先行,其他一切依赖它)

- `scripts/sync-protocol`:`RLE_DIR`(默认 x-games 路径)可覆盖,跑 RLE 两个 gen 脚本 → schema JSON vendor 进包内 `schemas/` → `json-schema-to-typescript` 生成 `src/protocol/*.ts`(带生成头注释,禁手改)。
- 拆 `sync`(需 RLE checkout,显式步骤)与 `gen`(仅从 vendored schema 重生成,keyless 可进 gate)两档,照搬 rimapi-dashboard 的 `sync:*`/`gen:*` 分法;`gen --check` 挂进仓库 gate 防漂移。
- 文件边界运行时校验(events.jsonl 是 durable/file 边界,按 DSH 规范要验证):用 vendored JSON Schema 校验行 + 按 `kind` 判别收窄到生成类型。

### 3. 插件内部骨架(`packages/host/rimworld-lab/src/`)

- `index.ts`:schemastery `Config`(gabsUrl、rleDir、outputDir、scenario、provider/baseUrl/model、ROLE_TIMEOUT_S、web 端口/路径、`maxConcurrentLlmRequests`、strategic/tactical ticks 占位),全部可从 cordis.yml 覆盖。
- `gabs.ts`:GABS 门面,包 `mcp__gabs__*` 工具(games_start、rimbridge_ping、list_saves、load_game_ready、step_game_ticks、读 tick),含 exclusive 串行和 poisoned-connection 状态骨架(不变量 8 / SC_07)。
- `rle-process.ts`:`ctx.subprocess.spawn` 受管 `uv run python scripts/run_scenario.py`,显式 env(`NO_PROXY`、`ROLE_TIMEOUT_S` 等)在 scrub 后合并所以必然生效,dispose 即 terminate——这正是现在 skill 里最容易踩的 env 坑的根治。
- `event-tail.ts`:tail `<output>/events.jsonl`,按 rle.log v1 校验解析,发 cordis 事件 + 写 DSH session event(模型可见 ⟺ 可重建,不变量 2)。
- `control.ts`:rle.ctrl v1 的 TS 实现——读改写 `debug-control.json`,revision 单调合并;语义按协议文档实现,golden 用例取 RLE 测试向量做 parity fixture。**单写者约定:lab 接管后不再起 serve_dashboard(60082)**。
- `tools.ts`(M0 最小:读 tick / step 包装成 curated `rimworld_lab_*` 工具,保持外层语义 tool 与底层 MCP call 因果可见)、`admission.ts`(M1 stub)、`episode.ts`(M2 状态机 stub)。

### 4. Web 面(面向协议,不造新 REST)

`ctx.webServer`(host/webserver 原生支持 SSE handler)上注册,端口语义与 serve_dashboard 兼容:`GET /rimworld-lab/logs/stream`(同款 SSE 帧:retry/data/每行一条完整 record/kinds 过滤/回放尾部)、`GET /debug/state`、`POST /debug/control`(走 `control.ts` 单写者)、静态 UI 挂 `/rimworld-lab/`。这样**现有 rimapi-dashboard 改一个 `DEFAULT_LOG_STREAM_URL` 常量即可指向 lab**,新 UI 后续再按生成类型补最小版(日志流 + 控制 + M0 tick 验证视图)。lab 自有状态(episode、admission 统计)不做进 rle.log,走 DSH session event / lab 自有 envelope,真源在 TS。

### 5. 质量门与里程碑映射

- 测试:bundle manifest 行断言(仿 plugin-analyzer 的 `bundle.spec.ts`)、协议解析/控制 apply 的 keyless 单测(macOS/Linux 可重放 fixture)、`gen --check` 门;M0 真机 smoke(加载 playable + T1−T0=600)做成 GABS/游戏缺席自跳过的路径。
- 本框架对应 **M0 全量 + M1/M2 的骨架 stub**;M3(RLE 收缩)、M4(规划实验)不动。SC_06 先行,SC_01–05、07 随 M1 补齐。

两个我已替你拍板的点,如不同意请指出:① 插件本体放 `packages/host/rimworld-lab` 而非塞进 bundle 包;② web 第一阶段以协议兼容端点接管、复用 rimapi-dashboard 做 UI,内置最小 UI 随 M2 episode 视图再上。没有异议我就按此开始搭框架:先铺协议生成管线和两个包骨架,再接 GABS/RLE 接管与 web 端点。
