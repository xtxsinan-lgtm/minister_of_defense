"""把本仓库既有 YAML（data/schema、data/equipment、data/templates、data/orbat）导入两个库。

原则：不改源文件；raw_json 保留完整原始记录；汇总口径与 tools/validate_data.py 完全一致。
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from ..db import DATA
from .common import (country_of_template, flatten_specs, jdump, load_yaml,
                     service_of_template)

SRC = "repo_yaml"
LEVEL_ORDER = ["squad", "platoon", "company", "battalion", "brigade", "division", "corps"]
RANK = {lv: i for i, lv in enumerate(LEVEL_ORDER)}


# ---------------------------------------------------------------- 共享字典
def load_schema():
    cats = load_yaml(DATA / "schema/categories.yaml")["categories"]
    specs = load_yaml(DATA / "schema/specialties.yaml")["specialties"]
    scales = load_yaml(DATA / "schema/rating_scales.yaml")
    return cats, specs, scales


def ingest_rating_levels(con, scales):
    for scale, body in scales.items():
        if not isinstance(body, dict) or "levels" not in body:
            continue
        for i, lvl in enumerate(body["levels"]):
            desc = lvl.get("desc") or lvl.get("name")
            con.execute("INSERT INTO rating_level VALUES (?,?,?,?,?)",
                        (lvl["id"], scale, i, body.get("step_multiplier"), desc))


# ---------------------------------------------------------------- 装备
EXTRA_SPEC_KEYS = ("capacity", "article_power_index")


def ingest_equipment(con) -> int:
    n = 0
    for path in sorted((DATA / "equipment").glob("*.yaml")):
        for m in load_yaml(path).get("models", []):
            n += _insert_model(con, m, path.name)
    return n


def _insert_model(con, m: dict, filename: str) -> int:
    cat = con.execute("SELECT domain FROM category WHERE id=?", (m["category"],)).fetchone()
    if cat is None:
        raise ValueError(f"装备 {m['id']} 的类别不存在于 category：{m['category']}")
    origin = m.get("origin")
    if origin and con.execute("SELECT 1 FROM country WHERE iso3=?", (origin,)).fetchone() is None:
        raise ValueError(f"装备 {m['id']} 的 origin 不在 countries.csv：{origin}")
    con.execute(
        "INSERT INTO equipment (id,name_zh,name_en,category,domain,family,origin,status,intro_year,crew,confidence,source_id,notes,raw_json)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (m["id"], m["name"], m.get("name_en"), m["category"], cat["domain"], m.get("family"), origin,
         m.get("status"), m.get("service_year"), m.get("crew"), m.get("confidence"), SRC, m.get("notes"),
         jdump(dict(m, _file=filename))))
    rows = flatten_specs(m.get("specs") or {})
    for k in EXTRA_SPEC_KEYS:
        if m.get(k) is not None:
            rows += flatten_specs({k: m[k]})
    if isinstance(m.get("munition"), dict):
        rows += flatten_specs(m["munition"], "munition.")
    for k in ("armament", "weapons", "sensors", "munitions", "upgrade_of"):
        if m.get(k) is not None:
            rows.append((k, None, jdump(m[k]) if not isinstance(m[k], str) else m[k], None))
    seen = set()
    for key, num, text, unit in rows:
        if key in seen:
            continue
        seen.add(key)
        con.execute("INSERT INTO spec VALUES (?,?,?,?,?,?,?)",
                    (m["id"], key, num, text, unit, m.get("confidence"), SRC))
    for dim, level in (m.get("ratings") or {}).items():
        con.execute("INSERT INTO rating VALUES (?,?,?)", (m["id"], dim, level))
    return 1


# ---------------------------------------------------------------- 编制
def ingest_specialties(con, specialties):
    for s in specialties:
        con.execute("INSERT INTO specialty VALUES (?,?,?,?)", (s["id"], s.get("name"), s.get("school"), jdump(s)))


def ingest_slot_categories(con, cats):
    for c in cats:
        con.execute("INSERT INTO slot_category VALUES (?,?,?)", (c["id"], c["name"], c.get("group")))


def load_templates() -> dict:
    templates = {}
    for path in sorted((DATA / "templates").glob("*.yaml")):
        for t in load_yaml(path).get("templates", []):
            if t["id"] in templates:
                raise ValueError(f"模板 id 重复：{t['id']}")
            t["_file"] = path.name
            templates[t["id"]] = t
    return templates


def ingest_templates(con, templates: dict) -> int:
    for tid, t in templates.items():
        con.execute(
            "INSERT INTO unit_template (id,name_zh,name_en,country,service,level,role,echelon_label,granularity,variant_of,"
            "expected_personnel,confidence,source_file,notes,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (tid, t.get("name") or tid, t.get("name_en"), country_of_template(tid, t["_file"]),
             service_of_template(tid, t["_file"]), t["level"], t.get("role"), t.get("echelon_label"),
             t.get("granularity"), t.get("variant_of"), t.get("expected_personnel"), t.get("confidence"),
             t["_file"], t.get("notes"), jdump(t)))
    # 二遍：关联表（需要所有模板先存在以满足外键）
    for tid, t in templates.items():
        for sp, n in (t.get("personnel") or {}).items():
            con.execute("INSERT INTO template_personnel VALUES (?,?,?)", (tid, sp, n))
        for cat, n in (t.get("slots") or {}).items():
            con.execute("INSERT INTO template_slot VALUES (?,?,?,1)", (tid, cat, n))
        for cat, n in (t.get("slots_unassigned") or {}).items():
            con.execute("INSERT INTO template_slot VALUES (?,?,?,0)", (tid, cat, n))
        for kind_key, kind in (("children", "child"), ("attached", "attached"), ("subordinate_formations", "subordinate")):
            for i, c in enumerate(t.get(kind_key) or []):
                con.execute("INSERT INTO template_child VALUES (?,?,?,?,?)",
                            (tid, c["template"], c.get("count", 1), kind, i))
        for cat, mid in (t.get("default_bindings") or {}).items():
            con.execute("INSERT INTO template_binding VALUES (?,?,?)", (tid, cat, mid))
        for dim, lvl in (t.get("unit_ratings") or {}).items():
            con.execute("INSERT INTO template_rating VALUES (?,?,?)", (tid, dim, lvl))
        for expr, n in (t.get("expected_equipment") or {}).items():
            con.execute("INSERT INTO template_expected_equipment VALUES (?,?,?)", (tid, str(expr), n))
    return len(templates)


def rollup(con, templates: dict) -> None:
    """递归汇总。口径同 tools/validate_data.py：只沿 children；含聚合单位而不完整时，用 expected_personnel 回填。"""
    cache: dict = {}

    def totals(tid, stack=()):
        if tid in stack:
            raise ValueError("循环引用：" + " → ".join(stack + (tid,)))
        if tid in cache:
            return cache[tid]
        t = templates[tid]
        fallback = False
        if t["level"] == "squad":
            people = sum((t.get("personnel") or {}).values())
            eq = Counter(t.get("slots") or {})
            complete = bool(t.get("personnel")) or t.get("role") == "equipment_pool"
        else:
            people, eq, complete = 0, Counter(), bool(t.get("children"))
            for c in t.get("children") or []:
                p, e, ok, _ = totals(c["template"], stack + (tid,))
                people += p * c["count"]
                for k, v in e.items():
                    eq[k] += v * c["count"]
                complete = complete and ok
        if not complete and t.get("expected_personnel"):
            people, complete, fallback = t["expected_personnel"], True, True
        cache[tid] = (people, eq, complete, fallback)
        return cache[tid]

    for tid in templates:
        people, eq, complete, fb = totals(tid)
        con.execute("INSERT INTO rollup_personnel VALUES (?,?,?,?)", (tid, people, int(complete), int(fb)))
        for cat, n in eq.items():
            con.execute("INSERT INTO rollup_equipment VALUES (?,?,?)", (tid, cat, n))


# ---------------------------------------------------------------- orbat
def _walk(prefix: str, obj, out: list):
    if isinstance(obj, dict):
        for k, v in obj.items():
            _walk(f"{prefix}.{k}" if prefix else str(k), v, out)
    elif isinstance(obj, bool):
        out.append((prefix, None, str(obj).lower()))
    elif isinstance(obj, (int, float)):
        out.append((prefix, float(obj), None))
    elif obj is None:
        return
    elif isinstance(obj, list):
        out.append((prefix, None, jdump(obj)))
    else:
        out.append((prefix, None, str(obj)))


def ingest_orbat(con) -> int:
    n = 0
    for path in sorted((DATA / "orbat").glob("*.yaml")):
        doc = load_yaml(path)
        country = doc.pop("country")
        rows: list = []
        _walk("", doc, rows)
        for p, num, text in rows:
            con.execute(
                "INSERT INTO orbat_entry (country,path,num,text,as_of,source_id,confidence) VALUES (?,?,?,?,?,?,?)",
                (country, p, num, text, "2025-08-31", SRC, "stated"))
            n += 1
    return n
