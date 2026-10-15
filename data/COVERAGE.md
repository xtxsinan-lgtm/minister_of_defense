# 编制覆盖清单

逐节对照原文，列出每个编制单位对应的模板 id。校验脚本会检查这里每个反引号里的 id 都真实存在。

**深度说明**：✅ 拆到原文描述的最低一级（通常是班，有人员和装备）；🟡 拆到原文给出的最低一级，但那一级原文只给了名称或总数（比如“工兵连”“支援保障营”），叶子节点是聚合单位。

## 1.3 基本战斗旅（逐级）

| 原文 | 单位 | 模板 | 深度 |
|---|---|---|---|
| 1.3.1.1.1 | ABCT 装甲排 | `us_tank_plt` ← `us_tank_crew` | ✅ |
| 1.3.1.1.2 | ABCT 机步班 / 排 | `us_abct_rifle_squad`、`us_bradley_crew`、`us_bradley_crew_led`、`us_abct_mech_plt_hq` → `us_abct_mech_plt` | ✅ |
| 1.3.1.1.3 | SBCT 步兵班 / 排 | `us_sbct_rifle_squad`、`us_stryker_crew`、`us_sbct_plt_weapons_sq`、`us_sbct_plt_hq` → `us_sbct_rifle_plt` | ✅ |
| 1.3.1.1.4 | IBCT 步兵班 / 排 | `us_ibct_rifle_squad`、`us_ibct_plt_weapons_sq` → `us_ibct_rifle_plt`；MBCT `us_mbct_rifle_plt` | ✅ |
| 1.3.1.2.1 | 重型旅装甲排 | `pla_tank_plt` ← `pla_tank_crew` | ✅ |
| 1.3.1.2.2–3 | 重型 / 中型旅机步班、火力班、排 | `pla_mech_inf_squad`、`pla_mech_plt_fire_sq`、`pla_plt_hq` → `pla_mech_plt` | ✅ |
| 1.3.1.2.4 | 轻高机班 / 排 | `pla_light_inf_squad` → `pla_light_plt` | ✅ |
| 1.3.1.2.5 | 摩步班 / 排 | `pla_motor_inf_squad` → `pla_motor_plt` | ✅ |
| 1.3.2.1.1 | ABCT 装甲连 | `us_abct_tank_coy`（连部 `us_abct_tank_coy_hq_sec`） | ✅ |
| 1.3.2.1.2 | ABCT 机步连 | `us_abct_mech_coy`（`us_abct_mech_coy_hq_sec`） | ✅ |
| 1.3.2.1.3 | SBCT 步兵连 | `us_sbct_rifle_coy`（迫击炮分队 `us_m1129_squad`、加强 `us_sbct_coy_att_med` / `us_sbct_coy_att_fist`） | ✅ |
| 1.3.2.1.4 | IBCT 步兵连 | `us_ibct_rifle_coy`（`us_m224_squad`、`us_ibct_coy_hq_sec`） | ✅ |
| 1.3.2.2.1 | 重型旅装甲连 | `pla_tank_coy`（`pla_tank_coy_hq`） | ✅ |
| 1.3.2.2.2–3 | 重型 / 中型旅机步连 | `pla_mech_coy`、`pla_medium_mech_coy`（`pla_mech_coy_hq`） | ✅ |
| 1.3.2.2.4 | 轻高机连（含火力排） | `pla_light_coy`、`pla_light_fire_plt` | ✅ |
| 1.3.2.2.5 | 摩步连（含火力排） | `pla_motor_coy`、`pla_motor_fire_plt` | ✅ |
| 1.3.3.1.1 | ABCT 联兵营及营部连 | `us_abct_armor_bn`、`us_abct_inf_bn`、`us_abct_cab_hhc`（迫击炮排、侦察排 `us_abct_bn_scout_plt`、狙击班、医护排等） | ✅ |
| 1.3.3.1.2 | SBCT 步兵营 | `us_sbct_inf_bn`、`us_sbct_bn_hhc`、`us_sbct_bn_scout_plt` | ✅ |
| 1.3.3.1.3 | IBCT 步兵营、武器连 | `us_ibct_inf_bn`、`us_ibct_bn_hhc`、`us_ibct_weapons_coy`（`us_ibct_assault_plt`） | ✅ |
| 1.3.3.2.1 | 重型合成营、火力连、支保连 | `pla_heavy_cab`、`pla_heavy_fire_coy`（3 排变体 `pla_heavy_fire_coy_3plt`、PGL-625 变体 `pla_heavy_fire_coy_spaag`）、`pla_heavy_spt_coy`、`pla_bn_hq_coy` | ✅（支保连各排 🟡） |
| 1.3.3.2.2 | 中型合成营 | `pla_medium_cab`、`pla_assault_gun_coy`、`pla_medium_spt_coy` | ✅ |
| 1.3.3.2.3 | 轻高机合成营 | `pla_light_cab`、`pla_light_fire_coy`、`pla_light_spt_coy` | ✅ |
| 1.3.3.2.4 | 摩步合成营 | `pla_motor_cab`、`pla_motor_fire_coy`、`pla_motor_spt_coy` | ✅ |
| 1.3.4.1.1 | ABCT 骑兵营 | `us_abct_cav_sqn`、`us_abct_cav_troop`、`us_abct_cav_scout_plt` | ✅（营部连 🟡） |
| 1.3.4.1.1 | ABCT 炮兵营 | `us_abct_fa_bn`、`us_abct_fa_battery`、`us_abct_fa_hhb`、`us_fa_target_acq_plt` | ✅ |
| 1.3.4.1.1 | 工兵营 | `us_abct_beb`：`us_beb_signal_coy`、`us_beb_mi_coy`、`us_beb_engineer_coy_a`、`us_beb_engineer_coy_b` | 🟡（到班/组名称） |
| 1.3.4.1.1 | 后勤营 + 前线支援连 | `us_abct_bsb`：`us_bsb_maint_coy`、`us_bsb_medical_coy`、`us_bsb_distribution_coy`、`us_abct_fsc_cab`（`us_fsc_distribution_plt`、`us_fsc_maint_plt`） | 🟡 |
| 1.3.4.1.1 | ABCT | `us_abct` | ✅ |
| 1.3.4.1.2 | SBCT 骑兵营、反坦克排、炮兵营、工兵营、旅 | `us_sbct_cav_sqn`、`us_sbct_at_plt`、`us_sbct_fa_bn`、`us_sbct_beb`、`us_sbct` | ✅ |
| 1.3.4.1.3 | IBCT 骑兵营（乘车连、下车侦察连）、炮兵营、旅 | `us_ibct_cav_sqn`、`us_ibct_cav_troop`、`us_ibct_dismount_troop`、`us_ibct_fa_bn`、`us_ibct`；MBCT `us_mbct` | ✅ |
| 1.3.4.2.1 | 重型旅侦察营 | `pla_recon_bn_heavy`（`pla_recon_instr_coy_heavy`、`pla_armed_recon_coy`、`pla_uav_coy`、`pla_bf_surv_coy`）；只有无人机排 `pla_recon_bn_heavy_uavplt` | ✅ |
| 1.3.4.2.1 | 重型旅炮兵营 | `pla_arty_bn_heavy`（`pla_how122_sp_coy`、`pla_mrl122_coy`、`pla_at_vehicle_coy_9`、`pla_arty_bn_cmd_coy`） | ✅ |
| 1.3.4.2.1 | 重型旅防空营 | `pla_ad_bn_heavy`（`pla_aa_gun_coy_heavy`、`pla_sam_coy_short`、`pla_manpads_coy`） | ✅ |
| 1.3.4.2.1 | 作战支援营 / 勤务保障营 / 旅部 | `pla_cbt_spt_bn`、`pla_svc_spt_bn`、`pla_cab_hq` | 🟡 |
| 1.3.4.2.1 | 重型合成旅（及二线） | `pla_heavy_cab_brigade`、`pla_heavy_cab_brigade_2nd` | ✅ |
| 1.3.4.2.2 | 中型合成旅（及 92 二线） | `pla_medium_cab_brigade`、`pla_arty_bn_medium`、`pla_ad_bn_medium`、`pla_medium_cab_brigade_92` | ✅ |
| 1.3.4.2.3 | 轻高机合成旅 | `pla_light_cab_brigade`、`pla_recon_bn_light`、`pla_arty_bn_light`、`pla_ad_bn_light`；二代猛士营 `pla_light_cab_gen2` | ✅ |
| 1.3.4.2.4 | 摩步合成旅 | `pla_motor_cab_brigade`、`pla_recon_bn_motor`、`pla_arty_bn_motor` | ✅ |

