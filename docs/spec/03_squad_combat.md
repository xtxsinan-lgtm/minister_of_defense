# 03 班级战斗模拟（连级交战片段内部）

> 依据：总纲 §9.1–9.6、§9.3③④、§9.7、§9.8、§9.10、§9.11、§9.12(2)；术语表 [00](00_glossary.md)。
> 本文件定义：`Engagement` 的内部状态与 1 分钟步进、`SpatialElement`、`WeaponProfile` / `MunitionProfile` / `ArmorProfile`、`TargetClass` 判定、侦察/视线、直射分配、间瞄请求、步内事件、压制、伤亡分配、乘员重分配、乘车/下车、疲劳与负重、弹药消耗、结束条件、写回、`CapabilityVector`、`BattalionSummary`、`OutcomeCache`、编制试验场批量模拟。
> 片段**何时生成、给什么初始条件、结果如何作用到条带**由 [04](04_strip_layer.md) 定义；伤亡/损伤**之后如何恢复**由 [07](07_damage_repair.md) 定义。
> 标记：✅ 总纲已定；🟡 建议待确认（编号 `C-xx`，汇总在第 10 节）。

---

## 1. 目标与范围

**解决的问题**：把“我方一个连 vs 敌方一个排或连”的直瞄接触（外加营/旅支援火力介入），按“班是空间单元、单兵是状态单元”的精度，以 1 分钟步长、步内按开火时刻排序模拟出来，输出伤亡（落到具体的人和车）、弹药消耗、压制、疲劳、推进距离，以及战后报告需要的全部统计（闲置原因、支援响应时间、威胁窗口）。同时提供快速模式（结果分布缓存）和编制试验场的批量接口。

**设计底线**（总纲 §9.1）：任何武器“该配到哪一级”都**不写进规则**。本系统只提供：效能矩阵、射程 × 视线分布、命中曲线、请求链延迟与排队、重量与疲劳、乘员需求。合理的配属必须从这些机制里涌现，并由第 9 节的 V1 验证。

| 阶段 | 包含 | 不包含 |
|---|---|---|
| 阶段 0 | 全部班级模拟；标准地形（5 种）；编制试验场批量对战；`OutcomeCache`；`CapabilityVector`；`BattalionSummary`；AAR 统计数据 | 真实地图地形（用标准地形）；暴露度用固定值；外部空袭事件用脚本注入 |
| 阶段 1 | 从条带地形取样的片段地形；读 05 的暴露等级决定起始发现状态；接收 08 的空袭/巡飞弹对地事件；山地反斜面（纳卡） | 天气细分（只做昼/暮/夜 + 能见度系数，§21-20 未定）；凝聚力（总纲 §9.12(5) 可选，阶段 1 不做） |
| 阶段 2+ | 预留：电子战对班组通信的局部干扰模型、FPV 大规模使用的专用规则、城市多层建筑 | — |

---

## 2. 玩家能做什么、看到什么

玩家**不能**在片段内操作任何东西（总纲 §9.3 连级视图只读）。玩家的决策全部发生在片段之外，但每一项都在片段里产生可见结果：

**决策 → 片段内的机制落点**

| 玩家决策（在哪做） | 片段里怎么起作用 |
|---|---|
| 班模板放什么武器、几个人（编制编辑器，01） | 武器列表、乘员需求、负重 → 火力丰富度、减员后韧性、疲劳 |
| 支援武器放在班/排/连/营/旅哪一级（编制编辑器） | 本片段内有没有这件武器（建制内立即响应）还是要走请求链排队（§4.5） |
| 型号绑定（01） | `WeaponProfile`/`ArmorProfile` 数值（射程、命中、穿深、装甲、热像） |
| 通信装备、前观员、数据链终端（编制） | 请求链每跳延迟、能否跳级（§4.5.2） |
| 观瞄器材、班组无人机（编制） | 发现概率、夜战差距（§4.2） |
| 弹药基数与配比（06） | 片段可用弹药、制导弹与普通弹的选择 |
| 训练投入（02） | 命中率、架设时间、压制恢复 |
| 指挥部能力 vs 负荷（01） | 请求链延迟、步坦协同系数（§4.9） |

**反馈（全部给出数字，总方针第 3 条）**

| 反馈 | 数据来源（本文件产出） | 呈现（13） |
|---|---|---|
| 每件武器：开火次数、杀伤、压制贡献（压制·秒） | `WeaponStats` | AAR 武器表 |
| 闲置时间按原因拆分（`IdleReason` 六类） | `WeaponStats.idleS[reason]` | AAR“闲置原因”柱状图 |
| 火力支援响应时间分布（通信/排队/准备/飞行四段） | `FireSupportRequest` 的时间戳 | AAR 直方图；条带“瓶颈提示” |
| 威胁窗口：威胁出现 → 被合适武器处理的等待时间；等待期间损失 | `ThreatRecord` | “装甲目标里 42% 要等连 ATGM，平均 3.5 分钟，期间损失 6 个班” |
| 平均发现距离（敌我对比，分昼夜） | `DetectionStats` | “夜间我方平均发现距离只有敌方 60%” |
| 电台/开火暴露招来的炮击次数 | `ExposureCausedStrikes` | “2 连电台被定位，招来 3 次炮击” |
| 班模板贡献拆分（压制份额、杀伤份额） | `SquadTemplateStats` | “A 型班机枪贡献全连 40% 压制” |
| 能力衰减曲线（不用打仗就能看） | `ComputeResilienceCurve()` | 编制编辑器 |
| 班级回放（仅 `Full` 精度片段） | `BattleEventLog`（15） | 连级视图展开到班 |

---

## 3. 数据结构

命名空间 `MoD.Sim.Combat`。所有 ID 为强类型（00 §2.2）。字段单位后缀按 00 §3.1。

### 3.1 静态数据：武器、弹药、装甲 Profile（挂在 `EquipmentModel`（01）上）

```csharp
public enum FireMode : int {            // 00 已列前三个；Loitering 为新增（C-02）
    Direct = 1, LowAngleIndirect = 2, HighAngleIndirect = 3, Loitering = 4
}

public enum TargetClass : int {         // 00 §1.5；SoftVehicle 为新增（C-03）
    PersonnelExposed = 1, PersonnelCovered = 2, PersonnelInBuilding = 3, PersonnelReverseSlope = 4,
    LightArmor = 5, HeavyArmor = 6, Fortification = 7, Helicopter = 8, Uav = 9, SoftVehicle = 10
}
// 计数常量：TargetClassCount = 10；数组下标 = (int)class - 1。

public readonly record struct AccuracyPoint(double rangeM, double pHit);   // 折线点，rangeM 严格递增

public sealed class WeaponProfile {             // YAML 键：weapon
    public FireMode fireMode;
    public double rangeMinM;                    // ≥ 0
    public double rangeMaxM;                    // > rangeMinM
    public AccuracyPoint[] accuracyVsVehicle;   // 每次“射击事件”对标准车辆目标（2.3×2.3 m 正面、静止、射手练度=要求）命中概率
    public AccuracyPoint[] accuracyVsPersonnel; // 每次射击事件对一个“暴露、站立/跃进的步兵班”至少命中一人的概率
    public double rofSustainedRpm;              // 持续射速，发/分钟（> 0）
    public int roundsPerShot;                   // 一次射击事件消耗的发数（步枪 3，机枪 10，机炮 3，导弹 1，迫击炮 1）
    public double aimTimeS;                     // 发现/选定目标 → 第一发出膛
    public double setupTimeS;                   // 从行进/携行状态到可射击（迫击炮、三脚架 ATGM）；0 = 无需架设
    public bool canFireMoving;                  // 行进间能否射击
    public bool isStabilized;                   // 有稳定器：行进间命中惩罚减轻
    public double weaponWeightKg;               // 不含弹药
    public int crewMin;                         // 能开火的最少操作人数（≥ 1；车载武器 = 炮长 1）
    public int crewFull;                        // 满射速所需人数（≥ crewMin）
    public string operatorSpecialty;            // 对口专业 id（data/schema/specialties.yaml）
    public double skillReq;                     // [0,1] 操作练度要求（迫击炮 0.6，步枪 0.3）
    public bool canSmoke;
    public bool canAntiAir;
    public string[] munitions;                  // 可用弹药型号 id，顺序 = 默认优先顺序
    public Dictionary<string,int> defaultLoad;  // 默认基数：弹药 id → 发数（00 DefaultAmmoLoad）
    public int tubesPerItem;                    // 一件装备的发射管数（火箭炮 40，其他 1）
    public double layTimeS;                     // 间瞄：已展开时接到诸元 → 可射击（含解算）；直射武器 = 0
    public bool autoLay;                        // 全自动调炮（fire_control: auto_lay）→ layTimeS × AutoLayFactor
    public double cepPerKmM;                    // 间瞄非制导：每 km 射程的 CEP（米）；直射武器 = 0
    public double operatorExposureMult;         // 开火时射手暴露倍率（ATGM 尾焰 2.0，RPG 2.0，其余 1.0）
}

public enum MunitionKind : int {
    Bullet = 1, CannonAp = 2, CannonHe = 3, Apfsds = 4, Heat = 5, TandemHeat = 6,
    AtgmSaclos = 7, AtgmFireForget = 8, MortarHe = 9, ArtilleryHe = 10, RocketHe = 11,
    Thermobaric = 12, Smoke = 13, Manpads = 14, LoiteringWarhead = 15, GuidedHe = 16,
    Grenade = 17, Mine = 18
}

public readonly record struct EffectRow(
    double pKillPerHit,      // [0,1] 直射命中后：车辆=见 §4.6.3（只对 Fortification/人员行有效）；人员=被命中者失去战斗力的概率
    double lethalAreaM2,     // ≥ 0 面杀伤（Carleton）面积；0 = 无面杀伤
    double suppPerShot);     // [0,1] 一次射击事件对目标元素的期望压制增量（命中/未命中都有，见 §4.7）

public sealed class MunitionProfile {          // YAML 键：munition
    public MunitionKind kind;
    public double caliberMm;
    public double penetrationMm;     // RHA 等效：KE 弹为炮口值；HEAT 与距离无关
    public double penDropPerKmMm;    // 仅 KE（Apfsds/CannonAp/Bullet）：每 km 穿深下降
    public bool isTopAttack;         // 攻顶（标枪、MAM-L、巡飞弹）
    public double speedMps;          // 平均飞行速度（用于飞行时间）
    public double roundWeightKg;     // 单发重量（负重、运力）
    public EffectRow[] effect;       // 长度 TargetClassCount，按 TargetClass 下标
    public double suppressionRadiusM;// 间瞄/面杀伤弹的压制半径；直射弹 = 0
    public double fortDamagePerHit;  // 命中 Fortification 时降低工事等级的量 [0,1]
    public bool isGuided;            // 制导弹：CEP 用 guidedCepM，不随射程放大
    public double guidedCepM;
    public double aaPk;              // 对空单发毁伤概率（基准，canAntiAir 武器才用）
    public double allocValue;        // 火力分配用的“弹药价值”，≥ 1（步枪弹 1，ATGM 40）
    public double smokeDurationS;    // Smoke 弹：烟幕持续时间
    // —— 后勤/打击用字段（06 L-24 请求；枚举由 06 定义）——
    public string caliberGroup;      // 通用弹药组 id（06 `CaliberGroupDef.id`，如 "cal_155mm_nato"）；null = 不与其他型号共用
    public MunitionShelfClass shelfClass;  // 保质期分类（06 §3.1）；None 时 06 按 data/logistics/munition_storage.yaml 回退
    public double warheadKg;         // 战斗部（装药+壳体）质量，06 据此定 WarheadClass（<50 Small / 50–250 Medium / >250 Large）；0 = 无战斗部
}

public sealed class ArmorProfile {             // YAML 键：armor
    public double frontKeMm, frontHeatMm;      // 正面 vs 动能 / vs 化学能，RHA 等效
    public double sideKeMm, sideHeatMm;        // 侧后（合并）
    public double topMm;                       // 顶部
    public double eraHeatBonusMm;              // 爆炸反应装甲对单级 HEAT 的附加；串联/攻顶无效
    public int passengerCapacity;              // 载员（下车步兵）上限
    public double pKillGivenPen;               // 击穿后“失去战斗力”的概率（交给 07 细分等级）
    public double catastrophicGivenKill;       // 失去战斗力中“殉爆/彻底损毁”的比例（T-72 转盘自动装弹机高）
    public double suppressionResist;           // [0,1] 车组对压制的抗性
    public double sizeFactor;                  // 相对标准目标的命中倍率（MBT 1.0，BMP 0.9，卡车 1.1）
    public bool isVehicle;                     // false = 掩体类（不用）
}
```

**目标类别判定所需阈值**：`HeavyArmorThresholdMm = 200`（`frontKeMm ≥ 200` 为重装甲），`SoftVehicleThresholdMm = 10`（`frontKeMm < 10` 为软目标车辆）。

### 3.2 运行时：片段与空间单元

```csharp
public enum EngagementType : int { AttackPosition = 1, Meeting = 2, Counterattack = 3, Infiltration = 4, Reconnaissance = 5 }
public enum DepthBand : int { Close = 1, Medium = 2, Far = 3, Beyond = 4 }   // 0–300 / 300–1000 / 1000–4000 / >4000 m
public enum LightLevel : int { Day = 1, Twilight = 2, Night = 3 }
public enum EngagementSide : int { A = 0, B = 1 }   // A = 片段内进攻方（反冲击时 A 是反冲击方）
public enum EngagementOutcome : int { None = 0, AttackerSeized = 1, DefenderHeld = 2, AttackerRepulsed = 3,
                                      DefenderWithdrew = 4, Stalemate = 5, MutualBreak = 6 }
public enum ElementKind : int { Infantry = 1, Vehicle = 2, MountedSquad = 3, IndirectFireSection = 4, Uav = 5 }
public enum ElementOrder : int { Hold = 1, Advance = 2, Assault = 3, Overwatch = 4, Withdraw = 5, Mount = 6 }

public sealed class Engagement {                 // 归属 03（实体）；创建者 04
    public EngagementId id;
    public EdgeBattleId battleId;
    public EngagementType type;
    public SimTime startTime;
    public int stepIndex;                        // 已执行的步数
    public int maxSteps;                         // 见 §5 MaxDurationMin[type]
    public FidelityTier fidelity;                // Full | Cached（09 决定）
    public LightLevel light;
    public double visibilityFactor;              // (0,1]，雾/降水；阶段 1 默认 1
    public int slotCount;                        // 正面槽位数
    public double slotWidthM;                    // = FrontSlotWidthM
    public EngagementCell[,] cells;              // [slot, row]；row 高 CellRowM，y 从 YMinM 到 YMaxM
    public EngagementSideState[] sides;          // 长度 2
    public List<SpatialElementId> elements;      // 按 id 升序
    public EngagementOutcome outcome;
    public double defenderLineY;                 // 守方前沿 y（开始时 = 0）
    public double seizedDepthM;                  // 已夺取的守方阵地纵深（写回 04 的推进距离）
    public int stallCounter;                     // 进攻方连续无进展步数
    public int noContactCounter;                 // 双方都无发现的连续步数
    public SectorContext ctx;                    // 04 给的初始条件（§6.1）
    public EngagementStats stats;                // AAR 原始统计
}

public sealed class EngagementCell {
    public TerrainType terrain;                  // 10 的枚举
    public double elevationM;
    public MicroCover microCover;                // None | Light | Good
    public bool reverseSlopeForB;                // 对 A 方观察者而言此格是 B 方的反斜面
    public bool reverseSlopeForA;
    public double losScaleM;                     // 视线尺度（§4.2.1）
    public double obstacleDensity;               // [0,1] 雷障密度（来自 04 D 线）
    public double breach;                        // [0,1] 本扇区破障进度（来自 04）
    public double smokeUntilS;                   // 烟幕到期的片段内时刻（秒，自片段开始）
}

public sealed class EngagementSideState {
    public CountryId country;
    public OrgUnitId companyId;                  // 参战连（或排的上级连）
    public bool isAttacker;
    public double initialStrength;               // 开始时的 CombatStrength（§4.13）
    public List<SupportAssetRef> supportAssets;  // 04 给的可申请的支援火力单位（营迫、旅炮…）
    public double fireSupportSuppression;        // [0,1] C 线结果：本方支援火力被压制的程度（04）
    public ExposureLevel knowledgeOfEnemy;       // 开始时对敌方连的暴露等级（05）
    public double commandFactor;                 // = min(1, CommandCapacity / CommandLoad)（01）
    public double fortificationLevel;            // [0,1] 守方工事等级（04）；攻方 = 0
}

public sealed class SpatialElement {             // 归属 03
    public SpatialElementId id;
    public EngagementId engagementId;
    public EngagementSide side;
    public ElementKind kind;
    public SquadId squadId;                      // 来源班；下车拆分后两个元素共享同一 squadId
    public List<PersonnelId> persons;            // 本元素里的人（名册是 02 的；这里只是引用）
    public List<EquipmentItemId> items;          // 本元素里的装备（车辆在首位）
    public EquipmentItemId vehicle;              // 0 = 无车
    public MountState mount;
    public int slot;                             // 正面槽位 [0, slotCount)
    public double yM;                            // 片段纵深坐标（守方前沿 0，守方纵深为正，攻方来向为负）
    public ElementOrder order;
    public double dismountRemainingS;            // >0 正在下车/上车
    public bool isMoving;                        // 本步是否移动
    public bool isBroken;                        // 已崩溃（§4.10）
    public double spreadM;                       // 人员散布 σe（米），见 §5
    public Dictionary<SpatialElementId, TrackInfo> tracks;  // 本元素自己发现的目标
    public double lastFiredAtS;                  // 片段内时刻；-∞ 表示未开火
    public double lastAtgmFiredAtS;
}

public readonly record struct TrackInfo(double detectedAtS, double lastSeenS, bool cued);

public sealed class WeaponRuntime {              // 每件武器一个（随元素）
    public EquipmentItemId itemId;
    public SpatialElementId elementId;
    public PersonnelId[] operators;              // 当前操作者（长度 0..crewFull）
    public SpatialElementId target;              // 0 = 无
    public string munitionId;                    // 当前选用弹种
    public double nextReadyS;                    // 片段内时刻：下一次可开火
    public double setupRemainingS;               // >0 正在架设
    public bool isSetUp;
    public IdleReason? idleThisStep;             // 本步闲置原因（统计用）
}
```

