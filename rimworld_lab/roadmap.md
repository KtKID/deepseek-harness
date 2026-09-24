# RimWorld Lab Roadmap

> roadmap_version: 1
> status: draft
> complexity: 5
> importance: 1
> review_budget: full
> adversarial_review: pending

## 目标

RimWorld Lab 用 DeepSeek Harness 承接 RimWorld 实验的主 Agent、人类协作、多 Agent 调度、模型调用、工具调用、会话记录和 episode 编排，并把 RLE 收缩为提供观测、动作语义、场景与评分的 environment package。

首个里程碑证明 `DSH -> GABS -> RimBridgeServer -> RimWorld` 的控制链、存档加载和确定性游戏 tick 推进。Crashlanded headless、长期无人值守 episode、排行榜和最终 benchmark 进入后续里程碑。

## 所有权

| 组件 | 所有者 | 职责 |
|---|---|---|
| DSH core | DeepSeek Harness | Agent turn、LLM、tools、session、human interaction |
| `rimworld-lab` bundle/plugin | DSH | LLM admission、RimWorld tools、episode controller、主 Agent 提交权 |
| GABS + RimBridgeServer | 游戏控制层 | 启动、连接、加载、暂停、读取、动作执行、精确推进 tick |
| RLE environment package | RLE | 观测投影、动作领域规则、scenario、score、episode metrics |
| RimWorld | 游戏 | Unity 更新与游戏 simulation loop |

`rimworld_lab/` 保存实验路线、验收条件和后续 fixture。插件实现进入 `packages/bundle/rimworld-lab/`，先以一个 bundle 和少量 runtime glue 满足当前消费者；出现第二个独立消费者后再提取通用 capability package。

## 控制链

```text
Human
  -> DSH main agent
  -> rimworld-lab typed tools
  -> DSH MCP client over Streamable HTTP
  -> GABS :17681/mcp
  -> GABP
  -> RimBridgeServer
  -> RimWorld
```

GABS 和 RimBridgeServer 共同拥有游戏写入路径。RIMAPI 在首个里程碑承担只读观测和 SSE 事件。启动、加载、暂停与推进时间统一通过 GABS/RimBridgeServer 完成。

## 系统不变量

1. 每个 episode 只有一个游戏写入 owner；角色 Agent 只能提交 proposal，主 Agent 拥有 commit 权限。
2. 所有进入模型请求的观测、角色消息和 tool schema 都能从 DSH session log 重建。
3. 游戏时间由 `step_game_ticks` 和事件触发器推进；模型延迟不改变游戏内决策机会数量。
4. 所有主 Agent、子 Agent、重试和辅助模型请求共享同一个 lab 级 LLM admission limit。
5. 游戏写 tool 使用固定参数 schema，并在调用游戏前完成类型、范围、目标存在性与 snapshot revision 校验。
6. 读 tool 可以声明并发安全；proposal、commit、load、pause 和 step tool 按 exclusive 顺序执行。
7. 存档加载以精确 `saveName`、Mod 兼容性和 `playable` readiness 成功作为完成条件。
8. 结果未知的写入超时会使当前控制连接进入 poisoned 状态；恢复流程先重连并读取游戏状态，再决定后续动作。

## 问题 P1：多 Agent 并发压垮 LLM 后端

### 现状

RLE 的角色审议可以并行启动多个模型请求。DSH 的 `maxParallelToolCalls` 约束一个 Agent step 内的并发 tool call，workflow 的 `maxConcurrentAgents` 约束单次 workflow run；独立主 Agent、continuable 子 Agent、后台任务、重试和辅助模型请求仍可能同时访问同一 LLM 后端。

### 决策

`rimworld-lab` 注册一个覆盖本 lab realm 的 `llm/stream` admission listener，以进程内 FIFO semaphore 约束真实 adapter 请求。配置名为 `maxConcurrentLlmRequests`，允许值为 `2 | 3`，默认值为 `2`。

permit 在进入下游 `llm/stream` 前取得，并在 stream 正常结束、adapter 错误、调用取消和插件 dispose 时释放。排队中的取消会从 FIFO 队列移除。每次 retry 作为一个新的真实模型请求重新排队。主 Agent 和所有子 Agent 使用同一实例，保证活跃请求数始终小于或等于配置值。

admission 记录 `activeRequests`、`queuedRequests`、`queueWaitMs`、provider、model、agent/session id、开始时间与结束原因。游戏在审议、排队和重试期间保持暂停，因此后端负载与游戏决策频率保持独立。

