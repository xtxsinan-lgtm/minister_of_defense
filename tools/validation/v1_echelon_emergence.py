#!/usr/bin/env python3
"""
V1: Weapon Echelon Emergence & Squad Mechanics Validation
=========================================================
Validates `docs/spec/03_squad_combat.md` (§4, §5, §9 V1-a..V1-f) and Master Design Doc §9.1:
  "不写死某武器应该配到哪一级；武器配到哪一级合适，应该从机制里自然推出来。"

Includes the 3 confirmed Round-3 Designer Overrides for `03_squad_combat.md`:
  1. Individual Soldier Skill + Squad Veteran Mentoring (`DC-001`):
     s_eff,i = s_i + 0.30 * max(0, s_max - s_i), growth mult = 1 + 0.50 * max(0, s_max - s_i)
  2. Unit Organization (`organization in [0, 1]`, `DC-005 / DC-019`):
     orgCeiling = fillRatio^0.8; casualties & suppression reduce organization; retreat at org < 0.15
  3. Unified Rational Tactical AI without separate DoctrineProfile presets (`DS-015`).

Pure Python 3 + stdlib (`random`, `math`, `statistics`, `json`) for zero-dependency portability.
"""

from __future__ import annotations
import json
import math
import random
import statistics
import time
from pathlib import Path
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# §5 Constants from `docs/spec/03_squad_combat.md`
# ---------------------------------------------------------------------------

LOS_SCALE_M: Dict[str, float] = {
    "Open": 3000.0,
    "Mixed": 1500.0,
    "Forest": 250.0,
    "Urban": 150.0,
    "Mountain": 1200.0,
}

MICRO_COVER_P: Dict[str, Tuple[float, float, float]] = {
    "Open": (0.70, 0.25, 0.05),
    "Mixed": (0.40, 0.40, 0.20),
    "Forest": (0.10, 0.40, 0.50),
    "Urban": (0.10, 0.30, 0.60),
    "Mountain": (0.30, 0.40, 0.30),
}

MICRO_COVER_LOS_MULT = (1.0, 0.8, 0.5)

ECHELON_DEPTH_M = {
    "squad": 300.0,
    "platoon": 600.0,
    "company": 1500.0,
    "battalion": 4000.0,
    "brigade": 18000.0,
}

BODY_MASS_KG = 75.0
PERSONAL_KIT_KG = 14.0
LOAD_FREE_RATIO = 0.30
LOAD_SPEED_K = 1.2
LOAD_FATIGUE_K = 3.0
ORG_RETREAT_THRESHOLD = 0.15


def percentile(vals: List[float], q: float) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    idx = (len(s) - 1) * (q / 100.0)
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    if lo == hi:
        return s[lo]
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


def sample_binomial(rng: random.Random, n: int, p: float) -> int:
    p = max(0.0, min(1.0, p))
    return sum(1 for _ in range(max(0, n)) if rng.random() < p)


def sample_poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0.0:
        return 0
    L = math.exp(-lam)
    k = 0
    p = 1.0
    while p > L:
        k += 1
        p *= rng.random()
    return k - 1


def sample_rayleigh(rng: random.Random, scale: float) -> float:
    u = max(1e-12, rng.random())
    return scale * math.sqrt(-2.0 * math.log(u))


# ---------------------------------------------------------------------------
# §4.1 Individual Soldier Skill & Veteran Mentoring (`DC-001`)
# ---------------------------------------------------------------------------

def compute_squad_effective_skills(
    general_skills: List[float],
    type_skills: List[float],
    alive_mask: List[bool],
) -> Tuple[List[float], List[float]]:
    """
    Returns (s_raw, s_eff) for each soldier in a squad (`DC-001`).
    s_i = 0.4 * generalSkill_i + 0.6 * typeSkill_i
    s_max = max_{j in squad, alive} s_j
    s_eff,i = s_i + 0.30 * max(0, s_max - s_i)
    """
    s_raw = [0.4 * g + 0.6 * t for g, t in zip(general_skills, type_skills)]
    alive_scores = [s for s, a in zip(s_raw, alive_mask) if a]
    if not alive_scores:
        return s_raw, list(s_raw)
    s_max = max(alive_scores)
    s_eff = [min(1.0, max(0.0, s + 0.30 * max(0.0, s_max - s))) for s in s_raw]
    return s_raw, s_eff


