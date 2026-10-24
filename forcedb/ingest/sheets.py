"""导入 data/forcedb/ 下由 tools/import_sheets.py 生成的装备 YAML 与库存 CSV。"""
from __future__ import annotations

import csv

from ..db import DATA
from .common import load_yaml
from .yaml_repo import _insert_model

FORCEDB = DATA / "forcedb"


def ingest_extra_equipment(con) -> int:
    n = 0
    for path in sorted((FORCEDB / "equipment").glob("*.yaml")):
        for m in load_yaml(path).get("models", []):
            m.setdefault("confidence", None)
            n += _insert_model(con, m, "forcedb/" + path.name)
            con.execute("UPDATE equipment SET source_id='sheet_cn_us' WHERE id=?", (m["id"],))
            con.execute("UPDATE spec SET source_id='sheet_cn_us' WHERE equipment_id=?", (m["id"],))
    return n


def ingest_inventory(con, path=None) -> int:
    path = path or FORCEDB / "inventory_cn_us.csv"
    n = 0
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            con.execute(
                "INSERT INTO inventory (country,service,equipment_id,kind,role,quantity,as_of,source_id,confidence,notes)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (r["country"], r["service"], r["equipment_id"], r["kind"], r["role"], float(r["quantity"]),
                 r["as_of"], r["source_id"], r["confidence"] or None, r["notes"] or None))
            n += 1
    return n


def ingest_spec_annotations(con) -> int:
    """给既有装备追加规格键（直升机战力系数等）。"""
    path = FORCEDB / "spec_annotations.yaml"
    if not path.exists():
        return 0
    n = 0
    for a in load_yaml(path)["annotations"]:
        for k, v in a["specs"].items():
            con.execute("INSERT OR REPLACE INTO spec (equipment_id,key,num,text,unit,confidence,source_id) VALUES (?,?,?,?,?,?,?)",
                        (a["equipment_id"], k, float(v) if isinstance(v, (int, float)) else None,
                         None if isinstance(v, (int, float)) else str(v), None, "stated", "sheet_cn_us"))
            n += 1
    return n


def ingest_brigade_classes(toe, as_of="2025-08-31") -> int:
    path = FORCEDB / "toe" / "brigade_classes.csv"
    n = 0
    f_ = lambda x: float(x) if x not in ("", None) else None
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            toe.execute(
                "INSERT INTO brigade_class (id,country,label,service,count,base_fire_scale,equip_mult,mech_mult,info_mult,"
                "logistics_mult,readiness_mult,apply_logistics,snapshot_power,snapshot_total,source_id,as_of)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (r["id"], r["country"], r["label"], r["service"], f_(r["count"]), f_(r["base_fire_scale"]),
                 f_(r["equip_mult"]), f_(r["mech_mult"]), f_(r["info_mult"]), f_(r["logistics_mult"]),
                 f_(r["readiness_mult"]), int(r["apply_logistics"] or 0), f_(r["snapshot_power"]),
                 f_(r["snapshot_total"]), "sheet_cn_us", as_of))
            n += 1
    return n
