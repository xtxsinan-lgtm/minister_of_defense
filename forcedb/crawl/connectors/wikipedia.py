"""Wikipedia “List of active … aircraft” 类页面 → 库存观测。

只用于交叉验证与发现新增条目（可靠度低）：
  * 名称能唯一匹配到库内装备（整名 / 首词 / 前两词的规范化形式）→ inventory 观测（confidence=estimated）
  * 否则 → staging（人工/规则确认后再入库），绝不自动新建装备。
"""
from __future__ import annotations

import html.parser
import re
from typing import Any, Dict, Iterable, List, Optional

from ..base import Connector, Context, Observation

REST = "https://en.wikipedia.org/api/rest_v1/page/html/{title}"

PROFILES = [
    {
        "id": "us_aircraft",
        "page": "List_of_active_United_States_military_aircraft",
        "country": "USA",
        "service_by_heading": {"Air Force": "airforce", "Army": "army", "Navy": "navy", "Marine": "marines",
                               "Coast Guard": "coast_guard", "Space Force": "space"},
        "qty_columns": ["Inventory", "In service"],
        "name_column": "Type|Aircraft",
    },
]


class _Tables(html.parser.HTMLParser):
    """极简 HTML 表格提取：记录每个 table 之前最近的 h2/h3 标题。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: List[dict] = []
        self.heading = ""
        self._h: Optional[List[str]] = None
        self._t: Optional[dict] = None
        self._row: Optional[List[str]] = None
        self._cell: Optional[List[str]] = None
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("h2", "h3"):
            self._h = []
        elif tag == "table":
            self._t = {"heading": self.heading, "rows": []}
            self.tables.append(self._t)
        elif tag == "tr" and self._t is not None:
            self._row = []
            self._t["rows"].append(self._row)
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag in ("sup", "style") and self._cell is not None:
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("h2", "h3") and self._h is not None:
            self.heading = " ".join("".join(self._h).split())
            self._h = None
        elif tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag in ("sup", "style") and self._skip:
            self._skip -= 1
        elif tag == "table":
            self._t = None

    def handle_data(self, data):
        if self._h is not None:
            self._h.append(data)
        if self._cell is not None and not self._skip:
            self._cell.append(data)


def norm(s: str) -> str:
    s = re.sub(r"\[[^\]]*\]", "", s)
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def match_equipment(name: str, index: Dict[str, str]) -> Optional[str]:
    """整名 → 首词 → 前两词；要求精确命中规范化索引。"""
    name = re.sub(r"\[[^\]]*\]", "", name).strip()
    words = name.split()
    for cand in (name, " ".join(words[:1]), " ".join(words[:2])):
        k = norm(cand)
        if k and k in index:
            return index[k]
    return None


def parse_qty(cell: str) -> Optional[float]:
    cell = re.sub(r"\[[^\]]*\]", "", cell)
    m = re.search(r"\d[\d,]*", cell)
    return float(m.group(0).replace(",", "")) if m else None


class WikipediaInventory(Connector):
    description = "Wikipedia 现役装备清单（表格）→ 库存（低可靠度，仅交叉验证）"
    source_id = "wikipedia_lists"

    def __init__(self, profile: dict):
        self.profile = profile
        self.name = f"wikipedia:{profile['id']}"

    def fetch(self, http) -> str:
        return http.get_text(REST.format(title=self.profile["page"]))

    def parse(self, raw: str, ctx: Context) -> Iterable[Observation]:
        p = self.profile
        tp = _Tables()
        tp.feed(raw)
        qty_cols = p["qty_columns"]
        name_cols = p["name_column"].split("|")
        for t in tp.tables:
            rows = [r for r in t["rows"] if r]
            if not rows:
                continue
            header = rows[0]
            qi = next((i for i, h in enumerate(header) if h in qty_cols), None)
            ni = next((i for i, h in enumerate(header) if h in name_cols), None)
            if qi is None or ni is None:
                continue
            svc = next((v for k, v in p["service_by_heading"].items() if k.lower() in t["heading"].lower()), None)
            if svc is None:
                continue
            for r in rows[1:]:
                if len(r) <= max(qi, ni):
                    continue
                name, qty = r[ni], parse_qty(r[qi])
                if not name or qty is None:
                    continue
                eid = match_equipment(name, ctx.equipment_index)
                base = {"country": p["country"], "service": svc, "quantity": qty, "as_of": ctx.today,
                        "notes": f"Wikipedia/{p['page']}（{t['heading']}）：{name}"}
                if eid:
                    yield Observation("inventory", dict(base, equipment_id=eid, kind="active", role="all",
                                                        confidence="estimated"))
                else:
                    yield Observation("staging", dict(base, name=name, page=p["page"]), key=f"{p['country']}|{svc}|{norm(name)}")
