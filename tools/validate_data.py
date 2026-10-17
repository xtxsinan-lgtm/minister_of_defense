#!/usr/bin/env python3
"""校验 data/ 目录：引用完整性 + 原文总数比对。

用法：python3 tools/validate_data.py [--verbose] [--summary]
错误（ERROR）= 引用缺失、重复 id、循环引用、层级违规（01 §3.4.1 / §3.9 M5）、剧本引用缺失，返回码 1。
警告（WARN） = 计算出的人数/装备与原文总数不符（原文本身常有出入）及语义可疑项，不影响返回码。
剧本（data/scenarios/**）只检查引用，脚本不修改任何数据文件。
"""
import re
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
scen_errors = []  # 剧本引用错误（单独列出，也计入返回码）

ID_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")      # 00 §5 id 格式
CONFIDENCE = {"stated", "estimated", "uncertain"}    # 01 §3.3 Confidence
MUNITION_GROUPS = {"air_munition", "ground_munition"}  # 弹药类别组（DC-205/206）：不进班模板槽位


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def rel(path):
    return str(Path(path).relative_to(ROOT))


# 全局 id 唯一（01 §3.9 M5、§4.1 第 2 步：跨类别/专业/型号/模板）
global_ids = {}


def claim(kind, i, where):
    if not isinstance(i, str) or not ID_RE.match(i):
        errors.append(f"{kind} id 不符合 snake_case 格式：{i!r}（{where}）")
    prev = global_ids.get(i)
    if prev and prev[0] != kind:
        errors.append(f"全局 id 冲突：{i} 同时是 {prev[0]}（{prev[1]}）和 {kind}（{where}）")
    global_ids.setdefault(i, (kind, where))


# ---------------- schema ----------------
cat_list = load(ROOT / "schema/categories.yaml")["categories"]
categories = {c["id"] for c in cat_list}
cat_group = {c["id"]: c.get("group") for c in cat_list}
for c in cat_list:
    claim("类别", c["id"], "schema/categories.yaml")
for cid, n in Counter(c["id"] for c in cat_list).items():
    if n > 1:
        errors.append(f"类别 id 重复：{cid}")
munition_cats = {c for c, g in cat_group.items() if g in MUNITION_GROUPS}
spec_list = load(ROOT / "schema/specialties.yaml")["specialties"]
specialties = {s["id"] for s in spec_list}
for s in spec_list:
    claim("专业", s["id"], "schema/specialties.yaml")
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
        claim("型号", mid, path.name)
        m["_file"] = path.name
        models[mid] = m
        if m.get("category") not in categories:
            errors.append(f"装备 {mid} 的类别不存在：{m.get('category')}")
        for k, r in (m.get("ratings") or {}).items():
            if r not in rating_ids:
                errors.append(f"装备 {mid} 的评级档位不存在：{k}={r}")
        if m.get("confidence") is not None and m["confidence"] not in CONFIDENCE:
            errors.append(f"装备 {mid} confidence 非法：{m['confidence']}")


def munition_refs(m):
    """型号引用的弹药 id：顶层 munitions（data/README）、specs.munitions、weapon.munitions（03）、air_defense.interceptor_ids（08）。"""
    out = []
    for src in (m, m.get("specs") or {}, m.get("weapon") or {}):
        v = src.get("munitions") if isinstance(src, dict) else None
        if isinstance(v, list):
            out += [x for x in v if isinstance(x, str)]
    ad = m.get("air_defense") or {}
    if isinstance(ad, dict):
        out += [x for x in ad.get("interceptor_ids") or [] if isinstance(x, str)]
    return out


for mid, m in models.items():
    for s in m.get("sensors", []) or []:
        if s.isascii() and s.replace("_", "").isalnum() and s not in models:
            errors.append(f"装备 {mid} 引用的传感器不存在：{s}")
    if m.get("upgrade_of") and m["upgrade_of"] not in models:
        errors.append(f"装备 {mid} upgrade_of 不存在：{m['upgrade_of']}")
    for mu in munition_refs(m):
        if mu not in models:
            errors.append(f"装备 {mid} 引用的弹药不存在：{mu}")
        elif models[mu].get("category") not in munition_cats:
            warns.append(f"装备 {mid} 的弹药 {mu} 类别 {models[mu].get('category')} 不在弹药类别组（{'/'.join(sorted(MUNITION_GROUPS))}）")
    if m.get("munition") is not None and m.get("category") not in munition_cats:
        warns.append(f"装备 {mid} 带 munition 键，但类别 {m.get('category')} 不在弹药类别组")