### 3.3 运行时组件（ECS，键 = `SquadId`，跨片段持久）

```csharp
public sealed class SquadCombatState {           // 03 定义；04、07 读
    public SquadId squadId;
    public double suppression;                   // [0,1]，片段外每条带步按 §4.7.3 衰减
    public double fatigue;                       // [0,1]
    public SimTime lastEngagedAt;
    public bool isCombatEffective;               // §4.10
}

// 班弹药的唯一持久存储是 06 的 `SquadCarriedState`（06 §3.5）。03 只在片段内持有下面的缓存（随片段存档，片段结束即丢弃）。
public sealed class EngagementAmmoCache {        // 03 定义；片段内缓存，键 = (EngagementId, SquadId)
    public SquadId squadId;
    public SortedDictionary<int,int> onPersonnel;    // 弹药型号句柄 → 发数（人员随身）
    public SortedDictionary<int,int> onVehicle;      // 弹药型号句柄 → 发数（车载）
    public SortedDictionary<int,int> initialTotal;   // 片段创建时从 06 读到的总数（写回时求差）
}
// 创建（片段创建时，每个参战班）：对每个弹药型号 m：total = (int)Math.Floor(06.GetAvailable(squadId, new ItemKey(SupplyClass.Ammunition, m)))；
//   班无车辆 → onPersonnel[m] = total；
//   否则 onPersonnel[m] = min(total, Σ 非车载武器（人员携行武器）的 defaultLoad[m])，onVehicle[m] = total − onPersonnel[m]。
// 写回（片段结束，§6.2）：used = initialTotal[m] − (onPersonnel[m] + onVehicle[m])；
//   调 06.TryConsume(squadId, new ItemKey(SupplyClass.Ammunition, m), used, out _) 和 06.ReportConsumption(营, new ItemKey(SupplyClass.Ammunition, m), used)。
//   丢弃在原地的弹药同样计入 used（随 droppedItems 交给 07 回收）。

public sealed class PersonLoadState {            // 03 定义（负重，单兵）
    public PersonnelId personId;
    public double loadKg;                        // 个人装备 + 武器 + 分到的弹药（§4.8.1）
}
```

### 3.4 火力支援请求（00：`FireSupportRequest` 归 03；队列由 04 的 `SupportFireBroker` 持有）

```csharp
public enum RequestPriority : int { Emergency = 1, Immediate = 2, Normal = 3 }

public sealed class FireSupportRequest {
    public FireSupportRequestId id;
    public EngagementId engagementId;
    public SpatialElementId requester;
    public SpatialElementId targetElement;
    public TargetClass targetClass;
    public double targetErrorM;          // 目标定位误差 σ_TLE（§4.5.3）
    public RequestPriority priority;
    public SimTime detectedAt;           // 发现时刻
    public SimTime sentAt;               // 发出时刻
    public SimTime arrivedAtFdcAt;       // 经请求链到达火力单位的时刻
    public SimTime fireAt;               // 开火时刻（04 排队后回填）
    public SimTime impactAt;             // 首发落地
    public OrgUnitId fireUnit;           // 被分配的支援单位（排/连级火力单位）
    public int hops;                     // 经过的层级数
    public bool sameEchelonOwner;        // 火力单位与请求者同属一个营（或同一建制编组）
    public bool adjustFire;              // 是否先试射
    public RequestStatus status;         // Queued | Firing | Done | Cancelled | Expired
}
```

### 3.5 能力向量、属性摘要、结果缓存

```csharp
public sealed class CapabilityVector {           // 归属 03
    public double personnelEffective;   // 可战斗人数（Healthy + LightWounded）
    public double antiPersonnel;        // §4.13 CapIndex 之和，单位：期望杀伤/分钟（参考条件）
    public double antiLightArmor;
    public double antiHeavyArmor;
    public double antiFortification;
    public double antiAir;
    public double suppression;          // 期望压制增量/分钟（参考条件）
    public double recon;                // Σ 观察能力（§4.13）
    public double organicIndirect;      // 建制间瞄 CapIndex
    public double protection;           // 装甲保护的人员比例 [0,1]
    public double ammoFraction;         // 剩余弹药 / 默认基数（按 allocValue 加权）[0,1+]
    public double avgSkill;             // 参战人员有效练度均值
    public double avgFatigue;
}

public sealed class BattalionSummary {           // 只供界面与 AI；不参与结算
    public OrgUnitId battalionId;
    public double reconRangeM;          // 观察距离（昼/夜各一，取中位）
    public double reconRangeNightM;
    public CapabilityVector capability;
    public CapabilityVector fillRate;   // 各分量 实际 / 模板参考（07 FillRate 用）
    public double avgLoadKgDismounted;
    public double commsDelayS;          // 班→营 请求链期望延迟
    public double protectionIndex;
}

public readonly record struct OutcomeKey(
    ulong ownProfileHash, ulong enemyProfileHash, TerrainClassPg terrain,
    EngagementType type, int supportLevel, LightLevel light, bool ownIsAttacker);

public sealed class OutcomeSample {     // 一场模拟的压缩结果
    public double[] casualtyFracBySide;            // [side]：人员失去战斗力比例
    public double[,] vehicleLossFracBySideClass;   // [side, {Light, Heavy, Soft}]：车辆失去战斗力比例
    public double[] killedShareOfCasualties;       // [side]
    public double seizedDepthM;
    public double durationMin;
    public EngagementOutcome outcome;
    public double[] ammoUsedFracBySide;
    public double[] fatigueDeltaBySide;
}

public sealed class OutcomeCacheEntry {
    public OutcomeKey key;
    public int dataVersion;             // 数据/规则版本，变更即失效
    public OutcomeSample[,][] grid;     // [ownStrengthIdx, enemyStrengthIdx][sampleIdx]，网格见 §5
}
```

### 3.6 统计（AAR 原始数据）

```csharp
public sealed class WeaponStats {       // 键：(engagementId, itemId)
    public int shotEvents; public int roundsFired; public int hits;
    public double kills;                // 人员失去战斗力 + 车辆失去战斗力（车辆计 1）
    public double suppressionDelivered; // Σ Δs
    public double[] idleS;              // 按 IdleReason 下标，秒
}
public sealed class ThreatRecord {      // 一个敌方元素作为威胁
    public SpatialElementId threat; public TargetClass cls;
    public double firstDetectedS; public double firstEngagedS;   // 被“合适武器”（score ≥ MinFireScore 且 pKill>0）首次射击的时刻
    public bool engagedByOrganic;       // 本元素/本排自带武器 vs 请求支援
    public double windowS;              // 威胁窗口（§4.11）
    public double lossesWhileWaiting;   // 该威胁在等待期间造成的我方损失（人+车）
}
```

---

## 4. 算法与公式

### 4.0 一步的总流程（`EngagementStep`，阶段 100，每刻一次）

```csharp
void Step(Engagement e, long tick) {
    double t0 = e.stepIndex * 60.0;                    // 片段内时刻（秒）
    RedistributeCrew(e);                               // §4.8.3 步首：武器 ↔ 操作者
    UpdateDismountTimers(e, 60);                       // §4.9（进行中的下车在步内完成时刻生效）
    var q = new IntraStepQueue(e, tick);               // §4.4
    Detect(e, t0, q);                                  // §4.2  生成 DetectionEvent（带时刻）
    AllocateDirectFire(e, t0);                         // §4.3  每件武器选目标（基于步首已知目标）
    ScheduleFirstShots(e, t0, q);                      // §4.3.4
    InsertExternalEvents(e, tick, q);                  // 04 支援火力落点、08 空袭、巡飞弹（已排好时刻）
    q.RunUntil(t0 + 60);                               // §4.4 按时刻结算（射击、命中、发现、落点）
    IssueFireRequests(e, t0);                          // §4.5  缓冲到 04 的 broker，阶段末统一排队
    Move(e, 60);                                       // §4.9  机动（含雷场、下车、纵深带门槛）
    ApplyConsumptionAndFatigue(e, 60);                 // §4.8  （00 阶段 120 的片段内部分在此一并完成）
    DecaySuppression(e, 60);                           // §4.7.3
    PlatoonReorgInCombat(e);                           // 调用 07 §4.6.1（排内合并）
    RecordIdle(e);                                     // §4.12
    e.stepIndex++;
    CheckEnd(e);                                       // §4.10
}
```

> 说明：总纲 §9.6 的六步（侦察、直射分配、间瞄请求、结算、机动、消耗）一一对应上面的 `Detect / AllocateDirectFire / IssueFireRequests / q.RunUntil / Move / ApplyConsumptionAndFatigue`。“结算”放在请求之前执行是因为请求的效果最早在下一刻才到（§4.5.5），顺序不影响结果。

### 4.1 片段初始化（`CreateEngagement`，由 04 在阶段 80 调用，同刻阶段 100 执行第一步）

1. **槽位**：`slotCount = max(2, ceil(ctx.frontageM / FrontSlotWidthM))`。
2. **格子**：行 `row ∈ [0, (YMaxM − YMinM)/CellRowM)`，格子中心 `y = YMinM + (row + 0.5) × CellRowM`。每格映射到条带坐标：`xStrip = ctx.x0M + (slot + 0.5) × slotWidthM`，`yStrip = ctx.contactYAt(xStrip) + y × ctx.attackDir`（`attackDir ∈ {+1, −1}`，片段 A 方在战斗坐标中朝 +y 推进时为 +1）。
   - `terrain`、`elevationM` 读 04 的 `StripTerrain` 在该点的格子（双线性插值高程）。
   - `microCover` 抽样（RNG：`For(SquadSim, e.id, tick0, SaltMicroCover)`，按 slot 升序、row 升序逐格抽）：概率见常数表 `MicroCoverP[terrain]`。
   - `reverseSlopeForB`：该格是 B 方阵地且地形坡面背向 A 方：`elev(row) < elev(row−1)` 且 `elev(row−1)` 为本槽位从 A 方向看的局部最高点（向 A 方向 300 m 内）。`reverseSlopeForA` 对称。
   - `losScaleM = LosScaleM[terrain] × MicroCoverLosMult[microCover]`。
   - `obstacleDensity`、`breach`：守方阵地带（`y ∈ [−ObstacleBeltDepthM, +ObstacleBeltDepthM/2]`）取 `ctx.obstacleDensity`、`ctx.breach`，其他格 0。
3. **元素生成**（按 `SquadId` 升序）：每个参战班生成一个 `SpatialElement`。乘车班（车上有下车步兵）生成 `MountedSquad`；坦克/无步兵车辆生成 `Vehicle`；徒步班 `Infantry`；建制迫击炮班 `IndirectFireSection`；班组无人机作为 `Uav` 元素（每架一个，`yM` = 操作员所在元素 y − 200，高度不参与几何）。
4. **初始位置**：
   - 槽位分配：同一排的班放在相邻槽位；排按 `OrgUnitId` 升序从左到右（`slot = (i × slotCount) / n`，`i` 为班序号，`n` 为本方线列班数）。
   - B 方（守方）：一线排 `yM ∈ [0, 300]`（`yM = 50 + 100 × (排内序号 % 3)`），二线排 `+400…+800`，迫击炮 `+1200`。
   - A 方：`yM = −StartDistanceM[type] − 100 × (梯次序号)`；`Meeting` 时 B 方也以 `Advance` 开始，`yM = +StartDistanceM/4`。
   - `Infiltration`：A 方开局已在 `−800`，且 B 方对 A 方无航迹（夜间才生成，04 保证）。
5. **起始发现**：若 `sides[s].knowledgeOfEnemy ≥ ExposureLevel.Targetable`，s 方所有元素对敌方守方（静止）元素持有航迹 `cued = true`（伏击/预先侦察的价值）；若 `≥ Type`，s 方对敌方元素的发现率 × `CueFactor`（§4.2.2）。
6. **工事**：守方元素 `fortLevel = sides[B].fortificationLevel`（存于元素上，用于 §4.6.1 类别判定与 §4.6.5 削减）。
7. **压制、疲劳**：从 `SquadCombatState` 读入（条带层预备炮火造成的压制会带进片段）。

### 4.2 侦察与视线

#### 4.2.1 视线（概率模型，配对稳定）

```csharp
// 观察者 o、目标 t，距离 r（米）
double dx = Math.Abs(o.slot - t.slot) * e.slotWidthM;
double r  = Math.Sqrt(dx*dx + (o.yM - t.yM)*(o.yM - t.yM));
double L  = 2.0 / (1.0/CellOf(o).losScaleM + 1.0/CellOf(t).losScaleM);   // 调和平均
double dh = CellOf(o).elevationM - CellOf(t).elevationM;
if (dh > 0) L *= Math.Min(ElevLosMaxMult, 1.0 + dh / ElevLosPerM);         // 居高临下视野更远
if (o.kind == ElementKind.Uav) L = LosScaleM[CellOf(t).terrain] * UavLosMult[CellOf(t).terrain];
if (SmokeBetween(o, t)) L *= o.HasThermal ? SmokeLosMultThermal : SmokeLosMultVisual;
double pLos = DMath.Exp(-r / L);
if (IsReverseSlopeFor(t, o) && r > ReverseSlopeVisibleM && o.kind != ElementKind.Uav) pLos = 0;
// 配对稳定：同一对元素、同一对格子，u 不变（不会每分钟闪烁）
double u = For(RngDomain.SquadSim, Mix((ulong)Math.Min(o.id,t.id)) ^ (ulong)Math.Max(o.id,t.id),
               e.startTick, SaltLosPair ^ (uint)(CellIndex(o) * 7919 + CellIndex(t))).NextDouble();
bool los = u < pLos;
```

