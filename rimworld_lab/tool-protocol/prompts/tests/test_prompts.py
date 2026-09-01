"""Prompt unit tests: policy retained, format instructions gone, RLE parity."""

from prompts.prompts import (
    ROLE_INFO,
    SHARED_SYSTEM_PREFIX,
    build_system_prompt,
    build_user_prompt,
)

POLICY_ANCHORS = (
    "7 个专职角色智能体",
    "MapAnalyst",
    "通过调用工具提交动作",
    "MAP_SUMMARY",
    "每个殖民者",
    "SKILLS",
    "current_job",
    "5-15 次工具调用",
    "简体中文",
)
FORMAT_BANNED = ("JSON", '"actions"', "confidence", "只响应", "no_action", "action_type", "0.0-1.0")


def test_shared_prefix_policy_kept_format_gone() -> None:
    for anchor in POLICY_ANCHORS:
        assert anchor in SHARED_SYSTEM_PREFIX, anchor
    for banned in FORMAT_BANNED:
        assert banned not in SHARED_SYSTEM_PREFIX, banned


def test_all_prompts_free_of_format_instructions() -> None:
    assert len(ROLE_INFO) == 7
    for role in ROLE_INFO:
        for phase in ("exploration", "analysis", "synthesis"):
            for day in (1, 5):
                system = build_system_prompt(role, phase=phase, progress_pct=30, day=day)
                user = build_user_prompt(
                    role, "分析任务", "TICK=3\n食物不足",
                    [{"agent_id": "map_analyst", "content": "西侧矿脉"}],
                )
                text = system + "\n" + user
                for banned in FORMAT_BANNED:
                    assert banned not in text, (role, phase, day, banned)


def test_bootstrap_playbook_day_gate() -> None:
    early = build_system_prompt("construction_planner", phase="exploration", progress_pct=0, day=1)
    late = build_system_prompt("construction_planner", phase="exploration", progress_pct=80, day=5)
    assert "TICK 1" in early
    assert "TICK 4" in early
    assert "TICK 1" not in late


def test_phase_block_present() -> None:
    for phase, label in (("exploration", "探索"), ("analysis", "分析"), ("synthesis", "综合")):
        text = build_system_prompt("resource_manager", phase=phase, progress_pct=50, day=5)
        assert label in text, phase
    assert "50%" in build_system_prompt("resource_manager", phase="analysis", progress_pct=50, day=5)


def test_role_block_lists_tools_and_description() -> None:
    system = build_system_prompt("construction_planner", phase="synthesis", progress_pct=90, day=5)
    assert "基础设施" in system  # 来自 RLE 角色描述原文
    assert "可用工具" in system
    assert "blueprint" in system
    analyst = build_system_prompt("map_analyst", phase="exploration", progress_pct=10, day=5)
    assert "不要调用工具" in analyst


def test_role_info_parity_with_rle() -> None:
    from rle.agents.construction_planner import ConstructionPlanner
    from rle.agents.defense_commander import DefenseCommander
    from rle.agents.map_analyst import MapAnalyst
    from rle.agents.medical_officer import MedicalOfficer
    from rle.agents.research_director import ResearchDirector
    from rle.agents.resource_manager import ResourceManager
    from rle.agents.social_overseer import SocialOverseer

    classes = (
        MapAnalyst, ResourceManager, DefenseCommander, ResearchDirector,
        SocialOverseer, MedicalOfficer, ConstructionPlanner,
    )
    for cls in classes:
        if cls.ROLE_NAME == "map_analyst":
            continue  # 唯一有意改写:原文引用 no_action/summary 协议元素
        info = ROLE_INFO[cls.ROLE_NAME]
        assert info.description == cls._get_role_description(None), cls.ROLE_NAME
        assert info.task_description == cls._get_task_description(None), cls.ROLE_NAME


def test_map_analyst_description_adapted() -> None:
    # 原文要求「summary 字段」+「actions 只含 no_action」;工具协议下改写为
    # 文字回复 + 不调用工具,分析清单本身逐条保留。
    info = ROLE_INFO["map_analyst"]
    assert "不要调用工具" in info.description
    assert "no_action" not in info.description
    assert "文字回复" in info.description
    for anchor in ("BUILD SITE", "FARM AREA", "ORE LOCATIONS", "ROOM STATUS", "ZONE STATUS", "HAZARDS"):
        assert anchor in info.description, anchor
    assert "summary 字段" not in info.task_description


def test_user_prompt_contains_state_and_no_format_reminder() -> None:
    user = build_user_prompt("medical_officer", "分析健康", "TICK=12\n伤员 2 名", [])
    assert "分析健康" in user
    assert "TICK=12" in user
    assert "可用工具" in user
    assert "确切结构" not in user
