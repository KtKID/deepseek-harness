"""Prompts package:工具协议版角色提示词。"""

from prompts.prompts import (
    BOOTSTRAP_PLAYBOOK,
    PHASE_DIRECTIVES,
    PHASE_LABELS,
    ROLE_INFO,
    SHARED_SYSTEM_PREFIX,
    RolePromptInfo,
    build_system_prompt,
    build_user_prompt,
)

__all__ = [
    "BOOTSTRAP_PLAYBOOK",
    "PHASE_DIRECTIVES",
    "PHASE_LABELS",
    "ROLE_INFO",
    "SHARED_SYSTEM_PREFIX",
    "RolePromptInfo",
    "build_system_prompt",
    "build_user_prompt",
]
