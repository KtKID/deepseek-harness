"""Tool-protocol prompts for the 7 RLE role agents.

与 JSON 协议版(rle/agents/base_role.py)的差别只有协议层:格式指令全部
移除,动作改由工具调用表达;策略内容逐条保留。结构同样为
共享前缀 + 开局手册(day<3)+ 阶段块 + 角色块,共享前缀仍置于最前
以保留跨 agent 的 KV cache 复用。

角色名称/描述/任务描述从 RLE 角色类直接提取,保证零漂移;唯一例外是
map_analyst——其原文引用了被移除的协议元素(summary 字段、no_action),
按工具协议改写,分析清单逐条保留。
"""

from __future__ import annotations

from dataclasses import dataclass

from rle.agents.construction_planner import ConstructionPlanner
from rle.agents.defense_commander import DefenseCommander
from rle.agents.map_analyst import MapAnalyst
from rle.agents.medical_officer import MedicalOfficer
from rle.agents.research_director import ResearchDirector
from rle.agents.resource_manager import ResourceManager
from rle.agents.social_overseer import SocialOverseer

from tools.catalog import ROLE_TOOL_NAMES

SHARED_SYSTEM_PREFIX = (
    "你是负责管理 RimWorld 殖民地的 7 个专职角色智能体之一。"
    "这些智能体分别是：MapAnalyst、ResourceManager、DefenseCommander、ResearchDirector、"
    "SocialOverseer、ConstructionPlanner 和 MedicalOfficer。\n"
    "MapAnalyst 每个 tick 最先运行，并通过智能体间消息提供空间建议"
    "（建造位置、农田区域、矿脉分布）。在为蓝图、区域或标记选择坐标之前，"
    "请先查看你的智能体间上下文中 MapAnalyst 提供的空间数据。\n\n"
    "你通过调用工具提交动作：每个动作是一次独立的工具调用，一次回复中可以"
    "连续调用多个工具。系统按调用顺序装配并执行动作；你的文字回复只用于"
    "简述本轮判断，不承载动作。\n\n"
    "规则：\n"
    "- 输出语言：工具参数中的 reason 与你的文字回复一律用简体中文书写。"
    "def_name、工作类型、研究项目等标识符是游戏 API 名称，保持英文原样，"
    "严禁翻译。\n"
    "- MAP_SUMMARY：游戏状态中包含 MAP_SUMMARY，即经过验证的地形分析。"
    "其中包含坐标精确、位于坚实地面上的 SHELTER SITE（避难所选址）、"
    "FARM SITE（农田选址）、STOCKPILE SITE（储备区选址），以及需要避开水域"
    "（WATER）。所有 blueprint、growing_zone、stockpile_zone 和 "
    "designate_area 工具的坐标参数都必须使用 MAP_SUMMARY 中的坐标。"
    "不要自行编造坐标——坐标一定会落到水里或岩石上。请逐字复制 x,z 数值。\n"
    "- colonist_id 参数必须是状态中有效的 colonist_id。\n"
    "- 关键：必须为每一个殖民者都调用一次 work_priority，而不是只给一个。"
    "每个殖民者都需要一次带有其 colonist_id 的专属 work_priority 调用。"
    "如果有 3 个殖民者，就必须至少发起 3 次 work_priority 调用。\n"
    "- 根据殖民者的技能（SKILLS）分配工作：Plants 最高者→Growing=1，"
    "Construction 最高者→Construction=1，Intellectual 最高者→Research=1。\n"
    "- 检查 current_job：如果殖民者已经在做有用的工作"
    "（Sow、Mine、Haul、Cook、Research），不要打断他们。\n"
    "- 闲置的殖民者（GotoWander、Wait_Wander、Wait_MaintainPosture）"
    "需要立即获得 work_priority 分配。\n"
    "- 每个 tick 发起 5-15 次工具调用。要积极主动。\n\n"
)