# ---------------- templates ----------------
templates = {}
for path in sorted((ROOT / "templates").glob("*.yaml")):
    for t in load(path).get("templates", []):
        tid = t.get("id")
        if tid in templates:
            errors.append(f"模板 id 重复：{tid}（{path.name}）")
        claim("模板", tid, path.name)
        t["_file"] = path.name
        templates[tid] = t

LEVEL_ORDER = ["squad", "platoon", "company", "battalion", "brigade", "division", "corps"]
LEVELS = set(LEVEL_ORDER)
RANK = {lv: i for i, lv in enumerate(LEVEL_ORDER)}
for tid, t in templates.items():
    if t.get("level") not in LEVELS:
        errors.append(f"模板 {tid} level 非法：{t.get('level')}")
    if t.get("level") == "squad" and t.get("children"):
        errors.append(f"班模板 {tid} 不应有 children")
    if t.get("level") != "squad" and (t.get("personnel") or t.get("slots") or t.get("slots_unassigned")):
        errors.append(f"非班模板 {tid} 不应直接带 personnel/slots（设计文档 3.1）")
    if t.get("role") == "equipment_pool":
        if t.get("level") != "squad":
            errors.append(f"模板 {tid}：role: equipment_pool 只允许 squad（01 §3.4.1）")
        if t.get("personnel"):
            errors.append(f"模板 {tid}：role: equipment_pool 不许有 personnel（01 §3.4.1）")
    for sp, n in (t.get("personnel") or {}).items():
        if sp not in specialties:
            errors.append(f"模板 {tid} 专业不存在：{sp}")
        if not isinstance(n, int) or n <= 0:
            errors.append(f"模板 {tid} 专业 {sp} 人数应为正整数：{n}")
    for key in ("slots", "slots_unassigned"):
        for cat, n in (t.get(key) or {}).items():
            if cat not in categories:
                errors.append(f"模板 {tid} {key} 类别不存在：{cat}")
            elif cat in munition_cats:
                errors.append(f"模板 {tid} {key} 使用了弹药类别 {cat}（弹药按发/枚计入 06 库存，不占槽位；DC-205/206）")
            if not isinstance(n, int) or n <= 0:
                errors.append(f"模板 {tid} {key} {cat} 数量应为正整数：{n}")
    for key in ("children", "attached"):
        for c in t.get(key) or []:
            ct = templates.get(c["template"])
            if ct is None:
                errors.append(f"模板 {tid} 引用的下级模板不存在：{c['template']}")
                continue
            if not isinstance(c.get("count"), int) or c["count"] <= 0:
                errors.append(f"模板 {tid} {key} {c['template']} count 应为正整数：{c.get('count')}")
            if t.get("level") in RANK and ct.get("level") in RANK and RANK[ct["level"]] >= RANK[t["level"]]:
                msg = f"模板 {tid}（{t['level']}）的 {key} {c['template']}（{ct['level']}）层级不低于本模板（01 O-02 / DC-070）"
                (errors if key == "children" else warns).append(msg)
    if t.get("variant_of") and t["variant_of"] not in templates:
        errors.append(f"模板 {tid} variant_of 不存在：{t['variant_of']}")
    # subordinate_formations：只记录隶属、不计入合计（pla_theater_army：01 没有高于 corps 的层级，见报告 D / 01 🟡）
    for c in t.get("subordinate_formations") or []:
        if c.get("template") not in templates:
            errors.append(f"模板 {tid} subordinate_formations 引用的模板不存在：{c.get('template')}")
    if t.get("default_bindings") and RANK.get(t.get("level"), 99) < RANK["battalion"]:
        errors.append(f"模板 {tid}（{t.get('level')}）不应写 default_bindings（只允许营及以上，01 §3.4.1）")
    for cat, mid in (t.get("default_bindings") or {}).items():
        if cat not in categories:
            errors.append(f"模板 {tid} 绑定的类别不存在：{cat}")
        elif mid not in models:
            errors.append(f"模板 {tid} 绑定的型号不存在：{mid}")
        elif models[mid]["category"] != cat:
            warns.append(f"模板 {tid} 绑定 {cat} → {mid}，但该型号类别为 {models[mid]['category']}")
    if t.get("echelon_label") and RANK.get(t.get("level"), -1) < RANK["brigade"]:
        errors.append(f"模板 {tid}：echelon_label 只允许旅及以上（01 §3.4.1）")
    for k, r in (t.get("unit_ratings") or {}).items():
        if r not in rating_ids:
            errors.append(f"模板 {tid} unit_ratings 档位不存在：{k}={r}")
    if t.get("confidence") is not None and t["confidence"] not in CONFIDENCE:
        errors.append(f"模板 {tid} confidence 非法：{t['confidence']}")

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
TEMPLATE_PREFIXES = ("us_", "pla_", "usmc_", "arm_", "aze_")  # 01 §3.9 M5：加 arm_/aze_
cov = ROOT / "COVERAGE.md"
if cov.exists():
    for tok in re.findall(r"`([a-z0-9_]+)`", cov.read_text(encoding="utf-8")):
        if tok.startswith(TEMPLATE_PREFIXES) and tok not in templates:
            errors.append(f"COVERAGE.md 引用的模板不存在：{tok}")

