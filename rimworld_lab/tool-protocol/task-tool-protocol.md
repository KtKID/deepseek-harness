# 动作协议改为工具调用:tools 包与提示词重写

> spec: 无,独立任务(上下文: rimworld_lab/roadmap.md 问题 P2、rimworld_lab/framework-plan.md 实验 A)
> feat: 无
> 创建: 2026-08-31

## ① 需求

### 功能方向

角色智能体不再被要求"回复一段 JSON 动作计划",而是在一次回复里直接调用若干个动作工具;本任务交付的动作工具包负责把工具调用装配成现有执行器能执行的动作计划,并把系统提示词重写为纯策略指令——不含任何格式要求。

### 功能边界

- 做:14 个动作工具的定义(名称、参数、枚举、范围,与现有执行器入参一一对应)、按角色的工具子集、工具调用→动作计划的装配与逐条校验(坏调用记录错误、不中断其他调用)、重写后的系统/用户提示词(保留全部策略规则,删除全部 JSON 格式指令)、下一阶段 runner 集成的设计说明。
- 不做:provider 与游戏循环的接入及真实对局 A/B(下一任务)、修改 RLE 仓库任何文件、新增 Python 依赖、DSH 插件侧工作。

### 不能破坏的不变量

- RLE 仓库零改动,其既有测试全部保持通过。
- 装配产物是现有 `Action`/`ActionPlan` 模型实例,现有 `ActionExecutor` 无需任何修改即可消费(装配输出的 `parameters` 键必须是 executor 对应处理器实际读取的键)。
- 每个角色可用的动作集合与 RLE 当前 `ALLOWED_ACTIONS` 完全一致;`no_action` 从协议移除,以"零工具调用"表达。
- 提示词中的策略内容(MAP_SUMMARY 规则、开局手册、技能分配、配额、语言规则)逐条保留,只允许措辞从"JSON 字段"改为"工具参数"。

## ② 测试用例(先写,此刻失败)

### unit

- test_catalog.py
  - `test_openai_tool_shape` → 边界:14 个工具,OpenAI function 形状完整,参数 schema 可 JSON 序列化 → 功能方向
  - `test_work_priority_schema` / `test_enum_and_range_schema` → 边界:枚举与数值范围进 schema(工作类型、设计类型、小时 0-23、朝向 0-3) → 功能方向
  - `test_role_mapping_matches_rle` → 不变量:角色工具子集 == `ALLOWED_ACTIONS` − `no_action`,map_analyst 为空 → 不变量 3
- test_assembly.py
  - `test_valid_parallel_calls_assemble_plan` → 功能方向:多次调用按序装配;`work_priority` 展平为执行器文档形态、`blueprint` 目标为空、reason 保留
  - `test_tend_maps_patient_and_doctor` → 功能方向:tend 的病人进 `target_colonist_id`、`doctor_id` 进 parameters(修复旧 prompt `doctor_pawn_id` 与 executor `doctor_id` 的漂移)
  - `test_invalid_json_args_recorded_not_raised` / `test_unknown_tool_recorded` → 边界:坏调用记录错误,不中断其他调用
  - `test_missing_required_field` / `test_enum_violation` / `test_work_priority_value_and_key_violation` / `test_extra_field_rejected` → 边界:缺字段、错枚举、越界值、多余字段全部被拒(SC_03 等价)
  - `test_empty_calls_mean_empty_plan` → 边界:零调用 = no_action,空计划零错误
  - `test_openai_sdk_object_shape` → 边界:OpenAI SDK 对象与裸 dict 两种输入都接受
- test_prompts.py
  - `test_shared_prefix_policy_kept_format_gone` → 功能方向:策略锚点(MAP_SUMMARY、配额、技能分配等)保留;格式指令(JSON、actions、confidence、只响应、no_action、action_type)绝迹
  - `test_all_prompts_free_of_format_instructions` → 功能方向:全部角色 × 全部阶段 × 开局/非开局的组合都不含格式指令
  - `test_bootstrap_playbook_day_gate` / `test_phase_block_present` → 不变量:开局手册与阶段指令行为与旧版一致(day<3 注入、三阶段文案)
  - `test_role_block_lists_tools_and_description` → 功能方向:角色块列出该角色工具并保留角色描述
  - `test_role_info_parity_with_rle` → 不变量:7 个角色的名称/描述与 RLE 源码提取完全一致(零漂移)
  - `test_user_prompt_contains_state_and_no_format_reminder` → 功能方向:用户提示含状态上下文与工具提示行,不含旧格式提醒

### smoke

- `test_assembly_output_consumable_by_executor_contract`(在 test_assembly.py):装配出的每个 `Action.parameters` 的键 ⊆ executor 对应 `_h_*` 处理器实际读取的键集合(键契约硬编码自 executor 源码),`_NEEDS_PAWN` 动作的 `target_colonist_id` 非空——keyless 等价的最小执行链契约检查。

