#!/usr/bin/env python3
"""One-factor-at-a-time sweep to find which ARM decision drives outcomes (diagnostic)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from calibrate import run, scenario_summary

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
base = {"armAi": "historical", "aiTier": "H", "convoy": "continuous"}
variants = {
    "base(historical)": {},
    "AD ambush": {"armAdPosture": "ambush"},
    "AD silent": {"armAdPosture": "silent"},
    "night convoy": {"convoy": "night_only"},
    "competent reserves (AD active, day convoy)": {"armAi": "competent", "armAdPosture": "active"},
    "improved force": {"inventoryDelta": {"ARM": {"tor": 16, "sam_medium": 12, "atgm_heavy": 120}}, "fortBonus": 0.15},
    "+16 tor only": {"inventoryDelta": {"ARM": {"tor": 16}}},
    "fort +0.15 only": {"fortBonus": 0.15},
}
if len(sys.argv) > 2:
    variants = {k: v for k, v in variants.items() if any(s in k for s in sys.argv[2:])}
for name, delta in variants.items():
    opts = dict(base); opts.update(delta)
    rows, ms = run({"opts": opts}, N, 2000)
    s = scenario_summary(rows)
    print(f"{name:45s} shusha_fell={s['shusha_fell']:.2f} lost={s['lost_share_median']:.2f} days={s['days_median']} "
          f"tb2lost={s['tb2_lost_median']} samLost={s['arm_sam_median']} tanks={s['arm_tanks_median']} out={s['outcomes']}", flush=True)
