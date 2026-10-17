# 07 损伤、回收、修复、医疗、补充与重组

> 依据：总纲 §6（型号多样性的代价：备件、拆东补西）、§9.12（战后损伤、修复与补充，全部小节）、§9.3③（伤员分类进入补充系统）、§3.3（分配策略、替代装备）、§11.1.1（脱离接触与遗弃）、§15.3（不四舍五入的原则）；术语表 [00](00_glossary.md)。
> 本文件定义：`CasualtyState` 的转移规则、`VehicleDamageState`（损伤分类）、战场控制与回收、野战修理与后方大修 `RepairQueue`、医疗链 `MedicalQueue`、`FillRate`、`UnassignedPool`、`Reorganization`（三级范围）与 `ReorgPolicy`、`ReplacementMode` 与补充流程、`ReliabilityProfile`（故障、备件）、`Cannibalization`、缴获。
> **谁被打中、打成什么等级**由 [03](03_squad_combat.md)（片段内）和 [04](04_strip_layer.md)（条带上）决定，它们调用本文件的 `RollVehicleDamage` / `ApplyCasualty` / `ApplyVehicleDamage`；**之后怎么恢复**由本文件决定。
> 标记：✅ 总纲已定；🟡 建议待确认（编号 `H-xx`，汇总在第 10 节）。

---

## 1. 目标与范围

**解决的问题**（总纲 §9.12 原则）：损失不是“兵力 −30%”，而是分门别类进入几条恢复流程；每条流程的快慢由编制里的保障单位（抢救车、维修分队、卫生员、医疗分队）和战略层资源（备件、训练产能、仓库装备、预算）决定。并且：

1. **保留真实的缺编状态**：每个人、每件装备、每个班的真实状态都保留；模板只是“目标”，用来算补充需求和作为重组目标。**任何环节都不四舍五入**（✅ 总纲 §9.12(2)）。
2. **人和装备总数守恒**：重组只搬动，不凭空增减。
3. **谁控制战场谁回收**：撤退的代价大于伤亡数字（遗弃、被俘、被缴获）。

| 阶段 | 包含 | 不包含 |
|---|---|---|
| 阶段 0 | 损伤分类表；片段内排内重组；休整时连/营内重组（试验场连续多场对战时生效）；满编率；能力衰减；车内乘员转移；故障（可关） | 补充（试验场每场重置）；后方大修；医疗链时间（试验场只统计伤情分布） |
| 阶段 1 | 全部：回收、野战修理、后方大修队列、医疗链、补充（单兵/整建制轮换）、备件与拆东补西、遗弃与缴获、包围歼灭后的失踪/被俘 | 战俘交换（H-14）；凝聚力（总纲 §9.12(5) 可选，阶段 1 不做）；缴获装备编入部队（可选，H-12，默认关） |
| 阶段 2+ | 预留：封存基地启封的备件掏空（06 §3.11）、缴获装备大规模使用、心理减员 | — |

---

## 2. 玩家能做什么、看到什么

**决策清单**（全部是“配置”，不微操）

| 决策 | 在哪设 | 本文件里的效果 |
|---|---|---|
| 编制里放多少抢救车、维修分队、卫生员、医疗连、装甲救护车 | 编制编辑器（01） | 回收速度与回收时被打的风险、修理吞吐、重伤员救活率、轻伤归队速度（§4.2–§4.5） |
| **重组策略** `ReorgPolicy`：保持建制 / 集中成完整单位 | 每旅（或全军统一） | 休整时的重组算法（§4.6.2） |
| **补充方式** `ReplacementMode`：单兵补充 / 整建制轮换 | 每旅（或全军统一） | §4.7 |
| 装备分配策略 `AllocationPolicy`（平均 / 优先整编 / 一线优先） | 01（全军或编组） | 补充装备和补充兵员的分配顺序（§4.7.2） |
| 🟡 是否允许拆东补西 | 每旅（H-08，默认允许） | 缺备件时用受损同型车的零件（§4.8.3） |
| 合并残缺的营/连、撤编、骨干转预备役 | 营/旅的行政命令（H-11） | §4.6.3 |
| 🟡 是否使用缴获装备 | 全军（H-12，默认关） | §4.9 |
| 备件储备、维修预算（O&M） | 11 预算、06 储备目标 | 备件库存、故障率（§4.8） |

**反馈清单**（数字全部来自本文件的状态；13 呈现）

| 反馈 | 数据 |
|---|---|
| 从旅点到营、连、排、班：每个班剩什么人、什么装备、什么状态 | 名册（02）+ `VehicleDamageState` + `PersonCasualtyState` |
| 每级满编率：人员、各专业、各装备类别、**各项能力**（“反装甲能力 40%”） | `FillRateReport`（§4.6.4） |
| 损失按“永久损失 / 可修复 / 已修复 / 遗弃 / 被俘”拆分 | `LossStatusSummary`（§4.10） |
| 修理队列：每件装备在哪一级修、还要几小时、是否在等备件（“等备件”单独标红） | `RepairQueue` 视图 |
| 医疗：后送中、救治中、预计 N 天后归队 X 人；重伤员救活率（本次战斗 vs 理论上限） | `MedicalQueue` 视图 |
| 补充需求清单：需要的兵员（按专业）、装备（按型号）、预计采购预算 | `ReplacementNeeds`（§4.7.1） |
| 待编池：凑不成班的人和装备 | `UnassignedPool` |
| 战后报告的结论句（模板见 §4.10） | 汇总 |

---

## 3. 数据结构

命名空间 `MoD.Sim.Sustain`。ID 强类型（00 §2.2）。

### 3.1 枚举

```csharp
public enum CasualtyState : int {          // 00 §1.2；本文件定义转移规则
    Healthy = 0, LightWounded = 1, SeverelyWounded = 2, Killed = 3, MissingOrCaptured = 4
}
public enum MedicalStage : int {
    None = 0, WithUnit = 1,          // 轻伤，仍在片段中战斗（03 C-13）
    AwaitingEvac = 2, Evacuating = 3, Role1 = 4 /*营救护所*/, Role2 = 5 /*旅卫生连*/,
    Hospital = 6, ReturnedToDuty = 7, Discharged = 8, Dead = 9
}
public enum DamageLevel : int {
    Operational = 0, FieldRepairable = 1, DepotRepair = 2, Destroyed = 3, Abandoned = 4, Captured = 5
}
[Flags] public enum DamageFlags : int {
    None = 0, Mobility = 1, Firepower = 2, Sensor = 4, Catastrophic = 8, Mine = 16, Breakdown = 32, Cannibalized = 64
}
public enum DamageCause : int { None = 0, Combat = 1, Mine = 2, Interdiction = 3, Breakdown = 4, Strike = 5, Scuttled = 6 }
public enum MunitionGroup : int { Kinetic = 1, ShapedCharge = 2, TopAttack = 3, HeBlast = 4, Mine = 5, Interdiction = 6 }
public enum RecoveryState : int { None = 0, NeedsRecovery = 1, BeingRecovered = 2, AtTrains = 3,
                                  InFieldRepair = 4, AwaitingParts = 5, InTransitToDepot = 6, AtDepot = 7 }
public enum ReorgPolicy : int { KeepStructure = 1, Consolidate = 2 }   // 01 的 CountryOrgSettings.fillMode 也使用本枚举
public enum ReplacementMode : int { Individual = 1, UnitRotation = 2 }
public enum ReorgScope : int { Platoon = 1, CompanyBattalion = 2, InterBattalion = 3 }
public enum RotationPhase : int { None = 0, Requested = 1, Withdrawing = 2, Refitting = 3, Retraining = 4 }
public enum RecoveryClass : int { None = 0, HeavyTracked = 1, MediumTracked = 2, Wheeled = 3, Towed = 4, ManPortable = 5 }
// Aspect（03 §3.1）：命中方向，RollVehicleDamage 使用，本文件不重复定义
```

`MunitionGroup` 由 03 的 `MunitionKind` 映射，函数 `MunitionGroup MunitionGroupOf(MunitionKind kind, MunitionProfile prof)`（按以下顺序取第一个匹配）：`Smoke` → 不造成损伤（不调用 `RollVehicleDamage`）；`isTopAttack == true`（巡飞弹、MAM-L、攻顶导弹）或 `LoiteringWarhead` → `TopAttack`；`Apfsds/CannonAp/Bullet → Kinetic`；`Heat/TandemHeat/AtgmSaclos/AtgmFireForget → ShapedCharge`；`RocketHe` → `prof.penetrationMm > 0 ? ShapedCharge : HeBlast`；`MortarHe/ArtilleryHe/CannonHe/Grenade/Thermobaric/GuidedHe/Manpads → HeBlast`；`Mine → Mine`。06 的车队拦截没有对应的 `MunitionKind`，直接传 `MunitionGroup.Interdiction`（见 §4.1.2 的重载）。

### 3.2 组件