### e2e

不需要,依据:需要运行中的 RimWorld + RIMAPI + LM Studio,属于实验 A 的对局阶段(下一任务);本任务以执行器键契约 smoke 锁定链路。

## ③ 技术实现

### 实现步骤

1. `tools/schemas.py`:14 个动作工具的 pydantic 参数模型——`model_json_schema()` 直接作为 OpenAI tools 的 `parameters` 下发,`model_validate` 做装配期校验,schema 与校验同源,零新增依赖。`WORK_TYPES`(20 项,与旧 prompt 一致)、`DESIGNATE_TYPES`、`TIME_ASSIGNMENTS` 常量;`work_priority` 的 priorities 映射有键值校验器(键 ∈ 工作类型、值 1-4、非空)。两处契约修正:医生参数名用 executor 读取的 `doctor_id`(旧 prompt 写 `doctor_pawn_id`,值被静默丢弃);旧协议 `priority: 1-10` 从未被执行器读取,不进工具协议。
2. `tools/catalog.py`:`ToolSpec`(openai_tool 生成 + to_action 映射:colonist_id→target、work_priority 展平为 `{WorkType: 1-4}` 文档形态、reason 单列);`ROLE_TOOL_NAMES` 从 RLE 七个角色类的 `ALLOWED_ACTIONS` 派生并减去 `no_action`,角色允许了未定义动作时导入即抛错(fail loud)。
3. `tools/assembly.py`:`assemble_action_plan(role, tick, tool_calls)` 接受 OpenAI SDK 对象与裸 dict,逐条校验、坏调用记 `ToolCallError`(index/tool/call_id/reason)不中断其他调用、不做任何修复(错误是 A/B 数据);零调用=空计划零错误(no_action 形态)。
4. `prompts/prompts.py`:共享前缀改为工具协议版(格式指令全删,策略规则逐条保留,结构仍为 前缀+开局手册(day<3)+阶段块+角色块 以保留 KV cache 布局);`ROLE_INFO` 从 RLE 角色类提取描述/任务保证零漂移,唯一例外 map_analyst 原文引用 summary 字段与 no_action,按工具协议改写且七项分析清单逐条保留;user prompt 尾行改为工具提示行,格式提醒删除。
5. `runner/README.md`:下一任务(provider/loop 集成与 A/B)设计结论——felix `**kwargs` 直通已验证、`</think>` 预填与 tools 并存风险、A/B 指标清单。

### 测试修正记录

- 3 处 `result.plan.actions == ()` → `== []`:pydantic list 与 tuple 恒不等,测试笔误非行为问题。
- prompt 文案 2 处对齐锚点:补回"每个殖民者都需要一次专属调用"句(旧版有、初稿改写时丢)、"可用的工具"→"可用工具"。

### 涉及文件

- rimworld_lab/tool-protocol/tools/schemas.py: 14 个参数模型 + 常量 + 校验器
- rimworld_lab/tool-protocol/tools/catalog.py: ToolSpec、TOOL_SPECS、ROLE_TOOL_NAMES、build_openai_tools/build_role_tools
- rimworld_lab/tool-protocol/tools/assembly.py: assemble_action_plan、AssemblyResult、ToolCallError
- rimworld_lab/tool-protocol/tools/__init__.py: 导出面
- rimworld_lab/tool-protocol/prompts/prompts.py: 前缀/手册/阶段块/ROLE_INFO/build_system_prompt/build_user_prompt
- rimworld_lab/tool-protocol/prompts/__init__.py: 导出面
- rimworld_lab/tool-protocol/runner/README.md: 下一任务设计
- rimworld_lab/tool-protocol/{tools,prompts}/tests/: 25 个测试

## ④ 验证结果

### 测试输出

红(TDD 先行,模块未实现):

```
E   ModuleNotFoundError: No module named 'prompts.prompts'
ERROR .../tools/tests/test_assembly.py
ERROR .../tools/tests/test_catalog.py
ERROR .../prompts/tests/test_prompts.py
3 errors in 0.20s
```

绿(实现完成后,于 RLE uv 环境 `uv run pytest <两个测试目录> -q`):

```
.....................                                                    [100%]
25 passed in 0.15s
```

### 不变量回归

RLE 全量测试(`cd RLE && uv run pytest -q`):

```
621 passed in 19.02s
```

RLE 仓库工作区存在本任务开始前的既有未提交改动(`src/rle/protocol/observation.py`、`src/rle/rimapi/client.py`、部分 golden fixtures);本任务未写入 RLE 任何文件,上述基线在该既有状态下通过。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