## 1.3.5 师 / 集团军

| 原文 | 单位 | 模板 | 深度 |
|---|---|---|---|
| 1.3.5.1 | 现行师 | `us_armored_division`、`us_infantry_division`、`us_air_assault_division`、`us_82nd_airborne_division`、`us_11th_airborne_division`、`us_mountain_division`、`us_2nd_infantry_division`、`us_ng_infantry_division` | ✅ |
| 1.3.5.1 | 战斗航空旅 | `us_combat_aviation_brigade` | ✅（到单机） |
| 1.3.5.1 | 野战炮兵旅 | `us_field_artillery_brigade`、`us_himars_bn`、`us_m270_bn`、`us_m777_bn`、`us_m109_bn` | ✅ |
| 1.3.5.1 | 防空营 | `us_patriot_bn`、`us_nasams_bn`、`us_mshorad_bn`、`us_avenger_bn`、`us_thaad_battery`、`us_c_ram_battery` | ✅ |
| 1.3.5.1 | 航路点 2028 BCT | `us_abct_2028`、`us_sbct_2028`、`us_lbct_2028`、`us_mbct_2028` | ✅ |
| 1.3.5.1 | 航路点 2028 师属单位 | `us_div_cav_sqn_2028`、`us_divarty_2028_enhanced`、`us_divarty_2028_armored`、`us_divarty_2028_light`、`us_div_engineer_brigade_2028`、`us_div_engineer_bn_2028`、`us_protection_brigade_2028` | ✅ |
| 1.3.5.1 | 航路点 2028 师 | `us_enhanced_armored_division_2028`、`us_armored_division_2028`、`us_light_infantry_division_2028`、`us_air_assault_division_2028`、`us_airborne_division_2028` | ✅ |
| 1.1 | 军 / 集团军 / 战区 | `us_corps`、`us_v_corps_europe`、`us_eighth_army`、`us_first_army`、`us_theater_command` | 🟡 |
| 1.3.5.2 | 集团军炮兵旅（含 2026 注） | `pla_ag_artillery_brigade`、`pla_ag_artillery_brigade_2026` | ✅ |
| 1.3.5.2 | 集团军防空旅 | `pla_ag_ad_brigade`、`pla_ag_ad_brigade_hq7` | ✅ |
| 1.3.5.2 | 陆航旅 | `pla_ag_aviation_brigade`（12/16/24 架营变体） | ✅ |
| 1.3.5.2 | 特战旅 / 工化旅 / 勤务支援旅 | `pla_ag_sof_brigade`、`pla_ag_engineer_cbrn_brigade`（`pla_fortification_bn`）、`pla_ag_support_brigade` | 🟡 |
| 1.3.5.2 | 集团军 | `pla_group_army`、`pla_group_army_air_assault` | ✅ |
| 1.3.5.2 | 战区直属 | `pla_theater_army`、`pla_theater_recon_intel_brigade`、`pla_theater_lr_rocket_brigade`、`pla_joint_logistics_center` | 🟡 |

