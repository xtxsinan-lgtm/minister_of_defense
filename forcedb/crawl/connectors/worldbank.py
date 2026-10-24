"""世界银行 WDI：军费、军费占 GDP、占政府支出比、武装力量人数 —— 覆盖全球国家，按年。

这是“全球国家军力评估”的宏观底座：军费可用来做预算折算，兵力用来做地面力量的粗标定。
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List

from ..base import Connector, Context, Observation

API = "https://api.worldbank.org/v2/country/all/indicator/{code}"
INDICATORS = {
    "MS.MIL.XPND.CD": ("military_expenditure_usd", "USD"),
    "MS.MIL.XPND.GD.ZS": ("military_expenditure_pct_gdp", "%"),
    "MS.MIL.XPND.ZS": ("military_expenditure_pct_govt", "%"),
    "MS.MIL.TOTL.P1": ("armed_forces_personnel", "persons"),
}


class WorldBankMilitary(Connector):
    name = "worldbank"
    description = "World Bank WDI：军费 / 军费占 GDP / 武装力量人数（全球，逐年）"
    source_id = "worldbank_wdi"

    def __init__(self, year_from: int = 2015, year_to: int = 2025, indicators=None):
        self.y0, self.y1 = year_from, year_to
        self.codes = list(indicators) if indicators else list(INDICATORS)

    def fetch(self, http) -> Dict[str, List[dict]]:
        out: Dict[str, List[dict]] = {}
        for code in self.codes:
            rows: List[dict] = []
            page = 1
            while True:
                data = http.get_json(API.format(code=code),
                                     {"format": "json", "per_page": 20000, "date": f"{self.y0}:{self.y1}", "page": page})
                if not isinstance(data, list) or len(data) < 2 or data[1] is None:
                    break
                rows += data[1]
                if page >= int(data[0].get("pages", 1)):
                    break
                page += 1
            out[code] = rows
        return out

    def parse(self, raw: Dict[str, List[dict]], ctx: Context) -> Iterable[Observation]:
        for code, rows in raw.items():
            ind, unit = INDICATORS[code]
            for r in rows:
                iso, v = r.get("countryiso3code"), r.get("value")
                if v is None or iso not in ctx.countries:    # 过滤区域聚合（WLD、EUU…）与库外国家
                    continue
                yield Observation("indicator", {"country": iso, "indicator": ind, "year": int(r["date"]),
                                                "value": float(v), "unit": unit})
