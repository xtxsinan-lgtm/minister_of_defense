"""叶子公式：用表格里的实际输入核对表格里的结果。"""
import math

import pytest

from forcedb.quant import formulas as F


def test_fighter_air_power_j20a():
    # 分层级火力!战斗机 第 2 行（歼20A/S）：制空战力 119157；公式在 0.5% 内复现
    p = F.fighter_air_power(422.849, 270, 43, 1.505, 6, 1518, 2.5, 1.8)
    assert p == pytest.approx(119157, rel=0.005)


def test_fighter_air_power_reference_fa18():
    p = F.fighter_air_power(167.9184, 130, 172, 1.05, 12, 815, 1.8, 0.95)
    assert p == pytest.approx(5304, rel=0.02)


def test_submarine_power_matches_sheet_exactly():
    # 093：K=12.82；洛杉矶：18.67
    assert F.submarine_power(18, 30, 30, 6675, 200, 1.5) == pytest.approx(12.8226, rel=1e-3)
    assert F.submarine_power(37, 30, 30, 6927, 63.2456, 1.0) == pytest.approx(18.6728, rel=1e-3)


def test_detection_range_by_noise():
    assert F.detection_range_by_noise(200, 125, 110) == pytest.approx(35.5656, rel=1e-4)


def test_tanker_composite_and_ref():
    c = F.tanker_composite(100, 75)
    assert c == pytest.approx(86.6025, rel=1e-4)
    assert c / F.TANKER_FA18_REF == pytest.approx(4.4444, rel=2e-3)


def test_uav_composite_rq170_is_unit():
    # RQ-170 是 1 个等效 F/A-18
    c = F.uav_composite(0.5, 3.9, 644, 6, 1400, 10)
    assert c / F.UAV_FA18_REF == pytest.approx(1.0, rel=1e-3)


def test_awacs_kj600():
    c = F.awacs_composite(917.7293, 4.536, 6)
    assert c == pytest.approx(3059, rel=1e-3)
    assert F.awacs_to_fa18(c) == pytest.approx(8.8, rel=0.01)


def test_brigade_power_us_abct():
    p = F.brigade_power(1.48, 3.06, 1.21, 1.1, 1.0, 1.0)
    assert p == pytest.approx(6.04, rel=0.005)


def test_brigade_power_regiment_skips_logistics():
    with_log = F.brigade_power(1.12, 2.18, 1.21, 0.7513, 0.9091, 1.0, True)
    without = F.brigade_power(1.12, 2.18, 1.21, 0.7513, 0.9091, 1.0, False)
    assert without == pytest.approx(2.21, rel=0.005)
    assert with_log == pytest.approx(without * 0.9091, rel=1e-6)


def test_equipment_multiplier_geometric_mean():
    assert F.equipment_multiplier(4, 9) == pytest.approx(6.0)


def test_heavy_equipment_equivalents_abct():
    # 规模!R14：87 辆坦克×2 + 123 辆 3 人战斗车辆 + 15 辆 2 人车/2 + 18 辆迫击炮 + 18 辆 155 炮×2.5
    eq = F.heavy_equipment_equivalents({"tank3": 87, "veh3": 123, "veh2": 15, "mortar": 18, "gun155": 18})
    assert eq == pytest.approx(367.5)


def test_ship_firepower_burke_iia():
    coef = {"cell_mk41": 1.0, "antiship_missiles": 1.0, "torpedoes": 0.25}
    assert F.ship_firepower_vls({"cell_mk41": 96, "antiship_missiles": 8, "torpedoes": 6}, coef) == pytest.approx(105.5)


def test_transport_throughput():
    assert F.transport_throughput_24h(19, 13.4, 427) == pytest.approx(14530, rel=0.01)