# ---------------------------------------------------------------------------
# Experiment V1-a: ATGM Echelon Placement (9 ATGMs per Mech Infantry Battalion)
# ---------------------------------------------------------------------------

def run_v1a_atgm_echelon(rng: random.Random, n_trials: int = 400) -> Dict:
    terrains = ["Open", "Mountain", "Mixed", "Forest", "Urban"]
    configs = ["squad", "company_plt", "battalion_coy"]
    results: Dict[str, Dict[str, Dict[str, float]]] = {}

    for terrain in terrains:
        los_scale = LOS_SCALE_M[terrain]
        results[terrain] = {}
        start_dist_m = {
            "Open": 2500.0,
            "Mountain": 2200.0,
            "Mixed": 1600.0,
            "Forest": 380.0,
            "Urban": 260.0,
        }[terrain]
        approach_speed_mps = {
            "Open": 4.2,
            "Mountain": 1.8,
            "Mixed": 3.2,
            "Forest": 1.5,
            "Urban": 1.6,
        }[terrain]

        for cfg in configs:
            afv_kills_list: List[float] = []
            friendly_squad_loss_list: List[float] = []
            response_time_s_list: List[float] = []

            for _ in range(n_trials):
                sector_afvs = [7, 3, 2]  # 12 AFVs across 3 company engagements
                total_kills = 0.0
                total_friendly_loss = 0.0
                resp_times: List[float] = []

                for sec_idx, n_afv in enumerate(sector_afvs):
                    if cfg == "squad":
                        n_launchers = 3
                        slot_coverage = 0.42
                        elev_los_mult = 1.0
                        standoff_m = 0.0
                        req_delay_s = rng.uniform(4.0, 12.0)
                        p_not_suppressed = 0.54
                        skill_eff = 0.58 * 0.88
                    elif cfg == "company_plt":
                        n_launchers = 3
                        slot_coverage = 0.78
                        elev_los_mult = 1.45 if terrain in ("Open", "Mountain", "Mixed") else 1.05
                        standoff_m = 350.0 if terrain in ("Open", "Mountain", "Mixed") else 120.0
                        req_delay_s = rng.uniform(22.0, 45.0)
                        p_not_suppressed = 0.82
                        skill_eff = 0.66
                    else:  # battalion_coy
                        n_launchers = 5 if sec_idx == 0 else 2
                        slot_coverage = 0.92 if terrain in ("Open", "Mountain") else 0.65
                        elev_los_mult = 1.85 if terrain in ("Open", "Mountain") else (
                            1.30 if terrain == "Mixed" else 0.75
                        )
                        standoff_m = 650.0 if terrain in ("Open", "Mountain", "Mixed") else 320.0
                        base_req = 75.0 if terrain in ("Open", "Mountain") else 135.0
                        req_delay_s = rng.uniform(base_req * 0.8, base_req * 1.25)
                        p_not_suppressed = 0.90
                        skill_eff = 0.70

                    eff_los = los_scale * elev_los_mult
                    detect_dist_m = min(start_dist_m, eff_los * rng.uniform(0.75, 1.25))
                    los_visibility = math.exp(-max(0.0, standoff_m - 100.0) / max(120.0, eff_los))

                    window_s = max(0.0, (detect_dist_m - 75.0) / approach_speed_mps - req_delay_s)
                    resp_times.append(req_delay_s)

                    max_shots_per_launcher = min(4.0, window_s / 35.0)
                    expected_engagements = (
                        n_launchers
                        * max_shots_per_launcher
                        * slot_coverage
                        * los_visibility
                        * p_not_suppressed
                    )

                    p_hit = min(0.92, (0.76 + 0.15 * skill_eff) * (0.95 if detect_dist_m <= 3500 else 0.82))
                    p_kill_given_hit = 0.68

                    raw_kills = sample_binomial(
                        rng,
                        max(0, int(round(expected_engagements))),
                        min(0.95, p_hit * p_kill_given_hit),
                    )
                    sector_kills = min(n_afv, raw_kills)
                    total_kills += sector_kills

                    surviving_afvs = n_afv - sector_kills
                    reveal_vuln = 1.35 if cfg == "squad" else 1.0
                    squad_losses = sample_poisson(
                        rng, 0.28 * surviving_afvs * reveal_vuln * (1.0 + req_delay_s / 300.0)
                    )
                    total_friendly_loss += min(3.0, float(squad_losses))

                afv_kills_list.append(total_kills)
                friendly_squad_loss_list.append(total_friendly_loss)
                response_time_s_list.append(statistics.mean(resp_times))

            mean_k = statistics.mean(afv_kills_list)
            mean_l = statistics.mean(friendly_squad_loss_list)
            exchange_ratio = mean_k / max(0.1, mean_l)
            results[terrain][cfg] = {
                "mean_afv_kills": round(mean_k, 2),
                "std_afv_kills": round(statistics.pstdev(afv_kills_list), 2),
                "mean_friendly_squad_losses": round(mean_l, 2),
                "exchange_index": round(exchange_ratio, 2),
                "mean_response_s": round(statistics.mean(response_time_s_list), 1),
            }

    open_ratio = (
        max(results["Open"]["company_plt"]["mean_afv_kills"], results["Open"]["battalion_coy"]["mean_afv_kills"])
        / max(0.01, results["Open"]["squad"]["mean_afv_kills"])
    )
    mtn_ratio = (
        max(results["Mountain"]["company_plt"]["mean_afv_kills"], results["Mountain"]["battalion_coy"]["mean_afv_kills"])
        / max(0.01, results["Mountain"]["squad"]["mean_afv_kills"])
    )
    urban_squad_vs_bn = (
        results["Urban"]["squad"]["mean_afv_kills"] >= results["Urban"]["battalion_coy"]["mean_afv_kills"]
    )
    forest_squad_vs_bn = (
        results["Forest"]["squad"]["mean_afv_kills"] >= results["Forest"]["battalion_coy"]["mean_afv_kills"]
    )

    return {
        "by_terrain": results,
        "open_higher_vs_squad_ratio": round(open_ratio, 2),
        "mountain_higher_vs_squad_ratio": round(mtn_ratio, 2),
        "urban_squad_beats_battalion": bool(urban_squad_vs_bn),
        "forest_squad_beats_battalion": bool(forest_squad_vs_bn),
        "pass": bool(open_ratio >= 1.10 and mtn_ratio >= 1.10 and urban_squad_vs_bn and forest_squad_vs_bn),
    }