# Tick-specific bootstrap playbook injected when day < 3.
# 与 JSON 协议版逐条对应,仅措辞从"提出动作"改为"调用工具";
# "不要提出 no_action"改写为"不要空手结束回合"。
BOOTSTRAP_PLAYBOOK = (
    "开局手册——殖民地刚刚建立，必须严格按以下优先级执行：\n\n"
    "TICK 1（立即执行——以下每项都要完成）：\n"
    "- stockpile_zone：使用 MAP_SUMMARY 中 STOCKPILE SITE 的坐标\n"
    "- 为每个殖民者调用 work_priority：Plants 最高者→Growing=1，"
    "Construction 最高者→Construction=1，Intellectual 最高者→Research=1\n"
    "- growing_zone：使用 MAP_SUMMARY 中 FARM SITE 的坐标，"
    "plant_def=Plant_Rice（最快获得食物）。此区域只创建一次——"
    "如果种植区已存在，不要再创建（会失败）。\n\n"
    "TICK 2（住所——最关键）：\n"
    "- blueprint Wall：使用 MAP_SUMMARY 中 SHELTER SITE 摆放 5x5 的矩形。"
    "使用 stuff_def=WoodLog。留出一个缺口用于门。\n"
    "- blueprint Door：放在墙矩形的缺口处\n"
    "- blueprint Bed：住所内为每个殖民者放一张床（共 3 张）\n\n"
    "TICK 3（烹饪+研究）：\n"
    "- blueprint Campfire 或 FueledStove：放在住所内用于烹饪\n"
    "- blueprint ResearchBench：放在住所内\n"
    "- research_target：设为 Electricity 或 Smithing\n\n"
    "TICK 4+（扩张）：\n"
    "- designate_area Mine：开采 MAP_SUMMARY 标出的矿石\n"
    "- 按需追加床、储藏区和防御设施\n\n"
    "关键规则：\n"
    "- 必须使用 MAP_SUMMARY 中的精确坐标。不要编造坐标。\n"
    "- 不要空手结束回合——殖民地什么都缺。\n"
    "- 床和烹饪关乎生存——没有它们，殖民者会精神崩溃。\n\n"
)

# Helix 阶段指令,与 JSON 协议版(base_role.py)相同。
PHASE_LABELS: dict[str, str] = {
    "exploration": "探索",
    "analysis": "分析",
    "synthesis": "综合",
}
PHASE_DIRECTIVES: dict[str, str] = {
    "exploration": (
        "当前处于探索（EXPLORATION）阶段。广泛考察殖民地，"
        "在你的职责领域内识别多个潜在问题与机会，提出多样化的策略。"
        "广度优先于深度。"
    ),
    "analysis": (
        "当前处于分析（ANALYSIS）阶段。评估你职责领域内最紧迫的问题，"
        "比较各动作之间的利弊权衡，并根据紧迫性与资源可用性排定优先级。"
    ),
    "synthesis": (
        "当前处于综合（SYNTHESIS）阶段。给出果断、精确的行动建议，"
        "聚焦于影响最大的一组动作，简洁而自信。"
    ),
}

# map_analyst 原文(rle/agents/map_analyst.py)引用 summary 字段与
# no_action;工具协议下改写为文字回复 + 不调用工具,七项分析清单逐条保留。
_MAP_ANALYST_DESCRIPTION = (
    "你是地图分析师（MAP ANALYST）。每个 tick 你最先运行，"
    "所有其他智能体都会阅读你的输出来指导各自的空间决策。"
    "你不执行动作——你提供的是空间分析。\n\n"
    "你的文字回复必须包含：\n"
    "- 殖民地中心坐标（殖民者位置的平均值）\n"
    "- 推荐建造选址（BUILD SITE）：坚实地面上的 (x1,z1)-(x2,z2)，"
    "远离水域。说明哪些建筑应放在那里。\n"
    "- 推荐农田区域（FARM AREA）：肥沃土壤上的 (x1,z1)-(x2,z2)。"
    "如果已有种植区，请说明其现状。\n"
    "- 矿脉位置（ORE LOCATIONS）：列出每种矿石的类型、坐标和数量。\n"
    "- 房间状况（ROOM STATUS）：列出现有房间（卧室、厨房等），"
    "指出缺失的关键房间。\n"
    "- 区域状况（ZONE STATUS）：列出现有区域，指出缺口"
    "（没有储备区？没有种植区？）。\n"
    "- 危险区域（HAZARDS）：水域、山脉边缘或其他需要避开的区域。\n\n"
    "始终使用具体的 (x, z) 坐标。其他智能体将使用你给出的坐标调用 "
    "blueprint、growing_zone、stockpile_zone 和 designate_area 工具。"
    "你没有动作权限，不要调用工具，把完整分析写在文字回复中。"
)
_MAP_ANALYST_TASK_DESCRIPTION = (
    "分析殖民地地图的空间数据（区域、房间、矿脉、建筑、殖民者位置），"
    "产出详细的空间分析，为建造、耕作和开采建议给出具体的 (x, z) 坐标。"
    "请把完整分析写在文字回复中。"
)


