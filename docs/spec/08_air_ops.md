# 08 空中作战

> 依据：总纲 §12（空中作战，CMO 简化）、§14.1.1（拦截策略，地面防空与舰队通用）、§5.2（海空军弹药按枚、机场库存挂载）、§2.1（4 机组 / 1–2 架支援机 / 大型无人机为“组”）、§15（空运空降）、§16（SOF 空中投送）、§21-1（空战与拦截用随机、可复现）、§21-4（纳卡 MVP）。
> 术语、单位、更新顺序、RNG 一律按 [00_glossary.md](00_glossary.md)。接口与 [03](03_squad_combat.md)、[04](04_strip_layer.md)（E-03、E-07、E-12）、[05](05_recon_exposure.md)、[06](06_logistics.md)、[07](07_damage_repair.md)、[09](09_time_orders.md)（T-02）、[12](12_ai.md)（I-16）、[15](15_save_determinism.md) 对齐。
> 本文件的 🟡 编号为 `A-xx`，汇总在第 10 节。海军、舰载机、航母相关内容一律标 **阶段 3**，只留扩展点。

---

## 1. 目标与范围

### 1.1 解决什么问题
1. 空中层：飞机、无人机组、巡飞弹、导弹在**连续坐标**上以 1 分钟步长飞行、探测、交战（总纲 §12.1–12.2）。
2. 地面防空**双登记**：防空单位既是陆地单位，也在空中层探测和拦截；拦截按**安全 / 均衡 / 弹药节省**三种策略自动决定打几发、用什么弹（§14.1.1 ✅）。
3. 空对地：打击、CAS、SEAD/DEAD、巡飞弹，通过**带时间戳的地面事件**交给 03/04/06/07 结算（§12.1）。打击受 05 的**暴露度门槛**约束（L4 才能精确打击）。
4. 出动：挂载从**所在机场库存**扣（§5.2），出动准备、再次出动、维护、飞行员值勤限制共同决定出动率。
5. **纳卡 2020 的核心**：TB2 类察打无人机、Harop 类巡飞弹、An-2 改装诱饵 vs 老式近程防空（Osa、Strela-10、ZSU-23-4、Kub）、Tor-M2KM、S-300PS。这些互动必须从机制里**自然涌现**（射高包线、雷达开机即暴露、慢速小目标探测困难、诱饵耗弹），而不是写死。

### 1.2 阶段划分
| 内容 | 阶段 0 | 阶段 1（纳卡 MVP） | 阶段 2 | 阶段 3 |
|---|---|---|---|---|
| 空中层 | 不运行；试验场脚本可注入 `GroundStrikeEvent`（04 §7） | 完整：飞行、探测、空战（简化）、地面防空、打击、CAS、SEAD/DEAD、无人机组、巡飞弹、诱饵、战术弹道导弹/巡航导弹的拦截 | 大规模空战调参、预警机/电子战机细化、GNSS 干扰 | 舰载机、航母、舰队防空（复用拦截策略）、反潜、海上搜索、CSAR、扫雷布雷、舰间运输（`AirMissionType` 预留值） |
| 空运空降 | — | 简化版：运输机/直升机按架次运营（SOF 投送、机降），伞降集结 | 大规模空降 | 两栖相关 |

### 1.3 不包含
- 对地面单位的**情报**（暴露度）：05。空中层只**读** 05，并通过 `ReconDwellSample`、`RegisterSelfFix` **写入**观测。
- 弹药对地面目标的**毁伤**（谁被打中、打成什么样）：03（片段内）/ 04（条带与地块）/ 06（节点）/ 07（损伤分类）。08 只给出“打到哪、多准、直接命中概率”。
- 地面远程火力（火箭炮、战术导弹）的瞄准与毁伤：04。08 只负责其**飞行与被拦截**（§4.12）。
- 营属小型无人机（`uav_micro`、`uav_hand_launched`、`uav_small_vtol`）：04 §4.5.2；中型战术无人机（`uav_tactical`）：05 §4.2.2 抽象处理，08 只提供损耗率函数（§4.9.3）。
- 空中任务**派什么**：玩家或 12（I-16）。08 负责执行，不内置“中队 AI 自动派任务”（例外：CAP 的自动截击、任务包内部的时间协调、无人机组的轨道轮换）。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单
| # | 决策 | 说明 / 取舍 |
|---|---|---|
| D1 | 派空中任务：`Ferry / Intercept / Cap / Cas / Strike / Sead / Escort / SupportOrbit / Recon` | 目标为地块、已知单位、节点、桥梁、防空营；命令无延迟（09 T-02），但有出动准备时间 |
| D2 | 飞行剖面 `HiHiHi / HiLoHi / LoLoLo` | 航程 vs 被远程雷达发现（§12.4 ✅） |
| D3 | 任务包：打击附带护航 / SEAD / 诱饵 / 干扰 | 系统自动同时到达（§12.3 🟡） |
| D4 | 打击失败时的后备：`Abort / AreaAttack / SelfAcquire` | 情报不够 L4 时怎么办（§4.8.1） |
| D5 | 无人机组的**风险容忍度**（经 05 的区域任务）与**巡航高度档** | 高飞：躲开近程防空，看得不够清；低飞：更准但挨打 |
| D6 | 防空营 / 旅的**拦截策略** `Safe / Balanced / Conserve` | 拦截率 vs 弹药（§14.1.1 ✅；09 `UnitConfig`） |
| D7 | 防空营的**电磁管控** `Active / Partial / Silent` | 开机看得见、打得着，但暴露、招来反辐射和巡飞弹 |
| D8 | 防空营的“**打完就转移**”开关 | 生存 vs 有一段时间不能打 |
| D9 | 采购：飞机、无人机组、巡飞弹、诱饵机、空空/空地弹（按枚）、防空营 | 11 |
| D10 | 机场弹药前置、库存上限（06 §5.2 规则） | 前沿机场被打掉的风险 |
| D11 | 空运：运输方式、`LiftPriority` | §4.14 |

### 2.2 反馈清单
| # | 反馈 | 内容（数字透明） |
|---|---|---|
| F1 | 飞行编组卡 | 机型、架数、燃油、挂载（剩几枚什么弹）、任务、剖面、预计返航时刻、飞行员练度 |
| F2 | 无人机组卡 | 空中架数 / 总数、地面站数、数据链覆盖圈、每个轨道的剩余续航、本日损失 |
| F3 | 防空单位卡 | 交战包线（射程、射高）、雷达开机状态与本 10 分钟开机比例、待发弹数 / 库存、拦截策略、本日拦截记录（“发射 7 枚，击落 3 个目标：2 架 Orbiter、1 架 An-2（诱饵）”） |
| F4 | 交战包线覆盖图 | 地图上按高度档显示己方与已知敌方防空的覆盖（敌方的只显示 05 等级 ≥ L3 的） |
| F5 | 任务结果通知 `AirMissionResult` | 成功 / 降级（缺弹，用了次优挂载）/ 中止（原因：“目标情报只有 L3”“机场 KAB-500 库存 0”“燃油不足”）/ 损失 |
| F6 | 出动率面板（每个机场、每个中队） | 每日架次、可用率、等待原因（缺飞行员 / 维护 / 缺弹 / 跑道受损） |
| F7 | AAR（空中部分） | 按机型、弹种：出动、投弹、命中、损失；防空：每击落一个目标花了几枚、多少钱（**成本交换比**） |
| F8 | 拦截策略预览 | 对选中防空单位，按当前弹种显示三种策略下对典型目标的“预计拦截率 / 每目标耗弹” |

---

## 3. 数据结构

> 命名空间 `MoD.Sim.Air`。坐标：经纬度 `double` 度 + 海拔 `altMslM`（00 §3.4）；离地高 `altAglM = altMslM − Tile.terrain.elevMeanM`（所在地块，10 `TerrainComposition.elevMeanM`）。

### 3.1 枚举

```csharp
// 00 已定义（重复列出，值不得改；阶段 3 成员只占位）
enum AirMissionType {
    None = 0, Ferry = 1, Intercept = 2, Cap = 3, Cas = 4, Strike = 5, Sead = 6,
    Escort = 7, SupportOrbit = 8, Recon = 9, Airlift = 10,
    Asw = 20, MaritimeSearch = 21, Csar = 22, MineWarfare = 23, ShipShuttle = 24   // 阶段 3
}
enum FlightProfile { None = 0, HiHiHi = 1, HiLoHi = 2, LoLoLo = 3 }
enum InterceptPolicy { Safe = 1, Balanced = 2, Conserve = 3 }
enum AirliftMethod { Paradrop = 1, AirLanding = 2, FastRope = 3, SlingLoad = 4 }
enum LiftPriority { PersonnelFirst = 1, CompleteSquadsOnly = 2 }

// 本文件新增
enum AircraftRole {            // 12 §4.4.6 使用这几个分类
    None = 0, Fighter = 1, Strike = 2, UavStrike = 3, UavRecon = 4, Sead = 5,
    Support = 6, Transport = 7, AttackHelicopter = 8, UtilityHelicopter = 9, Decoy = 10
}
enum AirTargetClass {          // 拦截率表的列
    None = 0, FastJet = 1, SlowAircraft = 2, Helicopter = 3, MaleUav = 4, SmallUav = 5,
    LoiteringTerminal = 6, CruiseMissile = 7, BallisticMissile = 8, AntiRadiationMissile = 9,
    AirToAirMissile = 10, GuidedBomb = 11
}
enum GuidanceClass {
    None = 0, Unguided = 1, Gnss = 2, LaserSemiActive = 3, EoTv = 4, IrImaging = 5,
    IrPassive = 6, RadarActive = 7, RadarSemiActive = 8, Command = 9, AntiRadiation = 10,
    LoiterEo = 11, LoiterEoRf = 12, Gun = 13
}
enum AirMunitionRole { None = 0, AirToAir = 1, SurfaceToAir = 2, AirToGround = 3,
                       AntiRadiation = 4, Loitering = 5, Ballistic = 6, Cruise = 7, Gun = 8 }
enum AirframeStatus { Ready = 0, Preparing = 1, Airborne = 2, Turnaround = 3,
                      Maintenance = 4, Damaged = 5, Destroyed = 6, Reserved = 7 }
enum ElementState { Taxi = 0, Transit = 1, Holding = 2, OnStation = 3, Attacking = 4,
                    Engaging = 5, Rtb = 6, Landed = 7 }
enum StrikeFallback { Abort = 1, AreaAttack = 2, SelfAcquire = 3 }
// StrikeTargetKind：归 09 §3.2（含 AirDefenseUnit = 5、Loc = 6）
enum MissileState { Boost = 0, Midcourse = 1, Search = 2, Terminal = 3, Impact = 4,
                    Intercepted = 5, Lost = 6 }
enum MissileKind { Aam = 1, Sam = 2, AirToGround = 3, Arm = 4, Loitering = 5,
                   GroundBallistic = 6, GroundCruise = 7 }
enum AdFireUnitType { SelfContained = 1, BatteryRadar = 2 }   // 自带雷达的单车 / 以连为火力单元
enum AdState { Deployed = 0, Moving = 1, MarchOrder = 2, Relocating = 3, Reloading = 4,
               ArmShutdown = 5, Destroyed = 6 }
enum AirResultReason { None = 0, Success = 1, Degraded = 2, NoMunitions = 3, NoFuel = 4,
                       NoCrew = 5, NoAirframes = 6, IntelInsufficient = 7, RunwayClosed = 8,
                       OutOfRange = 9, Lost = 10, TargetGone = 11, DatalinkRange = 12 }
enum AltitudeBand { Low = 1, Medium = 2, High = 3 }    // 无人机巡航高度档（D5）
enum CasPlatformClass { None = 0, Jet = 1, Uav = 2, Helicopter = 3 }   // CAS 平台类：CasCycleS 的键；04 SelectCasTarget 参数
```

### 3.2 静态数据 Profile（08 归属）

#### 3.2.1 `AircraftProfile`（YAML 键 `aircraft`，00 §4.3）
```csharp
class AircraftProfile {
    AircraftRole role;
    AirTargetClass airTargetClass;        // 被拦截时的目标类别
    bool isUnmanned, isDecoy, isHelicopter;
    double rcsM2;                         // 正面 RCS（数据键 rcs_m2）
    double cruiseMps, maxMps, lowLevelMps;// 巡航、最大、低空突防速度
    double ceilingM;
    double hiAltM, loAltAglM;             // 剖面的高空巡航海拔、低空离地高
    double orbitAltM_byBand[3];           // 无人机：Low/Medium/High 三档巡航海拔
    double attackAltAglM;                 // CAS/非制导投弹的攻击离地高
    double radiusHiHiHiM, radiusHiLoHiM, radiusLoLoLoM;   // 作战半径（缺省见 §4.13.1）
    double enduranceH;                    // 最大续航（无人机必填；有人机缺省 = 2 × radiusHiHiHi / cruise × 1.3）
    double reserveFuelFrac;               // 返航储备
    double fuelKg;                        // 一次满油（向机场扣 JetFuel）
    double agility;                       // [0,1] 格斗机动性
    bool helmetCueing, hasFlares, canSelfDesignate;
    double jammerQuality;                 // [0,1] 自卫干扰吊舱（0 = 无）
    double survivabilityOnHit;            // 被命中后“不坠毁”的概率（返航为 DepotRepair）
    double turnaroundMin;                 // 再次出动准备（加油、挂弹、检查）
    double maintElapsedPerFlightH;        // 每飞行小时追加的维护耗时（小时）
    double datalinkRangeM;                // 无人机视距数据链半径（相对地面站）
    int defaultFlightSize;                // 4 / 2 / 1；无人机组 = 系统机体数
    int gcsPerSystem;                     // 无人机组的地面站数（= 同时在空架数上限）
    double cargoKg; int paxCount; bool canParadrop;   // 运输
    List<LoadoutOption> loadouts;
}
class LoadoutOption {
    AirMissionType[] missions;            // 适用任务
    int priority;                         // 小者优先
    List<(ModelHandle munitionId, int count)> items;
    bool hasTargetingPod;                 // 能自主照射（激光）/ 光电搜索
}
```

#### 3.2.2 `MunitionProfile` 的空中扩展（YAML 键 `munition.air`；03 的 `MunitionProfile` 其他字段不变）
```csharp
class AirMunitionFields {
    AirMunitionRole role; GuidanceClass guidance;
    double rangeMinM, rangeMaxM;          // 由 data 的 range_km 换算
    double altMinM, altMaxM;              // 防空弹：射高包线（离地高）
    double speedMps;                      // 最大速度；平均速度 = AvgSpeedFrac × speedMps
    double[] pkVs;                        // 下标 = (int)AirTargetClass；单发拦截/命中概率（防空弹、空空弹）
    double cepM;                          // 空对地：圆概率误差
    // warheadKg：使用 03 `MunitionProfile.warheadKg`（通用字段），本扩展不再重复定义
    bool isInterceptable;                 // 飞行中能否被拦截（巡航、弹道、反辐射、巡飞弹、制导炸弹）
    AirTargetClass inFlightClass;         // 被拦截时的类别
    double rcsM2;                         // 飞行中 RCS
    double cruiseAltAglM;                 // 巡飞弹巡航高度、巡航导弹掠地高度
    double loiterEnduranceH;              // 巡飞弹
    double rfSeekerRangeM;                // 被动雷达导引头作用距离（0 = 无）
    double seekerQuality;                 // [0,1] 光电导引头质量（05 §4.4.5）
    double seekerFootprintM;              // 末制导导引头能“看到”的范围（TLE 超出则命中率下降）
    bool armMemory;                       // 反辐射弹：雷达关机后能否按记忆坐标继续飞
}
```