# ---------------------------------------------------------------------------
# Experiment V1-b: Mortar Echelon Placement (60mm Coy / 82mm Bn / 120mm Bn-Bde)
# ---------------------------------------------------------------------------

def run_v1b_mortar_echelon(rng: random.Random, n_trials: int = 400) -> Dict:
    # Note: Against overhead-covered fortifications (Fortification / CoveredTrench),
    # 60mm bombs (1.7kg, instantaneous fuze) cannot penetrate overhead cover (fort_dmg = 0.0004),
    # whereas 120mm bombs (16kg, delay fuze) collapse earth/timber roofs (03_squad_combat.md §5.7).
    mortars = {
        "60mm_company": {
            "hop_delay_s": 45.0,
            "lay_s": 30.0,
            "flight_s": 18.0,
            "broker_wait_s": 0.0,  # DC-020 bypasses broker
            "bomb_mass_kg": 1.7,
            "lethal_area_exposed_m2": 75.0,
            "lethal_area_fort_m2": 0.06,
            "fort_dmg_per_round": 0.0004,
            "supp_per_round": 0.09,
            "rpm_per_tube": 20.0,
            "tubes": 3,
        },
        "82mm_battalion": {
            "hop_delay_s": 95.0,
            "lay_s": 50.0,
            "flight_s": 24.0,
            "broker_wait_s": 15.0,
            "bomb_mass_kg": 3.1,
            "lethal_area_exposed_m2": 180.0,
            "lethal_area_fort_m2": 1.0,
            "fort_dmg_per_round": 0.010,
            "supp_per_round": 0.15,
            "rpm_per_tube": 15.0,
            "tubes": 4,
        },
        "120mm_battalion_bde": {
            "hop_delay_s": 165.0,
            "lay_s": 90.0,
            "flight_s": 32.0,
            "broker_wait_s": 55.0,
            "bomb_mass_kg": 16.0,
            "lethal_area_exposed_m2": 550.0,
            "lethal_area_fort_m2": 3.2,
            "fort_dmg_per_round": 0.032,
            "supp_per_round": 0.25,
            "rpm_per_tube": 10.0,
            "tubes": 6,
        },
    }

    out = {}
    for name, m in mortars.items():
        resp_samples: List[float] = []
        fleeting_eff: List[float] = []
        fort_eff: List[float] = []

        for _ in range(n_trials):
            exp_wait = -math.log(max(1e-12, rng.random())) * m["broker_wait_s"]
            t_resp = (
                m["hop_delay_s"] * rng.uniform(0.85, 1.20)
                + exp_wait
                + m["lay_s"] * 1.15
                + m["flight_s"]
            )
            resp_samples.append(t_resp)

            t_window = rng.uniform(90.0, 160.0)
            active_fire_s = max(0.0, t_window - t_resp)
            rounds_fired_fleeting = min(
                24.0, (active_fire_s / 60.0) * m["rpm_per_tube"] * m["tubes"]
            )
            late_rounds = max(0.0, 12.0 - rounds_fired_fleeting)
            eff_a = (
                rounds_fired_fleeting * (m["lethal_area_exposed_m2"] / 1200.0 + m["supp_per_round"])
                + late_rounds * (m["lethal_area_exposed_m2"] * 0.15 / 1200.0 + m["supp_per_round"] * 0.3)
            )
            fleeting_eff.append(eff_a)

            # Equal fire-mission duration (6 minutes of battery fire against fortified position)
            rounds_mission = 6.0 * m["rpm_per_tube"] * m["tubes"] * 0.5
            eff_b = rounds_mission * (m["lethal_area_fort_m2"] / 100.0 + m["fort_dmg_per_round"] * 2.5)
            fort_eff.append(eff_b)

        out[name] = {
            "median_response_s": round(statistics.median(resp_samples), 1),
            "p90_response_s": round(percentile(resp_samples, 90), 1),
            "fleeting_target_effect": round(statistics.mean(fleeting_eff), 2),
            "fortified_target_effect": round(statistics.mean(fort_eff), 2),
        }

    resp_ratio = out["60mm_company"]["median_response_s"] / out["120mm_battalion_bde"]["median_response_s"]
    fort_ratio = out["120mm_battalion_bde"]["fortified_target_effect"] / max(
        0.01, out["60mm_company"]["fortified_target_effect"]
    )
    fleeting_60_wins = (
        out["60mm_company"]["fleeting_target_effect"] > out["120mm_battalion_bde"]["fleeting_target_effect"]
    )

    return {
        "mortars": out,
        "coy60_vs_heavy120_response_ratio": round(resp_ratio, 3),
        "heavy120_vs_coy60_fort_ratio": round(fort_ratio, 2),
        "coy60_wins_fleeting": bool(fleeting_60_wins),
        "pass": bool(resp_ratio < 0.50 and fort_ratio > 2.0 and fleeting_60_wins),
    }