```csharp
public sealed class PersonCasualtyState {        // 键 PersonnelId（02 的人员）；Healthy 且从未受伤的人不建
    public PersonnelId personId;
    public CasualtyState state;                  // 镜像；唯一真值是 02 PersonnelRecord.casualty，ApplyCasualty 同时写两处
    public MedicalStage stage;
    public SimTime woundedAt;
    public LossSource source;                    // 03 定义的归因标签
    public SquadId originalSquad;                // 受伤时所在班（归队目标）
    public OrgUnitId originalBattalion;
    public double medicCoverageAtWound;          // [0,1] 受伤时所在连的卫生员覆盖（§4.5.2）
    public Vec2D woundPosM;  public EdgeBattleId battleId;   // 战斗中受伤的位置（战斗坐标）；0 = 不在战斗
    public SimTime stageUntil;                   // 当前阶段的结束时刻（Role1/Hospital 的归队时刻、后送到达时刻）
    public bool willReturn;                      // Hospital 阶段抽定：是否最终归队
}

public sealed class VehicleDamageState {         // 键 EquipmentItemId；00：归 07。用于所有车辆与“班组武器以上”的装备；
    public EquipmentItemId itemId;               //   轻武器只使用 Operational/Destroyed/Abandoned/Captured 四个值
    public DamageLevel level;
    public DamageFlags flags;
    public DamageCause cause;
    public SimTime damagedAt;
    public double workRemainingH;                // 剩余修理工时（工时 = 1 名标准维修兵 1 小时）
    public double workTotalH;
    public RecoveryState recovery;
    public EdgeBattleId battleId;  public Vec2D posM;   // 在条带上的位置（需要回收时）
    public OrgUnitId ownerBattalion;             // 原属营（修好后归还）
    public SquadId ownerSquad;
    public CountryId capturedBy;                 // level == Captured 时
    public SimTime readyAt;                      // 后方大修/在途的预计完成时刻
}

public sealed class UnassignedPool {             // 每营一个（00：归 07）
    public OrgUnitId battalionId;
    public List<PersonnelId> persons;            // 升序
    public List<EquipmentItemId> items;          // 升序；EquipmentItem.holder = 0，status = Active
}

public sealed class RepairQueue {                // 每个维修持有者一个
    public OrgUnitId holder;                     // 营（营属维修班）或旅维修营/连
    public OrgLevel level;                       // Battalion | Brigade
    public List<EquipmentItemId> items;          // 排序见 §4.3.2
    public double capacityWhPerH;                // 每小时重算
}

public sealed class MedicalQueue {               // 每营一个
    public OrgUnitId battalionId;
    public List<PersonnelId> awaitingEvac;       // 排序：woundedAt 升序，再 personId
    public List<PersonnelId> evacuating;
    public double evacCapacityPerH;              // 每小时重算（§4.5.2）
}

public sealed class BrigadeSustainSettings {     // 键 FormationId（旅）；无旅的营用全军设置
    public ReorgPolicy reorgPolicy = ReorgPolicy.Consolidate;
    public ReplacementMode replacementMode = ReplacementMode.Individual;
    public bool allowCannibalization = true;     // H-08
}

public sealed class RotationState {              // 键 OrgUnitId（营），整建制轮换用
    public OrgUnitId battalionId;
    public RotationPhase phase;
    public SimTime phaseUntil;
}

public sealed class ReplacementRequest {         // 06 的 RequestTransport 使用
    public int id;                               // 07 内顺序分配（存档保存）
    public OrgUnitId battalionId;
    public List<PersonnelId> persons;
    public List<EquipmentItemId> items;
    public NodeId fromNode;
    public NodeId toNode;                        // 目的节点（补充：营辎重队所在节点；大修：Depot/Factory 节点）
    public bool toFront;                         // true = 后方→前线（补充、修好归还）；false = 前线→后方（送大修）
    public SimTime requestedAt, etaAt;
}

public sealed class DepotRepairOrder {
    public EquipmentItemId itemId; public NodeId depot; public SimTime startedAt, readyAt; public double costMusd;
}
```

### 3.3 静态数据：`ReliabilityProfile`（YAML 键 `reliability`，00 §4.3 归 07）

```csharp
public sealed class ReliabilityProfile {
    public double mtbfH;                    // 平均故障间隔（运行小时）
    public double partsPerWorkHour;         // 每修理工时消耗的备件单位（缺省 1.0）
    public double fieldWorkMedianH_Mobility, fieldWorkMedianH_Firepower, fieldWorkMedianH_Sensor;
    public double depotWorkH;               // 后方大修工时（大修厂工时）
    public double depotCostFraction;        // 大修费用 / 单价
    public RecoveryClass recoveryClass;     // HeavyTracked | MediumTracked | Wheeled | Towed | ManPortable
    public double activationPartsUnits;     // 启封所需备件（01 §4.9 要求 07 定义）
    public double failurePerFlightH;        // 飞机：每飞行小时非战斗故障率（缺省 有人机 0.03 / 无人机 0.01；08 §4.3.2 读取）
}
```

**备件单位定义**（06 §3.2 要求 07 定义含义，H-07）：**1 个备件单位 = 该型号 1 个标准修理工时所消耗的零件**。单价 `PartsUnitCostMusd(model) = PartsUnitCostFrac × costMusd(model)`（给 11 把 O&M 资金换算成件数），质量用 06 的 `PartsUnitMassKg`。

---

## 4. 算法与公式

### 4.0 调用时机

| `TickPhase` | 频率 | 做什么 |
|---|---|---|
| 100 `EngagementStep` | 每刻（片段内） | 03 调用 `ApplyCasualty`、`RollVehicleDamage`、`ApplyVehicleDamage`、`PlatoonReorgInCombat`（§4.6.1） |
| 110 `GroundEventApply` | 每刻 | 04/06/08 的条带与地块打击调用同一组函数 |
| 30 `Calendar`（时） | 每 60 min | 补充分配（§4.7），轮换状态推进 |
| 130 `DamageRepair` | 每 60 min（G-24） | 按顺序：① 故障抽样（§4.8.1）② 回收（§4.2.2）③ 野战修理（§4.3）④ 后方大修（§4.4）⑤ 医疗（§4.5）⑥ 休整重组（§4.6.2）⑦ 满编率与报告（§4.6.4、§4.10） |
| 140 `BattleEnd` | 战斗结束时 | 04 调用 `ResolveBattlefieldControl`（§4.2.3） |

每一步内的遍历顺序：国家 `CountryId` 升序 → 营 `OrgUnitId` 升序 → 物品/人员 ID 升序（00 §6.4）。

### 4.1 伤亡与损伤的登记

#### 4.1.1 `ApplyCasualty(PersonnelId p, CasualtyState s, SimTime t, LossSource src, Vec2D pos, EdgeBattleId battle)`

```text
rec = 取或新建 PersonCasualtyState(p)
若 rec.state ∈ {Killed, MissingOrCaptured} → 忽略（不可逆）
若 s 比 rec.state 轻（Light < Severe < Killed）→ 忽略（伤情只升不降，避免二次命中把重伤改成轻伤）
rec.state = s；rec.woundedAt = t；rec.source = src；rec.originalSquad = 当前所在班；rec.originalBattalion = 该班的营
rec.medicCoverageAtWound = MedicCoverage(所在连)（§4.5.2）；rec.posM = pos；rec.battleId = battle
stage：Killed → Dead；LightWounded → (在片段中 ? WithUnit : Role1 待入院，见 §4.5.1)；SeverelyWounded → AwaitingEvac（加入该营 MedicalQueue.awaitingEvac）
若 battle ≠ 0 → 04.RecordLoss(battle, entry)
11：Killed 时，对该国参与的每个进行中 War：WarSideState.killedCumulative++（11 §4.8 要求）；07 另计全时段总数 KilledCumulative(CountryId)
```

人员**不离开名册**（02 的 `RosterState`；离开班名册时一律调用 `02.LeaveSquad(p, DetachReason.Casualty)`，不直接改名册）直到：`Killed`/`Discharged` → 从名册移除（人员记录保留，供统计）；`SeverelyWounded` 后送开始 → 从班名册移到“医疗中”（不计入班的可战斗人数，也不计入满编率分子）；`LightWounded` 在片段结束后进入 Role1 → 同样暂离班名册，归队时回原班（§4.5.3）。

#### 4.1.2 `RollVehicleDamage(EquipmentItemId item, MunitionKind kind, Aspect aspect, ref Pcg32 rng) → (DamageLevel, DamageFlags)`

重载 `RollVehicleDamage(EquipmentItemId item, MunitionGroup g, Aspect aspect, ref Pcg32 rng) → (DamageLevel, DamageFlags)`：同一算法，直接给弹药毁伤组。上面的 `MunitionKind` 版本保留，内部调用 `RollVehicleDamage(item, MunitionGroupOf(kind, 该弹的 MunitionProfile), aspect, ref rng)`。`Aspect` 见 03 §3.1。

调用方（03 §4.6.3、04 §4.4.3/§4.6.5）已经抽中“失去战斗力”。本函数在**调用方的 RNG 流**里继续按固定顺序抽 3 次：① 殉爆 ② 等级 ③ 标志（另加 ④ 工时由 `ApplyVehicleDamage` 用 Damage 域的流抽）。

```text
g = 参数 g（MunitionKind 版本：g = MunitionGroupOf(kind, profile)）
① 殉爆：u1 < armor.catastrophicGivenKill × CatastrophicGroupMult[g] → (Destroyed, Catastrophic)，返回
② 非殉爆的等级（u2 落在累积区间）：
   g            Destroyed  DepotRepair  FieldRepairable
   Kinetic        0.25       0.35         0.40
   ShapedCharge   0.30       0.35         0.35
   TopAttack      0.40       0.35         0.25
   HeBlast        0.20       0.30         0.50
   Mine           0.05       0.25         0.70
   Interdiction   0.50       0.20         0.30
③ FieldRepairable / DepotRepair 的标志：Mine → Mobility|Mine；其他：u3 < 0.5 → Mobility；< 0.85 → Firepower；否则 Sensor
CatastrophicGroupMult：Kinetic 0.8、ShapedCharge 1.0、TopAttack 1.2、HeBlast 0.5、Mine 0.2、Interdiction 0.6
```

（`confidence: estimated`。量级参照二战以来“被击穿坦克约一半以上可修复”、2020 纳卡与俄乌公开图像中 T-72 转盘殉爆比例高的观察；由 V2 复核，H-03。）

#### 4.1.3 `ApplyVehicleDamage(EquipmentItemId item, DamageLevel lvl, DamageFlags f, SimTime t, LossSource src, Vec2D pos, EdgeBattleId battle)`

```text
st = 取或新建 VehicleDamageState(item)
若新等级不比旧等级“更坏”→ 只合并 flags，工时取 max（更坏的顺序：Operational < FieldRepairable < DepotRepair < Destroyed；Abandoned/Captured 另行处理）
st.level = lvl；st.flags |= f；st.cause = 由 src 推出；st.damagedAt = t；st.ownerBattalion/ownerSquad = 当前持有者
工时（RNG：Rng.For(Damage, itemId, tick, SaltRepairWork)）：
   FieldRepairable：median = 对应标志的 fieldWorkMedianH（多个标志取最大；Mine 用 FieldWorkMine），
                    workTotalH = median × exp(σ × z)，z ~ N(0,1)，σ = RepairWorkSigma
   DepotRepair：workTotalH = depotWorkH（不抽样）
   workRemainingH = workTotalH
回收需求：若 (lvl == FieldRepairable 且 Mobility ∈ f) 或 lvl == DepotRepair：
   battle ≠ 0 → recovery = NeedsRecovery，posM = pos，battleId = battle
   battle == 0（地块层被打）→ recovery = NeedsRecovery，posM = 营位置（距营辎重队 TileRecoveryDistM）
否则（能自己开回去的 FieldRepairable）：recovery = AtTrains（片段/战斗结束后自行开到营辎重队）
01：EquipmentItem.status = Unserviceable（lvl ≠ Operational）
04.RecordLoss(battle, entry)（battle ≠ 0）
```