#### 3.2.3 `AirDefenseProfile`（YAML 键 `air_defense`；新 Profile，见第 11 节）
挂在**防空系统的发射车 / 火力单元主车**型号上：
```csharp
class AirDefenseProfile {
    AdFireUnitType fireUnitType;
    List<string> interceptorIds;          // 可用拦截弹/炮弹型号（03/08 的 munition id）
    int readyRounds;                      // 每辆发射车待发弹数
    int targetChannels, missileChannels;  // 火力单元同时可交战目标数、同时可制导导弹数
    double reactionTimeS;                 // 从首次跟踪到第一发出膛
    double reloadMin;                     // 一辆发射车再装填（有装填车时）
    double deployMin, marchOrderMin;      // 展开 / 撤收
    bool canFireOnMove;                   // Tor、Strela、便携：短停或行进间
    bool isNetworkCapable;                // 能接入国家空情网（营/旅指挥所）
    bool canEngageBallistic;
    bool radarRequiredToFire;             // 雷达制导系统 = true；红外/光学 = false
}
```
雷达与光学探测参数在 05 的 `SensorProfile`（`airRadarRangeMAt1m2`、`airRadarMaxAltM`、`slowTargetFactor`、`isLookDown`、`opticalAirRangeM`、`esmRangeFactor`）。

#### 3.2.4 YAML 示例（新增数据用；数值 `confidence: estimated`，公开资料量级）

```yaml
- id: bayraktar_tb2
  category: uav_male
  origin: TUR
  aircraft: {role: uav_strike, air_target_class: male_uav, is_unmanned: true, rcs_m2: 0.2,
             cruise_kph: 130, max_kph: 220, ceiling_m: 7600, orbit_alt_m_by_band: [3000, 5500, 7000],
             endurance_h: 27, reserve_fuel_frac: 0.1, datalink_range_km: 150, default_flight_size: 6,
             gcs_per_system: 2, turnaround_min: 120, maint_elapsed_per_flight_h: 0.12,
             survivability_on_hit: 0.05,
             loadouts: [{missions: [strike, cas, recon, sead], priority: 1, items: [[mam_l, 4]], has_targeting_pod: true},
                        {missions: [strike, cas, recon, sead], priority: 2, items: [[mam_c, 4]], has_targeting_pod: true}]}
  sensor: {recon_means: large_uav, eo_quality: 1.0, night_factor: 0.8}
  confidence: estimated
- id: mam_l
  category: asm_antitank
  munition: {kind: guided_he, warhead_kg: 10, is_top_attack: true,     # 03 MunitionProfile 通用字段
             air: {role: air_to_ground, guidance: laser_semi_active, range_km: 8, cep_m: 1, seeker_footprint_m: 300}}
  procurement: {cost_musd: 0.1}      # 单价归 11 ProcurementProfile
  confidence: estimated
- id: harop
  category: loitering_munition       # 巡飞弹弹药，一枚 = 一件（DC-205 ①）；发射单元是 loitering_launcher 类别的 harop_launcher
  origin: ISR
  munition: {kind: loitering_warhead, warhead_kg: 23, is_top_attack: true,   # 03 通用字段
             air: {role: loitering, guidance: loiter_eo_rf, speed_kph: 417, cruise_alt_agl_m: 3000,
                   loiter_endurance_h: 6, range_km: 1000, rcs_m2: 0.05, in_flight_class: small_uav,
                   rf_seeker_range_km: 25, seeker_quality: 0.9, seeker_footprint_m: 1000,
                   is_interceptable: true}}
  procurement: {cost_musd: 1.0}
  confidence: estimated
- id: osa_akm
  category: sam_short
  origin: RUS
  air_defense: {fire_unit_type: self_contained, interceptor_ids: [m9m33m3], ready_rounds: 6,
                target_channels: 1, missile_channels: 2, reaction_time_s: 26, reload_min: 5,
                deploy_min: 4, march_order_min: 4, can_fire_on_move: false, is_network_capable: false,
                radar_required_to_fire: true}
  sensor: {air_radar_range_km_at_1m2: 22, air_radar_max_alt_m: 6000, slow_target_factor: 0.6, esm_range_factor: 0}
  confidence: estimated
- id: m9m33m3
  category: sam_missile            # 新类别（防空导弹弹药），见第 11 节
  munition: {air: {role: surface_to_air, guidance: command, range_km: [1.5, 10], alt_m: [25, 5000],
                   speed_mach: 2.4,
                   pk_vs: {fast_jet: 0.55, slow_aircraft: 0.70, helicopter: 0.60, male_uav: 0.55,
                           small_uav: 0.30, loitering_terminal: 0.15, cruise_missile: 0.30,
                           ballistic_missile: 0, anti_radiation_missile: 0.10}}}
  procurement: {cost_musd: 0.15}
  confidence: estimated
- id: an2_decoy
  category: uav_male                # 改装靶机，按无人机处理
  aircraft: {role: decoy, air_target_class: slow_aircraft, is_unmanned: true, is_decoy: true, rcs_m2: 5,
             cruise_kph: 180, ceiling_m: 4000, orbit_alt_m_by_band: [1000, 2000, 3000], endurance_h: 4,
             default_flight_size: 4, gcs_per_system: 4, datalink_range_km: 100, survivability_on_hit: 0}
  confidence: estimated
```

### 3.3 运行时实体

```csharp
// 飞行编组（00：归 08）。有人机：作战飞机 4 架、支援机 1–2 架；无人机组：整套系统的全部机体。
class Flight {
    FlightId id;
    FormationId squadronId;               // 所属中队（01 Formation，service = Air 或陆航）
    CountryId owner;
    ModelHandle aircraftModel;            // 一个 Flight 只有一种机型
    List<EquipmentItemId> airframes;      // 升序；飞机就是 01 的 EquipmentItem（A-25）
    NodeId homeBase;                      // 当前驻扎机场（06 LogisticsNode, role = Airbase）
    AirMissionId currentMission;          // 0 = 空闲
    List<FlightElementId> airborne;       // 在空中的“空中元素”（升序）
    bool isQra;                           // 战备值班（截击 5 分钟起飞）
}

// 每架飞机的状态（组件，键 = EquipmentItemId）
class AirframeState {
    EquipmentItemId itemId; FlightId flightId;
    AirframeStatus status;
    SimTime availableAt;                  // Preparing/Turnaround/Maintenance 的结束时刻
    double flightHoursToday;              // 本游戏日（UTC 0 点重置）
    SortedDictionary<ModelHandle,int> loaded;  // 当前挂载（弹药型号句柄 → 数量；00 §2.2 运行时句柄）
}

// 空中元素：一起飞的一组飞机（有人机 = 整个编组一起飞；无人机组 = 每架单独一个元素）
class FlightElement {
    FlightElementId id; FlightId flightId; AirMissionId missionId;
    List<EquipmentItemId> aircraft;       // 本元素内存活的飞机（升序）
    double latDeg, lonDeg, altMslM;
    double headingRad, speedMps;          // 真北顺时针（内部弧度）
    double fuelFrac;                      // [0,1]
    ElementState state;
    List<Waypoint> route; int routeIndex;
    SimTime launchedAt;
    FlightProfile profile;
    AltitudeBand band;                    // 无人机
    bool radarOn;                         // 机载雷达
    SimTime nextCasCycleAt;
    ExposureTargetId selfAcquiredTarget;  // 自主获取到的目标（05 类型）；None = 无
    double selfAcquireMinutesUsed;        // 已用于自主搜索的分钟数（对比 SelfAcquireMaxMin）
    // 飞行员/操作员由 02 名册管理（§4.3.3），不在本结构中
}
readonly record struct Waypoint(double latDeg, double lonDeg, double altMslM, double speedMps, WaypointKind kind);
enum WaypointKind { Nav = 0, Ip = 1, Target = 2, OrbitCenter = 3, Base = 4, Hold = 5 }

class AirMission {
    AirMissionId id; CountryId owner; AirMissionType type;
    FlightId flight; MissionPackageId package;     // 0 = 不在任务包
    FlightProfile profile;
    StrikeTargetKind targetKind; ulong targetTile; ulong targetEntityId;   // 与 09 CrossTileStrikePayload 一致
    StrikeFallback fallback;
    AltitudeBand band;                    // 无人机
    AreaReconTaskId reconTask;            // Recon：使用 05 的区域任务分配
    EdgeBattleId casBattle;               // Cas：0 = 由 §4.4.4 自动选
    SimTime orderedAt, plannedLaunchAt, plannedTotAt;
    double onStationMin;                  // Cap/Cas/Recon/SupportOrbit：0 = 直到燃油下限
    bool autoRelief;                      // 自动轮换接替（Cap/Recon/SupportOrbit/无人机组）
    bool avoidKnownAd;                    // 绕开已知防空包线（§4.2.4）
    bool degraded; AirResultReason lastReason;
    IntelSnapshot intelAtIssue;           // 09 的类型
}
class MissionPackage {
    MissionPackageId id; AirMissionId lead;
    List<AirMissionId> members;           // Escort / Sead / Decoy / Jammer（SupportOrbit EW）
    SimTime tot;                          // 统一到达目标时刻
}

// 飞行中的弹药（00：归 08）
class MissileInFlight {
    MissileInFlightId id; MissileKind kind; ModelHandle munitionId; CountryId owner;
    ulong shooterId;                      // FlightElementId / AdRegistrationId / 04 的 FireMissionId / 巡飞弹发射营
    AirTargetRef target;                  // 空中目标（Aam/Sam）或 0
    GroundAimRef groundAim;               // 对地：目标引用 + 瞄准点
    double latDeg, lonDeg, altMslM, speedMps, headingRad;
    SimTime launchedAt, impactAt;         // 对空/对地直飞弹：发射时算出到达时刻
    double pkAtLaunch;                    // 对空：发射时算定的单发概率（到达时抽样）
    MissileState state;
    double enduranceRemainingS;           // 巡飞弹
    int launchSeq;                        // 04 的 (missionId, roundIndex) 等回指
}
readonly record struct AirTargetRef(byte kind /*1 = FlightElement, 2 = Missile*/, ulong id, EquipmentItemId aircraft);

// 空情航迹：每个国家对每个空中目标一条（与 05 的暴露度无关，A-20）
class AirTrack {
    CountryId observer; AirTargetRef target;
    SimTime firstSeen, lastSeen;
    double latDeg, lonDeg, altMslM, speedMps, headingRad;   // 最近一次观测
    AirTargetClass classified;            // 观测方的分类（诱饵会被分成 SlowAircraft）
    bool viaNetwork;                      // 是否只来自网络共享
}

// 地面防空在空中层的登记（00：归 08）
class AirDefenseRegistration {
    AdRegistrationId id;
    OrgUnitId battalionId, unitId;        // 所属防空营；火力单元（连/排/单车所在班的 OrgUnit）
    StripElementId stripElement;          // 在条带上时（04 投影）；0 = 不在战斗
    List<EquipmentItemId> launchers;      // 发射车（升序）
    EquipmentItemId radarItem;            // BatteryRadar：雷达车；SelfContained：第一辆发射车
    double latDeg, lonDeg, siteAglM;      // 位置；天线离地高
    AdState state; SimTime stateUntil;
    EmconState emcon;                     // 每步复制 05 `ReconConfig.emcon`（09 UnitConfig 写入）
    InterceptPolicy policy;               // 营设置（09 UnitConfig）
    bool relocateAfterFiring;             // 营设置（09 `UnitConfigField.RelocateAfterFiring`）
    bool radarOnThisStep;
    double radarOnSecondsWindow;          // 本 Exposure 窗口（10 分钟）内累计开机秒数
    double radarOnFraction;               // 上一窗口的开机比例（05 §4.1.3 读）
    SimTime lastEmittedAt;
    int guidedMissilesInFlight;           // 占用的导弹通道
    SortedDictionary<string,int> readyRounds;   // 发射车上待发弹（与 06 班弹药同步，见 §4.7.8）
}

// 非防空营的营属防空（便携导弹、自行高炮），按营汇总（A-07）
class OrganicAirDefense {
    OrgUnitId battalionId;
    int manpadsTeams, spaagCount, gunCount;
    string manpadsMunition, spaagMunition, gunMunition;
    double latDeg, lonDeg;                // 营位置（不在战斗时）
}

// 交给 03/04/06 的对地事件（03 §6 期望的字段）
readonly record struct GroundStrikeEvent(
    long timeMs, ModelHandle munitionId, CountryId attacker,
    GroundTargetKind targetKind,          // StripElement / Battalion / Node / Crossing / Loc / Point
    ulong targetId,                       // StripElementId / OrgUnitId / NodeId / CrossingId / tile
    EquipmentItemId preferredItem,        // 防空单位的雷达车等（0 = 由 04 选）
    double aimLatDeg, double aimLonDeg,
    double pHitDirect,                    // 直接命中类弹药（攻顶、末制导）；面杀伤类 = 0
    double cepM,                          // 面杀伤类的有效 CEP（含定位误差）
    ulong sourceEntityId, int seq,        // 排序键（00 §6.4-5）
    AirStrikeSourceTag sourceTag);        // Strike / Cas / Sead / Loitering / Uav（供 04 的 AAR 归因）
enum GroundTargetKind { StripElement = 1, Battalion = 2, Node = 3, Crossing = 4, Loc = 5, Point = 6 }
enum AirStrikeSourceTag { Strike = 1, Cas = 2, Sead = 3, Loitering = 4, UavStrike = 5 }
```

---

## 4. 算法与公式

### 4.0 一个空中步内的顺序（`TickPhase.AirStep` = 90，每刻，`dtS = 60`）

```text
AirStep(tick n)：                                  // 时间窗 [n·60000, (n+1)·60000) ms
 1. 吸收输入：09 本刻生效的空中命令（StartMission）；04 本刻的巡飞弹发射与远程导弹登记；
    01/07 的装备变化（被毁的飞机/发射车）；防空登记刷新（§4.7.1）
 2. 出动：按 FlightId 升序处理到时的起飞（§4.3）；挂载从机场扣弹扣油
 3. 移动：所有 FlightElement（FlightElementId 升序）、MissileInFlight（id 升序）沿航线推进 60 s（§4.1）
    记录本步起点、终点（供步内插值）
 4. 探测：更新各国 AirTrack（§4.5）；防空雷达开关决策（§4.7.2）
 5. 交战决策（只产生“开火事件”，带毫秒时刻）：
    5a 空空（§4.6）  5b 地面防空（§4.7，AdRegistrationId 升序）  5c 营属防空（§4.7.7）
    5d 对地投放（§4.8）  5e 巡飞弹获取与俯冲（§4.10）
 6. 事件结算：把本步的开火、导弹到达、命中事件按 00 §6.4-5 的键排序后依次结算；
    射手或目标已被更早的事件消灭 → 后续事件作废（与 03 的规则相同）
    跨步的导弹：到达时刻落在以后的步，留在 MissileInFlight 里
 7. 输出：GroundStrikeEvent 入 04 的队列（阶段 100/110 消费）；ReconDwellSample 入 05 缓冲；
    雷达开机秒数累计；损失调用 07；拦截弹消耗调用 06
 8. 降落与再次出动：到达机场的元素降落，进入 Turnaround（§4.3.2）；任务结束通知（09 PostNotification）
```

- **层间同步**（00 §5.2 规则 2、3）：空中层看到的地面位置 = 最近一次条带步（80）或地块层（60）的结果；打击移动目标时按 09 给出的营速度外推。地面防空在 5b 开火时**立即**扣拦截弹（06 `TryConsume`）。
- **事件排序键**：`(timeMs, TickPhase.AirStep, domainOrder, sourceEntityId, seq)`；`domainOrder`：导弹到达 0，开火 1，投放 2；`sourceEntityId` = 射手实体 id。
- 所有遍历按 ID 升序；任何集合不得依赖 `Dictionary` 遍历顺序（00 §6.4）。

### 4.1 几何与移动

#### 4.1.1 距离
```
GroundDistanceM(a, b)：两点纬度差 Δφ、经度差 Δλ（弧度），φm = (φa + φb)/2
   d = R × sqrt(Δφ² + (DMath.Cos(φm) × Δλ)²)                    R = 6 371 008.8 m
SlantRangeM(a, b) = sqrt(GroundDistanceM² + (altA − altB)²)
```
- 等距圆柱近似在纳卡战区（< 500 km）误差 < 0.1%，足够。转场航线规划超过 `LongRangeThresholdM`（500 km）时用大圆距离（`DMath.Asin` 半正矢公式）。🟡 A-26。