## 1.4.1 美国其他地面单位

| 原文 | 单位 | 模板 | 深度 |
|---|---|---|---|
| 1.4.1.1.1 | 陆战队步兵班 / 排 / 连 / 武器连 / 营 | `usmc_rifle_squad`、`usmc_rifle_plt`、`usmc_weapons_plt`、`usmc_rifle_coy`、`usmc_weapons_coy`、`usmc_hs_coy`、`usmc_inf_bn` | ✅ |
| 1.4.1.1.2 | 步兵团 | `usmc_inf_regiment` | ✅ |
| 1.4.1.1.2 | 炮兵团 / 营 / 连 / 发射排 | `usmc_arty_regiment`、`usmc_arty_bn`、`usmc_m777_battery`、`usmc_m327_battery`、`usmc_himars_battery`、`usmc_m777_firing_plt` | ✅ |
| 1.4.1.1.2 | 坦克营 | `usmc_tank_bn`、`usmc_tank_coy`、`usmc_tank_bn_hq_coy` | ✅ |
| 1.4.1.1.2 | 两栖突击营 | `usmc_aav_bn`、`usmc_aav_coy`、`usmc_aav_plt` | ✅ |
| 1.4.1.1.2 | 轻装甲侦察营 | `usmc_lar_bn`、`usmc_lar_coy`、`usmc_lar_plt` | ✅ |
| 1.4.1.1.2 | 侦察营 / 工兵营 / 师总部营 | `usmc_recon_bn`、`usmc_engineer_bn`、`usmc_div_hq_bn` | 🟡 |
| 1.4.1.1.2 | 陆战师 | `usmc_division` | ✅ |
| 1.4.1.1.3 | 航空联队 | `usmc_aircraft_wing`（`usmc_fixed_wing_group`、`usmc_tiltrotor_group`、`usmc_helicopter_group`、`usmc_air_control_group`） | ✅ |
| 1.4.1.1.3 | 后勤群 / 本部群 / FORECON | `usmc_logistics_group`、`usmc_hq_group`、`usmc_forecon` | 🟡 |
| 1.4.1.1.3 | MEF / MEB / MEU | `usmc_mef`、`usmc_meb`、`usmc_meu` | ✅ |
| 1.4.1.1.2（FD2030） | FD2030 步兵营、濒海战斗团 | `usmc_inf_bn_fd2030`、`usmc_littoral_regiment`、`usmc_nmesis_battery` | ✅ |
| 1.4.1.2.1.1 | 陆军特种部队 | `us_army_sf_command`、`us_sf_group`、`us_sf_battalion`、`us_sf_company`、`us_sf_oda` | ✅ |
| 1.4.1.2.1.2 | 75 游骑兵团 | `us_75th_ranger_regiment`、`us_ranger_bn`、`us_ranger_coy`、`us_ranger_specialty_coy`、`us_ranger_special_troops_bn`、`us_ranger_mi_bn` | ✅ |
| 1.4.1.2.1.3 | 160 航空特战团 | `us_160th_soar` | ✅ |
| 1.4.1.2.2 | 海军特种作战司令部 | `us_naval_special_warfare`、`us_seal_team`、`us_seal_troop`、`us_seal_platoon`、`us_devgru` | ✅ |
| 1.4.1.2.3 | 空军特种作战司令部 | `us_afsoc`、`us_af_air_wing`、`us_af_27th_wing`、`us_af_24th_wing`、`us_af_sts` | 🟡 |
| 1.4.1.2.4 | 陆战队特种作战 | `us_marine_raider_regiment`、`us_marsoc_team`、`us_marine_raider_support_group` | ✅ |

