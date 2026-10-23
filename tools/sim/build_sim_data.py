#!/usr/bin/env python3
"""
Builds web/commander/sim_data.js for the commander-mode operational simulation (P1).

Contents
  - hex grid over the Nagorno-Karabakh theater (real lat/lon, ~12 km hexes, pointy-top, odd-r offset)
  - per-hex region (armenia / arm_zone / aze / off-map), terrain, initial control, fortification, roads, names
  - order of battle (nk_2010 base + nk_2020 overrides), templates, model->category map, inventories
  - calibration bands (data/scenarios/nk_2020/calibration.yaml)

Geography (borders, contact line, terrain) is hand-approximated from public maps; there is no DEM in the repo.
Everything approximate is marked `approx` in the output so the UI can say so.
"""
from __future__ import annotations
import json
import math
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "commander" / "sim_data.js"

# ---------------------------------------------------------------- grid ----
LAT_N, LAT_S = 40.78, 38.85
LON_W, LON_E = 45.55, 47.80
KM_LAT = 111.0
KM_LON = 111.0 * math.cos(math.radians(39.8))
HEX_W = 12.0                      # km, centre-to-centre along a row
HEX_H = HEX_W / (math.sqrt(3) / 2)
ROW_PITCH = 0.75 * HEX_H


def hex_center(q, r):
    x = q * HEX_W + (HEX_W / 2 if r % 2 else 0)
    y = r * ROW_PITCH
    return LAT_N - y / KM_LAT, LON_W + x / KM_LON


def latlon_to_hex(lat, lon, valid):
    y = (LAT_N - lat) * KM_LAT
    x = (lon - LON_W) * KM_LON
    r0 = round(y / ROW_PITCH)
    best, bd = None, 1e9
    for r in range(r0 - 1, r0 + 2):
        q0 = round((x - (HEX_W / 2 if r % 2 else 0)) / HEX_W)
        for q in range(q0 - 1, q0 + 2):
            if (q, r) not in valid:
                continue
            la, lo = hex_center(q, r)
            d = ((la - lat) * KM_LAT) ** 2 + ((lo - lon) * KM_LON) ** 2
            if d < bd:
                best, bd = (q, r), d
    return best