- `ApplyVehicleHit(EquipmentItemId item, DamageCause cause)`（06 车队拦截、05 无人机损失用）：内部用 `Rng.For(Damage, itemId, tick, SaltVehicleHit)` 先抽“失去战斗力”概率 `InterdictionDisableP`（卡车 0.8，装甲车 0.4），再调用 `RollVehicleDamage(item, MunitionGroup.Interdiction, Aspect.Side, ref rng)` 与 `ApplyVehicleDamage`。
- `IsLost(item)`（06 用）= `level ∈ {Destroyed, Abandoned, Captured}`。`IsMobile(item)`（09 用）= `level == Operational` 或（`FieldRepairable` 且 `Mobility ∉ flags`）。
- `ApplyAggregateLosses(OrgUnitId bn, double personnelLossFrac, double vehicleLossFrac, long tick)`（12 代理战斗的日损失用）：RNG `Rng.For(Damage, personId/itemId, tick, SaltAggregate)`。该营可战斗人员按 personId 升序，各 Bernoulli(personnelLossFrac) → 抽中者再 Bernoulli(12 `KilledShareOfLosses`) → `ApplyCasualty(p, Killed, …)`，否则 `ApplyCasualty(p, SeverelyWounded, …)`（battle = 0）；Operational 装备按 itemId 升序，各 Bernoulli(vehicleLossFrac) → `RollVehicleDamage(item, MunitionGroup.HeBlast, Aspect.Side, ref rng)` + `ApplyVehicleDamage`（battle = 0）。

### 4.2 战场控制与回收（总纲 §9.12(1)(3)）

#### 4.2.1 登记

04 在片段写回、战斗中被击伤时调用 `RegisterBattlefieldItems(battleId, items, positions)`：包括 03 的 `droppedItems`（被丢下的武器）、片段内失去机动的车辆、空车（无人可开的完好车辆）。完好但无人操作的装备 `level` 保持 `Operational`，`recovery = NeedsRecovery`。

#### 4.2.2 回收（每小时）

```text
对每个战斗中的每一方 s（按 EdgeBattleId、sideIndex 升序）：
  待回收 R = { 本方 recovery == NeedsRecovery 且 04.BattlefieldControllerAt(battle, posM) == s 的物品 }
  （位置在敌方控制区的不回收：§4.2.3 战斗结束时处理）
  排序：价值 TargetValue（03：MBT 10 > IFV 6 > …；武器按 allocValue/10）降序 → 到本营营辎重队距离升序 → itemId 升序
  回收手段（按营；营不足时用旅）：
     ARV = 营/旅中 Operational 且不在片段内的 armored_recovery_vehicle 数
     牵引当量 Tow = ARV + TowByTankFactor × 可用 MBT（仅对 HeavyTracked/MediumTracked 需求）
                    + TowByTruckFactor × 可用 truck_*（仅对 Wheeled/Towed/ManPortable）
     便携武器（ManPortable）：由任何可用班在下一次经过时捡回——每小时自动回收距离 ≤ 2 km 的全部
  每个回收手段每小时完成的工作量 = 1 小时；一件物品的回收耗时 = TripTimeH = 2 × 距离 / RecoverySpeedMps[recoveryClass] / 3600 + HookupH
  分配：按 R 的顺序，把每件物品分给“最早空闲”的回收手段（平局按手段的 itemId），累积其忙碌时间；
       本小时内完成的（busy 起点 + TripTimeH ≤ 本小时末）→ recovery = AtTrains（并进入 §4.3 的修理分流）
  风险（每次回收行程，RNG Damage/SaltRecoveryHazard，键 = Mix(回收车 itemId) ^ 物品 itemId）：
       λ = 04.TruckKillIntegral(s, 物品位置 → 营辎重队, isNight) × RecoveryExposureMult × 2（往返）
       Bernoulli(1 − exp(−λ)) → 回收车 ApplyVehicleHit(Interdiction)；本次回收失败（物品保持 NeedsRecovery）
```

**涌现**：抢救车多 → 同样战斗永久损失少（✅ §9.12(3)）；无人机密集（威胁场高）→ 回收车自己被打，回收变慢——“无人机密集时伤员和车都运不下来”。

#### 4.2.3 战斗结束：`ResolveBattlefieldControl(EdgeBattleId battle, Func<Vec2D,int> controllerOf)`

```text
对所有 battleId == battle 且 recovery == NeedsRecovery（或 level == Abandoned）的物品（itemId 升序）：
  c = controllerOf(posM)（04 §4.13.4）
  c == 物品所属方：保留 NeedsRecovery，改为地块层回收：posM 换成“距营辎重队 TileRecoveryDistM”，battleId = 0
  c == 敌方：
     level == Destroyed → 保持 Destroyed（残骸）
     其他（含 Operational 空车、FieldRepairable、DepotRepair、Abandoned）：
        RNG Damage/SaltCapture（键 itemId）：u < CaptureP[recoveryClass] → level = Captured，capturedBy = 敌方
                                             否则 → level = Destroyed，cause = Scuttled（被己方/对方炸毁）
对所有 battleId == battle、stage ∈ {AwaitingEvac} 的重伤员：
  controllerOf(woundPosM) == 敌方 → state = MissingOrCaptured，stage = None（从医疗队列移除）
```

#### 4.2.4 脱离接触：`OnDisengage(OrgUnitId battalion, EdgeBattleId battle)`（04 §4.12 调用）

```text
N = 该营在本战斗中 recovery == NeedsRecovery 的车辆（不能自行机动）
T = 该营可用的牵引当量（同 §4.2.2，不在片段内）
对 N 中每件（按 §4.2.2 的价值顺序），第 k 件（k 从 0 起）：
   pTow = DisengageTowP × min(1, T / (k + 1))
   Bernoulli(pTow)（Damage/SaltDisengageTow，键 itemId）→ 成功：随营撤走，recovery = AtTrains
                                                       → 失败：level = Abandoned（位置不变，战斗结束时按 §4.2.3 决定被俘或炸毁）
同时：该营 AwaitingEvac 的重伤员中，超出（营可用车辆空位数 × 1）的部分 → 留下（stage 不变，战斗结束时按 §4.2.3）
```

（总纲 §11.1.1：“撤退途中受损车辆更容易被遗弃”。）

#### 4.2.5 包围与歼灭

- `OnUnitEncircledDestroyed(OrgUnitId battalion)`（09 §4.7.3 调用）：该营所有 `Healthy/LightWounded` 人员 → `MissingOrCaptured`（概率 `EncircledCaptureP`）或 `Killed`（其余）；所有非 `Destroyed` 装备 → `Captured`（`CaptureP`）或 `Destroyed`。RNG `SaltEncircled`，键 personId/itemId。
- `OnSofDestroyed(OrgUnitId company)`（05 §4.11 调用）：每人 50% `MissingOrCaptured` / 50% `Killed`（`SaltSof`）。

### 4.3 野战修理链

#### 4.3.1 分流（物品到达营辎重队 `AtTrains` 时）

```text
FieldRepairable 且 workRemainingH ≤ BnMaxWorkH → 本营 RepairQueue
FieldRepairable 且 ≤ BdeMaxWorkH           → 旅维修 RepairQueue（无旅维修单位时仍放营队列）
否则（含 DepotRepair）                      → §4.4 后方大修
```

#### 4.3.2 每小时修理

```text
capacityWhPerH(队列) = Σ_{持有者内 mechanic 专业、可战斗、不在片段中的人} MechEff(skill) + RepairVehWh × 可用 armored_recovery_vehicle 与修理车数
   MechEff(skill) = 0.5 + 0.5 × skill（02.GetSkillForBattalion(该人所在营, mechanic, 0)）
   跨专业：专业不对口的人不计入（维修是技术工作，H-06）
队列排序（全序）：PriorityClass（MBT/IFV/火炮/防空 = 1，其他装甲 = 2，其他 = 3）升序 → workRemainingH 升序 → itemId 升序
依次分配：对每件 i，可分到 w = min(剩余容量, MaxWhPerItemPerH × 01.RepairThroughputMult(01.GetMaintenanceOrg(bn), g(model)), workRemainingH_i)
   （bn = 物品原属营 ownerBattalion；g(model) = 01 §4.15.1 的维护组；工具组不足时单件修理变慢）
   备件需求 q = w × partsPerWorkHour(model)
   06.TryDrawParts(holder, model, q, out got)       // holder：营队列传 OrgUnitId（营辎重队库存），旅队列传 FormationId（BSA 库存）；06 §6.1
   若 got < q 且 allowCannibalization → §4.8.3 拆东补西补足
   实际工时 w' = w × got' / q（got' = 最终得到的备件）；workRemainingH −= w'；剩余容量 −= w'
   若 w' == 0 → recovery = AwaitingParts（反馈“等备件”）
workRemainingH ≤ 0 → level = Operational，flags = None，recovery = None；
   归还：原班存在且该类别槽位有空 → 回原班；否则进本营 UnassignedPool；01 status = Active
```

### 4.4 后方大修

```text
物品转后方：recovery = InTransitToDepot；调用 06.RequestTransport(ReplacementRequest{items=[i], toNode = 最近的有大修能力的 Depot/Factory 节点, toFront = false})
到达：recovery = AtDepot，进入国家大修队列（按到达时刻、itemId）
国家大修容量：DepotCapacityWhPerH[country] = Σ_{该国 Depot/Factory 节点} repairWhPerH（14 数据；缺省 NationalDepotWhPerH）
每小时按队列顺序分配容量（每件 ≤ MaxDepotWhPerItemPerH），备件从该节点库存扣（同 §4.3.2）
完成：level = Operational；物品从部队移出，进入 01 库存：EquipmentItem.holder = 0、locationNode = 该节点（同步 01 DepotIndex；实例保留其 usageHours），
      之后按 01 的分配策略重新发放（不一定回原营）
费用：开始大修时调用 11.TryCharge(owner, BudgetLine.OperationsMaintenance, depotCostFraction × 单价, "depot_repair")（11 §4.2.7；单价 = 11 ProcurementProfile.costMusd）；返回 false → 留在队列等待，下一小时再试（H-09）
```