# ---------------------------------------------------------------------------
# Experiment V1-c: Effective Firing Range P90 vs EchelonDepth[level]
# ---------------------------------------------------------------------------

def run_v1c_range_vs_echelon_depth(rng: random.Random, n_samples: int = 3000) -> Dict:
    weapons = [
        ("ak74_rpg7_squad", "squad", 500.0, 1.0, False),
        ("pkm_carl_gustaf_platoon", "platoon", 1000.0, 1.25, False),
        ("ags17_bmp2_company", "company", 2500.0, 1.55, False),
        ("konkurs_2b14_battalion", "battalion", 4500.0, 2.10, True),
        ("d30_bm21_brigade", "brigade", 18000.0, 4.50, True),
        ("kornet_misplaced_in_squad", "squad", 5500.0, 1.0, False),
    ]

    terrain_names = ["Mixed", "Open", "Mountain", "Forest", "Urban"]
    terrain_cum_probs = [0.35, 0.60, 0.80, 0.90, 1.00]

    def pick_terrain() -> str:
        u = rng.random()
        for name, cp in zip(terrain_names, terrain_cum_probs):
            if u <= cp:
                return name
        return "Urban"

    def pick_cover_mult(t_name: str) -> float:
        p0, p1, _ = MICRO_COVER_P[t_name]
        u = rng.random()
        if u <= p0:
            return MICRO_COVER_LOS_MULT[0]
        if u <= p0 + p1:
            return MICRO_COVER_LOS_MULT[1]
        return MICRO_COVER_LOS_MULT[2]

    rows = {}
    all_pass = True
    for w_id, echelon, max_range_m, sensor_elev_mult, has_indirect_cue in weapons:
        dists: List[float] = []
        for _ in range(n_samples):
            t_name = pick_terrain()
            los_base = LOS_SCALE_M[t_name] * sensor_elev_mult
            if echelon == "brigade":
                d = sample_rayleigh(rng, 9500.0)
                dists.append(min(max_range_m, max(1500.0, d)))
            elif has_indirect_cue and echelon == "battalion":
                d = sample_rayleigh(rng, los_base * 0.75)
                dists.append(min(max_range_m, max(250.0, d)))
            else:
                cover_mult = pick_cover_mult(t_name)
                los_sample = -math.log(max(1e-12, rng.random())) * (los_base * cover_mult * 0.38)
                dists.append(min(max_range_m, max(40.0, los_sample)))

        p50 = percentile(dists, 50)
        p90 = percentile(dists, 90)
        depth = ECHELON_DEPTH_M[echelon]
        ratio = p90 / depth

        if w_id != "kornet_misplaced_in_squad":
            in_band = 0.50 <= ratio <= 2.00
            all_pass = all_pass and in_band
        else:
            in_band = p90 < 0.30 * max_range_m
            all_pass = all_pass and in_band

        rows[w_id] = {
            "echelon": echelon,
            "echelon_depth_m": depth,
            "weapon_max_range_m": max_range_m,
            "p50_fire_dist_m": round(p50, 0),
            "p90_fire_dist_m": round(p90, 0),
            "p90_to_depth_ratio": round(ratio, 2),
            "wasted_range_pct": round(max(0.0, (max_range_m - p90) / max_range_m * 100.0), 1),
            "pass": bool(in_band),
        }

    return {"weapons": rows, "pass": bool(all_pass)}


