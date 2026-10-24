"""量化引擎：从 equipment.sqlite / toe.sqlite 读参数与库存，聚合成中美（或任意国家对）的军力对比。

聚合口径逐条对应作者表格“总计”sheet：
  * 地面力量 = 旅级战斗单位 + 炮兵 + 防空 + 直升机 + 特战（按军种归并）
  * 远程投送 = 24 小时空运 + 海运周转量，美国另有“超前部署”“海外基地”两项加成
  * 空中力量 = 三军全部固定翼 + 大型无人机（等效 F/A-18）
  * 海上力量 = 水面舰艇 + 航母/两栖舰 + 潜艇（等效垂发单元）
  * 太空力量按预算比从空军战力折算；火箭军按陆军炮兵折算
各域先在“基准国”（默认美国）上归一：地面 100、投送 100、空中 200、海上 100。
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from ..db import DATA, DB_DIR, connect
from ..ingest.common import load_yaml
from . import formulas as F

PRESET_DIR = DATA / "forcedb" / "models"
SERVICES = ("army", "marines", "navy", "airforce", "rocket", "space")


def _num(v):
    return float(v) if v is not None else None


class Engine:
    def __init__(self, eq=None, toe=None, mode: str = "snapshot", preset: str = "article_2025_08",
                 reference: str = "USA", article_compat: Optional[bool] = None):
        if mode not in ("snapshot", "recompute"):
            raise ValueError("mode 应为 snapshot 或 recompute")
        self.eq = eq or connect(DB_DIR / "equipment.sqlite")
        self.toe = toe or connect(DB_DIR / "toe.sqlite")
        self.mode = mode
        self.ref = reference
        # 默认：snapshot 模式复现文章（加回表格硬编码总计与逐行加总的差额）；recompute 模式用自洽口径
        self.article_compat = (mode == "snapshot") if article_compat is None else article_compat
        self.preset = load_yaml(PRESET_DIR / f"{preset}.yaml")
        self.sf_snapshot = load_yaml(DATA / "forcedb" / "special_forces_snapshot.yaml")
        self._specs: Dict[str, Dict[str, object]] = {}
        self._cat: Dict[str, str] = {}
        for r in self.eq.execute("SELECT equipment_id, key, num, text FROM spec"):
            self._specs.setdefault(r["equipment_id"], {})[r["key"]] = r["num"] if r["num"] is not None else r["text"]
        for r in self.eq.execute("SELECT id, category FROM equipment"):
            self._cat[r["id"]] = r["category"]
        self.notes: List[str] = []          # 每次运行产生的口径提示（例如哪些项没能重算）
        self.deviations: List[dict] = []    # recompute 模式下：重算 vs 快照 的偏差

    # ------------------------------------------------------------------ 读库
    def spec(self, eid: str, key: str, default=None):
        return self._specs.get(eid, {}).get(key, default)

    def inventory(self, country: str, categories: Optional[Iterable[str]] = None, role: str = "all",
                  kinds: Iterable[str] = ("active",)) -> List[dict]:
        kinds = tuple(kinds)
        q = ("SELECT i.equipment_id, i.service, i.role, i.kind, i.quantity, e.category FROM v_inventory_latest i "
             "JOIN equipment e ON e.id=i.equipment_id WHERE i.country=? AND i.role=? AND i.kind IN (%s)"
             % ",".join("?" * len(kinds)))
        rows = [dict(r) for r in self.eq.execute(q, (country, role) + kinds)]
        if categories is not None:
            cs = set(categories)
            rows = [r for r in rows if r["category"] in cs]
        return rows

    # ------------------------------------------------------------------ 空军
    def _fa18_refs(self):
        ref = self.preset["air"]["fa18_reference_id"]
        s = self._specs[ref]
        air = F.fighter_air_power(s["detect_rcs3_km"], s["aam_range_km"], s["detected_by_j16_km"], s["thrust_weight"],
                                  s["aam_count"], s["combat_radius_km"], s["max_speed_mach"], s["cruise_speed_mach"])
        gnd = F.fighter_ground_power(s["ground_detected_km"], s["ground_radius_km"], s["ag_payload_t"],
                                     s["payload_1000km_kg"], s["ground_cruise_mach"])
        return air, gnd

    def _snapshot_unit(self, eid: str, total_key: str, qty_key: str) -> Optional[float]:
        t, q = self.spec(eid, total_key), self.spec(eid, qty_key)
        if t is None or not q:
            return None
        return t / q

    def _compare(self, eid, what, recomputed, snapshot):
        if snapshot:
            self.deviations.append({"equipment": eid, "item": what, "recomputed": recomputed, "snapshot": snapshot,
                                    "ratio": recomputed / snapshot})

    def air(self, country: str) -> Dict[str, object]:
        """返回 {'by_service': {svc: 总量}, 'by_bucket': {...}}（单位：等效 F/A-18 架）。"""
        by_service: Dict[str, float] = defaultdict(float)
        by_bucket: Dict[str, float] = defaultdict(float)
        buckets_cfg = self.preset["air"]["special_function_buckets"]
        fn_bucket = {fn: b for b, fns in buckets_cfg.items() for fn in fns}
        if self.mode == "recompute":
            ref_air, ref_gnd = self._fa18_refs()

        def add(svc, bucket, v):
            by_service[svc] += v
            by_bucket[bucket] += v

        for r in self.inventory(country, ["fighter"], role="air_superiority"):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.air_total", "article.qty.air_superiority")
            if self.mode == "recompute":
                s = self._specs[eid]
                p = F.fighter_air_power(s["detect_rcs3_km"], s["aam_range_km"], s["detected_by_j16_km"],
                                        s["thrust_weight"], s["aam_count"], s["combat_radius_km"],
                                        s["max_speed_mach"], s["cruise_speed_mach"])
                self._compare(eid, "fighter_air_eq_fa18", p / ref_air, s.get("article.air_power_eq_fa18"))
                unit = p / ref_air
            add(r["service"], "fighter_air", unit * qty)
        for r in self.inventory(country, ["fighter"], role="ground_attack"):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.ground_total", "article.qty.ground_attack")
            if self.mode == "recompute":
                s = self._specs[eid]
                if "payload_1000km_kg" in s:
                    g = F.fighter_ground_power(s["ground_detected_km"], s["ground_radius_km"], s["ag_payload_t"],
                                               s["payload_1000km_kg"], s["ground_cruise_mach"])
                    self._compare(eid, "fighter_ground_eq_fa18", g / ref_gnd, s.get("article.ground_power_eq_fa18"))
                    unit = g / ref_gnd
            add(r["service"], "fighter_ground", unit * qty)
        for r in self.inventory(country, ["bomber"], role="ground_attack"):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.ground_total", "article.qty.ground_attack")
            add(r["service"], "bomber", unit * qty)
        for cat, bucket, qk in (("awacs", "awacs", "article.qty"), ("tanker_aircraft", "tanker", "article.qty"),
                                ("large_uav", "uav", "article.qty")):
            for r in self.inventory(country, [cat]):
                eid, qty = r["equipment_id"], r["quantity"]
                unit = self._snapshot_unit(eid, "article.power_total", qk)
                add(r["service"], bucket, (unit or 0.0) * qty)
        for r in self.inventory(country, ["ew_aircraft", "asw_aircraft"]):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.power_total", "article.qty")
            b = fn_bucket.get(self.spec(eid, "function"), "reconnaissance")
            add(r["service"], b, (unit or 0.0) * qty)
        sv, bk = dict(by_service), dict(by_bucket)
        air_superiority = sum(bk.get(b, 0.0) for b in ("fighter_air", "awacs", "electronic_warfare"))
        ground_strike = sum(bk.get(b, 0.0) for b in ("fighter_ground", "bomber"))
        other = sum(bk.get(b, 0.0) for b in ("tanker", "command_relay", "psychological", "reconnaissance",
                                              "anti_submarine", "uav"))
        return {"by_service": sv, "by_bucket": bk, "air_superiority": air_superiority,
                "ground_strike": ground_strike, "other": other, "total": sum(sv.values())}

    # ------------------------------------------------------------------ 地面
    def brigades(self, country: str) -> Dict[str, float]:
        out: Dict[str, float] = defaultdict(float)
        for r in self.toe.execute("SELECT * FROM brigade_class WHERE country=?", (country,)):
            if self.mode == "recompute" and r["equip_mult"] is not None:
                p = F.brigade_power(r["base_fire_scale"], r["equip_mult"], r["mech_mult"], r["info_mult"],
                                    r["logistics_mult"], r["readiness_mult"], bool(r["apply_logistics"]))
                self._compare(r["id"], "brigade_power", p, r["snapshot_power"])
                unit = p
            else:
                unit = r["snapshot_total"] / r["count"] if r["count"] else 0.0
            out[r["service"]] += unit * r["count"]
        return dict(out)

    def artillery_power(self, country: str) -> float:
        total = 0.0
        for r in self.inventory(country, None, role="article_equivalent", kinds=("in_toe",)):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.total_power", "article.qty.article_equivalent")
            if self.mode == "recompute" and self.spec(eid, "article.power_per_gun") is not None:
                unit = self.spec(eid, "article.power_per_gun")
            total += (unit or 0.0) * qty
        return total

    def air_defense(self, country: str) -> Dict[str, float]:
        out: Dict[str, float] = defaultdict(float)
        for r in self.inventory(country, ["sam_long", "sam_medium", "sam_short", "spaag"]):
            eid = r["equipment_id"]
            eq = self.spec(eid, "article.brigade_equiv")
            veh = self.spec(eid, "vehicles_per_unit")
            if eq is None or veh is None:
                continue
            out[r["service"]] += r["quantity"] * eq * veh
        return dict(out)

    def helicopters(self, country: str) -> Dict[str, float]:
        w = self.preset["ground"]["reserve_weights"]
        out: Dict[str, float] = defaultdict(float)
        for kind, weight in (("active", None), ("reserve", True)):
            for role in ("field", "national_guard", "sof", "airborne_corps", "hk_garrison", "marines",
                         "marines_reserve", "shipborne"):
                for r in self.inventory(country, None, role=role, kinds=(kind,)):
                    eq = self.spec(r["equipment_id"], "article.brigade_equiv_per_airframe")
                    if eq is None:
                        continue
                    wt = 1.0 if weight is None else w.get(r["service"], 0.5)
                    out[r["service"]] += r["quantity"] * wt * eq
        return dict(out)

    def rocket_force(self, country: str) -> float:
        total = 0.0
        for r in self.inventory(country, ["srbm", "mrbm", "irbm", "icbm", "cruise_missile_land"]):
            if r["service"] != "rocket":
                continue
            unit = self.spec(r["equipment_id"], "article.power")
            total += (unit or 0.0) * r["quantity"]
        return total

    def special_forces(self, country: str) -> Dict[str, float]:
        d = self.sf_snapshot.get(country) or {}
        return {k: float(v) for k, v in d.items() if k != "total"}

    def ground(self, country: str) -> Dict[str, object]:
        br, ad, he, sf = self.brigades(country), self.air_defense(country), self.helicopters(country), self.special_forces(country)
        art = self.artillery_power(country)
        return {"brigades": br, "air_defense": ad, "helicopters": he, "special_forces": sf, "artillery_power": art}

    # ------------------------------------------------------------------ 海军
    def sea(self, country: str) -> Dict[str, float]:
        p = self.preset["sea"]
        coef = self._ship_coefficients()
        surface = carriers = sub_power = 0.0
        for r in self.inventory(country, ["destroyer", "cruiser", "corvette", "frigate", "coastal_missile_battery",
                                           "naval_sam"]):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.power_total", "article.qty") or 0.0
            if self.mode == "recompute":
                weapons = {k[len("weapons."):]: v for k, v in self._specs[eid].items()
                           if k.startswith("weapons.") and isinstance(v, float)}
                rv = self.spec(eid, "article.radar_vls") or 0.0
                if weapons:
                    per = F.ship_firepower_vls(weapons, coef) + rv
                    self._compare(eid, "ship_power_per_ship", per, self.spec(eid, "article.power_per_ship"))
                    unit = per
            surface += unit * qty
        for r in self.inventory(country, ["aircraft_carrier", "amphibious_carrier"]):
            unit = self._snapshot_unit(r["equipment_id"], "article.power_vls", "article.qty")
            carriers += (unit or 0.0) * r["quantity"]
        for r in self.inventory(country, ["ssn", "ssg_n", "ssk"]):
            eid, qty = r["equipment_id"], r["quantity"]
            unit = self._snapshot_unit(eid, "article.power_total", "article.qty") or 0.0
            if self.mode == "recompute":
                s = self._specs[eid]
                if all(isinstance(s.get(k), float) for k in ("weapons_loaded", "endurance_5kn_days",
                                                              "endurance_15kn_days", "displacement_t", "detect_km")):
                    unit = F.submarine_power(s["weapons_loaded"], s["endurance_5kn_days"], s["endurance_15kn_days"],
                                             s["displacement_t"], s["detect_km"], s.get("payload_factor", 1.0))
                    self._compare(eid, "submarine_power_per_boat", unit, s.get("article.power_per_boat"))
            sub_power += unit * qty
        subs = sub_power * p["submarine_to_vls"]
        carve = (p.get("carve_outs") or {}).get(country, {})
        return {"surface": surface, "carriers": carriers, "submarines": subs,
                "total": surface + carriers + subs, "carve_outs": carve}

    def _ship_coefficients(self) -> Dict[str, float]:
        path = PRESET_DIR / "naval_coefficients.yaml"
        d = load_yaml(path)["ship_weapon_coefficients"]
        return {k: float(v) for k, v in d.items() if v is not None}

    # ------------------------------------------------------------------ 投送
    def projection(self, country: str) -> Dict[str, float]:
        air = sea = 0.0
        for r in self.inventory(country, ["transport_aircraft"]):
            u = self._snapshot_unit(r["equipment_id"], "article.throughput_24h_t", "article.qty")
            air += (u or 0.0) * r["quantity"]
        for r in self.inventory(country, ["amphibious_dock", "logistics_ship"]):
            u = self._snapshot_unit(r["equipment_id"], "article.throughput_24h_t", "article.qty")
            sea += (u or 0.0) * r["quantity"]
        return {"air": air, "sea": sea, "total": air + sea}

    # ------------------------------------------------------------------ 聚合
    def _service_of(self, country: str, svc: str) -> str:
        """军种归并：中国陆战队并入海军；其余原样。"""
        st = (self.preset.get("service_structure") or {}).get(country, {})
        if svc == "marines" and st.get("marines_in") == "navy":
            return "navy"
        return svc

    def _adjust(self, country: str, domain: str):
        if not self.article_compat:
            return []
        return [a for a in self.preset.get("article_compat_adjustments", [])
                if a["country"] == country and a["domain"] == domain]

    def _raw(self, country: str, ref_art_power: Optional[float] = None) -> Dict[str, object]:
        g = self.ground(country)
        for a in self._adjust(country, "ground"):
            g[a["component"]][a["service"]] = g[a["component"]].get(a["service"], 0.0) + a["add"]
            self.notes.append(f"文章兼容调整 {country} 地面/{a['component']}/{a['service']} {a['add']:+.3f}：{a['reason']}")
        us_equiv = self.preset["ground"]["us_artillery_brigade_equivalents"]
        art_ref = ref_art_power if ref_art_power is not None else g["artillery_power"]
        art_eq = g["artillery_power"] / art_ref * us_equiv if art_ref else 0.0
        by_service: Dict[str, float] = defaultdict(float)
        comp: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

        def put(svc, name, v):
            s = self._service_of(country, svc)
            by_service[s] += v
            comp[s][name] += v

        for svc, v in g["brigades"].items():
            put(svc, "brigades", v)
        for svc, v in g["air_defense"].items():
            put(svc, "air_defense", v)
        for svc, v in g["helicopters"].items():
            put(svc, "helicopters", v)
        for svc, v in g["special_forces"].items():
            put(svc, "special_forces", v)
        put("army", "artillery", art_eq)
        air = self.air(country)
        for a in self._adjust(country, "air"):
            air["by_service"][a["service"]] = air["by_service"].get(a["service"], 0.0) + a["add"]
            air["by_bucket"][a["bucket"]] = air["by_bucket"].get(a["bucket"], 0.0) + a["add"]
            air["total"] += a["add"]
            self.notes.append(f"文章兼容调整 {country} 空中/{a['bucket']}/{a['service']} {a['add']:+.1f}：{a['reason']}")
        air_by_service: Dict[str, float] = defaultdict(float)
        for svc, v in air["by_service"].items():
            air_by_service[self._service_of(country, svc)] += v
        sea = self.sea(country)
        proj = self.projection(country)
        for a in self._adjust(country, "projection"):
            proj[a["field"]] += a["add"]
            proj["total"] += a["add"]
            self.notes.append(f"文章兼容调整 {country} 投送/{a['field']} {a['add']:+.1f}：{a['reason']}")
        return {"ground_by_service": dict(by_service), "ground_components": {k: dict(v) for k, v in comp.items()},
                "ground_total": sum(by_service.values()), "artillery_power": g["artillery_power"],
                "air": air, "air_by_service": dict(air_by_service), "sea": sea, "projection": proj}

    def run(self, countries: Iterable[str] = ("CHN", "USA")) -> "Result":
        self.deviations = []
        self.notes = []
        P = self.preset
        scale = P["reference_scale"]
        ref = self.ref
        countries = list(countries)
        allc = list(dict.fromkeys([ref] + countries))
        ref_raw = self._raw(ref)
        raw = {c: (ref_raw if c == ref else self._raw(c, ref_raw["artillery_power"])) for c in allc}
        R = raw[ref]
        out: Dict[str, dict] = {}
        for c in allc:
            r = raw[c]
            ground_total = r["ground_total"] / R["ground_total"] * scale["ground"]
            gshare = {s: v / R["ground_total"] * scale["ground"] for s, v in r["ground_by_service"].items()}
            air_total = r["air"]["total"] / R["air"]["total"] * scale["air"]
            ashare = {s: v / R["air"]["total"] * scale["air"] for s, v in r["air_by_service"].items()}
            # 海上：基准国先划出陆军/陆战队对海力量
            sea_ref_total = R["sea"]["total"]
            carve = r["sea"]["carve_outs"] or {}
            sea_total = r["sea"]["total"] / sea_ref_total * scale["sea"]
            sshare = {"navy": (r["sea"]["total"] - sum(carve.values())) / sea_ref_total * scale["sea"]}
            for svc, v in carve.items():
                sshare[svc] = v / sea_ref_total * scale["sea"]
            sshare = {self._service_of(c, k): v for k, v in sshare.items()}
            # 投送
            pr, prr = r["projection"], R["projection"]
            proj_total = pr["total"] / prr["total"] * scale["projection"] if prr["total"] else 0.0
            if c in P["projection"].get("bonus_countries", []):
                third = P["projection"]["us_airsea_share"]
                pshare = {"airforce": pr["air"] / pr["total"] * scale["projection"] * third,
                          "navy": pr["sea"] / pr["total"] * scale["projection"] * third}
                bonus_army = P["projection"]["us_forward_deployment_bonus"] * scale["projection"]
                bonus_base = P["projection"]["us_base_bonus"] * scale["projection"]
            else:
                pshare = {"airforce": pr["air"] / prr["total"] * scale["projection"],
                          "navy": pr["sea"] / prr["total"] * scale["projection"]}
                bonus_army = bonus_base = 0.0
            # 火箭军（按陆军炮兵折算）与太空军（按预算折算）
            rocket_power = self.rocket_force(c)
            if self.mode == "snapshot":
                frac = P["ground"]["rocket_force_us_ground_fraction"] * rocket_power / P["ground"]["rocket_force_reference_power"]
            else:
                us_eq = P["ground"]["us_artillery_brigade_equivalents"]
                frac = (rocket_power / R["artillery_power"] * us_eq / R["ground_total"]) if R["artillery_power"] else 0.0
            rocket = frac * scale["ground"]
            budgets = (P["space"]["budgets_busd"] or {}).get(c)
            airforce_total = ashare.get("airforce", 0.0) + pshare.get("airforce", 0.0) + gshare.get("airforce", 0.0)
            space = airforce_total / budgets["air_force"] * budgets["space_force"] if budgets else 0.0
            services = defaultdict(float)
            for src in (gshare, ashare, sshare, pshare):
                for k, v in src.items():
                    services[k] += v
            services["army"] += bonus_army
            services["bases"] = bonus_base
            services["rocket"] = rocket
            services["space"] = space
            proj_total_c = pr["total"] / prr["total"] * scale["projection"] if prr["total"] else 0.0
            total = ground_total + air_total + sea_total + proj_total_c + rocket + space
            out[c] = {"ground": ground_total, "projection": proj_total_c, "air": air_total, "sea": sea_total,
                      "aerospace": rocket + space, "rocket": rocket, "space": space, "total": total,
                      "services": dict(services), "ground_share": gshare, "air_share": ashare,
                      "sea_share": sshare, "projection_share": pshare,
                      "components": {"ground": r["ground_components"], "air_buckets": r["air"]["by_bucket"],
                                     "sea": {k: v for k, v in r["sea"].items() if k != "carve_outs"}}}
        for c in allc:
            out[c]["ratio_to_ref"] = out[c]["total"] / out[ref]["total"]
        return Result(self.mode, ref, countries, out, self.deviations, self.notes)


class Result:
    def __init__(self, mode, ref, countries, data, deviations, notes):
        self.mode, self.ref, self.countries, self.data = mode, ref, countries, data
        self.deviations, self.notes = deviations, notes

    def __getitem__(self, k):
        return self.data[k]

    def render(self) -> str:
        names = {"ground": "地面力量", "projection": "地面力量远程投送", "air": "空中力量", "sea": "海上力量",
                 "aerospace": "空天力量（火箭军/太空军）", "total": "总军力"}
        cs = list(dict.fromkeys(self.countries))
        lines = [f"模式：{self.mode}；基准国：{self.ref}", "{:<24}".format("") + "".join(f"{c:>10}" for c in cs)]
        for k, label in names.items():
            lines.append("{:<20}".format(label) + "".join(f"{self.data[c][k]:>10.1f}" for c in cs))
        lines.append("{:<20}".format("比值") + "".join(f"{self.data[c]['ratio_to_ref'] * 100:>9.2f}%" for c in cs))
        return "\n".join(lines)
