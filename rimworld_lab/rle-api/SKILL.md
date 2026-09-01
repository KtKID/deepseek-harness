---
name: rle-api
description: 给任意 OpenAI 兼容 LLM(LM Studio/OpenAI/OpenRouter)挂 RimWorld 殖民地动作工具并解析结果的调用说明。调用 deepseek-harness 仓库 rimworld_lab/tool-protocol/tools/ 包:生成 14 个 typed 动作工具的 OpenAI tools 定义、按角色过滤、把模型返回的 tool_calls 装配校验为 RLE ActionPlan。当用户要"用工具协议调本地模型管殖民地"、"给 LLM 挂 RimWorld 工具"、"解析 tool_calls 成动作"、"rle-api"时使用。不依赖 DSH;不含游戏执行。
---

# rle-api:RimWorld 动作工具包调用说明

`rimworld_lab/tool-protocol/tools/`(deepseek-harness 仓库)把 RLE 角色审议的 JSON ActionPlan 协议换成了原生 tool 调用:14 个 typed 动作工具(pydantic 定义,schema 与校验同源)+ 角色工具子集 + tool_calls→ActionPlan 装配器。任何能发 OpenAI chat.completions 请求的 LLM 都能用,不需要 DSH。

配套 `prompts/` 包提供去掉全部 JSON 格式指令的系统/用户提示词。**装配产物是 ActionPlan;执行不在本包范围**(走 RLE 既有 ActionExecutor/RIMAPI,见 run_scenario.py 或 rle-live-monitor skill)。

2026-08-31 实测(qwen3.8-27b-mlx,construction_planner):一次 14 个并行 tool_calls、装配 0 错误、坐标全部取自 MAP_SUMMARY、每殖民者一条 work_priority、只用了本角色 3 个工具未越权。

## 调用前提(缺一不可)

1. **RLE 的 uv 环境**(包 import `rle.*`):必须 `cd /Volumes/machub_app/proj/x-games/x-rimworld/RLE` 后 `uv run python` 执行;裸 python / 其他环境必挂。
2. **sys.path 注入**(写在 import 之前):
   ```python
   import sys
   sys.path.insert(0, "/Volumes/machub_app/proj/agent/deepseek-harness/rimworld_lab/tool-protocol")
   from tools import build_openai_tools, build_role_tools, ROLE_TOOL_NAMES, assemble_action_plan
   from prompts import build_system_prompt, build_user_prompt
   ```
3. **LM Studio 四要素**(照抄 rle_ctl.py 的验证配方):
   - env `NO_PROXY=localhost,127.0.0.1` + `no_proxy=...`——否则 openai SDK 走系统代理,**全部 503 空 body**(curl 不读系统代理所以"看起来正常",别被骗)
   - messages 末尾加 assistant 预填 `"</think>"`(等效 `--no-think`)——否则 qwen3 思考通道烧光 max_tokens,`finish_reason=length` 且 0 输出
   - `--model` 必须与 `lms ps` 的 IDENTIFIER 一致;LM Studio 加载带 `--parallel N --context-length 131072`
   - timeout 给足 170s+:本地 27B 单请求 60-150s;max_tokens ≥ 2048

## 三个入口

| 入口 | 返回 | 用途 |
|---|---|---|
| `build_openai_tools(names=None)` | `list[dict]`(OpenAI tools 数组) | 直接作 `chat.completions.create(tools=...)` 参数;传名字列表只出子集 |
| `build_role_tools(role)` | 同上 | 某角色可见的工具子集(map_analyst 为 `[]`) |
| `assemble_action_plan(role, tick, tool_calls)` | `AssemblyResult(plan, errors)` | 把模型 `message.tool_calls` 装配为 ActionPlan;SDK 对象/裸 dict 都吃 |

`AssemblyResult.errors` 是逐条 `ToolCallError(index, tool_name, call_id, reason)`:未知工具、arguments 非法 JSON、缺必填、枚举/范围越界、多余字段。**不修复、不抛异常**——错误本身就是实验数据。零 tool_calls = no_action(空计划零错误)。

## 最小可抄回路(已实测)