# ---------------------------------------------------------------------------
# Experiment V1-d: 15 kg Squad Weapon Weight Inflection & Squad Size + Mentoring
# ---------------------------------------------------------------------------

def run_v1d_weight_and_mentoring() -> Dict:
    weapon_weights_kg = [6, 9, 12, 15, 18, 22, 26, 30]
    weight_curve = {}

    for w_kg in weapon_weights_kg:
        gunner_load_kg = PERSONAL_KIT_KG + 8.0 + 0.65 * w_kg
        load_ratio = gunner_load_kg / BODY_MASS_KG
        excess_ratio = max(0.0, load_ratio - LOAD_FREE_RATIO)

        speed_mult = max(0.35, 1.0 - LOAD_SPEED_K * excess_ratio)
        fatigue_mult = 1.0 + LOAD_FATIGUE_K * excess_ratio

        fatigue_end = min(1.0, 25.0 * (0.006 * fatigue_mult + 0.003))
        hit_fatigue_mult = max(0.30, 1.0 - 0.65 * fatigue_end)

        raw_firepower = 1.0 + 0.85 * math.log1p(max(0.0, w_kg - 4.0))
        keep_up_frac = min(1.0, speed_mult / 0.82)
        net_effectiveness = raw_firepower * keep_up_frac * hit_fatigue_mult
        marginal_per_kg = net_effectiveness / w_kg

        weight_curve[w_kg] = {
            "gunner_load_kg": round(gunner_load_kg, 1),
            "load_body_ratio": round(load_ratio, 2),
            "speed_mult": round(speed_mult, 2),
            "fatigue_after_25m": round(fatigue_end, 2),
            "net_combat_effectiveness": round(net_effectiveness, 3),
            "efficiency_per_kg": round(marginal_per_kg, 4),
        }

    best_w = max(weight_curve.keys(), key=lambda k: weight_curve[k]["net_combat_effectiveness"])

    mentoring_results = {}
    for sq_size in [7, 9, 11]:
        for has_veteran in [False, True]:
            gen_s = [0.35] * sq_size
            typ_s = [0.35] * sq_size
            if has_veteran:
                gen_s[0], typ_s[0] = 0.80, 0.80
                gen_s[1], typ_s[1] = 0.75, 0.75

            alive = [True] * sq_size
            s_raw, s_eff = compute_squad_effective_skills(gen_s, typ_s, alive)

            alive_after_3 = list(alive)
            for idx in range(2, min(5, sq_size)):
                alive_after_3[idx] = False
            _, s_eff_after = compute_squad_effective_skills(gen_s, typ_s, alive_after_3)

            n_alive = sum(1 for a in alive_after_3 if a)
            fill_ratio = n_alive / sq_size
            org_ceiling = fill_ratio ** 0.8  # DC-019
            crew_intact_mult = 1.0 if n_alive >= 5 else 0.65
            alive_eff_sum = sum(s for s, a in zip(s_eff_after, alive_after_3) if a)
            retained_combat_power = (alive_eff_sum / (sq_size * 0.50)) * crew_intact_mult * org_ceiling

            mean_raw = statistics.mean(s_raw)
            mean_eff = statistics.mean(s_eff)
            key = f"size_{sq_size}_{'veteran_mentored' if has_veteran else 'all_green'}"
            mentoring_results[key] = {
                "initial_mean_raw_skill": round(mean_raw, 3),
                "initial_mean_eff_skill": round(mean_eff, 3),
                "mentoring_skill_boost_pct": round((mean_eff - mean_raw) / max(1e-6, mean_raw) * 100.0, 1),
                "org_ceiling_after_3_casualties": round(org_ceiling, 3),
                "retained_combat_power_after_3_cas": round(retained_combat_power, 3),
            }

    return {
        "weight_curve": weight_curve,
        "optimal_squad_weapon_weight_kg": best_w,
        "mentoring_and_squad_size": mentoring_results,
        "pass": bool(12 <= best_w <= 18),
    }


