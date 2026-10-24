"""编制库：汇总口径应与原文总数、tools/validate_data.py 一致。"""


def rollup(toe, tid):
    r = toe.execute("SELECT personnel, complete FROM rollup_personnel WHERE template=?", (tid,)).fetchone()
    eq = {x["category"]: x["count"] for x in toe.execute("SELECT category,count FROM rollup_equipment WHERE template=?", (tid,))}
    return r["personnel"], r["complete"], eq


def test_us_bct_personnel_match_article(dbs):
    _, toe = dbs
    assert rollup(toe, "us_abct")[0] == 4302
    assert rollup(toe, "us_sbct")[0] == 3994
    assert rollup(toe, "us_ibct")[0] == 4254


def test_pla_heavy_brigade(dbs):
    _, toe = dbs
    people, _, eq = rollup(toe, "pla_heavy_cab_brigade")
    assert people == 5000          # 子树含聚合单位，用原文总数回填
    assert eq["mbt"] == 112        # 原文：112 辆坦克


def test_us_abct_tanks(dbs):
    _, toe = dbs
    assert rollup(toe, "us_abct")[2]["mbt"] == 87


def test_templates_levels_and_countries(dbs):
    _, toe = dbs
    n = toe.execute("SELECT COUNT(*) FROM unit_template").fetchone()[0]
    assert n >= 1100
    countries = {r[0] for r in toe.execute("SELECT DISTINCT country FROM unit_template")}
    assert {"USA", "CHN"} <= countries and "UNK" not in countries


def test_children_reference_existing_templates_and_lower_level(dbs):
    _, toe = dbs
    rank = {"squad": 0, "platoon": 1, "company": 2, "battalion": 3, "brigade": 4, "division": 5, "corps": 6}
    rows = toe.execute("SELECT p.id pid, p.level plv, c.id cid, c.level clv FROM template_child t "
                       "JOIN unit_template p ON p.id=t.parent JOIN unit_template c ON c.id=t.child "
                       "WHERE t.kind='child'").fetchall()
    assert rows
    assert all(rank[r["clv"]] < rank[r["plv"]] for r in rows)


def test_slots_reference_known_categories(dbs):
    eq, toe = dbs
    cats = {r[0] for r in eq.execute("SELECT id FROM category")}
    used = {r[0] for r in toe.execute("SELECT DISTINCT category FROM template_slot")}
    used |= {r[0] for r in toe.execute("SELECT DISTINCT category FROM template_binding")}
    assert used <= cats, used - cats


def test_bindings_reference_known_equipment(dbs):
    eq, toe = dbs
    ids = {r[0] for r in eq.execute("SELECT id FROM equipment")}
    bound = {r[0] for r in toe.execute("SELECT DISTINCT equipment_id FROM template_binding")}
    assert bound <= ids, bound - ids


def test_brigade_classes_loaded(dbs):
    _, toe = dbs
    n = toe.execute("SELECT COUNT(*) FROM brigade_class").fetchone()[0]
    assert n == 47
