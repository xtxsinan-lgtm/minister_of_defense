"""量化引擎：snapshot 复现文章/表格“总计”；recompute 可跑并给出偏差。"""
import pytest

from forcedb.quant import Engine


@pytest.fixture(scope="module")
def result(dbs):
    eq, toe = dbs
    return Engine(eq, toe, mode="snapshot").run()


def test_headline_matches_sheet_totals(result):
    # 分层级火力!总计 B36/C36/B37：418.83 / 522.18 / 80.21%
    cn, us = result["CHN"], result["USA"]
    assert cn["total"] == pytest.approx(418.83, abs=0.3)
    assert us["total"] == pytest.approx(522.18, abs=0.2)
    assert cn["ratio_to_ref"] == pytest.approx(0.8021, abs=0.002)


@pytest.mark.parametrize("key,cn,us", [
    ("ground", 154.48, 100.0), ("projection", 16.74, 100.0), ("air", 180.74, 200.0),
    ("sea", 51.00, 100.0), ("aerospace", 15.86, 22.18),
])
def test_domain_table(result, key, cn, us):
    assert result["CHN"][key] == pytest.approx(cn, abs=0.35)
    assert result["USA"][key] == pytest.approx(us, abs=0.15)


def test_service_table(result):
    # 总计!B27:C34 各军种
    cn, us = result["CHN"]["services"], result["USA"]["services"]
    assert cn["army"] == pytest.approx(121.75, abs=0.3)
    assert cn["navy"] == pytest.approx(72.91, abs=0.4)
    assert cn["airforce"] == pytest.approx(208.30, abs=1.0)
    assert us["army"] == pytest.approx(117.14, abs=0.15)
    assert us["marines"] == pytest.approx(34.71, abs=0.3)
    assert us["navy"] == pytest.approx(142.52, abs=0.4)
    assert us["bases"] == pytest.approx(33.33, abs=0.01)


def test_without_compat_uses_row_sums(dbs):
    eq, toe = dbs
    r = Engine(eq, toe, mode="snapshot", article_compat=False).run()
    # 逐行自洽口径：中国投送、空中略有不同，但比值仍在 80% 左右
    assert 0.79 < r["CHN"]["ratio_to_ref"] < 0.82
    assert r["CHN"]["projection"] < 16.74    # 表格硬编码合计偏大


def test_compat_adjustments_are_reported(dbs):
    eq, toe = dbs
    e = Engine(eq, toe, mode="snapshot")
    e.run()
    assert any("运输舰" in n for n in e.notes)
    assert any("预警机" in n for n in e.notes)


def test_inventory_scaling_changes_result(dbs):
    eq, toe = dbs
    base = Engine(eq, toe, mode="snapshot").run()["CHN"]["air"]
    eq.execute("UPDATE inventory SET quantity=quantity*2 WHERE equipment_id='j20a_s'")
    try:
        more = Engine(eq, toe, mode="snapshot").run()["CHN"]["air"]
    finally:
        eq.execute("UPDATE inventory SET quantity=quantity/2 WHERE equipment_id='j20a_s'")
    assert more > base


def test_recompute_runs_and_reports_deviations(dbs):
    eq, toe = dbs
    e = Engine(eq, toe, mode="recompute")
    r = e.run()
    assert 0.70 < r["CHN"]["ratio_to_ref"] < 0.95
    items = {d["item"] for d in r.deviations}
    assert {"fighter_air_eq_fa18", "brigade_power", "submarine_power_per_boat", "ship_power_per_ship"} <= items
    subs = [d for d in r.deviations if d["item"] == "submarine_power_per_boat"]
    assert all(d["ratio"] == pytest.approx(1.0, rel=2e-3) for d in subs)


def test_other_country_pair_runs_with_empty_data(dbs):
    eq, toe = dbs
    r = Engine(eq, toe, mode="snapshot").run(["CHN", "USA", "JPN"])
    assert r["JPN"]["total"] == pytest.approx(0.0, abs=1e-9)