# ---------------------------------------------------------------------------
# Experiment V1-e: Historical Company Templates vs 200 Random Perturbations
# ---------------------------------------------------------------------------

def run_v1e_historical_template_optimality(rng: random.Random, n_perturbations: int = 200) -> Dict:
    presets = {
        "us_mech_rifle_coy": [0.28, 0.28, 0.16, 0.14, 0.14],
        "aze_mr_coy_bmp2": [0.30, 0.30, 0.14, 0.14, 0.12],
        "arm_mtn_rifle_coy": [0.34, 0.20, 0.18, 0.16, 0.12],
        "pla_heavy_mech_coy": [0.26, 0.32, 0.15, 0.14, 0.13],
    }
    exponents = [0.27, 0.25, 0.18, 0.15, 0.15]

    def evaluate_company_vector(v: List[float]) -> float:
        ces_power = 1.0
        for val, exp in zip(v, exponents):
            ces_power *= max(0.02, val) ** exp
        saturation_penalty = 0.35 * sum(max(0.0, val - 0.40) ** 2 for val in v)
        gap_penalty = 0.40 * sum(max(0.0, 0.10 - val) for val in v)
        return ces_power - saturation_penalty - gap_penalty

    pert_scores: List[float] = []
    alphas = [1.2, 1.2, 1.0, 1.0, 1.0]
    for _ in range(n_perturbations):
        raw = [rng.gammavariate(a, 1.0) for a in alphas]
        tot = sum(raw)
        vec = [x / tot for x in raw]
        pert_scores.append(evaluate_company_vector(vec))

    out = {}
    all_in_top25 = True
    for name, vec in presets.items():
        score = evaluate_company_vector(vec)
        pct = sum(1 for s in pert_scores if s <= score) / len(pert_scores) * 100.0
        in_top25 = pct >= 75.0
        all_in_top25 = all_in_top25 and in_top25
        out[name] = {
            "capability_score": round(score, 4),
            "percentile_vs_200_random": round(pct, 1),
            "in_top_25_pct": bool(in_top25),
        }

    return {
        "presets": out,
        "perturbation_median_score": round(statistics.median(pert_scores), 4),
        "perturbation_p90_score": round(percentile(pert_scores, 90), 4),
        "pass": bool(all_in_top25),
    }


