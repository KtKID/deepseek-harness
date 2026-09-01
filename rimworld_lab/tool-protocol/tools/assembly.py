"""Assemble OpenAI tool_calls into RLE ActionPlan instances.

逐条校验、错误收集:坏调用记录为 ToolCallError,不中断其他调用、不抛异常
——错误率本身是实验 A 的对比指标。本模块不做任何"修复":格式错误的参数
就是失败样本,修复会污染 A/B 数据。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Sequence

from pydantic import BaseModel, ValidationError

from rle.agents.actions import ActionPlan

from tools.catalog import TOOL_SPECS, ToolSpec


@dataclass(frozen=True)
class ToolCallError:
    """一次无法装配的工具调用及其原因。"""

    index: int
    tool_name: str | None
    call_id: str | None
    reason: str


@dataclass(frozen=True)
class AssemblyResult:
    """装配产物:可执行计划 + 被拒绝的调用列表。"""

    plan: ActionPlan
    errors: tuple[ToolCallError, ...]


def _normalize(call: Any) -> tuple[str | None, str | None, str]:
    """接受 OpenAI SDK 对象与裸 dict 两种形态,返回 (call_id, name, arguments)。"""
    if isinstance(call, dict):
        function = call.get("function") or {}
        return call.get("id"), function.get("name"), function.get("arguments") or "{}"
    function = getattr(call, "function", None)
    name = getattr(function, "name", None) if function is not None else None
    arguments = getattr(function, "arguments", None) if function is not None else None
    return getattr(call, "id", None), name, arguments or "{}"


def _validate_args(spec: ToolSpec, arguments: str) -> BaseModel:
    parsed = json.loads(arguments)
    if not isinstance(parsed, dict):
        raise _AssemblyFailure(f"arguments 必须是 JSON 对象,得到 {type(parsed).__name__}")
    return spec.args_model.model_validate(parsed)


class _AssemblyFailure(Exception):
    """内部哨兵:把 JSON 解析与校验失败统一成逐条错误路径。"""


def assemble_action_plan(role: str, tick: int, tool_calls: Sequence[Any]) -> AssemblyResult:
    """把一轮工具调用装配为 ActionPlan;顺序即调用顺序。

    零调用返回空计划零错误(no_action 的工具协议形态)。
    """
    from rle.agents.actions import Action

    actions: list[Action] = []
    errors: list[ToolCallError] = []
    for index, call in enumerate(tool_calls):
        call_id, name, arguments = _normalize(call)
        if name is None or name not in TOOL_SPECS:
            errors.append(ToolCallError(index, name, call_id, f"未知工具: {name!r}"))
            continue
        spec = TOOL_SPECS[name]
        try:
            args = _validate_args(spec, arguments)
        except _AssemblyFailure as exc:
            errors.append(ToolCallError(index, name, call_id, str(exc)))
            continue
        except json.JSONDecodeError as exc:
            errors.append(ToolCallError(index, name, call_id, f"arguments 不是合法 JSON: {exc}"))
            continue
        except ValidationError as exc:
            first = exc.errors()[0]
            loc = ".".join(str(part) for part in first["loc"])
            errors.append(ToolCallError(index, name, call_id, f"{loc}: {first['msg']}"))
            continue
        actions.append(spec.to_action(args))
    plan = ActionPlan(role=role, tick=tick, actions=actions)
    return AssemblyResult(plan=plan, errors=tuple(errors))