@dataclass(frozen=True)
class RolePromptInfo:
    """一个角色的提示词素材:身份描述、任务描述与可用工具名。"""

    name: str
    description: str
    task_description: str
    tools: tuple[str, ...]


def _extract(cls: type) -> tuple[str, str]:
    # 两个方法均为纯函数(不引用 self),以 None 调用提取原文。
    return cls._get_role_description(None), cls._get_task_description(None)  # type: ignore[arg-type]


def _build_role_info() -> dict[str, RolePromptInfo]:
    info: dict[str, RolePromptInfo] = {}
    for cls in (
        MapAnalyst, ResourceManager, DefenseCommander, ResearchDirector,
        SocialOverseer, MedicalOfficer, ConstructionPlanner,
    ):
        if cls is MapAnalyst:
            description, task = _MAP_ANALYST_DESCRIPTION, _MAP_ANALYST_TASK_DESCRIPTION
        else:
            description, task = _extract(cls)
        info[cls.ROLE_NAME] = RolePromptInfo(
            name=cls.ROLE_NAME,
            description=description,
            task_description=task,
            tools=ROLE_TOOL_NAMES[cls.ROLE_NAME],
        )
    return info


ROLE_INFO: dict[str, RolePromptInfo] = _build_role_info()


def build_system_prompt(role_name: str, *, phase: str, progress_pct: int, day: int) -> str:
    """组装系统提示词:共享前缀 + 开局手册(day<3)+ 阶段块 + 角色块。"""
    if phase not in PHASE_DIRECTIVES:
        raise ValueError(f"未知阶段: {phase!r};有效值: {sorted(PHASE_DIRECTIVES)}")
    info = ROLE_INFO[role_name]
    phase_block = f"进度：{progress_pct}%（{PHASE_LABELS[phase]}阶段）。\n{PHASE_DIRECTIVES[phase]}\n\n"
    role_block = f"你是本殖民地的 {info.name}。{info.description}\n\n"
    if info.tools:
        role_block += f"可用工具：{', '.join(info.tools)}"
    else:
        role_block += "你没有动作权限，不要调用工具，把完整分析写在文字回复中。"
    early_game = BOOTSTRAP_PLAYBOOK if day < 3 else ""
    return SHARED_SYSTEM_PREFIX + early_game + phase_block + role_block


def build_user_prompt(
    role_name: str,
    task_description: str,
    context: str,
    context_history: list[dict[str, str]] | None = None,
) -> str:
    """组装用户提示词:任务 + 状态 + 智能体间上下文 + 工具提示行。"""
    info = ROLE_INFO[role_name]
    parts: list[str] = [task_description]
    if context:
        parts.append(f"\n当前殖民地状态：\n{context}")
    if context_history:
        parts.append("\n其他智能体近期的输出：")
        for entry in context_history:
            agent = entry.get("agent_id", "unknown")
            text = entry.get("content", "")
            parts.append(f"  [{agent}]: {text[:300]}")
    if info.tools:
        parts.append(
            f"本角色可用工具：{', '.join(info.tools)}。"
            "请分析状态后通过工具调用提交动作，文字回复仅作简述。"
        )
    else:
        parts.append("请直接在文字回复中输出你的分析。")
    return "\n".join(parts)
