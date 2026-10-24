from __future__ import annotations

import json
import re
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    raise SystemExit("需要 PyYAML：pip3 install pyyaml")

# 字段名后缀 → 单位（沿用 data/README 的约定）
UNIT_SUFFIXES = [
    ("_km", "km"), ("_kph", "km/h"), ("_mach", "mach"), ("_mm", "mm"), ("_kg", "kg"), ("_t", "t"),
    ("_m", "m"), ("_mps", "m/s"), ("_min", "min"), ("_rpm", "rpm"), ("_musd", "MUSD"), ("_kt", "kt"),
    ("_m2", "m2"), ("_m3", "m3"), ("_h", "h"), ("_kn", "kn"), ("_kw", "kW"), ("_mw", "MW"),
]


def load_yaml(path: Path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def unit_of(key: str):
    for suf, unit in UNIT_SUFFIXES:
        if key.endswith(suf):
            return unit
    return None


def jdump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str)


def flatten_specs(specs: dict, prefix: str = ""):
    """specs → [(key, num, text, unit)]。嵌套 dict 用点号展开；区间 [a,b] 存文本并把最大值放 num 之外不臆造。"""
    out = []
    for k, v in (specs or {}).items():
        key = f"{prefix}{k}"
        if isinstance(v, bool):
            out.append((key, None, str(v).lower(), None))
        elif isinstance(v, (int, float)):
            out.append((key, float(v), None, unit_of(key)))
        elif isinstance(v, dict):
            out += flatten_specs(v, key + ".")
        elif isinstance(v, (list, tuple)):
            if len(v) == 2 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
                out.append((key + ".min", float(v[0]), None, unit_of(key)))
                out.append((key + ".max", float(v[1]), None, unit_of(key)))
            else:
                out.append((key, None, jdump(v), None))
        elif v is None:
            continue
        else:
            m = re.fullmatch(r"-?\d+(\.\d+)?", str(v).strip())
            if m:
                out.append((key, float(v), None, unit_of(key)))
            else:
                out.append((key, None, str(v), unit_of(key)))
    return out


def country_of_template(tid: str, filename: str) -> str:
    """模板所属国家：由 id 前缀决定（仓库 validate_data.py 的 TEMPLATE_PREFIXES 约定）。"""
    for pref, iso in (("usmc_", "USA"), ("us_", "USA"), ("pla_", "CHN"), ("arm_", "ARM"), ("aze_", "AZE")):
        if tid.startswith(pref):
            return iso
    stem = filename.lower()
    if stem.startswith("us") or "usmc" in stem:
        return "USA"
    if stem.startswith("pla"):
        return "CHN"
    return "UNK"


def service_of_template(tid: str, filename: str) -> str:
    if tid.startswith("usmc_") or tid.startswith("pla_marine") or tid.startswith("pla_navy"):
        return "marines" if "marine" in tid or tid.startswith("usmc_") else "navy"
    if "sof" in filename or tid.startswith("us_sf") or tid.startswith("us_seal") or tid.startswith("us_ranger"):
        return "sof"
    if tid.startswith("pla_af_") or tid.startswith("pla_airborne") or tid.startswith("pla_abn"):
        return "airforce"
    return "army"
