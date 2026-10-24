"""国别估算数据（data/forcedb/countries/*.yaml）→ 两个库。

核心思想“类比物化”：新装备不写原始技术参数，而是指定库内一个已有装备作类比（analog + scale），
把它在文章/表格里的单位战力（article.* 键）按 scale 缩放后写成新装备的快照；这样引擎无需区分“作者算的”和“估算的”，
同时 estimate.* 键记录类比关系，所有估算都可以逐条审阅、替换。
数量约定：物化后的 article.qty* 恒为 1，article.*_total 即“每件”的值，所以单位战力 = total/qty 不随各国数量变化。
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from ..db import DATA
from .common import jdump, load_yaml

COUNTRIES = DATA / "forcedb" / "countries"
SOURCE_ID = "research_2026"

# 不缩放的 article.* 键（时间类或比例类）
NO_SCALE = {"article.rtt_total_h"}
# 各类别“每件总量”所用的 total 键与 qty 键（用于 unit: 显式给值）
UNIT_KEYS = {
    "fighter": [("article.air_total", "article.qty.air_superiority", "air"),
                ("article.ground_total", "article.qty.ground_attack", "ground")],
    "bomber": [("article.ground_total", "article.qty.ground_attack", "ground")],
}
GENERIC_TOTAL = {
    "awacs": "article.power_total", "tanker_aircraft": "article.power_total", "large_uav": "article.power_total",
    "ew_aircraft": "article.power_total", "asw_aircraft": "article.power_total",
    "destroyer": "article.power_total", "cruiser": "article.power_total", "frigate": "article.power_total",
    "corvette": "article.power_total", "coastal_missile_battery": "article.power_total",
    "naval_sam": "article.power_total", "ssn": "article.power_total", "ssk": "article.power_total",
    "ssg_n": "article.power_total", "ssbn": "article.power_total",
    "aircraft_carrier": "article.power_vls", "amphibious_carrier": "article.power_vls",
    "transport_aircraft": "article.throughput_24h_t", "amphibious_dock": "article.throughput_24h_t",
    "logistics_ship": "article.throughput_24h_t",
}
DEFAULT_ROLE = {"army": "field", "navy": "shipborne", "marines": "marines", "airforce": "airborne_corps"}
HELI_CATS = {"attack_helicopter", "light_attack_helicopter", "utility_helicopter", "transport_helicopter",
             "heavy_helicopter", "tiltrotor", "ew_helicopter"}
ARTILLERY_CATS = {"howitzer_heavy_towed", "howitzer_heavy_sp", "howitzer_heavy_truck", "mrl_long_range"}
AD_CATS = {"sam_long", "sam_medium", "sam_short", "spaag"}
MISSILE_CATS = {"srbm", "mrbm", "irbm", "icbm", "cruise_missile_land"}


def _specs(eq, eid) -> Dict[str, object]:
    return {r["key"]: (r["num"] if r["num"] is not None else r["text"])
            for r in eq.execute("SELECT key, num, text FROM spec WHERE equipment_id=?", (eid,))}


def _put(eq, eid, key, val, source=SOURCE_ID, conf="estimated"):
    num = float(val) if isinstance(val, (int, float)) and not isinstance(val, bool) else None
    eq.execute("INSERT OR REPLACE INTO spec (equipment_id,key,num,text,unit,confidence,source_id) VALUES (?,?,?,?,?,?,?)",
               (eid, key, num, None if num is not None else str(val), None, conf, source))


def materialize_from_analog(eq, new_id: str, analog_id: str, scale: float):
    """把 analog 的 article.* 单位战力按 scale 缩放成 new_id 的快照（数量基准恒为 1）。"""
    a = _specs(eq, analog_id)
    if not any(k.startswith("article.") for k in a):
        raise ValueError(f"类比装备 {analog_id} 没有 article.* 快照，不能作类比")
    pairs = {}                          # total 键 → 对应的 qty 键
    for k in a:
        if k.endswith("_total") or k in ("article.power_vls", "article.total_power", "article.throughput_24h_t"):
            q = ("article.qty.air_superiority" if k == "article.air_total" else
                 "article.qty.ground_attack" if k == "article.ground_total" else
                 "article.qty.article_equivalent" if k == "article.total_power" else "article.qty")
            pairs[k] = q
    for k, v in a.items():
        if not k.startswith("article.") or not isinstance(v, float):
            if k in ("function", "vehicles_per_unit", "payload_factor") or k.startswith("airwing."):
                pass
            else:
                continue
        if k.startswith("article.qty"):
            _put(eq, new_id, k, 1.0)
        elif k in pairs:
            q = a.get(pairs[k])
            unit = v / q if q else v
            _put(eq, new_id, k, unit * scale)
        elif k.startswith("article.") and k not in NO_SCALE:
            _put(eq, new_id, k, v * scale)
        elif k.startswith("airwing.composite") or k.startswith("airwing.total"):
            _put(eq, new_id, k, v * scale)
        elif k in ("function", "vehicles_per_unit", "payload_factor"):
            _put(eq, new_id, k, v)
    # 有些类别的 qty 键在 analog 上缺（例如只写了 total）：补 1
    for k, q in pairs.items():
        if q not in a:
            _put(eq, new_id, q, 1.0)


SUB_CATS = {"ssn", "ssk", "ssg_n", "ssbn"}


def _sub_to_vls() -> float:
    return float(load_yaml(DATA / "forcedb" / "models" / "article_2025_08.yaml")["sea"]["submarine_to_vls"])


def _set_unit(eq, eid, category, unit: dict):
    if category in SUB_CATS and "vls" in unit:
        # 潜艇单位值是“折算前”的每艇战力，引擎再乘 submarine_to_vls；这里允许直接给折算后的 VLS
        unit = {"value": float(unit["vls"]) / _sub_to_vls()}
    if category in UNIT_KEYS:
        for tkey, qkey, nm in UNIT_KEYS[category]:
            if nm in unit:
                _put(eq, eid, tkey, unit[nm])
                _put(eq, eid, qkey, 1.0)
    else:
        tkey = GENERIC_TOTAL.get(category)
        if tkey is None or "value" not in unit:
            raise ValueError(f"{eid}（{category}）的 unit 需要 value，且该类别需在 GENERIC_TOTAL 中登记")
        _put(eq, eid, tkey, unit["value"])
        _put(eq, eid, "article.qty", 1.0)


def add_equipment(eq, e: dict, country: str, as_of: str):
    cat = eq.execute("SELECT domain FROM category WHERE id=?", (e["category"],)).fetchone()
    if cat is None:
        raise ValueError(f"装备 {e['id']} 类别不存在：{e['category']}")
    exists = eq.execute("SELECT category FROM equipment WHERE id=?", (e["id"],)).fetchone()
    if exists:
        # 仓库既有型号（如 nk_models 里的 su30sm）没有量化快照时，允许在这里补上；已有 article.* 则视为重复定义
        has_snap = eq.execute("SELECT 1 FROM spec WHERE equipment_id=? AND key LIKE 'article.%' LIMIT 1", (e["id"],)).fetchone()
        if has_snap or exists["category"] != e["category"]:
            raise ValueError(f"装备 id 已存在且{'已有量化快照' if has_snap else '类别不同'}：{e['id']}")
        if e.get("analog"):
            materialize_from_analog(eq, e["id"], e["analog"]["of"], float(e["analog"].get("scale", 1.0)))
        else:
            _set_unit(eq, e["id"], e["category"], e["unit"])
        _put(eq, e["id"], "estimate.unit_source", e.get("unit_source", "explicit"))
        return
    origin = e.get("origin", country)
    notes = e.get("notes")
    an = e.get("analog")
    if an:
        notes = (notes + "；" if notes else "") + f"类比 {an['of']} ×{an.get('scale', 1.0)}：{an.get('why', '')}"
    eq.execute(
        "INSERT INTO equipment (id,name_zh,name_en,category,domain,family,origin,status,intro_year,crew,confidence,"
        "source_id,notes,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (e["id"], e["name"], e.get("name_en"), e["category"], cat["domain"], e.get("family"), origin,
         e.get("status"), e.get("service_year"), None, "estimated", SOURCE_ID, notes, jdump(e)))
    if an:
        materialize_from_analog(eq, e["id"], an["of"], float(an.get("scale", 1.0)))
        _put(eq, e["id"], "estimate.analog_of", an["of"])
        _put(eq, e["id"], "estimate.analog_scale", float(an.get("scale", 1.0)))
    elif "unit" in e:
        _set_unit(eq, e["id"], e["category"], e["unit"])
        _put(eq, e["id"], "estimate.unit_source", e.get("unit_source", "explicit"))
    else:
        raise ValueError(f"装备 {e['id']} 需要 analog 或 unit")
    for k, v in (e.get("specs") or {}).items():
        _put(eq, e["id"], k, v, conf="estimated")


def add_inventory(eq, inv: dict, country: str, as_of: str, default_src: str):
    eid = inv["eq"]
    row = eq.execute("SELECT category FROM equipment WHERE id=?", (eid,)).fetchone()
    if row is None:
        raise ValueError(f"[{country}] 库存引用了不存在的装备：{eid}")
    cat = row["category"]
    svc = inv["service"]
    conf = inv.get("confidence", "estimated")
    src = inv.get("src", default_src)
    note = inv.get("note")
    if cat in ("fighter", "bomber"):
        roles = inv.get("roles") or (["ground_attack"] if cat == "bomber" else ["air_superiority", "ground_attack"])
        qtys = {"air_superiority": inv["qty"], "ground_attack": inv.get("ground_qty", inv["qty"])}
        rows = [(r, qtys[r], "active") for r in roles]
    elif cat in ARTILLERY_CATS:
        rows = [("article_equivalent", inv["qty"], "in_toe")]
    elif cat in HELI_CATS:
        rows = [(inv.get("role", DEFAULT_ROLE.get(svc, "field")), inv["qty"], "active")]
    else:
        rows = [("all", inv["qty"], "active")]
    for role, q, kind in rows:
        eq.execute(
            "INSERT OR REPLACE INTO inventory (country,service,equipment_id,kind,role,quantity,as_of,source_id,confidence,notes)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)", (country, svc, eid, kind, role, float(q), as_of, src, conf, note))


IBCT_S = 316.5          # 美军 IBCT 的“总战力（满编班）”= 旅级战力规模!O4，所有 base_fire_scale 的分母
RESERVE_SQUAD_RATE = 0.0064   # 下车步兵班 / 陆军总人数（美军：约 4800 班 / 约 75 万现役+国民警卫队）


def force_unit_power(force: dict, quality: dict) -> float:
    """按装备组成估算一支部队的战力（算法同文章“规模”“乘数”表）：
    ( 重装备折算满编班 + 下车步兵班 ) / IBCT 总战力 × ( 装备×机械化×信息化×后勤×准备度 )。
    force 键：tank3 veh3 veh2 mortar atgm_vehicle aa35 aa25 …（见 formulas.heavy_equipment_equivalents），squads。
    """
    from ..quant import formulas as F
    heavy = F.heavy_equipment_equivalents({k: v for k, v in force.items() if k != "squads"})
    scale = (heavy + float(force.get("squads", 0))) / IBCT_S
    q = quality
    return scale * q["equip"] * q["mech"] * q["info"] * q.get("log", 1.0) * q.get("ready", 1.0)


def add_brigades(toe, eq, country: str, rows: List[dict], as_of: str):
    for b in rows:
        if "force" in b:           # 由装备组成估算（count 通常为 1：整支部队作为一个“单位”）
            unit = force_unit_power(b["force"], b["quality"])
            toe.execute(
                "INSERT INTO brigade_class (id,country,label,service,template_id,count,snapshot_power,snapshot_total,"
                "source_id,as_of,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (b["id"], country, b["label"], b.get("service", "army"), None, float(b.get("count", 1)), unit,
                 unit * float(b.get("count", 1)), SOURCE_ID, as_of,
                 f"按装备组成估算：{jdump(b['force'])}；质量乘数 {jdump(b['quality'])}；{b.get('why', '')}"))
            continue
        a = toe.execute("SELECT * FROM brigade_class WHERE id=?", (b["analog"],)).fetchone()
        if a is None or not a["count"]:
            raise ValueError(f"[{country}] 旅级类比不存在：{b['analog']}")
        unit = a["snapshot_total"] / a["count"] * float(b.get("scale", 1.0))
        toe.execute(
            "INSERT INTO brigade_class (id,country,label,service,template_id,count,snapshot_power,snapshot_total,source_id,as_of,notes)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (b["id"], country, b["label"], b.get("service", "army"), b.get("template"), float(b["count"]), unit,
             unit * float(b["count"]), SOURCE_ID, as_of,
             f"类比 {b['analog']} ×{b.get('scale', 1.0)}：{b.get('why', '')}"))


def ingest_world(eq, toe) -> Dict[str, int]:
    files = []
    shared = COUNTRIES / "_shared.yaml"
    if shared.exists():
        files.append(shared)
    files += sorted(p for p in COUNTRIES.glob("*.yaml") if p.name != "_shared.yaml")
    files += sorted((COUNTRIES / "generated").glob("*.yaml"))
    n = {"equipment": 0, "inventory": 0, "brigades": 0, "countries": 0}
    derive_carrier_snapshots(eq)        # 先给库里已有的外国航母派生快照，方便其他装备拿它们作类比
    for path in files:
        d = load_yaml(path)
        country = d.get("country")
        as_of = d.get("as_of", "2025-08-31")
        shared_file = path.name == "_shared.yaml"
        if not shared_file and eq.execute("SELECT 1 FROM country WHERE iso3=?", (country,)).fetchone() is None:
            raise ValueError(f"{path.name}: 国家不在 countries.csv：{country}")
        for e in d.get("equipment", []):
            add_equipment(eq, e, country or e.get("origin"), as_of)
            n["equipment"] += 1
        for a in d.get("annotations", []):
            if eq.execute("SELECT 1 FROM equipment WHERE id=?", (a["eq"],)).fetchone() is None:
                raise ValueError(f"[{country}] annotations 引用了不存在的装备：{a['eq']}")
            for k, v in a["specs"].items():
                _put(eq, a["eq"], k, v, source=a.get("src", d.get("default_source", SOURCE_ID)))
        default_src = d.get("default_source", SOURCE_ID)
        for inv in d.get("inventory", []):
            add_inventory(eq, inv, country, as_of, default_src)
            n["inventory"] += 1
        if "brigades" in d:
            add_brigades(toe, eq, country, d["brigades"], as_of)
            n["brigades"] += len(d["brigades"])
        for svc, v in (d.get("special_forces") or {}).items():
            toe.execute("INSERT INTO orbat_entry (country,path,num,as_of,source_id,confidence,notes) VALUES (?,?,?,?,?,?,?)",
                        (country, f"special_forces.{svc}", float(v), as_of, SOURCE_ID, "estimated",
                         (d.get("special_forces_note") or None)))
        for k, v in (d.get("meta") or {}).items():
            toe.execute("INSERT INTO orbat_entry (country,path,text,as_of,source_id,confidence) VALUES (?,?,?,?,?,?)",
                        (country, f"estimate.{k}", str(v), as_of, SOURCE_ID, "estimated"))
        if not shared_file:
            n["countries"] += 1
    derive_carrier_snapshots(eq)
    return n


def derive_carrier_snapshots(eq):
    """没有文章快照的航母/准航母：以尼米兹为锚（每艘 VLS ÷ 其复合指标）用空中联队复合指标派生 article.power_vls。"""
    pre = load_yaml(DATA / "forcedb" / "models" / "article_2025_08.yaml")["sea"]["carrier_airwing"]
    a = _specs(eq, pre["anchor_equipment"])
    anchor = a["article.power_vls"] / a["article.qty"] / a["airwing." + pre["metric"]]
    for r in eq.execute("SELECT equipment_id FROM spec WHERE key=?", ("airwing." + pre["metric"],)).fetchall():
        eid = r["equipment_id"]
        sp = _specs(eq, eid)
        if "article.power_vls" in sp:
            continue
        _put(eq, eid, "article.power_vls", sp["airwing." + pre["metric"]] * anchor)
        _put(eq, eid, "article.qty", 1.0)
        _put(eq, eid, "estimate.derived_from", "airwing." + pre["metric"] + "×锚点(尼米兹)")