### 4.5 医疗链（总纲 §9.12(4)）

#### 4.5.1 轻伤

```text
片段结束（或不在片段中受伤）时：stage = Role1，暂离班名册（02.LeaveSquad(p, Casualty)）
有营救护所（营内有 medic 专业 ≥ 1 人可战斗）：RTD 时长 = LightRtdMedianD × exp(0.4 z)（天），不归队概率 LightNoReturnP
无：RTD 时长 × NoMedicalRtdMult，不归队概率 LightNoReturnPNoMed
抽样：Rng.For(Damage, personId, tick, SaltMedical)，顺序：z、Bernoulli(不归队)
stageUntil = now + RTD；到期 → §4.5.3 归队（或 Discharged）
```

#### 4.5.2 重伤：后送与“黄金时间”

```text
MedicCoverage(连) = min(1, 可战斗 medic 人数 / max(1, 连人数 / MedicPerPersons))
每小时，每营：
  evacCapacityPerH = (可用 armored_ambulance × AmbulanceLitters + 可用其他车辆空位 × AdHocEvacFactor) / EvacRoundTripH
     EvacRoundTripH = 2 × (己方纵深：伤员平均位置 → 旅卫生连(BSA)) / AmbulanceSpeedMps / 3600 × (1 + EvacThreatMult × threat)
     threat = 04.TruckKillIntegral(s, 伤员平均位置 → BSA, isNight) / EvacThreatNorm（不在战斗中 = 0）
  不在战斗中的营：EvacRoundTripH 用 TileEvacDistM
  本小时可后送 n = floor(evacCapacityPerH + carry)；carry 小数累积（确定性，不抽样）
  按 awaitingEvac 顺序取 n 人：stage = Evacuating，stageUntil = now + EvacRoundTripH / 2；02.LeaveSquad(p, Casualty)
到达 Role2（stageUntil 到期）：
  delayH = (到达时刻 − woundedAt) / 3.6e6
  pDow = clamp(DowBase + DowPerHour × max(0, delayH − GoldenHourH), DowBase, DowMax) × (1 − MedicCareCut × medicCoverageAtWound)
  Bernoulli(pDow)（SaltMedical）→ state = Killed，stage = Dead（死于伤，11 计入）
  否则 stage = Hospital；Bernoulli(SevereRtdP) 抽 willReturn；
       willReturn ? stageUntil = now + SevereRtdMedianD × exp(0.5 z) 天 : stageUntil = now + SevereDischargeD 天
等待超过 MaxEvacWaitH 仍未后送：按 delayH = MaxEvacWaitH 立即做一次 pDow 判定；存活者继续等待（之后不再判定）
```

#### 4.5.3 归队（✅ 总纲：回原部队、保留原练度）

```text
stageUntil 到期且 willReturn（或轻伤到期未抽中不归队）：
  state = Healthy，stage = ReturnedToDuty
  目标营 = originalBattalion（仍存在）；若已撤编 → 02.ReleaseToPool(p)（国家补充池）
  originalSquad 存在且该专业在班里有空缺 → 回原班；否则 → 目标营 UnassignedPool（等下一次休整重组）
  回原班时调用 02.JoinSquad(p, 目标班)（CarriedSkillState 保留原练度）；进待编池时不调用，等重组入班时调用
Discharged：02.LeaveSquad(p, MedicalDischarge)（从名册移除，不进预备役池）；11 计入伤残
```

### 4.6 满编率与重组

#### 4.6.1 战斗中：排内（`PlatoonReorgInCombat(EngagementId e)`，03 每步末调用）

只在**同一排**、同一方的元素之间进行，按排 `OrgUnitId` 升序、规则顺序：

```text
规则 A（步兵合并）：同一班模板的徒步元素中，可战斗人数 / 模板人数 < MergeThreshold 的元素集合 M
   若 |M| ≥ 2：取 M 中按 (槽位相同或相邻，|Δy| ≤ MergeDistM，双方压制 < 0.5) 可配对者，
   每对：人少者（平局 id 大者）并入人多者——人员与随身装备、随身弹药全部转入；空元素移除；
   人员换班：02.LeaveSquad(p, Transfer) + 02.JoinSquad(p, 接收班)（被并班的 Squad 实体保留为空班，休整时重建）
规则 B（车组转移）：同排内，车辆完好（Operational 或仅 Sensor）但车组 < 主武器 crewMin 的车辆元素 V，
   和车辆已 Destroyed/不能机动、仍有可战斗车组（同 school：armor 或 mech）的元素 W，且 dist(V, W) ≤ CrewTransferDistM：
   W 中按专业匹配（炮长→炮长，车长→车长，其次同 school）转移到 V，直到 V 满足 crewMin；耗时 CrewTransferS（期间 V 不能射击）；
   跨班转移同样经 02.LeaveSquad(p, Transfer) + 02.JoinSquad(p, V 的班)
规则 C（武器接手）：已由 03 §4.8.3 在元素内部完成，本函数不重复
```

#### 4.6.2 休整：连内、营内自动（`ReorganizeWithinBattalion(OrgUnitId bn)`）

**触发**：每小时检查；营的所有连都不在片段中、距最后一次参加片段 ≥ `RestReorgMinH`、营不在脱离接触中、不在整建制轮换的 `Withdrawing` 阶段。01 的模板对齐（01 §4.5.4 第 6 步）也直接调用它。

```text
policy = BrigadeSustainSettings(营的建制旅).reorgPolicy
对营内使用的每个班模板 T（按 TemplateHandle 升序）：
  S_T = 营内模板为 T 的班（按 01 的 DFS 顺序）
  P   = S_T 中所有可用人员（Healthy，及 WithUnit 的轻伤）∪ 待编池中“专业出现在 T 的人员表里”的人
  I   = S_T 中所有 Operational 装备（含 FieldRepairable 但 Mobility ∉ flags 的？否：只 Operational） ∪ 待编池中“类别出现在 T 的槽位里”的装备
  （以上为“候选集”；先在内存里拆空 S_T，再重新填，最后一次性写回）
  policy == Consolidate（集中成完整单位）：
     范围：先在每个连内做，再在营内做（营内阶段允许跨连搬动，先填 DFS 靠前的连）
     对 S_T 中每个班 q（DFS 顺序）：
        Fill(q)：对模板人员表的每个岗位 (专业 sp, 数量 k)（按 01 模板顺序）：
            依次取 P 中 专业 == sp 的人，优先级：原属 q > 原属 q 的排 > 原属 q 的连 > 其他（平局 personId 升序）
            不足：取替代专业 sp'，按 SubstituteOrder(sp)（同 school 优先，然后 CrossTrainFactor 降序），仅当 CrossTrainFactor(sp', sp) ≥ MinSubstituteFactor
        对模板槽位 (类别 c, 数量 k)：先取绑定型号的装备，再取同类别替代型号（01 §4.8.3 替代规则）；原属 q 的装备优先
        Viable(q) ⟺ 人员 ≥ ceil(MinViableFill × 模板人数) 且 每件班组武器有 crewMin 人 且 （有车模板）车组齐全
        若 !Viable(q)：撤销 q 的填充，把 q 及其后的班都置空，剩余 P、I → 待编池；结束本模板
  policy == KeepStructure（保持建制）：
     范围：只在连内（不跨连）；待编池按连轮转分配
     第 1 轮（保证能力）：按 S_T 的 DFS 顺序轮转，每轮给每个班补“一件缺 crewMin 的班组武器的操作者”或“车组缺额一人”，直到无人可补
     第 2 轮（平均人数）：剩余 P 轮转分给人数最少的班（平局 DFS 序）
     装备：各班先拿回自己的；某班缺“班组武器或车辆”而同连另一班多出同类别时才搬动
     剩余 → 待编池
写回：人员换班一律调用 02.LeaveSquad(p, Transfer) + 02.JoinSquad(p, newSquad)（不直接改 02 RosterState）；01 Squad.items / EquipmentItem.holder；
      01 bn.reorganizingUntil = max(bn.reorganizingUntil, now + RestReorgDurationH × 3 600 000 ms)（期间 09 命令延迟 ×、03 协同 ×，01 定义）
```

- **不四舍五入**：班可以缺编；凑不成“可用班”的人和装备留在待编池，**仍然属于这个营**、仍计入营的满编率分子中的“待编”一栏（界面单列），只是不参加战斗。
- 待编池里的人：参加营的非战斗勤务，不参战（H-05）。

#### 4.6.3 玩家下令：营之间、旅之间（✅ 总纲表）

| 命令 | 算法 |
|---|---|
| `MergeBattalions(keep a, absorb b)` | 前提：a、b 同国、同地块、都不在战斗中。b 的全部人员与装备 → a 的待编池；`ReorganizeWithinBattalion(a)`；a 的待编池中**骨干专业**（`officer`、`political_officer`、`nco_senior`、`squad_leader`、`team_leader`）超出 a 模板需求的部分 → 回到 b；b 的其他剩余 → a 的待编池保留；b 的战备等级改为 `Cadre`（01，“腾出来的骨干转为预备役”）。耗时：两营 `reorganizingUntil = now + InterBnMergeH` |
| `MergeCompanies(bn, keep c1, absorb c2)` | 同上，范围为营内两个连；c2 变成空壳（保留编制节点，等待补充） |
| `DisbandBattalion(b)` | 人员 → 逐人 `02.ReleaseToPool(p)`；装备 → `EquipmentItem.holder = 0`、`locationNode = 06.NearestDepot(国家, 营所在地块)`（01 库存，同步 01 `DepotIndex`；06 负责运输）；营实体标记撤编 |

#### 4.6.4 满编率 `FillRate`（每小时，及每次重组/补充后）