- `SmokeBetween`：观察者与目标连线经过的槽位中，任一格 `smokeUntilS > 当前时刻` 即为真（只检查两端格子和中点格子，3 次查表）。
- 视线对称：`u` 用 `min/max(id)` 组合，`CellIndex` 的组合按“o、t 的格子索引较小者在前”排序后再计算，保证 `LOS(o,t) == LOS(t,o)`。

#### 4.2.2 发现

对每个观察者元素 o（按 id 升序）、每个尚未被 o 跟踪且 `los == true`、`r ≤ SensorRange(o)` 的敌方元素 t（按 id 升序）：

```text
λ = DetBaseRatePerS × S_obs(o, light) × Sig(t) × R(r) × e.visibilityFactor × Cue(o,t)        (1/s)
R(r)       = max(0, 1 − (r / SensorRange(o))²)
P(本步内发现) = 1 − exp(−λ × 60)
发现时刻     = t0 − ln(1 − u') / λ   （u' ~ U[0,1)；若 > t0+60 则本步未发现）
```

- 抽样：`rng = For(SquadSim, Mix(o.id) ^ t.id, tick, SaltDetect)`，抽一次 `u'`，`tDet = t0 − DMath.Log(1−u')/λ`；`tDet < t0 + 60` 即发现，生成 `DetectionEvent(tDet)` 入队。**发现在事件时刻才生效**（之前的射击不能用它）。
- `S_obs(o, light)` 与 `SensorRange(o)`：取元素内**可用**（有人操作、未损坏）的最佳观瞄器材；器材等级来自 05 的 `SensorProfile`（字段要求见 §6.3），缺省按下表：

| 器材等级 `OpticsClass` | S_obs 昼 | 射程 昼 (m) | S_obs 夜 | 射程 夜 (m) |
|---|---|---|---|---|
| `NakedEye`（徒步班默认） | 1.0 | 1500 | 0.1 | 150 |
| `Binocular`（有班长/观察员） | 1.3 | 2500 | 0.15 | 200 |
| `NightVision`（微光/主动红外） | 1.0 | 1500 | 0.5 | 400 |
| `VehicleDayOptics`（无热像车辆） | 1.5 | 3000 | 0.3 | 800 |
| `ThermalGen1`（2000 年代早期热像） | 1.8 | 3000 | 1.6 | 2000 |
| `ThermalGen2`（现代热像、猎歼火控） | 2.0 | 4000 | 2.0 | 3500 |
| `UavCamera`（班组/连无人机，俯视） | 1.5 | 1500 | 1.2（带热像）/ 0.2 | 1500 / 400 |

  暮光（Twilight）取昼夜的几何平均。

- `Sig(t)`（片段内特征，无量纲）：

```text
Sig(t) = SigBase[kindPosture(t)] × SigModel(t) × FireReveal(t) × (1 − 0.6 × t.fortLevel)
SigBase：MBT 1.0 | IFV/APC 0.9 | SoftVehicle 1.1 | 步兵班 跃进 0.25 / 静止 0.12 / 隐蔽(MicroCover Good) 0.06 | Uav 0.15（小型四旋翼 0.05）
SigModel(t) = 05 SignatureProfile 的型号倍率（缺省 1.0）
FireReveal(t) = 1 + FireRevealMult       若 t 在过去 60 s 内开火（ATGM/RPG 用 AtgmRevealMult）
              = 1                        否则
车辆移动时 × VehicleMovingSigMult
```

- `Cue(o,t)`：同一连内其他元素已上报 t（见 §4.2.3）且上报已到达 o → `CueFactor`；否则 1。
- **航迹丢失**：若 `los == false` 持续超过 `TrackLossS`，从 `o.tracks` 删除。
- **统计**：每次发现记录 `r`（按昼夜分别求均值）→ `DetectionStats`。

#### 4.2.3 情报上报（信息网络）

发现后，元素把航迹逐级上报：`班 → 排部 → 连部`，每跳延迟 `HopDelayS(level) × CommsMult(sender) × CommandMult × JamMult`（§4.5.2 同一公式）。到达连部后，同连所有元素在 `+HopDelayS(Platoon)` 后获得 `cued` 标记。有 `tactical_terminal`（数据链终端）的元素之间共享延迟 × `DatalinkMult`。上报事件不入射击队列，只在到达时刻修改 `cued`（用于下一步的 `Cue`）。

### 4.3 直射火力分配（每步步首）

#### 4.3.1 可开火条件

武器 w 可以在本步开火，当且仅当：操作者人数 ≥ `crewMin`（§4.8.3）；元素未处于下车/上车过程；`(元素在移动 && !canFireMoving)` 为假；需要架设的武器 `isSetUp`；有该武器可用的弹药；元素压制 `s < SuppressionNoFire`（0.9）；元素未 `isBroken`（崩溃元素只能在距离 ≤ 300 m 时自卫射击）。

#### 4.3.2 目标评分（总纲 §9.6：效能 × 命中率 × 威胁 ÷ 弹药价值）

对 w 所在元素已跟踪的每个敌方元素 t（`rangeMinM ≤ r ≤ rangeMaxM`，且 `TargetClass` 允许：反斜面类只能被 `HighAngleIndirect` 打；`Helicopter/Uav` 只能被 `canAntiAir` 武器打），对 w 的每种可用弹药 m：

```text
score(w, m, t) = [ pHit(w,t,r) × pKill(m, t) × Value(t) × Threat(t)  +  SuppWeight × suppPerShot(m, cls(t)) × (1 − s_t) ]
                 ÷ m.allocValue
```

- `pHit`：§4.6.2。`pKill(m,t)`：§4.6.3（车辆）或 `effect.pKillPerHit`（人员、工事；HE 弹用 §4.6.4 的 d=0 期望伤亡数 ÷ 元素人数）。
- `Value(t)`：车辆 = `TargetValue[cls]`（MBT 10，IFV 6，APC 4，SoftVehicle 2）；人员元素 = 元素可战斗人数 × 1；正在操作 ATGM/机枪的元素 × `CrewServedValueMult`。
- `Threat(t) = 1 + ThreatWeight × min(1, ThreatRateTo(t, ownSide) / ThreatNorm)`，`ThreatRateTo` = t 的武器对我方最佳目标的期望杀伤/分钟（§4.11）。
- 选 `score` 最高的 (t, m)。平局：t 的 id 小者优先，再 m 在 `munitions` 列表中靠前者优先。
- 若最高 `score < MinFireScore` → 本步不射击，`idleThisStep = NoSuitableTarget`（这就是“职能重复的武器自然闲置”）。例：ATGM 对步兵班：`0.9 × 0.3 × 9 × 1.2 / 40 ≈ 0.073`，在 `MinFireScore = 0.02` 之上；只有当没有更好的车辆目标、且敌步兵在机枪射程外时它才会打步兵，符合现实中“导弹打碉堡/机枪”的用法；对单个 SoftVehicle 以外的低价值目标会因 `allocValue` 过低而闲置——由 V1 校准 `MinFireScore`。

#### 4.3.3 同元素武器的火力分散

同一元素内，按武器 `allocValue` 降序依次分配；已被本元素 k 件武器选中的目标，对下一件武器 `score × OverkillDecay^k`（防止所有武器打同一个目标）。

#### 4.3.4 首发时刻

```text
tReady = max(w.nextReadyS, tTrack + aimTimeS × AimSkillMult)        // tTrack = 本元素发现该目标的时刻
若武器刚完成架设：tReady = max(tReady, 架设完成时刻)
FireEvent(w, t, m) 入队于 tReady（若 tReady < t0+60）
```

`AimSkillMult = 1.5 − 0.5 × effSkill`（练度 1 → 1.0；练度 0 → 1.5）。

### 4.4 步内事件队列

- 事件类型：`DetectionEvent`、`FireEvent`、`ImpactEvent`、`ExternalImpactEvent`（04/08 注入）、`ReportArrivalEvent`、`DismountCompleteEvent`、`SmokeEvent`。
- 排序键（00 §6.4-5）：`(timeMs, TickPhase.EngagementStep, domainOrder, sourceEntityId, sequenceNo)`；`timeMs = tick × 60000 + round(tS × 1000)`（`MidpointRounding.ToEven`）；`domainOrder`：外部事件 0（空袭/炮弹落点先于同毫秒的直射），片段内事件 1；`sourceEntityId` = 武器 `EquipmentItemId` 或元素 id。
- 处理：

```csharp
void OnFire(FireEvent f) {
    var w = f.weapon; var sh = Element(w);
    if (!CanFire(w) || !Alive(f.target) || !sh.tracks.ContainsKey(f.target)) {   // 射手已死/被压/目标已毁 → 本发作废
        Retarget(w, f.timeS); return; }                                         // 立即重选目标（只用当前已知航迹）
    ConsumeAmmo(w, f.munition, w.roundsPerShot);
    sh.lastFiredAtS = f.timeS; if (IsAtgmOrRpg(f.munition)) sh.lastAtgmFiredAtS = f.timeS;
    double tof = Range(sh, f.target) / f.munition.speedMps;
    Enqueue(new ImpactEvent(w, f.target, f.munition, f.timeS + tof, rangeAtFire));
    double cycle = 60.0 * w.roundsPerShot / w.rofSustainedRpm / CrewRateFactor(w) / (1 - SuppFireCut * s(sh));
    w.nextReadyS = f.timeS + cycle;
    if (w.nextReadyS < t0 + 60) Enqueue(new FireEvent(w, w.target, w.munitionId, w.nextReadyS));
}
void OnImpact(ImpactEvent i) {
    if (i.munition.kind == MunitionKind.AtgmSaclos && (!Alive(shooter) || s(shooter) >= SaclosBreakSupp))
        { RecordMiss(i); ApplySuppression(i, hit:false); return; }   // 半主动制导：射手必须坚持到命中
    if (!Alive(i.target)) return;                                    // 目标已在此前被毁：本发浪费（计入 roundsFired）
    ResolveDirectHit(i);                                             // §4.6
}
```

- `CrewRateFactor(w) = 0.5 + 0.5 × (operators − crewMin + 1) / (crewFull − crewMin + 1)`（满员 1.0；`crewMin = crewFull` 时恒为 1）。
- 一个元素在同一步里先被打掉，它排在后面的 `FireEvent` 在处理时作废——“谁先发现、谁先开火”的优势由此保留（总纲 §9.6）。
- 跨步：未执行的 `FireEvent` 不保存；`w.nextReadyS` 跨步保存，下一步重新排程。

### 4.5 间瞄火力请求（请求链、排队、落点）

#### 4.5.1 谁发请求、请求什么

每步末（`IssueFireRequests`），对本方每个已跟踪的敌方元素 t（按 t.id 升序），若满足：
1. 本方本步内没有任何直射武器对 t 的 `score ≥ MinFireScore`，或 t 的类别 ∈ {`Fortification`, `PersonnelReverseSlope`, `PersonnelInBuilding`}，或 t 的距离 > 本方直射武器最大射程；
2. 没有针对 t 的未完成请求；
3. 本方有可达 t 的支援资产：建制 `IndirectFireSection`（片段内），或 `sides[s].supportAssets` 中射程覆盖 t 的资产（由 04 计算可达性）；

则由**跟踪 t 的、请求链最短的元素**（平局：元素 id 小）发出请求。优先级：
- `Emergency`：t 对本方的威胁窗口 `windowS < EmergencyWindowS`（§4.11）；
- `Immediate`：t 在 `Close/Medium` 带，或 t 是 ATGM/机枪/坦克；
- `Normal`：其他。

片段内**建制迫击炮**（`IndirectFireSection`）不走 broker：按同样的评分规则（§4.3.2，`pHit` 换成 §4.6.4 的期望伤亡）直接在本片段内选目标；它的“请求链”只有 `班 → 排部 → 迫击炮班` 的跳数（在同一连内）。

#### 4.5.2 请求链延迟（总纲 §9.2、§9.10(2)）

```text
路径：请求者班 → 排部 → 连部 → 营部（火力协调） → 旅部 → 火力单位
      在拥有该火力单位的那一级停止（01 提供 GetRequestChain(squadId, fireUnitOrgId) → OrgLevel[]）
前观员捷径：请求者元素内有 forward_observer 或 jtac，且该人可战斗 → 直接一跳到火力单位，跳延迟用 HopDelayS[Observer]

commDelayS = Σ_hop HopDelayS[level] × CommsMult(sender of hop) × CommandMult(level) × JamMult
CommsMult  = 1.0 有电台 | NoRadioMult（3.0，靠喊/跑） ；有 tactical_terminal（数据链）× DatalinkMult（0.4）
CommandMult(level) = max(1, CommandLoad / CommandCapacity)（01，取该层指挥部的值）
JamMult    = 1 + JamIntensity（[0,1]，来自 05/08 的电子战，阶段 0 = 0）
配属惩罚：火力单位不属于请求者的建制编组（Attachment，01）→ 额外 + AttachedExtraHopS
```

#### 4.5.3 目标定位误差 σ_TLE

| 定位来源（请求者元素内最佳者） | `σ_TLE` (m) |
|---|---|
| 前观员 + 激光测距 + 卫星定位 | 15 |
| 无人机视频（班组/连无人机在跟踪 t） | 20 |
| 车辆火控测距（有激光测距的车辆跟踪 t） | 30 |
| 班长估算（地图 + 目测） | 100 |
| 仅暴露度情报（无直接跟踪，04 的 C 线射击） | `BaseIntelTleM / ExposureAccuracyFactor(level, ageMs)`（05） |

- **试射**：若 `σ_TLE > AdjustThresholdM` 且请求者对 t 有视线 → `adjustFire = true`：先打 1 发试射（落点按 §4.6.4 正常结算，有杀伤），`AdjustDelayS` 后效力射，效力射使用 `σ_TLE × AdjustTleMult`。没有观察者视线时不能试射。
- 守方的**预先测定诸元**：t 位于守方预设火力区（守方阵地前 `ObstacleBeltDepthM` 内、且 `fortificationLevel ≥ 0.3`）时，守方的 `σ_TLE × (1 − PreRegisteredTleCut × fortificationLevel)`，`layTimeS × 0.5`。

#### 4.5.4 排队与开火（由 04 broker 执行，规则写在这里供两边一致）

- `arrivedAtFdcAt = sentAt + commDelayS`。
- 火力单位队列排序全序键：`(priority, sameEchelonOwner ? 0 : 1, arrivedAtFdcAt, requestId)`——**本级建制内的请求优先**（“专门为本级服务”）。
- 火力单位空闲且已展开时：`fireAt = max(arrivedAtFdcAt, unitFreeAt) + layTimeS × (autoLay ? AutoLayFactor : 1) × LaySkillMult`；未展开时加 `setupTimeS`。
- 一次任务：`rounds = RoundsPerTube[target cls, weapon] × 可用发射管数`（发射管数 = 有足够乘员的炮/迫击炮门数 × `tubesPerItem`，火箭炮整齐射）。各发落地时刻 `impactAt + k × (60 / rofSustainedRpm)`，`impactAt = fireAt + range / speedMps`。
- 火力单位在任务结束后 `unitFreeAt = 最后一发出膛时刻`。若 C 线压制（`fireSupportSuppression`）> 0，`layTimeS` 和间隔 × `1/(1 − 0.7 × fireSupportSuppression)`（反炮兵压力下射击更慢、更少）。
- 请求过期：若 t 已被毁或航迹丢失超过 `RequestExpireS`，未开火的请求取消（统计为 `Cancelled`）。

#### 4.5.5 时序保证

请求在阶段 100 内产生，**先缓冲**；阶段 100 结束时 broker 按 `(fireUnitId, 上面的全序键)` 统一入队（00 §5.2 规则 6）。落点时刻必然 ≥ 下一刻起点（因为 `commDelayS + layTimeS + 飞行时间 ≥ 60 s` 在常数下恒成立；若计算结果 < 下一刻起点，钳到下一刻起点 + 1 ms）。落点作为 `ExternalImpactEvent` 在之后的步插入目标所在片段（若片段已结束，交给 04 在条带上结算，§6.2）。

