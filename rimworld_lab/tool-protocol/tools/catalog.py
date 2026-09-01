"""OpenAI tool catalog and per-role tool subsets.

角色子集从 RLE 角色类的 ``ALLOWED_ACTIONS`` 派生,与 JSON 协议的行为面
完全一致;``no_action`` 移除——零工具调用即 no_action。角色允许了未定义
工具的动作名时,导入即抛错(fail loud):RLE 侧演进不会静默丢失动作。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from pydantic import BaseModel

from rle.agents.actions import Action
from rle.agents.construction_planner import ConstructionPlanner
from rle.agents.defense_commander import DefenseCommander
from rle.agents.map_analyst import MapAnalyst
from rle.agents.medical_officer import MedicalOfficer
from rle.agents.research_director import ResearchDirector
from rle.agents.resource_manager import ResourceManager
from rle.agents.social_overseer import SocialOverseer

from tools.schemas import (
    BedRestArgs,
    BlueprintArgs,
    DesignateAreaArgs,
    DraftArgs,
    GrowingZoneArgs,
    JobAssignArgs,
    MoveArgs,
    ResearchStopArgs,
    ResearchTargetArgs,
    StockpileZoneArgs,
    TendArgs,
    TimeAssignmentArgs,
    TogglePowerArgs,
    WorkPriorityArgs,
)


@dataclass(frozen=True)
class ToolSpec:
    """一个动作工具:OpenAI 形状生成 + 已校验参数到 Action 的映射。"""

    name: str
    description: str
    args_model: type[BaseModel]
    needs_colonist: bool = False

    def to_action(self, args: BaseModel) -> Action:
        """把已校验的参数模型实例映射为执行器可消费的 Action。

        colonist_id 进 target_colonist_id;reason 单独存放;work_priority
        的 priorities 映射展平为执行器文档形态 ``{WorkType: 1-4}``。
        """
        data = args.model_dump()
        reason = data.pop("reason")
        target = data.pop("colonist_id", None) if self.needs_colonist else None
        if self.name == "work_priority":
            parameters = data.pop("priorities")
        else:
            parameters = {key: value for key, value in data.items() if value is not None}
        return Action(
            action_type=self.name,
            target_colonist_id=target,
            parameters=parameters,
            reason=reason,
        )

    def openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.args_model.model_json_schema(),
            },
        }


# 定义顺序即 build_openai_tools 的输出顺序,保持稳定便于 diff 与 token 对比。
TOOL_SPECS: dict[str, ToolSpec] = {
    spec.name: spec
    for spec in (
        ToolSpec(
            name="work_priority",
            description="设置一名殖民者的工作优先级(一次可设置多项)。1 为最高、4 为最低;必须为每个殖民者都调用一次。",
            args_model=WorkPriorityArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="blueprint",
            description="放置一座建筑蓝图。def_name 常用:Wall、Door、Bed、StandingLamp、Campfire、FueledStove、Butcher、ResearchBench、SolarGenerator、Battery。坐标必须逐字取自 MAP_SUMMARY。",
            args_model=BlueprintArgs,
        ),
        ToolSpec(
            name="growing_zone",
            description="创建种植区(矩形)。坐标必须逐字取自 MAP_SUMMARY 的 FARM SITE;同一区域只能创建一次。",
            args_model=GrowingZoneArgs,
        ),
        ToolSpec(
            name="stockpile_zone",
            description="创建储备区(矩形)。坐标必须逐字取自 MAP_SUMMARY 的 STOCKPILE SITE。",
            args_model=StockpileZoneArgs,
        ),
        ToolSpec(
            name="designate_area",
            description="划定开采/收割/拆除/狩猎区域(矩形)。坐标参照 MAP_SUMMARY 与矿脉信息。",
            args_model=DesignateAreaArgs,
        ),
        ToolSpec(
            name="draft",
            description="征召或取消征召一名殖民者(战斗动员)。",
            args_model=DraftArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="move",
            description="移动一名殖民者到指定坐标。",
            args_model=MoveArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="job_assign",
            description="直接指派一名殖民者执行特定工作(如 Sow、Mine)。",
            args_model=JobAssignArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="time_assignment",
            description="设置一名殖民者在指定小时的日程安排(Work/Sleep/Joy/Anything)。",
            args_model=TimeAssignmentArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="bed_rest",
            description="安排一名殖民者卧床休养(病人恢复)。",
            args_model=BedRestArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="tend",
            description="让医生治疗病人。colonist_id 填病人的 id,doctor_id 可选。",
            args_model=TendArgs,
            needs_colonist=True,
        ),
        ToolSpec(
            name="toggle_power",
            description="切换一栋建筑的电源开关。",
            args_model=TogglePowerArgs,
        ),
        ToolSpec(
            name="research_target",
            description="设定殖民地当前研究项目。",
            args_model=ResearchTargetArgs,
        ),
        ToolSpec(
            name="research_stop",
            description="停止当前研究。",
            args_model=ResearchStopArgs,
        ),
    )
}

_ROLE_CLASSES = (
    MapAnalyst,
    ResourceManager,
    DefenseCommander,
    ResearchDirector,
    SocialOverseer,
    MedicalOfficer,
    ConstructionPlanner,
)


def _derive_role_tool_names() -> dict[str, tuple[str, ...]]:
    mapping: dict[str, tuple[str, ...]] = {}
    for cls in _ROLE_CLASSES:
        wanted = cls.ALLOWED_ACTIONS - {"no_action"}
        missing = wanted - TOOL_SPECS.keys()
        if missing:
            raise RuntimeError(
                f"角色 {cls.ROLE_NAME} 允许了未定义工具的动作: {sorted(missing)};"
                "请在 tools/schemas.py 与 catalog.py 补齐定义",
            )
        mapping[cls.ROLE_NAME] = tuple(sorted(wanted))
    return mapping


ROLE_TOOL_NAMES: dict[str, tuple[str, ...]] = _derive_role_tool_names()


def build_openai_tools(names: Iterable[str] | None = None) -> list[dict[str, Any]]:
    """生成 OpenAI chat.completions 的 tools 数组。

    传入 names 时只输出子集(角色过滤);未知名字抛 KeyError。
    """
    if names is None:
        keys = TOOL_SPECS.keys()
    else:
        keys = list(names)
    return [TOOL_SPECS[name].openai_tool() for name in keys]


def build_role_tools(role_name: str) -> list[dict[str, Any]]:
    """某个角色可见的 OpenAI tools 子集(map_analyst 为空列表)。"""
    return build_openai_tools(ROLE_TOOL_NAMES[role_name])
