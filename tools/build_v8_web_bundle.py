#!/usr/bin/env python3
"""
Builds `web/v8_playtest/data_bundle.js` from the repository's YAML scenario/equipment files
and `tools/validation/v1_results.json` .. `v7_results.json`.
"""

from __future__ import annotations
import json
from pathlib import Path
import yaml


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "v8_playtest"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load validation results V1..V7
    val_results = {}
    for k in ("v1", "v2", "v3", "v4", "v5", "v6", "v7"):
        p = ROOT / "tools" / "validation" / f"{k}_results.json"
        if p.exists():
            val_results[k] = json.loads(p.read_text(encoding="utf-8"))

    # Load scenario calibration & nodes & presentation
    calib = yaml.safe_load((ROOT / "data/scenarios/nk_2020/calibration.yaml").read_text(encoding="utf-8"))
    nodes_doc = yaml.safe_load((ROOT / "data/scenarios/nk_common/logistics_nodes.yaml").read_text(encoding="utf-8"))
    pres_doc = yaml.safe_load((ROOT / "data/scenarios/nk_common/presentation.yaml").read_text(encoding="utf-8"))
    s2020_doc = yaml.safe_load((ROOT / "data/scenarios/nk_2020/scenario.yaml").read_text(encoding="utf-8"))

    # Construct the interactive Nagorno-Karabakh Theater Hex & Operational Sector Map (~28 key operational hexes
    # representing the 65-hex theater across Armenia Proper, Artsakh/NK Core, 7 Surrounding Districts,
    # Nakhchivan, and Azerbaijan Proper)
    theater_hexes = [
        # Armenia Proper (West & North-West)
        {"id": "hex_yerevan", "q": 0, "r": 2, "owner": "ARM", "de_jure": "ARM", "terrain": "Mixed",
         "name_arm": "埃里温 (Yerevan)", "name_aze": "埃里温 (İrəvan)", "fort": 0.45, "depot": "arm_depot_yerevan", "airbase": "arm_airbase_erebuni", "key_value": 10},
        {"id": "hex_gyumri", "q": -1, "r": 1, "owner": "ARM", "de_jure": "ARM", "terrain": "Mixed",
         "name_arm": "久姆里 (Gyumri)", "name_aze": "久姆里 (Gümrü)", "fort": 0.40, "airbase": "arm_airbase_gyumri", "key_value": 5},
        {"id": "hex_vanadzor", "q": 0, "r": 0, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "瓦纳佐尔 (Vanadzor)", "name_aze": "瓦纳佐尔 (Vanadzor)", "fort": 0.40, "depot": "arm_depot_vanadzor", "key_value": 4},
        {"id": "hex_berd_tavush", "q": 1, "r": 0, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "别尔德/塔武什 (Berd)", "name_aze": "别尔德 (Berd)", "fort": 0.55, "key_value": 4},
        {"id": "hex_vardenis_sotk", "q": 1, "r": 2, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "瓦尔德尼斯/索特克 (Vardenis M11)", "name_aze": "巴萨尔凯查尔/索特克 (Basarkeçər)", "fort": 0.45, "corridor": "m11_north", "key_value": 6},
        {"id": "hex_yeghegnadzor", "q": 0, "r": 3, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "叶海格纳佐尔 (Yeghegnadzor)", "name_aze": "叶海格纳佐尔 (Yeğeqnadzor)", "fort": 0.45, "depot": "arm_depot_yeghegnadzor", "key_value": 4},
        {"id": "hex_goris", "q": 1, "r": 4, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "戈里斯 (Goris M12端)", "name_aze": "戈里斯 (Gorus)", "fort": 0.50, "depot": "arm_depot_goris", "corridor": "m12_lachin", "key_value": 8},
        {"id": "hex_meghri_agarak", "q": 1, "r": 6, "owner": "ARM", "de_jure": "ARM", "terrain": "Mountain",
         "name_arm": "梅格里/阿加拉克口岸 (Meghri)", "name_aze": "梅格里 (Meğri)", "fort": 0.45, "gateway": "arm_gateway_agarak", "key_value": 6},

        # Nakhchivan Autonomous Republic (AZE Exclave, South-West)
        {"id": "hex_sadarak", "q": -1, "r": 3, "owner": "AZE", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "萨达拉克 (Sadarak)", "name_aze": "萨达拉克口岸 (Sədərək)", "fort": 0.55, "gateway": "aze_gateway_sadarak", "key_value": 5},
        {"id": "hex_nakhchivan", "q": -1, "r": 4, "owner": "AZE", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "纳希切万 (Nakhchivan)", "name_aze": "纳希切万 (Naxçıvan)", "fort": 0.60, "depot": "aze_depot_nakhchivan", "airbase": "aze_airbase_nakhchivan", "key_value": 7},

        # Nagorno-Karabakh (Artsakh) & 7 Surrounding Districts (1994-2020 ARM-controlled core = 10 composite hexes representing 26 H3 tiles)
        {"id": "hex_kalbajar", "q": 2, "r": 2, "owner": "ARM", "de_jure": "AZE", "terrain": "Mountain",
         "name_arm": "卡尔瓦恰尔 (Karvachar M11)", "name_aze": "卡尔巴贾尔 (Kəlbəcər)", "fort": 0.65, "corridor": "m11_north", "is_nk_core": True, "handover_nov10": True, "key_value": 7},
        {"id": "hex_martakert_talysh", "q": 3, "r": 2, "owner": "ARM", "de_jure": "AZE", "terrain": "Mountain",
         "name_arm": "马尔达凯特/塔利什 (Martakert)", "name_aze": "阿格达拉/苏古沃尚 (Ağdərə/Suqovuşan)", "fort": 0.78, "depot": "arm_depot_martakert", "is_nk_core": True, "sector": "north", "key_value": 8},
        {"id": "hex_lachin_corridor", "q": 2, "r": 4, "owner": "ARM", "de_jure": "AZE", "terrain": "Mountain",
         "name_arm": "ベル佐尔/拉钦走廊 (Berdzor M12)", "name_aze": "拉钦走廊 (Laçın dəhlizi)", "fort": 0.55, "corridor": "m12_lachin", "is_nk_core": True, "key_value": 10},
        {"id": "hex_stepanakert", "q": 3, "r": 3, "owner": "ARM", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "斯捷潘纳克特 (Stepanakert)", "name_aze": "汉肯德 (Xankəndi)", "fort": 0.65, "depot": "arm_depot_stepanakert", "is_nk_core": True, "key_value": 10},
        {"id": "hex_shusha", "q": 3, "r": 4, "owner": "ARM", "de_jure": "AZE", "terrain": "Forest",
         "name_arm": "舒希 (Shushi - 走廊咽喉)", "name_aze": "舒沙 (Şuşa - 战略高地)", "fort": 0.62, "corridor": "m12_lachin", "is_nk_core": True, "sector": "shusha", "key_value": 10},
        {"id": "hex_aghdam_martuni", "q": 4, "r": 3, "owner": "ARM", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "阿克纳/马尔图尼筑垒区 (Martuni)", "name_aze": "阿格达姆/霍贾文德 (Ağdam/Xocavənd)", "fort": 0.82, "is_nk_core": True, "handover_nov10": True, "sector": "east", "key_value": 8},
        {"id": "hex_hadrut", "q": 4, "r": 4, "owner": "ARM", "de_jure": "AZE", "terrain": "Mountain",
         "name_arm": "哈德鲁特 (Hadrut)", "name_aze": "哈德鲁特 (Hadrut)", "fort": 0.48, "depot": "arm_depot_hadrut", "is_nk_core": True, "sector": "south_center", "key_value": 8},
        {"id": "hex_fuzuli", "q": 5, "r": 4, "owner": "ARM", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "瓦兰达/菲祖利接触线 (Varanda)", "name_aze": "菲祖利 (Füzuli)", "fort": 0.58, "is_nk_core": True, "sector": "south", "key_value": 8},
        {"id": "hex_jabrayil", "q": 4, "r": 5, "owner": "ARM", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "杰拉坎/杰布拉伊尔河谷 (Jrakan)", "name_aze": "杰布拉伊尔 (Cəbrayıl)", "fort": 0.35, "is_nk_core": True, "sector": "south", "key_value": 7},
        {"id": "hex_qubadli_zangilan", "q": 3, "r": 5, "owner": "ARM", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "萨纳萨尔/科夫萨坎 (Sanasar/Kovsakan)", "name_aze": "库巴德利/赞格兰 (Qubadlı/Zəngilan)", "fort": 0.25, "is_nk_core": True, "sector": "south_west", "key_value": 7},

        # Azerbaijan Proper (North, East & South-East Staging Area)
        {"id": "hex_tovuz_qazax", "q": 2, "r": 0, "owner": "AZE", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "托武兹/加扎赫 (Tovuz)", "name_aze": "托武兹/红桥口岸 (Tovuz)", "fort": 0.50, "gateway": "aze_gateway_red_bridge", "key_value": 6},
        {"id": "hex_ganja", "q": 3, "r": 1, "owner": "AZE", "de_jure": "AZE", "terrain": "Mixed",
         "name_arm": "甘贾 (Ganja)", "name_aze": "甘贾枢纽 (Gəncə)", "fort": 0.50, "depot": "aze_depot_ganja", "airbase": "aze_airbase_ganja", "key_value": 8},
        {"id": "hex_yevlakh_mingachevir", "q": 4, "r": 1, "owner": "AZE", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "叶夫拉赫/明盖恰乌尔 (Yevlakh)", "name_aze": "叶夫拉赫铁路枢纽 (Yevlax)", "fort": 0.45, "depot": "aze_depot_yevlakh", "key_value": 8},
        {"id": "hex_barda_tartar", "q": 4, "r": 2, "owner": "AZE", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "巴尔达/塔尔塔尔 (Barda/Tartar)", "name_aze": "巴尔达/塔尔塔尔 (Bərdə/Tərtər)", "fort": 0.55, "depot": "aze_depot_barda", "key_value": 7},
        {"id": "hex_beylagan_horadiz", "q": 5, "r": 3, "owner": "AZE", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "贝拉甘/霍拉迪兹 (Horadiz)", "name_aze": "贝拉甘/霍拉迪兹南线基地 (Beyləqan/Horadiz)", "fort": 0.55, "depot": "aze_depot_beylagan", "key_value": 8},
        {"id": "hex_kurdamir", "q": 5, "r": 2, "owner": "AZE", "de_jure": "AZE", "terrain": "Open",
         "name_arm": "库尔达米尔空军基地 (Kurdamir)", "name_aze": "库尔达米尔空军基地 (Kürdəmir)", "fort": 0.45, "airbase": "aze_airbase_kurdamir", "key_value": 6},
        {"id": "hex_baku", "q": 6, "r": 2, "owner": "AZE", "de_jure": "AZE", "terrain": "Urban",
         "name_arm": "巴库 (Baku)", "name_aze": "巴库首都区 (Bakı)", "fort": 0.60, "depot": "aze_depot_baku", "airbase": "aze_airbase_nasosnaya", "key_value": 10},
    ]

    bundle = {
        "generated_at": "2026-10-18",
        "calibration_2020": calib,
        "logistics_nodes": nodes_doc["nodes"],
        "opening_stocks": nodes_doc["opening_stocks"],
        "presentation": pres_doc,
        "inventory_2020": s2020_doc["inventory"],
        "theater_hexes": theater_hexes,
        "validation_results": val_results,
    }

    js_content = "// Auto-generated by tools/build_v8_web_bundle.py — DO NOT EDIT MANUALLY\n"
    js_content += "window.MOD_DATA_BUNDLE = " + json.dumps(bundle, indent=2, ensure_ascii=False, default=str) + ";\n"

    out_file = OUT_DIR / "data_bundle.js"
    out_file.write_text(js_content, encoding="utf-8")
    print(f"Wrote {out_file} ({out_file.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