`maxParallelToolCalls` 和 workflow `maxConcurrentAgents` 继续承担各自局部背压；lab 级 admission 是 LLM 后端并发的最终约束。

## 问题 P2：用文本 JSON 表达 ActionPlan

### 现状

RLE 当前要求 LLM 回复以下 JSON，并在解析失败后追加一次低温修复请求：

```json
{"actions": [{"action_type": "<端点名>", "target_colonist_id": "<id 或 null>", "parameters": {}, "priority": "<1-10>", "reason": "<原因，用简体中文>"}], "summary": "<简述，用简体中文>", "confidence": "<0.0-1.0>"}
```

这个协议把 endpoint 选择、可空 target、无类型 `parameters`、自然语言解释和整份 plan 的序列化同时交给模型。格式修复会增加模型请求和成本，通用 `parameters` 也把许多错误推迟到动作执行阶段。

### 决策

`rimworld-lab` 从 prompt 中移除“只回复 JSON”及 JSON repair。插件向模型注册固定参数 tools；每个 tool 表达一个明确动作，输入 schema 直接描述该动作的必填字段、枚举、数值范围和目标 id。

```text
rimworld_lab_propose_work_priority(
  colonistId,
  workType,
  priority,
  reason
)

rimworld_lab_propose_blueprint(
  defName,
  x,
  z,
  stuffDef?,
  rotation?,
  reason
)
```

工具集合遵守以下规则：

- 一个语义动作对应一个 tool，禁止 `action_type + parameters` 通用容器。
- 不适用字段从该 tool schema 消失，目标 id 在需要目标的 tool 中保持 required。
- proposal tool 只写入当前 `decisionId` 的 staged proposal，并记录 `snapshotRevision`。
- 角色 Agent 只能看到读 tool 和 proposal tool。
- 主 Agent 可以读取 proposals、调用相同的 typed proposal tools，并通过 `rimworld_lab_commit_decision(decisionId, proposalIds)` 提交最终动作集合。
- commit 按确定性顺序重新校验 snapshot revision、动作冲突和目标存在性，然后串行调用 GABS/RimBridgeServer。
- `summary` 可以作为主 Agent 的自然语言消息；执行事实以 tool call、tool result 和 episode events 为准。
- `confidence` 暂不进入动作执行协议。需要研究校准能力时，由独立 telemetry tool 采集，避免它影响游戏控制。

初始 tool 清单从 RLE 已验证的 write catalog 提取。正式 tool 名、参数和枚举由 TypeScript 源码拥有，DSH tool catalog 由源码生成，roadmap 只保留设计规则和代表性示例。

## 决策时钟

Episode controller 使用以下状态转换：

```text
PAUSED
  -> OBSERVE(snapshotRevision, gameTick)
  -> DELIBERATE
  -> COMMIT
  -> STEP_GAME_TICKS(N)
  -> PAUSED
  -> OBSERVE(nextRevision, nextGameTick)
```

初始配置使用 `strategicStepTicks: 15000`、`tacticalStepTicks: 600`。战略心跳每天产生四次固定决策机会；袭击、倒地、火灾和关键资源阈值事件可以立即打开战术决策窗口。战术状态解除后恢复战略心跳。M0 使用 `600` ticks 验证精确推进，不评估该频率的游戏策略质量。

人类可以在暂停阶段向主 Agent 发送消息。人类干预写入 episode 记录来源，并将该 episode 标记为 assisted，以便规划能力实验区分 autonomous 和 assisted 结果。

## Roadmap

### M0：控制链与生命周期

- 创建最小 `rimworld-lab` profile，配置 DSH Streamable HTTP MCP client 连接 GABS。
- 完成 MCP initialize、工具发现、`games_start`、`rimbridge_ping`、`list_saves` 和 `load_game_ready`。
- 使用精确存档名、`readiness: playable`、`pauseIfNeeded: true`、`ignoreModCompatibility: false`。
- 读取 tick `T0`，调用 `step_game_ticks(600)`，读取 `T1` 并验证 `T1 = T0 + 600`。
- 提供一条确定性 smoke 路径和一条真实自然语言 DSH 会话路径；两条路径共享相同的底层控制操作。
- 验证每个调用与结果进入 DSH session log，且 uncertain write timeout 触发 poisoned connection 恢复流程。

### M1：Typed tools 与 LLM admission