#### 4.1.2 每步移动
```
target = route[routeIndex]
hdg = DMath.Atan2(R × cosφ × Δλ, R × Δφ)          // 指向下一航点，真北顺时针
step = speedMps × 60
若 step ≥ 距离 → 到达该航点（剩余步长沿下一航点继续，最多处理 4 个航点）
否则 φ += step × DMath.Cos(hdg) / R；λ += step × DMath.Sin(hdg) / (R × DMath.Cos(φ))
高度：以 ClimbRateMps（喷气机 50，螺旋桨/无人机 5）线性逼近航点高度
```
- 盘旋（`OrbitCenter` 航点）：到达后在半径 `OrbitRadiusM` 的圆上匀速飞行，位置 = 圆心 + 半径 × (sin θ, cos θ)，`θ += speed × 60 / OrbitRadiusM`。

#### 4.1.3 步内插值
- 步内任意时刻 τ ∈ [0, 60] s 的位置按起点、终点**线性插值**（经纬度、高度分别插值）。
- **进入距离 R 的时刻**：设两实体相对位置 `r(τ) = r0 + v·τ`（在局部平面，以 §4.1.1 的近似换算），解 `|r(τ)| = R` 的最小非负根；无根或根 > 60 → 本步不进入。

### 4.2 任务规划

#### 4.2.1 下达（09 → `StartMission(AirMission spec)`，无命令延迟，T-02）
```text
1. 校验：Flight 空闲或任务可替换；目标在作战半径内（§4.13.1，按剖面）；无人机：目标在数据链半径内（§4.9.1）
   失败 → 通知 AirMissionResult(reason)，命令状态 Failed
2. 选飞机：Flight 中 status == Ready 的机体（升序），有人机取 min(可用, defaultFlightSize)；
   少于 MinAircraftForMission（作战 2、支援 1）→ 排队等待（最长 MissionQueueMaxH，然后失败 NoAirframes）
3. 选挂载（§4.2.2）、扣燃油
4. 准备时间：prep = isQra && type ∈ {Intercept, Cap} ? ScrambleMin : PrepMin[type]
   plannedLaunchAt = now + prep（任务包成员见 §4.2.3）
5. 机体 status = Preparing，availableAt = plannedLaunchAt
```

#### 4.2.2 挂载（§5.2：只能挂所在机场库存里的弹药）
```csharp
LoadoutOption ChooseLoadout(Flight f, AirMissionType t, int nAircraft, out bool degraded) {
    var options = profile.loadouts.Where(o => o.missions.Contains(t)).OrderBy(o => o.priority);
    foreach (var o in options)
        if (o.items.All(it => NodeStock(f.homeBase, it.munitionId) >= it.count * nAircraft)) { degraded = false; return o; }
    // 没有一个方案能满足全部飞机：取“满足度”最高且 ≥ MinLoadoutFill 的方案，按库存平均分给各机（向下取整）
    var best = options.Select(o => (o, fill: o.items.Min(it => NodeStock(..) / (double)(it.count * nAircraft))))
                      .Where(x => x.fill >= MinLoadoutFill).OrderByDescending(x => x.fill).ThenBy(x => x.o.priority).FirstOrDefault();
    degraded = true; return best.o;    // null → 失败 NoMunitions（侦察、转场、诱饵任务允许空挂）
}
```
- `NodeStock` 读 06 的机场节点库存（只读）；起飞时用 06 `TryDrawFromNode(node, ItemKey, qty)` 实际扣除（按 munitionId 升序扣）。同一刻多个编组从同一机场扣弹：按 FlightId 升序串行执行（空中步单线程，确定）。
- **燃油**：起飞时 `TryDrawFromNode(node, JetFuel, fuelKg × nAircraft / 1000)`（吨）；不足 → 失败 `NoFuel`。降落时**未用完的燃油不退回**（简化），未消耗的弹药退回降落机场（06 `ReturnToNode`，A-14）。
- 有人机被击落：机上弹药随之损失。

#### 4.2.3 任务包（§12.3）
```text
对 package 的每个成员 m：routeTime_m = 按其剖面和速度，从各自机场到目标 IP 的飞行时间 + prep_m
tot = max_m(now + routeTime_m) + PackageTotMarginMin
每个成员：plannedLaunchAt = tot − (routeTime_m − prep_m)；提前到达 IP 的在 IP 盘旋（Holding）等待
诱饵、SEAD 成员的 TOT = tot − DecoyLeadMin / SeadLeadMin（先到，引诱雷达开机）
任何成员失败 → 其余成员照常（通知玩家“任务包缺少护航”）
```

#### 4.2.4 航线
```text
起点：机场 → 爬升到剖面高度 → 去程航点 → IP（距目标 IpDistanceM）→ 目标 → 回程 → 机场
剖面：
  HiHiHi：全程 hiAltM
  HiLoHi：距目标 LoSegmentM 以内降到 loAltAglM（离地），出目标 LoSegmentM 后爬升
  LoLoLo：离开机场 LoClimbOutM 后全程 loAltAglM
avoidKnownAd = true 时：对直线航段与“已知敌防空包线”（敌方登记中 05 等级 ≥ Type 的防空营的登记，
  包线半径 = 其拦截弹在该航段高度上的 rangeMaxM）求交；有交时，在包线圆心的左右两侧各试一个绕行点
  （圆心 + 垂直于航段方向 ×(R + AvoidMarginM)），取总航程短且在作战半径内的一侧；两侧都不可行 → 保持直线并在 F5 中提示“航线穿越已知防空”
```

### 4.3 出动生成、再次出动与维护

#### 4.3.1 起飞
- 到 `plannedLaunchAt` 时：机场跑道可用（§4.3.4）且飞行员可用（§4.3.3）→ 创建 `FlightElement`，机体 `Airborne`；否则推迟到条件满足（最长 `LaunchDelayMaxMin`，超时失败）。
- 起飞速率：同一机场每分钟最多 `LaunchesPerMinPerRunway` 架；多出的顺延到下一刻（按 FlightId 升序）。

#### 4.3.2 降落后
```
availableAt = landAt + turnaroundMin + maintElapsedPerFlightH × 本次飞行小时 × 60（分钟）
故障：Bernoulli(1 − exp(−本次飞行小时 × failurePerFlightH))（`failurePerFlightH` 读 07 `ReliabilityProfile`，缺省值归 07 §5.3；RNG SaltMaintFail，键 = itemId）
     命中 → 07.ApplyVehicleDamage(item, FieldRepairable, Breakdown, …)，status = Damaged（07 修好后回到 Ready）
战损返航（被命中未坠毁）→ 07.ApplyVehicleDamage(item, DepotRepair, Firepower, …)
```

#### 4.3.3 飞行员 / 操作员（A-25）
- 飞行员是 02 名册里专业为 `pilot` / `aircrew` / `uav_operator` 的人员，属于中队的“中队营”（A-25）里的班。
- **有人机**：每架起飞需要 `crew` 名可用飞行员。可用 = 健康、过去 24 小时出动次数 < `PilotMaxSortiesPerDay`、距上次落地 ≥ `PilotMinRestH`。
- **无人机组**：同时在空架数 ≤ min(`gcsPerSystem` × 完好地面站比例, floor(可用操作员 / `UavOperatorsPerAirborne`))。
- 练度：`skill = GetSkill(squadronId, specialty, aircraftModel)`，合成值 `0.4 × general + 0.6 × type`（02 §6，与 03 相同）。

#### 4.3.4 机场状态
- 跑道可用性由 06 节点的 `throughputDamage` 代理（🟡 A-27）：`≥ RunwayClosedThreshold` → 不能起降；否则每分钟起飞架数 × `(1 − throughputDamage)`（向下取整，至少 1）。
- 机场关闭时，空中元素改降**最近的、燃油够得着的本国机场**（按距离升序，平局 NodeId 小），`homeBase` 随之改变；都够不着 → 迫降损失（07 `DepotRepair`；无人机 `Destroyed`）。
- 地面上的飞机被打击：06 的 `OnNodeStrike` 只管库存；对停放飞机的效果——每次命中按 `ParkedAircraftHitP × (1 − 加固机库比例)` 抽一架 Ready/Turnaround 的飞机（升序）`DepotRepair`（RNG `SaltParkedHit`）。🟡 A-27。

### 4.4 各任务的飞行行为

| 任务 | 行为 | 结束条件 |
|---|---|---|
| `Ferry` | 飞往目标机场，降落，`homeBase` 改为目标 | 降落 |
| `Intercept` | 飞向目标航迹的**预测拦截点**（目标沿当前航向匀速）；进入空空交战（§4.6） | 目标消失 > `TrackMemoryS` / 打光 / 燃油下限 → 返航 |
| `Cap` | 在目标地块中心盘旋（`OrbitCenter`）；敌方航迹进入 `CapCommitRangeM` 且分类为有人机/无人机 → 自动转截击；离开 `CapLeashM` 后回到盘旋点 | 时间到 / 燃油下限；`autoRelief` 时提前起飞接替（§4.4.8） |
| `Cas` | 见 §4.4.4 | 打光 / 燃油下限 / 时间到 |
| `Strike` | 按航线飞到投放点，投放（§4.8），返航 | 投放完 / 中止 |
| `Sead` | 见 §4.4.5 | 打光 / 时间到 |
| `Escort` | 跟随主任务元素（偏后 `EscortTrailM`）；敌方战斗机航迹进入 `EscortCommitRangeM` → 交战；追击不超过 `EscortLeashM` | 随主任务 |
| `SupportOrbit` | 在指定点盘旋；预警机提供雷达，电子战机施放干扰（§4.5.4），加油机加油（§4.13.3） | 时间到 / 燃油下限 |
| `Recon` | 按 05 的 `AreaReconTask.dwellShare` 在各地块上空轮流盘旋（§4.4.7） | 持续（`autoRelief`） |

#### 4.4.1 燃油下限（所有任务）
```
needToBase = 到最近本国机场的距离 × BurnPerM(当前剖面段) + reserveFuelFrac
fuelFrac ≤ needToBase + BingoMargin → 进入 Rtb
```

#### 4.4.2 打光（Winchester）
- 空空：没有可用空空弹 → 直接返航（护航、CAP 也一样；简化，不做“空弹威慑”）。
- 对地：所有对地弹投完 → 返航（`Cas` 若剩机炮 / 火箭，仍可继续）。

#### 4.4.3 无人机高度档（D5）
- 无人机元素的巡航海拔 = `orbitAltM_byBand[band]`（离地高按所在地块 `Tile.terrain.elevMeanM`（10）换算，至少 `UavMinAglM`）。
- 缺省 `Medium`。TB2 的 Medium = 5500 m：高于 Osa（5 km）、Strela-10/便携（3.5 km）、ZSU-23-4（1.5 km）的射高 → **这些系统打不到**；低于 Kub/Buk/S-300/Tor 的射高 → 这些能打到（**自然涌现**，A-04、A-05）。
- 高度对光电观测质量的影响：`sensorQualityEffective = eoQuality × BandEoFactor[band]`（Low 1.1、Medium 1.0、High 0.85）。

#### 4.4.4 CAS（进入条带，E-12）
```text
1. 选战斗：casBattle ≠ 0 用之；否则在目标地块的活跃 EdgeBattle 中，按 (本方为攻方优先, 本方参战连数降序, EdgeBattleId 升序) 取第一个
   盘旋点 = 该边中点向本方一侧偏 CasOrbitOffsetM（04 §4.1.1 坐标换经纬度）
2. 到站后，每个 CAS 周期（CasCycleS[平台类]）每架有弹的飞机：
   (target, aimPosM, tleSigmaM, directlyObserved) = 04.SelectCasTarget(battleId, side, platformClass, orbitPosM)
   target == 0 → 本周期不攻击
3. 选弹：对车辆目标优先 asm_antitank / 制导弹；对人员与阵地优先非制导航弹、火箭；同类按 `ProcurementProfile.costMusd`（11）升序
4. 攻击航路：
   无人机、带制导弹的高空投放：保持当前高度
   非制导弹药、火箭、机炮：下降到 attackAltAglM 做一次攻击（本周期内该元素高度临时取 attackAltAglM，
      暴露给敌方营属防空 §4.7.7 和地面防空 §4.7）
5. 投放 → GroundStrikeEvent（targetKind = StripElement，sourceTag = Cas 或 UavStrike），计算见 §4.8.2
   投放时刻 = 周期起点 + AttackRunS[平台类]；落点时刻 = 投放 + 弹药飞行时间
6. 04 把落在活跃片段内的事件转成 03 的 ExternalImpactEvent，其余在阶段 110 自行结算（04 §4.4.3）
```

#### 4.4.5 SEAD / DEAD
```text
目标：地块（该地块内所有敌方防空登记）或指定防空营
SEAD（有反辐射弹）：在距目标区 SeadStandoffM 处盘旋；
   每步：敌方任一登记 r 的雷达本步开机且 GroundDistance(元素, r) ≤ ARM rangeMaxM × ArmLaunchFrac →
      对该 r 发射 ARM（MissileKind.Arm）：r 为 SelfContained → 1 枚；BatteryRadar → 2 枚（ArmPerBatteryRadar）；
      同一 r 已有本国在途 ARM 时不再发射
DEAD（无反辐射弹，带精确弹或为察打无人机）：按 Strike 规则打击防空营（targetKind = AirDefenseUnit），
   瞄准点 = 该营最近开机的登记（lastEmittedAt 降序，平局 id 小）的位置，preferredItem = radarItem
诱饵成员（AircraftRole.Decoy）：沿航线以 orbitAltM_byBand[band] 穿越目标区，盘旋直到被击落或燃油下限
```
ARM 到达时：
```
若目标雷达在到达时刻 radarOnThisStep：pHit = ArmHitP
否则：armMemory ? ArmHitP × ArmMemoryFactor : ArmHitP × ArmNoMemoryFactor
命中 → GroundStrikeEvent(targetKind = StripElement 或 Battalion, preferredItem = radarItem, pHitDirect = 1.0)
```

#### 4.4.6 Strike（含情报门槛）见 §4.8.1。

#### 4.4.7 Recon 与无人机组轨道轮换
```text
分配：dwellShare 来自 05 §4.10（每 60 分钟更新）；本元素在“轨道块”（ReconBlockMin 分钟）粒度上选地块：
   deficit_t = dwellShare_t × 已用块总数 − 在 t 上已用块数；取 deficit 最大的地块（平局 tile 升序）
轨道中心 = 地块中心；若 risk ∈ {Low, Medium} 且地块被已知（≥Type）敌防空包线覆盖：
   轨道中心 = 从地块中心沿指向本方机场方向移到包线外 AvoidMarginM 处（standoff）
每步写 05.ReconDwellSample(observer, tile, means, dwellS = 60, sensorQuality, standoffFactor, sourceId = 元素 id,
                           sourceKind = 1, nightFactor = SensorProfile.nightFactor)
   means = SensorProfile.reconMeans（大型无人机 LargeUav；侦察吊舱 ReconPod；对地监视雷达机 GmtiAircraft；电子侦察吊舱 Elint）
   standoffFactor = clamp(1 − max(0, d(轨道中心, 地块中心) − TileRadiusM) / EoSlantRangeM, 0, 1)
   过境中（未到站）经过地块上空也写样本（dwellS = 本步在该地块上空的秒数，按插值）
```
- **察打一体**：带对地弹的无人机执行 Recon 或 Strike 时，同时按 §4.8.3 的“猎杀”规则攻击。
- **轮换接替**（`autoRelief`）：对每个在站元素，预测其 Rtb 时刻 `t_bingo`；当 `now ≥ t_bingo − (接替机飞到站的时间 + prep)` 且有 Ready 机体和空闲地面站（无人机）→ 起飞接替；接替机到站后，原元素返航。无人机组的同时在空架数受 §4.3.3 限制。

#### 4.4.8 CAP、Recon、SupportOrbit 的自动接替同 §4.4.7 末段。

### 4.5 探测与空情

