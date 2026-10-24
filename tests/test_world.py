"""十二国估算：与作者工作簿交叉核对、类比物化、区间、来源可追溯。"""
import pytest

from forcedb.ingest.world import COUNTRIES
from forcedb.quant import Engine
from forcedb.quant.report import world_table

WORLD12 = ["RUS", "JPN", "KOR", "PRK", "IRN", "TUR", "GBR", "FRA", "DEU", "GRC", "POL", "ISR"]


@pytest.fixture(scope="module")
def tab(dbs):
    eq, toe = dbs
    return world_table(eq, toe, WORLD12 + ["CHN"])


def test_all_twelve_countries_have_files_and_nonzero_totals(tab):
    names = {p.stem for p in COUNTRIES.glob("*.yaml")}
    assert set(WORLD12) <= names
    for c in WORLD12:
        assert tab[c]["mid"]["total"] > 5, c


def test_navy_totals_match_authors_workbook_navy_sheet(tab):
    """工作簿“海军”表 B 列 ÷ 美国 31042：俄 4845、日 4023、英 2544、韩 2320、法 1683（占美国海军 %）。"""
    expect = {"RUS": 15.6, "JPN": 13.0, "GBR": 8.2, "KOR": 7.5, "FRA": 5.4}
    for c, v in expect.items():
        assert tab[c]["mid"]["sea"] == pytest.approx(v, abs=0.4), c


def test_russia_air_matches_workbook_tactical_totals(dbs):
    """工作簿 战斗机!AO83+87+88+89+90 ≈ 1833（战术+轰炸+加油+特种+无人机）；我们按型号重算约 1827。"""
    eq, toe = dbs
    e = Engine(eq, toe)
    a = e.air("RUS")
    assert a["total"] == pytest.approx(1833, rel=0.12)


def test_scenarios_bracket_mid_and_ordering(tab):
    for c in WORLD12:
        t = tab[c]
        assert t["low"] < t["mid"]["total"] < t["high"], c
    assert tab["RUS"]["mid"]["total"] > max(tab[c]["mid"]["total"] for c in WORLD12 if c != "RUS")
    # 与中国比：除俄罗斯外都明显更低
    assert all(tab[c]["mid"]["total"] < tab["CHN"]["mid"]["total"] for c in WORLD12)


def test_reference_country_unchanged_by_other_countries_scenarios(dbs):
    eq, toe = dbs
    base = Engine(eq, toe).run(["CHN", "USA"])["USA"]["total"]
    low = Engine(eq, toe, scenario="low").run(["CHN", "USA", "RUS"])["USA"]["total"]
    assert low == pytest.approx(base)


def test_analog_materialization_scales_unit_value(dbs):
    eq, _ = dbs
    g = lambda eid, k: eq.execute("SELECT num FROM spec WHERE equipment_id=? AND key=?", (eid, k)).fetchone()[0]
    # tu142_asw 是显式 unit；e767 = E-3 × 0.9
    e3 = g("e_3", "article.power_total") / g("e_3", "article.qty")
    assert g("e767", "article.power_total") == pytest.approx(0.9 * e3)
    assert g("e767", "article.qty") == 1.0
    assert g("eurofighter", "article.air_total") == pytest.approx(1.04)
    txt = eq.execute("SELECT text FROM spec WHERE equipment_id='e767' AND key='estimate.analog_of'").fetchone()[0]
    assert txt == "e_3"


def test_every_world_equipment_is_traceable(dbs):
    eq, _ = dbs
    rows = eq.execute("SELECT e.id FROM equipment e WHERE e.source_id='research_2026'").fetchall()
    assert len(rows) > 150
    for r in rows:
        keys = {k[0] for k in eq.execute("SELECT key FROM spec WHERE equipment_id=?", (r[0],))}
        assert "estimate.analog_of" in keys or "estimate.unit_source" in keys, r[0]


def test_world_inventory_sources_are_low_or_workbook(dbs):
    eq, _ = dbs
    srcs = {r[0] for r in eq.execute("SELECT DISTINCT source_id FROM inventory WHERE country IN (%s)" %
                                     ",".join("'%s'" % c for c in WORLD12))}
    assert srcs <= {"research_2026", "sheet_cn_us_live", "manual_general_knowledge"}


def test_carrier_snapshots_are_derived_for_foreign_carriers(dbs):
    eq, _ = dbs
    v = eq.execute("SELECT num FROM spec WHERE equipment_id='cv_charles_de_gaulle' AND key='article.power_vls'").fetchone()[0]
    assert v == pytest.approx(561.43)           # 工作簿数值（annotations 覆盖了派生值）
    d = eq.execute("SELECT num FROM spec WHERE equipment_id='cv_vikrant' AND key='article.power_vls'").fetchone()[0]
    assert 200 < d < 800                          # 由空中联队复合指标派生
