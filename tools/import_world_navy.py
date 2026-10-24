#!/usr/bin/env python3
"""从作者工作簿“中美军力对比”的 驱护舰 / 海军 表，生成俄/日/英/法/韩的海军估算 YAML。

用法：python3 tools/import_world_navy.py --xlsx 中美军力对比.xlsx
输出：data/forcedb/countries/generated/<ISO>_navy.yaml（可审阅；手工补充请写在 data/forcedb/countries/<ISO>.yaml）
单位：水面舰艇 = 每艘“总战力”（驱护舰!Z 列，等效 VLS）；潜艇 = 每艇折算后 VLS（海军!T/J）。
"""
import argparse
from pathlib import Path

import openpyxl
import yaml

OUT = Path(__file__).resolve().parent.parent / "data" / "forcedb" / "countries" / "generated"
SHEET_SRC = "sheet_cn_us_live"

SHIP_BLOCKS = {            # 国家 → 驱护舰表的行范围（含端点）
    "RUS": range(42, 64), "JPN": range(65, 75), "GBR": range(76, 78), "FRA": range(96, 102), "KOR": range(108, 118),
}
SUB_ROWS = {               # 国家 → 海军表里潜艇行
    "RUS": range(23, 31), "JPN": range(32, 35), "GBR": [36], "FRA": range(42, 44), "KOR": range(49, 52),
}
CAT = {"destroyer": "destroyer", "frigate": "frigate", "corvette": "corvette", "cruiser": "cruiser"}


def ship_category(fire, power):
    # 按单舰战力粗分类：>=90 大型驱逐/巡洋；>=30 驱逐；>=12 护卫；其余轻护/导弹艇
    return "cruiser" if power >= 90 else "destroyer" if power >= 30 else "frigate" if power >= 12 else "corvette"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    a = ap.parse_args()
    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    ws, hs = wb["驱护舰"], wb["海军"]
    OUT.mkdir(parents=True, exist_ok=True)
    for iso in SHIP_BLOCKS:
        eqs, inv = [], []
        for r in SHIP_BLOCKS[iso]:
            name, n, power = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 26).value
            if name is None or not n or not isinstance(power, (int, float)):
                continue
            eid = f"ship_{iso.lower()}_r{r}"
            eqs.append({"id": eid, "name": str(name), "category": ship_category(ws.cell(r, 17).value, power), "origin": iso,
                        "unit": {"value": round(power, 3)}, "unit_source": f"工作簿 驱护舰!Z{r}（每舰总战力，等效 VLS）",
                        "notes": f"工作簿 驱护舰!A{r}；火力 {round(ws.cell(r, 17).value or 0, 1)} + 雷达折算 VLS"})
            inv.append({"eq": eid, "service": "navy", "qty": int(n), "confidence": "estimated",
                        "note": f"工作簿 驱护舰!B{r}"})
        for r in SUB_ROWS[iso]:
            name, n, tot = hs.cell(r, 9).value, hs.cell(r, 10).value, hs.cell(r, 20).value
            if name is None or not n or not isinstance(tot, (int, float)):
                continue
            eid = f"sub_{iso.lower()}_r{r}"
            eqs.append({"id": eid, "name": str(name) + "（潜艇）", "category": "ssk" if (hs.cell(r, 12).value or 9) < 1.0 else "ssn",
                        "origin": iso, "unit": {"vls": round(tot / n, 3)},
                        "unit_source": f"工作簿 海军!T{r}/J{r}（成本×{n}×折算系数，等效 VLS）",
                        "notes": f"工作簿 海军!I{r}；单艇造价 {hs.cell(r, 12).value} 十亿美元"})
            inv.append({"eq": eid, "service": "navy", "qty": int(n), "confidence": "estimated",
                        "note": f"工作簿 海军!J{r}"})
        doc = {"country": iso, "as_of": "2025-08-31", "default_source": SHEET_SRC, "equipment": eqs, "inventory": inv}
        with open(OUT / f"{iso}_navy.yaml", "w", encoding="utf-8") as f:
            f.write(f"# 由 tools/import_world_navy.py 从作者工作簿生成（{iso} 水面舰艇与潜艇）。\n")
            yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False, width=140)
        print(iso, len(eqs), "类")


if __name__ == "__main__":
    main()
