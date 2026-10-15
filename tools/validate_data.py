#!/usr/bin/env python3
"""校验 data/ 目录：引用完整性 + 原文总数比对。

用法：python3 tools/validate_data.py [--verbose] [--summary]
错误（ERROR）= 引用缺失、重复 id、循环引用，返回码 1。
警告（WARN） = 计算出的人数/装备与原文总数不符（原文本身常有出入），不影响返回码。
"""
import sys
from collections import Counter
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("需要 PyYAML：pip3 install pyyaml")

ROOT = Path(__file__).resolve().parent.parent / "data"
VERBOSE = "--verbose" in sys.argv
SUMMARY = "--summary" in sys.argv
TOLERANCE = 0.10  # 人数允许 10% 误差

errors, warns = [], []


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# ---------------- schema ----------------
categories = {c["id"] for c in load(ROOT / "schema/categories.yaml")["categories"]}
specialties = {s["id"] for s in load(ROOT / "schema/specialties.yaml")["specialties"]}
scales = load(ROOT / "schema/rating_scales.yaml")
rating_ids = {
    lvl["id"]
    for v in scales.values()
    if isinstance(v, dict) and "levels" in v
    for lvl in v["levels"]
}

# ---------------- equipment ----------------
models = {}
for path in sorted((ROOT / "equipment").glob("*.yaml")):
    for m in load(path).get("models", []):
        mid = m.get("id")
        if mid in models:
            errors.append(f"装备 id 重复：{mid}（{path.name}）")
        models[mid] = m
        if m.get("category") not in categories:
            errors.append(f"装备 {mid} 的类别不存在：{m.get('category')}")
        for k, r in (m.get("ratings") or {}).items():
            if r not in rating_ids:
                errors.append(f"装备 {mid} 的评级档位不存在：{k}={r}")

for mid, m in models.items():
    for s in m.get("sensors", []) or []:
        if s.isascii() and s.replace("_", "").isalnum() and s not in models:
            errors.append(f"装备 {mid} 引用的传感器不存在：{s}")

# ---------------- templates ----------------
templates = {}
for path in sorted((ROOT / "templates").glob("*.yaml")):
    for t in load(path).get("templates", []):
        tid = t.get("id")
        if tid in templates:
            errors.append(f"模板 id 重复：{tid}（{path.name}）")
        t["_file"] = path.name
        templates[tid] = t

LEVELS = {"squad", "platoon", "company", "battalion", "brigade", "division", "corps"}
for tid, t in templates.items():
    if t.get("level") not in LEVELS:
        errors.append(f"模板 {tid} level 非法：{t.get('level')}")
    if t.get("level") == "squad" and t.get("children"):
        errors.append(f"班模板 {tid} 不应有 children")
    if t.get("level") != "squad" and (t.get("personnel") or t.get("slots")):
        errors.append(f"非班模板 {tid} 不应直接带 personnel/slots（设计文档 3.1）")
    for sp in t.get("personnel") or {}:
        if sp not in specialties:
            errors.append(f"模板 {tid} 专业不存在：{sp}")
    for key in ("slots", "slots_unassigned"):
        for cat in t.get(key) or {}:
            if cat not in categories:
                errors.append(f"模板 {tid} {key} 类别不存在：{cat}")
    for key in ("children", "attached"):
        for c in t.get(key) or []:
            if c["template"] not in templates:
                errors.append(f"模板 {tid} 引用的下级模板不存在：{c['template']}")
    if t.get("variant_of") and t["variant_of"] not in templates:
        errors.append(f"模板 {tid} variant_of 不存在：{t['variant_of']}")
    for cat, mid in (t.get("default_bindings") or {}).items():
        if cat not in categories:
            errors.append(f"模板 {tid} 绑定的类别不存在：{cat}")
        elif mid not in models:
            errors.append(f"模板 {tid} 绑定的型号不存在：{mid}")
        elif models[mid]["category"] != cat:
            warns.append(f"模板 {tid} 绑定 {cat} → {mid}，但该型号类别为 {models[mid]['category']}")
    for k, r in (t.get("unit_ratings") or {}).items():
        if r not in rating_ids:
            errors.append(f"模板 {tid} unit_ratings 档位不存在：{k}={r}")

# ---------------- 汇总计算 ----------------
cache = {}