### 4.6 命中与毁伤结算

#### 4.6.1 目标类别 `ClassOf(t, shooter)`

```csharp
TargetClass ClassOf(SpatialElement t, SpatialElement sh) {
    if (t.kind == ElementKind.Uav) return TargetClass.Uav;
    if (t.vehicle != 0 && t.mount != MountState.Dismounted || t.kind == ElementKind.Vehicle) {
        var a = Armor(t.vehicle);
        if (a.frontKeMm < SoftVehicleThresholdMm) return TargetClass.SoftVehicle;
        return a.frontKeMm >= HeavyArmorThresholdMm ? TargetClass.HeavyArmor : TargetClass.LightArmor;
    }
    var c = CellOf(t);
    bool stat = !t.isMoving;
    if (stat && IsReverseSlopeFor(t, sh) && Dist(t, sh) > ReverseSlopeVisibleM) return TargetClass.PersonnelReverseSlope;
    if (stat && t.fortLevel >= FortClassThreshold) return TargetClass.Fortification;
    if (stat && c.terrain == TerrainType.Urban) return TargetClass.PersonnelInBuilding;
    if (stat && (c.microCover != MicroCover.None || t.fortLevel >= CoveredFortThreshold || s(t) >= PronePinThreshold))
        return TargetClass.PersonnelCovered;
    return TargetClass.PersonnelExposed;
}
```

（压制到 `PronePinThreshold` 的人员会卧倒找掩蔽 → 视为有掩体；所以压制本身降低对方后续杀伤。）

#### 4.6.2 命中概率

```text
pHit = Interp(curve, r) × M_skill × M_supp × M_fat × M_mov_sh × M_mov_tg × M_size × M_cover × M_light × M_elev × M_screen
curve      = 车辆类目标用 accuracyVsVehicle；人员/工事类用 accuracyVsPersonnel；超出折线范围取端点值；r < rangeMinM 时 pHit = 0
M_skill    = 0.4 + 0.6 × min(1, effSkill / skillReq)
effSkill   = 02.GetSkill(formation, operatorSpecialty, model) 的 (0.4 × 通用 + 0.6 × 专有)；
             操作者专业不对口时 × 07.CrossTrainFactor(personSpecialty, operatorSpecialty)；轻伤操作者 × LightWoundedSkillMult
M_supp     = 1 − 0.7 × s(shooter)
M_fat      = 1 − 0.3 × fatigue(shooter)
M_mov_sh   = 射手移动：isStabilized ? 0.85 : 0.4；静止 1.0
M_mov_tg   = 目标移动：0.8；静止 1.0
M_size     = 车辆目标：armor.sizeFactor；人员 1.0
M_cover    = PersonnelCovered 0.5 | PersonnelInBuilding 0.4 | Fortification 0.3 | 其他 1.0（只对直射；HE 的掩体效果在面杀伤里算，不重复乘：HE 直射弹此项取 1.0）
M_light    = 观察器材在当前光照下 S_obs < 0.5 时 0.7；否则 1.0
M_elev     = 射手比目标高 > 30 m：1.1；低 > 30 m：0.9
M_screen   = §4.9.4 步坦协同屏护：目标车辆被己方下车步兵屏护时，敌方近程反坦克武器（射程 ≤ 600 m）× (1 − ScreenCut × commandFactor)
pHit = clamp(pHit, 0, PHitMax)
```

抽样顺序（一个 `ImpactEvent` 一条流，`rng = For(SquadSim, Mix(itemId) ^ (ulong)shotSeq, tick, SaltShot)`，`shotSeq` = 该武器在本片段的射击事件序号）：① 命中 ② 着弹方位 ③ 击穿 ④ 损伤等级 ⑤ 受害者选择 ⑥ 每名受害者伤情。**未用到的抽样也不跳过顺序**（未命中就停止抽样，这本身是确定的）。

#### 4.6.3 对车辆：方位、击穿、毁伤

```text
方位：攻顶弹 → Top；否则 u < FrontAspectP → Front，否则 Side
装甲：KE 类（Apfsds/CannonAp/Bullet） → front/sideKeMm；化学能类 → front/sideHeatMm
      单级 Heat/AtgmSaclos/RocketHe(HEAT) 且该方位有 ERA → + eraHeatBonusMm（TandemHeat、攻顶不加）
      Top → topMm
穿深：pen = penetrationMm − penDropPerKmMm × r/1000（KE）；化学能不衰减
P_pen = 1 / (1 + exp(−(pen − armor) / (PenSigmaFrac × armor + PenSigmaFloorMm)))
击穿后：P_disable = pKillGivenPen；若失去战斗力：调用 07.RollVehicleDamage(item, munitionKind, aspect, rng) 得到 DamageLevel
未击穿：机炮/榴弹（caliber ≥ 20 mm）以 NonPenDamageP 造成 FirepowerKill 或 SensorKill（07，FieldRepairable）；否则无损伤
压制：车辆元素只吃 suppPerShot × (1 − suppressionResist)
```

**车内人员**（总纲 §9.10(5)：乘车有装甲保护——但车被击穿时一车人一起倒霉）：

| 车辆结果 | 每名车组/载员：阵亡 | 重伤 | 轻伤 | 无恙 |
|---|---|---|---|---|
| `Destroyed` 且殉爆（`catastrophicGivenKill` 抽中） | 0.60 | 0.20 | 0.10 | 0.10 |
| `Destroyed` 未殉爆 | 0.25 | 0.25 | 0.20 | 0.30 |
| 击穿但未失去战斗力 / `FieldRepairable` / `DepotRepair` | 0.05 | 0.10 | 0.15 | 0.70 |

（`confidence: estimated`；来源：二战与海湾、车臣、俄乌公开统计里“坦克被击穿时乘员伤亡约 1–1.5 人/车”的量级，由 V2 复核。）车被毁后，幸存的人自动下车成为 `Infantry` 元素（车组成员携带个人武器）。

#### 4.6.4 面杀伤（间瞄、HE 直射、手榴弹、巡飞弹、地雷之外的所有爆炸物）

采用 Carleton 损伤函数 + 人员高斯散布，闭式解：

```text
每发弹：
  σ_tot² = σ_TLE² + σ_CEP²         σ_CEP = CEP / 1.1774；CEP = isGuided ? guidedCepM : cepPerKmM × r/1000
  落点偏移 (dx, dy) ~ N(0, σ_tot²) 各轴独立（15 提供 NextGaussian）
  d² = dx² + dy²                    （HE 直射命中时 d² = 0；未命中只施加压制）
  对目标元素中每名暴露的人（车内的人不算，车内由车辆结果决定）：
     Rc² = lethalAreaM2[cls] / π
     p   = Rc² / (Rc² + 2σe²) × exp(−d² / (Rc² + 2σe²))        σe = t.spreadM
     Bernoulli(p) → 失去战斗力（再按 §4.6.6 抽伤情；穿防弹衣 × BodyArmorFragMult）
  对车辆元素：同式，σe = 0，用该车辆类别的 lethalAreaM2（MBT 很小 → 实质要求直接命中）；
     抽中 → 视为一次击穿（化学能/冲击），走 07.RollVehicleDamage
  压制：Δs = suppPerShot[cls] × exp(−d² / (Rs² + 2σe²)) × (1 − s) × (1 − resist)，Rs = suppressionRadiusM
  工事：cls == Fortification 时 t.fortLevel −= fortDamagePerHit × exp(−d²/(Rc²+2σe²))（下限 0）
```

- 一发弹同时作用于其落点附近 **同槽位且 |Δy| < 3 × Rs** 的其他元素（敌我都算——**误伤存在**，落点按目标元素中心计算偏移后，对邻近元素用它们自己到落点的距离代入 d²）。
- 2020 纳卡的关键：攻顶制导弹（MAM-L、巡飞弹）不用面杀伤，走 §4.6.3 的直射式命中（`pHit` 来自 08/04 给的单发命中率，方位 = Top）。

#### 4.6.5 对工事

`Fortification` 类：人员伤亡用 `effect[Fortification].pKillPerHit`（直射）或面杀伤（`lethalAreaM2[Fortification]` 很小，必须近乎直接命中）；每次命中/近失按 §4.6.4 降低 `fortLevel`。`fortLevel < FortClassThreshold` 后该元素按 `PersonnelCovered` 判定——**炮火准备的价值 = 削减工事**。

#### 4.6.6 伤亡分配到人（按角色）

人员元素被命中（直射，命中 1 人）或面杀伤（逐人 Bernoulli）时：

```text
直射选人：在元素“暴露的可战斗人员”中按权重抽 1 人：
  w = RoleExposure[role]：正在操作开火武器的射手 1.5（ATGM/RPG 射手开火后 60 s 内 2.0）；班长/军官 1.2；其他 1.0；
      乘车时的驾驶员、车内人员 0（由车辆结果决定）
伤情：按弹种组 {Bullet, Fragment(HE/Grenade/Rocket/Thermobaric), Blast(Mine)} 查 SeverityTable：
  Bullet：    阵亡 0.30 | 重伤 0.40 | 轻伤 0.30
  Fragment：  阵亡 0.25 | 重伤 0.40 | 轻伤 0.35
  Thermobaric：阵亡 0.45 | 重伤 0.35 | 轻伤 0.20
  Mine：      阵亡 0.20 | 重伤 0.60 | 轻伤 0.20
防弹衣（人员装备有 body_armor 或班模板标记）：Bullet 命中先以 BodyArmorStopP 无效（不计伤亡），否则阵亡概率的一半移到重伤
调用 07.ApplyCasualty(personId, state, time, sourceTag)
```

- `LightWounded` 留在元素里，继续操作武器（练度 × `LightWoundedSkillMult`），移动速度 × 0.8；片段结束后进入 07 的医疗链。
- `SeverelyWounded`、`Killed` 立即失去操作能力；武器释放给 §4.8.3 重新分配。
- 班长伤亡：元素压制恢复率 × `LeaderlessRecoveryMult`，直到下一步重分配指定新班长（`team_leader` > 其他按 `PersonnelId` 升序）。

### 4.7 压制

#### 4.7.1 施加（期望值，连续量，不抽样——00 §6.2 方差规则）

```text
直射：Δs = suppPerShot[cls] × (hit ? 1.0 : MissSuppFactor) × (1 − s) × (1 − resist)
面杀伤：见 §4.6.4
s ← min(1, s + Δs)    （元素级；下车拆分出的两个元素各自有 s）
```

#### 4.7.2 压制的效果

| 压制值 s | 效果 |
|---|---|
| 任意 | 命中 × (1 − 0.7 s)；射击循环 ÷ (1 − 0.8 s) |
| ≥ `PronePinThreshold` 0.5 | 人员视为卧倒有掩蔽（§4.6.1）；**不能向更近的纵深带推进**（§4.9.2）；下车被打断 |
| ≥ `SaclosBreakSupp` 0.6 | 半主动制导导弹射手无法坚持制导（导弹失的） |
| ≥ `SuppressionNoFire` 0.9 | 不能开火（`IdleReason.Suppressed`）；只能原地或后撤 |

#### 4.7.3 消退

```text
每步末：s ← s × (1 − SuppRecoveryPerMin × RecoveryMod)          （片段内，dt = 1 min）
RecoveryMod = (0.6 + 0.8 × 通用练度均值) × (有班长 ? 1 : LeaderlessRecoveryMult) × (1 − 0.5 × fatigue)
片段外（04 每条带步）：s ← s × (1 − SuppRecoveryPerMin)^(dtMin)  （RecoveryMod 同上）
```

### 4.8 负重、疲劳、弹药、乘员

#### 4.8.1 负重

```text
loadKg(person) = PersonalKitKg (+ BodyArmorKg 若有) + Σ 本人携带武器 weaponWeightKg + Σ 本人分到的弹药发数 × roundWeightKg
分配规则（每次重分配后重算）：
  个人武器的弹药由持有人携带；班组武器（crewFull ≥ 2）的弹药在其操作者与副射手之间平分；
  元素 onPersonnel 弹药剩余部分在全体可战斗人员间平均摊（按 PersonnelId 升序轮流 1 单位直到分完）
loadRatio = loadKg / BodyMassKg
```

#### 4.8.2 疲劳与机动（总纲 §9.10(6)）

```text
每步：fatigue += FatigueRate[activity] × (1 + LoadFatigueK × max(0, loadRatio − LoadFreeRatio))     （徒步人员；乘车者按 Mounted）
activity ∈ { Rest, Hold, Mounted, Move, Assault, UnderFire(本步受到 Δs>0.05) }：取最大的那个
fatigue = clamp(fatigue, 0, 1)；元素 fatigue = 成员均值
徒步速度 v = BaseFootSpeedMpm[terrain] × (1 − LoadSpeedK × max(0, loadRatio − LoadFreeRatio)) × (1 − 0.5 × fatigue)
            × (UnderFire ? BoundingMult : 1) × (含 LightWounded 比例 > 0.3 ? 0.8 : 1)
车辆速度 v = BaseVehicleSpeedMpm[terrain, mobilityType] × (道路格 ? RoadMult : 1)
```

#### 4.8.3 乘员重新分配（每步步首，总纲 §9.3③ “武器没人操作时按规则重新分配”）

```csharp
void RedistributeCrew(SpatialElement el) {
    var able = el.persons.Where(p => CanOperate(p)).OrderBy(p => p.id).ToList();   // Healthy + LightWounded
    // 1. 车辆元素：车辆武器（主炮、并列机枪、炮塔导弹）由车组担任；驾驶员不能兼任炮长
    // 2. 其余武器按 OperatorPriority 降序排序（平局 itemId 升序）：
    //    ATGM 10 > 通用/重机枪 9 > AGL 8 > 便导 8 > 复用火箭筒 7 > 迫击炮 7 > 狙击 6 > 一次性火箭筒 5 > 班用机枪 5 > 枪挂榴弹 3 > 步枪 1
    // 3. 对每件武器依次：先取对口专业的人（operatorSpecialty 相同），再取同训练体系（school）的人，再取任意人；
    //    每人只能操作一件武器；已分配的人从 able 移除；分配到 crewFull 为止，不足 crewMin 则该武器本步无人操作（保留在元素里）
    // 4. 一次性火箭筒：不占人，由任意无“班组武器”的步兵在开火时使用（每人一具）
}
```

- **携行约束**（“9 人班减员 3 人后没人背火箭筒”）：元素移动时，所有无人操作的武器及弹药按 `weaponWeightKg` 降序尝试分给可战斗人员，前提是此人 `loadRatio + w/BodyMassKg ≤ MaxCarryRatio`；分不出去的武器**丢在原地**（记入 `e.droppedItems`，附位置 y、槽位），片段结束时由战场控制方回收（07 §4.2）。乘车元素不受此约束（东西在车上）。
- 元素可战斗人数为 0 → 元素失效；剩下的武器/车按上面的“丢在原地”处理。

#### 4.8.4 弹药消耗

- 每个 `FireEvent` 扣 `roundsPerShot`：先扣 `onPersonnel`（徒步时只能扣这里），乘车或车辆元素扣 `onVehicle`。
- 下车步兵与本车距离 ≤ `VehicleResupplyRangeM` 且同槽位、本步未移动 → 每步从 `onVehicle` 向 `onPersonnel` 搬运至多 `ResupplyKgPerMin`（按 `allocValue` 降序弹种）。
- 某武器弹药为 0 → `IdleReason.NoAmmo`；武器保持在元素里。

### 4.9 机动、乘车/下车、纵深带门槛

#### 4.9.1 命令（片段内条令 AI，规则化、双方对称）

| 元素类型 | A 方（进攻）默认 | B 方（防守）默认 |
|---|---|---|
| 乘车班 | `Advance` 至下车线，然后 `Dismount` | `Hold`（或 `Counterattack` 类型中同 A） |
| 坦克/车辆 | `Advance`，与本排步兵保持 `OverwatchStandoffM` 在其后方/同线 | `Hold`；车体掩蔽 |
| 徒步步兵 | `Advance` → 进入 Close 带后 `Assault` | `Hold` |
| 迫击炮班 | `Hold`，`Far` 带内 | `Hold` |
| 任何元素 `isBroken` | `Withdraw` | `Withdraw` |

