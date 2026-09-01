"""Assembly unit tests: tool_calls → ActionPlan mapping, error isolation, executor key contract."""

import json
from types import SimpleNamespace

from rle.agents.actions import ActionPlan

from tools.assembly import assemble_action_plan
from tools.schemas import WORK_TYPES


def _call(name: str, args: dict, call_id: str | None = None) -> dict:
    return {
        "id": call_id or f"call_{name}",
        "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
    }


def test_valid_parallel_calls_assemble_plan() -> None:
    calls = [
        _call("work_priority", {"colonist_id": "7", "priorities": {"Growing": 1, "Mining": 3}, "reason": "种植技能最高"}),
        _call("blueprint", {"def_name": "Wall", "x": 12, "z": -4, "reason": "开局建墙"}, call_id="c2"),
        _call("research_stop", {"reason": "暂停研究"}),
    ]
    result = assemble_action_plan("construction_planner", 42, calls)
    assert result.errors == ()
    plan = result.plan
    assert isinstance(plan, ActionPlan)
    assert plan.role == "construction_planner"
    assert plan.tick == 42
    assert [a.action_type for a in plan.actions] == ["work_priority", "blueprint", "research_stop"]
    work = plan.actions[0]
    assert work.target_colonist_id == "7"
    assert work.parameters == {"Growing": 1, "Mining": 3}
    assert work.reason == "种植技能最高"
    bp = plan.actions[1]
    assert bp.target_colonist_id is None
    assert bp.parameters["def_name"] == "Wall"
    assert bp.parameters["x"] == 12
    assert bp.parameters["z"] == -4


def test_tend_maps_patient_and_doctor() -> None:
    # 旧 prompt 教模型写 doctor_pawn_id,executor 读 doctor_id,值被静默丢弃——
    # 工具协议直接以 executor 契约为准。
    result = assemble_action_plan(
        "medical_officer", 3, [_call("tend", {"colonist_id": "3", "doctor_id": 5, "reason": "治疗伤口"})],
    )
    assert result.errors == ()
    action = result.plan.actions[0]
    assert action.target_colonist_id == "3"
    assert action.parameters == {"doctor_id": 5}


def test_invalid_json_args_recorded_not_raised() -> None:
    calls = [
        {"id": "bad", "function": {"name": "blueprint", "arguments": "{def_name: Wall"}},
        _call("research_stop", {"reason": "ok"}),
    ]
    result = assemble_action_plan("research_director", 9, calls)
    assert [a.action_type for a in result.plan.actions] == ["research_stop"]
    assert len(result.errors) == 1
    assert result.errors[0].tool_name == "blueprint"
    assert result.errors[0].index == 0
    assert result.errors[0].call_id == "bad"


def test_unknown_tool_recorded() -> None:
    result = assemble_action_plan("defense_commander", 1, [_call("teleport", {"x": 1, "z": 2, "reason": "x"})])
    assert result.plan.actions == []
    assert result.errors[0].tool_name == "teleport"


def test_missing_required_field() -> None:
    result = assemble_action_plan(
        "construction_planner", 1, [_call("blueprint", {"def_name": "Wall", "z": 3, "reason": "缺 x"})],
    )
    assert result.plan.actions == []
    assert "x" in result.errors[0].reason


def test_enum_violation() -> None:
    result = assemble_action_plan(
        "resource_manager", 1,
        [_call("designate_area", {"type": "dig", "x1": 0, "z1": 0, "x2": 2, "z2": 2, "reason": "r"})],
    )
    assert result.plan.actions == []
    assert len(result.errors) == 1


def test_work_priority_value_and_key_violation() -> None:
    for bad in ({}, {"Growing": 7}, {"Firefighterr": 1}):
        result = assemble_action_plan(
            "resource_manager", 1, [_call("work_priority", {"colonist_id": "1", "priorities": bad, "reason": "r"})],
        )
        assert result.plan.actions == []
        assert len(result.errors) == 1, bad


def test_extra_field_rejected() -> None:
    result = assemble_action_plan(
        "construction_planner", 1,
        [_call("blueprint", {"def_name": "Wall", "x": 1, "z": 2, "reason": "r", "foo": 1})],
    )
    assert result.plan.actions == []
    assert len(result.errors) == 1


