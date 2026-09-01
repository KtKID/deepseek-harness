"""生成 tools↔API 对应关系文档(API-MAP.md + api-map.json)。

数据源:api_catalog(端点底册)+ tools/catalog(写工具,与 WRITE_CATALOG
按名 join)+ tools/read_catalog(读/控制工具,读其声明式 endpoints)。
产物顶部带中文警示;产物禁止手编,任何改动回数据源后重新生成
(增删 tools/api 的顺序见 rimworld_lab/README.md)。

生成(在 RLE uv 环境下,因其依赖 rle 包):
    uv run --project /Volumes/machub_app/proj/x-games/x-rimworld/RLE \\
        python tool-protocol/tools/gen_api_map.py   # 于 rimworld_lab/ 执行
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

_LAB_ROOT = Path(__file__).resolve().parents[2]
_TP_ROOT = _LAB_ROOT / "tool-protocol"
for _p in (str(_TP_ROOT), str(_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from rimapi.api_catalog import GAME_CONTROL, READ_CATALOG, WRITE_CATALOG  # noqa: E402
from tools.catalog import TOOL_SPECS  # noqa: E402
from tools.read_catalog import READ_TOOL_SPECS  # noqa: E402

HEADER = "自动生成内容，不要手动修改。改动请回数据源(api_catalog / tools 目录)后重新生成。"
REGEN_HINT = "tool-protocol/tools/gen_api_map.py(命令见 rimworld_lab/README.md)"


def _catalog_endpoint(key: str) -> dict[str, Any]:
    """按键取 GAME_CONTROL/READ_CATALOG 条目;不存在即抛(生成期 fail loud)。"""
    if key in GAME_CONTROL:
        return GAME_CONTROL[key]
    if key in READ_CATALOG:
        return READ_CATALOG[key]
    raise RuntimeError(f"工具引用了 catalog 未定义的端点键: {key!r}")


def _dispatch_values(spec: Any) -> list[str] | None:
    """参数模型 kind/action 字段的 Literal 枚举值;无则 None。"""
    schema = spec.args_model.model_json_schema()
    for field in ("kind", "action"):
        enum = schema.get("properties", {}).get(field, {}).get("enum")
        if enum is not None:
            return list(enum)
    return None


def _collect() -> dict[str, Any]:
    """校验并汇总映射数据;任何漂移在此抛出。"""
    read_tools: list[dict[str, Any]] = []
    covered_game: set[str] = set()
    covered_read: set[str] = set()
    for spec in READ_TOOL_SPECS.values():
        enum = _dispatch_values(spec)
        dispatch_keys = list(spec.endpoints.keys())
        if enum is not None and sorted(dispatch_keys) != sorted(enum):
            raise RuntimeError(
                f"工具 {spec.name} 的 endpoints 分发键 {sorted(dispatch_keys)} "
                f"与参数模型枚举 {sorted(enum)} 不一致",
            )
        if enum is None and dispatch_keys != [""]:
            raise RuntimeError(
                f"工具 {spec.name} 无 kind/action 分发,endpoints 键应为 ['']: "
                f"{dispatch_keys}",
            )
        dispatch = []
        for value, keys in spec.endpoints.items():
            for key in keys:
                _catalog_endpoint(key)  # 存在性校验
                if key in GAME_CONTROL:
                    covered_game.add(key)
                else:
                    covered_read.add(key)
            dispatch.append({
                "value": value,
                "endpoint_keys": list(keys),
                "calls": [
                    f"{_catalog_endpoint(k)['method']} {_catalog_endpoint(k)['path']}"
                    for k in keys
                ],
            })
        read_tools.append({
            "name": spec.name,
            "dispatch": dispatch,
            "notes": spec.notes,
        })

    missing_write = [name for name in TOOL_SPECS if name not in WRITE_CATALOG]
    if missing_write:
        raise RuntimeError(
            f"写工具名未出现在 WRITE_CATALOG(名字级 join 失败): {missing_write}",
        )
    covered_write = set(TOOL_SPECS.keys()) & set(WRITE_CATALOG.keys())

    def _uncovered(catalog: dict[str, Any], covered: set[str]) -> list[dict[str, Any]]:
        return [
            {"key": key, "method": entry["method"], "path": entry["path"],
             "description": entry.get("description", "")}
            for key, entry in sorted(catalog.items()) if key not in covered
        ]

    return {
        "stats": {
            "game_control": {"covered": len(covered_game), "total": len(GAME_CONTROL)},
            "read": {"covered": len(covered_read), "total": len(READ_CATALOG)},
            "write": {"covered": len(covered_write), "total": len(WRITE_CATALOG)},
        },
        "read_tools": read_tools,
        "write_tools": [
            {
                "name": name,
                "method": WRITE_CATALOG[name]["method"],
                "path": WRITE_CATALOG[name]["path"],
                "description": WRITE_CATALOG[name].get("description", ""),
            }
            for name in TOOL_SPECS
        ],
        "uncovered": {
            "game_control": _uncovered(GAME_CONTROL, covered_game),
            "read": _uncovered(READ_CATALOG, covered_read),
            "write": _uncovered(WRITE_CATALOG, covered_write),
        },
        "client_catalog_drift": _client_catalog_drift(),
    }


def _client_catalog_drift() -> dict[str, list[str]]:
    """client.py 字面调用的 path 与 catalog 声明的双向差集(仅信息提示)。

    只扫 client.py 的 _get/_post 字面量;read_catalog 经 client.call 透传的
    path 以其 endpoints 声明为准,不在此核对。
    """
    source = (_LAB_ROOT / "rimapi" / "client.py").read_text(encoding="utf-8")
    called = {
        match.split("?")[0]
        for match in re.findall(r'(?:self\._get|self\._post)\(\s*f?"([^"\\]+)"', source)
    }
    declared = {
        entry["path"].split("?")[0]
        for catalog in (GAME_CONTROL, READ_CATALOG, WRITE_CATALOG)
        for entry in catalog.values()
    }
    return {
        "client_only": sorted(called - declared),
        "no_client_literal": sorted(declared - called),
    }


def _render_markdown(data: dict[str, Any]) -> str:
    stats = data["stats"]
    lines: list[str] = [
        f"> ⚠️ **{HEADER}**",
        f"> 生成器:{REGEN_HINT}",
        "",
        "# Tools ↔ API 对应关系",
        "",
        f"覆盖统计:GAME_CONTROL {stats['game_control']['covered']}/{stats['game_control']['total']}"
        f" · READ {stats['read']['covered']}/{stats['read']['total']}"
        f" · WRITE {stats['write']['covered']}/{stats['write']['total']}",
        "",
        "## 读/控制工具 → 端点",
        "",
        "| 工具 | 分发 | 端点 | 备注 |",
        "|---|---|---|---|",
    ]
    for tool in data["read_tools"]:
        for i, d in enumerate(tool["dispatch"]):
            dispatch = d["value"] if d["value"] else "—"
            lines.append(
                f"| {tool['name'] if i == 0 else ''} | {dispatch} "
                f"| {' + '.join(d['calls'])} | {tool['notes'] if i == 0 else ''} |",
            )

    lines += [
        "",
        "## 写工具 → 端点(提案型,经 RLE executor 执行;名字与 WRITE_CATALOG 同名 join)",
        "",
        "| 工具 | 端点 | catalog 描述 |",
        "|---|---|---|",
    ]
    for tool in data["write_tools"]:
        lines.append(
            f"| {tool['name']} | {tool['method']} {tool['path']} | {tool['description']} |",
        )

    for section, title in (
        ("game_control", "GAME_CONTROL"),
        ("read", "READ"),
        ("write", "WRITE"),
    ):
        uncovered = data["uncovered"][section]
        lines += ["", f"## 未覆盖端点 · {title}({len(uncovered)} 个)", ""]
        if not uncovered:
            lines.append("全部已覆盖。")
            continue
        lines += ["| 端点键 | METHOD path | 描述 |", "|---|---|---|"]
        for entry in uncovered:
            lines.append(
                f"| {entry['key']} | {entry['method']} {entry['path']} "
                f"| {entry['description']} |",
            )

    drift = data["client_catalog_drift"]
    lines += [
        "",
        "## client.py 实际 path ↔ catalog 声明(信息提示,不阻断生成)",
        "",
        f"- 客户端字面调用、catalog 未声明:{len(drift['client_only'])} 条:"
        + (", ".join(drift["client_only"]) if drift["client_only"] else "无"),
        f"- catalog 声明、client.py 无字面调用:{len(drift['no_client_literal'])} 条"
        "(可能经 client.call 透传或未实现,详见 api-map.json)",
        "",
        "## 边界说明",
        "",
        "- 分母是 api_catalog 条目数,非上游 RIMAPI 全量 166 端点;catalog 之外不在视野。",
        "- 写侧执行真源在 RLE executor,此处为名字级对齐。",
        "",
    ]
    return "\n".join(lines)


def build_documents() -> dict[str, str]:
    """生成两份产物文本(不落盘);测试用于新鲜度对拍。"""
    data = _collect()
    payload = {"_header": HEADER, "regen": REGEN_HINT, **data}
    return {
        "API-MAP.md": _render_markdown(data),
        "api-map.json": json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    }


def main() -> None:
    for rel, text in build_documents().items():
        path = _LAB_ROOT / rel
        path.write_text(text, encoding="utf-8")
        print(f"written: {path}")


if __name__ == "__main__":
    main()
