"""Typed argument models for the 14 agent action tools.

每个模型的 ``model_json_schema()`` 直接作为 OpenAI tools 的 ``parameters``
下发,``model_validate`` 在装配时做客户端校验——schema 与校验同源。

字段契约转写自 ``rle/orchestration/action_executor.py`` 的 ``_h_*`` 处理器:
``colonist_id`` 映射到 ``Action.target_colonist_id``,其余字段进入
``Action.parameters``(``reason`` 除外)。两处历史漂移在此修正:
- tend 的医生参数名是 executor 读取的 ``doctor_id``(旧 prompt 写
  ``doctor_pawn_id``,值被静默丢弃)。
- 旧协议的 ``priority: 1-10`` 从未被执行器读取,不进入工具协议。
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WORK_TYPES: tuple[str, ...] = (
    "Firefighter", "Patient", "Doctor", "PatientBedRest", "BasicWorker",
    "Warden", "Handling", "Cooking", "Hunting", "Construction", "Growing",
    "Mining", "PlantCutting", "Smithing", "Tailoring", "Art", "Crafting",
    "Hauling", "Cleaning", "Research",
)
DESIGNATE_TYPES: tuple[str, ...] = ("Mine", "Harvest", "Deconstruct", "Hunt")
TIME_ASSIGNMENTS: tuple[str, ...] = ("Work", "Sleep", "Joy", "Anything")

_WORK_TYPES_DOC = ", ".join(WORK_TYPES)


class _ToolArgs(BaseModel):
    """所有工具参数模型的公共基类:reason 必填,未知字段拒绝。"""

    model_config = ConfigDict(frozen=True, extra="forbid")

    reason: str = Field(min_length=1, description="提出该动作的原因,用简体中文。")


class WorkPriorityArgs(_ToolArgs):
    """work_priority:设置一名殖民者的若干工作优先级。"""

    colonist_id: str = Field(description="目标殖民者的 colonist_id(必须是状态中有效的 id)。")
    priorities: dict[str, int] = Field(
        description=(
            "工作优先级映射:{工作类型: 1-4},1 为最高。"
            f"有效工作类型:{_WORK_TYPES_DOC}。必须原样使用这些名称。"
        ),
    )

    @field_validator("priorities")
    @classmethod
    def _check_priorities(cls, value: dict[str, int]) -> dict[str, int]:
        if not value:
            raise ValueError("priorities 不能为空,至少设置一项工作类型")
        invalid = sorted(set(value) - set(WORK_TYPES))
        if invalid:
            raise ValueError(f"无效的工作类型: {invalid};有效值:{_WORK_TYPES_DOC}")
        out_of_range = {w: p for w, p in value.items() if not 1 <= p <= 4}
        if out_of_range:
            raise ValueError(f"优先级必须是 1-4,得到: {out_of_range}")
        return value


class BlueprintArgs(_ToolArgs):
    """blueprint:放置一座建筑蓝图。"""

    def_name: str = Field(
        description="建筑定义名。常用:Wall、Door、Bed、StandingLamp、Campfire、"
        "FueledStove、Butcher、ResearchBench、SolarGenerator、Battery。",
    )
    x: int = Field(description="放置坐标 x,必须逐字取自 MAP_SUMMARY。")
    z: int = Field(description="放置坐标 z,必须逐字取自 MAP_SUMMARY。")
    stuff_def: str = Field(default="WoodLog", description="建材。前期 WoodLog,后期 BlocksGranite。")
    rotation: int = Field(default=0, ge=0, le=3, description="朝向 0-3。")


class GrowingZoneArgs(_ToolArgs):
    """growing_zone:创建种植区(矩形)。"""

    plant_def: str = Field(
        default="Plant_Rice",
        description="作物定义名。Plant_Rice 获得食物最快,另常用 Plant_Potato。",
    )
    x1: int = Field(description="矩形角点 x1(取自 MAP_SUMMARY 的 FARM SITE)。")
    z1: int = Field(description="矩形角点 z1。")
    x2: int = Field(description="矩形角点 x2。")
    z2: int = Field(description="矩形角点 z2。")


class StockpileZoneArgs(_ToolArgs):
    """stockpile_zone:创建储备区(矩形)。"""

    x1: int = Field(description="矩形角点 x1(取自 MAP_SUMMARY 的 STOCKPILE SITE)。")
    z1: int = Field(description="矩形角点 z1。")
    x2: int = Field(description="矩形角点 x2。")
    z2: int = Field(description="矩形角点 z2。")
    name: str | None = Field(default=None, description="区域名称,如 Supply。")
    priority: int = Field(
        default=3, ge=0, le=5,
        description="储存优先级 0-5,默认 3(Normal);1=Critical、2=High、4=Low。",
    )
    allowed_item_defs: list[str] | None = Field(default=None, description="允许存放的物品定义名(可选)。")
    allowed_item_categories: list[str] | None = Field(default=None, description="允许存放的物品类别(可选)。")


class DesignateAreaArgs(_ToolArgs):
    """designate_area:划定开采/收割/拆除/狩猎区域(矩形)。"""

    type: Literal["Mine", "Harvest", "Deconstruct", "Hunt"] = Field(
        description="区域类型:Mine 开采、Harvest 收割、Deconstruct 拆除、Hunt 狩猎。",
    )
    x1: int = Field(description="矩形角点 x1。")
    z1: int = Field(description="矩形角点 z1。")
    x2: int = Field(description="矩形角点 x2。")
    z2: int = Field(description="矩形角点 z2。")


class DraftArgs(_ToolArgs):
    """draft:征召或取消征召一名殖民者(战斗)。"""

    colonist_id: str = Field(description="目标殖民者的 colonist_id。")
    is_drafted: bool = Field(description="true 征召,false 取消征召。")


class MoveArgs(_ToolArgs):
    """move:移动一名殖民者到指定坐标。"""

    colonist_id: str = Field(description="目标殖民者的 colonist_id。")
    x: int = Field(description="目标坐标 x。")
    z: int = Field(description="目标坐标 z。")


class JobAssignArgs(_ToolArgs):
    """job_assign:直接指派一名殖民者执行特定工作。"""

    colonist_id: str = Field(description="目标殖民者的 colonist_id。")
    job_def: str = Field(description="工作定义名,如 Sow、Mine。")
    target_thing_id: int | None = Field(default=None, description="目标物件 id(可选)。")
    x: int | None = Field(default=None, description="目标位置坐标 x(可选)。")
    z: int | None = Field(default=None, description="目标位置坐标 z(可选)。")


class TimeAssignmentArgs(_ToolArgs):
    """time_assignment:设置一名殖民者在指定小时的日程安排。"""

    colonist_id: str = Field(description="目标殖民者的 colonist_id。")
    hours: list[Annotated[int, Field(ge=0, le=23)]] = Field(
        min_length=1,
        description="要设置的小时列表,取值 0-23,如 [18,19,20]。",
    )
    assignment: Literal["Work", "Sleep", "Joy", "Anything"] = Field(
        description="日程类型:Work、Sleep、Joy、Anything。",
    )


class BedRestArgs(_ToolArgs):
    """bed_rest:安排一名殖民者卧床休养(病人恢复)。"""

    colonist_id: str = Field(description="病人(目标殖民者)的 colonist_id。")
    bed_building_id: int | None = Field(default=None, description="指定床位的建筑 id(可选)。")


class TendArgs(_ToolArgs):
    """tend:让医生治疗病人。colonist_id 填病人,doctor_id 可选。"""

    colonist_id: str = Field(description="病人的 colonist_id。")
    doctor_id: int | None = Field(
        default=None, description="主治医生的 pawn id(可选;省略则由游戏分派医生)。",
    )


class TogglePowerArgs(_ToolArgs):
    """toggle_power:切换一栋建筑的电源开关。"""

    building_id: int = Field(description="目标建筑的 building id。")
    power_on: bool = Field(description="true 开启电源,false 关闭。")


class ResearchTargetArgs(_ToolArgs):
    """research_target:设定殖民地当前研究项目。"""

    project: str = Field(description="研究项目 defName,如 Electricity、Smithing。")


class ResearchStopArgs(_ToolArgs):
    """research_stop:停止当前研究。无需其他参数。"""