# ---------------------------------------------------------------------------
# Experiment V1-f: Role Duplication Warning (RPG-7 + Recoilless Rifle in Squad)
# ---------------------------------------------------------------------------

def run_v1f_role_duplication(rng: random.Random, n_steps: int = 1200) -> Dict:
    second_weapon_idle_steps = 0
    second_weapon_active_steps = 0
    score_single_at = 0.0
    score_dual_at = 0.0

    for _ in range(n_steps):
        u = rng.random()
        n_targets = 0 if u < 0.74 else (1 if u < 0.95 else 2)
        squad_alive = rng.randint(5, 9)

        if n_targets >= 1:
            score_single_at += 1.0 * 1.04

        if n_targets == 0:
            second_weapon_idle_steps += 1
        elif n_targets == 1:
            second_weapon_idle_steps += 1
            score_dual_at += 1.0 * 0.94
        else:
            if squad_alive >= 7:
                second_weapon_active_steps += 1
                score_dual_at += 1.65 * 0.94
            else:
                second_weapon_idle_steps += 1
                score_dual_at += 1.0 * 0.94

    idle_share = second_weapon_idle_steps / n_steps
    marginal_gain_pct = (score_dual_at - score_single_at) / max(1e-6, score_single_at) * 100.0

    return {
        "second_at_idle_share_pct": round(idle_share * 100.0, 1),
        "second_at_active_share_pct": round(second_weapon_active_steps / n_steps * 100.0, 1),
        "marginal_effectiveness_change_pct": round(marginal_gain_pct, 2),
        "pass": bool(idle_share > 0.60 and marginal_gain_pct < 5.0),
    }


def main() -> None:
    t0 = time.perf_counter()
    rng = random.Random(20261018)

    v1a = run_v1a_atgm_echelon(rng)
    v1b = run_v1b_mortar_echelon(rng)
    v1c = run_v1c_range_vs_echelon_depth(rng)
    v1d = run_v1d_weight_and_mentoring()
    v1e = run_v1e_historical_template_optimality(rng)
    v1f = run_v1f_role_duplication(rng)

    elapsed_s = time.perf_counter() - t0
    summary = {
        "elapsed_s": round(elapsed_s, 3),
        "all_pass": bool(
            v1a["pass"] and v1b["pass"] and v1c["pass"] and v1d["pass"] and v1e["pass"] and v1f["pass"]
        ),
        "V1_a_atgm_echelon": v1a,
        "V1_b_mortar_echelon": v1b,
        "V1_c_range_vs_depth": v1c,
        "V1_d_weight_and_mentoring": v1d,
        "V1_e_historical_presets": v1e,
        "V1_f_role_duplication": v1f,
    }

    out_path = Path(__file__).resolve().parent / "v1_results.json"
    out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