```text
对营（以及连、旅的汇总）：
  人员：avail = 名册中 Healthy + WithUnit 轻伤；pool = 待编池人数；medical = Role1/Role2/Hospital 且 willReturn 的人
        FillRate.personnel = avail / 模板人数（可 > 1）；另显示 pool、medical 两栏
  专业：同上，按专业
  装备：按类别与绑定型号：Operational / 模板槽位数；另列 FieldRepairable（在修）、DepotRepair（大修）
  能力：FillRate.capability[k] = 03 BattalionSummary.fillRate 的分量（反装甲、压制、侦察……）
CombatStrength（03 §4.13）与 04.IsCombatEffective 使用同一组数据
```

### 4.7 补充（总纲 §9.12(5)）

#### 4.7.1 需求清单 `ReplacementNeeds`（每小时，`Calendar`）

```text
人员需求[bn, sp] = max(0, 模板人数[sp] − avail[sp] − pool[sp] − 预计 ReplacementLookaheadH 内归队的 medical[sp] − 在途补充[sp])
装备需求[bn, (c, m)] = max(0, 模板槽位[c] − Operational[c] − 待编池[c] − 预计 ReplacementLookaheadH 内修好的 FieldRepairable[c] − 在途[c])
   m = 01.ResolveModel(bn, c)
预算估计 = Σ 装备需求 × 11.GetUnitCostMusd(m)（只用于显示，采购由 11/玩家决定）
```

#### 4.7.2 单兵补充 `Individual`

```text
对每个国家：
  兵员：对每个专业 sp（按 SpecialtyHandle 升序）：
     可用 = 02.TrainedPoolAvailable(country, sp)
     按该国各营在 01 AllocationPolicy 下的顺序（Even / PriorityFill / FrontlineFirst，算法复用 01 §4.8，以“人员需求”为 d_i）分配整数人数
        （Even 的整数化：按需求比例 floor，余数按“小数部分降序、再营 id 升序”逐个补——这是分配，不是凭空增减）
     persons = 02.DrawFromTrainedPool(country, sp, n) → 列入该营的 ReplacementRequest
  装备：01 §4.8 的发放流程（01 负责从库存选件：holder = 0 的 EquipmentItem，01 DepotIndex）；07 只为每营生成需求并接收结果
  每营一个 ReplacementRequest（toNode = 营辎重队所在节点，toFront = true）→ 06.RequestTransport；在途期间计入“在途”
到达：06 回调 OnReplacementDelivered(requestId)：
  人员与装备进入该营待编池；
  营不在片段中且满足休整条件 → 立即 ReorganizeWithinBattalion；否则等休整（补充兵在营辎重队等待，H-04）
新兵练度：人员进入班时调用 02.JoinSquad(p, squad)（练度来自 DrawFromTrainedPool 写的 CarriedSkillState），由此拉低该编组该专业平均练度（✅ 总纲：单兵补充的代价）
```

#### 4.7.3 整建制轮换 `UnitRotation`

```text
触发（每小时）：营 CombatStrength < RotationTrigger 且 不在片段中 且 RotationState.phase == None
  → phase = Requested；调用 12.RequestBattalionRotation(bn)（12 编组 AI 为该营安排替换与后撤；移动命令由 12/09 发出，照常有命令延迟）
营到达非一线地块（09.IsFrontline == false）→ phase = Refitting：
  本营在 §4.7.2 的分配中优先级最高（排在所有营之前，不论 AllocationPolicy），补充到达后立即重组
  当 FillRate.personnel ≥ RotationRefitTarget 且主要装备类别 ≥ RotationRefitTarget，或等待超过 RotationMaxRefitD → phase = Retraining，phaseUntil = now + RotationRetrainD
Retraining：02 对该营人员按“集中训练”倍率提高练度增长（02 定义倍率，07 只给标志 IsRetraining(bn)）
到期 → phase = None（营可再投入）
```

### 4.8 故障、备件、拆东补西（总纲 §6）

#### 4.8.1 故障（每小时）

```text
对每件 Active 且 level == Operational 的车辆/重装备（按 itemId 升序）：
  u = 本小时运行小时数（01 usageHours 本小时增量；由 03/04/06/09/02 累加）
  若 u > 0：λ = u × FaultRateMultiplier(item) / mtbfH
     FaultRateMultiplier = 11.OmFaultMultiplier(owner) × (1 + UsedFaultSlope × (1 − condition))（11 §4.2.5、§4.5.1；condition = 11 EquipmentConditionState，无组件 = 1）× TrainWearFactor[11.GetTrainingIntensity(owner, 编组)]（训练时）
     Bernoulli(1 − exp(−λ))（Rng.For(Damage, itemId, tick, SaltBreakdown)）→
        ApplyVehicleDamage(item, FieldRepairable, Breakdown | (Bernoulli(BreakdownImmobileP) ? Mobility : None), cause = Breakdown)
        工时 median = BreakdownWorkMedianH
```

#### 4.8.2 给 06 的标准战时日备件消耗

```text
StandardWarDayPartsRate(brigade b, model m) = n_m × partsPerWorkHour(m) ×
     ( 24 × WarOpHoursFrac / mtbfH(m) × BreakdownWorkMedianH  +  CombatDamageRatePerDay × FieldWorkMeanH(m) )
n_m = 旅内该型号非 IsLost 的件数

PartsPerItemPerYear(model m) = 365 × 24 × PeaceOpHoursFrac / mtbfH(m) × BreakdownWorkMedianH × partsPerWorkHour(m)
   （01 用：平时每件装备每年的备件消耗）
```

#### 4.8.3 拆东补西 `Cannibalization`

```text
当 §4.3.2 / §4.4 备件不足、且 allowCannibalization：
  供体候选 = 同旅（大修时：同节点）同型号、level ∈ {DepotRepair, Destroyed(非 Catastrophic)}、recovery ∈ {AtTrains, AtDepot}、且 Cannibalized ∉ flags 的物品
  排序：Destroyed 优先 → DepotRepair；再 workRemainingH 降序；再 itemId
  取第一个：提供 DonorPartsUnits 个备件单位（多余的进入持有者备件库存）；
     供体 flags |= Cannibalized；若供体为 DepotRepair：workRemainingH × (1 + CannibalizedWorkMult)；若为 Destroyed：不变（已是永久损失）
  仍不足 → 继续下一个供体，直到满足或无供体
```

（拆东补西让“同型号多”本身成为优势——总纲 §6 的“统一型号的好处”自然出现。）

#### 4.8.4 备件入库与启封

- 11 每小时给出 `partsAddedMusd(model)`（11 §4）→ `units = partsAddedMusd / PartsUnitCostMusd(model)` → 调用 06 把备件放进该国储备仓库（06 的 `ItemKey = SpareParts(model)`）。进口型号的断供由 11 判断（只在未中断时入库）。
- 01 启封 `Stored` 装备：消耗 `activationPartsUnits × (1 + StoredYearsFactor × 封存年数)` 个备件；不足时启封计时暂停（反馈“启封缺备件”）。

### 4.9 缴获（可选，H-12，默认关闭）

- `level == Captured` 的物品：归入俘获方国家的 `CapturedPool`（国家级，按型号计数，保留实例）。
- 开关打开时：俘获方可以把它们作为同类别的**替代装备**发放（01 §4.8.3），型号专有练度从 `CapturedTypeSkill` 开始（02），备件只能来自本国同型号库存或拆东补西。2020 纳卡里双方都用 T-72 → 缴获的 T-72 对阿方几乎立即可用；这正是该机制的意义。
- 关闭时：缴获只计入战报与对方的损失统计。

### 4.10 损失状态汇总与报告

```text
LossStatusSummary（按营/旅/战斗；装备按型号、人员按专业）：
  永久损失 = Destroyed + Captured + Killed + MissingOrCaptured + Discharged
  可修复   = FieldRepairable + DepotRepair（尚未修好）
  已修复   = 曾经 ≠ Operational、现在 Operational 的件数（本战斗/本期）
  遗弃     = Abandoned（尚未结算）+ 由 Abandoned 转成 Captured/Scuttled 的件数（单列）
  医疗     = Role1/Role2/Hospital 中预计归队人数，及按日的归队曲线
结论句模板（13）：
  "本旅损失 {veh} 辆装甲车辆：永久 {perm}（其中遗弃/被俘 {abd}），可修 {rep}，已修复 {fixed}。抢救车不足导致 {nAbandonedForLackOfTow} 辆在撤退时遗弃。"
  "重伤员平均后送 {meanDelayH:F1} 小时，{dow} 人死于伤（理论最低约 {dowFloor}）。"
  "需要补充 {nPersons} 名兵员（{top3 专业}）、{nVeh} 件装备，估计 {budget:F1} 百万美元。"
```

`nAbandonedForLackOfTow` = §4.2.4 中失败的件数；`dowFloor` = 若全部在 `GoldenHourH` 内后送时的期望死亡数（用同一公式算）。

### 4.11 跨专业系数 `CrossTrainFactor(fromSpecialty, toSpecialty)`（03、本文件共用）

```text
from == to                              → 1.0
同 school（specialties.yaml 的 school 字段） → CrossSameSchool（0.7）
from ∈ infantry 体系 且 to ∈ infantry 体系   → 已含在同 school
to ∈ {tank_gunner, vehicle_gunner} 且 from ∈ {tank_commander, vehicle_commander} → 0.8
其他                                    → CrossOther（0.3）
mechanic、medic、uav_operator、radar_operator、jtac、forward_observer 作为 to：其他来源一律 CrossTechnical（0.15）
```

---

## 5. 常数表

> 存于 `data/tuning/07_damage_repair.yaml`。全部 `confidence: estimated`，除注明外。

