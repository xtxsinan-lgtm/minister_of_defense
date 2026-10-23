#!/usr/bin/env python3
"""
Builds web/commander/sim_data.js for the commander-mode operational simulation (P1/P2).

Scale & Geography (aligned with docs/design_doc_v0.1.md §9.3, docs/spec/10_map_data_pipeline.md §5 & §9.1,
and docs/spec/14_scenario_nk.md §4.1.4.1):
  - H3 Resolution 4 scale hexagonal grid (HEX_W = 42.0 km flat-to-flat, edge = 24.25 km, area ~1,528 km²)
  - Covers the full Armenia + Azerbaijan theater (72 hexes total: Armenia 17, NK + 7 surrounding districts 12,
    Nakhchivan exclave 3, Azerbaijan proper 40; 11 contact-line edges)
  - Real geographic boundaries (Natural Earth 10m Admin-0 / Admin-1 + 1994 Line of Contact) stored in
    data/scenarios/nk_common/geo_borders.json and embedded for real-map overlay rendering
  - Exact 6-vertex (lat, lon) polygon coordinates per hex for Web Mercator / Leaflet lockstep projection
"""
from __future__ import annotations
import json
import math
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "commander" / "sim_data.js"
GEO_BORDERS_PATH = ROOT / "data" / "scenarios" / "nk_common" / "geo_borders.json"

# ---------------------------------------------------------------- grid ----
# H3 Resolution 4 scale (flat-to-flat 42.0 km, edge ~24.25 km, area ~1,528 km²),
# phase-anchored on Nagorno-Karabakh so each of the 12 operational sectors of the 2020 war
# maps 1-to-1 to a single hex.
KM_LAT = 111.132
KM_LON = 111.320 * math.cos(math.radians(40.0))
HEX_W = 42.0
HEX_R_KM = HEX_W / math.sqrt(3)
HEX_H = 2.0 * HEX_R_KM
ROW_PITCH = 1.5 * HEX_R_KM

# Anchor so (q=7, r=8) is Lachin (39.72N, 46.32E) and (q=8, r=8) is Shusha (39.72N, 46.81E)
LAT_N = 39.72 + 8 * ROW_PITCH / KM_LAT   # 42.3384 N
LON_W = 46.32 - 7 * HEX_W / KM_LON       # 42.8718 E


def hex_center(q: int, r: int) -> tuple[float, float]:
    x = q * HEX_W + (HEX_W / 2.0 if r % 2 else 0.0)
    y = r * ROW_PITCH
    return LAT_N - y / KM_LAT, LON_W + x / KM_LON


def hex_vertices(lat: float, lon: float) -> list[list[float]]:
    """Returns the 6 pointy-top vertices [lat, lon] in clockwise order starting at -30 deg (NE)."""
    verts = []
    for i in range(6):
        ang = math.radians(60 * i - 30)
        dx_km = HEX_R_KM * math.cos(ang)
        dy_km = HEX_R_KM * math.sin(ang)
        v_lat = lat - dy_km / KM_LAT
        v_lon = lon + dx_km / KM_LON
        verts.append([round(v_lat, 4), round(v_lon, 4)])
    return verts


def neighbors(q: int, r: int) -> list[tuple[int, int]]:
    odd = r % 2 == 1
    d = [(1, 0), (1, 1), (0, 1), (-1, 0), (0, -1), (1, -1)] if odd else [(1, 0), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1)]
    return [(q + a, r + b) for a, b in d]