def pip(lat, lon, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a[0] > lat) != (b[0] > lat):
            x = a[1] + (lat - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
            if lon < x:
                inside = not inside
    return inside


# (lat, lon) polygons — approximate
ARMENIA = [(40.80, 45.55), (40.80, 45.62), (40.55, 45.68), (40.35, 45.85), (40.20, 46.00), (39.90, 46.10),
           (39.70, 46.30), (39.55, 46.42), (39.35, 46.45), (39.15, 46.48), (38.95, 46.52), (38.85, 46.52),
           (38.85, 46.13), (39.05, 46.00), (39.30, 45.90), (39.55, 45.78), (39.72, 45.55)]
NAKHCHIVAN = [(39.72, 45.00), (39.72, 45.55), (39.55, 45.78), (39.30, 45.90), (39.05, 46.00), (38.88, 46.13), (38.50, 46.13), (38.50, 45.00)]
IRAN = [(38.85, 46.52), (39.02, 46.75), (39.15, 46.95), (39.28, 47.12), (39.38, 47.32), (39.42, 47.55), (39.45, 48.50), (38.50, 48.50), (38.50, 46.52)]
ARM_ZONE = [(40.35, 45.85), (40.33, 46.30), (40.34, 46.60), (40.31, 46.80), (40.25, 46.88), (40.18, 46.95), (40.05, 47.00),
            (39.85, 47.12), (39.70, 47.17), (39.58, 47.22), (39.45, 47.30), (39.38, 47.32), (39.28, 47.12),
            (39.15, 46.95), (39.02, 46.75), (38.85, 46.52), (38.95, 46.52), (39.15, 46.48), (39.35, 46.45),
            (39.55, 46.42), (39.70, 46.30), (39.90, 46.10), (40.20, 46.00)]
NK_OBLAST = [(40.28, 46.55), (40.27, 46.85), (40.18, 46.95), (40.05, 47.00), (39.85, 47.12), (39.62, 47.10),
             (39.42, 47.05), (39.45, 46.85), (39.62, 46.68), (39.80, 46.60), (40.05, 46.45)]


def region_of(lat, lon):
    if pip(lat, lon, IRAN):
        return "offmap"
    if pip(lat, lon, NAKHCHIVAN):
        return "offmap"
    if pip(lat, lon, ARM_ZONE):
        return "arm_zone"
    if pip(lat, lon, ARMENIA):
        return "armenia"
    return "aze"


def terrain_of(lat, lon, region):
    if region == "armenia":
        return "Mountain"
    if region == "arm_zone":
        if 40.22 <= lat <= 40.40 and lon < 46.70:
            return "Mountain"           # Murovdag ridge
        if lon < 46.55:
            return "Mountain"           # Kalbajar / Lachin / Qubadli highlands
        if lat < 39.42 and lon > 46.75:
            return "Open"               # Aras valley (Jabrayil plain)
        if lat < 39.30:
            return "Mixed"              # Zangilan lowland
        if lon < 46.98:
            return "Forest"             # NK uplands (Shusha, Hadrut, Martakert)
        return "Mixed"                  # eastern foothills (Aghdam, Fuzuli, Martuni)
    # Azerbaijan proper
    if lat > 40.42 and lon < 46.35:
        return "Mountain"               # Gadabay / Dashkasan
    if 40.25 <= lat <= 40.45 and lon < 46.70:
        return "Mountain"               # Murovdag north slope
    if lon < 46.70 and lat > 40.30:
        return "Mixed"                  # Ganja foothills
    return "Open"                       # Kura-Aras lowland


PLACES = [  # (id, lat, lon, name_arm, name_aze, kind, value)
    ("stepanakert", 39.8153, 46.7519, "斯捷潘纳克特", "汉肯德", "city", 9),
    ("shusha", 39.7583, 46.7489, "舒希", "舒沙", "city", 10),
    ("martakert", 40.2153, 46.8106, "马尔塔克特", "阿格德雷", "town", 5),
    ("hadrut", 39.5200, 47.0300, "哈德鲁特", "哈德鲁特", "town", 6),
    ("martuni", 39.7950, 47.1150, "马尔图尼", "霍贾文德", "town", 4),
    ("askeran", 39.9400, 46.8300, "阿斯克兰", "阿斯格兰", "town", 3),
    ("aghdam", 39.9911, 46.9297, "阿克纳", "阿格达姆", "town", 4),
    ("fuzuli", 39.6003, 47.1431, "瓦兰达", "菲祖利", "town", 5),
    ("jabrayil", 39.3992, 47.0264, "杰拉坎", "杰布拉伊尔", "town", 5),
    ("zangilan", 39.0856, 46.6525, "科夫萨坎", "赞格兰", "town", 4),
    ("qubadli", 39.3444, 46.5797, "萨纳萨尔", "库巴德利", "town", 4),
    ("lachin", 39.6425, 46.5469, "别尔佐尔", "拉钦", "town", 9),
    ("kalbajar", 40.1053, 46.0386, "卡尔瓦恰尔", "卡尔巴贾尔", "town", 4),
    ("talysh", 40.2700, 46.7300, "塔利什", "塔利什", "village", 3),
    ("sugovushan", 40.2900, 46.6600, "马达吉斯", "苏古沃尚", "village", 3),
    ("goris", 39.5111, 46.3383, "戈里斯", "戈里斯", "town", 6),
    ("kapan", 39.2075, 46.4058, "卡潘", "卡潘", "town", 4),
    ("sisian", 39.5208, 46.0322, "西西安", "西西安", "town", 3),
    ("vardenis", 40.1833, 45.7300, "瓦尔德尼斯", "瓦尔德尼斯", "town", 4),
    ("sotk", 40.2100, 45.9400, "索特克", "索特克", "village", 3),
    ("meghri", 38.9000, 46.2400, "梅格里", "梅格里", "town", 3),
    ("tartar", 40.3417, 46.9311, "塔尔塔尔", "塔尔塔尔", "town", 4),
    ("barda", 40.3744, 47.1267, "巴尔达", "巴尔达", "town", 5),
    ("ganja", 40.6828, 46.3606, "甘贾", "甘贾", "city", 6),
    ("goranboy", 40.6100, 46.7900, "戈兰博伊", "戈兰博伊", "town", 3),
    ("yevlakh", 40.6200, 47.1500, "叶夫拉赫", "叶夫拉赫", "town", 5),
    ("aghjabadi", 40.0500, 47.4600, "阿格贾巴迪", "阿格贾巴迪", "town", 3),
    ("beylagan", 39.7756, 47.6186, "贝拉甘", "贝拉甘", "town", 4),
    ("horadiz", 39.4481, 47.3361, "霍拉迪兹", "霍拉迪兹", "town", 5),
    ("gadabay", 40.5700, 45.8200, "格达贝", "格达贝", "town", 3),
    ("naftalan", 40.5100, 46.8200, "纳夫塔兰", "纳夫塔兰", "town", 2),
]

ROADS = {  # name -> list of (lat, lon); used for movement & supply
    "M12_lachin": [(39.52, 45.55), (39.52, 46.03), (39.51, 46.34), (39.55, 46.43), (39.64, 46.55), (39.70, 46.66), (39.76, 46.75), (39.82, 46.75)],
    "M11_vardenis": [(40.18, 45.55), (40.18, 45.73), (40.21, 45.94), (40.10, 46.04), (40.15, 46.40), (40.22, 46.81)],
    "nk_ring": [(40.22, 46.81), (39.94, 46.83), (39.82, 46.75), (39.80, 46.95), (39.80, 47.12), (39.60, 47.14), (39.52, 47.03), (39.70, 46.85), (39.76, 46.75)],
    "aghdam_road": [(39.82, 46.75), (39.94, 46.83), (39.99, 46.93), (40.37, 47.13)],
    "aras_valley": [(39.45, 47.34), (39.40, 47.03), (39.25, 46.85), (39.09, 46.65), (39.34, 46.58), (39.64, 46.55)],
    "syunik": [(39.51, 46.34), (39.21, 46.41), (38.90, 46.24)],
    "aze_rear": [(40.68, 46.36), (40.62, 47.15), (40.37, 47.13), (40.05, 47.46), (39.78, 47.62), (39.45, 47.34)],
    "aze_east_exit": [(40.62, 47.15), (40.62, 47.80)],
    "aze_south_exit": [(39.78, 47.62), (39.80, 47.80)],
    "tartar_link": [(40.34, 46.93), (40.37, 47.13)],
    "ganja_tartar": [(40.68, 46.36), (40.61, 46.79), (40.34, 46.93)],
}

SUPPLY_SOURCES = {  # side -> list of (lat, lon, weight)
    "ARM": [(39.52, 45.56, 1.0), (40.18, 45.56, 0.35)],          # Yerevan via Sisian (M12) / via Vardenis (M11), off-map west
    "AZE": [(40.62, 47.79, 1.0), (39.80, 47.79, 0.8), (40.68, 46.36, 0.6)],  # Baku direction + Ganja
}


def build_grid():
    cells = {}
    r = 0
    while True:
        lat, _ = hex_center(0, r)
        if lat < LAT_S - 0.03:
            break
        q = 0
        while True:
            la, lo = hex_center(q, r)
            if lo > LON_E + 0.03:
                break
            reg = region_of(la, lo)
            if reg != "offmap":
                cells[(q, r)] = {"q": q, "r": r, "lat": round(la, 4), "lon": round(lo, 4), "region": reg,
                                 "terrain": terrain_of(la, lo, reg),
                                 "nk_oblast": reg == "arm_zone" and pip(la, lo, NK_OBLAST)}
            q += 1
        r += 1
    return cells


def neighbors(q, r):
    odd = r % 2 == 1
    d = [(1, 0), (1, 1), (0, 1), (-1, 0), (0, -1), (1, -1)] if odd else [(1, 0), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1)]
    return [(q + a, r + b) for a, b in d]