### 5.1 损伤

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| 非殉爆等级表（§4.1.2） | 见表 | — | ±0.1 | 量级估算，V2 复核 |
| `CatastrophicGroupMult` | 见 §4.1.2 | — | — | 攻顶弹对顶部弹药舱更致命 |
| `RepairWorkSigma` | 0.5 | — | 0.3–0.8 | 修理工时的对数正态离散 |
| `fieldWorkMedianH`（Mobility / Firepower / Sensor） | 6 / 8 / 4 | h | ×0.5–2 | 换负重轮/履带、火控与火炮部件 |
| `FieldWorkMine` | 10 | h | 6–20 | 触雷损坏行走机构 |
| `depotWorkH`（HeavyTracked / MediumTracked / Wheeled / Towed / ManPortable） | 600 / 400 / 200 / 150 / 20 | 工时 | — | 大修数周量级；ManPortable 估算（H-19） |
| `depotCostFraction` | 0.15 | — | 0.05–0.3 | |
| `InterdictionDisableP`（卡车 / 装甲车） | 0.8 / 0.4 | — | — | |
| `BnMaxWorkH` / `BdeMaxWorkH` | 12 / 48 | h | — | 营修理分队做小修、旅维修营做中修 |

### 5.2 回收与战场控制

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `RecoverySpeedMps`（HeavyTracked / Medium / Wheeled / Towed） | 3 / 4 / 6 / 5 | m/s | — | 拖带重车越野 10–15 km/h |
| `HookupH` | 0.5 | h | 0.25–1 | |
| `TowByTankFactor` / `TowByTruckFactor` | 0.25 / 0.25 | 当量 | 0–0.5 | 无抢救车时以坦克/卡车拖带，效率低 |
| `RecoveryExposureMult` | 1.5 | — | 1–3 | 回收车在接触线附近停留作业 |
| `TileRecoveryDistM` | 3000 | m | — | |
| `CaptureP`（HeavyTracked / Medium / Wheeled / Towed / ManPortable） | 0.6 / 0.6 / 0.7 / 0.8 / 0.9 | — | 0.3–0.9 | 公开统计中大量完好或轻损装备被俘；V2 校准 |
| `DisengageTowP` | 0.6 | — | 0.3–0.9 | |
| `EncircledCaptureP` | 0.8 | — | — | |

### 5.3 修理与备件

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `MechEff` | `0.5 + 0.5 × skill` | 工时/人·h | — | |
| `RepairVehWh` | 2 | 工时/h | 1–4 | 修理车、抢救车的工具与起吊能力 |
| `MaxWhPerItemPerH` | 4 | 工时/h | 2–8 | 同一辆车同时能上手的人数 |
| `MaxDepotWhPerItemPerH` | 8 | 工时/h | — | |
| `NationalDepotWhPerH` 缺省 | 200 | 工时/h | — | 14 按国家给数据 |
| `PartsUnitCostFrac` | 0.0004 | 单价比例/单位 | — | 一次 8 工时修理 ≈ 0.3% 单价的零件 |
| `partsPerWorkHour` 缺省 | 1.0 | 单位/工时 | — | 定义（H-07） |
| `DonorPartsUnits` / `CannibalizedWorkMult` | 40 / 0.5 | 单位 / — | — | |
| `mtbfH`（苏式老型号 MBT / 现代 MBT / IFV / 轮式装甲 / 卡车 / 自行火炮） | 120 / 250 / 150 / 300 / 400 / 200 | h | ×0.5–2 | 量级估计；11 的 O&M 与车况再放大 |
| `BreakdownWorkMedianH` / `BreakdownImmobileP` | 3 / 0.5 | h / — | — | |
| `WarOpHoursFrac` / `CombatDamageRatePerDay` | 0.4 / 0.01 | — / 1/天 | — | 06 规划用 |
| 🟡 `PeaceOpHoursFrac` | 0.02 | — | — | 平时运行小时占比，`PartsPerItemPerYear` 用（H-18） |
| `failurePerFlightH` 缺省（有人机 / 无人机） | 0.03 / 0.01 | 1/飞行小时 | — | 08 §4.3.2 读取（原 08 `AircraftProfile` 缺省值） |
| `StoredYearsFactor` | 0.1 | 1/年 | — | |