- 实现 `maxConcurrentLlmRequests: 2 | 3` 的 FIFO、取消、错误、stream completion 和 dispose 生命周期。
- 实现只读工具、typed proposal tools、proposal store 和 main-agent-only commit。
- 通过 agent scope/tool filter 分配角色能力。
- 把所有游戏写 tool 标记为 exclusive，把纯读取 tool 按实际线程安全语义标记为 parallel。
- 移除 RimWorld Lab prompt 中的 ActionPlan JSON 和 JSON repair 请求。

### M2：Episode controller

- 实现 pause、observe、deliberate、commit、step 和 event interrupt 状态机。
- 固化 `decisionId`、`snapshotRevision`、`gameTick`、proposal、commit、action outcome 和 score 的 durable events。
- 实现 strategic/tactical cadence 配置和 assisted episode 标记。
- 对比 `7500` 与 `15000` strategic ticks 的无变化观测比例、漏报事件率、模型调用数和任务结果，再确定规划实验默认值。

### M3：RLE 收缩

- 保留 observation、RIMAPI read/SSE、action domain validation、scenario、score 和 metrics。
- 冻结现有 `game_loop.py`、role provider、CentralPost/Spoke 和 JSON ActionPlan 为 legacy baseline。
- 使用同存档和同初始 tick 对比 reset、观测、动作结果、tick 推进和 score。
- parity fixture 通过后，从活动运行链移除 RLE 的 model provider、role loop、JSON repair 和调度职责。

### M4：规划能力实验

- 建立 fixed-save、fixed-event、fixed-decision-cadence 的对照 episode。
- 分离主 Agent 规划、角色协作、动作执行、环境稳定性和人工干预指标。
- 使用 first divergence、完整 tool trace 和 replay 定位结果差异。
- Crashlanded headless MVP 在控制链、typed tools、admission 和 episode replay 全部稳定后进入范围。

## 验收场景

### SC_01：全局 LLM 并发上限

GIVEN 主 Agent、多个子 Agent 和一次 retry 同时请求同一后端，WHEN `maxConcurrentLlmRequests` 为 `2`，THEN 任意时刻真实 adapter in-flight 请求数最多为 `2`，其余请求按 FIFO 排队。

### SC_02：取消排队请求

GIVEN 两个 permit 已占用且第三个请求正在排队，WHEN 第三个请求被取消，THEN 它离开队列、不会调用 adapter、不会消耗 permit，后续请求可以正常取得释放的 permit。

### SC_03：固定参数 tool 校验

GIVEN 模型调用 blueprint proposal 时缺少 `x`，WHEN DSH 校验 tool arguments，THEN 调用在进入 GABS 前失败，错误明确指出缺失字段，游戏状态保持不变。

### SC_04：角色 Agent 写入隔离

GIVEN 角色 Agent 已生成 proposal，WHEN 它尝试调用 commit 或原始写工具，THEN tool scope 拒绝调用；主 Agent 可以按 proposal id 提交。

### SC_05：过期 snapshot

GIVEN proposal 引用 revision `R1` 且当前观测已进入 `R2`，WHEN 主 Agent 提交该 proposal，THEN commit 拒绝过期 proposal，游戏状态保持不变，并返回当前 revision。

### SC_06：精确加载与推进

GIVEN 兼容存档存在，WHEN M0 smoke 加载到 `playable` 并推进 `600` ticks，THEN 返回精确 `saveName`，加载后保持暂停，且 `T1 - T0 = 600`。

### SC_07：不确定写入超时

GIVEN load 或 action 请求在写入阶段超时，WHEN 结果无法确认，THEN controller 标记连接 poisoned，阻止后续写入，重连后先读取当前存档、tick 和目标状态。

## 风险与待验证事实

- GABS HTTP MCP 的当前 writer 健康状态需要用 `rimbridge_ping` 和真实 `load_game_ready` 复测；`games_status` 只作为发现信号。
- `llm/stream` listener 必须覆盖主 Agent、所有 child scope、retry、compaction 和其他共享同一后端的辅助请求；单元测试需要构造跨 session 并发。
- nested tool 调用必须保留外层语义 tool 与底层 MCP call 的因果关系，同时只向模型公开 curated RimWorld Lab tools。
- proposal commit 需要明确部分成功语义。第一版采用串行执行、逐项记录 outcome，并在首个失败后停止剩余写入。

## 文档验收

- 用户提出的 LLM 并发负载问题有明确配置、作用域、排队、取消、释放和观测规则。
- 用户提出的 JSON ActionPlan 问题有 typed tool 替代协议、角色权限和 commit 所有权。
- M0 明确覆盖 GABS 启动、HTTP MCP、真实 ping、精确存档加载和确定性 tick 推进。
- Crashlanded headless 明确位于后续范围。