#### 4.5.1 雷达探测距离
```
R_rcs   = airRadarRangeMAt1m2 × (RCS_eff)^(1/4)                      // 总纲 §12.5
RCS_eff = 元素内存活飞机数 × rcsM2（编队 RCS 相加）；导弹/巡飞弹用自身 rcsM2
R_slow  = (目标速度 < SlowTargetSpeedMps) ? R_rcs × slowTargetFactor : R_rcs        // 老式动目标显示（A-04）
R_jam   = R_slow × JamFactor（§4.5.4）
R_hor   = 4120 × (sqrt(hRadarAgl) + sqrt(hTargetAgl))  m                 // 雷达地平线（总纲 §12.4）
R_hor_masked = (hTargetAgl < MaskAltAglM && !isLookDown) ? R_hor × MaskFactor[雷达所在地块的主地形] : R_hor
探测成立 ⇔ 雷达开机 && SlantRange ≤ R_jam && GroundDistance ≤ R_hor_masked && hTargetAgl ≤ airRadarMaxAltM
```
- 确定性判定（不抽样，A-02）：数字透明，玩家能在包线图上看到“TB2 在 9 km 外被 Osa 雷达发现”。
- `MaskFactor[主地形]`：Mountain 0.4、Forest 0.9、其他 1.0（主地形 = 地块 `TerrainComposition` 占比最大者，10）。纳卡山地让低空目标（直升机、巡航导弹、低飞无人机、巡飞弹俯冲前段）很难被地面雷达早发现。
- 下视雷达（预警机、战斗机雷达 `isLookDown`）不受掩蔽；低空目标对下视雷达有杂波：`hTargetAgl < 300` → `R_jam × LookDownClutterFactor`。

#### 4.5.2 光学 / 红外搜索（红外防空、便携导弹、格斗、无雷达时）
```
R_opt = opticalAirRangeM × (RCS_eff)^(1/4) × Light（Day 1.0 / Twilight 0.6 / Night：有热像 0.6，否则 0.15）
探测成立 ⇔ SlantRange ≤ R_opt && GroundDistance ≤ R_hor_masked（取 hRadarAgl = 3 m）
```
（以 RCS 的四次方根作视觉尺寸的代理，简化；用 `DMath.Pow(RCS, 0.25)` 或两次 `Math.Sqrt`；昼夜读 09 `GetLightCondition`。）

#### 4.5.3 电子支援（被动发现辐射源）
- 任何带 `esmRangeFactor > 0` 的传感器（ELINT 飞机、反辐射导引头、部分战斗机 RWR），对开机雷达 r：`GroundDistance ≤ r 自身对 1 m² 探测距离 × esmRangeFactor` 且在雷达地平线内（以辐射源天线高、接收机高计算）→ 得到 r 的位置（误差 `EsmPosErrorM`）。
- 这产生 05 的 Elint 观测（通过 `ReconDwellSample(means = Elint)` 写入）和空中层的 SEAD 目标。

#### 4.5.4 干扰
```
电子战机（SupportOrbit，jammerQuality > 0）或自卫吊舱：对敌方雷达 r，若干扰源到 r 的距离 ≤ JammerRangeM：
   JamFactor = 1 − JamReduction × jammerQuality
   烧穿：若目标到 r 的距离 ≤ BurnThroughFrac × R_slow → JamFactor = 1
多个干扰源：取 JamFactor 最小者（不叠加）
```

#### 4.5.5 空情航迹与网络
```text
每步对每个国家 c：
  传感器集合 = c 的开机雷达（机载、地面登记）、光学传感器、ESM
  对每个敌方空中目标 x（FlightElement、MissileInFlight 中 isInterceptable 的）：
     若被 c 的任一传感器探测 → 更新 AirTrack(c, x)：lastSeen = now，位置、速度、分类（§4.5.6）
  航迹保留：now − lastSeen ≤ TrackMemoryS；超过则删除
网络共享：isNetworkCapable 的防空登记、机载预警机、本国战斗机（数据链）共享国家空情，延迟 NetworkLatencyS
  （即只能使用 lastSeen ≤ now − NetworkLatencyS 的共享航迹；本单位自己探测到的立即可用）
不入网的单位（老式自主营：Osa、Strela-10、ZSU-23-4 缺省）只用自身和本营雷达
```

#### 4.5.6 分类
```
观测方的分类 = 真实 airTargetClass，除了：
  诱饵（isDecoy）→ 显示为其 airTargetClass（数据设为 SlowAircraft），观测方无法区分（A-12）
  导弹类：只要被探测就按真实类别（速度和轨迹足以区分）
```

### 4.6 空空交战（简化 CMO）

#### 4.6.1 超视距（BVR）
```text
每步，对每个有雷达制导空空弹且雷达开机（或主动弹可用网络航迹）的有人机元素 a（FlightElementId 升序）：
  候选目标 = a 所属国的敌方航迹，分类 ∈ {FastJet, SlowAircraft, Helicopter, MaleUav}，在 a 的探测或网络内
  按距离升序为 a 的每架飞机分配一个未被本国本步其他导弹锁定的目标（平局 target id 小）
  发射条件：r ≤ LaunchRangeFrac × Rmax_aspect；Rmax_aspect = rangeMaxM × AspectRangeFactor(aspect)
     aspect：目标速度方向与“目标→射手”连线夹角 θ；θ ≤ 45° 迎头 1.0；45–135° 侧向 0.7；> 135° 尾追 0.4
  发射：每个目标 1 枚（ShotsPerTargetBvr），创建 MissileInFlight，pkAtLaunch = PkBvr(r)
     flightTimeS = r / (AvgSpeedFrac × speedMps)；impactAt = 发射时刻 + flightTimeS
  半主动弹（RadarSemiActive）：射手必须保持雷达照射到命中，期间航向锁定指向目标
PkBvr(r) = PkMax[guidance] × RangeFactor(r / Rmax_aspect) × SkillShooter × EvadeTarget × EcmTarget
  RangeFactor(x) = x ≤ NezFrac ? 1 : 1 − (1 − PkAtMaxFrac) × (x − NezFrac) / (1 − NezFrac)
  SkillShooter = 0.6 + 0.5 × skill_shooter          ∈ [0.6, 1.1]
  EvadeTarget  = 1.15 − 0.3 × skill_target × agilityTarget       （无人机 skill 取 0，agility 取 0）
  EcmTarget    = 1 − EcmPkReduction × jammerQuality_target
到达时：目标仍存活 → Bernoulli(min(1, pkAtLaunch))（RNG：For(Air, Mix(missileId) ^ targetItemId, tick, SaltAamHit)）
```

#### 4.6.2 近距格斗（WVR）
```text
双方有人机元素距离 ≤ WvrRangeM 且至少一方探测到对方：每步每架有红外弹或机炮的飞机一次射击机会
  射击时刻 τ = WvrBaseTimeS × (1.5 − skill)（毫秒取整；平局按 itemId）
  p = PkWvr[weapon] × (helmetCueing ? HobsBonus : 1) × sqrt((agility_s + 0.1) / (agility_t + 0.1))
      × (目标未探测到射手 ? SurpriseBonus : 1) × (目标 hasFlares && weapon 为红外 ? FlarePkFactor : 1)
  p 截断到 [0, 0.95]；Bernoulli（SaltWvr）
  已被更早事件击落的射手，本步后续射击作废（§4.0 第 6 步）
```

#### 4.6.3 命中后的结果（空空、地空通用）
```
目标为有人机：Bernoulli(survivabilityOnHit)（SaltSurvive）→ 未坠毁：伤返，07 DepotRepair；坠毁：07 Destroyed
   飞行员：坠毁时 Bernoulli(EjectP)；跳伞者在本国控制地块 → 归队（07 LightWounded 概率 0.5）；敌控 → 07 MissingOrCaptured
目标为无人机 / 巡飞弹 / 导弹：直接摧毁
```

### 4.7 地面防空（双登记与拦截策略）

#### 4.7.1 登记与位置（每步刷新）
- **哪些单位登记**：装备里有带 `AirDefenseProfile` 型号的营（防空营、旅防空连）。
  - `SelfContained`（Osa、Tor、Strela-10、ZSU-23-4、自行弹炮）：**每辆**发射车 1 个登记（`launchers` = [该车]）。
  - `BatteryRadar`（S-300、Kub、Buk 连、Krug、Barak-8）：**每个连**（含雷达车的最低一级 OrgUnit）1 个登记。
  - 发射车被 07 判为非 `Operational` → 从 `launchers` 移除；雷达车损毁 → `BatteryRadar` 登记不能用雷达（只剩网络航迹能力：若 `isNetworkCapable` 且有网络航迹，可用拦截率 × `NoOwnRadarPkFactor`；否则不能开火）。
- **位置**：
  - 防空元素在某活跃 `EdgeBattle` 的条带上（04 的 `StripElementKind.AirDefense`，`isSharedAsset` 或本营元素）：位置 = 04 的 `tileLocalPosM` 换成经纬度（04 §4.1.1；同一实体在多条边上的投影都来自同一个 `tileLocalPosM`，E-03）。
  - 否则：位置 = 营所在地块中心 + 确定性螺旋偏移：第 j 个登记（按 id 升序）`r_j = TileAdSpreadM × sqrt((j + 0.5)/n)`，`θ_j = j × 2.39996 rad`（与 04 §4.4.3 同一种黄金角螺旋）。
- **状态**：营 `Posture ∈ {Marching, CrossingEdge}` → `Moving`（`canFireOnMove` 的系统可以短停射击：反应时间 + `ShortHaltS`）；停止后 `deployMin` 才变为 `Deployed`。

#### 4.7.2 雷达开关（电磁管控）
```
emcon == Active  → 雷达常开（state ∈ {Deployed} 或 canFireOnMove）
emcon == Partial → 雷达只在以下情况开：
     (a) 有网络航迹（或本营其他登记的航迹）预测在未来 PartialCueLookaheadS 内进入本登记 1.5 × 最大射程；或
     (b) 本登记正在交战（有导弹在制导中）
emcon == Silent  → 雷达关；radarRequiredToFire 的系统不能开火
ArmShutdown：探测到飞向本登记的反辐射弹且 policy ∈ {Balanced, Conserve}（或该登记没有能打 ARM 的弹）→
     立即关机 ArmShutdownS 秒（期间不开火；已在制导中的指令/半主动导弹失去制导 → 作废）
每步：radarOnThisStep 记录；radarOnSecondsWindow += 60（开机时）；
每步末：若 (n+1) % ExposureStepMinutes == 0：radarOnFraction = radarOnSecondsWindow / (ExposureStepMinutes × 60)，清零
     （覆盖刻 n−9..n，由刻 n+1 的 Exposure 步读，05 §4.1.3）
```

#### 4.7.3 威胁评估（每步，每个能开火的登记，AdRegistrationId 升序）
```text
候选 = 本登记可用航迹（自身雷达/光学，或网络航迹若入网）中，预测在 [now, now + EngageLookaheadS] 内
       进入本登记某拦截弹包线（rangeMin ≤ 斜距 ≤ rangeMax 且 altMin ≤ 离地高 ≤ altMax）的目标
排序（全序）：
  1. 飞向本登记的威胁（ARM、俯冲中且瞄准本登记的巡飞弹、瞄准本登记的对地弹）
  2. 其他来袭弹药（巡航导弹、弹道导弹、巡飞弹）
  3. 有人机（FastJet、SlowAircraft——含诱饵、Helicopter）
  4. 带弹无人机（观测方不知道是否带弹：MaleUav 一律按带弹处理）
  5. 其他（SmallUav）
  同级内：预计到达最近点的时间升序 → 目标 id 升序
国家级去重（TargetEngagementLedger，每步清空）：若某目标已有本国在途拦截弹，其合成命中概率
  1 − Π(1 − pk_i) ≥ PolicyTargetP[本登记 policy] → 本登记跳过它
```

#### 4.7.4 拦截策略：打几发（§14.1.1 ✅🟡）
```csharp
// pk：本次单发概率（§4.7.5）；m：本目标在包线内还剩几次“打一发、看结果”的机会
int m = Clamp(Floor((tExit - tFirstShot) / (flightTimeS + AssessS)), 1, MaxOpportunities);
double P = PolicyTargetP[policy];                       // Safe 0.95, Balanced 0.85, Conserve 0.70
int s;
switch (policy) {
  case Safe:     s = MinS(pk, P, opportunities: 1);    break;   // 不指望第二次机会，一次齐射
  case Balanced: s = (m >= 2) ? MinS(pk, P, m) : MinS(pk, P, 1); break;   // 时间够：先打少量再看
  case Conserve: s = (m >= 2) ? 1 : MinS(pk, P, 1);   break;   // 时间够：永远一发一看
}
s = Min(s, PolicySalvoCap[policy], readyRoundsOfChosenType, missileChannels - guidedMissilesInFlight);
// MinS(pk, P, k) = 最小的 s ≥ 1，使 1 − (1 − pk)^(s × k) ≥ P；pk ≤ 0 → 不开火
```
- **弹药节省的放过规则**：policy == Conserve 且目标排序级别为 4 或 5（无人机）且不是飞向本登记或其保护目标、且本登记最便宜的可用拦截弹 `ProcurementProfile.costMusd`（11）`> ConserveCheapCostMusd` → 不打（F3 记“放过”）。
- `tExit`：按目标当前速度外推，离开包线的时刻（最多看 `EngageLookaheadS`）；`tFirstShot = max(now, tEnter) + (本目标首次交战 ? reactionTimeS : 0)`。
- 开火后若目标仍存活且还在包线内：下一次机会再按同一规则重新计算（“打一发、看结果、再补射”）。

#### 4.7.5 选弹与单发概率
```
可行弹 = interceptorIds 中有待发弹、且目标在 tFirstShot 时刻处于其包线内的
Safe：选 rangeMaxM 最大的（最早拦截）；Balanced / Conserve：选 `ProcurementProfile.costMusd`（11）/ pk 最小的（单位命中成本最低）；平局 munitionId 升序
pk = pkVs[class] × EdgeFactor × LowAltFactor × SkillAd × EcmFactor × FlareFactor × (无自身雷达 ? NoOwnRadarPkFactor : 1)
  class = 观测方分类（诱饵按 SlowAircraft）
  EdgeFactor   = (r / rangeMaxM ≤ 0.7) ? 1 : 1 − 0.3 × (r / rangeMaxM − 0.7) / 0.3       // 包线边缘降到 0.7
  LowAltFactor = (目标离地 < LowAltAglM && 制导为雷达/指令) ? LowAltPkFactor : 1
  SkillAd      = 0.7 + 0.4 × skill（防空操作员专业，02）
  EcmFactor    = 制导为雷达/指令 ? 1 − EcmPkReduction × jammerQuality_target : 1
  FlareFactor  = 制导为红外 && 目标 hasFlares ? FlarePkFactor : 1
```

#### 4.7.6 开火与飞行
```
第 k 发（k = 0..s−1）的出膛时刻 = tFirstShot + k × SalvoIntervalS
flightTimeS = 出膛时斜距 / (AvgSpeedFrac × speedMps)；impactAt = 出膛 + flightTimeS
06.TryConsume(发射车所在班, ItemKey(munition), 1)；readyRounds−−；guidedMissilesInFlight++（指令/半主动）
到达：目标仍存活 && 雷达仍在制导（指令/半主动时）→ Bernoulli(pk)（RNG：For(Air, Mix(missileId) ^ targetId, tick, SaltSamHit)）
      guidedMissilesInFlight−−
开火即开机：radarRequiredToFire 的系统开火时本步雷达视为开机（即使 Partial）
```

#### 4.7.7 营属防空（便携导弹、高炮；A-07）
```text
对每个非防空营 b 的 OrganicAirDefense（有 manpads/spaag/gun）：
  位置：b 在条带上 → 每个有这些装备的连元素各自一个“泡”，位置 = 元素位置；否则 = 营位置（09）
  对每个敌方空中目标 x，本步 x 与泡的最近斜距 ≤ 武器 rangeMaxM 且离地高在 [altMin, altMax] 内，且光学探测成立（§4.5.2）：
     对每类武器 w（manpads → spaag → gun 顺序）：
       pEngage = 1 − (1 − OrganicEngageP[w] × Light)^count_w
       Bernoulli(pEngage)（SaltOrganicEngage，键 = Mix(battalionId) ^ x.id）→ 射击 1 次：
          便携/弹炮导弹：06.TryConsume 1 枚，Bernoulli(pk)（pk 按 §4.7.5，SkillAd 用营的通用练度）
          高炮：一次点射（消耗 GunBurstRounds 发），Bernoulli(pk)
       一旦击落，停止对 x 的后续判定
  Conserve/Balanced/Safe 不适用于营属防空（班组自主射击）
```