### 5.4 医疗

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LightRtdMedianD` / `NoMedicalRtdMult` | 5 / 2 | 天 / — | 3–10 | 轻伤数天后归队（总纲） |
| `LightNoReturnP` / `LightNoReturnPNoMed` | 0.05 / 0.10 | — | — | |
| `MedicPerPersons` | 30 | 人 | 20–40 | 约每排 1 名卫生员 |
| `AmbulanceLitters` / `AdHocEvacFactor` | 4 / 0.3 | 人 / — | — | |
| `AmbulanceSpeedMps` | 8 | m/s | — | |
| `EvacThreatMult` / `EvacThreatNorm` | 2.0 / 0.01 | — | — | 无人机密集时后送困难（总纲） |
| `TileEvacDistM` | 15000 | m | — | |
| `DowBase` / `DowPerHour` / `GoldenHourH` / `DowMax` | 0.04 / 0.05 / 1 / 0.5 | — / 1/h / h / — | — | “黄金一小时”；现代军队到达救治的死亡率约 2–10%，延误显著增加；V2 校准 |
| `MedicCareCut` | 0.3 | — | 0.1–0.5 | 止血带、急救 |
| `MaxEvacWaitH` | 24 | h | — | |
| `SevereRtdP` / `SevereRtdMedianD` / `SevereDischargeD` | 0.35 / 60 / 30 | — / 天 / 天 | — | 部分人很久以后归队（总纲） |

### 5.5 重组与补充

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `MergeThreshold` | 0.5 | — | 0.3–0.6 | 排内合并门槛（总纲“低于某个比例时合并”） |
| `MergeDistM` / `CrewTransferDistM` / `CrewTransferS` | 200 / 300 / 60 | m / m / s | — | |
| `RestReorgMinH` / `RestReorgDurationH` | 2 / 2 | h | 1–6 | |
| `MinViableFill` | 0.75 | — | 0.6–0.9 | 班至少 3/4 人 + 关键武器有人操作才算“完整班” |
| `MinSubstituteFactor` | 0.3 | — | — | |
| `CrossSameSchool` / `CrossOther` / `CrossTechnical` | 0.7 / 0.3 / 0.15 | — | — | 与总纲 §4.2 相似度档位同量级 |
| `InterBnMergeH` | 12 | h | — | |
| `ReplacementLookaheadH` | 72 | h | 0–168 | 防止对即将归队/修好的部分重复补充 |
| `RotationTrigger` / `RotationRefitTarget` / `RotationMaxRefitD` / `RotationRetrainD` | 0.6 / 0.9 / 21 / 14 | — / — / 天 / 天 | — | |
| `CapturedTypeSkill` | 0.1 | — | — | |

---

## 6. 与其他系统的接口

### 6.1 本文件提供

| 接口 | 调用者 | 时机 |
|---|---|---|
| `ApplyCasualty(PersonnelId, CasualtyState, SimTime, LossSource, Vec2D, EdgeBattleId)` | 03、04、05、06（给养断绝的非战斗减员）、08 | 事件时 |
| `(DamageLevel, DamageFlags) RollVehicleDamage(EquipmentItemId, MunitionKind, Aspect, ref Pcg32)` | 03、04 | 失去战斗力时 |
| `(DamageLevel, DamageFlags) RollVehicleDamage(EquipmentItemId, MunitionGroup, Aspect, ref Pcg32)`、`MunitionGroup MunitionGroupOf(MunitionKind, MunitionProfile)` | 03、04、本文件 | 失去战斗力时 |
| `ApplyVehicleDamage(EquipmentItemId, DamageLevel, DamageFlags, SimTime, LossSource, Vec2D, EdgeBattleId)` | 03、04、05（无人机损失）、08 | 事件时 |
| `ApplyVehicleHit(EquipmentItemId, DamageCause)` | 06（车队、LOC）、05 | 事件时 |
| `void ApplyAggregateLosses(OrgUnitId bn, double personnelLossFrac, double vehicleLossFrac, long tick)` | 12（代理战斗日损失） | 每日 |
| `bool IsLost(EquipmentItemId)`、`bool IsMobile(EquipmentItemId)` | 06、09、05、03 | 任意 |
| `double CrossTrainFactor(SpecialtyHandle from, SpecialtyHandle to)` | 03 | 片段创建/重分配 |
| `void PlatoonReorgInCombat(EngagementId)` | 03 | 每步末 |
| `void ReorganizeWithinBattalion(OrgUnitId)` | 01（模板对齐）、本文件 | 按需 |
| `RegisterBattlefieldItems(EdgeBattleId, items, positions)`、`ResolveBattlefieldControl(EdgeBattleId, controllerOf)`、`OnDisengage(OrgUnitId, EdgeBattleId)` | 04 | 写回、战斗结束、脱离 |
| `OnUnitEncircledDestroyed(OrgUnitId)`、`OnSofDestroyed(OrgUnitId)` | 09、05 | 事件时 |
| `double StandardWarDayPartsRate(FormationId, ModelHandle)` | 06 | 每日 |
| `double PartsPerItemPerYear(ModelHandle)` | 01 | 按需 |
| `void OnReplacementDelivered(int requestId)` | 06 | 到达时 |
| `FillRateReport GetFillRate(OrgUnitId)`、`ReplacementNeeds GetNeeds(OrgUnitId)`、`LossStatusSummary GetLossSummary(scope)`、修理/医疗队列视图 | 13、05（L5 真值：人员满编率）、12 | 任意（只读） |
| `int KilledCumulative(CountryId)` | 11 | 每小时 |
| `double PartsUnitCostMusd(ModelHandle)`、`void AddPartsFunding(CountryId, ModelHandle, double musd)` | 11 | 每小时 |
| `double ActivationPartsUnits(EquipmentItemId)` | 01 | 启封时 |
| `bool IsRetraining(OrgUnitId)` | 02 | 每小时 |
| `MergeBattalions`、`MergeCompanies`、`DisbandBattalion` | 13（玩家行政命令，H-11） | 命令时 |

### 6.2 本文件需要

| 来源 | 需要 | 用途 |
|---|---|---|
| 01 | 编制树、DFS 顺序、`SquadTemplate` 人员表与槽位、`ResolveModel`、替代规则、`AllocationPolicy` 与 §4.8 的分配算法、库存（`EquipmentItem.holder = 0` + `locationNode`、`DepotIndex`）、`RepairThroughputMult`、`GetMaintenanceOrg`、`reorganizingUntil`、`CountryOrgSettings.fillMode`、`usageHours`、战备等级 | 重组、补充、故障 |
| 02 | `RosterState` 读、`GetSkillForBattalion`、`TrainedPoolAvailable`、`DrawFromTrainedPool`、`JoinSquad`、`LeaveSquad`（含 `DetachReason.MedicalDischarge`）、`ReleaseToPool`、`PersonnelRecord.casualty`（唯一真值） | 补充、归队、维修效率 |
| 03 | `MunitionKind`、`ArmorProfile.catastrophicGivenKill`、`TargetValue`、`CombatStrength`、`BattalionSummary.fillRate`、`LossSource` | 损伤、排序、满编率 |
| 04 | `BattlefieldControllerAt`、`TruckKillIntegral`、`RecordLoss`、营辎重队/BSA 在条带上的位置 | 回收、后送、账本 |
| 06 | `TryDrawParts(holder, model, qty, out got)`（06 §6.1）、`RequestTransport`、`NearestDepot(CountryId, ulong tile)`、备件入库、营辎重队/BSA 库存 | 备件、运输 |
| 09 | `IsFrontline`、营位置、命令（轮换由 12 发出） | 轮换 |
| 11 | `OmFaultMultiplier(CountryId)`、`EquipmentConditionState.condition`、`UsedFaultSlope`、`TrainWearFactor`、`GetTrainingIntensity`；11 调用本文件 `AddPartsFunding`；单价 `ProcurementProfile.costMusd`；大修扣款 `TryCharge`；写 `WarSideState.killedCumulative` | 故障、备件、费用 |
| 12 | `RequestBattalionRotation(OrgUnitId)`（替换与后撤）、`KilledShareOfLosses` | 整建制轮换、代理损失 |
| 14 | 各国大修节点能力 | 后方大修 |
| 15 | `Rng.For`、`NextGaussian`、`DMath` | 确定性 |

### 6.3 RNG salt 表（`RngDomain.Damage = 7`）

| salt | 值 | 用途 | entityKey |
|---|---|---|---|
| `SaltRepairWork` | 1 | 修理工时抽样 | itemId |
| `SaltVehicleHit` | 2 | `ApplyVehicleHit` 的失去战斗力与等级 | itemId |
| `SaltRecoveryHazard` | 3 | 回收行程被打 | `Mix(回收车 itemId) ^ 物品 itemId` |
| `SaltCapture` | 4 | 被俘 / 炸毁 | itemId |
| `SaltDisengageTow` | 5 | 脱离接触时拖走 | itemId |
| `SaltEncircled` | 6 | 包围歼灭 | personId / itemId |
| `SaltSof` | 7 | 特种分队被歼 | personId |
| `SaltMedical` | 8 | 归队时长、不归队、死于伤、远期归队 | personId |
| `SaltBreakdown` | 9 | 故障 | itemId |
| `SaltAggregate` | 10 | 代理战斗日损失（`ApplyAggregateLosses`） | personId / itemId |

（`RollVehicleDamage` 不用本表，它在调用方的流里继续抽，保证一次射击的全部抽样顺序固定。）

### 6.4 存档

| 规格 | 内容 |
|---|---|
| 15 | 存档：`SectionId.Damage`（= 42，值见 15 §3.2）；组件：`PersonCasualtyState`、`VehicleDamageState`、`UnassignedPool`、`RepairQueue`（items 及顺序）、`MedicalQueue`（含后送 carry 小数）、国家大修队列与 `DepotRepairOrder`、`BrigadeSustainSettings`、`RotationState`、在途 `ReplacementRequest` 及 id 计数器、`CapturedPool`、`KilledCumulative` 计数；不存档（派生，读档后重建）：`RepairQueue.capacityWhPerH`、`MedicalQueue.evacCapacityPerH`、`FillRateReport`、`ReplacementNeeds`、`LossStatusSummary` |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 同一人一刻内被两次命中 | `ApplyCasualty` 只升级不降级 |
| 已 `Killed` 的人员再被命中（面杀伤） | 调用方应只对可战斗者抽样；即使调用也忽略 |
| 车辆已 `Destroyed` 再被命中 | 忽略（只合并 `Catastrophic` 标志用于统计） |
| 营被撤编时，有人在医院、有车在大修 | 医院中的人归队时 `02.ReleaseToPool(p)`；大修完成的车进 01 库存（holder = 0） |
| 原班已因模板变更被删除（01） | 归队者/修好的装备进营待编池 |
| 营没有任何维修兵 | 营队列容量 0；工时 ≤ `BdeMaxWorkH` 的物品转旅队列；旅也没有 → 全部转后方大修 |
| 备件库存为 0 且无供体 | `AwaitingParts`，每小时重试；反馈标红 |
| 分母为 0（模板人数 0 的装备池伪班） | 满编率只计装备；人员满编率不显示 |
| 补充分配时总需求为 0 | 跳过；不发运输请求 |
| `Even` 分配的整数余数 | 按小数部分降序，平局营 id 升序（确定性；只是分配，人数守恒） |
| `KeepStructure` 下连内某班 0 人 | 允许（空班保留编制节点，等待补充） |
| 战斗结束时伤员位置在接触线上（y = c(x)） | 04 规则 `y < c(x)` 为攻方：严格比较，正好在线上归守方 |
| 轮换营在后撤途中被卷入战斗 | 中止轮换（phase = None），按正常参战 |
| 回收车自己在回收途中被击伤 | 回收车按 `ApplyVehicleDamage` 进入流程；被回收物品保持 `NeedsRecovery` |
| 缴获关闭但物品为 `Captured` | 只计统计；物品不再参与任何系统 |

---

## 8. 测试用例

**T1 损伤等级抽样**：T-72B（`catastrophicGivenKill = 0.55`）被 Kornet（`ShapedCharge`，倍率 1.0）击穿并失去战斗力。`u1 = 0.40 < 0.55` → `Destroyed | Catastrophic`。若 `u1 = 0.70`：非殉爆，`u2 = 0.50` 落在 ShapedCharge 累积区间 [0.30, 0.65) → `DepotRepair`；`u3 = 0.6` → `Firepower`。同一车被 MAM-L（`TopAttack`，1.2）：殉爆阈值 `0.66`，`u1 = 0.62` → 殉爆。

**T2 修理工时**：`FieldRepairable | Mobility`，median 6 h，σ = 0.5，`z = 0.4` → `6 × e^0.2 = 7.328 h`。营维修班：5 名维修兵练度 0.6（`MechEff = 0.8`）+ 1 辆抢救车（2）→ 容量 6 工时/h；单件上限 4 → 第 1 小时修 4 工时，第 2 小时修 3.328 → 第 2 小时末修好（备件充足）。备件消耗 7.328 单位。

**T3 备件不足与拆东补西**：同 T2，第 1 小时需要 4 单位，营辎重队只有 1 单位；允许拆东补西，同旅有一辆同型号 `Destroyed`（非殉爆）在营辎重队 → 提供 40 单位：用 3 单位补足，剩 37 进库存，供体标记 `Cannibalized`。不允许时：`w' = 4 × 1/4 = 1` 工时，余量 6.328。

**T4 回收排队**：营有 1 辆抢救车（HeavyTracked 速度 3 m/s），两件待回收：T-72（价值 10，距营辎重队 3 km）与 BMP-2（价值 6，1 km）。T-72 先：`2 × 3000 / 3 / 3600 + 0.5 = 1.0556 h`；BMP-2：`2 × 1000/3/3600 + 0.5 = 0.6852 h`，开始于 1.0556 → 完成于 1.7407 h。第 1 小时末：都未完成；第 2 小时末：两件都 `AtTrains`。若威胁场 `TruckKillIntegral`（单程）= 0.01：每次 `λ = 0.01 × 1.5 × 2 = 0.03` → 回收车被击中概率 2.96%。

**T5 死于伤**：重伤 t0，营有 1 辆装甲救护车（4 床位），伤员到 BSA 距离 25 km，速度 8 m/s，威胁 0：往返 `2 × 25000/8/3600 = 1.736 h` → `evacCapacityPerH = 4 / 1.736 = 2.304 人/h`。该营同时 6 名重伤员：第 1 小时 floor(2.304) = 2 人后送（carry 0.304），第 2 小时 floor(2.608) = 2（carry 0.608），第 3 小时 floor(2.912) = 2。第 1 批到达 Role2 用时 = 1 h（排队到第 1 小时检查点：设 t0 恰为小时边界，则第一次处理在 t0+0）+ 0.868 h → delay 0.868 h → `pDow = 0.04 × (1 − 0.3 × 1.0) = 0.028`（卫生员覆盖 1.0）；第 3 批：处理于 t0+2 h，到达 2.868 h → `pDow = (0.04 + 0.05 × 1.868) × 0.7 = 0.0934`。

**T6 不四舍五入的重组**（总纲 §9.12(2) 的例子）：营有 3 个迫击炮班（模板各 5 人、1 门炮），战后分别剩 3、2、4 人，炮 3 门完好。`Consolidate`：第 1 班取 5 人（原属优先：3 + 从第 3 班取 2），Viable（5 ≥ ceil(0.75×5)=4，炮 crewMin 3 满足）；第 2 班剩余候选 4 人 → 4 ≥ 4 且 crewMin 满足 → Viable；第 3 班 0 人 → 不可用，1 门炮进待编池。结果：2 个可用班（5 人、4 人）+ 待编池 1 门炮，**总人数 9、炮 3 门守恒**。`KeepStructure`：第 1 轮保证每门炮 crewMin = 3：班 1（3）已满足、班 2（2）需 1、班 3（4）满足；从多余者（班 3 的第 4 人）补给班 2 → [3, 3, 3]；第 2 轮无剩余 → 三个班各 3 人。

**T7 补充分配（Even，整数化）**：两个营对 `rifleman` 需求 30 和 10，训练池 25 人：比例 18.75 / 6.25 → floor 18 / 6，余 1 人给小数部分大的（0.75 > 0.25）→ 19 / 6，合计 25。

**T8 战场控制**：攻方撤退（`AttackerWithdrew`），接触线 c = +500，攻方一辆 BMP-2 `FieldRepairable|Mobility` 在 y = −200：`AttackerHoldBandM = 1000` → `−200 ≥ 500 − 1000 = −500` → 归守方 → `u = 0.5 < CaptureP(MediumTracked) = 0.6` → `Captured`。若在 y = −800 → 攻方控制 → 保留回收。

