#!/usr/bin/env python3
"""
P1 calibration & sensitivity harness for the commander-mode simulation.

Runs web/commander/sim_core.js headless in JavaScriptCore (same code as the browser) for N seeds per scenario,
compares the historical scenario against data/scenarios/nk_2020/calibration.yaml bands, and runs sensitivity
scenarios to check that force structure and command decisions actually change outcomes.

usage: python3 tools/sim/calibrate.py [--n 200] [--only historical] [--json out.json]
"""
from __future__ import annotations
import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"

SCENARIOS = {
    # Historical calibration: historical force, ARM AI commander playing the historical way (AD always on, early
    # armoured counter-attacks, continuous daylight convoys), AZE tier H.
    "historical": {"opts": {"armAi": "historical", "aiTier": "H", "convoy": "continuous"}},
    # Same force, competent ARM command (AD ambush posture, reserves to the weakest hex, night convoys).
    "competent_command": {"opts": {"armAi": "competent", "aiTier": "H", "convoy": "night_only", "armAdPosture": "ambush"}},
    # Improved 2010-2020 force (prototype of P3 builds): +16 Tor, +12 medium SAM, deeper fortification.
    "improved_force_hist_command": {"opts": {"armAi": "historical", "aiTier": "H", "convoy": "continuous",
                                             "inventoryDelta": {"ARM": {"tor": 16, "sam_medium": 12, "atgm_heavy": 120}}, "fortBonus": 0.15}},
    "improved_force_competent": {"opts": {"armAi": "competent", "aiTier": "H", "convoy": "night_only", "armAdPosture": "ambush",
                                          "inventoryDelta": {"ARM": {"tor": 16, "sam_medium": 12, "atgm_heavy": 120}}, "fortBonus": 0.15}},
    "improved_competent_vs_B": {"opts": {"armAi": "competent", "aiTier": "B", "convoy": "night_only", "armAdPosture": "ambush",
                                         "inventoryDelta": {"ARM": {"tor": 16, "sam_medium": 12, "atgm_heavy": 120}}, "fortBonus": 0.15}},
    # Counterfactual: always-silent AD (save radars, let drones roam)
    "silent_ad": {"opts": {"armAi": "competent", "aiTier": "H", "convoy": "night_only", "armAdPosture": "silent"}},
}

HIST_DAYS = {"jabrayil": 8, "fuzuli": 21, "zangilan": 24, "qubadli": 29}


def run(scen, n, seed0=1000):
    p = subprocess.run([JSC, str(ROOT / "tools/sim/batch.js"), "--", str(ROOT), json.dumps(scen), str(n), str(seed0)],
                       capture_output=True, text=True, timeout=3600)
    rows, ms = [], None
    for line in p.stdout.splitlines():
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            print("jsc:", line, file=sys.stderr)
            continue
        if "summary" in d:
            rows.append(d["summary"])
        elif d.get("done"):
            ms = d["ms"]
    if p.returncode != 0 or not rows:
        print(p.stderr[-2000:], file=sys.stderr)
        raise SystemExit(f"jsc failed for {scen}")
    return rows, ms


def med(xs):
    return statistics.median(xs) if xs else float("nan")


def pct(xs, q):
    s = sorted(xs)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]


def outcome_shares(rows):
    out = {k: 0 for k in "BCDE"}
    for r in rows:
        out[r["outcome"]["code"]] += 1
    return {k: round(v / len(rows), 3) for k, v in out.items()}