- **下车线**：`DismountRangeM[doctrine]`（俄式/苏式 400 m，北约式 1000 m；`DoctrineProfile` 由 04 给出）或进入 `Urban/Forest` 格，或乘车元素 s ≥ `PronePinThreshold`，或本排有车辆在本步被 ATGM 命中——先到者触发。
- `Mount`：片段 `Withdraw` 结束时或类型为 `Reconnaissance` 的撤出。

#### 4.9.2 推进与纵深带门槛（总纲 §9.10(4)：先压制才能推进）

```text
A 方元素 el 本步欲前进 Δy = v × 1 min（朝 +y）：
  nextBand = 推进后与“覆盖它的敌方元素”的最近距离所在 DepthBand
  覆盖它的敌方元素 C = { b ∈ 敌方 | |b.slot − el.slot| ≤ 1，b 有武器射程 ≥ 与 el 推进后的距离，且 b 对 el 有视线（§4.2.1） }
  若 nextBand 比当前更近 且 C 非空 且 el 所在格及前方格均无烟幕：
     允许前进 ⟺ mean_{b∈C}(s_b) ≥ AdvanceSuppThreshold  或  el 为车辆且 C 中无反装甲武器
     否则：el 停在当前带的边界上（Δy 截断），本步“停顿”计数 +1
  el.s ≥ PronePinThreshold → 不前进
```

- 进攻方的烟幕：A 方 `canSmoke` 武器在有元素被门槛挡住 ≥ 2 步时，对 C 中压制最低的元素所在格打烟（`smokeUntilS = t + smokeDurationS`），优先级高于杀伤射击（规则 AI）。
- **雷场**：元素在 `obstacleDensity > 0` 的格内每移动 100 m，车辆以 `MineVehicleP100 × density × (1 − breach)`、徒步元素以 `MineFootP100 × density × (1 − breach)` 触雷（RNG `SaltMine`）。车辆触雷 → `07.RollVehicleDamage(item, Mine, Bottom)`；徒步触雷 → 1 人按 `Mine` 伤情；损失标记 `BattleLine.Breaching`（04 的 AAR 归因）。
- 守方前沿被夺取：A 方可战斗的**徒步**元素进入守方元素所在格（|Δy| ≤ `SeizeDistanceM` 且同槽位），且该格守方元素已失效或 `Withdraw` → 该槽位守方阵地被夺取，`seizedDepthM = max(seizedDepthM, 守方该元素的 y + CellRowM)`。**只有车辆不能夺取阵地**（总纲 §9.10(5)：下车后才能清剿建筑和战壕）。

#### 4.9.3 下车 / 上车

- 下车耗时 `DismountTimeS`（车辆静止）；期间元素 `mount = Mounted`，不能射击车外武器，乘员在车内（被打按车内处理）。
- 完成时生成 `DismountCompleteEvent`：拆成两个元素——原元素保留车与车组（`Vehicle`），新元素（新 `SpatialElementId`）为下车步兵（`Infantry`，同 `squadId`，同槽位，`yM` 相同）。人员归属按 `SquadTemplate`（01）里标记为车组的专业（`vehicle_*`、`tank_*`）留车，其余下车；若下车人数超过车辆 `passengerCapacity`（不会发生，因为乘车时已受限），按容量截断。
- 弹药分配：下车步兵带走其携带份额（§4.8.1），其余留在 `onVehicle`。
- 上车：两元素同槽位、|Δy| ≤ 50 m、车辆 `passengerCapacity` 足够 → 合并，耗时 `MountTimeS`。

#### 4.9.4 步坦协同

车辆元素 v 在本步满足“同槽位或相邻槽位内有本方可战斗徒步元素，且 |Δy| ≤ `ScreenRangeM`” → v 被屏护：敌方射程 ≤ 600 m 的反坦克武器对 v 的 `M_screen = 1 − ScreenCut × commandFactor`（`commandFactor` 来自 01 指挥负荷，§3.2）。这是“协同效果打折扣”（总纲 §9.7）的落点。

### 4.10 崩溃与结束条件

**元素崩溃**（代替独立的“士气”变量，C-05）：

```text
casualtyFrac = 1 − 可战斗人数 / 片段开始时人数
isBroken ⟸ (casualtyFrac ≥ BreakCasualtyFrac 且 s ≥ BreakSupp) 或 (可战斗人数 ≤ 1 且元素原有 ≥ 4 人)
崩溃元素：Withdraw（向本方后方移动），只在 ≤ 300 m 自卫射击；s 降到 < 0.3 且 casualtyFrac < 0.7 时可恢复（每步检查）
```

**片段结束**（每步末检查，按顺序，命中第一条即结束）：

| # | 条件 | `outcome` |
|---|---|---|
| 1 | B 方所有元素失效或在 `Withdraw` 且已离开 Close+Medium 带 | `DefenderWithdrew`（若 A 方夺取槽位数 ≥ 一半则 `AttackerSeized`） |
| 2 | A 方 `CombatStrength(A) < SideBreakFrac × initialStrength(A)` 或 A 方全部 `Withdraw` | `AttackerRepulsed`；若此时 B 方也 < `SideBreakFrac` 则 `MutualBreak` |
| 3 | 夺取槽位数 ≥ `ceil(slotCount × SeizeSlotFrac)` 且 B 方在这些槽位无可战斗元素 | `AttackerSeized` |
| 4 | `stallCounter ≥ StallSteps`（A 方所有元素连续若干步未前进且 mean s_A ≥ 0.5） | `AttackerRepulsed`（进攻停顿，转入对峙，04 决定是否再生成） |
| 5 | `noContactCounter ≥ NoContactSteps`（双方都没有任何航迹）且 `stepIndex ≥ 5` | `Stalemate` |
| 6 | `stepIndex ≥ maxSteps` | `Stalemate`（若 `seizedDepthM > 0` 则 `AttackerSeized` 部分） |

`CombatStrength` 定义见 §4.13。`Reconnaissance` 类型：A 方在获得 ≥ 50% 守方元素航迹后自动 `Withdraw`，结局记 `Stalemate`，其价值在于把暴露度贡献交给 05（§6.3）。

**强制结束 `EngagementResult ForceEnd(EngagementId id)`**（04 E-11；04 在战斗被判定结束时调用，如停火、地块因别处原因易手）：
```text
1. 若片段已结束（outcome ≠ None）→ 直接返回已有结果（幂等）。
2. 不再执行任何步；本刻尚未结算的步内事件全部丢弃；仍在飞的落点按 §6.2 第 3 行交回 04。
3. outcome = Stalemate；seizedDepthM 保持当前值；durationMin = stepIndex。
4. 与自然结束完全相同地生成 EngagementResult（伤亡、droppedItems、弹药写回 06、统计、威胁记录），并释放 FireSupportRequest（状态 Queued 的置 Cancelled）。
5. 调用时机：任何阶段均可调用，结果在调用处立即返回；04 随后按自己的写回流程处理。
```

### 4.11 威胁窗口（总纲 §9.10(3)）

```text
ThreatRateTo(t, side) = max_{我方元素 x 在 t 武器射程与视线内} Σ_{w∈t} (60/cycle_w) × pHit_w(x) × pKill_w(x) × Value(x)        (价值/分钟)
windowS(t) = 60 × SevereLossValue(x*) / max(ε, ThreatRateTo)          x* = 取到 max 的那个我方元素；SevereLossValue = Value(x*) × SevereLossFrac
```

- 威胁首次被我方任一元素发现时创建 `ThreatRecord`；记录首次被“合适武器”射击的时刻（直射：`score ≥ MinFireScore` 且 `pKill > 0`；间瞄：首发落地）。
- `lossesWhileWaiting` = 在 `[firstDetectedS, firstEngagedS)` 期间，由 t 造成的我方损失价值（每次 t 的射击造成伤亡时累加）。
- 用途：① `Emergency` 请求判定；② AAR“等待支援时的损失”；③ 编辑器“火力丰富度”估算（离线用试验场统计）。

### 4.12 闲置原因（总纲 §9.8）

每件武器每步若 0 次开火，按以下**优先顺序**取第一个成立的原因，记 60 s（部分开火的步不记闲置）：

1. `NoAmmo`：无可用弹药。
2. `Suppressed`：元素 s ≥ 0.9，或操作者不足 `crewMin` 是因为伤亡（记 `Suppressed` 还是另设？见 C-06：建议另记入 `NoCrew` 子项，界面并入“被压制/失能”）。
3. `AwaitingOrders`：正在架设、下车、上车，或元素 `isMoving` 且 `!canFireMoving`，或通信中断后处于“按最后命令保持”。
4. `NoLineOfSight`：存在位于射程内的敌方元素（**用真实状态判断**，仅统计用），但本元素对它们都没有航迹/视线。
5. `OutOfRange`：本元素有航迹，但都在射程外（或 < `rangeMinM`）。
6. `NoSuitableTarget`：有射程内的航迹，但 `score < MinFireScore` 或类别不允许。
7. 都不成立（射程内外都没有敌人）：记 `OutOfRange`。

### 4.13 能力向量、战斗力、属性摘要

```text
CapIndex(w, c) = (60 / cycle_w) × Interp(curve_c, RefRangeM[c]) × pKillRef(w, c) × M_skill   （期望杀伤/分钟，开阔地、白天、静止、未压制）
pKillRef：车辆类用 §4.6.3 对参考装甲 RefArmor[c]（正面 60% / 侧面 40% 期望）；人员用 pKillPerHit 或 d=0 面杀伤 ÷ 9
CapabilityVector 各分量 = Σ_{可操作武器} CapIndex(w, c)（c 对应：PersonnelCovered→antiPersonnel，LightArmor，HeavyArmor，Fortification，Uav/Helicopter→antiAir）
suppression  = Σ (60/cycle_w) × suppPerShot(w, PersonnelCovered)
recon        = Σ_元素 S_obs(昼) × SensorRange(昼) / 1000
protection   = 装甲车内座位数 / 人数（上限 1）
CombatStrength = 0.4 × personnelEffective/P0 + 0.2 × antiArmor/AA0 + 0.2 × suppression/S0 + 0.2 × antiPersonnel/AP0
                 （分母 = 片段开始或模板参考值；antiArmor = antiLightArmor + antiHeavyArmor）
```

- `BattalionSummary` 由营下所有班汇总，每 60 分钟或编制变更时重算；`fillRate` = 分量 / 模板满编参考值（用同样练度，以免练度变化混进满编率）。
- **能力衰减曲线**（编辑器，总纲 §9.11(2)）：`ComputeResilienceCurve(companyTemplate)`：对 k = 0…N 人随机伤亡（每个 k 抽 200 次，按 §4.6.6 角色权重选人，再跑 §4.8.3 重分配），输出各能力分量的均值 vs 减员比例。RNG：`For(Cache, templateHash, 0, SaltResilience)`。

### 4.14 结果分布缓存（`OutcomeCache`，总纲 §9.3④、§9.12(2)）

#### 4.14.1 键

- `ownProfileHash` / `enemyProfileHash`：连的“编成签名” = 对 `(squadTemplateId, 各槽位绑定型号 id)` 排序后的序列做 SplitMix64 链式哈希（**不含**人数、损失——损失通过强度网格处理）。
- `terrain`：试验场标准地形类 `TerrainClassPg ∈ {Open, Mixed, Forest, Urban, Mountain}`；条带片段按 04 给的扇区地形构成取占比最大的类（城市 ≥ 20% 优先归 `Urban`，高程起伏 ≥ 150 m 归 `Mountain`）。
- `supportLevel`：0 无、1 营迫、2 营迫 + 旅炮、3 再加精确/无人机支援（由 04 按 `supportAssets` 计算）。
- 强度网格：`StrengthGrid = {1.0, 0.75, 0.5, 0.25}`，自方 × 敌方共 16 格；每格 `CacheSamplesPerCell = 48` 个样本。

#### 4.14.2 生成（确定性）

每格的模拟用合成编成：从模板满编实例出发，按 §4.6.6 的角色权重随机移除人员/车辆直到 `CombatStrength` 落入该格 ±0.05；RNG 为 `For(Cache, Mix(keyHash) ^ cellIdx, 0, SaltCacheGen + sampleIdx)`——**与世界时刻无关**，因此后台是否预先算好不影响结果（00 G-21）。缓存未命中时**同步**生成所需格子。数据/规则版本变化（`dataVersion`）使全部条目失效；玩家改模板只使含该签名的条目失效。

#### 4.14.3 使用（`FidelityTier.Cached`）

```text
1. 计算双方实际 CombatStrength → (so, se)；找到包围它们的网格点 (i,i+1)×(j,j+1)
2. 样本抽取：最近格点 (î, ĵ)；k = For(Cache, engagementId, tick, SaltCacheSample).NextInt(48)
3. 插值修正：对每个比例量 q（伤亡比例、车辆损失比例、推进）：
      q = sample[î,ĵ][k].q × mean_bilinear(q; so, se) / mean[î,ĵ](q)      （mean=0 时直接用 bilinear 均值）
4. 条件修正（总纲“用兵力比例、弹药、练度、疲劳修正”）：
      敌方造成的伤亡 × AmmoMod(敌 ammoFraction) × SkillMod(敌 avgSkill / 参考) × (1 − 0.3 × 敌 avgFatigue)
      AmmoMod(a) = min(1, a / 0.3)；SkillMod(x) = clamp(x^0.5, 0.5, 1.5)
5. 落到真实名册（不四舍五入，07 原则）：每名参战人员 Bernoulli(伤亡比例) → 按 §4.6.6 伤情表；
   每辆车 Bernoulli(该类损失比例) → 07.RollVehicleDamage(item, 代表弹种[由敌方编成主反装甲武器决定], Front)
   弹药按 ammoUsedFrac 按武器比例扣除；疲劳 += fatigueDelta
6. 结局、seizedDepthM、durationMin 直接取样本；片段在 startTime + durationMin 结束（04 期间锁定该连）
```

- 缓存模式不产生班级回放，AAR 的武器级统计用该格的期望值标注“（估计）”。
- 代理模型（12）可直接读本缓存的均值与方差（00：可合一）。

### 4.15 编制试验场批量模拟（阶段 0 核心，总纲 §9.9、§9.11(5)）

```csharp
ProvingGroundReport Run(ProvingGroundSpec spec) {
    // spec: 我方单位(排/连/营模板 + 型号绑定 + 练度) ，对手(同)，地形 TerrainClassPg 列表，EngagementType，支援等级，昼夜，N 场
    // 第 i 场：seed = Mix(spec.hash) ^ i；用 Full 精度运行 §4.0，直到结束条件
    // 汇总：结局分布、伤亡/损失分布（均值、P10、P50、P90）、武器统计、闲置原因、响应时间、威胁窗口、能力衰减
}
```

- 标准地形 `TerrainClassPg`：参数见常数表（`LosScaleM`、微地形概率、高程起伏、反斜面概率）。`Mountain` 以纳卡高原（舒沙—拉钦一带）为原型：起伏 300–600 m，道路格 ≤ 10%，`reverseSlope` 格比例约 25%。
- 批量结果写入 `OutcomeCache`（同键直接复用）。

---

## 5. 常数表

> 全部存于 `data/tuning/03_squad_combat.yaml`（00 G-15）。`confidence` 未写的均为 `estimated`。“V1/V2 校准”指第 9 节的验证脚本调参。