**T9 故障**：老 T-72（`mtbfH = 120`），本小时行军 1 h，O&M 倍率 1.2、车况倍率 1.0：`λ = 1.2/120 = 0.01` → 故障概率 0.995%。行军 10 h 的营 31 辆坦克：期望故障 `31 × (1 − e^−0.1) = 2.95` 辆。

**T10 确定性与守恒**：对同一营重复执行 `ReorganizeWithinBattalion` 两次（无外部变化）→ 第二次不改变任何归属；任意重组前后，营的人员总数（名册 + 待编池 + 医疗）与装备总数不变。

---

## 9. 验证建议（对应计划 V1、V2、V5、V6）

脚本放在 `tools/validation/`，复用 03/04 的 Python 实现。

### V2 纳卡 2020（本文件提供损失结构的检验）

在 04 的 `v2_nk2020.py` 中启用本文件的全部流程（回收、修理、医疗、补充、遗弃/被俘），额外检查：

| # | 指标 | 合理区间（由 14 核定，H-13） |
|---|---|---|
| 1 | 亚方坦克损失中被俘比例 | 25%–55%（V2 #4，04 §9） |
| 2 | 阵亡 : 受伤（含轻伤）比例，双方 | 1 : 2 — 1 : 4（现代战争常见量级；无人机与炮兵为主、后送困难时偏向 1 : 2） |
| 3 | 44 天内修复后重新投入的装甲车辆占受损的比例（阿方 / 亚方） | 阿方明显高于亚方（控制战场 + 回收）；亚方 < 20% |
| 4 | 亚方抢救车数量 × 2 的反事实 | 永久损失下降，但下降幅度受“撤退中遗弃”限制（< 30%） |
| 5 | 补充：亚方动员兵进入后营平均练度下降 | 方向正确（单兵补充拉低练度） |

### V1 编制与缺编（本文件的“不四舍五入”与能力衰减）

`v1_resilience.py`：
- 对美式 9 人班、俄式 7 人班（BMP 载员）、解放军式班，按 03 §4.6.6 角色权重随机减员 0–60%，跑 §4.6.1 排内合并 + 03 乘员重分配，输出连的“能力衰减曲线”。**期望**：大班在 30% 减员时保留反装甲/压制能力的概率高于小班（总纲 §9.10(5)“大班更耐打”）；小班在同等总人数下班数更多。
- 反例对照：实现一个“按班四舍五入”的错误版本，在“营只有 3 个迫击炮班”的情形下统计能力误差，展示误差可达该能力的 33%–50%（总纲 §9.12(2) 的论据），证明本文件的做法必要。
- 两种 `ReorgPolicy` 在连续 5 场片段中的表现：`Consolidate` 下完整班更多但连数少；`KeepStructure` 下各连都在但能力分散。两者都不应在所有情形中占优（否则其中一个选项没有意义）。

### V5 无敌打法 / 漏洞

`v5_sustain_exploits.py`：
1. **轮换刷练度**：频繁整建制轮换是否让平均练度高于“一直在线 + 单兵补充”且战斗力不损失 → 若是，`RotationRetrainD` 或轮换期间的空缺代价不足。
2. **拆东补西无限**：大量 `Destroyed` 车辆作为供体能否让备件需求趋于 0 → 供体只能用一次（`Cannibalized`），检查生效。
3. **合并营刷骨干**：反复合并/拆分营是否能凭空产生骨干或装备 → 守恒断言必须通过（自动化：每次操作前后总数相等）。
4. **不回收也无所谓**：编制里 0 辆抢救车的部队长期表现是否与有抢救车者相同 → 若相同，回收机制失效（应在 44 天尺度上显著更差）。

### V6 计算性能

`v6_sustain_bench.py`：全战区（阶段 1 约 300 个营、约 15 万人、约 1 万件车辆/重装备），一次 `DamageRepair` 阶段（每小时）耗时外推到 C# ≤ 20 ms；`ReorganizeWithinBattalion` 单营 ≤ 1 ms；`PlatoonReorgInCombat` 每片段每步 ≤ 20 µs。热点预计在补充分配与重组的候选排序上；必要时只对“状态有变化”的营重算（脏标记，结果不变）。

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| H-01 | `VehicleDamageState` 的覆盖范围 | 所有车辆与班组武器以上的装备都用；轻武器只用 4 个等级值 | 一个组件覆盖全部装备，减少类型；轻武器不需要修理流程 | 车辆一个组件、武器另一个组件 |
| H-02 | 伤情只升不降 | 采用 | 简单、无歧义 | 每次命中独立累计 |
| H-03 | 损伤等级表数值 | 采用 §4.1.2 估计值，V2 复核 | 公开资料只有量级 | 按车型分别给表 |
| H-04 | 补充兵员到达时机 | 进入营待编池，只在休整时编入班 | 现实中补充兵在后方集结后再编入；也避免战斗中名册频繁变化 | 到达即编入（即使在交战） |
| H-05 | 待编池人员是否参战 | 不参战（在营辎重队承担勤务） | 让“凑不成班”的代价可见，也鼓励补充或合并 | 自动组成临时班参战 |
| H-06 | 跨专业维修 | 非维修专业不计维修能力 | 维修是技术专业；也让维修兵的培养（02 训练产能）有价值 | 按 `CrossTechnical` 打折计入 |
| H-07 | 备件单位定义与取用接口 | 1 单位 = 1 标准修理工时的零件；需要 06 提供 `TryDrawParts(holder, model, qty)` | 与工时直接挂钩，玩家能读懂“缺 40 小时的零件” | 按价值（美元）计 |
| H-08 | 拆东补西默认允许 | 是，旅可关 | 现实普遍；关掉是保住大修价值的选择 | 默认关 |
| H-09 | 大修预算不足时 | 排队等待（不修） | 预算是国防部长的决策 | 欠款继续修 |
| H-10 | 补充与归队使用 02 的 `DrawFromTrainedPool`、`JoinSquad`/`LeaveSquad`、`ReleaseToPool` | 采纳 | 补充与归队需要 | 07 直接改 02 的数据（违反归属） |
| H-11 | 合并/撤编命令的通道 | 作为“行政命令”走 09 的命令通道（有命令延迟，营不在战斗中才可执行） | 09 只定义了 3 种陆战命令；这是编制操作，不是机动 | 编辑器里即时生效 |
| H-12 | 缴获装备使用 | 做成可选开关，默认关；开时作为替代装备 | 总纲 §9.12(6) 标为可选；纳卡双方同型号使其有真实意义 | 不做 |
| H-13 | V2 中伤亡比例的目标区间 | 由 14 用公开统计核定，本文件给宽区间 | 避免臆造精确数字 | — |
| H-14 | 战俘交换与失踪人员的后续 | 阶段 1 不做；`MissingOrCaptured` 永久离队 | 范围控制 | 停火后按比例归还 |
| H-15 | 轻伤员在片段内继续战斗 | 与 03 C-13 一致：片段内 `WithUnit`，片段后进 Role1 | 两份规格统一 | — |
| H-16 | 整建制轮换的执行者 | 07 只发请求，12（编组 AI）安排替换与后撤 | 移动属于 09/12 | 07 直接下移动命令 |
| H-17 | 死于伤的判定时刻 | 到达 Role2 时一次判定（超时 24 h 强制判定一次） | 一次抽样、可手算 | 每小时风险累积 |
| H-18 | PeaceOpHoursFrac 初值 | 0.02 | 估算 | 由验证脚本定 |
| H-19 | ManPortable 大修工时 | 20 h | 估算 | — |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 医疗阶段 | `MedicalStage` | `WithUnit, AwaitingEvac, Evacuating, Role1, Role2, Hospital, ReturnedToDuty, Discharged, Dead` | 07 |
| 人员伤亡状态组件 | `PersonCasualtyState` | 每个受过伤的人的伤情、医疗阶段、原属单位 | 07 |
| 损伤等级 | `DamageLevel` | `Operational, FieldRepairable, DepotRepair, Destroyed, Abandoned, Captured` | 07 |
| 损伤标志 | `DamageFlags` | `Mobility, Firepower, Sensor, Catastrophic, Mine, Breakdown, Cannibalized` | 07 |
| 损伤原因 | `DamageCause` | `Combat, Mine, Interdiction, Breakdown, Strike, Scuttled`（06 引用） | 07 |
| 弹药毁伤组 | `MunitionGroup` | 由 03 `MunitionKind` 映射的 6 组，用于损伤等级表 | 07 |
| 回收状态 | `RecoveryState` | `NeedsRecovery … AtDepot` | 07 |
| 回收类别 | `RecoveryClass` | `HeavyTracked, MediumTracked, Wheeled, Towed, ManPortable` | 07 |
| 可靠性属性 | `ReliabilityProfile` | 故障间隔、备件消耗、修理工时、大修费用、启封备件 | 07 |
| 备件单位 | （定义） | 1 单位 = 该型号 1 个标准修理工时的零件 | 07 |
| 修理队列 / 医疗队列 | `RepairQueue` / `MedicalQueue` | 营/旅维修队列；营后送队列 | 07 |
| 大修单 | `DepotRepairOrder` | 后方大修记录 | 07 |
| 重组范围 | `ReorgScope` | `Platoon, CompanyBattalion, InterBattalion` | 07 |
| 旅保障设置 | `BrigadeSustainSettings` | 重组策略、补充方式、是否拆东补西 | 07 |
| 轮换状态 | `RotationState` / `RotationPhase` | 整建制轮换的阶段 | 07 |
| 补充请求 | `ReplacementRequest` | 发给 06 的运输请求 | 07 |
| 补充需求 | `ReplacementNeeds` | 模板 − 实际 − 待编 − 预计归队/修复 − 在途 | 07 |
| 满编率报告 | `FillRateReport` | 人员、专业、装备、能力各项满编率 | 07 |
| 损失状态汇总 | `LossStatusSummary` | 永久 / 可修 / 已修 / 遗弃 / 医疗 | 07 |
| 跨专业系数 | `CrossTrainFactor` | 非对口人员操作某岗位时的练度系数 | 07（03 调用） |
| 缴获池 | `CapturedPool` | 国家级缴获装备（可选使用） | 07 |