# 没有被任何模板引用、也不是顶层编组的模板（可能是遗漏挂接）
referenced = {c["template"] for t in templates.values() for k in ("children", "attached") for c in t.get(k) or []}
referenced |= {t["variant_of"] for t in templates.values() if t.get("variant_of")}
referenced |= {c.get("template") for t in templates.values() for c in t.get("subordinate_formations") or []}

# ---------------- 剧本引用（data/scenarios/**；只报告，不修改）----------------
scen_template_refs = set()


def scen_err(f, msg):
    scen_errors.append(f"[{f}] {msg}")


def chk_model(f, mid, ctx):
    if mid not in models:
        scen_err(f, f"{ctx} 引用的型号不存在：{mid}")


def chk_template(f, tid, ctx):
    scen_template_refs.add(tid)
    if tid not in templates:
        scen_err(f, f"{ctx} 引用的模板不存在：{tid}")
        return None
    return templates[tid]


def chk_category(f, cid, ctx):
    if cid not in categories:
        scen_err(f, f"{ctx} 引用的类别不存在：{cid}")


def chk_binding(f, b, ctx, tmpl=None):
    for cat, mid in (b or {}).items():
        chk_category(f, cat, ctx + " binding")
        chk_model(f, mid, ctx + " binding")
        if cat in categories and mid in models and models[mid]["category"] != cat:
            scen_err(f, f"{ctx} binding {cat} → {mid}，但该型号类别为 {models[mid]['category']}")
        if tmpl is not None and cat in categories and cat not in totals(tmpl["id"])[1]:
            warns.append(f"[{f}] {ctx} binding 类别 {cat} 不在模板 {tmpl['id']} 的槽位里（绑定无效）")


def chk_child(f, c, echelon, ctx):
    t = chk_template(f, c.get("template"), ctx)
    if t is not None:
        if echelon in RANK and t.get("level") in RANK and RANK[t["level"]] >= RANK[echelon]:
            scen_err(f, f"{ctx} 模板 {t['id']}（{t['level']}）层级不低于编组 echelon {echelon}（DC-070）")
        chk_binding(f, c.get("binding"), ctx, t)


def chk_formation(f, fm, ctx):
    ech = fm.get("echelon")
    if ech is not None and ech not in LEVELS:
        scen_err(f, f"{ctx} echelon 非法：{ech}")
    if fm.get("hq_template"):
        t = chk_template(f, fm["hq_template"], ctx + " hq_template")
        if t is not None and t.get("role") != "hq":
            warns.append(f"[{f}] {ctx} hq_template {t['id']} 不是 role: hq")
    for key in ("children", "direct", "pending_m2", "add_direct", "add_pending_m2"):
        for c in fm.get(key) or []:
            chk_child(f, c, ech, f"{ctx}.{key}")


scen_files = sorted((ROOT / "scenarios").glob("**/*.yaml")) if (ROOT / "scenarios").exists() else []
oob_ids = {}  # scenario id → {country: set(formation ids)}
scen_docs = {}
for path in scen_files:
    scen_docs[path] = load(path)
for path, doc in scen_docs.items():
    if isinstance(doc, dict) and isinstance(doc.get("scenario"), dict):
        sid = doc["scenario"].get("id")
        oob_ids[sid] = {c: {fm.get("id") for fm in v if isinstance(fm, dict)}
                        for c, v in (doc.get("oob") or {}).items() if isinstance(v, list)}