#### 4.7.8 待发弹、再装填、转移
- `readyRounds` 初值 = `readyRounds × 完好发射车数`，但不超过发射车所在班的 06 弹药存量。
- 待发弹为 0 且班里还有该弹（06 `GetAvailable`）→ `Reloading`，`reloadMin` 后补满（受存量限制）。
- **打完就转移**（`relocateAfterFiring`，`SelfContained` 缺省开、`BatteryRadar` 缺省开）：本登记某步开过火 → `MarchOrder`（`marchOrderMin`）→ `Relocating`（移动 `RelocateDistanceM`，用时 = 距离 / `RelocateSpeedMps`）→ `deployMin` → `Deployed`。新位置 = 旧位置沿 `θ = (登记 id × 2.39996 + 转移次数 × 1.5708) rad` 方向偏移（确定性）。不在条带上时，地块螺旋偏移的基准点随之更新；在条带上时，通知 04 更新 `tileLocalPosM`（🟡 A-08）。
- 转移的意义：敌方的 L4 打击瞄准点是“观察方最后看到的位置”（§4.8.1）。登记在敌方 `lastObservedTime` 之后转移过 → 精确打击落空（除非打击平台自主重新获取）。

### 4.8 空对地

#### 4.8.1 打击目标选择与情报门槛（10.5）
```text
在投放前 RecheckBeforeTotMin 分钟和投放时刻各检查一次：
targetKind == KnownUnit / AirDefenseUnit：
   (lvl, age, posture) = 05.GetLevel / GetAgeMs / 观察时姿态（05 `IntelEstimate.observedPosture`）
   precise = 05.PrecisionStrikeAllowed(lvl, age, posture)
targetKind == Tile：
   候选 = 05 情报中该地块内的敌方目标（营、未识破假目标），PrecisionStrikeAllowed == true，
          按 AirTargetValue[typeGuess] × estVE 降序（平局 target id 小），取第一个
   无候选 → precise = false
targetKind == LogisticsNode / Bridge：05 §4.8 固定设施恒为 L4 → precise = true
precise == false → 按 fallback：
   Abort      ：返航，AirMissionResult(IntelInsufficient)（有人机缺省）
   AreaAttack ：仅当挂载有面杀伤弹（非制导、集束、GNSS）；打 L2–L3 目标的估计位置，cepM 用 L 级定位误差（§4.8.2）
   SelfAcquire：仅当平台有光电搜索能力（loadout.hasTargetingPod 或无人机/巡飞弹）：
                在目标区盘旋最多 SelfAcquireMaxMin[平台]，每分钟按 05 §4.4.5 获取（见 §4.8.3）；成功 → precise
                （无人机缺省）
瞄准点：观察方相信的位置 = 05 `ExposureRecord.lastObservedLatDeg/lastObservedLonDeg`（观测时由 09 `GetBattalionPosition` 给真位置；
        若观察后目标移动过，瞄准点仍是旧位置 → 真实偏差由 04/03 结算时体现）
```

#### 4.8.2 投放与对地事件
```text
投放点：到瞄准点的距离 ≤ ReleaseRangeFrac × rangeMaxM_eff
   rangeMaxM_eff：滑翔/有动力弹 = rangeMaxM × (投放海拔 < 3000 ? LowAltGlideFactor : 1)；非制导航弹 = DumbReleaseRangeM
飞行时间：弹药 speedMps > 0 ? 距离 / (AvgSpeedFrac × speedMps) : 距离 / FreeFallAvgMps
每枚弹药生成一个 GroundStrikeEvent：
  TLE = 05.TargetLocationErrorM(lvl, age, posture)（自主获取/直接观察时 = DirectObsTleM）
  直接命中类（LaserSemiActive 且有照射：自身 canSelfDesignate 或同一目标有本方照射者；EoTv、IrImaging、LoiterEo/EoRf；ARM）：
     pHitDirect = GuidanceReliability[guidance] × min(1, seekerFootprintM / max(TLE, 1))
     cepM = 弹药 cepM
  GNSS：pHitDirect = 0；cepM = sqrt(cepM² + TLE²)
  非制导：pHitDirect = 0；cepM = max(DumbCepMinM, DumbCepPerKmAlt × 投放离地高(km)) × (1.5 − skill)
  激光制导但无照射：按非制导处理（cepM 同上）
  timeMs = 投放时刻 + 飞行时间（毫秒，MidpointRounding.ToEven）；sourceEntityId = 元素 id；seq = 本元素本刻第几枚
目标是 Node / Crossing：08 自己算命中数（06 只接受 hits）：
   σ = cepM / 1.1774；pHitNode = pHitDirect > 0 ? pHitDirect : 1 − DMath.Exp(−NodeRadiusM² / (2σ²))（NodeRadiusM 用 04 的常数）
   hits = Σ Bernoulli(pHitNode)（SaltGroundHit）；WarheadClass 按 warheadKg（06）
   08 在投放时算出 hits，把 NodeStrikeEvent / CrossingStrikeEvent（带 timeMs）入队；在阶段 110（GroundEventApply）
   当 timeMs < (n+1)·60000 时调 06.OnNodeStrike / OnCrossingStrike
目标是 Loc（交通线）：trucksKilledExpected = 投放枚数 × LocKillPerWeapon × min(1, 06.GetTrafficTrucksPerH(victim, tile) / LocTrafficNorm（04 常数））；
   同样带 timeMs 入队（LocStrike），在阶段 110 当 timeMs < (n+1)·60000 时调 06.OnLocStrike
其他目标：事件进入 04 的队列（04 在阶段 100/110 交 03 或自己结算，毁伤与 AAR 归因由 03/04/07 负责）
```

#### 4.8.3 察打一体：猎杀（无人机在 Strike/Recon/Cas 中）
```text
带对地弹的无人机元素在站期间，每分钟：
  候选 = 元素所在地块（及轨道覆盖的相邻地块，standoffFactor > 0）中，本国对其 PrecisionStrikeAllowed 的敌方目标
         （含本元素自己刚获取的）；Recon 任务只打 AirTargetValue ≥ HunterMinValue 的目标
  无候选且任务允许 SelfAcquire：对地块内每个敌方目标 i（S_phys 降序，平局 id 小）依次：
      p_i = 05.SearchAcquireProbabilityPerMin(S_phys_i, eoQuality × BandEoFactor, priorLevel_i, isNight, nightFactor)
      Bernoulli(p_i)（SaltSelfAcquire，键 = Mix(elementId) ^ target）→ 成功：05.RegisterSelfFix(c, i, LargeUav)，停止本分钟判定
  有候选 → 按 §4.8.2 投放 1 枚（每 UavStrikeCycleS 最多 1 枚/架）
```
- 这就是 2020 年 TB2 的“自己找、自己打、顺便给炮兵指示目标”：自主获取写入 05 后，本国炮兵/火箭炮（04）也能用这个 L4。

### 4.9 无人机组

#### 4.9.1 数据链
- 无人机元素到其控制站（= `homeBase` 机场，或 14 指定的前出地面站位置）的地面距离 ≤ `datalinkRangeM`，且以控制站天线高 `GcsAntennaAglM`、无人机离地高计算的雷达地平线内（§4.5.1 公式，含 `MaskFactor`）。
- 出界：元素自动掉头回到边界内（航线截断）；任务目标在界外 → 任务下达时就失败（`DatalinkRange`）。
- 卫星数据链（`datalinkRangeM = 0` 表示无限制，如更大的无人机）：不受此限。

#### 4.9.2 同时在空数与轮换
见 §4.3.3、§4.4.7。

#### 4.9.3 中型无人机抽象损耗（给 05 §4.2.2、§4.10）
```
AbstractUavAttritionPerH(observer c, tile t, model) =
   1 − exp(−λ)，λ = Σ_{敌方登记 r} AbstractEngagePerH × pkBest(r, class(model)) × coverFrac(r, t) × radarFactor(r)
            + Σ_{敌方营属防空泡 o 在 t} OrganicUavKillPerH × [model 的巡航离地高 ≤ o 的最大射高]
  只计 model 巡航离地高（orbitAltM_byBand[Medium] 换算）在 r 的射高包线内的 r
  coverFrac = min(1, (rangeMaxM_best(r))² / TileRadiusM²) × [GroundDistance(r, t 中心) ≤ rangeMaxM_best + TileRadiusM]
  radarFactor = radarRequiredToFire ? (emcon == Silent ? 0 : r.radarOnFraction 或 Active 时 1) : OpticalAirFactor
```
- 12 的 `AirDefenseRisk` 也可以调用本函数（I-16 由 12 决定）。

### 4.10 巡飞弹（E-07）

#### 4.10.1 发射入口
```csharp
// 04 C 线（条带目标）调用
LaunchId LaunchLoiteringMunition(StripElementId battery, ModelHandle munition, StripElementId targetElement, SimTime launchTime);
// 04 A 线（跨地块打击命令，目标为地块/已知营/防空营）调用
LaunchId LaunchLoiteringSearch(OrgUnitId launcherBattalion, ModelHandle munition, StrikeTargetKind kind, ulong tile, ulong entityId, SimTime launchTime);
```
- 发射位置 = 发射营位置（条带：元素位置换经纬度；否则营位置）。距离 + `MinSearchMin` 分钟搜索所需续航超过 `loiterEnduranceH`，或超过 `rangeMaxM` 的一半以上不能返回也无所谓（一次性）——只检查单程：距离 / 平均速度 + `MinSearchMin` ≤ 续航，否则拒绝（返回 0，04 记“射程不足”）。

#### 4.10.2 状态机
```text
Boost（LmBoostS）→ Midcourse：以 cruiseAltAglM、AvgSpeedFrac × speedMps 飞向目标区中心
  目标区中心：条带目标 = 目标元素的位置（发射时）；地块 = 地块中心；已知营 / 防空营 = 05 `ExposureRecord.lastObservedLatDeg/lastObservedLonDeg`
→ Search（到达目标区）：以 LmSearchRadiusM 盘旋；每分钟：
   (1) RF：若 rfSeekerRangeM > 0，且有敌方登记本步雷达开机、距离 ≤ rfSeekerRangeM → Bernoulli(RfAcquirePerMin)（SaltLmAcquire）
       → 成功：锁定该登记（preferredItem = radarItem）
   (2) 否则 EO：候选 = 条带模式：目标元素（priorLevel = 04 直接观察 ? 4 : 05 等级）；
                     搜索模式：目标区半径内的敌方目标（营、假目标），S_phys 降序
       依次 Bernoulli(05.SearchAcquireProbabilityPerMin(S_phys, seekerQuality, priorLevel, isNight, nightFactor))，第一个成功者锁定
   同时写 05.ReconDwellSample(observer, tile, MediumUav, 60, seekerQuality × LmReconQualityFactor, 1, sourceId = missileId,
                              sourceKind = 2, nightFactor = 1.0)
   续航耗尽 → Lost（04 回调“未获取”）
→ Terminal：俯冲时长 = 当前离地高 / LmDiveSpeedMps；俯冲期间 inFlightClass = LoiteringTerminal、速度 = LmDiveSpeedMps
→ Impact：GroundStrikeEvent（targetKind = StripElement 或 Battalion，preferredItem，pHitDirect = GuidanceReliability[guidance]
          × (RF 锁定且雷达在俯冲期间关机 ? RfOffTerminalFactor : 1)，sourceTag = Loitering）
被拦截（任何阶段）→ Intercepted，04 回调“被拦截”（04 counters.lmIntercepted）
```
- 获取后 `05.RegisterSelfFix(c, target, ReconMeans.MediumUav)`（巡飞弹的光电画面实时回传；Harop 类为人在回路）。
- 巡飞弹在 Midcourse/Search 阶段的目标类别 = `inFlightClass`（Harop：SmallUav）；Terminal 阶段 = `LoiteringTerminal`（拦截率低：04 的 `AdPkVsLm` 与本文件表一致，§5.5）。

### 4.11 空中诱饵
- `AircraftRole.Decoy` 的编组（如 An-2 改装）以 `Sead` 任务成员或单独 `Sead` 任务出动，按 §4.4.5 在目标区盘旋。
- 被观测方分类为 `SlowAircraft`（§4.5.6），按排序第 3 级（有人机）被拦截；`Conserve` 的放过规则不适用（看起来是有人机）。
- 效果全部自然产生：敌方雷达为了打它而开机（ELINT/反辐射/巡飞弹 RF 获取机会），拦截弹被消耗。

### 4.12 地面发射的弹道导弹与巡航导弹（04 发射，08 飞行和拦截）
```csharp
void RegisterGroundLaunchedMissile(FireMissionId mission, int roundIndex, ModelHandle munition,
                                   double launchLat, double launchLon, double aimLat, double aimLon,
                                   SimTime launchTime, SimTime impactTime);
```
- 仅 `isInterceptable == true` 的弹药登记（战术弹道导弹、巡航导弹）；火箭炮弹（含制导火箭）阶段 1 不可拦截（🟡 A-18）。
- 弹道：`apogeeM = clamp(BallisticApogeeFrac × 射程, 10 000, 100 000)`；飞行时间由 04 给出（04 用 `BallisticFlightTimeS = 120 + 0.6 × 射程km` 的建议值，见 §5.6）；位置按抛物线插值；只在最后 `BallisticTerminalS` 秒、且拦截弹 `canEngageBallistic` 时可拦截，类别 `BallisticMissile`。
- 巡航：沿直线以 `cruiseAltAglM` 掠地飞行，速度 `speedMps`；类别 `CruiseMissile`；雷达地平线与掩蔽自然限制发现距离。
- 被拦截 → 调 `04.CancelScheduledEvent(mission, roundIndex)`（拦截必然发生在落点时刻之前；若在落点同一刻，阶段 90 先于 110，所以能取消）。

### 4.13 燃油与航程

#### 4.13.1 作战半径缺省
`radiusHiLoHiM` 缺省 = `HiLoHiRadiusFrac × radiusHiHiHiM`；`radiusLoLoLoM` 缺省 = `LoLoLoRadiusFrac × radiusHiHiHiM`。

#### 4.13.2 消耗
```
BurnPerM(高空段) = 1 / (2 × radiusHiHiHiM × (1 + RadiusMarginFrac))
BurnPerM(低空段) = 1 / (2 × radiusLoLoLoM × (1 + RadiusMarginFrac))
盘旋：每分钟 = 1 / (enduranceH × 60)
每步：fuelFrac −= 本步飞行距离 × BurnPerM(当前段) （盘旋时用盘旋消耗）
加力格斗（WVR 中）：额外 WvrFuelPerMin
```
- 下达校验（§4.2.1）：按航线逐段累加所需燃油 + `reserveFuelFrac` + 计划盘旋 ≤ 1，否则 `OutOfRange`。

#### 4.13.3 空中加油（MVP 双方均无加油机，规则留好）
- 加油机 `SupportOrbit` 在站；受油元素距加油机 ≤ `TankerRangeM` 且 `fuelFrac < TankerTriggerFrac` → 本元素进入 Holding `RefuelMinPerAircraft × 架数` 分钟，结束时 `fuelFrac = 1`；加油机可给出的燃油总量 = 其 `fuelKg × TankerOffloadFrac`。