def main():
    cells = build_grid()
    valid = set(cells)

    # initial control
    for c in cells.values():
        c["owner"] = "AZE" if c["region"] == "aze" else "ARM"

    # names (nearest place to each hex; keep the highest-value place per hex)
    for pid, la, lo, na, nz, kind, val in PLACES:
        h = latlon_to_hex(la, lo, valid)
        if not h:
            continue
        c = cells[h]
        if c.get("place_value", -1) < val:
            c.update({"place": pid, "name_arm": na, "name_aze": nz, "place_kind": kind, "place_value": val})
            if kind == "city" and pid != "shusha":
                c["terrain"] = "Urban"

    # roads: sample every ~2 km along polylines, mark hexes and road links
    road_links = set()
    for name, pts in ROADS.items():
        seq = []
        for (a, b) in zip(pts, pts[1:]):
            dist = math.hypot((b[0] - a[0]) * KM_LAT, (b[1] - a[1]) * KM_LON)
            n = max(2, int(dist / 2))
            for i in range(n + 1):
                t = i / n
                h = latlon_to_hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, valid)
                if h and (not seq or seq[-1] != h):
                    seq.append(h)
        for h in seq:
            cells[h].setdefault("roads", [])
            if name not in cells[h]["roads"]:
                cells[h]["roads"].append(name)
        for a, b in zip(seq, seq[1:]):
            if b in neighbors(*a):
                road_links.add(tuple(sorted([a, b])))

    # fortification: ARM contact-line hexes high, second line medium; AZE contact line medium
    for (q, r), c in cells.items():
        enemy_adj = any(n in cells and cells[n]["owner"] != c["owner"] for n in neighbors(q, r))
        c["front"] = enemy_adj
    for (q, r), c in cells.items():
        if c["owner"] == "ARM" and c["region"] == "arm_zone":
            if c["front"] and not any(n in cells and cells[n]["region"] == "armenia" for n in neighbors(q, r)):
                # Aras valley plain was the weakest part of the line; eastern fortified districts the strongest
                c["fort"] = 0.50 if c["terrain"] == "Open" else 0.80
            elif any(n in cells and cells[n].get("front") and cells[n]["owner"] == "ARM" and cells[n]["region"] == "arm_zone" for n in neighbors(q, r)):
                c["fort"] = 0.35
            else:
                c["fort"] = 0.15
        elif c["owner"] == "AZE" and c["front"]:
            c["fort"] = 0.40
        else:
            c["fort"] = 0.10

    for pid, f in (("fuzuli", 0.86), ("martuni", 0.92), ("aghdam", 0.92), ("talysh", 0.92)):
        for c in cells.values():
            if c.get("place") == pid:
                c["fort"] = f
    sources = {s: [] for s in SUPPLY_SOURCES}
    for s, lst in SUPPLY_SOURCES.items():
        for la, lo, w in lst:
            h = latlon_to_hex(la, lo, valid)
            if h:
                sources[s].append({"q": h[0], "r": h[1], "w": w})

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
    bvb = importlib.util.module_from_spec(spec); spec.loader.exec_module(bvb)
    NAMES = dict(bvb.FALLBACK_TEMPLATE_NAMES)
    NAMES.update({"bn_hq_sq": "营部", "bn_support_sq": "营保障排", "mrl_lr_bn": "300mm 远程火箭炮营", "tbm_bn": "战术导弹营",
                  "loitering_bn": "巡飞弹营", "loitering_btry": "无人机/巡飞弹连"})
    templates = {}
    for fn in ("arm_sov_legacy.yaml", "aze_sov_legacy.yaml"):
        for t in yaml.safe_load((ROOT / "data/templates" / fn).read_text(encoding="utf-8"))["templates"]:
            short = t["id"].split("_", 1)[1] if "_" in t["id"] else t["id"]
            if not t.get("name") and short in NAMES:
                t["name"] = NAMES[short].split(" (")[0]
            templates[t["id"]] = {k: t.get(k) for k in ("id", "name", "level", "role", "branch", "granularity",
                                                        "personnel", "slots", "slots_unassigned", "children",
                                                        "default_bindings", "echelon_label") if t.get(k) is not None}

    models = {}
    for p in sorted((ROOT / "data/equipment").glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        for key in ("models", "equipment", "weapons", "munitions"):
            for m in d.get(key) or []:
                if isinstance(m, dict) and "id" in m:
                    models[m["id"]] = {"name": m.get("name", m["id"]), "category": m.get("category")}

    inventory = {s: {k: v for k, v in s20["inventory"][s].items() if not (k.startswith("_") and not k.startswith("_nk_"))}
                 for s in ("ARM", "AZE")}
    autofill = {s: {"categories": s20["inventory"][s].get("_auto_fill_categories", []),
                    "share": s20["inventory"][s].get("_auto_fill_share", 0.9)} for s in ("ARM", "AZE")}

    calib = yaml.safe_load((ROOT / "data/scenarios/nk_2020/calibration.yaml").read_text(encoding="utf-8"))

    data = {
        "generated": "tools/sim/build_sim_data.py",
        "grid": {"hex_w_km": HEX_W, "lat_n": LAT_N, "lon_w": LON_W, "km_lat": KM_LAT, "km_lon": round(KM_LON, 3),
                 "approx_note": "国界、接触线与地形为依据公开地图的人工近似（仓库内无高程数据）"},
        "hexes": sorted(cells.values(), key=lambda c: (c["r"], c["q"])),
        "road_links": [[a[0], a[1], b[0], b[1]] for a, b in sorted(road_links)],
        "supply_sources": sources,
        "polygons": {"armenia": ARMENIA, "arm_zone": ARM_ZONE, "nk_oblast": NK_OBLAST, "iran": IRAN, "nakhchivan": NAKHCHIVAN},
        "oob": oob,
        "templates": templates,
        "models": models,
        "inventory": inventory,
        "autofill": autofill,
        "calibration": calib,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// Auto-generated by tools/sim/build_sim_data.py — do not edit\nvar MOD_SIM_DATA = "
                   + json.dumps(data, ensure_ascii=False, default=str) + ";\n", encoding="utf-8")
    regs = {}
    for c in cells.values():
        regs[c["region"]] = regs.get(c["region"], 0) + 1
    named = [c.get("place") for c in cells.values() if c.get("place")]
    print(f"hexes={len(cells)} regions={regs} named={len(named)} road_links={len(road_links)} -> {OUT} ({OUT.stat().st_size} B)")
    lost = [p[0] for p in PLACES if latlon_to_hex(p[1], p[2], valid) and cells[latlon_to_hex(p[1], p[2], valid)].get("place") != p[0]]
    print("places merged into another hex:", lost)


if __name__ == "__main__":
    main()