for path, doc in scen_docs.items():
    f = rel(path)
    if not isinstance(doc, dict):
        continue
    # inventory：键 = 型号；_nk_<型号> = 分项（14 §4.2 R3）；_auto_fill_categories = 类别
    for c, inv in (doc.get("inventory") or {}).items():
        for k, v in (inv or {}).items():
            if k == "_auto_fill_categories":
                for cat in v or []:
                    chk_category(f, cat, f"inventory.{c}._auto_fill_categories")
            elif k.startswith("_nk_"):
                chk_model(f, k[4:], f"inventory.{c}.{k}")
            elif not k.startswith("_"):
                chk_model(f, k, f"inventory.{c}")
    # oob
    for c, v in (doc.get("oob") or {}).items():
        if isinstance(v, list):
            for fm in v:
                chk_formation(f, fm, f"oob.{c}.{fm.get('id')}")
        elif isinstance(v, dict):
            base = oob_ids.get(v.get("inherit_from"), {}).get(c)
            if v.get("inherit_from") and base is None:
                scen_err(f, f"oob.{c} inherit_from 找不到剧本或国家：{v.get('inherit_from')}")
            for ov in v.get("overrides") or []:
                if base is not None and ov.get("id") not in base:
                    scen_err(f, f"oob.{c} override 引用的编组不存在：{ov.get('id')}")
                chk_formation(f, ov, f"oob.{c}.override.{ov.get('id')}")
    # air_force：键 = 型号
    for c, af in (doc.get("air_force") or {}).items():
        for mid in (af or {}):
            chk_model(f, mid, f"air_force.{c}")
    # open_contracts / market_pool / historical_procurement：model 字段
    for sec in ("open_contracts", "historical_procurement"):
        for c, lst in (doc.get(sec) or {}).items():
            for it in lst or []:
                chk_model(f, it.get("model"), f"{sec}.{c}")
    for it in doc.get("market_pool") or []:
        chk_model(f, it.get("model"), "market_pool")
    for mid in (doc.get("procurement_profiles") or {}):
        chk_model(f, mid, "procurement_profiles")
    for it in doc.get("production_lines") or []:
        for mid in it.get("models") or []:
            chk_model(f, mid, f"production_lines.{it.get('id')}")
    for it in doc.get("upgrades") or []:
        for k in ("from", "to"):
            if it.get(k) not in (None, "*"):
                chk_model(f, it[k], f"upgrades.{it.get('id')}.{k}")
    # ai_profiles：参考模板、编组角色标签、改革模板、类别优先级
    rt = doc.get("reference_templates") or {}
    if rt.get("ref_mech_inf_bn"):
        chk_template(f, rt["ref_mech_inf_bn"], "reference_templates.ref_mech_inf_bn")
    for k, tid in (rt.get("by_type") or {}).items():
        chk_template(f, tid, f"reference_templates.by_type.{k}")
    for k, lst in (doc.get("formation_role_tags") or {}).items():
        for tid in lst or []:
            chk_template(f, tid, f"formation_role_tags.{k}")
    for p in doc.get("profiles") or []:
        for cat in (p.get("category_priority") or {}):
            chk_category(f, cat, f"profiles.{p.get('country_iso3')}.category_priority")
        for r in p.get("reforms") or []:
            if r.get("template_id"):
                chk_template(f, r["template_id"], f"profiles.{p.get('country_iso3')}.reforms.{r.get('id')}")

referenced |= scen_template_refs
orphans = [tid for tid, t in templates.items()
           if tid not in referenced and t["level"] in ("squad", "platoon", "company") and not t.get("variant_of")]
if VERBOSE:
    for o in orphans:
        warns.append(f"未被引用的下级模板：{o}")

# ---------------- 输出 ----------------
lv = Counter(t["level"] for t in templates.values())
print(f"类别 {len(categories)}（其中弹药类别 {len(munition_cats)}），专业 {len(specialties)}，评级档位 {len(rating_ids)}")
print(f"装备型号 {len(models)}（{', '.join(f'{k}:{v}' for k, v in Counter(m.get('origin') for m in models.values()).items())}）")
print(f"模板 {len(templates)}（{', '.join(f'{k}:{lv[k]}' for k in LEVEL_ORDER if lv[k])}）")
print(f"剧本文件 {len(scen_files)}（引用模板 {len(scen_template_refs)} 个）")
if SUMMARY:
    print("\n旅级及以上模板汇总（* = 部分子单位按原文总数回填）：")
    keys = ["mbt", "ifv", "recon_ifv", "apc", "assault_gun", "light_armored_vehicle", "sp_mortar_howitzer", "mortar_vehicle",
            "howitzer_light_sp", "howitzer_heavy_sp", "howitzer_heavy_towed", "mrl_light", "mrl_long_range", "atgm_vehicle", "spaag", "sam_short",
            "tbm_launcher", "loitering_launcher"]
    for tid, t in templates.items():
        if t["level"] in ("battalion", "brigade", "division") and t.get("children"):
            p, e, ok = totals(tid)
            fb = "*" if any(templates[c["template"]].get("_fallback") or not totals(c["template"])[2]
                            for c in t["children"] if c["template"] in templates) else " "
            eqs = " ".join(f"{k}={e[k]}" for k in keys if e[k])
            print(f"  {fb}{tid:<32} {p:>6} 人  {eqs}")
for w in warns:
    print("WARN ", w)
for e in errors:
    print("ERROR", e)
for e in scen_errors:
    print("ERROR[剧本]", e)
print(f"\n{len(errors)} 个错误（数据），{len(scen_errors)} 个错误（剧本引用），{len(warns)} 个警告")
sys.exit(1 if errors or scen_errors else 0)