### 5.1 几何、时间

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `FrontSlotWidthM` | 250 | m | 150–400 | 一个班的防御正面约 50–100 m，一个排 250–400 m；250 m 使连正面 4–6 槽 |
| `CellRowM` | 100 | m | 50–200 | 纵深带最小 300 m 内要能区分 3 档距离 |
| `YMinM` / `YMaxM` | −4500 / +2000 | m | — | 覆盖 Far 带 4 km + 守方纵深 |
| `DepthBand` 边界 | 300 / 1000 / 4000 | m | ✅ | 总纲 §9.3③ |
| `MaxDurationMin` | Attack 30, Meeting 20, Counterattack 30, Infiltration 20, Recon 15 | min | 10–40 | 总纲 §9.3②“10–30 分钟” |
| `StartDistanceM` | Attack 2500, Meeting 1500, Counterattack 1200, Infiltration 800, Recon 2000 | m | ±50% | 攻击阵地从展开线开始；遭遇战在中距离接触 |
| `ObstacleBeltDepthM` | 300 | m | 200–600 | 雷场带常在前沿前 100–300 m |
| `SeizeDistanceM` | 50 | m | 30–100 | 突入战壕/建筑 |
| `SeizeSlotFrac` | 0.5 | — | 0.3–0.7 | 过半正面被突破即视为阵地失守 |
| `StallSteps` | 8 | 步 | 5–12 | 进攻停顿 8 分钟视为受挫 |
| `NoContactSteps` | 5 | 步 | 3–10 | |

### 5.2 侦察、视线

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LosScaleM[terrain]` | Open 3000, Mixed 1500, Forest 250, Urban 150, Mountain 1200, Marsh 2000, Water 5000 | m | ×0.5–2 | 视距分布量级：欧洲开阔地平均视距 1–2 km、森林 < 300 m（冷战北约地形研究的常见量级） |
| `MicroCoverP[terrain]` (None/Light/Good) | Open .7/.25/.05; Mixed .4/.4/.2; Forest .1/.4/.5; Urban .1/.3/.6; Mountain .3/.4/.3 | — | — | 估计 |
| `MicroCoverLosMult` | None 1.0, Light 0.8, Good 0.5 | — | — | |
| `ElevLosPerM` / `ElevLosMaxMult` | 50 / 3.0 | m / — | 30–100 / 2–4 | 每高 50 m 视距尺度 +100% |
| `UavLosMult[terrain]` | Open 1.5, Mixed 1.2, Forest 0.3, Urban 0.5, Mountain 1.5 | — | — | 俯视不受起伏遮挡，受林冠遮挡 |
| `ReverseSlopeVisibleM` | 300 | m | 150–500 | 越过山脊线后才看得到反斜面阵地 |
| `SmokeLosMultVisual` / `Thermal` | 0.1 / 0.7 | — | — | 普通烟幕对热像效果有限 |
| `DetBaseRatePerS` | 0.05 | 1/s | 0.02–0.1 | 近距离、标准车辆目标平均 20 s 被发现；V1 校准 |
| `FireRevealMult` / `AtgmRevealMult` | 3.0 / 5.0 | — | 1–8 | 开火闪光、尾焰 |
| `VehicleMovingSigMult` | 1.5 | — | 1.2–2 | |
| `CueFactor` | 3.0 | — | 1.5–5 | 已知大致方位后搜索更快 |
| `TrackLossS` | 30 | s | 15–90 | |

### 5.3 通信与请求链

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `HopDelayS` | Squad→Plt 30, Plt→Coy 45, Coy→Bn 90, Bn→Bde 180, Observer 45 | s | ×0.5–2 | 语音电台标准呼叫格式约 20–60 s/跳；营/旅火力协调加审批 |
| `NoRadioMult` | 3.0 | — | 2–5 | 喊话/传令 |
| `DatalinkMult` | 0.4 | — | 0.2–0.7 | 数字化呼叫火力（ATAK 类）显著缩短 |
| `AttachedExtraHopS` | 120 | s | 60–300 | 配属单位的火力协调不熟悉（总纲 §2.2） |
| `AdjustThresholdM` / `AdjustDelayS` / `AdjustTleMult` | 75 / 60 / 0.4 | m / s / — | — | 传统“试射—修正—效力射” |
| `PreRegisteredTleCut` | 0.6 | — | 0.3–0.8 | 守方预先测定诸元（总纲 §9.3①） |
| `AutoLayFactor` | 0.5 | — | 0.3–0.8 | 数字化自动调炮 |
| `LaySkillMult` | `1.5 − 0.5 × effSkill` | — | — | |
| `RequestExpireS` | 120 | s | 60–300 | |
| `EmergencyWindowS` | 120 | s | 60–300 | |
| `RoundsPerTube` | 迫击炮 vs 人员 4 / vs 车辆 6；榴弹炮 vs 人员 2 / vs 车辆 4 / vs 工事 6；火箭炮 = 1 次齐射 | 发/管 | ×0.5–2 | 典型连/排效力射规模 |

### 5.4 命中、毁伤、压制

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `PHitMax` | 0.95 | — | — | |
| `FrontAspectP` | 0.6 | — | 0.4–0.75 | 正面接敌为主 |
| `PenSigmaFrac` / `PenSigmaFloorMm` | 0.08 / 5 | — / mm | 0.05–0.15 | 穿深与装甲离散 |
| `NonPenDamageP` | 0.05 | — | 0.02–0.15 | 观瞄、履带、武器被打坏 |
| `MissSuppFactor` | 0.6 | — | 0.3–0.9 | 近失弹也压制 |
| `SuppWeight` | 2.0 | — | 0.5–5 | 分配评分中压制价值的权重 |
| `MinFireScore` | 0.02 | — | 0.005–0.1 | V1 校准：决定“职能重复”武器多早闲置 |
| `OverkillDecay` | 0.5 | — | 0.3–0.8 | |
| `ThreatWeight` / `ThreatNorm` | 1.0 / 2.0 | — / 价值每分钟 | — | |
| `TargetValue` | MBT 10, IFV 6, APC 4, SoftVehicle 2, 人 1 | — | — | 价值比大致对应造价与战斗力 |
| `CrewServedValueMult` | 2.0 | — | 1–4 | |
| `SuppressionNoFire` / `SaclosBreakSupp` / `PronePinThreshold` | 0.9 / 0.6 / 0.5 | — | — | |
| `SuppFireCut` | 0.8 | — | 0.5–0.9 | |
| `SuppRecoveryPerMin` | 0.35 | /min | 0.2–0.6 | 无持续火力时 2–3 分钟恢复大半 |
| `LeaderlessRecoveryMult` | 0.7 | — | 0.5–0.9 | |
| `BodyArmorStopP` / `BodyArmorFragMult` | 0.25 / 0.8 | — | — | 防弹插板只覆盖躯干 |
| `LightWoundedSkillMult` | 0.7 | — | — | |
| `ScreenRangeM` / `ScreenCut` | 300 / 0.4 | m / — | — | 步兵屏护坦克免受近程反坦克手 |
| `BreakCasualtyFrac` / `BreakSupp` | 0.5 / 0.6 | — | 0.3–0.7 | 小单位一般在减员 30–50% 时失去进攻能力 |
| `SideBreakFrac` | 0.5 | — | 0.3–0.7 | |
| `FortClassThreshold` / `CoveredFortThreshold` | 0.7 / 0.3 | — | — | 与 04 工事等级衔接 |

### 5.5 负重、疲劳、机动

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `BodyMassKg` | 75 | kg | 65–85 | |
| `PersonalKitKg` / `BodyArmorKg` | 14 / 10 | kg | — | 头盔、水、给养、工具；插板式防弹衣约 8–12 kg |
| `LoadFreeRatio` | 0.30 | — | 0.25–0.35 | 负重 ≤ 体重 30% 基本不影响（常见军事人体工程学建议） |
| `LoadSpeedK` / `LoadFatigueK` | 1.2 / 3.0 | — | — | 负重 45% 体重时速度 −18%、疲劳速度 ×1.45 |
| `MaxCarryRatio` | 0.65 | — | 0.5–0.75 | 超过即不能再接手武器 |
| `FatigueRate` | Rest −0.004, Hold 0.0005, Mounted 0.0003, Move 0.002, Assault 0.006, UnderFire 0.003 | /min | ×0.5–2 | 30 分钟负重突击约 +0.25 |
| `BaseFootSpeedMpm` | Open 70, Mixed 60, Forest 40, Urban 25, Mountain 30 | m/min | — | 战斗队形徒步 2–4 km/h |
| `BoundingMult` | 0.5 | — | — | 交替跃进 |
| `BaseVehicleSpeedMpm` (tracked/wheeled) | Open 250/300, Mixed 200/200, Forest 80/50, Urban 100/120, Mountain 60/40 | m/min | — | 战斗队形越野 10–18 km/h |
| `RoadMult` | 1.5 | — | — | |
| `DismountTimeS` / `MountTimeS` | 30 / 45 | s | 15–60 | |
| `DismountRangeM` | Soviet 400, Nato 1000 | m | 200–1500 | 苏式条令 BMP 在 300–400 m 下车；北约在 1000 m 以外 |
| `OverwatchStandoffM` | 300 | m | 100–600 | |
| `VehicleResupplyRangeM` / `ResupplyKgPerMin` | 100 / 20 | m / kg/min | — | |
| `spreadM`（σe） | 步兵 静止 20 / 移动 25；乘车/车辆 0；迫击炮班 15 | m | — | 班散布 50–80 m 正面 |
| `MineVehicleP100` / `MineFootP100` | 0.08 / 0.04 | 每 100 m | 0.02–0.2 | 雷场密度 1 时；V2 校准 |

### 5.6 缓存

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `StrengthGrid` | {1.0, 0.75, 0.5, 0.25} | — | ✅🟡 | 总纲 §9.12(2)“100%、75%、50% 等几档” |
| `CacheSamplesPerCell` | 48 | 场 | 16–128 | 方差偏低，48 足以估均值和 P10/P90；V6 评估成本 |
| `RefRangeM` | Personnel 300, LightArmor 800, HeavyArmor 1500, Fortification 300, Air 1500 | m | — | |
| `RefArmor` | LightArmor front 30/side 15 mm；HeavyArmor front 550 KE / 900 HEAT, side 80/150 mm | mm | — | 参考 BMP-2、T-72B 量级 |

### 5.7 参考武器/弹药数据（纳卡 MVP + 对照；建议文件 `data/equipment/ground_munitions.yaml` 与各型号的 `weapon:` 键）

> 全部 `confidence: estimated`，由公开资料量级估算，**需由 14 的数据任务核对**；按 data/README“不臆造”原则，正式数据文件里无出处的值保持此处的估计标记。

**武器**（命中折线写成 `距离m:概率`）

| id（建议） | 类别 | fireMode | 射程 m | vsVehicle | vsPersonnel | rpm/每事件发数 | aim s | setup s | 重 kg | crew min/full | skillReq |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ak74` | rifle | Direct | 0–500 | — | 100:0.08, 300:0.025, 500:0.008 | 36/3 | 2 | 0 | 3.6 | 1/1 | 0.3 |
| `pkm` | gpmg | Direct | 0–1000 | 300:0.3, 800:0.1 | 300:0.30, 600:0.18, 1000:0.06 | 100/10 | 3 | 5 | 7.5 | 1/2 | 0.4 |
| `rpg7` | reusable_launcher | Direct | 0–500 | 100:0.7, 300:0.35, 500:0.1 | 100:0.3, 300:0.1 | 4/1 | 6 | 0 | 6.3 | 1/2 | 0.5 |
| `ags17` | agl | Direct | 50–1700 | — | 400:0.35, 1000:0.2, 1700:0.08 | 60/5 | 5 | 30 | 31 | 2/3 | 0.5 |
| `konkurs_9m113` | atgm_heavy | Direct | 75–4000 | 500:0.85, 4000:0.75 | 500:0.6, 2000:0.5 | 2/1 | 10 | 60 | 22.5 | 2/3 | 0.6 |
| `kornet_9m133` | atgm_heavy | Direct | 100–5500 | 1000:0.9, 5500:0.8 | 1000:0.7, 4000:0.6 | 2/1 | 8 | 60 | 29 | 2/2 | 0.5 |
| `t72b_2a46` | (车载) | Direct | 0–4000 | 1000:0.75, 2000:0.5, 3000:0.25 | 1000:0.4, 2000:0.2 | 7/1 | 8 | 0 | — | 1/2（炮长+车长） | 0.6 |
| `bmp2_2a42` | (车载) | Direct | 0–2500 | 500:0.6, 1500:0.3, 2500:0.1 | 500:0.4, 1500:0.2 | 60/3 | 4 | 0 | — | 1/1 | 0.5 |
| `m2014_82mm`（2B14） | mortar_medium | HighAngleIndirect | 85–4000 | cep 18 m/km | — | 15/1 | — | 60 | 42 | 3/4 | 0.6 |
| `m120_2b11` | mortar_heavy | HighAngleIndirect | 450–7100 | cep 20 m/km | — | 10/1 | — | 120 | 210 | 4/5 | 0.6 |
| `d30_122mm` | howitzer_light_towed | HighAngle/LowAngle | 1000–15300 | cep 25 m/km | — | 6/1 | — | 300 | 3200 | 5/7 | 0.6 |
| `bm21_grad` | mrl_light | HighAngleIndirect | 1500–20000 | cep 40 m/km | — | 40 管齐射 20 s | — | 180 | — | 3/3 | 0.5 |
| `igla_9k38` | manpads | Direct | 500–5200 | — | — | 1/1 | 10 | 10 | 17 | 1/2 | 0.6 |
| `zu23_2` | aa_gun_towed | Direct | 0–2500 | 1000:0.3 | 1000:0.3 | 200/20 | 4 | 60 | 950 | 2/5 | 0.5 |

**弹药效能矩阵**（每格 `pKillPerHit / lethalAreaM2 / suppPerShot`；“—”= 0）

| 弹药 | pen mm（drop/km） | Exposed | Covered | InBuilding | ReverseSlope | Light/Heavy/Soft 车 | Fort | Heli/Uav（aaPk） | allocValue |
|---|---|---|---|---|---|---|---|---|---|
| 5.45×39 弹（3 发） | 6 (−3) | 0.8/—/0.02 | 0.8/—/0.015 | 0.6/—/0.01 | — | 走 §4.6.3 / Soft pK 0.05 | 0.05/—/0.005 | 0.01 | 1 |
| 7.62×54R 弹（10 发） | 10 (−5) | 0.8/—/0.06 | 0.8/—/0.045 | 0.6/—/0.03 | — | 同上，Soft pK 0.15 | 0.05/—/0.02 | 0.02 | 1.5 |
| PG-7VL（93mm HEAT） | 500 HEAT | 0.5/15/0.15 | —/6/0.12 | —/10/0.12 | — | §4.6.3；面杀伤 Soft 4 | 0.3/—/0.15，fortDmg 0.03 | — | 8 |
| VOG-17（30mm 榴弹，5 发） | — | —/15/0.10 | —/4/0.08 | —/3/0.05 | — | Soft 面 2 | —/0.5/0.05 | — | 3 |
| 9M113M（串联） | 800 HEAT 串联 | 0.4/10/0.15 | —/4/0.12 | 0.5/6/0.12 | — | §4.6.3 | 0.5/—/0.2，fortDmg 0.05 | 0.3（直升机） | 40 |
| 9M133 Kornet（串联） | 1150 HEAT 串联 | 0.5/12/0.15 | —/5/0.12 | 0.6/8/0.12 | — | §4.6.3 | 0.6/—/0.2，fortDmg 0.06 | 0.4（直升机） | 50 |
| 3BM42 APFSDS（125） | 500 KE (−30) | — | — | — | — | §4.6.3 | — | — | 10 |
| 3OF26 HE-FRAG（125） | — | —/250/0.25 | —/60/0.2 | —/80/0.2 | — | Light 面 10 / Heavy 1 / Soft 40 | 0.4/3/0.25，fortDmg 0.05 | — | 6 |
| 3UBR6 AP（30mm，3 发） | 35 KE (−15) | — | — | — | — | §4.6.3 | — | 0.15 | 2 |
| 3UOR6 HE（30mm，3 发） | — | —/20/0.08 | —/5/0.06 | —/5/0.05 | — | Soft 面 3 | —/0.3/0.05 | 0.15 | 2 |
| 82mm HE（O-832） | — | —/180/0.15 | —/30/0.12 | —/50/0.1 | —/90/0.12 | Light 3 / Heavy 0.3 / Soft 15 | —/1/0.12，fortDmg 0.01 | — | 6 |
| 120mm HE（OF-843B） | — | —/550/0.25 | —/90/0.2 | —/150/0.18 | —/280/0.2 | Light 8 / Heavy 1 / Soft 40 | —/3/0.2，fortDmg 0.03 | — | 10 |
| 122mm HE（OF-462，D-30/2S1） | — | —/650/0.3 | —/110/0.25 | —/180/0.2 | —/330/0.25 | Light 10 / Heavy 1.5 / Soft 50 | —/4/0.25，fortDmg 0.04 | — | 12 |
| 122mm Grad 火箭（9M22U） | — | —/600/0.3 | —/100/0.25 | —/160/0.2 | —/300/0.25 | Light 8 / Heavy 1 / Soft 45 | —/3/0.25，fortDmg 0.03 | — | 10 |
| 热压弹 RPO-A / 云爆 | — | —/60/0.3 | —/40/0.3 | 0.7/50/0.3 | — | Soft 面 10 | 0.6/20/0.3，fortDmg 0.08 | — | 15 |
| 巡飞弹战斗部（Harop 级 15–23 kg） | 攻顶 120 HEAT/破片 | —/400/0.3 | —/120/0.25 | —/150/0.2 | —/200/0.25 | 攻顶直接命中走 §4.6.3（topMm） | 0.6/10/0.3，fortDmg 0.1 | — | 200 |
| MAM-L（22 kg 激光制导） | 攻顶 HEAT/爆破 150 | —/300/0.3 | —/90/0.25 | —/120/0.2 | —/150/0.25 | 同上 | 0.6/8/0.3，fortDmg 0.08 | — | 150 |
| 9M39 Igla | — | — | — | — | — | — | — | 直升机 0.45 / Uav 0.35 | 60 |
| 23mm（20 发） | 25 KE (−15) | 0.8/10/0.1 | —/3/0.08 | —/2/0.05 | — | §4.6.3 | — | 直升机 0.2 / Uav 0.1 | 3 |