```python
import sys
sys.path.insert(0, "/Volumes/machub_app/proj/agent/deepseek-harness/rimworld_lab/tool-protocol")
from openai import OpenAI
from tools import build_role_tools, assemble_action_plan
from prompts import build_system_prompt, build_user_prompt

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio", timeout=170)
role, tick = "construction_planner", 1
state = "<游戏状态文本:殖民者(SKILLS/current_job)+ MAP_SUMMARY(SHELTER/FARM/STOCKPILE SITE 坐标)>"
resp = client.chat.completions.create(
    model="qwen3.8-27b-mlx",
    messages=[
        {"role": "system", "content": build_system_prompt(role, phase="synthesis", progress_pct=50, day=1)},
        {"role": "user", "content": build_user_prompt(role, "分析建筑需求并提出开局动作。", state)},
        {"role": "assistant", "content": "</think>"},
    ],
    tools=build_role_tools(role), tool_choice="auto", max_tokens=2048, temperature=0.4,
)
result = assemble_action_plan(role, tick, resp.choices[0].message.tool_calls or [])
print(len(result.plan.actions), "动作;", len(result.errors), "错误")
# result.plan.actions[i]: action_type / target_colonist_id / parameters / reason
# msg.content 是简体中文 summary;phase ∈ exploration|analysis|synthesis;day<3 自动注入开局手册
```

## 14 个工具速查(名称=旧 action_type;`reason` 一律必填、简体中文)

| 工具 | 必填(除 reason) | 约束 |
|---|---|---|
| work_priority | colonist_id, priorities | priorities 是 `{工作类型:1-4}` 映射;20 个合法工作类型见 schema 描述 |
| blueprint | def_name, x, z | stuff_def 默认 WoodLog;rotation 0-3;坐标取自 MAP_SUMMARY |
| growing_zone | x1,z1,x2,z2 | plant_def 默认 Plant_Rice;同一区域勿重复创建 |
| stockpile_zone | x1,z1,x2,z2 | name/priority(0-5,默认 3)可选 |
| designate_area | type, x1,z1,x2,z2 | type ∈ Mine/Harvest/Deconstruct/Hunt |
| draft | colonist_id, is_drafted | |
| move | colonist_id, x, z | |
| job_assign | colonist_id, job_def | target_thing_id/x/z 可选 |
| time_assignment | colonist_id, hours, assignment | hours 0-23 列表;assignment ∈ Work/Sleep/Joy/Anything |
| bed_rest | colonist_id | bed_building_id 可选 |
| tend | colonist_id | **doctor_id**(不是旧 prompt 的 doctor_pawn_id);colonist_id 填病人 |
| toggle_power | building_id, power_on | |
| research_target | project | defName 如 Electricity |
| research_stop | — | |

角色→工具(旧 ALLOWED_ACTIONS − no_action):map_analyst 无(只出分析);resource_manager 6 个;defense_commander draft/move;research_director research_target/research_stop/work_priority;social_overseer time_assignment/work_priority;construction_planner blueprint/designate_area/work_priority;medical_officer bed_rest/tend/work_priority。派生自 RLE 源码,漂移会在导入时报错。

## 坑(症状 → 原因 → 处理)

| 症状 | 原因 | 处理 |
|---|---|---|
| 请求全 503 空 body,curl 同款 200 | openai SDK trust_env 读 macOS 系统代理拦 localhost | 带 `NO_PROXY=localhost,127.0.0.1`(大小写都带) |
| `finish_reason=length`、0 文字 0 tool_calls | qwen3 thinking 烧光 max_tokens | messages 末尾加 assistant `"</think>"` 预填;max_tokens ≥ 2048 |
| ModuleNotFoundError: rle / tools | 不在 RLE uv 环境,或没注入 sys.path | `cd RLE && uv run python`,脚本头注入 tool-protocol 路径 |
| 装配器报 arguments JSON 错 | 把 `function.arguments`(本是 JSON 字符串)预处理成了 dict 再塞回 | 原样传 tool_calls 对象,解析由装配器做 |
| 模型输出的标识符被翻译成中文 | — | schema 描述已声明英文原样;identifier 类字段保持游戏 API 名称 |

## 分工边界

- 启动游戏/跑局/日志流:**rle-live-monitor** skill(端口拓扑、LM Studio 加载、坑表)。
- 动作执行与对局:RLE 的 run_scenario.py / ActionExecutor(经 RIMAPI 8765 写游戏)。
- 本 skill 只管:生成工具定义 → 挂到任意 LLM → 装配校验 tool_calls。完整"任意 LLM 管殖民地"= 本回路 + 你的 agent 自行调 RIMAPI 执行,或等 runner(phase 2)接入既有执行链。
- 测试基线:`cd RLE && uv run pytest <harness>/rimworld_lab/tool-protocol/tools/tests <harness>/rimworld_lab/tool-protocol/prompts/tests -q`(25 个,应全绿)。
