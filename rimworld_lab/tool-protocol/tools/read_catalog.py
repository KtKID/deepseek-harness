"""执行型读/控制工具:一个语义域聚合若干 RIMAPI 端点,执行体调用收编的 RimAPIClient。

与 catalog.py 的写工具(提案→装配 ActionPlan)不同,这些工具直接执行并返回
数据字典;``map_info(kind=summary)`` 附带 ``map_summary_text``,由
format_map_summary 生成,文案与 RLE ``base_role`` 的 MAP_SUMMARY 逐字对齐
(锚点:殖民地中心 / SHELTER SITE / FARM SITE / STOCKPILE SITE / WATER /
区域 / 房间),坐标可被写工具逐字引用。

运行时不 import rimapi:执行体按结构约定接受"具备收编 RimAPIClient 读/写
方法面"的任意对象,测试注入 stub,runner 注入真客户端并把
rimworld_lab.rimapi 放上 sys.path。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from rimapi.client import RimAPIClient


# ---------------------------------------------------------------------
# 参数模型(schema 与校验同源,Literal 枚举进 JSON schema)
# ---------------------------------------------------------------------

class GameStateArgs(BaseModel):
    """game_state:status=殖民地概要,overview=另含殖民者简表/警报/天气。"""

    kind: Literal["status", "overview"] = "status"


class MapInfoArgs(BaseModel):
    """map_info:summary=选址分析,其余 kind=对应明细端点。"""

    kind: Literal[
        "summary", "zones", "rooms", "buildings", "power", "ore", "weather", "farm",
    ] = "summary"
    map_id: int = 0


class ColonistsArgs(BaseModel):
    """colonists:basic/detailed/positions 三档,id 指定时只返回该殖民者。"""

    kind: Literal["basic", "detailed", "positions"] = "basic"
    id: str | None = None


class ResourcesArgs(BaseModel):
    """resources:summary=汇总,stored=逐项存量。"""

    kind: Literal["summary", "stored"] = "summary"
    map_id: int = 0


class AlertsArgs(BaseModel):
    """alerts:当前游戏内警报(袭击/饥荒/闲置等)。"""

    map_id: int = 0


class ResearchInfoArgs(BaseModel):
    """research_info:summary=全量,progress=仅当前项目,tree=科技树原文。"""

    kind: Literal["summary", "progress", "tree"] = "summary"


class SaveManagementArgs(BaseModel):
    """save_management:save/load 两个动作,save_name 必填。"""

    action: Literal["save", "load"]
    save_name: str


class PauseControlArgs(BaseModel):
    """pause_control:pause 暂停;unpause 以 speed(1-3)恢复。"""

    action: Literal["pause", "unpause"]
    speed: int = Field(default=1, ge=1, le=3)


# ---------------------------------------------------------------------
# 执行体
# ---------------------------------------------------------------------

def _basic_colonist(c: Any) -> dict[str, Any]:
    return {
        "id": c.colonist_id,
        "name": c.name,
        "health": c.health,
        "mood": c.mood,
        "position": list(c.position),
    }


async def _exec_game_state(
    client: RimAPIClient, args: GameStateArgs,
) -> dict[str, Any]:
    colony = await client.get_colony()
    if args.kind == "status":
        return {"kind": "status", "colony": colony.model_dump(mode="json")}
    colonists = await client.get_colonists()
    alerts = await client.get_alerts()
    weather = await client.get_weather()
    return {
        "kind": "overview",
        "colony": colony.model_dump(mode="json"),
        "colonists": [_basic_colonist(c) for c in colonists],
        "alerts": [a.model_dump(mode="json") for a in alerts],
        "weather": weather.model_dump(mode="json"),
    }


async def _map_detail(
    client: RimAPIClient, args: MapInfoArgs,
) -> dict[str, Any]:
    kind, map_id = args.kind, args.map_id
    if kind == "zones":
        zones = await client.get_zones(map_id)
        return {"kind": kind, "zones": [z.model_dump(mode="json") for z in zones]}
    if kind == "rooms":
        rooms = await client.get_rooms(map_id)
        return {"kind": kind, "rooms": [r.model_dump(mode="json") for r in rooms]}
    if kind == "buildings":
        buildings = await client.call("GET", f"/api/v1/map/buildings?map_id={map_id}")
        return {"kind": kind, "buildings": buildings}
    if kind == "power":
        power = await client.get_power_info(map_id)
        return {"kind": kind, "power": power.model_dump(mode="json") if power else None}
    if kind == "ore":
        ore = await client.get_ore(map_id)
        return {"kind": kind, "ore": [o.model_dump(mode="json") for o in ore]}
    if kind == "weather":
        weather = await client.get_weather()
        return {"kind": kind, "weather": weather.model_dump(mode="json")}
    farm = await client.get_farm_summary(map_id)
    return {"kind": kind, "farm": farm.model_dump(mode="json") if farm else None}


async def _exec_map_info(
    client: RimAPIClient, args: MapInfoArgs,
) -> dict[str, Any]:
    if args.kind != "summary":
        return await _map_detail(client, args)
    colonists = await client.get_colonists()
    positions = [(c.position[0], c.position[1]) for c in colonists]
    terrain = await client.get_terrain_summary(positions, args.map_id)
    zones = await client.get_zones(args.map_id)
    rooms = await client.get_rooms(args.map_id)
    result = {
        "kind": "summary",
        "map_id": args.map_id,
        "terrain": terrain.model_dump(mode="json") if terrain else None,
        "zones": [z.model_dump(mode="json") for z in zones],
        "rooms": [r.model_dump(mode="json") for r in rooms],
    }
    result["map_summary_text"] = format_map_summary(result)
    return result


async def _exec_colonists(
    client: RimAPIClient, args: ColonistsArgs,
) -> dict[str, Any]:
    colonists = await client.get_colonists()
    if args.id is not None:
        colonists = [c for c in colonists if c.colonist_id == args.id]
        if not colonists:
            raise ValueError(f"colonist {args.id} not found")
    if args.kind == "positions":
        return {"kind": args.kind, "colonists": [
            {"id": c.colonist_id, "name": c.name, "position": list(c.position)}
            for c in colonists
        ]}
    if args.kind == "detailed":
        return {"kind": args.kind, "colonists": [
            c.model_dump(mode="json") for c in colonists
        ]}
    return {"kind": args.kind, "colonists": [_basic_colonist(c) for c in colonists]}


async def _exec_resources(
    client: RimAPIClient, args: ResourcesArgs,
) -> dict[str, Any]:
    if args.kind == "stored":
        stored = await client.get_resources_stored(args.map_id)
        return {"kind": args.kind, "stored": stored}
    resources = await client.get_resources()
    return {"kind": args.kind, "resources": resources.model_dump(mode="json")}


async def _exec_alerts(
    client: RimAPIClient, args: AlertsArgs,
) -> dict[str, Any]:
    alerts = await client.get_alerts(args.map_id)
    return {"kind": "alerts", "alerts": [a.model_dump(mode="json") for a in alerts]}


async def _exec_research_info(
    client: RimAPIClient, args: ResearchInfoArgs,
) -> dict[str, Any]:
    if args.kind == "tree":
        tree = await client.call("GET", "/api/v1/research/tree")
        return {"kind": args.kind, "tree": tree}
    research = await client.get_research()
    if args.kind == "progress":
        return {
            "kind": args.kind,
            "current_project": research.current_project,
            "progress": research.progress,
        }
    return {"kind": args.kind, "research": research.model_dump(mode="json")}


async def _exec_save_management(
    client: RimAPIClient, args: SaveManagementArgs,
) -> dict[str, Any]:
    if args.action == "save":
        response = await client.save_game(args.save_name)
    else:
        response = await client.load_game(args.save_name)
    return {"action": args.action, "save_name": args.save_name, "response": response}


async def _exec_pause_control(
    client: RimAPIClient, args: PauseControlArgs,
) -> dict[str, Any]:
    if args.action == "pause":
        response = await client.pause_game()
        speed = 0
    else:
        response = await client.unpause_game(args.speed)
        speed = args.speed
    return {"action": args.action, "speed": speed, "response": response}


# ---------------------------------------------------------------------
# 工具目录与角色子集
# ---------------------------------------------------------------------

@dataclass(frozen=True)
class ReadToolSpec:
    """一个读/控制工具:OpenAI 形状生成 + 执行体。

    endpoints 是声明式的 tool→API 对应关系(gen_api_map.py 的唯一数据来源):
    键为分发参数取值(无 kind/action 分发的工具用空串),值为 api_catalog
    (GAME_CONTROL/READ_CATALOG)端点键元组;生成器校验键存在、且分发取值集
    与参数模型的 Literal 枚举集一致——执行体与声明漂移时生成即抛。
    """

    name: str
    description: str
    args_model: type[BaseModel]
    execute: Callable[[Any, Any], Awaitable[dict[str, Any]]]
    endpoints: dict[str, tuple[str, ...]]
    notes: str = ""

    def openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.args_model.model_json_schema(),
            },
        }


# 定义顺序即 build_read_openai_tools 的输出顺序。
READ_TOOL_SPECS: dict[str, ReadToolSpec] = {
    spec.name: spec
    for spec in (
        ReadToolSpec(
            name="game_state",
            description=(
                "读取游戏状态。kind=status 返回殖民地概要(tick/天数/人口/财富);"
                "kind=overview 另含殖民者简表、警报与天气。"
            ),
            args_model=GameStateArgs,
            execute=_exec_game_state,
            endpoints={
                "status": ("game_state",),
                "overview": ("game_state", "colonists_detailed", "ui_alerts", "map_weather"),
            },
        ),
        ReadToolSpec(
            name="map_info",
            description=(
                "读取地图信息。kind=summary 返回选址分析(MAP_SUMMARY 文本,"
                "坐标必须逐字引用);其余 kind 返回 zones/rooms/buildings/"
                "power/ore/weather/farm 对应明细。"
            ),
            args_model=MapInfoArgs,
            execute=_exec_map_info,
            endpoints={
                "summary": ("map_terrain", "colonists_detailed", "map_zones", "map_rooms"),
                "zones": ("map_zones",),
                "rooms": ("map_rooms",),
                "buildings": ("map_buildings",),
                "power": ("map_power",),
                "ore": ("map_ore",),
                "weather": ("map_weather",),
                "farm": ("map_farm_summary",),
            },
            notes="summary 的选址分析为本地计算(_find_clear_rect),非端点能力",
        ),
        ReadToolSpec(
            name="colonists",
            description=(
                "读取殖民者列表。kind=basic|detailed|positions;"
                "id 可选,指定时只返回该殖民者。"
            ),
            args_model=ColonistsArgs,
            execute=_exec_colonists,
            endpoints={
                "basic": ("colonists_detailed", "colonists"),
                "detailed": ("colonists_detailed", "colonists"),
                "positions": ("colonists_detailed", "colonists"),
            },
            notes="detailed 端点优先,失败回退 basic 端点",
        ),
        ReadToolSpec(
            name="resources",
            description=(
                "读取殖民地资源。kind=summary 返回汇总;kind=stored 返回逐项存量。"
            ),
            args_model=ResourcesArgs,
            execute=_exec_resources,
            endpoints={
                "summary": ("resources_summary", "resources_stored", "map_power"),
                "stored": ("resources_stored",),
            },
        ),
        ReadToolSpec(
            name="alerts",
            description="读取当前游戏内警报(袭击/饥荒/闲置等)。",
            args_model=AlertsArgs,
            execute=_exec_alerts,
            endpoints={"": ("ui_alerts",)},
        ),
        ReadToolSpec(
            name="research_info",
            description="读取研究状态。kind=summary|progress|tree。",
            args_model=ResearchInfoArgs,
            execute=_exec_research_info,
            endpoints={
                "summary": ("research_summary",),
                "progress": ("research_summary",),
                "tree": ("research_tree",),
            },
            notes="progress 复用 summary 端点数据",
        ),
        ReadToolSpec(
            name="save_management",
            description=(
                "存档管理。action=save 保存,action=load 读取;save_name 必填。"
            ),
            args_model=SaveManagementArgs,
            execute=_exec_save_management,
            endpoints={
                "save": ("save",),
                "load": ("load",),
            },
            notes="RIMAPI 无列档端点,list 不可用",
        ),
        ReadToolSpec(
            name="pause_control",
            description="暂停控制。action=pause 暂停;action=unpause 以 speed(1-3)恢复。",
            args_model=PauseControlArgs,
            execute=_exec_pause_control,
            endpoints={
                "pause": ("pause",),
                "unpause": ("unpause",),
            },
        ),
    )
}

# 角色名与 catalog.ROLE_TOOL_NAMES 同集(test 断言);控制工具(存档/暂停)
# 本阶段只给 construction_planner(episode 执行者)。
ROLE_READ_TOOLS: dict[str, tuple[str, ...]] = {
    "map_analyst": ("game_state", "map_info", "colonists", "resources", "alerts"),
    "resource_manager": ("game_state", "resources", "map_info"),
    "defense_commander": ("game_state", "colonists", "alerts"),
    "research_director": ("game_state", "research_info"),
    "social_overseer": ("game_state", "colonists"),
    "medical_officer": ("game_state", "colonists", "alerts"),
    "construction_planner": (
        "game_state", "map_info", "colonists", "save_management", "pause_control",
    ),
}


def _check_role_read_tools() -> None:
    for role, names in ROLE_READ_TOOLS.items():
        missing = set(names) - READ_TOOL_SPECS.keys()
        if missing:
            raise RuntimeError(
                f"角色 {role} 引用了未定义的读工具: {sorted(missing)};"
                "请在 read_catalog.py 补齐定义",
            )


_check_role_read_tools()


def build_read_openai_tools(names: list[str] | None = None) -> list[dict[str, Any]]:
    """生成读/控制工具的 OpenAI tools 数组;未知名字抛 KeyError。"""
    keys = list(names) if names is not None else list(READ_TOOL_SPECS)
    return [READ_TOOL_SPECS[name].openai_tool() for name in keys]


def build_role_read_tools(role_name: str) -> list[dict[str, Any]]:
    """某个角色可见的读/控制工具子集。"""
    return build_read_openai_tools(list(ROLE_READ_TOOLS[role_name]))


# ---------------------------------------------------------------------
# MAP_SUMMARY 文案(与 RLE base_role 的格式逐字对齐)
# ---------------------------------------------------------------------

def format_map_summary(map_info: dict[str, Any]) -> str | None:
    """把 map_info(kind=summary) 的结果渲染为 MAP_SUMMARY 文本。

    terrain 为 None(接口不可用)时返回 None;坐标取值直接来自选址分析,
    消费方(写工具参数)必须逐字引用。
    """
    terrain = map_info.get("terrain")
    if terrain is None:
        return None
    lines: list[str] = []
    cx, cz = terrain["colony_center"]
    lines.append(f"殖民地中心：({cx}, {cz})。")

    shelter = terrain.get("recommended_shelter")
    if shelter:
        s = shelter
        lines.append(
            f"SHELTER SITE（已验证的坚实地面）："
            f"在 ({s['x1']},{s['z1']})-({s['x2']},{s['z2']}) 内放置墙/门/床。"
            f"所有 blueprint 动作的 x,z 必须落在该矩形内。"
        )
    farm = terrain.get("recommended_farm")
    if farm:
        f = farm
        lines.append(
            f"FARM SITE（已验证的肥沃土壤）："
            f"将 growing_zone 放在 x1={f['x1']},z1={f['z1']},x2={f['x2']},z2={f['z2']}。"
            f"所有 growing_zone 动作必须使用这些精确坐标。"
        )
    stockpile = terrain.get("recommended_stockpile")
    if stockpile:
        sp = stockpile
        lines.append(
            f"STOCKPILE SITE（已验证的坚实地面）："
            f"将 stockpile_zone 放在 x1={sp['x1']},z1={sp['z1']},"
            f"x2={sp['x2']},z2={sp['z2']}。"
        )
    water_areas = terrain.get("water_areas") or []
    if water_areas:
        water_strs = [
            f"({w['x1']},{w['z1']})-({w['x2']},{w['z2']})"
            for w in water_areas
        ]
        lines.append(f"WATER（水域，切勿在此建造）：{', '.join(water_strs)}。")

    zones = map_info.get("zones") or []
    if zones:
        zone_strs = [
            f"{z['label']} ({z['zone_type']}, {z['cell_count']} cells)"
            for z in zones[:8]
        ]
        lines.append(f"区域：{'；'.join(zone_strs)}。")
    else:
        lines.append("区域：无——请立即创建储备区和种植区。")

    rooms = map_info.get("rooms") or []
    real_rooms = [r for r in rooms if r["size"] > 1]
    if real_rooms:
        room_strs = [
            f"{r['role']} ({r['size']} cells, {r['bed_count']} beds)"
            for r in real_rooms[:6]
        ]
        lines.append(f"房间：{'；'.join(room_strs)}。")

    return "\n".join(lines)
