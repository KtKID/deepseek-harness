"""Catalog unit tests: OpenAI tool shape, schema constraints, role mapping parity."""

import json

from rle.agents.construction_planner import ConstructionPlanner
from rle.agents.defense_commander import DefenseCommander
from rle.agents.map_analyst import MapAnalyst
from rle.agents.medical_officer import MedicalOfficer
from rle.agents.research_director import ResearchDirector
from rle.agents.resource_manager import ResourceManager
from rle.agents.social_overseer import SocialOverseer

from tools.catalog import ROLE_TOOL_NAMES, TOOL_SPECS, build_openai_tools
from tools.schemas import DESIGNATE_TYPES, WORK_TYPES

ROLE_CLASSES = (
    MapAnalyst,
    ResourceManager,
    DefenseCommander,
    ResearchDirector,
    SocialOverseer,
    MedicalOfficer,
    ConstructionPlanner,
)


def test_openai_tool_shape() -> None:
    tools = build_openai_tools()
    assert len(tools) == 14
    names = [t["function"]["name"] for t in tools]
    assert len(set(names)) == 14
    for tool in tools:
        assert tool["type"] == "function"
        fn = tool["function"]
        assert fn["description"].strip()
        params = fn["parameters"]
        assert params["type"] == "object"
        assert isinstance(params["properties"], dict) and params["properties"]
        assert params["additionalProperties"] is False
        assert "reason" in params["required"]
        json.dumps(params)  # must survive the wire


def test_work_priority_schema_documents_work_types() -> None:
    schema = TOOL_SPECS["work_priority"].args_model.model_json_schema()
    props = schema["properties"]
    assert {"colonist_id", "priorities", "reason"} <= set(props)
    for work in ("Growing", "Construction", "Research"):
        assert work in props["priorities"]["description"]
    assert set(schema["required"]) == {"colonist_id", "priorities", "reason"}


def test_enum_and_range_schema() -> None:
    designate = TOOL_SPECS["designate_area"].args_model.model_json_schema()["properties"]["type"]
    assert set(designate["enum"]) == set(DESIGNATE_TYPES)
    hours = TOOL_SPECS["time_assignment"].args_model.model_json_schema()["properties"]["hours"]
    assert hours["items"]["minimum"] == 0
    assert hours["items"]["maximum"] == 23
    rotation = TOOL_SPECS["blueprint"].args_model.model_json_schema()["properties"]["rotation"]
    assert rotation["minimum"] == 0
    assert rotation["maximum"] == 3


def test_role_mapping_matches_rle() -> None:
    for cls in ROLE_CLASSES:
        expected = cls.ALLOWED_ACTIONS - {"no_action"}
        assert set(ROLE_TOOL_NAMES[cls.ROLE_NAME]) == expected, cls.ROLE_NAME
        for name in ROLE_TOOL_NAMES[cls.ROLE_NAME]:
            assert name in TOOL_SPECS
    assert ROLE_TOOL_NAMES["map_analyst"] == ()


def test_work_types_cover_prompt_list() -> None:
    # 旧 prompt 中列出的 20 个工作类型必须一个不少地进入 schema 文档与校验。
    expected = {
        "Firefighter", "Patient", "Doctor", "PatientBedRest", "BasicWorker",
        "Warden", "Handling", "Cooking", "Hunting", "Construction", "Growing",
        "Mining", "PlantCutting", "Smithing", "Tailoring", "Art", "Crafting",
        "Hauling", "Cleaning", "Research",
    }
    assert set(WORK_TYPES) == expected


def test_every_spec_has_reason_required() -> None:
    for name, spec in TOOL_SPECS.items():
        schema = spec.args_model.model_json_schema()
        assert "reason" in schema["required"], name
