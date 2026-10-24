"""叶子级战力公式 —— 逐条对应作者表格中的公式（括号内为“表名!列”）。

约定：
  * 所有函数是纯函数，只依赖参数，便于单元测试与审阅。
  * “等效 F/A-18 战力”：以 F/A-18E/F 为 1，是文章里空军各类固定翼之间的统一尺度。
  * 海军统一折算成“等效垂发单元（VLS）”。
"""
from __future__ import annotations

import math
from typing import Dict, Optional

# --------------------------------------------------------------------- 乘数档位
STEP_PROTECTION = 1.05   # rating_scales.yaml：防护/火力/火控每升一档 ×1.05
STEP_LEVEL = 1.1         # 机械化/信息化/后勤每档 ×1.1


def geometric_mean(values) -> float:
    vs = list(values)
    return math.prod(vs) ** (1.0 / len(vs))


# --------------------------------------------------------------------- 陆军
def heavy_equipment_equivalents(c: Dict[str, float]) -> float:
    """重装备折算成“满编下车步兵班”（规模!R 列）。

    坦克(3人)×2 + 3人战斗车辆 + 2人战斗车辆/2 + 105/122/130炮×1.5 + 155×2.5 + 迫击炮×1 + 反坦克车×1.5
    + 远程火箭炮×2.5 + 火箭炮×1.5 + 防空导弹×2.5 + 35高炮×1.5 + 25高炮×1.5
    """
    g = lambda k: c.get(k, 0.0)
    return (g("tank3") * 2 + g("veh3") + g("veh2") / 2 + g("gun105_122") * 1.5 + g("gun155") * 2.5
            + g("mortar") + g("atgm_vehicle") * 1.5 + g("mrl_long") * 2.5 + g("mrl") * 1.5
            + g("sam") * 2.5 + g("aa35") * 1.5 + g("aa25") * 1.5)


def brigade_scale(dismounted_squads: float, heavy: float, ibct_total: float) -> float:
    """基础火力规模 = (下车步兵班 + 重装备等效班) / IBCT 同口径总和（规模!T 列）。"""
    return (dismounted_squads + heavy) / ibct_total


def brigade_power(base_fire_scale: float, equip: float, mech: float, info: float, logistics: float,
                  readiness: float, apply_logistics: bool = True) -> float:
    """每旅战力 = 基础火力规模 × 装备乘数 × 机械化 × 信息化 × 后勤 × 准备度（乘数!I 列）。

    注：表格中“团”级各行的 I 列没有乘后勤乘数（apply_logistics=False），这里原样保留以复现文章。
    """
    p = base_fire_scale * equip * mech * info * readiness
    return p * logistics if apply_logistics else p


def equipment_multiplier(*component_multipliers: float, exponent: Optional[float] = None) -> float:
    """装备乘数 = 防护、火力、火控、机动等分项乘数的几何平均（乘数!D 列，如 (B9*E7*G13*G8*I10*I10)^0.5）。"""
    n = len(component_multipliers)
    return math.prod(component_multipliers) ** (exponent if exponent is not None else 1.0 / n)


def reserve_weighted(active: float, reserve: float, reserve_weight: float) -> float:
    """现役 + 预备役×权重（直升机表：陆军国民警卫队 0.5，陆战队预备役 1/3）。"""
    return active + reserve * reserve_weight


# --------------------------------------------------------------------- 空军
def fighter_air_power(detect_rcs3_km: float, aam_range_km: float, detected_by_km: float, thrust_weight: float,
                      aam_count: float, radius_km: float, max_mach: float, cruise_mach: float) -> float:
    """制空战力（战斗机!AI 列）。

    (探测距离×导弹射程) × (1/被探测距离)^0.75 × 推重比^0.5 × (挂弹数×作战半径×最大马赫×巡航马赫)^0.25
    """
    return (detect_rcs3_km * aam_range_km) * (1.0 / detected_by_km) ** 0.75 * thrust_weight ** 0.5 \
        * (aam_count * radius_km * max_mach * cruise_mach) ** 0.25


def fighter_ground_power(detected_km: float, radius_2_5t_km: float, ag_payload_t: float,
                         payload_1000km_kg: float, cruise_mach: float) -> float:
    """对地战力（战斗机!AL 列）。

    (1/被探测距离)^0.75 × (2.5吨半径×武器挂载量×1000km半径挂载量/1000)^0.5 × 巡航马赫^0.25
    """
    return (1.0 / detected_km) ** 0.75 * (radius_2_5t_km * ag_payload_t * payload_1000km_kg / 1000.0) ** 0.5 \
        * cruise_mach ** 0.25


def bomber_ground_power(cruise_mach: float, payload_t: float, radius_km: float, detected_km: float) -> float:
    """轰炸攻击机对地战力（轰炸加油机!L 列）：Mach^0.25 × 载弹量 × 半径^0.5 × (1/被探测距离)^0.75。"""
    return cruise_mach ** 0.25 * payload_t * radius_km ** 0.5 * (1.0 / detected_km) ** 0.75


