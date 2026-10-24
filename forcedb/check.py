"""库完整性检查与覆盖率报告。"""
from __future__ import annotations

from collections import defaultdict
from typing import List


def integrity(eq, toe) -> List[str]:
    """返回问题列表；空列表 = 通过。"""
    issues: List[str] = []
    for name, con in (("equipment", eq), ("toe", toe)):
        for r in con.execute("PRAGMA foreign_key_check"):
            issues.append(f"[{name}] 外键违规：表 {r[0]} 行 {r[1]} → {r[2]}")
    ids = {r[0] for r in eq.execute("SELECT id FROM equipment")}
    cats = {r[0] for r in eq.execute("SELECT id FROM category")}
    for r in toe.execute("SELECT DISTINCT equipment_id FROM template_binding"):
        if r[0] not in ids:
            issues.append(f"[toe] 绑定的型号不存在于装备库：{r[0]}")
    for r in toe.execute("SELECT DISTINCT category FROM template_slot"):
        if r[0] not in cats:
            issues.append(f"[toe] 槽位类别不存在于装备库：{r[0]}")
    for r in eq.execute("SELECT DISTINCT e.id FROM equipment e LEFT JOIN source s ON s.id=e.source_id "
                        "WHERE e.source_id IS NOT NULL AND s.id IS NULL"):
        issues.append(f"[equipment] 来源未登记：{r[0]}")
    for r in eq.execute("SELECT id, quantity FROM inventory WHERE quantity < 0"):
        issues.append(f"[equipment] 库存为负：{r[0]} {r[1]}")
    for r in toe.execute("SELECT id FROM brigade_class WHERE template_id IS NOT NULL AND template_id NOT IN "
                         "(SELECT id FROM unit_template)"):
        issues.append(f"[toe] 旅级单位引用了不存在的模板：{r[0]}")
    return issues


def coverage(eq, countries=("CHN", "USA")):
    """每个国家 × 域 × 类别：有库存的装备型号数 / 库存总量。返回 (rows, gaps)。"""
    rows = []
    have = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for r in eq.execute("SELECT i.country, e.domain, e.category, COUNT(DISTINCT e.id) n, SUM(i.quantity) q "
                        "FROM v_inventory_latest i JOIN equipment e ON e.id=i.equipment_id "
                        "WHERE i.kind IN ('active','in_toe') GROUP BY 1,2,3"):
        have[r["country"]][(r["domain"], r["category"])] = [r["n"], r["q"]]
    all_cats = [(r["domain"], r["id"]) for r in eq.execute("SELECT domain, id FROM category ORDER BY domain, id")]
    models = {(r["origin"], r["category"]): r["n"] for r in eq.execute(
        "SELECT origin, category, COUNT(*) n FROM equipment GROUP BY 1,2")}
    gaps = {}
    for c in countries:
        gaps[c] = []
        for dom, cat in all_cats:
            n, q = have[c].get((dom, cat), [0, 0.0])
            rows.append((c, dom, cat, models.get((c, cat), 0), n, q))
            if n == 0:
                gaps[c].append((dom, cat))
    return rows, gaps


def stats(eq, toe) -> dict:
    g = lambda con, q: con.execute(q).fetchone()[0]
    return {
        "装备型号": g(eq, "SELECT COUNT(*) FROM equipment"),
        "规格键值": g(eq, "SELECT COUNT(*) FROM spec"),
        "库存行": g(eq, "SELECT COUNT(*) FROM inventory"),
        "有库存的国家": g(eq, "SELECT COUNT(DISTINCT country) FROM inventory"),
        "编制模板": g(toe, "SELECT COUNT(*) FROM unit_template"),
        "orbat 条目": g(toe, "SELECT COUNT(*) FROM orbat_entry"),
        "旅级战力单位": g(toe, "SELECT COUNT(*) FROM brigade_class"),
    }


def crosscheck(eq, rel_tol: float = 0.15):
    """同一 (国家,装备,口径) 在不同来源之间的总量差异（各来源取各自最新观测；军种求和、role 取最大），按相对差排序。

    返回 [(country, equipment_id, [(source, as_of, total), ...], rel_diff)]。
    """
    rows = eq.execute(
        "SELECT i.country, i.equipment_id, i.kind, i.role, i.service, i.source_id, i.as_of, i.quantity FROM inventory i "
        "WHERE i.as_of = (SELECT MAX(k.as_of) FROM inventory k WHERE k.country=i.country AND k.service=i.service "
        "AND k.equipment_id=i.equipment_id AND k.kind=i.kind AND k.role=i.role AND k.source_id IS i.source_id)").fetchall()
    per = defaultdict(lambda: defaultdict(float))     # (country,eq,kind,source,role) → Σ service
    asof = {}
    for r in rows:
        k = (r["country"], r["equipment_id"], r["kind"], r["source_id"])
        per[k][r["role"]] += r["quantity"]
        asof[k] = max(asof.get(k, ""), r["as_of"])
    groups = defaultdict(list)
    for k, roles in per.items():
        groups[(k[0], k[1], k[2])].append((k[3], asof[k], max(roles.values())))
    out = []
    for k, obs in groups.items():
        if len({o[0] for o in obs}) < 2:
            continue
        qs = [o[2] for o in obs]
        hi, lo = max(qs), min(qs)
        diff = (hi - lo) / hi if hi else 0.0
        if diff >= rel_tol:
            out.append((k[0], k[1], sorted(obs), diff))
    return sorted(out, key=lambda x: -x[3])