### 4.14 空运、空降、机降（§15，阶段 1 简化）
```text
输入：运输机/直升机 Flight（role = Transport/UtilityHelicopter），被运营 b（或 SOF 连），方式 AirliftMethod，LiftPriority
1. 逐班判定（§15.3）：
   人员：全部可运（FastRope、Paradrop 需伞降资格 AirborneQualified，02；无资格的人留下）
   装备：Paradrop 需 06 MobilityProfile.isAirdroppable；SlingLoad 需 isSlingLoadable；AirLanding 只看质量
         单件质量 ≤ cargoKg（吊挂：≤ 吊挂上限 SlingMaxKg）
   班结果：Full / PersonnelOnly / None；CompleteSquadsOnly 时 PersonnelOnly 班视为 None
   留下的人和装备 → 01 的 RearDetachment（00 §1.1；由 08 调 01 `CreateRearDetachment(bn, tile, persons, items)` 建立，见 01 §6.1）
2. 架次：totalMassKg = Σ 可运人员 × PaxMassKg + Σ 可运装备质量；
   sortiesNeeded = max(ceil(totalMassKg / (cargoKg × LoadFactor)), ceil(人数 / paxCount))
   cycleH = 2 × 距离 / cruiseMps / 3600 + LoadUnloadH[method] + turnaroundMin / 60
   waves = ceil(sortiesNeeded / 可用架数)；预计完成 = waves × cycleH − 最后一波返程
3. 执行：每波都是空中层的真实飞行元素（可被探测和拦截）；被击落的飞机上的人员按 07 处理（Killed 比例 TransportLossKilledFrac）
4. 落地：AirLanding 要求目的地块有本国控制的机场或简易跑道（10/06 节点）；直升机任意地块
   Paradrop：落地后集结 ParaAssemblyH（夜间 × 1.5）；集结期间营姿态 Assembling，战斗力 × ParaAssemblingCombatFactor（04/03 读取）
```
- SOF 的伞降/机降投送（05 §4.11）使用本流程，被运营 = SOF 连；方式映射：`SofInsertion.Parachute` → `Paradrop`（+ `ParaAssemblyH`），`SofInsertion.HeliInsertion` → `FastRope`；装卸时间用 `LoadUnloadH[method]`。

### 4.15 给 06 的预计消耗 `ExpectedDailyUse(airbase, item)`
```
有历史：过去 72 小时该机场对该物资的实际消耗 / 3（每次挂载出库计入；退回的扣除）
无历史：Σ_{驻该机场的 Flight} 架数 × PlanningSortiesPerDay × (item ∈ 该机型优先级 1 挂载 ? 每架数量 × PlanningExpendFrac : 0)
JetFuel：Σ 架数 × PlanningSortiesPerDay × fuelKg / 1000（吨）
```

### 4.16 输出给 AAR / 13
- 每次开火、命中、损失、放过、诱饵被打都写 `BattleEventLog`（15）；按机型/弹种/防空系统汇总 F3、F6、F7。
- **成本交换比**：对每个防空营：`Σ 消耗拦截弹 ProcurementProfile.costMusd (11)` vs `Σ 击落目标的单价`（11 的 `ProcurementProfile.costMusd`），显示“打一架 Orbiter-3 花了 2 枚 9M33（0.30 M$）”。

---

## 5. 常数表

> 存放 `data/tuning/08_air_ops.yaml`（G-15）。`confidence` 除注明外均为 `estimated`。

### 5.1 时间与出动

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `AirStepMinutes` | 1 | min | — | G-05 |
| `ScrambleMin` | 5 | min | 3–15 | 战备值班起飞 |
| `PrepMin[Intercept/Cap/Strike/Cas/Sead/Escort/Recon/SupportOrbit/Ferry/Airlift]` | 15/30/45/45/45/30/30/45/20/60 | min | ×0.5–2 | 挂弹、任务准备 |
| `MissionQueueMaxH` | 6 | h | 1–24 | |
| `LaunchDelayMaxMin` | 60 | min | 15–180 | |
| `LaunchesPerMinPerRunway` | 2 | 架/min | 1–4 | 编队起飞间隔约 30 s |
| `MinAircraftForMission` | 作战 2 / 支援 1 | 架 | — | |
| `MinLoadoutFill` | 0.5 | — | 0.25–1 | 缺弹降级门槛 |
| `TurnaroundMin`（缺省） | 战斗机 60 / 攻击机 75 / 大型无人机 120 / 直升机 45 / 运输机 90 | min | ×0.5–2 | 战时再次出动 1–2 h 量级 |
| `MaintElapsedPerFlightH`（缺省） | 战斗机 0.5 / 攻击机 0.4 / 无人机 0.12 / 直升机 0.6 | h/飞行 h | ×0.5–2 | 维护工时 ÷ 地勤人数的折算 |
| `PilotMaxSortiesPerDay` | 3 | 次 | 2–4 | 战时高强度量级 |
| `PilotMinRestH` | 2 | h | 1–4 | |
| `UavOperatorsPerAirborne` | 6 | 人 | 4–9 | 每架在空 = 3 班 × 2 人 |
| `RunwayClosedThreshold` | 0.6 | — | 0.4–0.9 | 🟡 A-27 |
| `ParkedAircraftHitP` | 0.3 | /命中 | 0.1–0.6 | 🟡 A-27 |

### 5.2 飞行与航线

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `ClimbRateMps` | 喷气 50 / 螺旋桨、无人机 5 | m/s | — | |
| `OrbitRadiusM` | 喷气 15 000 / 无人机 5 000 / 直升机 2 000 | m | — | |
| `IpDistanceM` | 40 000 | m | 20 000–80 000 | |
| `LoSegmentM` | 100 000 | m | 50 000–150 000 | 高-低-高的低空段 |
| `LoClimbOutM` | 20 000 | m | — | |
| `AvoidMarginM` | 10 000 | m | 5 000–20 000 | |
| `PackageTotMarginMin` | 5 | min | 2–15 | |
| `DecoyLeadMin` / `SeadLeadMin` | 5 / 2 | min | 0–15 | 诱饵先到引雷达开机 |
| `HiLoHiRadiusFrac` / `LoLoLoRadiusFrac` | 0.7 / 0.5 | — | 0.5–0.9 / 0.35–0.7 | 公开资料高-低-高半径约为高-高-高的 60–75%（A-23） |
| `RadiusMarginFrac` | 0.1 | — | 0–0.2 | 作战半径已含储备的近似 |
| `BingoMargin` | 0.05 | — | 0.02–0.1 | |
| `UavMinAglM` | 500 | m | 200–1000 | |
| `BandEoFactor` | Low 1.1 / Medium 1.0 / High 0.85 | — | — | 高度越高看得越粗 |
| `LongRangeThresholdM` | 500 000 | m | — | A-26 |
| `GcsAntennaAglM` | 15 | m | 5–30 | |
| `TileRadiusM` | 20 000 | m | — | H3 r4 中心到边约 20 km（00 §3.6） |
| `EoSlantRangeM` | 15 000 | m | 8 000–25 000 | 光电有效斜距 |

### 5.3 探测

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| 雷达地平线系数 | 4120 | m/√m | — | 总纲 §12.4（4/3 地球等效） |
| `SlowTargetSpeedMps` | 60 | m/s | 40–80 | 216 km/h 以下：TB2（36 m/s）、Harop 巡航、An-2 |
| `MaskAltAglM` | 1 000 | m | 300–2000 | 低于此高度受地形遮蔽 |
| `MaskFactor` | Mountain 0.4 / Forest 0.9 / 其他 1.0 | — | — | 纳卡山地 |
| `LookDownClutterFactor` | 0.7 | — | 0.5–1 | |
| `TrackMemoryS` | 120 | s | 60–300 | |
| `NetworkLatencyS` | 10 | s | 0–60 | |
| `EsmPosErrorM` | 1 000 | m | 200–5000 | |
| `JammerRangeM` | 200 000 | m | 100–300 km | |
| `JamReduction` | 0.4 | — | 0.2–0.6 | |
| `BurnThroughFrac` | 0.3 | — | 0.2–0.5 | |
| 光学探测昼夜系数 | Day 1.0 / Twilight 0.6 / Night 热像 0.6、无 0.15 | — | — | |