def calibration_checks(rows, calib):
    eq = calib["equipment_losses_oryx"]
    checks = []

    def band(name, vals, lo, hi, kind="median"):
        v = med(vals)
        checks.append({"metric": name, "value": round(v, 3), "band": [lo, hi], "pass": lo <= v <= hi, "kind": kind,
                       "p10_p90": [round(pct(vals, 0.1), 2), round(pct(vals, 0.9), 2)]})

    days = [r["days"] for r in rows]
    band("持续天数（中位）", days, *calib["duration"]["band_days"]["median"])
    p10, p90 = pct(days, 0.1), pct(days, 0.9)
    lo, hi = calib["duration"]["band_days"]["p10_p90"]
    checks.append({"metric": "持续天数 P10–P90", "value": [p10, p90], "band": [lo, hi], "pass": p10 >= lo and p90 <= hi, "kind": "range"})
    band("亚方阵亡", [r["kia"]["ARM"] for r in rows], *calib["personnel_killed"]["ARM"]["band"])
    band("阿方阵亡", [r["kia"]["AZE"] for r in rows], *calib["personnel_killed"]["AZE"]["band"])
    band("阵亡比 亚/阿", [r["kia"]["ARM"] / max(1, r["kia"]["AZE"]) for r in rows], *calib["personnel_killed"]["ratio_arm_to_aze"]["band"])
    for key, label, cat in [("tanks", "亚方坦克损失", "tanks"), ("ifv", "亚方步战车损失", "ifv"), ("towed", "亚方牵引火炮损失", "towed_artillery"),
                            ("sp", "亚方自行火炮损失", "sp_artillery"), ("mrl", "亚方火箭炮损失", "mrl"), ("sam", "亚方防空系统损失", "sam_systems"),
                            ("trucks", "亚方卡车损失", "trucks_vehicles")]:
        band(label, [r["arm"][key] for r in rows], *eq["ARM"][cat]["band"])
    band("阿方坦克损失", [r["aze"]["tanks"] for r in rows], *eq["AZE"]["tanks"]["band"])
    band("阿方步战车损失", [r["aze"]["ifv"] for r in rows], *eq["AZE"]["ifv"]["band"])
    band("坦克损失比 亚/阿", [r["arm"]["tanks"] / max(1, r["aze"]["tanks"]) for r in rows], *eq["loss_ratio_tanks"]["band"])
    band("战斗失地比例（纳卡核心格）", [r["outcome"]["lostShare"] for r in rows], *calib["territory"]["by_fighting"]["share_of_arm_core_tiles"]["band"])
    band("A+C 线装备损失占比", [r["acShare"] for r in rows], 0.5, 0.9)
    band("前 14 天防空损失占比", [r["day14AdShare"] for r in rows], 0.5, 0.9)
    # milestones within ±15 days
    ok = 0
    for r in rows:
        m = r["milestones"]
        if all(k in m and abs(m[k] - d) <= 15 for k, d in HIST_DAYS.items()):
            ok += 1
    checks.append({"metric": "南线四城易手日期 ±15 天内（种子占比）", "value": round(ok / len(rows), 3), "band": [0.5, 1.0], "pass": ok / len(rows) >= 0.5, "kind": "share"})
    sh = [r["milestones"]["shusha"] for r in rows if "shusha" in r["milestones"]]
    share_sh = len(sh) / len(rows)
    checks.append({"metric": "舒沙陷落（种子占比）", "value": round(share_sh, 3), "band": [0.5, 1.0], "pass": share_sh >= 0.5, "kind": "share"})
    if sh:
        band("舒沙陷落日（中位，若陷落）", sh, 30, 50)
    nored = sum(1 for r in rows if not r["redLine"]) / len(rows)
    checks.append({"metric": "未越过俄方红线（种子占比）", "value": round(nored, 3), "band": [0.9, 1.0], "pass": nored >= 0.9, "kind": "share"})
    return checks


def scenario_summary(rows):
    return {
        "outcomes": outcome_shares(rows),
        "shusha_fell": round(sum(1 for r in rows if "shusha" in r["milestones"]) / len(rows), 3),
        "lost_share_median": round(med([r["outcome"]["lostShare"] for r in rows]), 3),
        "days_median": med([r["days"] for r in rows]),
        "arm_kia_median": med([r["kia"]["ARM"] for r in rows]),
        "arm_tanks_median": med([r["arm"]["tanks"] for r in rows]),
        "arm_sam_median": med([r["arm"]["sam"] for r in rows]),
        "tb2_lost_median": med([r["tb2Lost"] for r in rows]),
        "milestone_captured_share": {k: round(sum(1 for r in rows if k in r["milestones"]) / len(rows), 2) for k in ["jabrayil", "hadrut", "fuzuli", "zangilan", "qubadli", "shusha"]},
        "milestone_median": {k: round(med([r["milestones"][k] for r in rows if k in r["milestones"]]), 1)
                             for k in ["talysh", "jabrayil", "hadrut", "fuzuli", "zangilan", "qubadli", "lachin", "shusha", "martuni", "aghdam"]
                             if any(k in r["milestones"] for r in rows)},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--only", default=None)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    import yaml
    calib = yaml.safe_load((ROOT / "data/scenarios/nk_2020/calibration.yaml").read_text(encoding="utf-8"))
    names = [args.only] if args.only else list(SCENARIOS)
    result = {"n": args.n, "scenarios": {}}
    for name in names:
        rows, ms = run(SCENARIOS[name], args.n)
        entry = {"summary": scenario_summary(rows), "ms": ms}
        if name == "historical":
            entry["checks"] = calibration_checks(rows, calib)
        result["scenarios"][name] = entry
        print(f"\n=== {name}  (n={len(rows)}, {ms} ms)")
        print(json.dumps(entry["summary"], ensure_ascii=False))
        for c in entry.get("checks", []):
            print(f"  {'PASS' if c['pass'] else 'FAIL'}  {c['metric']}: {c['value']}  band {c['band']}" + (f"  p10–p90 {c['p10_p90']}" if 'p10_p90' in c else ""))
    if "historical" in result["scenarios"]:
        cks = result["scenarios"]["historical"]["checks"]
        result["calibration_pass"] = sum(c["pass"] for c in cks)
        result["calibration_total"] = len(cks)
        print(f"\ncalibration: {result['calibration_pass']}/{result['calibration_total']} pass")
    if args.json:
        Path(args.json).write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