def pip(lat: float, lon: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        lat1, lon1 = ring[i][0], ring[i][1]
        lat2, lon2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (lat1 > lat) != (lat2 > lat):
            x = lon1 + (lat - lat1) * (lon2 - lon1) / (lat2 - lat1)
            if lon < x:
                inside = not inside
    return inside


def pip_multi(lat: float, lon: float, rings: list[list[list[float]]]) -> bool:
    return any(pip(lat, lon, r) for r in rings)


# 72-hex partition across Armenia (17), NK + 7 surrounding districts (12), Nakhchivan (3), and Azerbaijan proper (40)
ARM_ZONE_SET = {
    (6, 7),   # Kalbajar / Dadivank
    (7, 6),   # Sugovushan / Talysh / Murovdag
    (8, 6),   # Martakert / Aghdara
    (7, 7),   # Stepanakert / Askeran
    (8, 7),   # Aghdam / Martuni
    (7, 8),   # Lachin corridor (Berdzor)
    (8, 8),   # Shusha / Karin Tak
    (9, 8),   # Fuzuli
    (7, 9),   # Qubadli
    (8, 9),   # Hadrut
    (7, 10),  # Zangilan / Kovsakan
    (8, 10),  # Jabrayil / Aras valley
}
NAKH_SET = {(4, 8), (4, 9), (5, 9)}
ARM_SET = {
    (2, 4), (3, 4), (4, 4), (5, 4),
    (2, 5), (3, 5), (4, 5),
    (3, 6), (4, 6), (5, 6), (6, 6),
    (3, 7), (4, 7), (5, 7),
    (6, 8), (6, 9), (6, 10),
}
AZE_EXTRA_SET = {(9, 9), (9, 10), (10, 9), (10, 3)}
TRIM_SET = {(2, 6), (2, 7), (5, 8), (7, 2), (15, 6), (13, 8), (11, 11)}
NK_OBLAST_HEXES = {(8, 6), (7, 7), (8, 8), (8, 9), (8, 7)}

HEX_TERRAIN: dict[tuple[int, int], str] = {
    # 12 arm_zone operational sectors
    (6, 7): "Mountain",   # Kalbajar
    (7, 6): "Mountain",   # Sugovushan / Murovdag
    (8, 6): "Forest",     # Martakert uplands
    (7, 7): "Urban",      # Stepanakert
    (8, 7): "Mixed",      # Aghdam / Martuni foothills
    (7, 8): "Mountain",   # Lachin corridor
    (8, 8): "Mountain",   # Shusha cliff fortress
    (9, 8): "Mixed",      # Fuzuli rolling hills
    (7, 9): "Mixed",      # Qubadli Vorotan valley
    (8, 9): "Forest",     # Hadrut wooded ridges
    (7, 10): "Mixed",     # Zangilan lowland/hills
    (8, 10): "Open",      # Jabrayil Aras plain
    # Key Armenia hexes
    (3, 7): "Urban",      # Yerevan
    (3, 6): "Mixed",      # Vagharshapat / Ararat plain
    (4, 7): "Mixed",      # Artashat / Ararat plain
    (2, 4): "Mixed",      # Gyumri / Shirak plateau
    # Key Azerbaijan hexes
    (7, 5): "Urban",      # Ganja
    (8, 4): "Urban",      # Mingachevir
    (13, 6): "Urban",     # Sumgait
    (14, 6): "Urban",     # Baku
    (12, 7): "Urban",     # Shirvan
    (12, 10): "Forest",   # Lankaran / Talysh mountains
}


def terrain_of(q: int, r: int, lat: float, lon: float, region: str) -> str:
    if (q, r) in HEX_TERRAIN:
        return HEX_TERRAIN[(q, r)]
    if region == "armenia":
        return "Mountain"
    if region == "nakhchivan":
        return "Mixed" if q == 4 else "Mountain"
    # Azerbaijan proper
    if r <= 3 and q <= 11:
        return "Mountain"    # Greater Caucasus (Zaqatala, Sheki, Qabala, Quba)
    if q <= 6 and r in (4, 5):
        return "Mountain"    # Lesser Caucasus north-west (Gadabay, Dashkasan)
    if (q, r) in {(6, 4), (8, 5), (10, 4), (11, 4), (12, 5)}:
        return "Mixed"       # Foothills (Tovuz, Goranboy, Goychay, Shamakhi, Gobustan)
    return "Open"            # Kura-Aras lowland


# Named places across all 72 hexes: (q, r, id, name_arm, name_aze, kind, value, sub_places)
HEX_PLACES: list[tuple[int, int, str, str, str, str, int, list[str]]] = [
    # --- 12 arm_zone operational sectors ---
    (7, 7, "stepanakert", "斯捷潘纳克特", "汉肯德", "city", 9, ["阿斯克兰", "霍贾利"]),
    (8, 8, "shusha", "舒希", "舒沙", "city", 10, ["卡林塔克"]),
    (7, 8, "lachin", "别尔佐尔（拉钦）", "拉钦", "town", 9, ["扎布赫", "拉钦走廊"]),
    (8, 6, "martakert", "马尔塔克特", "阿格德雷", "town", 6, ["万克"]),
    (7, 6, "sugovushan", "马达吉斯 / 塔利什", "苏古沃尚 / 塔利什", "town", 5, ["塔利什", "穆罗夫达格"]),
    (6, 7, "kalbajar", "卡尔瓦恰尔", "卡尔巴贾尔", "town", 5, ["达迪万克", "奥马尔山口"]),
    (8, 7, "aghdam", "阿克纳 / 马尔图尼", "阿格达姆 / 霍贾文德", "town", 6, ["马尔图尼", "霍贾文德"]),
    (9, 8, "fuzuli", "瓦兰达（菲祖利）", "菲祖利", "town", 6, ["戈拉迪兹西"]),
    (8, 9, "hadrut", "哈德鲁特", "哈德鲁特", "town", 6, ["图格", "红巴扎尔"]),
    (8, 10, "jabrayil", "杰拉坎（杰布拉伊尔）", "杰布拉伊尔", "town", 6, ["胡达费林桥"]),
    (7, 9, "qubadli", "萨纳萨尔（库巴德利）", "库巴德利", "town", 5, ["汉利格"]),
    (7, 10, "zangilan", "科夫萨坎（赞格兰）", "赞格兰", "town", 5, ["明吉万"]),
    # --- Armenia proper (17 hexes) ---
    (3, 7, "yerevan", "埃里温", "埃里温", "city", 10, ["阿博维扬"]),
    (2, 4, "gyumri", "久姆里", "久姆里", "city", 7, ["阿尔蒂克"]),
    (3, 4, "vanadzor", "瓦纳佐尔", "瓦纳佐尔", "city", 6, ["斯皮塔克", "斯捷潘纳万"]),
    (4, 4, "dilijan", "迪利然 / 伊杰万", "迪利然 / 伊杰万", "town", 4, ["伊杰万"]),
    (5, 4, "berd", "别尔德", "别尔德", "town", 4, ["塔武什"]),
    (2, 5, "talin", "塔林 / 阿拉加茨", "塔林", "town", 3, []),
    (3, 5, "ashtarak", "阿什塔拉克 / 拉兹丹", "阿什塔拉克", "town", 4, ["拉兹丹"]),
    (4, 5, "sevan", "塞凡 / 加瓦尔", "塞凡", "town", 5, ["加瓦尔"]),
    (3, 6, "vagharshapat", "瓦加尔沙帕特", "埃奇米阿津", "town", 5, ["阿尔马维尔"]),
    (4, 6, "martuni_arm", "马尔图尼（塞凡湖）", "马尔图尼", "town", 3, []),
    (5, 6, "sevan_east", "塞凡东岸", "茶姆巴拉克", "town", 3, []),
    (6, 6, "vardenis", "瓦尔德尼斯", "瓦尔德尼斯", "town", 5, ["索特克山口"]),
    (4, 7, "artashat", "阿尔塔沙特", "阿尔塔沙特", "town", 4, ["阿拉拉特"]),
    (5, 7, "yeghegnadzor", "叶海格纳佐尔", "叶海格纳佐尔", "town", 4, ["杰尔穆克", "瓦이크"]),
    (6, 8, "sisian", "西西安", "西西安", "town", 5, ["伊什汉纳萨尔"]),
    (6, 9, "goris", "戈里斯 / 卡潘", "戈里斯 / 卡潘", "town", 6, ["卡潘", "泰格"]),
    (6, 10, "meghri", "梅格里", "梅格里", "town", 4, ["阿加拉克"]),
    # --- Nakhchivan exclave (3 hexes) ---
    (4, 8, "sadarak", "萨达拉克", "萨达拉克", "town", 3, []),
    (4, 9, "sharur", "沙鲁尔", "沙鲁尔", "town", 3, ["坎加尔利"]),
    (5, 9, "nakhchivan", "纳希切万", "纳希切万", "city", 6, ["朱尔法", "奥尔杜巴德"]),
    # --- Azerbaijan proper (40 hexes) ---
    (8, 2, "zaqatala", "扎卡塔雷", "扎卡塔雷", "town", 4, ["巴拉肯"]),
    (5, 3, "qazax", "哈萨克 / 阿格斯塔法", "哈萨克", "town", 4, ["阿格斯塔法"]),
    (8, 3, "sheki", "舍基", "舍基", "city", 5, ["卡希"]),
    (10, 3, "qabala", "盖贝莱", "盖贝莱", "town", 4, ["奥古兹"]),
    (11, 3, "quba", "库巴 / 库萨雷", "库巴", "town", 4, ["库萨雷"]),
    (12, 3, "khachmaz", "哈奇马斯", "哈奇马斯", "town", 3, []),
    (6, 4, "tovuz", "托乌兹 / 沙姆基尔", "托乌兹", "town", 4, ["沙姆基尔"]),
    (7, 4, "samukh", "萨穆赫", "萨穆赫", "town", 3, []),
    (8, 4, "mingachevir", "明盖恰乌尔", "明盖恰乌尔", "city", 6, ["叶夫拉赫北"]),
    (9, 4, "agdash", "阿格达什", "阿格达什", "town", 3, []),
    (10, 4, "goychay", "戈伊恰伊", "戈伊恰伊", "town", 4, ["伊斯梅尔雷"]),
    (11, 4, "shamakhi", "沙马基", "沙马基", "town", 4, ["阿格苏"]),
    (12, 4, "shabran", "沙布兰 / 锡亚赞", "沙布兰", "town", 3, []),
    (5, 5, "gadabay_west", "格达贝西", "格达贝西", "town", 2, []),
    (6, 5, "gadabay", "格达贝 / 达什卡桑", "格达贝", "town", 4, ["达什卡桑"]),
    (7, 5, "ganja", "甘贾", "甘贾", "city", 8, ["戈伊戈尔"]),
    (8, 5, "goranboy", "戈兰博伊 / 纳夫塔兰", "戈兰博伊", "town", 5, ["纳夫塔兰", "叶夫拉赫"]),
    (9, 5, "barda", "巴尔达", "巴尔达", "town", 5, []),
    (10, 5, "ujar", "乌贾尔 / 扎尔达布", "乌贾尔", "town", 3, ["扎尔达布"]),
    (11, 5, "kurdamir", "库尔达米尔", "库尔达米尔", "town", 4, []),
    (12, 5, "gobustan", "戈布斯坦", "戈布斯坦", "town", 3, []),
    (9, 6, "tartar", "塔尔塔尔", "塔尔塔尔", "town", 6, ["阿格达姆东"]),
    (10, 6, "agcabadi_n", "阿格贾巴迪北", "阿格贾巴迪北", "town", 3, []),
    (11, 6, "imishli_n", "伊米什利北", "伊米什利北", "town", 3, []),
    (12, 6, "hajigabul", "哈吉加布尔", "哈吉加布尔", "town", 4, []),
    (13, 6, "sumgait", "苏姆盖特", "苏姆盖特", "city", 7, ["希尔达兰"]),
    (14, 6, "baku", "巴库", "巴库", "city", 10, ["阿普歇伦"]),
    (9, 7, "aghjabadi", "阿格贾巴迪", "阿格贾巴迪", "town", 5, ["欣达里赫"]),
    (10, 7, "beylagan_n", "贝拉甘北", "贝拉甘北", "town", 3, []),
    (11, 7, "sabirabad", "萨比拉巴德", "萨比拉巴德", "town", 4, ["萨атлы"]),
    (12, 7, "shirvan", "希尔万", "希尔万", "city", 5, []),
    (10, 8, "beylagan", "贝拉甘", "贝拉甘", "town", 5, []),
    (11, 8, "imishli", "伊米什利", "伊米什利", "town", 4, []),
    (12, 8, "salyan", "萨利扬", "萨利扬", "town", 4, []),
    (9, 9, "horadiz", "霍拉迪兹", "霍拉迪兹", "town", 6, ["马尔詹利"]),
    (9, 10, "aras_east", "巴赫拉姆特佩", "巴赫拉姆特佩", "town", 3, []),
    (10, 9, "bilasuvar", "比利亚苏瓦尔", "比利亚苏瓦尔", "town", 3, []),
    (11, 9, "jalilabad", "贾利拉巴德", "贾利拉巴德", "town", 3, ["马萨雷"]),
    (12, 9, "neftchala", "涅夫捷恰拉", "涅夫捷恰拉", "town", 3, []),
    (12, 10, "lankaran", "兰卡兰 / 阿斯塔拉", "兰卡兰", "city", 5, ["阿斯塔拉"]),
]

# Road network over the 72-hex grid (each consecutive pair is a hex neighbor)
ROAD_PATHS: dict[str, list[tuple[int, int]]] = {
    # M12 Lachin corridor: Yerevan (3,7) -> Artashat (4,7) -> Yeghegnadzor (5,7) -> Sisian (6,8) -> Goris (6,9) -> Lachin (7,8) -> Shusha (8,8) -> Stepanakert (7,7)
    "M12_lachin": [(3, 7), (4, 7), (5, 7), (6, 8), (6, 9), (7, 8), (8, 8), (7, 7)],
    # M11 Vardenis-Martakert northern corridor: Yerevan (3,7) -> Ashtarak (3,5) -> Sevan (4,5) -> Martuni_ARM (4,6) -> Sevan_East (5,6) -> Vardenis (6,6) -> Kalbajar (6,7) -> Sugovushan (7,6) -> Martakert (8,6) -> Stepanakert (7,7)
    "M11_vardenis": [(3, 7), (3, 6), (3, 5), (4, 5), (4, 6), (5, 6), (6, 6), (6, 7), (7, 6), (8, 6), (7, 7)],
    # Armenia northern trunk: Vagharshapat (3,6) -> Talin (2,5) -> Gyumri (2,4) -> Vanadzor (3,4) -> Dilijan (4,4) -> Berd (5,4)
    "arm_north": [(3, 6), (2, 5), (2, 4), (3, 4), (4, 4), (5, 4)],
    # Syunik southern trunk: Sisian (6,8) -> Goris (6,9) -> Meghri (6,10)
    "syunik": [(6, 8), (6, 9), (6, 10)],
    # NK internal ring & eastern approaches
    "nk_ring": [(8, 6), (7, 7), (8, 7), (9, 8), (8, 9), (8, 8)],
    "aras_valley": [(9, 9), (8, 10), (7, 10), (7, 9), (7, 8)],
    "south_approach": [(9, 9), (8, 9), (8, 10)],
    # Azerbaijan M2 East-West trunk: Baku (14,6) -> Sumgait (13,6) -> Hajigabul (12,6) -> Kurdamir (11,5) -> Ujar (10,5) -> Barda (9,5) -> Goranboy (8,5) -> Ganja (7,5) -> Tovuz (6,4) -> Qazax (5,3)
    "aze_m2": [(14, 6), (13, 6), (12, 6), (11, 5), (10, 5), (9, 5), (8, 5), (7, 5), (6, 4), (5, 3)],
    "aze_mingachevir": [(7, 5), (8, 4), (9, 4), (10, 4), (11, 4), (12, 5), (13, 6)],
    # Azerbaijan Karabakh front lateral: Ganja (7,5) -> Goranboy (8,5) -> Tartar (9,6) -> Aghjabadi (9,7) -> Beylagan (10,8) -> Horadiz (9,9) -> Fuzuli (9,8)
    "aze_front": [(7, 5), (8, 5), (9, 6), (9, 7), (10, 8), (9, 9), (9, 8)],
    "aze_tartar": [(8, 5), (7, 6), (8, 6), (9, 6), (8, 7)],
    # Azerbaijan Southern M6 trunk: Baku (14,6) -> Sumgait (13,6) -> Hajigabul (12,6) -> Shirvan (12,7) -> Sabirabad (11,7) -> Imishli (11,8) -> Beylagan (10,8) -> Horadiz (9,9)
    "aze_south": [(14, 6), (13, 6), (12, 6), (12, 7), (11, 7), (11, 8), (10, 8), (9, 9)],
    "aze_lankaran": [(12, 7), (12, 8), (11, 9), (12, 9), (12, 10)],
    # Nakhchivan trunk
    "nakhchivan_road": [(4, 8), (4, 9), (5, 9)],
}

SUPPLY_SOURCES = {
    "ARM": [(3, 7, 1.0), (6, 8, 0.85), (6, 6, 0.5)],               # Yerevan + Sisian M12 hub + Vardenis M11 hub
    "AZE": [(14, 6, 1.0), (7, 5, 0.9), (9, 6, 0.85), (10, 8, 0.85)], # Baku + Ganja + Tartar/Barda + Beylagan
}


def build_grid(geo: dict) -> dict[tuple[int, int], dict]:
    arm_rings = geo["armenia"]
    aze_rings = geo["azerbaijan"]
    loc_rings = geo["loc_1994"]
    nk_rings = geo["nk_oblast"]

    cells: dict[tuple[int, int], dict] = {}
    for r in range(0, 14):
        for q in range(0, 18):
            if (q, r) in TRIM_SET:
                continue
            la, lo = hex_center(q, r)
            if (q, r) in ARM_ZONE_SET:
                reg = "arm_zone"
            elif (q, r) in NAKH_SET:
                reg = "nakhchivan"
            elif (q, r) in ARM_SET:
                reg = "armenia"
            elif (q, r) in AZE_EXTRA_SET:
                reg = "aze"
            else:
                in_arm = pip_multi(la, lo, arm_rings)
                in_aze = pip_multi(la, lo, aze_rings)
                in_loc = pip_multi(la, lo, loc_rings)
                if not (in_arm or in_aze or in_loc):
                    continue
                reg = "aze"
            cells[(q, r)] = {
                "q": q,
                "r": r,
                "lat": round(la, 4),
                "lon": round(lo, 4),
                "verts": hex_vertices(la, lo),
                "region": reg,
                "de_jure": "ARM" if reg == "armenia" else "AZE",
                "terrain": terrain_of(q, r, la, lo, reg),
                "nk_oblast": (q, r) in NK_OBLAST_HEXES or (reg == "arm_zone" and pip_multi(la, lo, nk_rings)),
            }
    return cells


def main():
    geo = json.loads(GEO_BORDERS_PATH.read_text(encoding="utf-8"))
    cells = build_grid(geo)

    # initial control: ARM controls Armenia + 1994-2020 arm_zone; AZE controls Azerbaijan proper + Nakhchivan
    for c in cells.values():
        c["owner"] = "ARM" if c["region"] in ("armenia", "arm_zone") else "AZE"

    # assign named places
    for q, r, pid, na, nz, kind, val, subs in HEX_PLACES:
        if (q, r) not in cells:
            continue
        c = cells[(q, r)]
        c.update({
            "place": pid,
            "name_arm": na,
            "name_aze": nz,
            "place_kind": kind,
            "place_value": val,
            "sub_places": subs,
        })

    # build road links
    road_links = set()
    for name, seq in ROAD_PATHS.items():
        for h in seq:
            if h in cells:
                cells[h].setdefault("roads", [])
                if name not in cells[h]["roads"]:
                    cells[h]["roads"].append(name)
        for a, b in zip(seq, seq[1:]):
            if a in cells and b in cells and b in neighbors(*a):
                road_links.add(tuple(sorted([a, b])))

    # fortifications: Ohanyan line on eastern/northern contact-line hexes, lighter on Aras valley open plain
    for (q, r), c in cells.items():
        c["front"] = any(n in cells and cells[n]["owner"] != c["owner"] for n in neighbors(q, r))

    FORT_BY_PLACE = {
        "aghdam": 0.92,       # Ohanyan line central sector (Aghdam / Martuni)
        "fuzuli": 0.85,       # Ohanyan line south-east sector
        "martakert": 0.85,    # North-east fortified sector
        "sugovushan": 0.88,   # Talysh / Sugovushan mountain positions
        "kalbajar": 0.82,     # Murovdag / Omar Pass high-altitude positions
        "jabrayil": 0.45,     # Aras valley plain (weakest point of the line, where AZE broke through)
        "hadrut": 0.55,       # Second-echelon wooded hills
        "zangilan": 0.35,     # Rear Aras valley
        "qubadli": 0.42,      # Vorotan valley
        "shusha": 0.78,       # Natural cliff fortress
        "lachin": 0.55,       # Corridor gorge
        "stepanakert": 0.45,  # Capital
    }
    for (q, r), c in cells.items():
        if c.get("place") in FORT_BY_PLACE:
            c["fort"] = FORT_BY_PLACE[c["place"]]
        elif c["owner"] == "AZE" and c["front"]:
            c["fort"] = 0.45
        elif c["region"] == "armenia" and c["front"]:
            c["fort"] = 0.55
        elif c["region"] == "nakhchivan":
            c["fort"] = 0.60
        else:
            c["fort"] = 0.15

    sources = {s: [] for s in SUPPLY_SOURCES}
    for s, lst in SUPPLY_SOURCES.items():
        for q, r, w in lst:
            if (q, r) in cells:
                sources[s].append({"q": q, "r": r, "w": w})

    # --- order of battle / templates / inventory ---
    s10 = yaml.safe_load((ROOT / "data/scenarios/nk_2010/scenario.yaml").read_text(encoding="utf-8"))
    s20 = yaml.safe_load((ROOT / "data/scenarios/nk_2020/scenario.yaml").read_text(encoding="utf-8"))
    oob = {}
    for side in ("ARM", "AZE"):
        base = {f["id"]: json.loads(json.dumps(f, default=str)) for f in s10["oob"][side]}
        for ov in s20["oob"][side].get("overrides", []):
            f = base.get(ov["id"])
            if not f:
                continue
            for k, v in ov.items():
                if k in ("id", "add_direct", "add_direct_note", "note"):
                    continue
                f[k] = v
            if "add_direct" in ov:
                f.setdefault("direct", []).extend(ov["add_direct"])
        oob[side] = list(base.values())

    import importlib.util
    spec = importlib.util.spec_from_file_location("bvb", ROOT / "tools" / "build_v8_web_bundle.py")
    bvb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bvb)
    NAMES = dict(bvb.FALLBACK_TEMPLATE_NAMES)
    NAMES.update({
        "bn_hq_sq": "营部",
        "bn_support_sq": "营保障排",
        "mrl_lr_bn": "300mm 远程火箭炮营",
        "tbm_bn": "战术导弹营",
        "loitering_bn": "巡飞弹营",
        "loitering_btry": "无人机/巡飞弹连",
    })
    templates = {}
    for fn in ("arm_sov_legacy.yaml", "aze_sov_legacy.yaml"):
        for t in yaml.safe_load((ROOT / "data/templates" / fn).read_text(encoding="utf-8"))["templates"]:
            short = t["id"].split("_", 1)[1] if "_" in t["id"] else t["id"]
            if not t.get("name") and short in NAMES:
                t["name"] = NAMES[short].split(" (")[0]
            templates[t["id"]] = {
                k: t.get(k)
                for k in (
                    "id", "name", "level", "role", "branch", "granularity",
                    "personnel", "slots", "slots_unassigned", "children",
                    "default_bindings", "echelon_label",
                )
                if t.get(k) is not None
            }

    models = {}
    for p in sorted((ROOT / "data/equipment").glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        for key in ("models", "equipment", "weapons", "munitions"):
            for m in d.get(key) or []:
                if isinstance(m, dict) and "id" in m:
                    models[m["id"]] = {"name": m.get("name", m["id"]), "category": m.get("category")}

    inventory = {
        s: {k: v for k, v in s20["inventory"][s].items() if not (k.startswith("_") and not k.startswith("_nk_"))}
        for s in ("ARM", "AZE")
    }
    autofill = {
        s: {
            "categories": s20["inventory"][s].get("_auto_fill_categories", []),
            "share": s20["inventory"][s].get("_auto_fill_share", 0.9),
        }
        for s in ("ARM", "AZE")
    }

    calib = yaml.safe_load((ROOT / "data/scenarios/nk_2020/calibration.yaml").read_text(encoding="utf-8"))

    data = {
        "generated": "tools/sim/build_sim_data.py",
        "grid": {
            "hex_w_km": HEX_W,
            "hex_edge_km": round(HEX_R_KM, 2),
            "hex_area_km2": round(math.sqrt(3) / 2 * HEX_W * HEX_W, 1),
            "h3_equivalent": "H3 Resolution 4 (42 km flat-to-flat, 72 theater hexes)",
            "lat_n": round(LAT_N, 4),
            "lon_w": round(LON_W, 4),
            "km_lat": KM_LAT,
            "km_lon": round(KM_LON, 3),
            "approx_note": "基于 H3 r4 尺度（对边 42 km，全战区 72 格）与 Natural Earth 10m 真实国界 / 1994 接触线生成；支持叠加真实地形与卫星底图。",
        },
        "hexes": sorted(cells.values(), key=lambda c: (c["r"], c["q"])),
        "road_links": [[a[0], a[1], b[0], b[1]] for a, b in sorted(road_links)],
        "supply_sources": sources,
        "geo_borders": geo,
        "oob": oob,
        "templates": templates,
        "models": models,
        "inventory": inventory,
        "autofill": autofill,
        "calibration": calib,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Auto-generated by tools/sim/build_sim_data.py — do not edit\nvar MOD_SIM_DATA = "
        + json.dumps(data, ensure_ascii=False, default=str)
        + ";\n",
        encoding="utf-8",
    )
    regs = {}
    for c in cells.values():
        regs[c["region"]] = regs.get(c["region"], 0) + 1
    loc_edges = 0
    for (q, r), c in cells.items():
        if c["region"] == "arm_zone":
            for n in neighbors(q, r):
                if n in cells and cells[n]["region"] == "aze":
                    loc_edges += 1
    named = [c.get("place") for c in cells.values() if c.get("place")]
    print(
        f"hexes={len(cells)} regions={regs} de_jure_ARM={regs.get('armenia',0)} "
        f"de_jure_AZE={len(cells)-regs.get('armenia',0)} loc_edges={loc_edges} "
        f"named={len(named)} road_links={len(road_links)} -> {OUT} ({OUT.stat().st_size} B)"
    )


if __name__ == "__main__":
    main()
