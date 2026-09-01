"""Make the tool-protocol module root and the vendored rimapi package importable."""

import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parents[2])
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# rimworld_lab/ — read_catalog 的测试用 rimapi.schemas 构造真实模型实例。
_LAB_ROOT = str(Path(__file__).resolve().parents[3])
if _LAB_ROOT not in sys.path:
    sys.path.insert(0, _LAB_ROOT)
