from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List


@dataclass
class Observation:
    """连接器输出的归一化单位。

    kind = inventory：data 含 country, service, equipment_id, kind(active/...), role, quantity, as_of, confidence, notes
    kind = indicator：data 含 country, indicator, year, value, unit
    kind = staging  ：data 任意（无法匹配到库内装备，或需要人工确认）；key 用于去重
    """
    kind: str
    data: Dict[str, Any]
    key: str = ""


@dataclass
class Context:
    """连接器可用的只读上下文：库里已有的国家、装备名索引。"""
    countries: set = field(default_factory=set)
    equipment_index: Dict[str, str] = field(default_factory=dict)   # 规范化名称 → equipment_id
    today: str = ""


class Connector:
    name: str = ""
    description: str = ""
    source_id: str = ""

    def fetch(self, http) -> Any:        # pragma: no cover - 接口
        raise NotImplementedError

    def parse(self, raw: Any, ctx: Context) -> Iterable[Observation]:   # pragma: no cover
        raise NotImplementedError