**装甲**（`ArmorProfile`，mm RHA 等效）

| 车型 | frontKe/Heat | sideKe/Heat | top | ERA bonus | 载员 | pKillGivenPen | catastrophicGivenKill | resist | size |
|---|---|---|---|---|---|---|---|---|---|
| T-72B（1989，Kontakt-1） | 520 / 900 | 80 / 150 | 50 | 300 | 0 | 0.75 | 0.55 | 0.85 | 1.0 |
| T-72A | 400 / 490 | 70 / 90 | 40 | 0 | 0 | 0.75 | 0.55 | 0.85 | 1.0 |
| T-90S | 550 / 950 | 90 / 180 | 50 | 300（K-5 对 KE 另计，C-07） | 0 | 0.7 | 0.45 | 0.85 | 1.0 |
| BMP-2 | 30 / 40 | 16 / 20 | 10 | 0 | 7 | 0.85 | 0.35 | 0.6 | 0.9 |
| BMP-3 | 35 / 50 | 20 / 25 | 12 | 0 | 7 | 0.85 | 0.4 | 0.6 | 0.95 |
| BTR-80 | 10 / 12 | 7 / 8 | 7 | 0 | 7 | 0.85 | 0.3 | 0.5 | 1.0 |
| GAZ/Ural 卡车 | 0 / 0 | 0 / 0 | 0 | 0 | 12–20 | 0.9 | 0.3 | 0.2 | 1.1 |
| 9K33 Osa（9A33） | 7 / 8 | 7 / 8 | 7 | 0 | 0 | 0.9 | 0.5 | 0.4 | 1.1 |

---

## 6. 与其他系统的接口

### 6.1 输入

| 来源 | 数据 | 时机 |
|---|---|---|
| 04 | `CreateEngagement(SectorContext ctx, List<SquadId> sideA, List<SquadId> sideB)`；`ctx` 包含：`battleId, type, x0M, frontageM, contactYAt(x), attackDir, light, visibilityFactor, obstacleDensity, breach, fortificationLevel, knowledgeOfEnemy[2], supportAssets[2], fireSupportSuppression[2], doctrine[2], fidelity` | 阶段 80 |
| 04 | `ForceEnd(EngagementId)`（§4.10，04 E-11）：战斗被判定结束时强制收尾，返回 `EngagementResult` | 任意阶段（通常 140 `BattleEnd`） |
| 04 | `SupportFireBroker` 回填的 `FireSupportRequest.fireAt/impactAt` 与 `ExternalImpactEvent` 列表 | 阶段 100 开始时取本刻落入本片段的事件 |
| 08 | 空袭/CAS/巡飞弹的 `GroundStrikeEvent { timeMs, munitionId, aimElement 或 aimPoint, pHitDirect, cepM, sourceTag }`（04 转交属于本片段的事件） | 阶段 90 产生，阶段 100 插入 |
| 01 | `Squad`、`EquipmentItem`、`EquipmentModel`（含本文件的三个 Profile）、`GetRequestChain()`、`CommandLoad/CommandCapacity`、`SquadTemplate` 中车组专业标记 | 片段创建时 |
| 02 | `Roster`/`PersonnelRecord`（专业、携带物）、`GetSkill(formationId, specialtyId, modelId)` | 片段创建时缓存，片段内不变 |
| 05 | `ExposureLevel`（双方对敌方连）、`ExposureAccuracyFactor(level, ageMs)`、`SensorProfile`（需要字段：`opticsClassDay`, `opticsClassNight`，枚举 `OpticsClass` 见 §4.2.2——C-08）、`SignatureProfile.engagementSigMult` | 片段创建时 |
| 06 | `SquadCarriedState` 的当前值，经 `GetAvailable(SquadId, ItemKey)` 读取，用于初始化 `EngagementAmmoCache`（§3.3）；`GetFatigueFloor(SquadId)` | 片段创建时 |
| 07 | `RollVehicleDamage()`、`ApplyCasualty()`、`ApplyVehicleDamage()`、`CrossTrainFactor()`、`PlatoonReorgInCombat()` | 片段内调用 |
| 09 | 本刻号、`FidelityTier`、`LightLevel`（按太阳高度：> 0° Day，−6°…0° Twilight，< −6° Night） | 每刻 |
| 15 | `Pcg32`、`For()`、`NextGaussian()`、`DMath` | — |

### 6.2 输出

| 去向 | 数据 | 时机 |
|---|---|---|
| 04 | `EngagementResult { engagementId, outcome, seizedDepthM, durationMin, perSquad 状态摘要, droppedItems[], lossLedger[], requestStats, threatRecords }` | 片段结束那一刻（阶段 100 末），04 在阶段 140/下一条带步处理 |
| 04 | 新的 `FireSupportRequest`（缓冲） | 阶段 100 末统一提交 |
| 04 | 片段已结束时仍在飞的落点：交回 04 在条带上结算 | 落点所在刻 |
| 07 | `ApplyCasualty(personId, CasualtyState, time, LossSource)`、`ApplyVehicleDamage(itemId, DamageLevel, flags, time, LossSource, stripPos)` | 事件发生即时 |
| 02 | 实战经验（参战人员按专业的“交战分钟数”），02 定义练度增长 | 片段结束 |
| 05 | `ReconContribution`：片段内对敌方元素航迹覆盖率 → 05 的 `GroundRecon` 贡献；开火/电台使用 → 特征值事件 | 片段结束（以及每 10 分钟汇总一次） |
| 06 | 弹药消耗：按 §3.3 `EngagementAmmoCache` 求差后调 `TryConsume(SquadId, ItemKey, qty, out got)` + `ReportConsumption(battalion, ItemKey, qty)`；燃油消耗（车辆移动距离 × 06 的油耗）同样走 `TryConsume` | 片段结束 |
| 13/15 | `BattleEventLog` 事件（`Full` 精度）：发现、开火、命中、伤亡、下车、请求时间戳 | 每刻阶段 150 |
| 12 | `OutcomeCache` 读取接口 `Query(key, so, se) → (mean, var)` | 任意时刻（只读） |

**LossSource 标签**（与 04 AAR 共用）：`{ BattleLine line; string sourceModelId; MunitionKind kind; SpatialElementId shooter; bool friendlyFire }`；片段内默认 `line = DirectFire`；地雷 `Breaching`；04 注入的纵深打击事件保留其原始标签（`DeepStrike` 或 `CounterBattery`）。

### 6.3 RNG salt 表（`RngDomain.SquadSim` / `Cache`）

| salt | 值 | 用途 | entityKey |
|---|---|---|---|
| `SaltLosPair` | 1 | 视线配对稳定数（再异或格子组合） | `Mix(minId) ^ maxId` |
| `SaltDetect` | 2 | 发现时刻 | `Mix(observerId) ^ targetId` |
| `SaltShot` | 3 | 一次射击的全部抽样（命中、方位、击穿、损伤、受害者、伤情） | `Mix(itemId) ^ shotSeq` |
| `SaltAreaRound` | 4 | 一发间瞄/面杀伤弹的落点与逐人抽样 | `Mix(fireUnitOrRequestId) ^ roundSeq` |
| `SaltMine` | 5 | 触雷 | `Mix(elementId) ^ stepIndex` |
| `SaltMicroCover` | 6 | 片段格子微地形 | `engagementId` |
| `SaltExternal` | 7 | 外部事件命中/伤亡 | `Mix(eventSourceId) ^ seq` |
| `SaltCacheGen` | 100 + sampleIdx | 缓存生成（`RngDomain.Cache`，tick = 0） | `Mix(keyHash) ^ cellIdx` |
| `SaltCacheSample` | 8 | 缓存抽样与落到名册（`Cache` 域） | `engagementId` |
| `SaltResilience` | 9 | 能力衰减曲线（`Cache` 域） | `templateHash` |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 片段一方开始时 0 个可战斗元素 | 04 不应生成；若发生，`CreateEngagement` 立即以 `DefenderWithdrew`/`AttackerRepulsed` 结束，0 步 |
| `crewFull == crewMin` | `CrewRateFactor` 分母为 1，恒为 1 |
| λ = 0（无视线、超出观察距离、Sig=0） | 不抽样、不入队（避免除零 `ln/λ`） |
| `ThreatRateTo = 0` | `windowS = +∞`（不是 Emergency） |
| 两个事件同一毫秒 | 按 00 §6.4-5 全序键：外部事件先于片段内；再按源实体 id、序号 |
| 互相同时开火（同毫秒） | 都执行（双方都在作废检查之前出膛），命中按各自 `ImpactEvent` 时刻；“同归于尽”允许 |
| 目标在弹丸飞行途中被别的弹打掉 | `ImpactEvent` 处理时 `!Alive(target)` → 浪费，弹药已扣 |
| 半主动导弹飞行中射手被压制/阵亡 | 失的（§4.4），仍施加近失压制 |
| 落点与本方元素同槽位近距 | 误伤照常计算，`friendlyFire = true`，计入 AAR |
| 片段结束时仍有飞行中的弹 | 交给 04 在条带上结算（§6.2） |
| 曲射武器 `rangeMinM` 大于目标距离 | 不能打；该请求不分配给它（04 broker 过滤） |
| 名册里没有任何对口专业的人 | 用跨专业人员（§4.8.3），练度乘 `CrossTrainFactor` |
| 下车时车辆被毁 | 下车中的乘员按“车内”结算；幸存者成为 `Infantry` 元素 |
| 车辆元素无车组但车完好 | 车辆失去战斗力（`IdleReason.Suppressed/NoCrew`），可被同班其他车组专业人员接手（重分配） |
| `CombatStrength` 参考值为 0（如纯迫击炮连） | 该分量从加权中去掉，权重按剩余分量归一 |
| 缓存 mean = 0 而样本 > 0 | 不做比例缩放，用双线性均值 |
| 实际强度 > 1.0 或 < 0.25 | 钳到网格端点后外推不做；> 1 用 1.0 格并对“敌方造成伤亡”× (1/so)^0.5 修正（上限 1.5） |
| 夜间无任何夜视器材的一方 | 发现距离 150 m，结果自然是夜间伏击极其有利——符合预期 |
| 同一班的两个元素（车 + 下车步兵）一个崩溃 | 各自判定；写回时合并到同一 `Squad` |

---

## 8. 测试用例

> 除注明外，练度 = skillReq，白天，开阔地，无掩体，`s = 0`，`fatigue = 0`。

**T1 命中概率插值**：`pkm` 对暴露步兵班，r = 450 m。折线 300:0.30、600:0.18 → `0.30 + (450−300)/(300) × (0.18−0.30) = 0.24`。射手 s = 0.5 → × (1 − 0.35) = 0.156；目标 `PersonnelCovered`（× 0.5）→ **0.078**。

**T2 击穿概率**：Kornet（1150 HEAT 串联）打 T-72B 正面：armor = 900（串联不加 ERA）。`σ = 0.08×900+5 = 77`；`P_pen = 1/(1+exp(−250/77)) = 1/(1+e^−3.247) = 0.9626`。同一目标被 PG-7VL（500 单级 HEAT）打正面：armor = 900+300 = 1200，`σ = 101`，`P_pen = 1/(1+exp(700/101)) ≈ 0.00098`；打侧面：armor = 150+300 = 450，`σ = 41`，`P_pen = 1/(1+exp(−50/41)) = 0.772`。→ RPG 只能打侧面，这一结论应该显现在 AAR 里。

**T3 面杀伤闭式解**：122mm HE 对暴露步兵（`lethalAreaM2 = 650` → `Rc² = 206.9`），σe = 20 m（`2σe² = 800`），落点偏移 d = 30 m（d² = 900）：`p = 206.9/1006.9 × exp(−900/1006.9) = 0.2055 × 0.4091 = 0.0841`；9 人班期望伤亡 0.757 人。同一发打 `PersonnelCovered`（`110` → `Rc² = 35.0`）：`p = 35.0/835.0 × exp(−900/835.0) = 0.0419 × 0.3404 = 0.01427`，期望 0.128 人——掩体把伤亡降到约 1/6。

**T4 请求链响应时间**：步兵班（有电台，无数据链）请求营属 120mm 迫击炮（同营）：路径 班→排→连→营：`30 + 45 + 90 = 165 s`（CommandMult = 1）；队列空；炮已展开：`layTimeS = 60`（手动调炮，练度 = 要求 → LaySkillMult 1.0 × 若 effSkill=0.6 则 1.5−0.3=1.2 → 72 s）；距离 3000 m，`speedMps = 250` → 飞行 12 s。总计 `165 + 72 + 12 = 249 s ≈ 4.15 min`。同一请求若班里有前观员（一跳 45 s）：`45 + 72 + 12 = 129 s`。若是连属 60mm 迫击炮（片段内建制，班→排→迫击炮班 30+45）：`75 + 0.6×72(假设 layTime 36 s) …` → 体现“放得越低越快”。

**T5 射击循环与压制**：`ak74`，`rof 36, roundsPerShot 3` → 循环 5 s（每分钟 12 次射击事件）；满员 `CrewRateFactor = 1`；射手 s = 0.5 → `5 / (1 − 0.4) = 8.33 s`，每分钟约 7 次。s = 0.9 → 不射击。

**T6 发现时刻**：`VehicleDayOptics` 昼，观察者看 r = 2000 m 的移动 MBT：`λ = 0.05 × 1.5 × (1.0 × 1.5) × (1 − (2000/3000)²) = 0.1125 × 0.5556 = 0.0625 /s`；`P(60 s 内) = 1 − e^−3.75 = 0.9765`；`u' = 0.5` → `tDet = t0 + ln2/0.0625 = t0 + 11.09 s`。同一观察者看 500 m 外静止隐蔽（Good）步兵班：`λ = 0.05 × 1.5 × 0.06 × (1 − 0.0278) = 0.004375`，`P = 1 − e^−0.2625 = 0.231`。

**T7 纵深带门槛**：A 方步兵元素在 y = −1050（Far 带边缘，与守方最近元素 1050 m），欲前进 70 m 进入 Medium 带；覆盖它的两个守方元素 s = 0.3、0.5 → 均值 0.4 < 0.5 → 截断在 −1000 m 处（不跨入 Medium），`stallCounter` 不增加（本步有前进 50 m）。若均值 0.6 → 可前进到 −980。

