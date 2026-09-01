"""读/控制工具:schema 形状、角色子集、执行分发与 MAP_SUMMARY 文案。"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from rimapi.schemas import (
    AlertData,
    AreaRect,
    ColonistData,
    ColonyData,
    ResearchData,
    ResourceData,
    RoomData,
    TerrainSummary,
    WeatherData,
    ZoneData,
)
from tools.catalog import ROLE_TOOL_NAMES
from tools.read_catalog import (
    READ_TOOL_SPECS,
    ROLE_READ_TOOLS,
    build_read_openai_tools,
    build_role_read_tools,
    format_map_summary,
)


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def _colonist(cid: str = "1", x: int = 2, z: int = 3) -> ColonistData:
    return ColonistData(
        colonist_id=cid, name=f"Pawn{cid}", health=1.0, mood=0.6,
        skills={"Growing": 8}, traits=["Optimist"], current_job=None,
        is_drafted=False, needs={"food": 0.5}, injuries=[], position=(x, z),
    )


def _terrain() -> TerrainSummary:
    return TerrainSummary(
        colony_center=(2, 3),
        water_areas=[AreaRect(x1=20, z1=20, x2=25, z2=25, label="water")],
        recommended_shelter=AreaRect(x1=4, z1=4, x2=10, z2=10),
        recommended_farm=AreaRect(x1=4, z1=4, x2=11, z2=11),
        recommended_stockpile=AreaRect(x1=4, z1=4, x2=8, z2=8),
    )


def _stub(**methods: Any) -> AsyncMock:
    stub = AsyncMock()
    for name, value in methods.items():
        getattr(stub, name).return_value = value
    return stub


def test_read_tool_shape() -> None:
    tools = build_read_openai_tools()
    assert [t["function"]["name"] for t in tools] == [
        "game_state", "map_info", "colonists", "resources",
        "alerts", "research_info", "save_management", "pause_control",
    ]
    for tool in tools:
        assert tool["type"] == "function"
        assert tool["function"]["description"]
        assert isinstance(tool["function"]["parameters"], dict)


def test_enums_and_ranges_in_schema() -> None:
    game_state = READ_TOOL_SPECS["game_state"].args_model.model_json_schema()
    assert game_state["properties"]["kind"]["enum"] == ["status", "overview"]
    map_info = READ_TOOL_SPECS["map_info"].args_model.model_json_schema()
    assert map_info["properties"]["kind"]["enum"] == [
        "summary", "zones", "rooms", "buildings", "power", "ore", "weather", "farm",
    ]
    save = READ_TOOL_SPECS["save_management"].args_model.model_json_schema()
    assert save["properties"]["action"]["enum"] == ["save", "load"]
    assert set(save["required"]) == {"action", "save_name"}
    pause = READ_TOOL_SPECS["pause_control"].args_model.model_json_schema()
    assert pause["properties"]["action"]["enum"] == ["pause", "unpause"]
    assert pause["properties"]["speed"]["minimum"] == 1
    assert pause["properties"]["speed"]["maximum"] == 3


def test_role_read_tool_keys_match_write_roles() -> None:
    assert set(ROLE_READ_TOOLS) == set(ROLE_TOOL_NAMES)


def test_role_read_subsets() -> None:
    # map_analyst 只读;控制工具(存档/暂停)只给 construction_planner。
    assert set(ROLE_READ_TOOLS["map_analyst"]) == {
        "game_state", "map_info", "colonists", "resources", "alerts",
    }
    for role, names in ROLE_READ_TOOLS.items():
        if role != "construction_planner":
            assert "save_management" not in names, role
            assert "pause_control" not in names, role
    assert {"save_management", "pause_control"} <= set(
        ROLE_READ_TOOLS["construction_planner"]
    )
    analyst = build_role_read_tools("map_analyst")
    assert len(analyst) == len(ROLE_READ_TOOLS["map_analyst"])


def test_unknown_read_tool_name_raises() -> None:
    with pytest.raises(KeyError):
        build_read_openai_tools(["nonexistent"])


def test_exec_game_state_status_vs_overview() -> None:
    colony = ColonyData(name="Colony", wealth=12000.0, day=1, tick=60000,
                        population=3, mood_average=0.6, food_days=5.0)
    # status:只碰 get_colony
    stub = _stub(get_colony=colony)
    result = _run(READ_TOOL_SPECS["game_state"].execute(
        stub, READ_TOOL_SPECS["game_state"].args_model()))
    assert result["kind"] == "status"
    assert result["colony"]["tick"] == 60000
    stub.get_colonists.assert_not_awaited()

    # overview:colony + colonists + alerts + weather
    weather = WeatherData(condition="Clear", temperature=15.0, outdoor_severity=0.0)
    stub = _stub(
        get_colony=colony,
        get_colonists=[_colonist("1"), _colonist("2", 5, 6)],
        get_alerts=[AlertData(label="Idle", explanation="idle pawns", priority="minor")],
        get_weather=weather,
    )
    args = READ_TOOL_SPECS["game_state"].args_model(kind="overview")
    result = _run(READ_TOOL_SPECS["game_state"].execute(stub, args))
    assert result["kind"] == "overview"
    assert [c["id"] for c in result["colonists"]] == ["1", "2"]
    assert result["weather"]["condition"] == "Clear"


def test_exec_map_info_summary_builds_map_summary_text() -> None:
    stub = _stub(
        get_colonists=[_colonist("1", 2, 3)],
        get_terrain_summary=_terrain(),
        get_zones=[ZoneData(zone_id="7", zone_type="Growing", label="", cell_count=12)],
        get_rooms=[RoomData(room_id="1", role="bedroom", size=4,
                            temperature=15.0, bed_count=2)],
    )
    args = READ_TOOL_SPECS["map_info"].args_model(kind="summary")
    result = _run(READ_TOOL_SPECS["map_info"].execute(stub, args))
    stub.get_terrain_summary.assert_awaited_once_with([(2, 3)], 0)
    stub.get_zones.assert_awaited_once_with(0)
    text = result["map_summary_text"]
    assert "殖民地中心：(2, 3)。" in text
    assert "SHELTER SITE（已验证的坚实地面）：在 (4,4)-(10,10)" in text
    assert "FARM SITE（已验证的肥沃土壤）：将 growing_zone 放在 x1=4,z1=4,x2=11,z2=11。" in text
    assert "STOCKPILE SITE（已验证的坚实地面）：将 stockpile_zone 放在 x1=4,z1=4,x2=8,z2=8。" in text
    assert "WATER（水域，切勿在此建造）：(20,20)-(25,25)。" in text
    assert "区域： (Growing, 12 cells)。" in text
    assert "房间：bedroom (4 cells, 2 beds)。" in text


def test_exec_map_info_summary_without_terrain() -> None:
    stub = _stub(
        get_colonists=[_colonist()],
        get_terrain_summary=None,
        get_zones=[],
        get_rooms=[],
    )
    args = READ_TOOL_SPECS["map_info"].args_model(kind="summary")
    result = _run(READ_TOOL_SPECS["map_info"].execute(stub, args))
    assert result["terrain"] is None
    assert result["map_summary_text"] is None
    assert "请立即创建储备区和种植区" not in (result["map_summary_text"] or "")


def test_exec_map_info_detail_kinds() -> None:
    cases = [
        ("zones", "get_zones", [ZoneData(zone_id="7", zone_type="Growing",
                                         label="", cell_count=12)], "zones"),
        ("rooms", "get_rooms", [RoomData(room_id="1", role="none", size=2,
                                         temperature=15.0)], "rooms"),
        ("power", "get_power_info", None, "power"),
        ("ore", "get_ore", [], "ore"),
        ("weather", "get_weather",
         WeatherData(condition="Rain", temperature=10.0, outdoor_severity=0.2),
         "weather"),
        ("farm", "get_farm_summary", None, "farm"),
    ]
    for kind, method, returns, key in cases:
        stub = _stub(**{method: returns})
        args = READ_TOOL_SPECS["map_info"].args_model(kind=kind)
        result = _run(READ_TOOL_SPECS["map_info"].execute(stub, args))
        assert result["kind"] == kind
        assert key in result

    stub = _stub(call=[{"id": 3, "def_name": "Wall"}])
    args = READ_TOOL_SPECS["map_info"].args_model(kind="buildings", map_id=2)
    result = _run(READ_TOOL_SPECS["map_info"].execute(stub, args))
    stub.call.assert_awaited_once_with("GET", "/api/v1/map/buildings?map_id=2")
    assert result["buildings"] == [{"id": 3, "def_name": "Wall"}]


def test_exec_colonists_kinds_and_id_filter() -> None:
    stub = _stub(get_colonists=[_colonist("1"), _colonist("2", 5, 6)])
    args_model = READ_TOOL_SPECS["colonists"].args_model
    positions = _run(READ_TOOL_SPECS["colonists"].execute(
        stub, args_model(kind="positions")))
    assert positions["colonists"] == [
        {"id": "1", "name": "Pawn1", "position": [2, 3]},
        {"id": "2", "name": "Pawn2", "position": [5, 6]},
    ]
    detailed = _run(READ_TOOL_SPECS["colonists"].execute(
        stub, args_model(kind="detailed", id="2")))
    assert len(detailed["colonists"]) == 1
    assert detailed["colonists"][0]["skills"] == {"Growing": 8}
    with pytest.raises(ValueError, match="colonist 9 not found"):
        _run(READ_TOOL_SPECS["colonists"].execute(stub, args_model(id="9")))


def test_exec_resources_alerts_research() -> None:
    resources = ResourceData(food=50.0, medicine=5, steel=100, wood=200,
                             components=10, silver=300, power_net=0.0)
    stub = _stub(get_resources=resources)
    args = READ_TOOL_SPECS["resources"].args_model()
    result = _run(READ_TOOL_SPECS["resources"].execute(stub, args))
    assert result["kind"] == "summary"
    assert result["resources"]["food"] == 50.0

    stub = _stub(get_resources_stored={"WoodLog": 342})
    args = READ_TOOL_SPECS["resources"].args_model(kind="stored", map_id=1)
    result = _run(READ_TOOL_SPECS["resources"].execute(stub, args))
    stub.get_resources_stored.assert_awaited_once_with(1)
    assert result == {"kind": "stored", "stored": {"WoodLog": 342}}

    stub = _stub(get_alerts=[])
    result = _run(READ_TOOL_SPECS["alerts"].execute(
        stub, READ_TOOL_SPECS["alerts"].args_model(map_id=3)))
    stub.get_alerts.assert_awaited_once_with(3)
    assert result == {"kind": "alerts", "alerts": []}

    research = ResearchData(current_project="Pemmican", progress=0.4,
                            completed=[], available=["Smithing"])
    stub = _stub(get_research=research)
    progress = _run(READ_TOOL_SPECS["research_info"].execute(
        stub, READ_TOOL_SPECS["research_info"].args_model(kind="progress")))
    assert progress == {"kind": "progress", "current_project": "Pemmican",
                        "progress": 0.4}
    stub = _stub(call={"projects": []})
    tree = _run(READ_TOOL_SPECS["research_info"].execute(
        stub, READ_TOOL_SPECS["research_info"].args_model(kind="tree")))
    stub.call.assert_awaited_once_with("GET", "/api/v1/research/tree")
    assert tree == {"kind": "tree", "tree": {"projects": []}}


def test_exec_save_and_pause_routing() -> None:
    stub = _stub(save_game={"success": True})
    save = _run(READ_TOOL_SPECS["save_management"].execute(
        stub, READ_TOOL_SPECS["save_management"].args_model(
            action="save", save_name="ep0")))
    stub.save_game.assert_awaited_once_with("ep0")
    assert save["action"] == "save"

    stub = _stub(load_game={"success": True})
    _run(READ_TOOL_SPECS["save_management"].execute(
        stub, READ_TOOL_SPECS["save_management"].args_model(
            action="load", save_name="ep0")))
    stub.load_game.assert_awaited_once_with("ep0")

    stub = _stub(pause_game={"success": True})
    paused = _run(READ_TOOL_SPECS["pause_control"].execute(
        stub, READ_TOOL_SPECS["pause_control"].args_model(action="pause")))
    stub.pause_game.assert_awaited_once_with()
    assert paused["speed"] == 0

    stub = _stub(unpause_game={"success": True})
    resumed = _run(READ_TOOL_SPECS["pause_control"].execute(
        stub, READ_TOOL_SPECS["pause_control"].args_model(
            action="unpause", speed=2)))
    stub.unpause_game.assert_awaited_once_with(2)
    assert resumed["speed"] == 2

    with pytest.raises(ValidationError):
        READ_TOOL_SPECS["pause_control"].args_model(action="unpause", speed=5)
    with pytest.raises(ValidationError):
        READ_TOOL_SPECS["save_management"].args_model(action="list", save_name="x")
