"""多国对比报告：低/中/高三档区间 + 分项 + 每国要点。"""
from __future__ import annotations

from typing import Dict, List

from .engine import Engine

DOMAINS = [("ground", "地面"), ("projection", "投送"), ("air", "空中"), ("sea", "海上"), ("aerospace", "空天")]


def world_table(eq, toe, countries: List[str], ref: str = "USA", **kw) -> Dict[str, dict]:
    """返回 {iso: {mid:{...}, low:total, high:total, ratio:{mid,low,high}}}。基准国始终取 mid。"""
    out: Dict[str, dict] = {}
    runs = {}
    for sc in ("mid", "low", "high"):
        e = Engine(eq, toe, scenario=sc, reference=ref, **kw)
        runs[sc] = e.run([ref] + [c for c in countries if c != ref])
    for c in countries:
        mid = runs["mid"][c]
        out[c] = {
            "mid": dict({k: mid[k] for k, _ in DOMAINS}, total=mid["total"]),
            "low": runs["low"][c]["total"], "high": runs["high"][c]["total"],
            "ratio": {s: runs[s][c]["total"] / runs["mid"][ref]["total"] for s in ("mid", "low", "high")},
            "components": mid["components"],
        }
    return out


def country_notes(toe, iso: str) -> Dict[str, str]:
    return {r["path"].split(".", 1)[1]: r["text"] for r in toe.execute(
        "SELECT path, text FROM orbat_entry WHERE country=? AND path LIKE 'estimate.%'", (iso,))}
