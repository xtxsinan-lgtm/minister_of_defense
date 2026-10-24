"""爬取层：离线夹具验证归一化、匹配、幂等、dry-run、重建后回放。"""
import json
import shutil
from pathlib import Path

import pytest

from forcedb.build import build
from forcedb.crawl import store
from forcedb.crawl.connectors.wikipedia import PROFILES, WikipediaInventory, match_equipment, norm, parse_qty
from forcedb.crawl.connectors.worldbank import WorldBankMilitary
from forcedb.crawl.runner import build_context, run_connector

FIX = Path(__file__).parent / "fixtures"


class FakeHttp:
    def __init__(self, text=None, json_obj=None):
        self.text, self.json_obj = text, json_obj

    def get_text(self, url, params=None):
        return self.text

    def get_json(self, url, params=None):
        return self.json_obj


@pytest.fixture()
def fresh(tmp_path, monkeypatch):
    d = tmp_path / "db"
    obs = tmp_path / "obs"
    monkeypatch.setattr(store, "OBS_DIR", obs)
    eq, toe = build(d, verbose=False)
    return eq, toe, d, obs


def test_helpers():
    assert norm("F-35A") == norm("f_35a") == "f35a"
    assert parse_qty("549[8]") == 549 and parse_qty("1,200") == 1200 and parse_qty("") is None
    assert match_equipment("F-35A Lightning II", {"f35a": "f_35a"}) == "f_35a"
    assert match_equipment("[a]F/A-18E/F Super Hornet", {"fa18ef": "f_a_18e_f"}) == "f_a_18e_f"
    assert match_equipment("Unknown Thing", {"f35a": "x"}) is None


def test_worldbank_filters_aggregates_and_nulls(fresh):
    eq, _, _, _ = fresh
    c = WorldBankMilitary()
    raw = {"MS.MIL.XPND.CD": json.load(open(FIX / "worldbank_sample.json"))[1]}
    obs = list(c.parse(raw, build_context(eq, "2026-10-24")))
    got = {(o.data["country"], o.data["year"]) for o in obs}
    assert got == {("CHN", 2024), ("USA", 2024), ("JPN", 2022)}     # WLD 是聚合，JPN 2023 是空值


def test_worldbank_dry_run_then_apply_is_idempotent(fresh):
    eq, _, _, obs_dir = fresh
    raw = json.load(open(FIX / "worldbank_sample.json"))
    http = FakeHttp(json_obj=raw)
    c = WorldBankMilitary(indicators=["MS.MIL.XPND.CD"])
    s = run_connector(eq, c, http=http, apply=False, today="2026-10-24")
    assert s["new"] == 3 and eq.execute("SELECT COUNT(*) FROM country_indicator").fetchone()[0] == 0
    assert not (obs_dir / "indicators.csv").exists()
    s = run_connector(eq, c, http=http, apply=True, today="2026-10-24")
    assert s["new"] == 3
    assert eq.execute("SELECT COUNT(*) FROM country_indicator").fetchone()[0] == 3
    s = run_connector(eq, c, http=http, apply=True, today="2026-10-25")
    assert s == {**s, "new": 0, "changed": 0} and s["unchanged"] == 3
    assert len((obs_dir / "indicators.csv").read_text().splitlines()) == 1 + 3   # 没有重复追加


def test_wikipedia_inventory_matches_and_stages(fresh):
    eq, _, _, _ = fresh
    html = (FIX / "wiki_us_aircraft_sample.html").read_text(encoding="utf-8")
    c = WikipediaInventory(PROFILES[0])
    obs = list(c.parse(html, build_context(eq, "2026-10-24")))
    inv = {o.data["equipment_id"]: o.data for o in obs if o.kind == "inventory"}
    assert inv["f_35a"]["quantity"] == 560 and inv["f_35a"]["service"] == "airforce"
    assert inv["f_22"]["quantity"] == 183
    assert inv["f_a_18e_f"]["service"] == "navy" and inv["f_a_18e_f"]["quantity"] == 549
    staged = [o for o in obs if o.kind == "staging"]
    assert [o.data["name"] for o in staged] == ["T-7A Red Hawk"]
    assert all(o.data["service"] for o in obs)           # “Other” 标题下的表不属于任何军种，被跳过


def test_inventory_history_is_kept_and_latest_view_works(fresh):
    eq, _, _, _ = fresh
    html = (FIX / "wiki_us_aircraft_sample.html").read_text(encoding="utf-8")
    c = WikipediaInventory(PROFILES[0])
    run_connector(eq, c, http=FakeHttp(text=html), apply=True, today="2026-10-24")
    html2 = html.replace("560<sup>[1]</sup>", "575")
    run_connector(eq, c, http=FakeHttp(text=html2), apply=True, today="2026-11-24")
    rows = eq.execute("SELECT quantity, as_of FROM inventory WHERE equipment_id='f_35a' AND country='USA' "
                      "AND source_id='wikipedia_lists' ORDER BY as_of").fetchall()
    assert [r["quantity"] for r in rows] == [560, 575]
    latest = eq.execute("SELECT quantity FROM v_inventory_latest WHERE equipment_id='f_35a' AND country='USA' "
                        "AND source_id='wikipedia_lists'").fetchone()
    assert latest["quantity"] == 575


def test_observations_survive_rebuild(fresh, tmp_path):
    eq, _, d, obs_dir = fresh
    raw = json.load(open(FIX / "worldbank_sample.json"))
    run_connector(eq, WorldBankMilitary(indicators=["MS.MIL.XPND.CD"]), http=FakeHttp(json_obj=raw), apply=True, today="2026-10-24")
    eq2, _ = build(tmp_path / "db2", verbose=False)     # 重建会清库，但观测文件被回放
    assert eq2.execute("SELECT COUNT(*) FROM country_indicator").fetchone()[0] == 3


def test_inventory_view_prefers_reliable_source_over_newer_low_reliability(dbs):
    eq, _ = dbs
    # 表格(medium) vs Wikipedia(low, 更新)：当前值取表格；两者都保留可查
    eq.execute("INSERT OR REPLACE INTO inventory (country,service,equipment_id,kind,role,quantity,as_of,source_id)"
               " VALUES ('USA','airforce','f_22','active','air_superiority',1,'2030-01-01','wikipedia_lists')")
    try:
        cur = eq.execute("SELECT SUM(quantity) FROM v_inventory_latest WHERE country='USA' AND equipment_id='f_22' "
                         "AND role='air_superiority'").fetchone()[0]
        n = eq.execute("SELECT COUNT(*) FROM inventory WHERE equipment_id='f_22' AND role='air_superiority'").fetchone()[0]
        assert cur == 183 and n == 2
    finally:
        eq.execute("DELETE FROM inventory WHERE source_id='wikipedia_lists' AND equipment_id='f_22' AND quantity=1")


def test_crosscheck_flags_big_source_disagreements(dbs):
    from forcedb.check import crosscheck
    eq, _ = dbs
    eq.execute("INSERT OR REPLACE INTO inventory (country,service,equipment_id,kind,role,quantity,as_of,source_id)"
               " VALUES ('USA','airforce','f_22','active','all',100,'2026-01-01','wikipedia_lists')")
    try:
        hits = {(c, e): d for c, e, _, d in crosscheck(eq, 0.15)}
        assert ("USA", "f_22") in hits and hits[("USA", "f_22")] == pytest.approx(1 - 100 / 183, rel=1e-6)
    finally:
        eq.execute("DELETE FROM inventory WHERE source_id='wikipedia_lists' AND equipment_id='f_22'")