### 5.4 空空

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LaunchRangeFrac` | 0.6 | — | 0.4–0.9 | 条令在 60% 最大射程内发射 |
| `AspectRangeFactor` | 迎头 1.0 / 侧向 0.7 / 尾追 0.4 | — | — | 最大射程随态势 |
| `NezFrac` | 0.35 | — | 0.25–0.5 | 不可逃逸区（§12.5） |
| `PkAtMaxFrac` | 0.3 | — | 0.1–0.5 | 最大射程处 Pk 降到 30% |
| `PkMax[RadarSemiActive / RadarActive / RadarActive+数据链]` | 0.45 / 0.6 / 0.65 | — | ±0.15 | 实战 BVR 命中率量级（估算） |
| `AvgSpeedFrac` | 0.7 | — | 0.5–0.85 | 平均速度 / 最大速度 |
| `EcmPkReduction` | 0.25 | — | 0.1–0.4 | |
| `ShotsPerTargetBvr` | 1 | 枚 | 1–2 | |
| `WvrRangeM` | 10 000 | m | 5 000–15 000 | |
| `WvrBaseTimeS` | 20 | s | 10–40 | |
| `PkWvr[IrPassive / IrImaging / Gun]` | 0.5 / 0.65 / 0.15 | — | ±0.15 | |
| `HobsBonus` | 1.2 | — | 1–1.4 | 头盔瞄准 |
| `SurpriseBonus` | 1.5 | — | 1–2 | |
| `FlarePkFactor` | 0.8 | — | 0.6–1 | |
| `EjectP` | 0.6 | — | 0.3–0.9 | |
| `WvrFuelPerMin` | 0.02 | /min | 0.01–0.04 | |

### 5.5 地面防空

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `PolicyTargetP` | Safe 0.95 / Balanced 0.85 / Conserve 0.70 | — | — | 总纲 §14.1.1 ✅（示例值） |
| `PolicySalvoCap` | Safe 4 / Balanced 2 / Conserve 2 | 发 | — | 俄式条令通常 2 发齐射 |
| `MaxOpportunities` | 3 | 次 | 2–4 | |
| `AssessS` | 5 | s | 2–15 | 杀伤评估 |
| `SalvoIntervalS` | 3 | s | 2–5 | |
| `EngageLookaheadS` | 300 | s | 120–600 | |
| `ConserveCheapCostMusd` | 0.15 | M$ | 0.05–0.5 | 便宜到可以随便打的门槛（高炮、便携导弹） |
| `LowAltAglM` / `LowAltPkFactor` | 100 / 0.8 | m / — | — | 低空杂波 |
| `NoOwnRadarPkFactor` | 0.7 | — | 0.4–0.9 | 只用网络航迹 |
| `PartialCueLookaheadS` | 120 | s | 60–300 | |
| `ArmShutdownS` | 120 | s | 60–300 | |
| `ShortHaltS` | 10 | s | 5–30 | |
| `TileAdSpreadM` | 8 000 | m | 4 000–15 000 | 地块内防空登记的散布半径 |
| `RelocateDistanceM` / `RelocateSpeedMps` | 3 000 / 5 | m / m/s | — | 转移 3 km，越野约 18 km/h |
| `OrganicEngageP` | 便携 0.10 / 弹炮 0.25 / 高炮 0.20 | /目标·步 | ×0.5–2 | 营属防空自主发现并射击的机会 |
| `GunBurstRounds` | 100 | 发 | 50–200 | |
| `AbstractEngagePerH` | 1.0 | /h | 0.3–3 | 抽象损耗（§4.9.3） |
| `OrganicUavKillPerH` | 0.02 | /h | 0–0.1 | |
| `OpticalAirFactor` | 0.2 | — | 0–0.4 | 与 04 的 `OpticalOnlyFactor` 一致 |

**拦截弹单发概率 `pkVs`（缺省表；数据中 `pk_vs` 优先）**

| 拦截弹（系统） | FastJet | SlowAircraft | Helicopter | MaleUav | SmallUav | LoiteringTerminal | Cruise | Ballistic | ARM | 射程 km / 射高 km |
|---|---|---|---|---|---|---|---|---|---|---|
| 5V55R（S-300PS） | .70 | .80 | .70 | .65 | .35 | .10 | .45 | .15 | .25 | 5–75 / 0.025–25 |
| 48N6E2（S-300PMU2） | .80 | .85 | .75 | .75 | .45 | .15 | .60 | .40 | .35 | 3–195 / 0.01–27 |
| Barak-8 | .80 | .85 | .80 | .80 | .55 | .30 | .70 | .30 | .45 | 0.5–70 / –16 |
| 9M317（Buk-M1-2） | .70 | .80 | .70 | .70 | .40 | .15 | .50 | .10 | .30 | 3–45 / 0.015–25 |
| 3M9（Kub） | .55 | .70 | .55 | .50 | .25 | .05 | .25 | 0 | .10 | 4–24 / 0.02–14 |
| 3M8（Krug） | .45 | .60 | .30 | .30 | .10 | 0 | .10 | 0 | 0 | 7–50 / 0.25–24 |
| 9M33M3（Osa-AKM） | .55 | .70 | .60 | .55 | .30 | .15 | .30 | 0 | .10 | 1.5–10 / 0.025–5 |
| 9M338（Tor-M2KM） | .75 | .85 | .80 | .80 | .60 | .55 | .65 | 0 | .50 | 1–15 / 0.01–10 |
| 9M333（Strela-10M3） | .35 | .55 | .50 | .30 | .15 | .10 | .10 | 0 | 0 | 0.8–5 / 0.025–3.5 |
| 9M39（Igla） | .25 | .45 | .40 | .25 | .10 | .05 | .05 | 0 | 0 | 0.5–5.2 / 0.01–3.5 |
| ZSU-23-4（每次点射） | .10 | .25 | .25 | .25 | .15 | .20 | .05 | 0 | .02 | 0.2–2.5 / 0–1.5 |

理由：射程/射高为公开资料量级（stated/estimated 混合）；Pk 为估算，按“老式指令/半主动对小、慢、低 RCS 目标差，对俯冲巡飞弹更差”的定性规律排序；`LoiteringTerminal` 列与 04 §5 的 `AdPkVsLm`（Osa .15、Strela .10、ZSU .20、Tor .55）**一致**。最终由 §9 的 A-V1–A-V4 校准。

**雷达参数缺省（05 `SensorProfile`）**

| 系统 | `airRadarRangeMAt1m2` | `airRadarMaxAltM` | `slowTargetFactor` | 反应时间 s | 通道 目标/导弹 | 待发弹 | 再装填 min | 展开/撤收 min | 入网 |
|---|---|---|---|---|---|---|---|---|---|
| S-300PS 连 | 150 km | 30 000 | 0.8 | 15 | 6 / 12 | 4/车 | 20 | 5 / 5 | 是 |
| S-300PMU2 连 | 200 km | 30 000 | 1.0 | 10 | 6 / 12 | 4/车 | 20 | 5 / 5 | 是 |
| Barak-8 连 | 150 km | 20 000 | 1.0 | 8 | 8 / 16 | 8/车 | 30 | 15 / 15 | 是 |
| Buk-M1-2 车 | 45 km | 25 000 | 0.9 | 22 | 1 / 2 | 4 | 12 | 5 / 5 | 是 |
| Kub 连 | 50 km | 14 000 | 0.6 | 22 | 1 / 2 | 3/车 | 10 | 5 / 5 | 是 |
| Krug 连 | 70 km | 25 000 | 0.6 | 25 | 1 / 2 | 2/车 | 15 | 5 / 5 | 是 |
| Osa-AKM 车 | 22 km | 6 000 | 0.6 | 26 | 1 / 2 | 6 | 5 | 4 / 4 | 否 |
| Tor-M2KM 车 | 32 km | 10 000 | 1.0 | 5 | 4 / 8 | 8 | 18 | 3 / 3 | 是 |
| Strela-10M3 车 | （光学 `opticalAirRangeM` 10 km） | — | — | 6 | 1 / 1 | 4 | 3 | 1 / 1 | 否 |
| ZSU-23-4 车 | 12 km | 2 000 | 0.7 | 6 | 1 / — | 2000 发 | 10 | 1 / 1 | 否 |
| 便携（Igla） | （光学 6 km） | — | — | 5 | 1 / 1 | 1 | 1 | — | 否 |

### 5.6 空对地、巡飞弹、弹道

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `GuidanceReliability` | Laser 0.85 / EoTv 0.85 / IrImaging 0.85 / LoiterEo 0.85 / LoiterEoRf 0.85 / ARM（对地）0.6 | — | ±0.1 | 制导链可靠性（估算） |
| `ArmHitP` | 0.6 | — | 0.4–0.8 | |
| `ArmMemoryFactor` / `ArmNoMemoryFactor` | 0.4 / 0.1 | — | — | 雷达关机后 |
| `ArmLaunchFrac` | 0.8 | — | 0.5–1 | |
| `ArmPerBatteryRadar` | 2 | 枚 | 1–4 | 以连为单元的大雷达值得多打一枚 |
| `SeadStandoffM` | 60 000 | m | 30–100 km | |
| `ReleaseRangeFrac` | 0.8 | — | 0.5–1 | |
| `LowAltGlideFactor` | 0.3 | — | 0.2–0.5 | 低空投放滑翔弹射程大减 |
| `DumbReleaseRangeM` | 3 000 | m | 1 000–6 000 | |
| `FreeFallAvgMps` | 250 | m/s | — | |
| `DumbCepMinM` / `DumbCepPerKmAlt` | 15 / 25 | m / m·km⁻¹ | — | 非制导投弹精度量级 |
| `DirectObsTleM` | 10 | m | 5–30 | 平台自己看着目标 |
| `RecheckBeforeTotMin` | 5 | min | — | |
| `SelfAcquireMaxMin` | 无人机 120 / 有人机（带吊舱）15 | min | — | |
| `UavStrikeCycleS` | 300 | s | 120–600 | 照射、复查 |
| `HunterMinValue` | 2 | — | 0–5 | Recon 任务中只打高价值目标 |
| `CasCycleS` | 喷气 180 / 无人机 300 / 直升机 240 | s | — | |
| `AttackRunS` | 喷气 40 / 无人机 20 / 直升机 30 | s | — | |
| `CasOrbitOffsetM` | 15 000 | m | 5–25 km | 盘旋在本方一侧 |
| `LocKillPerWeapon` | 0.6 | 辆 | — | 交通线打击；归一化用 04 的 `LocTrafficNorm` |
| `LmBoostS` | 30 | s | — | |
| `LmSearchRadiusM` | 3 000 | m | 1–10 km | |
| `MinSearchMin` | 10 | min | 5–30 | |
| `RfAcquirePerMin` | 0.9 | /min | 0.5–1 | 被动雷达导引头对开机雷达 |
| `RfOffTerminalFactor` | 0.7 | — | 0.3–0.9 | 雷达在俯冲时关机，光电兜底 |
| `LmDiveSpeedMps` | 110 | m/s | 80–150 | 约 400 km/h |
| `LmReconQualityFactor` | 0.8 | — | 0.5–1 | |
| `BallisticApogeeFrac` | 0.25 | — | 0.15–0.35 | |
| `BallisticFlightTimeS`（建议给 04） | 120 + 0.6 × 射程km | s | — | 飞毛腿 300 km ≈ 5 min，圆点 120 km ≈ 3 min |
| `BallisticTerminalS` | 30 | s | 15–60 | 末段可拦截窗口 |
| `AirTargetValue[IntelTypeGuess]` | AirDefense 5 / Artillery 4 / Headquarters 4 / Armor 3 / MechInfantry 2 / Logistics 2 / Infantry 1 / 其他 1 | — | — | 打击选择 |

### 5.7 空运

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `PaxMassKg` | 120 | kg/人 | 100–140 | 含个人装备 |
| `LoadFactor` | 0.85 | — | 0.7–1 | |
| `LoadUnloadH` | AirLanding 0.5 / Paradrop 0.1 / FastRope 0.05 / SlingLoad 0.2 | h | — | |
| `SlingMaxKg` | 由机型数据 | kg | — | |
| `ParaAssemblyH` | 3 | h | 1–6 | 05 SOF 伞降也读本常数 |
| `ParaAssemblingCombatFactor` | 0.5 | — | 0.3–0.8 | §15.4 |
| `TransportLossKilledFrac` | 0.7 | — | 0.5–0.9 | |

### 5.8 规划（给 06/12）

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `PlanningSortiesPerDay` | 1.5 | 架次/架·天 | 1–3 | |
| `PlanningExpendFrac` | 0.5 | — | 0.3–1 | |
| `TankerRangeM` / `TankerTriggerFrac` / `RefuelMinPerAircraft` / `TankerOffloadFrac` | 50 000 / 0.5 / 5 / 0.5 | m / — / min / — | — | 阶段 1 不用 |

---

## 6. 与其他系统的接口

### 6.1 08 提供
| 接口 | 使用者 | 时机 |
|---|---|---|
| `StartMission(AirMission spec)`、`CancelMission(id)`、`CreatePackage(...)` | 09（T-02，无延迟）、12（I-16：AI 决定派什么） | 命令生效时 |
| `LaunchLoiteringMunition(...)`、`LaunchLoiteringSearch(...)`（E-07） | 04 | 条带步（80） |
| `RegisterGroundLaunchedMissile(...)` | 04 | 远程火力发射时 |
| `GroundStrikeEvent` 队列（按 00 §6.4 键排序） | 04（转交 03 或自行结算）、06（节点经 08 直接调用） | 阶段 90 写，100/110 读 |
| 巡飞弹结果回调 `OnLoiteringResult(launchId, result)` | 04 | 阶段 90 |
| `AirDefenseRegistration`（位置、包线、雷达开机、`radarOnFraction`、待发弹） | 04（条带防空元素状态、§4.5.2 无人机损耗读雷达开机）、05（电磁特征值）、12（风险） | 每刻 |
| `AbstractUavAttritionPerH(c, tile, model)` | 05、12 | 每 10 / 60 分钟 |
| `ReconDwellSample` 缓冲 | 05 | 每刻写 |
| `05.RegisterSelfFix` 调用 | 05 | 获取时 |
| `ExpectedDailyUse(airbase, item)` | 06 | 每小时 |
| 可出动 `Flight` 列表与 `AircraftRole`、作战半径、`AirDefenseRegistration` 汇总、机场弹药库存视图 | 12 | 每小时 |
| `AirTrack`（本国空情） | 05（我方暴露度估算，05 §4.9）、13 | 每刻 |
| 视图：飞行编组卡、防空卡、包线图、出动率、AAR 空中部分 | 13 | 界面刷新 |
| 存档：`SectionId.Air = 43`（值见 15 §3.2）；组件：全部 `Flight`、`AirframeState`、`FlightElement`、`AirMission`、`MissionPackage`、`MissileInFlight`、`AirTrack`、`AirDefenseRegistration`（含窗口累计）、未消费的 `GroundStrikeEvent` 与未结算的 `NodeStrikeEvent`/`CrossingStrikeEvent`/`LocStrike`；不存档（派生，读档后重建）：`OrganicAirDefense`（按营汇总）、`TargetEngagementLedger`（每步清空） | 15 | 存档 |

### 6.2 08 需要
| 来源 | 需要 |
|---|---|
| 01 | `Formation`（中队）、`EquipmentItem`（飞机、发射车、雷达车）、型号与 Profile；“中队营”结构（A-25） |
| 02 | `GetSkill`（`pilot`、`aircrew`、`uav_operator`、防空操作员专业）；名册里飞行员/操作员人数与状态；`AirborneQualified` |
| 03 | `MunitionProfile` 通用字段（`roundWeightKg`、`isTopAttack`、`warheadKg`）；`ExternalImpactEvent` 由 04 转交 |
| 04 | `SelectCasTarget(battleId, side, platformClass, orbitPosM)`；条带坐标 ↔ 经纬度（04 §4.1.1）；`tileLocalPosM` 读/写（防空转移）；`CancelScheduledEvent(missionId, roundIndex)`；`NodeRadiusM` 常数；防空/营属防空元素的位置 |
| 05 | `GetLevel`、`GetAgeMs`、`PrecisionStrikeAllowed`、`TargetLocationErrorM`、`SearchAcquireProbabilityPerMin`、`RegisterSelfFix`、`GetSignature`、`AreaReconTask.dwellShare`、`SensorProfile`、`EmconState`、`IntelEstimate`（目标选择只读情报，不读真值） |
| 06 | 机场节点库存（只读）、`TryDrawFromNode`、`ReturnToNode(NodeId, ItemKey, qty)`（06 §6.1）、`TryConsume`/`GetAvailable`（防空弹）、`throughputDamage`、`OnNodeStrike`/`OnCrossingStrike`/`OnLocStrike`、`GetTrafficTrucksPerH`、`MobilityProfile.isAirdroppable/isSlingLoadable`、`WarheadClass` |
| 07 | `ApplyVehicleDamage`（飞机、无人机、发射车被毁）、`ApplyCasualty`（机组）、飞机修复状态、`ReliabilityProfile` |
| 09 | `StartMission` 路由、`GetLightCondition`、营位置与速度（外推）、`GetMoveState`、`PostNotification`、`UnitConfig`（拦截策略、电磁管控、转移开关 `UnitConfigField.RelocateAfterFiring`） |
| 10 | 地块中心、平均高程、`TerrainComposition`（主地形）、机场/简易跑道 |
| 11 | 单价（成本交换比）；装备与弹药交付入库 |
| 14 | 无人机前出地面站位置（可选）、开局部署 |
| 15 | `Rng.For`、`DMath`、`BattleEventLog`、ID 分配器 |

### 6.3 RNG salt 表（`RngDomain.Air = 8`）
| salt | 值 | 用途 | entityKey |
|---|---|---|---|
| `SaltAamHit` | 1 | 空空弹命中 | `Mix(missileId) ^ targetItemId` |
| `SaltSamHit` | 2 | 地空弹命中 | `Mix(missileId) ^ targetId` |
| `SaltWvr` | 3 | 格斗射击 | `Mix(shooterItemId) ^ targetItemId` |
| `SaltSurvive` | 4 | 被命中后是否坠毁、跳伞 | 飞机 itemId |
| `SaltGroundHit` | 5 | 节点/桥梁命中数 | `Mix(elementId) ^ nodeId` |
| `SaltSelfAcquire` | 6 | 无人机自主获取 | `Mix(elementId) ^ targetId` |
| `SaltLmAcquire` | 7 | 巡飞弹获取 | missileId |
| `SaltOrganicEngage` | 8 | 营属防空射击机会 | `Mix(battalionId) ^ airTargetId` |
| `SaltMaintFail` | 9 | 出动后故障 | 飞机 itemId |
| `SaltParkedHit` | 10 | 停放飞机被打 | `Mix(nodeId) ^ hitIndex` |
| `SaltArmHit` | 11 | 反辐射弹命中 | missileId |
| `SaltAirliftLoss` | 12 | 运输机被击落时人员伤亡 | 飞机 itemId |

同一流内的抽取顺序固定：先“是否命中”，再“是否坠毁”，再“是否跳伞”。

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 目标在步内被两枚导弹同时（同毫秒）命中 | 按排序键（`sourceEntityId`、`seq`）先后；第二枚到达时目标已毁 → 作废，不抽样 |
| 射手在导弹飞行中被击落 | 主动弹/红外弹/巡飞弹：继续；半主动/指令制导：作废 |
| 防空登记在拦截弹飞行中被毁（雷达车） | 指令/半主动制导的在途弹作废 |
| `pk ≤ 0` 或无可行弹 | 不开火，不扣弹 |
| 待发弹 > 0 但 06 班弹药为 0（数据不一致） | 以 06 为准，`readyRounds = 0` |
| 机场被占领 | 地面上的飞机：Ready 的立即转场到最近本国机场（视为 Ferry，可被拦截）；Maintenance/Damaged 的 → 07 `Captured` |
| 飞机在空中，所有本国机场都关闭 | 盘旋等待直到燃油下限，然后迫降（§4.3.4） |
| 无人机数据链中断（地面站被毁） | 元素按预编程返航；没有可用地面站时，`gcsPerSystem` 视为 0，组内不再新起飞 |
| 巡飞弹目标元素在飞行中消失（04 删除） | 转为搜索模式，目标区中心不变 |
| CAS 战斗在飞行途中结束 | 改为在该地块上空执行“察打”或返航（有人机返航） |
| 同一刻多个编组从同一机场扣同一种弹 | FlightId 升序串行；后面的看到扣减后的库存 |
| 诱饵被敌方光学识别 | 阶段 1 不做识别（A-12） |
| 弹道导弹被多个防空单位同时交战 | 国家级去重账本（§4.7.3）按登记 id 升序 |
| 雷达地平线：雷达或目标离地高 < 0（数据误差） | 取 0 |
| `rcsM2 ≤ 0` | 加载校验拒绝 |
| 同一飞机被同一步的空空弹和地空弹打中 | 按事件时刻先后；后到者作废 |
| 防空营在过边中 | `Moving`；`canFireOnMove` 的可短停射击，其余不能开火 |
| 阶段 0 | 空中层不运行；`AbstractUavAttritionPerH` 返回 0 |
| 浮点 | 三角函数一律 `DMath`；`Math.Sqrt` 允许；时刻转毫秒 `Math.Round(..., MidpointRounding.ToEven)` |

---

## 8. 测试用例

### T1 雷达地平线（总纲 §12.4 示例）
雷达离地 10 m，目标离地 50 m：`R_hor = 4120 × (√10 + √50) = 4120 × (3.162278 + 7.071068) = 4120 × 10.233346 = 42 161.4 m`。
**期望**：42.16 km（±1 m）。同一目标在山地地块（主地形 Mountain，目标 50 m < 1000 m）：`× 0.4 = 16 864.6 m`。
预警机 9000 m vs 目标 150 m：`4120 × (94.868330 + 12.247449) = 441 317.0 m`（下视雷达不受掩蔽）。

### T2 Osa 看 TB2、打不着 TB2
Osa-AKM：`airRadarRangeMAt1m2 = 22 km`，`slowTargetFactor = 0.6`；TB2 单机 `rcs = 0.2`，速度 36.1 m/s（< 60）。
`R_rcs = 22 000 × 0.2^0.25 = 22 000 × 0.668740 = 14 712.3 m`；`R_slow = 8 827.4 m`。
TB2 离地 5500 m、地面距离 6000 m → 斜距 `√(6000² + 5500²) = 8 139.4 m ≤ 8 827.4` → **被探测**。
包线：9M33M3 射高上限 5000 m < 5500 → **不能交战**。
**期望**：AirTrack 存在；本步 Osa 不开火；Osa 若 `Active` 则 `radarOnThisStep = true`（被 ELINT / 巡飞弹看见）。

### T3 拦截策略的发数
单发 pk = 0.7，`missileChannels − inFlight = 2`。
- Safe，m = 1：`1 − 0.3^s ≥ 0.95` → s = 3（0.973）；截断到通道 2 → **s = 2**（实际 0.91）。
- Balanced，m = 2：`1 − 0.3^(2s) ≥ 0.85` → s = 1（0.91）→ **s = 1**。
- Balanced，m = 1：`1 − 0.3^s ≥ 0.85` → s = 2（0.91）→ **s = 2**。
- Conserve，m = 2：**s = 1**；m = 1：`1 − 0.3^s ≥ 0.70` → **s = 1**（0.70）。
- Conserve，目标 SmallUav（侦察型 Orbiter）不飞向本单位，最便宜可用弹 9M33M3 = 0.15 M$ ——不大于 0.15 → **打**；若只有 3M9（假设 0.3 M$）→ **放过**。

### T4 BVR 命中概率
R-77（`RadarActive`，PkMax 0.6，`rangeMaxM = 80 000`），迎头，r = 54 000 m；射手 skill 0.6，目标 skill 0.5、agility 1.0、无干扰。
`x = 54/80 = 0.675`；`RangeFactor = 1 − 0.7 × (0.675 − 0.35)/0.65 = 1 − 0.7 × 0.5 = 0.65`；`SkillShooter = 0.9`；`EvadeTarget = 1.15 − 0.15 = 1.0`。
**期望**：`PkBvr = 0.6 × 0.65 × 0.9 × 1.0 = 0.351`；发射条件 `54 ≤ 0.6 × 80 = 48`？**不满足**——不发射（要等到 48 km）。在 48 km：`x = 0.6`，`RangeFactor = 1 − 0.7 × 0.25/0.65 = 0.730769`，Pk = `0.6 × 0.730769 × 0.9 = 0.394615`；飞行时间 = `48 000 / (0.7 × 4 × 340.3) = 50.37 s`。

### T5 出动率
12 架战斗机、12 名飞行员；任务飞行 2 h；`PrepMin = 45`、`turnaround = 60`、`maintElapsedPerFlightH = 0.5` → 一个循环 = 0.75 + 2 + 1 + 1 = 4.75 h → 机体上限 floor(24/4.75) = 5 次/天；飞行员上限 3 次/天 × 12 人 = 36 → 每架 3 次。
**期望**：持续出动率 = 3 架次/架·天（受飞行员限制）；若飞行员 18 人 → min(5, 18 × 3 / 12 = 4.5) = 4.5。

### T6 TB2 在站时间
基地距轨道 150 km（< 数据链 150 km，边界允许），巡航 130 km/h = 36.111 m/s：单程 `150 000 / 36.111 = 4153.8 s = 1.1538 h`。续航 27 h，储备 10% → 可用 24.3 h。
**期望**：在站 `24.3 − 2 × 1.1538 = 21.99 h`。一套 6 架、2 个地面站：同时在空 ≤ 2；循环 = 24.3 + 2 + 0.12 × 24.3 = 29.22 h → 每架 0.75 在站比例 → 机体足够维持 2 条连续轨道（需要约 2/0.75 ≈ 2.7 架）。

### T7 巡飞弹 RF 获取
Harop 在搜索圈内，16 km 处有一部开机的 Osa（≤ 25 km）。`RfAcquirePerMin = 0.9`。
**期望**：2 分钟内获取概率 `1 − 0.1² = 0.99`；俯冲时长 `3000 / 110 = 27.27 s`；若 Osa 在俯冲期间关机：`pHitDirect = 0.85 × 0.7 = 0.595`，否则 0.85。

### T8 对地精度
JDAM 类 GNSS（`cepM = 3`），目标 L4、age 0、Defending → TLE = 30 m：`cepM_eff = √(9 + 900) = 30.15 m`，`pHitDirect = 0`。
同一目标 Marching、age 30 min（05 T5：TLE 120 m）：`√(9 + 14 400) = 120.04 m`。
MAM-L（激光，TB2 自照射，`seekerFootprintM = 300`）、TLE 30 m：`pHitDirect = 0.85 × min(1, 300/30) = 0.85`；TLE 600 m：`0.85 × 0.5 = 0.425`。

### T9 情报门槛与自主获取
目标营 exposure 3.6（L3）。有人机打击（fallback 缺省 Abort）→ **中止**，`AirMissionResult(IntelInsufficient)`。
TB2（fallback SelfAcquire）：目标 `S_phys = 0.305044`（05 T1），`eoQuality 1.0 × BandEoFactor 1.0`，priorLevel 3（bonus 1.0），白天：
`p = 1 − exp(−0.25 × 0.305044) = 1 − exp(−0.076261) = 0.073426`/分钟；30 分钟内 `1 − (1 − 0.073426)^30 = 1 − exp(−2.287830) = 0.898518`。
**期望**：每分钟 0.073426；30 分钟累计 0.8985（容差 1e-5）。

### T10 抽象损耗
1 个 Kub 连（3M9 vs MaleUav 0.50，射程 24 km，射高 14 km ≥ 中型无人机 3 km），距地块中心 10 km，`TileRadiusM = 20 000`：`coverFrac = min(1, 24²/20²) = 1`；雷达 Active。
`λ = 1.0 × 0.50 × 1 × 1 = 0.5` → **期望** `1 − e^−0.5 = 0.393469`/h。Silent → `radarFactor = 0` → 0；Partial 且上一窗口开机 0.3 → `λ = 0.15` → 0.139292。

### T11 燃油
战斗机 `radiusHiHiHiM = 800 km`（`LoLoLo` 缺省 400 km），高-低-高打击 300 km 外目标，低空段 100 km：
高空 BurnPerM = 1/(2 × 800 000 × 1.1) = 5.6818e-7；低空 = 1/(2 × 400 000 × 1.1) = 1.13636e-6。
去程 200 km 高 + 100 km 低，回程同：`400 000 × 5.6818e-7 + 200 000 × 1.13636e-6 = 0.227273 + 0.227273 = 0.454545`。
**期望**：0.4545 + 储备 0.1（数据）< 1 → 校验通过。

### T12 弹道导弹拦截窗口与取消
04 发射一枚 300 km 的弹道导弹：飞行时间 `120 + 180 = 300 s`；可拦截窗口 = 最后 30 s；S-300PMU2（`canEngageBallistic`，48N6E2 vs Ballistic 0.40）Safe：`1 − 0.6^s ≥ 0.95` → s = 6，截断到 `PolicySalvoCap` 4 → **s = 4**（累计 0.8704）；若命中 → `04.CancelScheduledEvent`。

---

## 9. 验证建议（Python）

> 脚本 `tools/validate/08_*.py`，实现第 4 节公式（无引擎、单线程、同样的 RNG 派生）。V 编号由维护者映射到计划。

| # | 验证 | 方法 | 通过标准 |
|---|---|---|---|
| A-V1 | **TB2 vs 老式近程防空** | 2 架 TB2（Medium 档）24 h 盘旋于一个地块，地块内亚方旅属防空：1 个 Osa 连（4 车）+ 1 个 Strela-10 排（4 车）+ ZSU-23-4 ×4，Active / Balanced；05 暴露度 + §4.8.3 猎杀；1000 次蒙特卡洛 | TB2 期望损失 < 0.1 架/天；24 h 内被摧毁的防空车 ≥ 50%；把 TB2 改 Low 档（3000 m）→ TB2 损失 0.3–1.5 架/天 |
| A-V2 | **S-300PS 的困境** | 1 个 S-300PS 连 vs 阿方任务包（4 架 An-2 诱饵 + 4 枚 Harop 搜索 + 2 架 TB2），Active / Partial / Silent × Safe / Conserve | Active：6 h 内雷达被毁概率 ≥ 0.6，诱饵吸走 ≥ 50% 的已发拦截弹；Silent：雷达被毁概率 < 0.1，但对 TB2 击落数 = 0；Safe 比 Conserve 多耗弹 ≥ 40% |
| A-V3 | **Tor-M2KM 的价值** | 同 A-V2 但目标为 Tor-M2KM 排（4 车） | 对 Harop 的拦截率 40–70%；Tor 排在 24 h 内的期望损失明显低于 Osa 连（≤ 一半） |
| A-V4 | **全战役合理性（纳卡 2020，44 天）** | 用 14 的开局 + 04 §9 的简化地面层 + 本层，阿方按 12 的空中规划 | 亚方防空系统损失（公开图像统计量级，估算区间）：S-300 部件 3–10、Osa 10–30、Strela-10 5–20、Kub/Krug 2–10、Tor 0–4；阿方 TB2 损失 0–4；巡飞弹消耗数十到 200 枚；An-2 诱饵损失 5–20。各项落在区间内，且“防空主要被无人机/巡飞弹摧毁”的比例 ≥ 60% |
| A-V5 | **拦截策略达成率** | 单发 pk ∈ {0.4, 0.55, 0.7, 0.85} × 机会数 m ∈ {1, 2, 3}，无通道限制，模拟对单目标的最终击落率 | Safe ≥ 0.9（pk ≥ 0.55）、Balanced 0.80–0.92、Conserve 0.65–0.80；每目标耗弹 Safe > Balanced > Conserve |
| A-V6 | **BVR 曲线** | 4 v 4（MiG-29 R-27R vs Su-30SM R-77）迎头交战，1000 次 | 单发命中率 20–45%；主动弹一方交换比 > 1.5；无“全部首发必中”等离谱结果 |
| A-V7 | **出动率** | 中队 12 架，飞行员比例 1.0 / 1.5，7 天持续作战 | 战斗机 2–4 架次/架·天（初始），持续 1.5–3；TB2 一套 6 架维持 2 条连续轨道 |
| A-V8 | **探测表** | 对每个雷达 × 每类目标 × 3 个高度 × 3 种地形，输出探测距离 | 无负值、单调（RCS、高度增大不减小探测）；山地低空明显缩短 |
| A-V9 | **燃油与半径** | 每种机型按三种剖面飞到标称半径再返回 | 剩余燃油 ≈ 储备（±5%） |
| A-V10 | **确定性** | 同种子跑 A-V2 两遍，比较所有事件日志 | 逐位相同；打乱实体创建顺序（ID 不变）结果不变 |
| A-V11 | **敏感度** | 对 §5.5 的 pk 表、`slowTargetFactor`、`MaskFactor`、`RfAcquirePerMin`、`SearchK`（05）±30% | A-V4 的定性结论（老式防空被无人机压制）不翻转；Sobol 一阶列出最敏感参数 |

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| A-01 | 空中步长与步内事件 | 一律 1 分钟（G-05）；进入距离的时刻用线性插值解析求出，开火/到达带毫秒 | 简单，且保留“谁先开火”的优势 | 交战时子步 10 s |
| A-02 | 探测是否抽样 | 不抽样：在距离内即探测 | 数字透明；随机放在命中上 | 每步探测概率 |
| A-03 | 地形掩蔽 | 低于 1000 m 的目标按雷达所在地块主地形乘地平线（山地 0.4） | 纳卡山地的关键效果，代价极低 | 用 DEM 逐射线视线（阶段 2+） |
| A-04 | 老式雷达对慢速目标 | `slowTargetFactor`（Osa/Kub 0.6，S-300PS 0.8） | 2020 年老式系统难以发现小型慢速无人机的公开叙述 | 不建模 |
| A-05 | 拦截率表 | §5.5 估算表，`LoiteringTerminal` 列与 04 一致 | 待 A-V1–A-V4 校准 | 按制导档位通用公式 |
| A-06 | 拦截策略算法 | 按机会数 m 的发数公式 + 弹药节省放过规则 + 国家级去重 | 直接对应 §14.1.1 的三档描述，可解释 | 固定发数表 |
| A-07 | 营属防空 | 便携/高炮按营汇总成“泡”，按机会概率射击；只有防空营逐车/逐连登记 | 便携导弹数量多、单个价值低 | 全部逐个登记 |
| A-08 | 防空位置 | 条带上用 04 的 `tileLocalPosM`；否则地块中心 + 黄金角螺旋；转移时更新 | 与 04 E-03 一致，确定性 | 玩家手动摆放（阶段 2+） |
| A-09 | 打击后备缺省 | 有人机 Abort，无人机/巡飞弹 SelfAcquire | 有人机在目标区久留风险大 | 一律 AreaAttack |
| A-10 | 察打一体自动猎杀 | 无人机在站时自动打本国已达 L4 的目标；Recon 任务中只打高价值 | 体现 TB2 的核心玩法，无需微操 | 必须玩家逐个下令 |
| A-11 | 巡飞弹归属 | 发射与目标选择 04，飞行/获取/拦截 08（E-07） | 拦截发生在空中层 | 全部 04 |
| A-12 | 空中诱饵 | An-2 类诱饵在敌方空情中显示为 SlowAircraft，阶段 1 不做识别 | 2020 年诱饵引诱雷达开机的效果 | 近距离光学识别 |
| A-13 | 出动常数 | §5.1 | 估算，待 A-V7 校准 | — |
| A-14 | 挂载规则 | 按优先级方案，全编组满足才用；否则 ≥ 50% 满足度降级；未用弹药退回（需 06 增加 `ReturnToNode`） | §5.2 “库存不够自动换次优或降级” | 不退回 |
| A-15 | 空中命令延迟 | 0，仅有出动准备时间（与 09 T-02 一致） | 总纲 §12.1 | 中队级 10–20 min 延迟 |
| A-16 | 直升机 | 作为空中层 `Flight`（陆航中队），任务 Cas/Strike/Recon/Airlift | 统一处理；低空掩蔽与便携导弹自然体现 | 作为营装备在条带内抽象 |
| A-17 | 无人机数据链 | 视距 150 km（TB2），受地平线与掩蔽限制；同时在空数 ≤ 地面站数 | 2020 年 TB2 的作战半径约束 | 不限制 |
| A-18 | 可拦截的地面弹药 | 阶段 1 只有战术弹道导弹、巡航导弹；火箭炮弹不可拦截 | 双方都没有 C-RAM；减少计算 | 制导火箭也可拦截 |
| A-19 | BVR / WVR 模型 | Pk 随距离的分段线性曲线 + 发射距离条令；格斗每步一次概率射击 | 纳卡空战极少，够用；阶段 2 再细化 | CMO 式机动模型 |
| A-20 | 空情与暴露度分离 | 空中目标用 `AirTrack`（实时、确定性探测），地面目标用 05 暴露度 | 空中目标速度快，暴露度的 10 分钟积分不合适 | 统一进暴露度 |
| A-21 | 对地命中的分工 | 08 给 `pHitDirect`/`cepM`；目标选择到车辆、毁伤由 03/04/07；节点命中数由 08 算 | 与 03/04/06 的现有接口一致 | 08 直接选车辆 |
| A-22 | 空运 | 阶段 1 简化：逐班判定、按架次估时、每波真实飞行可被拦截 | 纳卡空运作用小，但 SOF 投送需要 | 阶段 1 不做 |
| A-23 | 作战半径缺省比例 | 高-低-高 0.7、低-低-低 0.5 × 高-高-高 | 公开数据常只给一种 | 必须全部填数据 |
| A-24 | 防空 Partial 电磁管控 | 有网络提示或正在交战时才开机；开机比例写给 05 | 让“部分开机”有清楚的含义 | 固定 30% 开机 |
| A-25 | 飞机与飞行员在编制中的位置 | 每个中队有一个“中队营”（`OrgUnit`，由空军班模板组成），飞机是其班持有的 `EquipmentItem`，飞行员/操作员/地勤在其名册；`Flight` 只是 08 对这些飞机的运行时分组 | 不需要改 01/02/07 的结构，修理和训练直接复用 | 飞机不进编制树，由 08 单独管理 |
| A-26 | 距离计算 | 战区内等距圆柱近似；> 500 km 用大圆 | 快、确定、误差小 | 一律大圆 |
| A-27 | 跑道与停放飞机 | 阶段 1 用 06 节点的 `throughputDamage` 代理跑道损伤；停放飞机按命中概率受损 | 06 尚无跑道字段 | 06 增加 `runwayDamage`、加固机库数 |
| A-28 | 编队 RCS | 编队内 RCS 相加 | 雷达分辨单元内多机回波叠加 | 取单机 RCS |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 空中元素 | `FlightElement` / `FlightElementId` | 一起在空中飞的一组飞机（有人机编组整体；无人机组每架一个） |
| 机体状态 | `AirframeState` / `AirframeStatus` | 每架飞机的出动状态组件 |
| 空中任务 | `AirMission` / `AirMissionId` | 一次任务的完整规格 |
| 飞机型号参数 | `AircraftProfile`（YAML `aircraft`） | 08 归属的型号 Profile |
| 挂载方案 | `LoadoutOption` | 某任务可用的一套挂载，按优先级 |
| 空中弹药字段 | `AirMunitionFields`（YAML `munition.air`） | `MunitionProfile` 的空中扩展 |
| 防空系统参数 | `AirDefenseProfile`（YAML `air_defense`） | 新 Profile：通道、反应时间、待发弹、再装填等（建议补入 00 §4.3 表，归 08） |
| 飞机角色 | `AircraftRole` | Fighter / Strike / UavStrike / UavRecon / Sead / Support / Transport / 直升机 / Decoy |
| 空中目标类别 | `AirTargetClass` | 拦截率表的列 |
| 制导类别 | `GuidanceClass` | 弹药制导方式 |
| 空情航迹 | `AirTrack` | 国家对空中目标的实时航迹（不同于暴露度） |
| 营属防空 | `OrganicAirDefense` | 非防空营的便携导弹、高炮汇总 |
| 对地事件 | `GroundStrikeEvent` | 08 交给 03/04/06 的带时刻的对地命中/落点事件 |
| 打击后备 | `StrikeFallback` | Abort / AreaAttack / SelfAcquire |
| 无人机高度档 | `AltitudeBand` | Low / Medium / High |
| 防空火力单元类型 | `AdFireUnitType` | SelfContained（单车）/ BatteryRadar（以连为单元） |
| 拦截机会数 | m（`opportunities`） | 目标在包线内还能“打一发、看一发”的次数 |
| 国家级拦截去重账本 | `TargetEngagementLedger` | 每步记录各目标已有在途拦截弹的合成概率 |
| 中队营 | “squadron unit”（`OrgUnit`） | 承载中队飞机与人员的营级编制单元（A-25） |
| 新装备类别（建议） | `sam_missile`、`aam`（若需区分） | `sam_missile` 已加入 `data/schema/categories.yaml`（`aam_short`/`aam_medium` 已有）；`loitering_munition`（巡飞弹弹药）与 `loitering_launcher`（发射单元）已由 01 O-12 / DC-205 ① 新增 |