def test_empty_calls_mean_empty_plan() -> None:
    # no_action 的工具协议形态:零调用即零动作,不是错误。
    result = assemble_action_plan("social_overseer", 1, [])
    assert result.plan.actions == []
    assert result.errors == ()


def test_openai_sdk_object_shape() -> None:
    call = SimpleNamespace(
        id="c1",
        function=SimpleNamespace(name="research_stop", arguments=json.dumps({"reason": "r"})),
    )
    result = assemble_action_plan("research_director", 1, [call])
    assert result.errors == ()
    assert len(result.plan.actions) == 1


# -- smoke: executor key contract ------------------------------------------
# 每个 ActionExecutor._h_* 处理器实际读取的 parameters 键,转写自
# rle/orchestration/action_executor.py。装配输出必须落在这些键之内,
# 否则现有执行器无法零改动消费(growing/stockpile/designate 处理器还接受
# x/z 回退键,一并列出)。

EXECUTOR_KEYS: dict[str, set[str]] = {
    "draft": {"is_drafted"},
    "move": {"x", "z"},
    "job_assign": {"job_def", "job", "target_thing_id", "target_position", "x", "z"},
    "time_assignment": {"assignment", "hours"},
    "bed_rest": {"bed_building_id"},
    "tend": {"doctor_id"},
    "blueprint": {"def_name", "x", "z", "stuff_def", "rotation", "map_id"},
    "growing_zone": {"plant_def", "x1", "z1", "x2", "z2", "x", "z", "map_id"},
    "stockpile_zone": {
        "x1", "z1", "x2", "z2", "x", "z", "name", "priority",
        "allowed_item_defs", "allowed_item_categories", "map_id",
    },
    "designate_area": {"type", "designation_type", "x1", "z1", "x2", "z2", "x", "z", "map_id"},
    "toggle_power": {"building_id", "power_on"},
    "research_target": {"project", "name", "force"},
    "research_stop": set(),
}
NEEDS_PAWN = {"work_priority", "draft", "move", "job_assign", "time_assignment", "bed_rest", "tend"}


def test_assembly_output_consumable_by_executor_contract() -> None:
    calls = [
        _call("work_priority", {"colonist_id": "2", "priorities": {"Cooking": 2}, "reason": "r"}),
        _call("blueprint", {"def_name": "Bed", "x": 5, "z": 6, "stuff_def": "WoodLog", "rotation": 1, "reason": "r"}),
        _call("growing_zone", {"plant_def": "Plant_Rice", "x1": 1, "z1": 2, "x2": 6, "z2": 7, "reason": "r"}),
        _call("stockpile_zone", {"x1": 1, "z1": 2, "x2": 6, "z2": 7, "name": "Supply", "reason": "r"}),
        _call("designate_area", {"type": "Mine", "x1": 1, "z1": 2, "x2": 6, "z2": 7, "reason": "r"}),
        _call("toggle_power", {"building_id": 9, "power_on": True, "reason": "r"}),
        _call("research_target", {"project": "Electricity", "reason": "r"}),
        _call("research_stop", {"reason": "r"}),
        _call("job_assign", {"colonist_id": "2", "job_def": "Sow", "x": 5, "z": 6, "reason": "r"}),
        _call("time_assignment", {"colonist_id": "2", "hours": [18, 19, 20], "assignment": "Joy", "reason": "r"}),
        _call("bed_rest", {"colonist_id": "4", "reason": "r"}),
        _call("tend", {"colonist_id": "4", "doctor_id": 2, "reason": "r"}),
        _call("draft", {"colonist_id": "5", "is_drafted": True, "reason": "r"}),
        _call("move", {"colonist_id": "5", "x": 10, "z": 11, "reason": "r"}),
    ]
    result = assemble_action_plan("resource_manager", 7, calls)
    assert result.errors == ()
    assert len(result.plan.actions) == 14
    for action in result.plan.actions:
        at = action.action_type
        if at == "work_priority":
            assert action.target_colonist_id
            assert action.parameters
            assert set(action.parameters) <= set(WORK_TYPES)
            assert all(isinstance(v, int) and 1 <= v <= 4 for v in action.parameters.values())
            continue
        assert set(action.parameters) <= EXECUTOR_KEYS[at], (at, action.parameters)
        if at in NEEDS_PAWN:
            assert action.target_colonist_id, at
        else:
            assert action.target_colonist_id is None, at
