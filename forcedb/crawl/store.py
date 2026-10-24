"""观测的落地：库 + 带日期的观测文件（进版本管理，build 时回放）。"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from ..db import DATA

OBS_DIR = DATA / "forcedb" / "observations"
INV_COLS = ["country", "service", "equipment_id", "kind", "role", "quantity", "as_of", "source_id", "confidence",
            "notes", "observed_at", "connector"]
IND_COLS = ["country", "indicator", "year", "value", "unit", "source_id", "observed_at", "connector"]
STG_COLS = ["connector", "key", "observed_at", "payload_json"]


def _append(path: Path, cols: List[str], rows: List[dict]):
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with open(path, "a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        if new:
            w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def apply_observations(eq, observations: Iterable, *, connector: str, source_id: str, observed_at: str,
                       apply: bool, obs_dir: Optional[Path] = None) -> Dict[str, int]:
    """返回 {'new':…, 'changed':…, 'unchanged':…, 'staged':…, 'rejected':…}。

    * inventory：与库里“最新一条（同国家/军种/装备/口径/role）”比较；数量变了或更晚的 as_of → 追加一行（保留历史）。
    * indicator：同 (国家,指标,年,来源) 已有则比较，值变了更新。
    """
    obs_dir = obs_dir or OBS_DIR
    stats = {"new": 0, "changed": 0, "unchanged": 0, "staged": 0, "rejected": 0}
    inv_rows, ind_rows, stg_rows = [], [], []
    countries = {r[0] for r in eq.execute("SELECT iso3 FROM country")}
    ids = {r[0] for r in eq.execute("SELECT id FROM equipment")}
    for o in observations:
        d = o.data
        if o.kind == "inventory":
            if d["country"] not in countries or d["equipment_id"] not in ids:
                stats["rejected"] += 1
                continue
            # 与“同一来源”自己的最新观测比较（多来源之间的取舍由 v_inventory_latest / crosscheck 负责）
            cur = eq.execute(
                "SELECT quantity, as_of FROM inventory WHERE country=? AND service=? AND equipment_id=? "
                "AND kind=? AND role=? AND source_id=? ORDER BY as_of DESC, id DESC LIMIT 1",
                (d["country"], d["service"], d["equipment_id"], d.get("kind", "active"), d.get("role", "all"),
                 source_id)).fetchone()
            if cur is None:
                stats["new"] += 1
            elif abs(cur["quantity"] - float(d["quantity"])) > 1e-9:
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1
                continue
            row = dict(d, source_id=source_id, observed_at=observed_at, connector=connector)
            row.setdefault("kind", "active")
            row.setdefault("role", "all")
            inv_rows.append(row)
        elif o.kind == "indicator":
            if d["country"] not in countries:
                stats["rejected"] += 1
                continue
            cur = eq.execute("SELECT value FROM country_indicator WHERE country=? AND indicator=? AND year=? "
                             "AND source_id=?", (d["country"], d["indicator"], d["year"], source_id)).fetchone()
            if cur is None:
                stats["new"] += 1
            elif abs(cur["value"] - float(d["value"])) > 1e-6 * max(1.0, abs(cur["value"])):
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1
                continue
            ind_rows.append(dict(d, source_id=source_id, observed_at=observed_at, connector=connector))
        elif o.kind == "staging":
            stats["staged"] += 1
            stg_rows.append({"connector": connector, "key": o.key, "observed_at": observed_at,
                             "payload_json": json.dumps(d, ensure_ascii=False, sort_keys=True)})
    if apply:
        write_inventory(eq, inv_rows)
        write_indicators(eq, ind_rows)
        write_staging(eq, stg_rows)
        _append(obs_dir / "inventory.csv", INV_COLS, inv_rows)
        _append(obs_dir / "indicators.csv", IND_COLS, ind_rows)
        _append(obs_dir / "staging.csv", STG_COLS, stg_rows)
        eq.commit()
    return stats


def write_inventory(eq, rows: List[dict]):
    for r in rows:
        eq.execute(
            "INSERT OR REPLACE INTO inventory (country,service,equipment_id,kind,role,quantity,as_of,source_id,confidence,notes)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (r["country"], r["service"], r["equipment_id"], r.get("kind", "active"), r.get("role", "all"),
             float(r["quantity"]), r["as_of"], r["source_id"], r.get("confidence") or None, r.get("notes") or None))


def write_indicators(eq, rows: List[dict]):
    for r in rows:
        eq.execute("INSERT OR REPLACE INTO country_indicator VALUES (?,?,?,?,?,?,?)",
                   (r["country"], r["indicator"], int(r["year"]), float(r["value"]), r.get("unit"), r["source_id"],
                    r.get("observed_at")))


def write_staging(eq, rows: List[dict]):
    for r in rows:
        eq.execute("INSERT OR IGNORE INTO crawl_staging (connector,key,payload_json,observed_at) VALUES (?,?,?,?)",
                   (r["connector"], r["key"], r["payload_json"], r["observed_at"]))


def replay(eq, obs_dir: Optional[Path] = None) -> Tuple[int, int, int]:
    """build 时回放观测文件（按文件内顺序，同键后者覆盖前者）。"""
    obs_dir = obs_dir or OBS_DIR
    n_inv = n_ind = n_stg = 0
    p = obs_dir / "inventory.csv"
    if p.exists():
        with open(p, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        ids = {r[0] for r in eq.execute("SELECT id FROM equipment")}
        rows = [r for r in rows if r["equipment_id"] in ids]
        write_inventory(eq, rows)
        n_inv = len(rows)
    p = obs_dir / "indicators.csv"
    if p.exists():
        with open(p, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        write_indicators(eq, rows)
        n_ind = len(rows)
    p = obs_dir / "staging.csv"
    if p.exists():
        with open(p, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        write_staging(eq, rows)
        n_stg = len(rows)
    return n_inv, n_ind, n_stg
