# runner(下一任务:provider/loop 集成与 A/B 对局)

本目录目前只有设计结论,没有代码。tools/ 与 prompts/ 已交付,集成所需事实已验证:

## 已验证的集成通道

- felix `OpenAIProvider.complete/acomplete(messages, *, temperature, max_tokens, stop_sequences, **kwargs)`
  的 `**kwargs` 经 `_build_create_kwargs(extra=...)` 直通 `chat.completions.create`——
  `agent.set_provider_kwargs(tools=build_role_tools(role), tool_choice="auto")` 即可下发工具。
- 工具调用从 `CompletionResult.raw_response.choices[0].message.tool_calls` 取,
  直接喂 `assemble_action_plan(role, tick, tool_calls)`;`content` 文字即 summary。

## 集成形态(不改 RLE 仓库)

- 在本目录写 `tool_role_agent.py`:`RimWorldRoleAgent` 子类,override
  `create_position_aware_prompt`(用 prompts 模块)与解析路径(tools 装配替代
  `parse_action_plan`/JSON repair);`build_observation`、helix、spoke、provider
  调用、事件记录全部复用基类。
- `run_tool_protocol.py`:镜像 `run_scenario.py` 的装配流程,仅替换角色 agent 类
  与 provider kwargs;输出目录与 JSON 基线同构,便于逐 tick 对比。

## 已知风险

- `--no-think` 的 assistant 预填 `</think>` 与 tools 并存可能冲突(LM Studio 对
  prefill + tool_calls 的组合行为未验证)——工具模式下先禁用预填,thinking 由
  模型参数控制。
- LM Studio 对并行多 tool_calls 的支持是实验 A 的核心被测项,不预设结论。

## A/B 指标(同存档、同场景、同 tick 数)

每 tick 记录:各角色 tool_calls 数、装配错误数(按错误类别分桶:非法 JSON/
缺字段/枚举/范围/未知工具/多余字段)、provider_error 与超时数、repair/纠错
重试次数(JSON 基线才有)、token 与时延、执行成功/失败动作数、score 曲线。