def awacs_composite(detect_rcs3_km: float, payload_t: float, endurance_h: float) -> float:
    """预警机/特种机综合战力（特种机!Q 列）：探测距离 × 载重^0.5 × 滞空时间^0.25。"""
    return detect_rcs3_km * payload_t ** 0.5 * endurance_h ** 0.25


def awacs_to_fa18(composite: float, e2d_composite: float = 1799.451, e2d_cost_musd: float = 173.6,
                  fa18_cost_musd: float = 67.0, fa18_power: float = 2.0) -> float:
    """按采购成本把预警机折算成等效 F/A-18（特种机!E107 = 2/E-2D 综合 × E-2D 价/F-18 价）。"""
    return composite * fa18_power * (e2d_cost_musd / fa18_cost_musd) / e2d_composite


def tanker_composite(fuel_capacity_t: float, transferable_fuel_t: float) -> float:
    """加油机综合战力（加油机!E 列）：sqrt(载油量 × 可转移油量)。"""
    return math.sqrt(fuel_capacity_t * transferable_fuel_t)


TANKER_FA18_REF = 19.486   # 加油机!E/F 的比值（KC-135 等多行一致）


def uav_composite(payload_t: float, mtow_t: float, speed_kph: float, endurance_h: float, range_km: float,
                  stealth: float) -> float:
    """大型无人机综合战力（大型无人机!K 列）：(载重×起飞重量)^0.25 × (速度×滞空×里程×隐身系数)^0.5。"""
    return (payload_t * mtow_t) ** 0.25 * (speed_kph * endurance_h * range_km * stealth) ** 0.5


UAV_FA18_REF = 8691.43     # RQ-170 综合战力 = 1 个等效 F/A-18（无人机!J/K）


# --------------------------------------------------------------------- 海军
def ship_firepower_vls(weapons: Dict[str, float], coefficients: Dict[str, float]) -> float:
    """水面舰艇火力 = Σ 各类武器数量 × 折算系数（驱护舰!Q 列）。"""
    return sum(n * coefficients.get(k, 0.0) for k, n in weapons.items() if n)


def radar_vls(detect_rcs3_km: float) -> float:
    """雷达折算 VLS = RCS=3 探测距离 / 60（驱护舰!Y 列，按成本折算）。"""
    return detect_rcs3_km / 60.0


def submarine_power(weapons_loaded: float, endurance_5kn_days: float, endurance_15kn_days: float,
                    displacement_t: float, detect_km: float, payload_factor: float = 1.0) -> float:
    """潜艇每艇战力（海军!R 列）：(载弹×factor×(5节续航×15节续航)^0.5×吨位/探测距离)^0.25。"""
    return (weapons_loaded * payload_factor * math.sqrt(endurance_5kn_days * endurance_15kn_days)
            * displacement_t / detect_km) ** 0.25


def detection_range_by_noise(ref_range_km: float, ref_noise_db: float, noise_db: float) -> float:
    """潜艇被探测距离随噪音：M = M_ref / 10^((L_ref - L)/20)（海军!M 列）。"""
    return ref_range_km / 10 ** ((ref_noise_db - noise_db) / 20.0)


def carrier_vls_equivalent(sorties_per_day: float, conversion: float) -> float:
    """航母战力 = 日出动架次 × 换算系数（海军!H 列；换算系数由 尼米兹/伯克 成本比决定）。"""
    return sorties_per_day * conversion


# --------------------------------------------------------------------- 火力 / 导弹
def rocket_force_power(base_param: float, mobility: float, reload: float) -> float:
    """火箭军单发射车战力（火箭军!I 列）= 再装填 × 基础参数 × 机动性。"""
    return reload * base_param * mobility


def transport_throughput_24h(payload_t: float, round_trip_h: float, units: float) -> float:
    """24 小时运输周转量 = 24 / 往返用时 × 载重 × 数量（运输机!O / 运输舰!O 列）。"""
    return 24.0 / round_trip_h * payload_t * units


# --------------------------------------------------------------------- 直升机
def transport_helicopter_power(cabin_volume_m3: float, mean_payload_kg: float, ferry_range_km: float,
                               max_speed_kph: float) -> float:
    """运输直升机总战力（运输直升机!19 行）：(平均载重×货仓容积×转场航程×最大速度)^0.25。"""
    return (mean_payload_kg * cabin_volume_m3 * ferry_range_km * max_speed_kph) ** 0.25


def attack_helicopter_power(weapon_load_kg: float, ferry_range_km: float, max_speed_kph: float) -> float:
    """攻击直升机总战力（武装直升机!12 行）：武器载重^0.5 × 转场航程^0.25 × 最大速度^0.25。"""
    return weapon_load_kg ** 0.5 * ferry_range_km ** 0.25 * max_speed_kph ** 0.25