## 1.4.2 解放军其他地面单位

| 原文 | 单位 | 模板 | 深度 |
|---|---|---|---|
| 1.4.2.1 | 新疆合成营（4 种）/ 团 / 师 / 军区 | `pla_xj_heavy_cab_2t1m`、`pla_xj_heavy_cab_1t2m`、`pla_xj_medium_cab`、`pla_xj_light_cab`、`pla_xj_fire_bn`、`pla_xj_spt_bn`、`pla_xj_heavy_regiment`、`pla_xj_medium_regiment`、`pla_xj_light_regiment`、`pla_xj_fire_regiment`、`pla_xj_cab_division`、`pla_xinjiang_military_district` | ✅ |
| 1.4.2.2 | 陆军两栖合成旅 | `pla_amphib_cab_brigade`、`pla_amphib_cab`、`pla_arty_bn_amphib`、`pla_ad_bn_amphib` | ✅ |
| 1.4.2.3 | 山地合成旅 | `pla_mountain_inf_squad`、`pla_mountain_coy`、`pla_mountain_fire_coy`、`pla_mountain_cab`、`pla_arty_bn_mountain`、`pla_mountain_cab_brigade` | ✅ |
| 1.4.2.4 | 驻港 / 驻澳 | `pla_hk_brigade`、`pla_hk_92_cab`、`pla_macau_garrison` | ✅ |
| 1.4.2.5 | 陆军 / 空军空突旅 | `pla_air_assault_squad`、`pla_air_assault_bn`、`pla_army_air_assault_brigade`、`pla_af_air_assault_brigade` | ✅ |
| 1.4.2.6 | 空降兵旅（履带 / 轮式 / 摩步 / 山猫）与空降兵军 | `pla_abn_tracked_brigade`、`pla_abn_wheeled_brigade`、`pla_abn_motor_brigade`、`pla_abn_lynx_brigade`、`pla_airborne_corps` | ✅ |
| 1.4.2.7 | 海军陆战队 | `pla_marine_brigade`、`pla_marine_amphib_cab`、`pla_marine_medium_cab`、`pla_marine_air_assault_cab`、`pla_marine_arty_bn`、`pla_marine_aviation_brigade`、`pla_marine_corps` | ✅ |
| 1.4.2.8 | 边防团 / 边防旅 | `pla_border_regiment`、`pla_border_mobile_bn`、`pla_border_mobile_coy`、`pla_border_brigade` | ✅ |
| 1.4.2.9 | 海防旅 | `pla_coastal_brigade`、`pla_coastal_garrison_coy`、`pla_coastal_squad`、`pla_coastal_mobile_bn`、`pla_coastal_arty_bn` | ✅ |
| 1.4.2.10 | 北京卫戍区 | `pla_beijing_garrison`、`pla_guard_div_3`、`pla_guard_div_1` | 🟡 |
| 1.4.2.11 | 空军地导 | `pla_af_sam_brigade`、`pla_af_sam_bn_long`、`pla_af_sam_bn_point` | ✅ |
| 1.4.2.12 | 海军岸舰导弹团 | `pla_navy_coastal_missile_regiment` | ✅ |
| 1.4.2.13 | 特战分级 | `pla_other.yaml` → `special_forces_tiers` | — |

## 原文没有给出、因此未建或只建了名称的

- 美军：旅部连、骑兵营营部连内部；工兵营、后勤营各排内部人员装备；第 1/2/3/4 军具体挂靠哪些师旅。
- 解放军：集团军特战旅、工化旅、勤务支援旅各营内部；合成旅作战支援营、勤务保障营各连内部；警卫 1 师、3 师各团内部（3 师按新疆轻型团推测）；空降兵军特战旅、支援旅、训练旅、航空兵旅；战区信息保障旅、电子对抗旅。
- 原文以图片给出的排/连/营/旅武器数量表未在文本中，无法逐项核对。