def totals(tid, stack=()):
    """返回 (人数, 装备Counter, 是否完整)。只算 children，不算 attached。"""
    if tid in stack:
        errors.append(f"循环引用：{' → '.join(stack + (tid,))}")
        return 0, Counter(), False
    if tid in cache:
        return cache[tid]
    t = templates.get(tid)
    if t is None:
        return 0, Counter(), False
    if t["level"] == "squad":
        people = sum((t.get("personnel") or {}).values())
        eq = Counter(t.get("slots") or {})
        complete = bool(t.get("personnel")) or t.get("role") == "equipment_pool"
    else:
        people, eq, complete = 0, Counter(), bool(t.get("children"))
        for c in t.get("children") or []:
            p, e, ok = totals(c["template"], stack + (tid,))
            people += p * c["count"]
            for k, v in e.items():
                eq[k] += v * c["count"]
            complete = complete and ok
    # 子树只有聚合数据时，退回使用原文给出的总人数
    if not complete and t.get("expected_personnel"):
        people = t["expected_personnel"]
        complete = True
        t["_fallback"] = True
    cache[tid] = (people, eq, complete)
    return cache[tid]


for tid, t in templates.items():
    people, eq, complete = totals(tid)
    exp = t.get("expected_personnel")
    if exp and not t.get("_fallback"):
        if not complete:
            if VERBOSE:
                warns.append(f"[{t['_file']}] {tid}：含聚合单位，人数不完整（计算 {people} / 原文 {exp}）")
        elif abs(people - exp) / exp > TOLERANCE:
            warns.append(f"[{t['_file']}] {tid}：人数 计算 {people} ≠ 原文 {exp}")
    for key, expv in (t.get("expected_equipment") or {}).items():
        cats = str(key).split("+")
        bad = [c for c in cats if c not in categories]
        if bad:
            errors.append(f"模板 {tid} expected_equipment 类别不存在：{bad}")
            continue
        got = sum(eq[c] for c in cats)
        if got != expv and (complete or got > expv):
            warns.append(f"[{t['_file']}] {tid}：{key} 计算 {got} ≠ 原文 {expv}")

# ---------------- 覆盖清单 ----------------
import re
cov = ROOT / "COVERAGE.md"
if cov.exists():
    for tok in re.findall(r"`([a-z0-9_]+)`", cov.read_text(encoding="utf-8")):
        if (tok.startswith("us_") or tok.startswith("pla_") or tok.startswith("usmc_")) and tok not in templates:
            errors.append(f"COVERAGE.md 引用的模板不存在：{tok}")

# 没有被任何模板引用、也不是顶层编组的模板（可能是遗漏挂接）
referenced = {c["template"] for t in templates.values() for k in ("children", "attached") for c in t.get(k) or []}
referenced |= {t["variant_of"] for t in templates.values() if t.get("variant_of")}
orphans = [tid for tid, t in templates.items()
           if tid not in referenced and t["level"] in ("squad", "platoon", "company") and not t.get("variant_of")]
if VERBOSE:
    for o in orphans:
        warns.append(f"未被引用的下级模板：{o}")

# ---------------- 输出 ----------------
lv = Counter(t["level"] for t in templates.values())
print(f"类别 {len(categories)}，专业 {len(specialties)}，评级档位 {len(rating_ids)}")
print(f"装备型号 {len(models)}（{', '.join(f'{k}:{v}' for k, v in Counter(m['origin'] for m in models.values()).items())}）")
print(f"模板 {len(templates)}（{', '.join(f'{k}:{lv[k]}' for k in ['squad','platoon','company','battalion','brigade','division','corps'] if lv[k])}）")
if SUMMARY:
    print("\n旅级及以上模板汇总（* = 部分子单位按原文总数回填）：")
    keys = ["mbt", "ifv", "recon_ifv", "apc", "assault_gun", "light_armored_vehicle", "sp_mortar_howitzer", "mortar_vehicle",
            "howitzer_light_sp", "howitzer_heavy_sp", "howitzer_heavy_towed", "mrl_light", "mrl_long_range", "atgm_vehicle", "spaag", "sam_short"]
    for tid, t in templates.items():
        if t["level"] in ("battalion", "brigade", "division") and t.get("children"):
            p, e, ok = totals(tid)
            fb = "*" if any(templates[c["template"]].get("_fallback") or not totals(c["template"])[2] for c in t["children"]) else " "
            eqs = " ".join(f"{k}={e[k]}" for k in keys if e[k])
            print(f"  {fb}{tid:<32} {p:>6} 人  {eqs}")
for w in warns:
    print("WARN ", w)
for e in errors:
    print("ERROR", e)
print(f"\n{len(errors)} 个错误，{len(warns)} 个警告")
sys.exit(1 if errors else 0)