**T8 乘员重分配**：9 人机步班（班长、机枪手、副射手、RPG 射手、副射手、4 步枪手），装备 PKM、RPG-7、4×AK-74、班长 AK。阵亡 3 人：机枪手、RPG 射手、1 步枪手。重分配：PKM（优先级 9）→ 副射手（对口 `assistant_gunner`？否；`mg_gunner` 无 → 同 school `infantry` 的副射手）1 人 + 步枪手 1 人（crewFull 2）；RPG（7）→ RPG 副射手 1 人；剩 1 步枪手 + 班长持步枪。结果：PKM 满员、RPG 1 人可用（crewMin 1），步枪 2 支开火。若再阵亡 2 人（RPG 副射手、PKM 副射手）：PKM 1 人（crewMin 1，`CrewRateFactor = 0.5`），RPG 无人 → 移动时由剩余人携带（PKM 7.5 + RPG 6.3 + 弹药，检查 `MaxCarryRatio`）。

**T9 缓存插值**：键命中；实际 (so, se) = (0.85, 0.6)。我方伤亡比例格点均值：(1.0,0.75)=0.12，(1.0,0.5)=0.08，(0.75,0.75)=0.18，(0.75,0.5)=0.11。双线性：沿 so：wso = (0.85−0.75)/0.25 = 0.4；沿 se：wse = (0.6−0.5)/0.25 = 0.4。`m = (1−.4)(1−.4)×0.11 + (1−.4)(.4)×0.18 + (.4)(1−.4)×0.08 + (.4)(.4)×0.12 = 0.0396 + 0.0432 + 0.0192 + 0.0192 = 0.1212`。最近格点 (0.75, 0.5)（距离 0.1,0.1 vs (1.0,0.5) 的 0.15,0.1）；样本值 0.15，该格均值 0.11 → `q = 0.15 × 0.1212 / 0.11 = 0.1653`。敌方弹药 0.15 → AmmoMod 0.5 → 最终 **0.0826**；每人 Bernoulli(0.0826)。

**T10 确定性**：同一 `worldSeed`、同一初始状态，运行同一片段两次，`BattleEventLog` 的哈希必须逐位相同；把 `elements` 列表的内存顺序打乱（仍按 id 排序遍历）结果不变；并行执行两个不同片段与串行执行的结果相同。

**T11 闲置原因**：ATGM 班在 r = 600 m 有一个暴露步兵班航迹（score 0.073 ≥ 0.02 → 会开火，不闲置）；把 `MinFireScore` 设为 0.1 → 闲置 `NoSuitableTarget`。敌坦克在 4500 m（Konkurs 射程 4000）且被跟踪 → `OutOfRange`。

---

## 9. 验证建议（对应计划 V1、V2、V5、V6）

所有脚本放在 `tools/validation/`，用 Python 3 + numpy（V6 加 numba），**实现本文件 §4 的同一套公式与常数**（从 `data/tuning/03_squad_combat.yaml` 读），以便验证结论直接对 C# 实现有效。每个脚本输出 CSV + 一页 markdown 结论。

### V1 配属规律是否自然涌现（本文件的核心验证）

`v1_echelon.py`：班级蒙特卡洛，每个配置 ≥ 300 场（方差偏低，300 场足以区分 5% 差异），地形 × {Open, Mixed, Forest, Urban, Mountain}，类型 × {AttackPosition（我方守）, Meeting}。

| 实验 | 固定 | 变量 | 期望涌现的规律（通过标准） |
|---|---|---|---|
| V1-a 反坦克导弹配属 | 我方机步营总共 9 具 ATGM；对手：T-72B + BMP-2 加强连进攻 | ATGM 放在 ① 每班 1 具；② 每连 1 个 3 具的排；③ 营属 9 具反坦克连（走请求链+排队，同时服务 3 个连的 3 个同时片段） | Open/Mountain：② 或 ③ 的敌装甲击毁数 ≥ ① 的 1.1 倍（集中、远距、发现早）；Urban/Forest：① ≥ ②（视距短，射程浪费，响应快更重要）。若 ① 在 Open 也最好 → 检查 `LosScaleM` 与请求链延迟 |
| V1-b 迫击炮层级 | 同等弹药重量 | 60mm 在连 / 82mm 在营 / 120mm 在营或旅 | 连属轻迫响应时间中位数 < 营属的 50%；营属重迫对 `Fortification` 的效能 > 2 倍；在“敌短时暴露”场景轻迫胜出，在“敌固守”场景重迫胜出 |
| V1-c 射程 ≈ 本级纵深 1–2 倍 | 统计每件武器射击距离分布 | 武器 × 层级 | 有效射击（造成杀伤或压制）的距离 P90 落在 `EchelonDepth[level]` 的 0.5–2 倍内（`EchelonDepth`：班 300 m、排 600 m、连 1500 m、营 4000 m、旅 15–25 km，见 §11）；把 Kornet 放在班，P90 射击距离应远小于其 5500 m 射程（射程白费） |
| V1-d 班用武器负重 ≈ 15 kg | 9 人徒步班，山地/森林 | 每名班组武器手负重从 8 kg 加到 30 kg（加武器或弹药） | “单位负重的效能边际”在 12–18 kg 区间出现拐点；超过拐点后疲劳导致命中与推进下降，净效能不升反降 |
| V1-e 真实编制合理性 | 美/俄/解放军式连模板（data/templates） | 对每个模板做 200 个随机扰动（同重量、同人数、同造价预算内移动武器层级） | 真实模板位于扰动集合效能分布的前 25%；若低于中位数，报告是哪项机制让它吃亏 |
| V1-f 职能重复 | 班里同时放 RPG 与无后坐力炮 | 有/无第二种 | 第二种武器的 `NoSuitableTarget` 闲置份额 > 60%，边际效能 < 5%（总纲 §9.11(3) 的警告应当名副其实） |

输出“最优层级 vs 现实层级”对照表；任何一项不通过，在报告中写出最可能的参数（按敏感度排序，Sobol 一阶指数）。

### V2 纳卡 2020 能否大致复现（本文件提供片段层）

本文件为 V2（主体在 04）提供：`OutcomeCache` 的 Python 版生成（地形 `Mountain`、`Mixed`；编成 T-72A/B、BMP-2、Konkurs/Kornet、D-30、BM-21、2B14、ZU-23-2、Osa；双方练度不同），以及“外部攻顶弹”对片段的影响曲线：片段开始前/中注入 N 次 MAM-L/巡飞弹打击（N = 0…6），检查守方片段胜率随 N 下降、且损失中装甲车辆比例上升。通过标准见 04 §9。

### V5 无敌打法搜索

`v5_dominance.py`：在 V1 的片段 harness 上做 CMA-ES / 随机搜索（预算 2000 个连编成，每个 64 场），约束 = 同一人数（±5%）、同一采购预算、同一负重上限。

- 对手池：8 个参考连（美、俄、解放军、纳卡双方各型）× 5 地形 × 2 类型。
- **失败判据**（任一即判模型有漏洞）：① 某编成对对手池全部组合的胜率 > 90%；② 某武器的“每百万美元 CapIndex”在所有目标类别都超过次优者 3 倍；③ 退化编成胜出：纯坦克（无步兵）在 Urban 胜率 > 50%，纯 ATGM、纯迫击炮、纯步兵、纯无人机观察者 + 间瞄中任何一种在所有地形都胜出；④ “先压制才推进”被绕过：A 方在 B 方平均 s < 0.2 时夺取阵地的比例 > 10%。
- 输出帕累托前沿（造价 × 人数 × 胜率）与“石头剪刀布”关系矩阵（应当存在循环克制）。

### V6 计算性能

`v6_bench.py`（numpy + numba）：
- 微基准：一个片段 50 vs 50 元素、60 步、平均每元素 4 件武器；测量每步耗时、事件队列吞吐、视线/发现配对数（期望 ≈ 2500 对/步，空间剪枝后 ≤ 40%）。
- 外推：每条边 10 个并发片段 × 60 步/小时；目标“单核每条边每游戏小时 ≤ 0.3 s”（总纲 §9.3④），外推系数：numba → C# 取 1.0–2.0 倍。
- 缓存成本：一个键 16 格 × 48 场 = 768 场；测单键生成时间，目标 ≤ 30 s 单核（玩家改模板后后台可在几分钟内补齐常用组合）。
- 报告：若超标，按耗时占比列出前 3 热点（预计：发现配对、视线哈希、事件队列）并给出降阶方案（发现改为每 2 步、视线按格子对缓存）。

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| C-01 | 片段内几何 | 连续 y + 离散槽位（250 m）+ 100 m 格子；`DepthBand` 是“距离分档”而非固定格子 | 既能体现推进距离，又保留总纲“槽位 × 纵深带”的离散门槛 | 纯离散 3 档纵深带（推进只有 3 级，太粗） |
| C-02 | `FireMode` 新增 `Loitering = 4` | 采用 | 巡飞弹/FPV 不需射手视线、攻顶、可被拦截，和三种射击方式都不同；纳卡 2020 核心 | 当作 `HighAngleIndirect` + 攻顶标志 |
| C-03 | `TargetClass` 新增 `SoftVehicle = 10` | 采用 | 卡车、无防护车辆被机枪/破片毁伤，归入 LightArmor 会让轻武器对卡车无效 | 归入 `LightArmor` 并给 0 mm 装甲 |
| C-04 | 视线模型 | 指数视距概率 + 配对稳定随机数（不逐步重抽） | 计算便宜、确定、不会闪烁；总纲允许“概率模型” | 条带格子精确射线（阶段 2 有真实 DEM 时再考虑） |
| C-05 | 士气 | 不设独立士气变量；用“伤亡 + 压制 + 班长在否”导出崩溃 | 少一个看不见的数；玩家能从“压制”“伤亡”两个可见数读懂；凝聚力阶段 1 不做 | 加 `morale` 连续量 |
| C-06 | 闲置原因“无人操作” | 统计中细分 `NoCrew`，界面并入“被压制/失能” | 区分“人被打光”与“被压住”对编制决策有意义 | 只用总纲六类 |
| C-07 | 装甲模型粒度 | 正面/侧面/顶部 × KE/HEAT 六个数 + 单一 ERA 加成 | Wargame 式透明；够表达 T-72 被 RPG 侧射、被攻顶弹打顶 | 分炮塔/车体；K-5 对 KE 单独加成 |
| C-08 | 观瞄器材字段 | 由 05 的 `SensorProfile` 提供 `opticsClassDay/Night`（`OpticsClass` 枚举由 03 定义） | 05 归属 SensorProfile；片段只需等级 | 03 自定义 `ObservationProfile` |
| C-09 | 步内重选目标 | 步首分配；目标失效时在下一次开火时刻重选 | 符合总纲“分配按步、开火按时刻” | 每次开火都重选（更准，开销大） |
| C-10 | 片段内条令 AI | 双方对称的固定规则（下车线、门槛、烟幕）；`DismountRangeM` 等少数参数按国家条令 | 总纲 §20.1：战术 AI 只需稳定、合理、符合条令 | 效用 AI |
| C-11 | 缓存网格与样本数 | 4×4 强度格 × 48 样本，键不含损失 | 总纲 §9.12(2)；插值 + 比例修正 | 3×3 格；或把能力向量分量逐一离散化（组合爆炸） |
| C-12 | 缓存生成的随机种子与世界时刻无关 | 采用 | 保证“后台是否算完”不影响结果（00 G-21） | 用世界种子派生（会使不同存档的缓存不可共享） |
| C-13 | 轻伤员留在片段内继续战斗 | 采用（练度 ×0.7，速度 ×0.8） | 现实中轻伤者多数继续战斗；也让“轻伤”与“重伤”在片段里有区别 | 轻伤即退出 |
| C-14 | 片段内建制迫击炮不经 broker | 采用 | 建制内立即响应是“放得低就快”的体现 | 所有间瞄统一走 broker |
| C-15 | 误伤 | 面杀伤对本方邻近元素生效 | 拟真且给“近距离呼叫炮火”的风险一个可见代价 | 不计误伤 |
| C-16 | `MinFireScore` 等分配阈值 | 先用 0.02，由 V1 校准 | 直接决定职能重复武器何时闲置 | — |
| C-17 | 车内人员伤亡表 | 采用 §4.6.3 的估计表，V2 复核 | 公开统计不足，需验证 | 按车型给不同表 |
| C-18 | 新增装备类别 `loitering_munition`、`fpv_drone`、`body_armor`（01 的 schema） | 建议 01 增加 | 现有 categories.yaml 无巡飞弹/FPV/防弹衣，纳卡与俄乌都需要 | 巡飞弹作为 `uav_*` 子类 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 片段格子 | `EngagementCell` | 片段内 槽位 × 100 m 行 的地形格，带微地形、视距尺度、反斜面标记、雷障与烟幕 | 03 |
| 片段方 | `EngagementSide` | 枚举 `A`（片段内进攻方）/ `B`；与战斗的进攻方不一定相同（反冲击） | 03 |
| 片段结局 | `EngagementOutcome` | 枚举：`AttackerSeized, DefenderHeld, AttackerRepulsed, DefenderWithdrew, Stalemate, MutualBreak` | 03 |
| 片段结果 | `EngagementResult` | 片段结束时交给 04 的结果包 | 03 |
| 元素类型 | `ElementKind` | `Infantry, Vehicle, MountedSquad, IndirectFireSection, Uav` | 03 |
| 元素命令 | `ElementOrder` | `Hold, Advance, Assault, Overwatch, Withdraw, Mount` | 03 |
| 弹种 | `MunitionKind` | 弹药物理类型枚举（`Bullet … Mine`） | 03 |
| 效能行 | `EffectRow` | 弹药对某目标类别的 `pKillPerHit / lethalAreaM2 / suppPerShot` | 03 |
| 观瞄等级 | `OpticsClass` | `NakedEye, Binocular, NightVision, VehicleDayOptics, ThermalGen1, ThermalGen2, UavCamera` | 03（05 的 SensorProfile 引用） |
| 光照 | `LightLevel` | `Day, Twilight, Night` | 03 |
| 班战斗状态 | `SquadCombatState` | 跨片段持久的压制、疲劳、战斗力标志（组件） | 03 |
| 片段弹药缓存 | `EngagementAmmoCache` | 片段内班的随身/车载弹药缓存；持久存储是 06 的 `SquadCarriedState` | 03 |
| 单兵负重状态 | `PersonLoadState` | 单兵负重（组件） | 03 |
| 武器运行态 | `WeaponRuntime` | 片段内每件武器的操作者、目标、下次可射时刻 | 03 |
| 威胁记录 | `ThreatRecord` | 威胁从发现到被处理的时间与等待期间损失 | 03 |
| 武器统计 | `WeaponStats` | 开火、杀伤、压制、闲置秒数 | 03 |
| 战斗力 | `CombatStrength` | 能力向量加权得到的 [0,1+] 标量；片段结束判据与缓存网格坐标 | 03 |
| 缓存键 / 样本 | `OutcomeKey` / `OutcomeSample` / `OutcomeCacheEntry` | 结果分布缓存的键与条目 | 03 |
| 标准地形类 | `TerrainClassPg` | 试验场与缓存的 5 类标准地形：`Open, Mixed, Forest, Urban, Mountain` | 03 |
| 损失来源 | `LossSource` | 伤亡/损伤的归因标签（阶段线、来源型号、弹种、射手、误伤） | 03（04、07 共用） |
| 本级负责纵深（取值） | `EchelonDepth` 表 | 班 300 m、排 600 m、连 1500 m、营 4000 m、旅 20 km（V1-c 与编辑器提示用）🟡 | 03 |
| 请求优先级 | `RequestPriority` | `Emergency, Immediate, Normal` | 03 |
| 扇区上下文 | `SectorContext` | 04 生成片段时传入的全部初始条件 | 03（类型）/ 04（填写） |
