"""API-MAP 生成系统的守门:新鲜度、表头、覆盖分区、非法输入拒绝。"""

from __future__ import annotations

from pathlib import Path

import pytest

import tools.read_catalog as read_catalog
from tools import gen_api_map
from tools.catalog import TOOL_SPECS
from tools.read_catalog import READ_TOOL_SPECS, ReadToolSpec

_LAB_ROOT = Path(__file__).resolve().parents[3]


def test_documents_are_fresh() -> None:
    for rel, text in gen_api_map.build_documents().items():
        committed = (_LAB_ROOT / rel).read_text(encoding="utf-8")
        assert committed == text, (
            f"{rel} 与代码数据源不一致——改了 api_catalog / tools 目录后请重新生成:"
            "cd rimworld_lab && uv run --project /Volumes/machub_app/proj/x-games/x-rimworld/RLE "
            "python tool-protocol/tools/gen_api_map.py"
        )


def test_generated_headers_present() -> None:
    docs = gen_api_map.build_documents()
    assert docs["API-MAP.md"].startswith("> ⚠️ **自动生成内容，不要手动修改")
    assert '"_header": "自动生成内容，不要手动修改' in docs["api-map.json"]


def test_coverage_partitions_catalog() -> None:
    data = gen_api_map._collect()
    stats = data["stats"]
    for section in ("game_control", "read", "write"):
        uncovered = len(data["uncovered"][section])
        assert stats[section]["covered"] + uncovered == stats[section]["total"], section
    assert stats["game_control"] == {"covered": 5, "total": 5}
    assert [t["name"] for t in data["write_tools"]] == list(TOOL_SPECS.keys())


def test_unknown_endpoint_key_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    alerts = READ_TOOL_SPECS["alerts"]
    bogus = ReadToolSpec(
        name="bogus", description="x", args_model=alerts.args_model,
        execute=alerts.execute, endpoints={"": ("nonexistent_key",)},
    )
    monkeypatch.setitem(READ_TOOL_SPECS, "bogus", bogus)
    with pytest.raises(RuntimeError, match="nonexistent_key"):
        gen_api_map._collect()


def test_dispatch_keys_must_match_enum(monkeypatch: pytest.MonkeyPatch) -> None:
    game_state = READ_TOOL_SPECS["game_state"]
    bogus = ReadToolSpec(
        name="bogus", description="x", args_model=game_state.args_model,
        execute=game_state.execute, endpoints={"summary": ("game_state",)},
    )
    monkeypatch.setitem(READ_TOOL_SPECS, "bogus", bogus)
    with pytest.raises(RuntimeError, match="分发键"):
        gen_api_map._collect()


def test_no_dispatch_tool_requires_empty_key(monkeypatch: pytest.MonkeyPatch) -> None:
    alerts = READ_TOOL_SPECS["alerts"]
    bogus = ReadToolSpec(
        name="bogus", description="x", args_model=alerts.args_model,
        execute=alerts.execute, endpoints={"status": ("ui_alerts",)},
    )
    monkeypatch.setitem(READ_TOOL_SPECS, "bogus", bogus)
    with pytest.raises(RuntimeError, match="无 kind/action 分发"):
        gen_api_map._collect()


def test_read_tool_specs_all_declare_endpoints() -> None:
    for spec in read_catalog.READ_TOOL_SPECS.values():
        assert spec.endpoints, spec.name
        for keys in spec.endpoints.values():
            assert keys, spec.name
