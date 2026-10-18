# 09 时间推进、命令与战斗触发

> 归属：`GameClock`、`SimTime`、`Tick`、`TickPhase`、`GameSpeed`、`Order`、`OrderDelay`、`LandOrderType`、`MarchMode`、`TileControl`、`SimBudgetScheduler`（见 00 §4.2）。
> 依据：总纲 §11、§12.1、§13、§9.3④、§21-1；00 §3.2、§5、§6。
> 标记：✅ 总纲已确认；🟡 建议待确认（本文件编号 `T-xx`，汇总在第 10 节）；00 的 🟡 `G-xx` 视为已暂定采用。

> [!IMPORTANT]
> **✅ 设计者拍板定案覆写（Round 3 最终确认，最高优先级，见 [decisions_A_level.md](../review/decisions_A_level.md)）**：
> 1. **自上而下的命令延迟倒置与逐级传导（覆写 `T-01 / DC-010`）**：
>    - 玩家扮演最高统帅部（国防部长）。**统帅部直接向高层指挥部下令的初始通联延迟更短**：集团军/军 `BaseInitialDelay = 30 min`，师 `45 min`，旅 `60 min`。
>    - 命令到达受令指挥部后，若需向下一级传导（`Corps → Division → Brigade → Battalion`），每向下传导一级叠加该级指挥部的计划与通联延迟：
>      $$\Delta t_{\text{step}}(h) = \text{StepBaseMin}(h) \cdot f_{\text{hq}}(h) \cdot f_{\text{load}}(h) \cdot f_{\text{org}}(h) \cdot f_{\text{emcon}}(h) \cdot f_{\text{ew}}(h)$$
>      其中旅→营基准 $\text{StepBaseMin} = 30\,\text{min}$（师→旅 $40\,\text{min}$，军→师 $45\,\text{min}$），组织度修正 $f_{\text{org}} = \text{ clamp}(1.5 - 0.5 \cdot \text{organization},\, 1.0,\, 2.0)$。
>    - **越级直接指挥建制营惩罚**：若玩家跳过所属旅部直接对普通建制营下达命令，承受高额越级基础延迟 `DirectBattalionPenaltyBase = 180 min`（再乘各项修正）；**唯有特种部队营（SOF）享受最高统帅部直通链路 `SofDirectBase = 15 min`**。
> 2. **取消手动 `FireSupportPriority` 配置项（覆写 `DC-022`）**：从 `UnitConfigField` 中移除 `FireSupportPriority = 9`，旅属炮兵由 `04` 自动按态势排优。
> 3. **默认自动暂停规则包含“我方营被包围”（`DS-037`）**：`UnitEncircled` 默认开启自动暂停。

---

## 1. 目标与范围

**解决的问题**
1. 一个伪即时制的全局时钟（精度 1 分钟 ✅），让各系统按各自频率、按 00 §5.2 的固定阶段顺序推进，结果可复现。
2. 玩家和 AI 的命令走同一条通道，有**命令延迟**（🟡 §11.1.1），使“指挥通信装备”成为有价值的采购、使频繁改命令有代价。
3. 地块层的营怎么行军、过边、触发交界边战斗、怎么结束战斗、地块控制权怎么变。
4. 时间预算调度：哪些交界边战斗的连级片段用 `FidelityTier.Full`（实时班级模拟），哪些用 `Cached`。**只用固定规则，不看机器性能**（G-21）。
5. 通知列表与自动暂停的触发事件。
6. 昼夜（按地块中心的太阳高度）。

**阶段 0 包含**：`GameClock`、`TickPhase` 调度循环、速度档位与暂停、命令通道与命令延迟公式（试验场里用于“营/旅命令延迟”的对比）、`SimBudgetScheduler`（试验场批量跑时全部 `Full` 或全部 `Cached`，可配置）、昼夜函数。
**阶段 1 增加**：地块层移动与过边、战斗触发与结束判定、`TileControl`、跨地块侦察/打击命令、空中任务与后勤配置命令的路由、通知与自动暂停事件。
**不包含**：条带内部的机制（04）、片段内部（03）、空中任务的执行（08）、后勤流（06）、通知界面和过滤器的界面（13）、事件日志的存储格式（15）。
**阶段 2+**：`FidelityTier.Proxy`（远方战争按代理模型日结，调度规则在本文件，结算在 12）；多人模式的输入同步（15）；三方以上同一地块的冲突。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单
| 决策 | 说明 | 对应机制 |
|---|---|---|
| 暂停 / 调速 | 5 档速度 + 暂停；暂停时可下任何命令 | §4.2 |
| 给营或编组下 `Move`（移动/进攻/防守） | 目标是相邻或远处地块；移动进有敌军的地块 = 进攻；不动 = 防守 | §4.4、§4.6 |
| 下 `CrossTileRecon` | 给侦察单位划区域任务、或派特种部队 | §4.3 → 05 |
| 下 `CrossTileStrike` | 远程火力营打地块/已发现目标/节点 | §4.3 → 04 |
| 派空中任务 | 08 的任务类型；本文件只做路由 | §4.3 → 08 |
| 后勤与单位配置 | 前进后勤中心、储备目标、行军方式、电磁管控、拦截策略、补充方式等 | §4.3 |
| 标星单位 | 影响自动暂停和精度档调度（是**模拟输入**，会记入输入日志） | §4.8 |
| 精度档设置 `FidelityProfile` | Low / Standard / High（每局可改，改动是模拟输入） | §4.8 |
| 自动暂停过滤条件 | 只影响界面，不影响模拟 | §4.9 |

**取舍点（必须让玩家感受到）**
- 改命令要付出时间：命令延迟重新计算（§4.3.4）。
- 好的指挥部/通信装备 → 更短延迟；旅部离营太远、营配属到别的旅 → 更长延迟。
- 营走得越远，过边越久（纵队长度 ÷ 速度），过边中特征值最高（05）。
- 疏散行军更安全但更慢、过边更久。

### 2.2 反馈清单
| 反馈 | 内容 | 数据来源 |
|---|---|---|
| 命令卡 | 每条命令显示：下令时刻、**预计生效时刻**、延迟构成（基础 × 指挥部 × 负荷 × 干扰 × 状态 × 配属 × 距离，逐项给数值） | `OrderDelayBreakdown` |
| 单位状态栏 | 姿态（`Posture`）、当前命令、待生效命令倒计时、过边进度 % | `BattalionMoveState` |
| 地图 | 地块控制权颜色、“无人防守”斜线、行军箭头、过边中的营画在边上 | `TileControl`、`BattalionMoveState` |
| 时钟 | 游戏时刻（UTC 和本地显示）、目标速度与实际达到的速度（算不过来时实际速度会低于目标） | `GameClock` |
| 昼夜 | 地图明暗、单位卡上的“夜间”标记 | `GetLightCondition` |
| 精度档 | 每场交界边战斗标“实时 / 缓存”；为什么（星标、规模、关键地块、预算不足） | `FidelityAssignment` |
| 通知列表 | 战斗开始/结束、地块易手、阶段战报、单位失去战斗力、首次遇到新敌型等 | `Notification` |

---

## 3. 数据结构

> 全部在命名空间 `MoD.Sim.Time`（时钟、调度）、`MoD.Sim.Orders`、`MoD.Sim.Land`（移动、控制权）。所有 ID 为强类型（00 §2.2）。

### 3.1 时间
```csharp
// 00 §3.3：自 1990-01-01T00:00:00 UTC 的毫秒数
public readonly record struct SimTime(long ms) {
    public long Tick => ms / 60000;                       // 刻号（ms ≥ 0，整除即 floor）
    public static SimTime FromTick(long tick) => new(tick * 60000);
}

public enum TickPhase : int {        // 值 = 00 §5.2 的“序”；只能追加
    AiDecision = 10, OrderIntake = 20, Calendar = 30, Logistics = 40, Exposure = 50,
    LandMovement = 60, BattleLifecycle = 70, StripStep = 80, AirStep = 90,
    EngagementStep = 100, GroundEventApply = 110, Consumption = 120,
    DamageRepair = 130, BattleEnd = 140, Reporting = 150, Checksum = 160
}

public sealed class GameClock {
    public long currentTick;          // 下一个要执行的刻号 n；世界状态处于时刻 n 分
    public GameSpeed speed;           // 目标速度（不影响模拟结果）
    public bool isPaused;
    public PauseReasons pauseReasons;  // [Flags]；全部清零才恢复
    public double achievedGameMinPerRealS;   // 实测达到的速度，只给界面
}

public enum GameSpeed : int { Speed1 = 1, Speed2 = 2, Speed3 = 3, Speed4 = 4, Speed5 = 5 }

[Flags] public enum PauseReasons : int {   // 类型名按 00 §2.4 用复数
    None = 0, Player = 1, AutoPauseBattle = 2, AutoPauseEvent = 4, Modal = 8, Loading = 16
}
```
### 3.2 命令
```csharp
public readonly record struct OrderId(int value);    // 0 = 空；按创建顺序分配（00 §2.2）

public enum OrderDomain : int { None = 0, Land = 1, Air = 2, Logistics = 3, UnitConfig = 4, OrgAdmin = 5 }   // 5：编制操作（DC-041）

public enum LandOrderType : int { None = 0, Move = 1, CrossTileRecon = 2, CrossTileStrike = 3 }   // ✅ 只有三种

public enum OrderClass : int {
    Planned = 0,        // 移动/进攻/打击/侦察：完整延迟
    Reactive = 1,       // 编组 AI 自主的就地重新分配（同地块内换边、投入地块预备队）
    UrgentSimple = 2,   // 停止并就地防御、改行军方式、改电磁管控/拦截策略
    Administrative = 3, // 纯配置开关（后勤配置、补充方式、重组策略、拆东补西、储备目标、分配策略、电磁管控以外的开关）：无命令延迟（由各系统自身的执行时间体现）（DC-041）
    Forced = 4,         // 系统强制（地块失守后的被迫撤退、停火移交撤出）：无延迟、不可被玩家取消
    OrgAdministrative = 5   // 编制操作（合并营/合并连/撤编，07 §4.6.3）：按营级公式计算命令延迟（M_class 同 Planned），
                            // 生效时所涉营都不在战斗中才执行，否则保持 Pending 逐刻重试（DC-041、07 H-11）
}

public enum OrderStatus : int {
    None = 0, Pending = 1,     // 已下达，未生效
    Active = 2,                // 已生效，正在执行
    Completed = 3, Superseded = 4, Cancelled = 5, Failed = 6
}

public enum OrderSource : int { None = 0, Player = 1, Ai = 2, System = 3 }

public enum OrderSlot : int {     // 同一单位同一槽位只能有 1 条 Pending + 1 条 Active
    None = 0, Movement = 1, Strike = 2, Recon = 3, Config = 4, Air = 5, Logistics = 6, OrgAdmin = 7
}

public enum OrderFailReason : int {   // Validate 的失败原因（ValidateOrder 公开返回；写进 OrderFailed 通知）；只能追加
    None = 0, RecipientMissing = 1, NotOwner = 2, PathUnreachable = 3, OutOfStrikeRange = 4,
    NotIndependentFireBattalion = 5,
    PeacetimeBorder = 6, Ceasefire = 7, PeacekeepingZone = 8, EndUseRestricted = 9,   // 6–9 = 11 OrderBlockReason 1–4
    InvalidPayload = 10, EncircledCannotAdmin = 11
}

public sealed class Order {
    public OrderId id;
    public CountryId issuer;
    public OrderSource source;
    public OrderDomain domain;
    public LandOrderType landType;          // domain == Land 时有效
    public OrderClass orderClass;
    public OrderSlot slot;
    public OrderRecipient recipient;        // 见下
    public SimTime issuedAt;                // 下令时刻（= 下达那一刻的起点，00 §5.1）
    public SimTime effectiveAt;             // 生效时刻（ms 精度）
    public long effectiveTick;              // = ceil(effectiveAt.ms / 60000)
    public OrderStatus status;
    public OrderId parentOrderId;           // 编组命令分解出的子命令指向父命令；否则 0
    public IOrderPayload payload;
    public OrderDelayBreakdown delay;       // 计算明细（界面 + AI 调试）
}

public readonly record struct OrderRecipient(
    RecipientKind kind,          // Battalion / Formation / Company（特种部队连）/ Flight / Country（后勤配置）
    int entityId);               // 对应强类型 ID 的 value

public enum RecipientKind : int { None = 0, Battalion = 1, Formation = 2, Company = 3, Flight = 4, Country = 5, LogisticsNode = 6 }
```

**命令内容（payload）**
```csharp
public interface IOrderPayload { }

public sealed class MoveOrderPayload : IOrderPayload {
    public List<ulong> destinationTiles;   // H3Index。营：恰好 1 个；编组：1..MaxFormationSectorTiles 个（🟡 T-04）
    public List<ulong> path;               // 由寻路生成的地块序列（不含当前地块）；空 = 就地停止并防守（Halt）
    public MarchMode marchMode;            // 不填则沿用单位当前设置
}
// Halt = MoveOrderPayload 且 path 为空，orderClass = UrgentSimple。

public sealed class CrossTileReconPayload : IOrderPayload {
    public ReconTaskKind kind;             // AreaRecon / SofMission
    public List<ulong> areaTiles;          // AreaReconTask（05）的区域；SofMission 用 areaTiles[0]
    public List<TilePriority> tilePriorities;   // AreaRecon 用：与 areaTiles 一一对应（05）
    public List<ReconAssetRef> assets;     // AreaRecon 用：分配的侦察资产（05）
    public ExposureLevel desiredLevel;     // AreaRecon 用：想达到的暴露等级（05）
    public ReconRiskTolerance risk;        // AreaRecon 用（05）
    public double durationDays;            // SofMission 用；AreaRecon = 0 表示持续
    public double reportIntervalH;         // SofMission 用：回报间隔（05）
    public SofInsertion insertion;         // SofMission 用（05）
    public SofInsertion extraction;        // SofMission 用
}
// SofMission 的特种部队连 = Order.recipient（RecipientKind.Company）。
public enum ReconTaskKind : int { None = 0, AreaRecon = 1, SofMission = 2 }

public sealed class CrossTileStrikePayload : IOrderPayload {
    public StrikeTargetKind targetKind;    // Tile（按暴露度自动选目标）/ KnownUnit / LogisticsNode / Bridge / AirDefenseUnit / Loc
    public ulong targetTile;
    public ulong targetEntityId;           // KnownUnit: OrgUnitId（营级 OrgUnit）；LogisticsNode: NodeId；Bridge: CrossingId.value（10）
    public int munitionModelHandle;        // 0 = 自动选
    public int roundsPerSalvo;             // 0 = 系统建议值（04 计算）
    public StrikeRepeat repeat;            // Once / UntilDestroyed / Count
    public int repeatCount;
    public IntelSnapshot intelAtIssue;     // 下令时的情报快照（✅ §11.1.1：打击用下令时的情报）
}
public enum StrikeTargetKind : int { None = 0, Tile = 1, KnownUnit = 2, LogisticsNode = 3, Bridge = 4, AirDefenseUnit = 5, Loc = 6 }
public enum StrikeRepeat : int { None = 0, Once = 1, UntilDestroyed = 2, Count = 3 }

public readonly record struct IntelSnapshot(ExposureLevel level, SimTime intelTimestamp, double posErrorM, Posture observedPosture);   // 05 GetExposure 返回

public sealed class AirMissionOrderPayload : IOrderPayload { public object missionSpec; } // 内容由 08 定义（AirMission）
public sealed class LogisticsConfigPayload : IOrderPayload { public object configChange; } // 内容由 06 定义
public sealed class OrgAdminPayload : IOrderPayload {           // OrderDomain.OrgAdmin，orderClass = OrgAdministrative，slot = OrgAdmin
    public OrgAdminKind kind;
    public OrgUnitId a, b, c;   // MergeBattalions：a = keep 营、b = absorb 营（recipient = a）；MergeCompanies：a = 营、b = keep 连、c = absorb 连；DisbandBattalion：a = 营
}
public enum OrgAdminKind : int { None = 0, MergeBattalions = 1, MergeCompanies = 2, DisbandBattalion = 3 }   // 生效时调 07 同名函数（07 §4.6.3）
public sealed class UnitConfigPayload : IOrderPayload {
    public UnitConfigField field;          // MarchMode / Emcon / InterceptPolicy / ReplacementMode / ReorgPolicy / AllocationPolicy / DeployDecoys / RelocateAfterFiring / FireSupportPriority / AllowCannibalization / AttachTo
    public int newValue;                   // 对应枚举的整数值
}
public enum UnitConfigField : int { None = 0, MarchMode = 1, Emcon = 2, InterceptPolicy = 3, ReplacementMode = 4, ReorgPolicy = 5, AllocationPolicy = 6,
                                    DeployDecoys = 7, RelocateAfterFiring = 8, FireSupportPriority = 9,   // 7：05 ReconConfig.deployDecoys（0/1）；8：发射后转移开关（0/1，08/13）；9：旅的 04 `FireSupportPriority`（值 = 枚举整数，生效时调 04 `SetFireSupportPriority`）
                                    AllowCannibalization = 10,   // 旅的 07 `BrigadeSustainSettings.allowCannibalization`（0/1，07 H-08）；orderClass = Administrative
                                    AttachTo = 11 }              // 营配属：newValue = 目标 FormationId.value（0 = 解除配属）；生效时调 01 `Attach` / `Detach`（01 §4.12）；orderClass = Planned（有命令延迟，01 §4.12“走 09 命令延迟”）

public sealed class OrderDelayBreakdown {
    public OrgLevel echelon;               // 计算用的层级
    public long baseMs;
    public double classMult, fHq, fLoad, fJam, fState, fAttach, fDist, fHeadless, fEmcon, fReorg;
    public long totalMs;                   // 夹在 [MinDelayMs, MaxDelayMs] 之后
}
```

### 3.3 地块层移动（组件，键 = `OrgUnitId`，营级 OrgUnit）
```csharp
public enum MarchMode : int { Dense = 1, Dispersed = 2 }         // 00 G 表；不叫 Formation

public enum MovePhase : int {
    None = 0,             // 驻止在地块内
    Approach = 1,         // 纵队头部在本地块内，朝向边
    Crossing = 2,         // 头已过边、尾未过边（Posture.CrossingEdge）
    Depart = 3,           // 尾已过边，朝目的地块中心
    HeldAtEdge = 4,       // 头到边，目的地块有敌 → 已触发/加入交界边战斗，等待战斗结果
    WaitingDisengage = 5  // 已下撤退命令，等 04 完成脱离接触
}

public sealed class BattalionMoveState {
    public OrgUnitId battalionId;          // 营级 OrgUnit
    public ulong currentTile;              // 地块归属（00：营每时刻只属于一个地块）
    public ulong legFromTile, legToTile;   // 当前一段（相邻两格）；驻止时 = currentTile, 0
    public double legLengthM;              // 两格中心的距离（10 的预计算表）
    public double edgeAtM;                 // 从 legFromTile 中心到交界边中点的距离（10 的表）
    public double headProgressM;           // 纵队头部沿本段走过的距离 [0, legLengthM]
    public double columnLengthM;           // 纵队长度 §4.4.1
    public double speedMps;                // 本段行军速度 §4.4.2
    public double distanceMovedLastHourM;  // 上一小时纵队头部走过的距离（LandMove.Step 累加，整点重置；06 每小时油耗用）
    public MovePhase phase;
    public Posture posture;                // 00 的 Posture；05 读它算特征值
    public MarchMode marchMode;
    public List<ulong> remainingPath;      // 本段之后还要走的地块
    public OrderId activeMoveOrder;
    public EdgeBattleId heldInBattle;      // phase == HeldAtEdge 时
    public SimTime lastPhaseChangeAt;      // 精确到 ms（插值得到）
    public SimTime arrivedTileAt;          // 进入 currentTile 的时刻（用于遭遇战判定）
    public SimTime postureSince;           // 当前姿态开始的时刻（GetPostureHours）
    public bool isFrozen;                  // §4.11 FreezeBattalion（维和区内无路可撤）
}

public sealed class EntrenchState {        // 组件，键 = OrgUnitId（营级）；DC-165 ①
    public OrgUnitId battalionId;
    public double progress;                // [0,1] 地块层挖壕进度；04 读作 fortLevel 初值，13 显示
    public ulong tile;                     // 进度所属地块；营离开该地块（currentTile 改变）即清零
}
```

### 3.4 地块控制权
```csharp
public sealed class TileControl {          // 每个陆地地块一条；静态地块也有（数据量小）
    public ulong tile;
    public CountryId controller;           // 0 = 无（海外/未分配）
    public bool isUndefended;              // controller 方在此地块没有营
    public SimTime controlSince;
}
```

### 3.5 战斗触发与结束（09 的判定数据；`EdgeBattle` 本身归 04）
```csharp
public enum BattleTriggerKind : int { None = 0, Attack = 1, Meeting = 2 }   // 反冲击不新建战斗（§4.6.4）

public readonly record struct BattleTrigger(
    EdgeId edge, CountryId attacker, CountryId defender,
    BattleTriggerKind kind, OrgUnitId triggeringBattalion, SimTime atTime);   // 营级 OrgUnit

public enum BattleEndReason : int {
    None = 0, TileCaptured = 1, AttackerStopped = 2, AttackerWithdrew = 3,
    DefenderWithdrew = 4, DefenderIneffective = 5, MutualAnnihilation = 6, WarEnded = 7
}
```

### 3.6 精度档调度
```csharp
public enum FidelityTier : int { Full = 1, Cached = 2, Proxy = 3 }           // 00 术语表
public enum FidelityProfile : int { Low = 1, Standard = 2, High = 3, AllFull = 4, AllCached = 5 } // 后两项只给试验场/调试

public sealed class SimBudgetScheduler {
    public FidelityProfile profile;
    public long windowStartTick;           // 当前小时窗口起点（n % 60 == 0）
    public double budgetPairMin;           // 本窗口总预算（pair-minutes）
    public double reservedPairMin;         // 已预留
    public SortedDictionary<int, FidelityAssignment> assignments;   // 键 = EdgeBattleId.value
}

public sealed class FidelityAssignment {
    public EdgeBattleId battleId;
    public FidelityTier tier;
    public double priority;
    public double estCostPairMin;
    public FidelityReason reason;
}
public enum FidelityReason : int { None = 0, Starred = 1, WithinBudget = 2, OverBudget = 3, ProfileForced = 4, RemoteWar = 5 }
```

### 3.7 通知
```csharp
public enum NotificationKind : int {
    None = 0, BattleStarted = 1, BattleEnded = 2, TileCaptured = 3, TileLost = 4,
    PeriodicBattleReport = 5, UnitCombatIneffective = 6, NewEnemyTypeObserved = 7,
    OrderFailed = 8, UnitEncircled = 9, AirMissionResult = 10, SupplyCut = 11,
    CrisisEvent = 12, WarStateChanged = 13, ReserveGap = 14,  // 14：06 §4.11 储备缺口
    InfraChanged = 15,          // 10 §4.10 dated override 生效（10 F7）；tile = 边一端地块，refId = overrideId；audience = 每个可玩国家
    StarredAiDecision = 16      // 12 §4.10：星标单位的编组 AI 调整（低优先级，默认不自动暂停）；refId = 12 原因码
}

public sealed class Notification {
    public long seq;                       // 全局单调递增（存档保存）
    public NotificationKind kind;
    public SimTime at;
    public CountryId audience;             // 只给这个国家的玩家看
    public EdgeBattleId battleId;          // 可空
    public ulong tile;                     // 可空
    public List<int> unitIds;              // 涉及的营（OrgUnitId.value，营级 OrgUnit，升序）
    public BattleSummaryStats stats;       // BattleEnded/PeriodicBattleReport 时有
    public bool involvesStarred;           // 由本系统在生成时算好
    public OrderId orderId;                // OrderFailed：失败的命令；其他 = 0
    public OrderFailReason failReason;     // OrderFailed 时有效
    public string refId;                   // 可空：InfraChanged 的 overrideId、StarredAiDecision 的原因码、CrisisEvent 的事件 id
}

public sealed class BattleSummaryStats {
    public int companiesTotal;             // 双方投入的连数之和
    public int ownPersonnelLost, ownVehiclesLost;
    public double ownLossFraction;         // 我方损失人员 / 我方投入人员
    public BattleEndReason endReason;
}
```

---

## 4. 算法与公式

### 4.1 刻循环（`RunTick`）

**周期表**（`n` = 当前刻号；全部来自 00 §3.2 / §5.2）

| 阶段 | 条件 | 备注 |
|---|---|---|
| 10 `AiDecision` | 战略/作战 AI：`n % 60 == 0`；编组 AI：`n % StripStepMinutes == 0`；和平时期国家 AI：`n % 1440 == 0` | 12 |
| 20 `OrderIntake` | 每刻 | 本文件 §4.3 |
| 30 `Calendar` | 年：`n` 是 1 月 1 日 00:00；日：`n % 1440 == 0`；时：`n % 60 == 0`；同刻内顺序 年 → 日 → 时 | 11 → 01 → 02 → 07 → 12（01 = 指挥状态、需求表） |
| 40 `Logistics` | `n % 60 == 0` | 06 |
| 50 `Exposure` | `n % ExposureStepMinutes == 0`（10） | 05 |
| 60 `LandMovement` | `n % LandMoveStepMinutes == 0`（10） | 本文件 §4.4 |
| 70 `BattleLifecycle` | 同 60 | 本文件 §4.6 → 04 |
| 80 `StripStep` | `n % StripStepMinutes == 0`（5）；可选错峰见 T-20 | 04 |
| 90 `AirStep` | `n % AirStepMinutes == 0`（缺省 1 = 每刻） | 08 |
| 100 `EngagementStep` | 每刻 | 03 |
| 110 `GroundEventApply` | 每刻 | 04/06/07 |
| 120 `Consumption` | `n % 60 == 0`（地块层驻止部队）；片段内消耗已在 100 由 03 完成，条带消耗已在 80 第 10 步由 04 完成，本阶段不再重复 | 06 |
| 130 `DamageRepair` | `n % 60 == 0` | 07 |
| 140 `BattleEnd` | `n % StripStepMinutes == 0` | 本文件 §4.7（判定）、04（写回） |
| 150 `Reporting` | 每刻 | 15/13；本文件 §4.9 |
| 160 `Checksum` | `n % ChecksumIntervalMin == 0`（常数归 15）且（调试或多人） | 15 |

另外，本文件在 30 `Calendar` 的“时”分支里做精度档窗口重置（§4.8.2），在 150 `Reporting` 阶段检查 24 小时阶段战报到期（§4.7.4，按每场战斗自己的开始时刻计，00 §5.2）。

```csharp
void RunTick(World w) {
    long n = w.clock.currentTick;
    var t0 = SimTime.FromTick(n);
    bool hour = n % 60 == 0, day = n % 1440 == 0, year = IsJan1Midnight(n);
    bool strip = n % C.StripStepMinutes == 0;
    bool land  = n % C.LandMoveStepMinutes == 0;
    bool expo  = n % C.ExposureStepMinutes == 0;

    if (hour) Ai.RunStrategic(w, n);                    // 10（12）
    if (strip) Ai.RunFormation(w, n);                   // 10（12）
    if (day)  Ai.RunPeacetimeCountry(w, n);             // 10（12）
    Orders.Intake(w, n);                                // 20 §4.3
    if (year) Calendar.Year(w, n);                      // 30
    if (day)  { Calendar.Day(w, n); }
    if (hour) { Calendar.Hour(w, n); Scheduler.OpenWindow(w, n); }
    if (hour) Logistics.Step(w, n);                     // 40
    if (expo) Exposure.Step(w, n);                      // 50
    if (land) { LandMove.Step(w, n);                    // 60 §4.4
                Battles.Lifecycle(w, n); }              // 70 §4.6
    if (strip) Strip.StepAll(w, n);                     // 80（04，按 EdgeBattleId 升序）
    if (n % C.AirStepMinutes == 0) Air.Step(w, n);      // 90
    Engagements.StepAll(w, n);                          // 100
    GroundEvents.Apply(w, n);                           // 110
    if (hour) Consumption.Step(w, n);                   // 120（只做地块层驻止部队；03 在 100、04 在 80 已扣）
    if (hour) DamageRepair.Step(w, n);                  // 130
    if (strip) Battles.End(w, n);                       // 140 §4.7
    Battles.CheckPeriodicReports(w, n);                 // 150 §4.7.4（每刻检查各战斗自身的 24h 锚点）
    Reporting.Step(w, n);                               // 150 §4.9
    if (n % C.ChecksumIntervalMin == 0 && w.checksumEnabled) Checksum.Step(w, n); // 160（ChecksumIntervalMin 归 15）
    w.clock.currentTick = n + 1;
}
```
**规则**
1. 一刻是原子的：暂停、存档、读档只发生在两刻之间（`currentTick` 已加 1 之后）。
2. 阶段内多实体的执行顺序按 00 §6.4（ID 升序或给定全序）；并行执行的阶段必须满足 00 §5.2 同步规则 6（共享写缓冲、阶段末按（资源 ID，请求者 ID）升序应用）。
3. 本循环**不读取**真实时间、帧率、线程数。

### 4.2 速度档位与暂停

| 档位 | 游戏分钟 / 真实秒 | 说明 |
|---|---|---|
| `Speed1` | 1 | 最慢（✅ §11.1 “每秒 1 个游戏分钟”） |
| `Speed2` | 5 | 一个条带步 / 秒 |
| `Speed3` | 20 | |
| `Speed4` | 60 | 1 游戏小时 / 秒 |
| `Speed5` | 240 | 4 游戏小时 / 秒（“最快每秒几个游戏小时”） |

**驱动（`MoD.Game` 层；模拟核心只提供 `RunTick`）**
```csharp
// 模拟线程循环
double debtTicks = 0;
while (running) {
    if (clock.isPaused) { WaitForSignal(); continue; }
    double realDtS = MonotonicNowS() - lastS; lastS = MonotonicNowS();
    debtTicks += realDtS * RateMinPerS(clock.speed);
    debtTicks = Math.Min(debtTicks, C.MaxTickDebt);      // 落后太多时丢弃“欠账”，即降低实际速度，绝不跳过刻
    while (debtTicks >= 1 && !clock.isPaused) {
        RunTick(world); debtTicks -= 1;
        PublishSnapshotIfDue();                          // 界面读快照，不直接读世界
    }
    SleepUntilNextFrame();
}
```
- 算不过来时实际速度变慢（界面显示 `achievedGameMinPerRealS`）；**不得**为了赶速度而改变任何模拟行为（G-21，T-12）。
- 暂停：设置 `pauseReasons` 的某一位即在当前刻结束后停止；全部位清零才继续。玩家点“继续”只清 `Player` 和 `AutoPause*` 位。
- 界面调用的时钟接口：`SetPlayerPause(bool paused)`（置/清 `PauseReasons.Player`；清除时一并清 `AutoPause*`）、`SetSpeed(GameSpeed s)`（写 `clock.speed`）、`SetFidelityProfile(FidelityProfile p)`（写 `SimBudgetScheduler.profile`，在下一个小时窗口 §4.8.2 生效）。按 15 §4.8：暂停与速度**不是输入**、不记日志；`SetFidelityProfile` 影响模拟，记 `InputKind.FidelityProfile = 4`。
- 暂停中下的命令：`issuedAt = SimTime.FromTick(clock.currentTick)`（下一个将执行的刻起点），在该刻的 `OrderIntake` 处理（00 §5.1）。
- 界面时钟平滑：显示时间 = 最近快照刻 + 插值（只用于显示）。

### 4.3 命令通道与命令延迟

#### 4.3.1 下达（玩家或 AI 调用 `SubmitOrder`）
```csharp
OrderId SubmitOrder(World w, Order o) {
    o.id = w.ids.NextOrderId();                // 00 §2.2：顺序分配
    o.issuedAt = SimTime.FromTick(w.clock.currentTick);
    o.status = OrderStatus.Pending;
    w.orderInbox.Add(o);                       // 本刻 OrderIntake 处理；AI 在 10 阶段提交的也在同刻 20 处理
    if (o.source == OrderSource.Player)
        InputLog.Append(InputKind.Order, CanonicalBytes(o));   // 15：输入日志（仅 Player 来源；AI 命令可由回放重算，不记）
    return o.id;
}
```

#### 4.3.2 `OrderIntake`（每刻）
```csharp
void Intake(World w, long n) {
    // 1. 新命令：按 (source 升序: Player<Ai<System, issuer, id) 全序排序后处理
    foreach (var o in w.orderInbox.OrderBy(x => (int)x.source).ThenBy(x => x.issuer.value).ThenBy(x => x.id.value)) {
        var err = ValidateOrder(w, o);
        if (err != OrderFailReason.None) { o.status = OrderStatus.Failed; Notify(OrderFailed, o, err); continue; }   // 通知写 orderId、failReason
        if (o.recipient.kind == RecipientKind.Formation && o.domain == OrderDomain.Land)
            ExpandFormationOrder(w, o);        // §4.3.5：生成子命令，父命令保持 Pending 直到全部子命令生效
        else
            ScheduleSingle(w, o, n);
    }
    w.orderInbox.Clear();
    // 2. 激活：所有 Pending 且 effectiveTick <= n 的命令，按 (effectiveAt.ms, id) 升序
    foreach (var o in w.pendingOrders.Where(x => x.effectiveTick <= n).OrderBy(x => x.effectiveAt.ms).ThenBy(x => x.id.value).ToList())
        Activate(w, o);                        // §4.3.6
}

void ScheduleSingle(World w, Order o, long n) {
    SupersedePending(w, o.recipient, o.slot);   // §4.3.4
    o.delay = ComputeDelay(w, o);               // §4.3.3
    o.effectiveAt = new SimTime(o.issuedAt.ms + o.delay.totalMs);
    o.effectiveTick = (o.effectiveAt.ms + 59999) / 60000;   // ceil
    w.pendingOrders.Add(o);
}
```
- 延迟为 0 的命令在同一刻的第 2 步就被激活。
- `OrgAdministrative` 命令到期激活时，若 `a/b`（MergeCompanies 为 `a`）任一营 `IsInBattle` → 保持 `Pending`，下一刻再试（玩家可取消）；否则调用 07 `MergeBattalions(a, b)` / `MergeCompanies(a, b, c)` / `DisbandBattalion(a)` 并 `Completed`。
- `OrderFailReason ValidateOrder(World w, Order o)`（公开纯函数；13 下令前预检、本步正式校验用同一函数），按下列顺序取第一个失败：
  1. 接收者不存在/已歼灭 → `RecipientMissing`；接收者不属于 `issuer` → `NotOwner`；payload 与 domain/landType 不匹配或字段越界 → `InvalidPayload`。
  2. `Move`：路径为空且不是 Halt、或路径不连通 → `PathUnreachable`。
  3. `Move` 与 `CrossTileStrike`：对路径上每一步（`from → to`）/ 打击目标地块调用 11 `CanCrossOrStrike(issuer, fromTile, toTile, landType, strikeModel)`（11 §6.2；`strikeModel` = payload 的弹药型号句柄，Move 填 0）；返回非 `None` → 映射为 `PeacetimeBorder/Ceasefire/PeacekeepingZone/EndUseRestricted`。
  4. `CrossTileStrike`：超出射程（04 `IsInStrikeRange`）→ `OutOfStrikeRange`；打击单位不是独立火力营（§9.3 编制提醒：旅属远程兵器不能接跨地块打击）→ `NotIndependentFireBattalion`。
  5. `OrgAdmin`：07 §4.6.3 的静态前提（同国、同地块）不满足 → `InvalidPayload`；所涉营处于被包围状态 → `EncircledCannotAdmin`。“不在战斗中”不在此校验，而在生效时检查（§4.3.6）。
- `Forced` 命令（`OrderSource.System`）只做第 1 条校验。

#### 4.3.3 命令延迟公式 🟡 T-01

$$
\text{delayMs} = \text{clamp}\Big(\text{BaseDelayMs}[e] \cdot M_{class} \cdot F_{hq} \cdot F_{load} \cdot F_{jam} \cdot F_{state} \cdot F_{attach} \cdot F_{dist} \cdot F_{headless} \cdot F_{emcon} \cdot F_{reorg},\ \text{MinDelayMs}[class],\ \text{MaxDelayMs}\Big)
$$

各项（全部无量纲，除 BaseDelayMs）：

| 项 | 公式 | 输入来源 |
|---|---|---|
| `e`（层级） | 接收者层级：特种部队连 → `Company`；营 → `Battalion`；建制编组 → 其 `echelon`（Brigade/Division/Corps） | 01 |
| `M_class` | `Planned` 1.0；`OrgAdministrative` 1.0（层级 = 营，MinDelayMs 同 Planned）；`Reactive` 0.5；`UrgentSimple` 0.25；`Administrative`、`Forced` → 直接 delay = 0（不算其他项）（DC-041） | 本文件 |
| `F_hq` | `1.5 − 0.8 × q`，`q = 01.CommandState.Get(hq).quality ∈ [0,1]`（接收者自身指挥部的指挥质量） | 01 `CommandState Get(OrgUnitId)`（通信装备 × 部班练度，归一化） |
| `F_load` | `min(01.CommandState.Get(hq).orderDelayMultiplier, FLoadMax)`（01：`orderDelayMultiplier = max(1, load / capacity)`） | 01 `CommandState Get(OrgUnitId)`（指接收者指挥部的） |
| `F_jam` | `1 + JamDelayCoef × jam`，`jam ∈ [0,1]` = 接收者所在地块对 `issuer` 方的通信干扰强度 | 05 `GetCommsJamming(tile, victimCountry)`（阶段 0 恒 0；🟡 T-18） |
| `F_state` | 按接收者（编组 = 其下属营的众数姿态，平局取较大系数）当前状态查表 §5 `StateFactor` | `BattalionMoveState.posture`；交战中 = 营在任一 `EdgeBattle` 中 |
| `F_attach` | 营配属（`currentFormationId ≠ organicFormationId`）时 `AttachFactor`，否则 1 | 01 |
| `F_dist` | `1 + max(0, dKm − DistFreeKm) / DistScaleKm`，上限 `FDistMax`。`dKm` = 上级指挥部（营的当前编组的 `Hq` 营）所在地块中心到接收者所在地块中心的大圆距离；编组命令按**每个子单位**分别算（§4.3.5）；无上级编组或接收者本身是顶层 → 1 | 10 地块中心表、00 §3.4 |
| `F_headless` | 接收者自身指挥部班/营已被歼灭或失去战斗力：`HeadlessFactor`，否则 1 | 01/07 |
| `F_emcon` | 接收者 `EmconState`：Active 1.0、Partial 1.15、Silent 1.5（05 §6.2 建议值，本文件采纳） | 05 / 01 D3 |
| `F_reorg` | `now < bn.reorganizingUntil` ? `01.ReorganizingDelayMult` : 1（编组命令：按其 Hq 营） | 01 |

**取整**：`totalMs = (long)Math.Ceiling(product)` 后再夹紧。

**参考量级核对**（✅ §11.1.1：营几十分钟到 2 小时，旅 2–6 小时）：营、q=0.8、无负荷、驻防、近距离 → 45 × 0.86 = 38.7 分钟；营、q=0.2、交战中、干扰 0.5 → 45 × 1.34 × 1.5 × 1.3 = 117.6 分钟。旅、q=0.8 → 180 × 0.86 = 154.8 分钟；旅、q=0.3、行军中 → 180 × 1.26 × 1.2 = 272 分钟。

#### 4.3.4 改命令与取消 🟡 T-06
- **同一接收者、同一槽位**的新命令进入 `ScheduleSingle` 时，原有 `Pending` 命令 → `Superseded`；新命令的延迟**从新的下令时刻重新完整计算**（✅ §11.1.1“延迟重新开始计算”）。
- 原有 `Active` 命令**继续执行**，直到新命令生效时才被替换（现实：新命令传达前部队按原命令行动）。
- 例外：`Halt`（`UrgentSimple`）生效时立即停止当前移动；`Forced` 立即生效并清除该槽位所有 `Pending`。
- 玩家“取消”一条 `Pending` 命令：直接 `Cancelled`，不产生延迟；Player 来源的 `CancelOrder` 记入输入日志：`InputLog.Append(InputKind.CancelOrder, orderId)`（15）。取消 `Active` 的移动命令 = 下达 `Halt`（有 UrgentSimple 延迟）。取消 `Active` 的空中命令（`OrderDomain.Air`）= 立即调用 08 `CancelMission(missionId)`（08 §6.1，T-02 空中命令无延迟），命令 `Cancelled`。取消 `Active` 的 `OrgAdmin` 命令：不可取消（编制操作已执行）。
- 编组父命令被替换时，它的所有未生效子命令一并 `Superseded`；已生效的子命令继续，直到新的子命令生效。

#### 4.3.5 编组命令的分解 🟡 T-05
```csharp
void ExpandFormationOrder(World w, Order parent) {
    var f = w.formations[parent.recipient.entityId];
    if (f.kind == FormationKind.AdHoc) {
        // 临时编组：无指挥部、无机制效果 → 立即由编组 AI 分解，每个子命令按“营”层级各自计算延迟
        foreach (var sub in Ai.Formation.Decompose(w, f, parent))   // 12 §4.2
            { sub.parentOrderId = parent.id; /* sub.recipient.kind 已是 Battalion */ ScheduleSingle(w, sub, n); }
        parent.status = OrderStatus.Active; return;
    }
    // 建制编组：延迟按编组层级算；分解在“生效时”进行（编组 AI 用生效时刻的态势）
    SupersedePending(w, parent.recipient, parent.slot);
    parent.delay = ComputeDelay(w, parent);   // F_dist 取 1（编组层面）
    parent.effectiveAt = parent.issuedAt + parent.delay.totalMs; parent.effectiveTick = ceil(...);
    w.pendingOrders.Add(parent);
}
// 父命令激活时（§4.3.6）：
//   subs = Ai.Formation.Decompose(w, f, parent);   // 每个子命令 orderClass = Planned，但不再计算完整延迟
//   每个子命令额外延迟 = BaseDelayMs[Battalion] × (F_dist(该营) − 1)   // 只计距离附加；近的营立即生效
//   子命令的 effectiveAt = parent.effectiveAt + 额外延迟
```
- 编组 AI 之后的**自主**调整（例如每 5 分钟发现某条边受威胁、把地块预备营调上去）是 `Reactive` 类、营层级的独立命令（不挂父命令）。

#### 4.3.6 激活 `Activate`
| 命令 | 激活时做什么 |
|---|---|
| `Move`（营） | 若营在某 `EdgeBattle` 中且新路径第一步**不是**穿过该战斗边进入敌方地块 → 走脱离接触流程 §4.5；否则重设 `remainingPath`，若驻止则 `phase = Approach`、开始新段 |
| `Move`（Halt） | 停在当前位置：`Approach` → 变回驻止（`headProgressM` 归零，视为仍在 `legFromTile` 内）；`Crossing` → **不能中途停止**，继续过完本边后停止（纵队不能停在边上）；`Depart` → 到达 `legToTile` 即停止（视为已在该地块） |
| `CrossTileRecon` | AreaRecon：调 05 `StartAreaReconTask(owner = issuer 国家, tiles = areaTiles × tilePriorities, assets, desiredLevel, risk)`；SofMission：调 05 `StartSofMission(sofCompany = recipient, tile = areaTiles[0], insertion, extraction, durationDays, reportIntervalH)` |
| `CrossTileStrike` | 调 04 `QueueCrossTileStrike(order)`；04 再加准备时间和飞行时间（✅ 响应 = 命令延迟 + 准备 + 飞行） |
| `AirMission` | 调 08 `StartMission`（无命令延迟；起飞准备由 08 计算，🟡 T-02） |
| `LogisticsConfig` | 调 06 `ApplyConfig(LogisticsConfigPayload)`（无命令延迟，🟡 T-03） |
| `UnitConfig` | 写对应组件字段（行军方式在下一段开始时才影响纵队长度和速度） |

### 4.4 地块层移动（`LandMovement`，每 10 分钟）🟡 T-07

#### 4.4.1 纵队长度
```text
columnLengthM = clamp( nVehicles × spacingM[marchMode] + nFootSquads × FootSquadSpacingM,  ColumnMinM, ColumnMaxM )
```
- `nVehicles` = 营内可行驶车辆数（07 损伤状态为“完好/野战可修但能动”的）；`nFootSquads` = 无车班数。
- `spacingM[Dense] = 50`，`spacingM[Dispersed] = 100`。例：60 辆车密集 → 3000m；疏散 → 6000m（✅ 总纲 3–8km）。

#### 4.4.2 行军速度
```text
speedMps = min_over_vehicle_models( roadSpeedMps(model) ) × RoadFactor[RoadClassMap.ToMarchRoadClass(Map.RoadClass(edge))] × MarchModeSpeedFactor[marchMode]
         —— 营内无车时用 FootSpeedMps（负重修正由 03 的平均负重给出：× clamp(1.3 − loadRatio, 0.5, 1.0)）
```
- `roadSpeedMps` 来自 `MobilityProfile`（G-17：归 06）。`edge` = 本段两格之间的边；道路等级 = 10 `Map.RoadClass(edge)`，经 10 `RoadClassMap.ToMarchRoadClass` 映射为 `MarchRoadClass`；无道路的地块之间为 `MarchRoadClass.None`，用 `RoadFactor[None]`。
- 不能机动（`06.GetMobilityFactor(bn) == 0`，06 §4.9：如燃油耗尽）→ 有车营速度 0（只能弃车步行，阶段 1 不做弃车，🟡 归 06/07）。

#### 4.4.3 推进一步（两遍）
```csharp
public enum MarkKind : int { HeadAtEdge = 1, OwnershipSwitch = 2, TailCleared = 3, ReachedCenter = 4 }
public readonly record struct MoveMarkEvent(
    SimTime at, OrgUnitId battalion, MarkKind kind,
    ulong legFromTile, ulong legToTile, List<ulong> pathAtMark,   // 关键点时刻本营的段快照（回退用）
    double distanceAtMarkM);                                       // 关键点时刻的 distanceMovedLastHourM

void LandMove.Step(World w, long n) {
    double dtS = C.LandMoveStepMinutes * 60.0;
    long stepStartMs = n * 60000;
    var events = new List<MoveMarkEvent>();
    // 第 1 遍：按营 ID 升序推进到“下一个关键点或步末”。只改本营的段内字段
    //        （headProgressM、leg*、phase、posture、remainingPath、distanceMovedLastHourM），
    //        不改 currentTile / TileControl；“头到边”先按“对面无敌”推进；每个关键点登记一条事件
    foreach (var m in w.moveStates.OrderBy(x => x.battalionId.value)) {     // ID 升序
        if (n % 60 == 0) m.distanceMovedLastHourM = 0;  // 06 已在本刻 40 阶段读走上一小时的值
        if (m.phase is MovePhase.None or MovePhase.HeldAtEdge or MovePhase.WaitingDisengage) continue;
        if (m.speedMps <= 0) continue;
        double remainingS = dtS, tS = 0;                // tS = 本步内已用时间
        while (remainingS > 0 && m.phase != MovePhase.None) {
            double nextMark = NextMarkM(m);             // 下一个关键点：edgeAtM（头到边）/ edgeAtM + col/2（归属切换）/ edgeAtM + col（尾过边）/ legLengthM（到中心）
            double needS = (nextMark - m.headProgressM) / m.speedMps;
            if (needS > remainingS) {
                double d = m.speedMps * remainingS; m.headProgressM += d; m.distanceMovedLastHourM += d; break;
            }
            m.distanceMovedLastHourM += nextMark - m.headProgressM;
            m.headProgressM = nextMark; remainingS -= needS; tS += needS;
            var at = new SimTime(stepStartMs + (long)Math.Floor(tS * 1000));   // 精确时刻（只用于记录和排序）
            events.Add(new MoveMarkEvent(at, m.battalionId, KindOf(m, nextMark),
                                         m.legFromTile, m.legToTile, new List<ulong>(m.remainingPath), m.distanceMovedLastHourM));
            AdvancePastMark(m, nextMark, at);           // 见下表“第 1 遍”列
        }
    }
    // 第 2 遍：按 (at.ms, battalion.value) 升序应用归属变化，并对每个“头到边”重新判定对面是否有敌
    var halted = new HashSet<OrgUnitId>();
    foreach (var e in events.OrderBy(x => x.at.ms).ThenBy(x => x.battalion.value)) {
        if (halted.Contains(e.battalion)) continue;     // 该营已在更早的关键点停住，其后的事件作废
        OnMark(w, w.moveStates[e.battalion], e, halted); // 见下表“第 2 遍”列
    }
    ApplyTileControlChanges(w, n);                       // §4.4.4，在所有事件应用完之后统一做
}
```
| 关键点 | 第 1 遍 `AdvancePastMark`（只改本营段内字段） | 第 2 遍 `OnMark`（以已应用到 `e.at` 的归属为准） |
|---|---|---|
| 头到边 `edgeAtM` | `phase = Crossing`，`posture = CrossingEdge` | 查目的地块 `e.legToTile` 有没有**敌对国家的营**（归属在该地块，或正从该地块方向过同一条边）：有 → 回退：`legFromTile/legToTile/remainingPath` = 事件快照，`headProgressM = edgeAtM`，`distanceMovedLastHourM = e.distanceAtMarkM`，`phase = HeldAtEdge`，`posture = Marching`，登记 `BattleTrigger`（§4.6.1），`halted.Add(e.battalion)`；无 → 保持第 1 遍结果 |
| 归属切换 `edgeAtM + col/2` | 无 | `currentTile = e.legToTile`，`arrivedTileAt = e.at`；发出事件 `BattalionTileChanged(e.battalion, e.legFromTile, e.legToTile, e.at)`；记一条“归属变化”供 §4.4.4 使用 |
| 尾过边 `edgeAtM + col` | `phase = Depart`，`posture = Marching` | 记一条“完成过边”供 §4.4.4 第 2 条使用 |
| 到中心 `legLengthM` | 若 `remainingPath` 非空：开新段（`legFromTile = legToTile`，取 path 首个，重新查表 `legLengthM`、`edgeAtM`、`speedMps`，`headProgressM = 0`，`phase = Approach`）；否则 `phase = None`，`posture = Assembling`，在 `AssemblingToDefendingMin` 后自动转 `Defending`（挖壕进度见 §4.4.5） | 无 |

- 段长 `legLengthM` 和 `edgeAtM` 要求 `edgeAtM + columnLengthM ≤ legLengthM`；否则把 `columnLengthM` 截到 `legLengthM − edgeAtM`（只在异常小地块出现）。
- 过边中被跨地块火力/空袭打击时“两边地块都能打到”和暴露比例：由 05/04/08 读 `phase == Crossing` 与 `crossFraction = (headProgressM − edgeAtM) / columnLengthM` 决定。

#### 4.4.4 地块控制权更新 🟡（✅ §11.1.2、§13.3）
在 `LandMovement` 末尾、按地块 `H3Index` 升序：
1. 地块 `T` 内没有 `controller` 方的营 → `isUndefended = true`（控制权**不变**，✅ §13.3）。
2. 敌对国家 `X` 的某营**完成过边**（尾过边事件）进入 `T`，且 `T` 内没有 `controller` 方的营、也没有与 `X` 交战的 `EdgeBattle` 在 `T` 的边上以 `T` 为防守地块进行 → `controller = X`，`controlSince = 该事件时刻`，发 `TileCaptured` / `TileLost` 通知。
3. 有战斗时以战斗结果为准（§4.7）。

#### 4.4.5 挖壕进度与姿态时长（`LandMovement` 末尾，营 OrgUnitId 升序；DC-165 ①）
```text
每次 posture 改变：postureSince = 改变时刻
对每个营 bn（e = EntrenchState[bn]）：
   if bn.currentTile != e.tile: e.tile = bn.currentTile; e.progress = 0          // 换地块从零开始
   if posture ∈ {Defending, Entrenched} 且营不在 EdgeBattle 中:
       dtH = LandMoveStepMinutes / 60
       e.progress = e.progress + (1 − e.progress) × (1 − DMath.Exp(−dtH / FortTauH))   // FortTauH 归 04（§5 常数表 24 h）；与 04 条带内工事同一时间常数
       if posture == Defending && e.progress ≥ EntrenchSwitchLevel: posture = Entrenched
   else if posture ∈ {Marching, CrossingEdge}: e.progress = 0（离开阵地即放弃工事）
   // 在 EdgeBattle 中：进度冻结（条带内工事由 04 FortificationLevel 管）
```
- `double GetEntrenchProgress(OrgUnitId bn)` = `e.progress`（无组件 = 0）；04 部署守方连时用作 `fortLevel` 初值（04 第 373 行附近“fortLevel = 09.GetEntrenchProgress”）。
- `void SetEntrenchProgress(OrgUnitId bn, double p)`：只供 14 开局调用（14 §4.3 O4）；`p` 夹到 [0,1]，`tile = currentTile`；`p ≥ EntrenchSwitchLevel` 时 posture 直接设为 `Entrenched`。
- `double GetPostureHours(OrgUnitId bn)` = `(now − postureSince) / 3 600 000`；04 §4.7 的 `prepH`（“连续处于 Defending/Entrenched 的小时数”）= `posture ∈ {Defending, Entrenched}` 时，自进入 Defending 起累计（Defending → Entrenched 不重置，实现：转 Entrenched 时不改 `postureSince`）。

### 4.5 脱离接触（命令侧；机制归 04）🟡 T-19
```text
撤退命令激活 → BattalionMoveState.phase = WaitingDisengage
             → 04.RequestDisengage(battleId, battalionId, at)
04 在若干条带步内组织撤退（组织时间、途中挨打、受损车辆遗弃概率上升，由 04/07 定义）
04 回调 OnDisengaged(battalionId, at) → phase = None（营留在本地块内，或已在己方地块），调用 OnBattalionLeftBattle(battalionId) 回调列表，然后开始执行新路径
```
- 本文件给 04 的建议默认值（04 可改）：组织时间 `DisengageOrganizeMin` = 30 分钟 × `F_state`（交战 1.5）≈ 45 分钟，之后连逐个后撤；04 负责在组织期间与后撤途中让该营的连继续承受 A/C/E 线打击。
- 撤退途中不能取消（再下 `Move` 回到战斗边 = 新命令，脱离完成后执行）。

### 4.6 战斗触发（`BattleLifecycle`，每 10 分钟，紧随 60）🟡 T-08、T-09

#### 4.6.1 收集触发
- 来源 1：本步 `OnMark` 登记的 `BattleTrigger`（营头到边、对面有敌）。
- 来源 2：两支敌对的营**在同一步内**各自从两侧走向同一条边（对向行军）——两者都会在头到边时看到对方（对方 `legToTile` 方向的营算“正从该地块方向过同一条边”），各登记一次，合并为一个触发。
- 远程侦察和跨地块火力不需要触发（✅ §11.2 第一类）。

#### 4.6.2 分类
```text
对每条边 e（按 EdgeId 升序），合并该边本步所有触发：
  若 e 上已有活跃 EdgeBattle 且参战国家相同 → 04.JoinBattle(battleId, bn, side, asCounterattack: false)（04 把新到的营的连放进条带预备位置），结束
  attacker = 最早触发（at 最小，平局按 OrgUnitId 升序）的营所属国家；defender = 对方
  kind = Meeting  若：防守地块内所有敌营都满足  posture ∈ {Marching, Assembling, CrossingEdge}
                      或 (at − arrivedTileAt) < MeetingWindowMin
                  或：双方都在向这条边行军（对向）
         Attack   否则
  调 04.CreateEdgeBattle(e, attacker, defender, kind, attackers, defenders, at)
```
- 遭遇战的条带坐标方向按 G-06：`orientation = +1`。
- **进攻方参战营**：本步登记触发的己方营，加上以后到达这条边的己方营（`JoinBattle`）。
- **防守方参战营**（`defenders`）：
  1. 防守地块内 `EdgeAssignment.edge == e` 的营（12 §3.3 的组件）；
  2. 若为空：防守地块内 `EdgeAssignment` 为“地块预备”的营中 `OrgUnitId` 最小者；
  3. 若仍为空：防守地块内当前参与战斗数最少、平局取 `OrgUnitId` 最小的营（营同时只能在一个 `EdgeBattle` 中 → 跳过已在战斗中的；全都在战斗中则 `defenders` 为空）；
  4. `defenders` 为空 → 仍然建立战斗（防守方暂时无人，攻方可以直接推进；04 的推进度按无抵抗处理），并立即通知防守方编组 AI（12）做 `Reactive` 调整。
- 被选中的防守营自动参战，**不需要命令延迟**（就地防御是条令内的自动反应）。

#### 4.6.3 同一营只在一个战斗中
- 营一旦是某 `EdgeBattle` 的参战营，就不能再加入别的战斗，直到该战斗结束或该营脱离接触。

#### 4.6.4 反冲击
- 防守方对攻方地块下 `Move`、且路径第一步穿过一场**正在进行**的战斗的边 → **不新建战斗**；该营加入原战斗（若尚未参战）：调 04 `JoinBattle(battleId, bn, side, asCounterattack: true)`，04 立即把它的连的任务设为反冲击（`EngagementType.Counterattack`），指向接触最深的扇区。
- 若这条边上没有战斗 → 这是一次新的进攻（按 4.6.2 新建，原防守方为 attacker）。

### 4.7 战斗结束（`BattleEnd`，每条带步）🟡 T-10、T-11

#### 4.7.1 判定（09 判定；指标由 04 提供）
对每个活跃 `EdgeBattle`，按 `EdgeBattleId` 升序，按下表**从上到下**取第一个成立的：

| 序 | 条件 | `BattleEndReason` | 地块结果 |
|---|---|---|---|
| 1 | 交战国之间停火/和约生效（11 `InCeasefire(attacker, defender)` 为真） | `WarEnded` | 不变 |
| 2 | 双方在条带上都没有有战斗力的连（04 `HasEffectiveCompanies(battleId, side)` 对两侧都为假） | `MutualAnnihilation` | 不变 |
| 3 | `PenetrationProgress ≥ 1`（04） | `TileCaptured` | 防守地块 → 攻方 |
| 4 | 防守方参战营全部 `!IsCombatEffective`（04）**且**防守地块内无其他有战斗力的防守方营可补入 | `DefenderIneffective` | 防守地块 → 攻方 |
| 5 | 防守方参战营全部已脱离接触且地块内无防守方营 | `DefenderWithdrew` | 防守地块 → 攻方 |
| 6 | 攻方参战营全部已脱离接触 | `AttackerWithdrew` | 不变 |
| 7 | 攻方参战营全部“停止进攻”（其当前移动命令不再指向穿过本边）且 04 报告攻方的连已全部回到攻方一侧（`y < 0` 战斗坐标）并持续 `StopConfirmMin` | `AttackerStopped` | 不变 |

- `IsCombatEffective(battalionId)` 由 04 定义（建议门槛：能力向量的主战能力剩余 < 30% 即失去战斗力，见 04/07）。
- 第 7 条：攻方玩家只要对攻方营下 `Halt` 或撤退命令，04 会让其连停止进攻并回撤到己方一侧；不必等营整体撤退。

#### 4.7.2 结束后的处理
```text
04.EndEdgeBattle(battleId, reason, at)   // 写回营状态、解锁连、生成战报数据（04）
对本战斗每个参战营（OrgUnitId 升序）：调用 OnBattalionLeftBattle(bn) 回调列表（订阅者 01）
若地块结果 = 攻方占领：
   T = 防守地块
   1. controller(T) = attacker，controlSince = at；通知 TileCaptured / TileLost
   2. 败方在 T 内的**所有**营（含正在别的边上作战的）收到 Forced 撤退命令（§4.7.3）；
      它们参与的其他 EdgeBattle 走脱离接触（04），这些战斗随后按第 5/6 条结束
   3. 本战斗的攻方营：HeldAtEdge → 继续本段过边（phase = Crossing，从 edgeAtM 处起算）
若地块结果不变：攻方营 HeldAtEdge → phase = None（留在原地块，posture = Defending）；防守方营留在原地
```

#### 4.7.3 被迫撤退的去向 🟡 T-11
```text
候选 = T 的邻格中满足：controller == 败方，且没有敌营，且不是正在以它为防守地块进行的战斗的地块
若候选非空：选 score 最小者（平局 H3Index 小者）
   score = 敌方已知威胁（12 `InfluenceMap.Get(败方, InfluenceLayer.Threat, 邻格)`，用败方的视角） × 10
         + 到败方该营所属编组 Hq 营所在地块的大圆距离_km
   给每个营下 Forced Move（path = [该邻格]），直接从 T 内出发
若候选为空：营进入“被包围”状态（Notify UnitEncircled）：
   - 不离开 T；T 的控制权仍改为攻方（地块“被占领”，包围圈在其中）
   - 被包围的营：06 视为补给完全切断；它可以对任意邻格下 Move 突围（按正常进攻触发战斗）
   - 包围营失去战斗力后，调用 07.OnUnitEncircledDestroyed(bn)（剩余人员成为 MissingOrCaptured 或 Killed、装备被俘或毁，07 §4.2.5）
```

#### 4.7.4 阶段战报（✅ §11.3）
- 每场战斗自开始起每满 `PeriodicReportHours`（24）小时，在 150 `Reporting` 阶段（每个满 24h 的刻）调用 04 `MakePeriodicReport(battleId, periodIndex)`，并发 `PeriodicBattleReport` 通知。实现：在 `Reporting` 阶段检查 `(n − battleStartTick) % 1440 == 0 && n > battleStartTick`。（`Calendar` 日分支里的 `CheckPeriodicReports` 只处理以 0 点对齐的需求，阶段 1 不用，保留空实现。）

### 4.8 时间预算调度 `SimBudgetScheduler` 🟡 T-12、T-13、T-14

**原则**（G-21）：决定 `Full` / `Cached` 的只能是**世界状态 + 玩家的模拟输入**（星标、`FidelityProfile`）。不得使用实测耗时、帧率、CPU 核数、游戏速度、玩家正在看哪个视图。

#### 4.8.1 成本估计（单位：pair-minutes，即“班单元对 × 分钟”）
```text
片段成本   engCost = (nA + nB)² × durMin
   nA、nB = 片段双方的空间单元数（03 的 SpatialElement 数，未展开前用班数近似）
   durMin = EngagementExpectedMin（20）
战斗小时成本估计 battleCostEst(b) =
   若 b 在上一个小时窗口里有片段：上一个窗口实际生成的所有片段的 engCost 之和（片段跨窗口时按分钟比例分摊）
   否则（新战斗/上小时无片段）：frontageSlots(b) × EngagementsPerSlotPerHour × engCost(典型) 
   其中 engCost(典型) = (2 × 平均连的班数)² × 20 ；frontageSlots 由 04 给
```

#### 4.8.2 每小时开窗（`Calendar` 时分支后调用 `OpenWindow`）
```csharp
void OpenWindow(World w, long n) {
    var s = w.scheduler;
    s.windowStartTick = n;
    s.budgetPairMin = BudgetByProfile[s.profile];
    s.reservedPairMin = 0;
    var battles = w.activeBattles.Select(b => new FidelityAssignment {
        battleId = b.id, priority = Priority(w, b), estCostPairMin = BattleCostEst(w, b) }).ToList();
    // 全序：priority 降序，然后 EdgeBattleId 升序
    battles.Sort((x, y) => y.priority != x.priority ? y.priority.CompareTo(x.priority) : x.battleId.value.CompareTo(y.battleId.value));
    foreach (var a in battles) {
        if (s.profile == FidelityProfile.AllFull)   { a.tier = Full;   a.reason = ProfileForced; }
        else if (s.profile == FidelityProfile.AllCached) { a.tier = Cached; a.reason = ProfileForced; }
        else if (IsRemoteWar(w, a.battleId))        { a.tier = Proxy;  a.reason = RemoteWar; }   // 阶段 1 恒 false（T-14）
        else if (IsStarredBattle(w, a.battleId))    { a.tier = Full;   a.reason = Starred; s.reservedPairMin += a.estCostPairMin; }
        else if (s.reservedPairMin + a.estCostPairMin <= s.budgetPairMin)
                                                    { a.tier = Full;   a.reason = WithinBudget; s.reservedPairMin += a.estCostPairMin; }
        else                                        { a.tier = Cached; a.reason = OverBudget; }   // 跳过，继续看后面更小的
        s.assignments[a.battleId.value] = a;
    }
}
```
- **星标战斗不受预算限制**（玩家明确要看的必须实时）；它们的成本仍计入 `reservedPairMin`。
- 优先级：
```text
Priority(b) = 1000 × starred(b) + 300 × keyTile(b) + 200 × playerInvolved(b) + 10 × companies(b)
  starred      = 双方参战营中任一属于星标单位或星标编组（13 设置，作为输入记录）
  keyTile      = 防守地块或攻方地块在剧本的关键地块表中（14）
  playerInvolved = 任一参战国是人类玩家控制的国家
  companies    = 双方当前在条带上的连数之和（04）
```
- **窗口内新建的战斗**（`BattleLifecycle` 在小时中间创建，按 `EdgeId` 升序）：若星标 → `Full`；否则若 `reserved + est ≤ budget` → `Full` 并加入预留；否则 `Cached`。
- **片段的精度**：04 在生成 `Engagement` 时调用 `GetTier(battleId)`，取该战斗**生成时刻**的 `tier`；片段一旦生成，精度不再改变（跨窗口也不变）。
- 结果：同一场战斗在一个小时内的所有片段精度一致，`Full` 的战斗可以完整回放到班。

#### 4.8.3 精度档 `FidelityProfile`
- 设置项，存档保存；玩家修改 = 一条模拟输入（记入输入日志，在下一个小时窗口生效）。
- 游戏速度**不**影响精度档（总纲 §9.3④ 原写“速度调快时自动更多改用缓存”，与 G-21 的可复现要求冲突；🟡 T-12 改为：速度只影响能否跑满）。

### 4.9 通知与自动暂停事件（`Reporting` 阶段）🟡 T-17
- 各系统在本刻产生的事件先放入 `w.pendingNotifications`；`Reporting` 阶段按 `(at.ms, kind, battleId, tile, 第一个 unitId, audience.value, 生成序号)` 升序排序后赋 `seq`（生成序号 = 事件进入 `pendingNotifications` 的顺序号，保证全序），追加到每个 `audience` 国家的通知列表。
- 本文件负责生成：`BattleStarted`、`BattleEnded`、`TileCaptured`、`TileLost`、`PeriodicBattleReport`、`OrderFailed`、`UnitEncircled`、`InfraChanged`（收到 10 的 `InfraChanged` 事件时转成通知）。其他种类由各系统生成（`UnitCombatIneffective` 04；`NewEnemyTypeObserved` 05；`AirMissionResult` 08；`SupplyCut`、`ReserveGap` 06；`CrisisEvent`、`WarStateChanged` 11；`StarredAiDecision` 12）。`InfraChanged`、`StarredAiDecision` 默认不自动暂停。
- **自动暂停判定**：`Reporting` 末尾，对玩家国家的新通知调用 13 的过滤器 `AutoPauseFilter.Matches(Notification)`；任一命中 → 设置 `PauseReasons.AutoPauseBattle`（战斗类）或 `AutoPauseEvent`（其他），当前刻结束后暂停。**自动暂停不影响模拟结果，不记入输入日志。**
- 默认过滤条件（✅ §11.4 列出的五类，门槛 🟡）：

| 条件 | 默认 |
|---|---|
| 涉及星标单位的 `BattleEnded` | 开 |
| `BattleEnded` 且 `companiesTotal ≥ AutoPauseCompaniesMin` | 开，12 |
| `BattleEnded` 且 `ownLossFraction ≥ AutoPauseLossFracMin` | 开，0.15 |
| `TileCaptured` / `TileLost` | 开 |
| `NewEnemyTypeObserved` | 开 |
| 其余 | 只进通知列表 |

- 过滤器的类型 `AutoPauseFilter` 归 13；本文件要求它至少能表达上表五个条件（接口需求见 §6）。

### 4.10 昼夜 🟡 T-16
纯函数，任何系统可随时调用；结果可按（地块，小时）缓存。
```csharp
public enum LightCondition : int { Day = 1, Twilight = 2, Night = 3 }

double SolarAltitudeDeg(double latDeg, double lonDeg, SimTime t) {
    var (year, dayOfYear, hourUtcFrac) = Calendar.Decompose(t);           // 公历 UTC；dayOfYear 从 1 起
    int daysInYear = IsLeap(year) ? 366 : 365;
    double g = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (hourUtcFrac - 12) / 24);   // 弧度
    double decl = 0.006918 - 0.399912*DMath.Cos(g) + 0.070257*DMath.Sin(g) - 0.006758*DMath.Cos(2*g)
                + 0.000907*DMath.Sin(2*g) - 0.002697*DMath.Cos(3*g) + 0.00148*DMath.Sin(3*g);   // 弧度
    double eqMin = 229.18 * (0.000075 + 0.001868*DMath.Cos(g) - 0.032077*DMath.Sin(g)
                - 0.014615*DMath.Cos(2*g) - 0.040849*DMath.Sin(2*g));
    double tstMin = hourUtcFrac * 60 + eqMin + 4 * lonDeg;                 // 真太阳时（分钟）
    double haRad = (tstMin / 4 - 180) * Math.PI / 180;
    double lat = latDeg * Math.PI / 180;
    double cosZ = Math.Clamp(DMath.Sin(lat)*DMath.Sin(decl) + DMath.Cos(lat)*DMath.Cos(decl)*DMath.Cos(haRad), -1, 1);
    return 90 - DMath.Acos(cosZ) * 180 / Math.PI;
}
LightCondition GetLightCondition(ulong tile, SimTime t) {
    var c = Map.TileCenter(tile);                          // 10
    double a = SolarAltitudeDeg(c.latDeg, c.lonDeg, t);
    return a > DayAltDeg ? LightCondition.Day : (a > TwilightAltDeg ? LightCondition.Twilight : LightCondition.Night);
}
LightCondition GetLightConditionAtEdge(EdgeId e, SimTime t) {
    var c = Map.EdgeMidpoint(e);                           // 10
    double a = SolarAltitudeDeg(c.latDeg, c.lonDeg, t);
    return a > DayAltDeg ? LightCondition.Day : (a > TwilightAltDeg ? LightCondition.Twilight : LightCondition.Night);
}
```
- 来源：NOAA 太阳位置简化公式（精度约 ±0.5°，对昼夜分档足够）。
- 条带和片段按**战斗边中点**还是地块中心？用边两端点的大圆中点（`Edge.midpoint`，10 §3；经 `Map.EdgeMidpoint` 读取）。04/03 调用 `GetLightConditionAtEdge(edge, t)`。片段在生成时取一次光照（03 不在片段内部切换昼夜）。
- 天气：阶段 1 恒为 `Clear`（总纲 §21-20 第二优先）；保留 `GetWeather(tile, t)` 接口，返回固定值。

### 4.11 给 11/14 的系统接口（停火移交、维和区、开局放置）
```csharp
// 11 §4.8.6 停火移交：只在 Calendar（30）调用
void SetTileControl(ulong tile, CountryId newController, TileControlChangeReason reason);
    // 改 controller、controlSince = now；发 TileCaptured/TileLost 通知；不触发 §4.7.3 被迫撤退（撤出由 ForceWithdraw 单独下达）
enum TileControlChangeReason : int { None = 0, Handover = 1, Scenario = 2 }

OrderId ForceWithdraw(OrgUnitId bn, ulong toTile);
    // 生成 Order{source = System, orderClass = Forced, domain = Land, landType = Move, slot = Movement,
    //            payload = MoveOrderPayload{path = FindPath(Battalion bn, toTile)}}；Forced 立即生效、不可被玩家取消（§4.3.4）
    // toTile 由调用方（11）按 §4.7.3 同一评分选“最近的己方地块”；路径为空（无路可撤）→ 返回 0 并 FreezeBattalion(bn)
void FreezeBattalion(OrgUnitId bn, bool frozen);
    // 冻结：营不接受 Move/CrossTileStrike 命令（ValidateOrder 返回 InvalidPayload）、不被 §4.6 选为参战营；11 §7“维和区内无路可撤”使用
bool IsFrozen(OrgUnitId bn);

// 寻路（§6.3 的同一算法，纯函数；13 预览路径、11 移交撤出用）
List<ulong> FindPath(OrderRecipient recipient, ulong destTile);   // 不含起点；不可达 → 空表；编组 = 其 Hq 营的路径

// 14 开局放置（替代 14 直接写组件）
void PlaceBattalion(OrgUnitId bn, ulong tile, SimTime at);
    // BattalionMoveState：currentTile = legFromTile = tile、legToTile = 0、phase = None、posture = Defending、
    // arrivedTileAt = postureSince = at；EntrenchState{progress = 0, tile}。只在新游戏初始化时调用
```
- 冻结状态存于 `BattalionMoveState.isFrozen`（存档）。维和区到期（11 `PeacekeepingZone.endMs`）时 11 调用 `FreezeBattalion(bn, false)`。

---

## 5. 常数表

> 存放：`data/tuning/09_time_orders.yaml`（G-15）。数据键 = 名称的 snake_case。

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `TickMinutes` | 1 | min | 固定 | ✅ §11.1 |
| `StripStepMinutes` | 5 | min | 5/6/10 | G-04 |
| `LandMoveStepMinutes` | 10 | min | 5/10 | G-03 |
| `ExposureStepMinutes` | 10 | min | 10/20/30 | G-02 |
| `SpeedRateMinPerS`（1–5 档） | 1 / 5 / 20 / 60 / 240 | 游戏 min / 真实 s | 最快 120–480 | ✅/🟡 §11.1，T-15 |
| `MaxTickDebt` | 240 | tick | 60–1440 | 防止落后时一次补算太多导致界面卡死 |
| `BaseDelayMs[Company]` | 1 200 000（20 min） | ms | 10–40 min | 特种部队连；估算，confidence: estimated |
| `BaseDelayMs[Battalion]` | 2 700 000（45 min） | ms | 20–90 min | ✅ §11.1.1“营几十分钟到 2 小时”的中值 |
| `BaseDelayMs[Brigade]` | 10 800 000（180 min） | ms | 120–300 min | ✅ “旅 2–6 小时” |
| `BaseDelayMs[Division]` | 18 000 000（300 min） | ms | 180–480 min | 外推，estimated |
| `BaseDelayMs[Corps]` | 25 200 000（420 min） | ms | 240–720 min | 外推，estimated |
| `ClassMult` Planned/Reactive/UrgentSimple | 1.0 / 0.5 / 0.25 | — | 0.3–0.7 / 0.1–0.4 | ✅ “紧急的简单命令更快” |
| `MinDelayMs` Planned/Reactive/Urgent | 600 000 / 300 000 / 120 000 | ms | — | 下限 10/5/2 分钟，保证总有一点延迟 |
| `MaxDelayMs` | 28 800 000（8 h） | ms | 6–12 h | 平衡：防止叠加系数后出现一天以上 |
| `FLoadMax` | 3.0 | — | 2–4 | 平衡 |
| `JamDelayCoef` | 0.6 | — | 0.3–1.0 | 估算 |
| `StateFactor` Resting/Defending/Entrenched/Assembling | 0.8 / 1.0 / 1.0 / 1.0 | — | ±0.2 | ✅ §11.1.1 部队状态影响；估算 |
| `StateFactor` Marching/CrossingEdge/Attacking/Engaged | 1.2 / 1.3 / 1.3 / 1.5 | — | 1.0–2.0 | 同上；“交战中” = 在 EdgeBattle 中，覆盖姿态值 |
| `AttachFactor` | 1.25 | — | 1.1–1.5 | 🟡 §2.2 配属代价 |
| `DistFreeKm` | 40 | km | 20–80 | 一格对边约 40km：相邻格内不罚 |
| `DistScaleKm` | 100 | km | 50–200 | 估算 |
| `FDistMax` | 2.0 | — | 1.5–3 | 平衡 |
| `HeadlessFactor` | 2.0 | — | 1.5–3 | 指挥部被毁 |
| `MaxFormationSectorTiles` | 3 | 格 | 1–6 | T-04 |
| `SpacingM` Dense / Dispersed | 50 / 100 | m/车 | 30–80 / 80–150 | 常见行军间距 25–100m 量级，估算 |
| `FootSquadSpacingM` | 30 | m/班 | 20–60 | 估算 |
| `ColumnMinM` / `ColumnMaxM` | 1 000 / 10 000 | m | — | ✅ 总纲 3–8km 留余量 |
| `RoadFactor`（键 `MarchRoadClass`，10）Motorway/Trunk/Ordinary/None | 0.7 / 0.6 / 0.5 / 0.25 | ×路速 | ±0.15 | 纵队平均行军速度远低于极速；估算 |
| `MarchModeSpeedFactor` Dense/Dispersed | 1.0 / 0.85 | — | 0.7–0.95 | 🟡 §11.1.2 “疏散更慢” |
| `FootSpeedMps` | 1.1 | m/s | 0.8–1.4 | ≈4km/h 徒步行军 |
| `AssemblingToDefendingMin` | 60 | min | 30–180 | 估算 |
| `EntrenchSwitchLevel` | 0.95 | — | 0.8–0.99 | §4.4.5：挖壕进度达到此值时 Defending → Entrenched（指数增长到不了 1，故用门槛；`FortTauH` = 24 h 时约 72 h 成为 Entrenched）；估算 |
| `MeetingWindowMin` | 60 | min | 20–120 | T-08 |
| `StopConfirmMin` | 30 | min | 10–60 | T-10 |
| `PeriodicReportHours` | 24 | h | 固定 | ✅ §11.3 |
| `EngagementExpectedMin` | 20 | min | 10–30 | ✅ §9.3② 片段 10–30 分钟 |
| `EngagementsPerSlotPerHour` | 0.3 | 个/槽/h | 0.1–1 | 🟡 §9.3④“直瞄只占 10–30%” |
| `BudgetByProfile` Low/Standard/High | 4e6 / 1.5e7 / 6e7 | pair-min / 游戏小时 | 待 V6 定 | 见下注 |
| `PriorityWeights` star/key/player/perCompany | 1000 / 300 / 200 / 10 | — | — | T-12 |
| `AutoPauseCompaniesMin` | 12 | 连 | 6–30 | T-17 |
| `AutoPauseLossFracMin` | 0.15 | — | 0.05–0.3 | T-17 |
| `DayAltDeg` / `TwilightAltDeg` | 0 / −6 | ° | — | 民用晨昏蒙影 −6° |
| `DisengageOrganizeMin`（给 04 的建议） | 30 | min | 15–90 | T-19 |

> 预算注：一个 50 单元片段每小时 = 50² × 60 = 150 000 pair-min；总纲估一条边每小时约 10 个并行片段 ≈ 1.5e6。`Standard` = 1.5e7 ≈ 10 条边全实时，覆盖纳卡 8–10 条交战边（§21-4）。按总纲 0.08–0.3 s/边·小时，Standard 在 6 核上约 0.15–0.5 s/游戏小时，可跑满 `Speed4`。**最终值由 V6 性能基准决定。**

---

## 6. 与其他系统的接口

### 6.1 本文件提供
| 接口 | 调用者 | 时机 |
|---|---|---|
| `SimTime Now`、`long CurrentTick` | 全部 | 任意 |
| `OrderId SubmitOrder(Order)` | 13（玩家）、12（AI） | 任意（暂停中也可）；AI 在 10 阶段 |
| `bool CancelOrder(OrderId)` | 13、12 | 任意 |
| `IReadOnlyList<Order> GetOrders(OrderRecipient)` | 13、12 | 任意 |
| `OrderDelayBreakdown PreviewDelay(Order)` | 13（命令卡预估）、12（AI 规划） | 任意；纯函数，不改状态 |
| `BattalionMoveState GetMoveState(OrgUnitId)`（含 `distanceMovedLastHourM`） | 04、05、06、08、12、13 | 任意 |
| `LatLon GetBattalionPosition(OrgUnitId)`：驻止 = `TileCenter(currentTile)`；移动中 = 沿本段 `TileCenter(legFromTile)` → `TileCenter(legToTile)` 按纵队中点 `clamp(headProgressM − columnLengthM/2, 0, legLengthM) / legLengthM` 插值 | 05、08 | 任意 |
| `bool IsInBattle(OrgUnitId)` = 营是某活跃 `EdgeBattle` 的参战营（含 `heldInBattle ≠ 0`） | 02 | 任意 |
| 事件 `BattalionTileChanged(OrgUnitId, ulong fromTile, ulong toTile, SimTime)` | 05 | 60 阶段第 2 遍归属切换时（§4.4.3） |
| 回调列表 `OnBattalionLeftBattle(OrgUnitId)` | 01（订阅） | 140 阶段战斗结束时（§4.7.2）；04 `OnDisengaged` 完成时（§4.5） |
| `TileControl GetTileControl(ulong tile)` | 全部 | 任意 |
| `FidelityTier GetTier(EdgeBattleId)` | 04 | 04 生成片段时 |
| `LightCondition GetLightCondition(ulong tile, SimTime)`、`LightCondition GetLightConditionAtEdge(EdgeId, SimTime)`、`double SolarAltitudeDeg(...)` | 03、04、05、08 | 任意 |
| `bool IsNight(ulong tile, SimTime)` = `SolarAltitudeDeg < 0`；`IsFrontline(battalion)` = 营所在地块与敌方控制地块相邻或营在活跃 `EdgeBattle` 中 | 01、05、06 | 任意 |
| `void OnDisengaged(OrgUnitId, SimTime)` | 04 | 04 完成脱离接触时 |
| `void PostNotification(Notification)` | 04、05、06、08、11 | 本刻任意阶段；在 150 统一排序发布 |
| `UnitConfigField`（含 `DeployDecoys = 7`、`RelocateAfterFiring = 8`、`FireSupportPriority = 9`、`AllowCannibalization = 10`、`AttachTo = 11`） | 01、04、05、07、08、13 | 命令时 |
| `OrderFailReason ValidateOrder(Order)`（§4.3.2，纯函数） | 13（下令前预检）、12 | 任意 |
| `List<ulong> FindPath(OrderRecipient, ulong destTile)`（§4.11，纯函数） | 13（路径预览）、11、12 | 任意 |
| `void SetPlayerPause(bool)`、`void SetSpeed(GameSpeed)`、`void SetFidelityProfile(FidelityProfile)`（§4.2） | 13 | 任意（暂停中也可） |
| `double GetEntrenchProgress(OrgUnitId)`、`void SetEntrenchProgress(OrgUnitId, double)`、`double GetPostureHours(OrgUnitId)`（§4.4.5） | 04、13；14（Set，仅开局） | 任意 |
| `void SetTileControl(ulong, CountryId, TileControlChangeReason)`、`OrderId ForceWithdraw(OrgUnitId, ulong)`、`void FreezeBattalion(OrgUnitId, bool)`、`bool IsFrozen(OrgUnitId)`（§4.11） | 11（停火移交、维和区） | Calendar |
| `void PlaceBattalion(OrgUnitId, ulong tile, SimTime)`（§4.11） | 14（开局） | 初始化 |
| `OrgAdminPayload` / `OrgAdminKind`（§3.2，`OrderClass.OrgAdministrative`） | 13（合并/撤编） | 命令时 |

### 6.2 本文件需要（接口需求；签名由对应规格最终确定）
| 来源 | 需要什么 | 用途 |
|---|---|---|
| 01 | `CommandState Get(OrgUnitId)`：`quality`（F_hq）、`orderDelayMultiplier`（F_load）、`isHeadless`（F_headless）；`ReorganizingDelayMult` 与营的 `reorganizingUntil`（F_reorg）；营的 `organicFormationId/currentFormationId`、编组的 `Hq` 营、`FormationKind` | 命令延迟 |
| 04 | `CreateEdgeBattle`、`JoinBattle(EdgeBattleId, OrgUnitId, int side, bool asCounterattack)`、`RequestDisengage`、`EndEdgeBattle`、`PenetrationProgress`、`IsCombatEffective`、`HasEffectiveCompanies(EdgeBattleId, int sideIndex)`、`AttackerCompaniesAllOnOwnSide`、`frontageSlots`、`MakePeriodicReport`、`IsInStrikeRange`、`QueueCrossTileStrike` | 战斗生命周期、调度估算、打击 |
| 05 | `GetCommsJamming(tile, country)`、`StartAreaReconTask(owner, tiles, assets, desiredLevel, risk)`、`StartSofMission(sofCompany, tile, insertion, extraction, durationDays, reportIntervalH)`、`GetExposure(observer, target, now)`（打击的情报快照，返回 `IntelSnapshot`） | 延迟、侦察命令 |
| 06 | `MobilityProfile.roadSpeedMps`、`GetMobilityFactor(OrgUnitId)`、`ApplyConfig(LogisticsConfigPayload)`；06 发 `SupplyCut`、`ReserveGap` 通知 | 行军、后勤命令 |
| 07 | 车辆是否可行驶（`IsMobile`）、`OnUnitEncircledDestroyed(OrgUnitId)`、`MergeBattalions`/`MergeCompanies`/`DisbandBattalion`（OrgAdmin 生效时） | 纵队长度、速度、包围歼灭、编制操作 |
| 08 | `StartMission`、`CancelMission(id)` | 空中命令、取消 |
| 04 | 常数 `FortTauH`（挖壕进度，§4.4.5） | 挖壕 |
| 10 | 邻接表、两格中心距离、中心到边中点距离、`RoadClass(EdgeId)` + `RoadClassMap.ToMarchRoadClass`、`CrossingId`、地块中心/边中点经纬度 | 移动、寻路、昼夜 |
| 11 | `OrderBlockReason CanCrossOrStrike(CountryId issuer, ulong fromTile, ulong toTile, LandOrderType, ModelHandle strikeModel)`、`bool InCeasefire(CountryId, CountryId)`、`bool AtWar(CountryId, CountryId)`（11 §6.2） | 命令校验（§4.3.2）、战斗结束（§4.7.1 第 1 条用 `InCeasefire`） |
| 12 | `RunStrategic/RunFormation/RunPeacetimeCountry`、`Formation.Decompose`、`EdgeAssignment` 组件、`InfluenceMap.Get(CountryId, InfluenceLayer, ulong tile)`（`Threat` 层） | AI 阶段、编组分解、防守营选择、撤退去向 |
| 13 | 星标集合（作为模拟输入）、`AutoPauseFilter.Matches` | 调度优先级、自动暂停 |
| 14 | 关键地块表 | 调度优先级 |
| 15 | 输入日志 `InputLog.Append(InputKind, byte[])`、`ChecksumIntervalMin`、`BattleEventLog`、ID 分配器、`DMath` | 记录与确定性 |

### 6.3 寻路（`Move` 的 path 生成）
- 在 `SubmitOrder` 时由本文件生成（玩家只点目的地块）：A\*，图 = 陆地地块邻接，边代价 = `legLengthM / (vRef × RoadFactor[RoadClassMap.ToMarchRoadClass(Map.RoadClass(edge))])`（`vRef` = 该营的最慢车速），进入敌方控制地块的边代价 × `EnemyTileCostMult`（3.0，让路径默认绕开敌方地块，目的地除外）。
- 平局：f 值相同按 `H3Index` 升序展开。启发式：大圆距离 / (vRef × 0.7)。
- 路径在激活时**不**重算（玩家看到的就是会走的路）；途中目的地块变成有敌 → 到边触发战斗，这是预期行为。

### 6.4 存档

| 规格 | 内容 |
|---|---|
| 15 | 存档（值见 15 §3.2）：`SectionId.TimeOrders`（= 50）：`GameClock`（currentTick、speed、pauseReasons）、`FidelityProfile`、`BattalionMoveState`（含 `distanceMovedLastHourM`、`postureSince`、`isFrozen`）、`EntrenchState`、`TileControl`、`Order`（pending + active，含父子关系与 `OrderDelayBreakdown`）；`SectionId.Scheduler`（= 51）：`SimBudgetScheduler`（含 assignments）；`SectionId.Notifications`（= 101）：通知列表与 `Notification.seq` 计数器。不存档（派生，读档后重建）：昼夜/太阳高度缓存；`orderInbox`、`pendingNotifications`（刻之间恒为空） |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 命令接收者在 `Pending` 期间被歼灭/解散 | 激活时 `Validate` 失败 → `Failed`，发 `OrderFailed` |
| 同一刻同一接收者同一槽位收到多条命令 | 按 §4.3.2 的全序依次处理，后者把前者 `Superseded`；最终只留最后一条 |
| 延迟计算结果 < 0 或 NaN | 不可能（全部因子 ≥ 0.1）；调试模式断言，发布版取 `MinDelayMs` |
| 营速度为 0（`06.GetMobilityFactor == 0`，如燃油耗尽） | 本步不前进；若在 `Crossing` 中则停在边上（唯一允许停在边上的情形），`posture` 保持 `CrossingEdge`（最易被发现） |
| 编组为空（所有营都被歼灭） | 编组命令 `Failed` |
| 两国的营在同一步都完成过边进入同一个**空**地块 | 按 §4.4.3 的两遍算法：第 1 遍只登记事件、不改归属；第 2 遍按 `(at, OrgUnitId)` 升序应用。先完成归属切换（`at` 更小，平局 `OrgUnitId` 小）者先归属该地块；后到者的“头到边”事件在第 2 遍重判时看到前者已归属 → 回退到 `edgeAtM` 并 `HeldAtEdge`，触发遭遇战。 |
| 进攻目标地块里的敌营正在过边离开 | 它的归属仍是该地块直到半程 → 计为“有敌”，触发 `Meeting` |
| `EdgeBattle` 的防守地块是**攻方**自己的地块（防守方反攻进来） | 不会出现：战斗的“防守地块”定义为被攻击的一侧；反冲击不新建战斗（§4.6.4） |
| 地块易手时败方营正在 `Approach` 离开该地块 | 视为在地块内 → 收到 Forced 撤退，路径替换为撤退路径 |
| 被迫撤退的目标邻格在同一刻也被占领 | `BattleEnd` 按 `EdgeBattleId` 升序处理；后处理的战斗在选候选时看到已更新的控制权；已经下发的 Forced 命令若目标格已失守，营到达后再触发一次被迫撤退（每次撤退只走一格） |
| `FidelityProfile` 在小时中途被改 | 记为输入，下一个窗口生效 |
| 星标战斗总成本已超预算 | 仍然 `Full`；其他非星标战斗全部 `Cached` |
| 暂停时存档 | 允许（刻之间）；读档后 `pauseReasons = Player` |
| 年份跨越 1 月 1 日的刻 | `IsJan1Midnight(n)` 用公历计算；闰年 2 月 29 日正常存在 |
| 极地/高纬度地块（阶段 3） | `cosZ` 已夹紧；极昼极夜自然得到 Day/Night |

---

## 8. 测试用例

**T1 命令延迟（手算）**
输入：营；`Planned`；`q = 0.5` → `F_hq = 1.5 − 0.4 = 1.1`；`load = 12, capacity = 10` → `F_load = 1.2`；`jam = 0`；姿态 `Marching` → 1.2；未配属；`dKm = 30` → `F_dist = 1`；指挥部完好。下令于第 1000 刻（`issuedAt = 60 000 000 ms`）。
期望：`delay = 2 700 000 × 1.1 × 1.2 × 1.2 = 4 276 800 ms`（71.28 min）；`effectiveAt = 64 276 800 ms`；`effectiveTick = ceil(1071.28) = 1072`；该命令在第 1072 刻 `OrderIntake` 激活。

**T2 距离与配属**
同 T1，但姿态 `Defending`（1.0）、配属（1.25）、`dKm = 140` → `F_dist = 1 + 100/100 = 2.0`。
期望：`2 700 000 × 1.1 × 1.2 × 1.0 × 1.25 × 2.0 = 8 910 000 ms`（148.5 min）。若 `dKm = 400` → `F_dist = min(4.6, 2.0) = 2.0`，结果相同。

**T3 改命令重置**
第 0 刻下 Move-A，延迟 60 min（`effectiveTick = 60`）；第 30 刻对同一营下 Move-B，延迟 60 min。
期望：A 在第 30 刻 → `Superseded`；B `effectiveTick = 90`；第 30–89 刻营保持驻止（A 从未生效）。若 A 已在第 60 刻生效、第 70 刻下 B：营在 70–129 刻继续执行 A，第 130 刻切换到 B。

**T4 过边计时（✅ §11.1.2 例：6km ÷ 20km/h ≈ 18 min）**
`legLengthM = 39 000`，`edgeAtM = 19 500`，`columnLengthM = 6 000`，`speedMps = 20 000/3600 = 5.5556`；第 0 刻从 `headProgressM = 0` 出发。
期望（精确时刻）：头到边 3 510 s = 58.5 min（由第 50 刻的步检测到，`posture = CrossingEdge`）；归属切换 4 050 s = 67.5 min（第 60 刻的步，`arrivedTileAt = 4 050 000 ms`）；尾过边 4 590 s = 76.5 min（第 70 刻的步）；过边历时 18.0 min；到达目的地块中心 7 020 s = 117 min（第 110 刻的步）。

**T5 精度档调度**
`profile = Standard`（预算 1.5e7）。三场战斗都涉及玩家：
B1（id 1，星标，20 连，est 6e6）；B2（id 2，40 连，est 8e6）；B3（id 3，关键地块，10 连，est 5e6）。
优先级：B1 = 1000 + 200 + 200 = 1400；B2 = 200 + 400 = 600；B3 = 300 + 200 + 100 = 600。排序：B1, B2（与 B3 同分，id 小者先）, B3。
期望：B1 Full（Starred，预留 6e6）；B2 Full（14e6 ≤ 15e6）；B3 Cached（19e6 > 15e6，OverBudget）。

**T6 每刻阶段表**
期望：第 60 刻执行 10（战略+编组）、20、30（时）、40、50、60、70、80、90、100、110、120（驻止部队）、130、140、150、160（若开启）。第 5 刻：10（编组）、20、80、90、100、110、120（片段+条带）、140、150。第 7 刻：20、90、100、110、120（片段）、150。第 1440 刻：30 内顺序为 日 → 时；若第 1440×k 刻恰为 1 月 1 日 00:00，则 年 → 日 → 时。

**T7 战斗结束优先顺序**
某战斗本条带步同时满足：`PenetrationProgress = 1.02` 且攻方营全部失去战斗力。
期望：按表第 3 条先成立 → `TileCaptured`（第 2 条要求**双方**都没有有战斗力的连，不成立）。防守地块控制权改为攻方；防守方在该地块的全部营收到 Forced 撤退。

**T8 太阳高度（Python 已验算）**
地块中心 `lat = 39.80°, lon = 46.75°`（纳卡附近），2020-09-27（dayOfYear = 271，闰年 366）：
| UTC | 期望高度 | 光照 |
|---|---|---|
| 08:00 | 47.65° ± 0.05 | Day |
| 14:30 | 1.72° ± 0.05 | Day |
| 15:00 | −4.05° ± 0.05 | Twilight |
| 20:00 | −50.47° ± 0.05 | Night |

**T9 遭遇战分类**
营 A（国家 1）头到边，对面地块有国家 2 的营 B，B 的 `arrivedTileAt` 在 30 分钟前、`posture = Assembling`。
期望：`kind = Meeting`。若 B 已到达 3 小时、`posture = Defending` → `Attack`。

**T10 被迫撤退去向**
败方营所在地块 T 有 3 个邻格属败方：P（敌方威胁 0.2，距编组部 50km）、Q（威胁 0，距 120km）、R（有敌营）。
期望：R 排除；score(P) = 2 + 50 = 52，score(Q) = 0 + 120 = 120 → 撤往 P。

---

## 9. 验证建议

| 编号 | 脚本 | 内容 | 通过标准 |
|---|---|---|---|
| V7 | `tools/validate/v7_decision_density.py` | **决策密度审计**。输入：一份“决策清单”表（CSV：`phase(peace/war)`, `period(month/day)`, `decision`, `trigger`, `feedback`, `est_count`），本文件 §2 和其他规格 §2 的条目都列进去；再加从 V2/V8 脚本跑出的事件计数（每游戏日的 `BattleStarted/Ended`、`TileCaptured`、`OrderFailed`、通知数、自动暂停次数）。输出：和平时期每游戏月、战时每游戏日的决策数与通知数分布图；默认过滤条件下每游戏日的自动暂停次数 | 和平时期每月 ≥ 3 个有意义决策；战时每天 5–40 个决策；默认过滤下每游戏日自动暂停 ≤ 6 次；无连续 > 3 个游戏月“无决策”区间 |
| V2 辅 | `tools/validate/t_order_delay.py` | 用纳卡双方典型指挥部质量和距离，扫 `q × posture × jam`，画营/旅延迟分布 | 营 80% 落在 20–120 min，旅 80% 落在 120–360 min（✅ §11.1.1 量级） |
| V6 辅 | `tools/validate/t_scheduler_determinism.py` | 用 Python 复刻 §4.8：随机生成 1000 组战斗集合（ID、星标、连数、成本），**打乱输入顺序**各跑 10 次 | 每组 10 次输出完全一致；预算使用率 ≥ 85%（无星标时） |
| V6 | 同上，再接 V6 的实测每片段耗时 | 用实测 `pair-min → 秒` 系数定 `BudgetByProfile` | Standard 档在参考机（6 核）上 `Speed4` 实际达到率 ≥ 90%（纳卡满战线） |
| V2 辅 | `tools/validate/t_crossing.py` | 枚举车辆数、行军方式、道路等级，算纵队长度和过边时间 | 过边时间 5–40 min，大多数 10–25 min（✅ 总纲例 18 min） |
| — | `tools/validate/t_solar.py` | 与 `astral` 或 NOAA 表对比 100 个随机（经纬度，时刻） | 误差 ≤ 0.5° |

---

## 10. 待确认决策（🟡）

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| T-01 | 命令延迟公式与基础值 | 乘法模型 §4.3.3；营 45 min、旅 180 min、师 300、集团军 420；类别系数 1 / 0.5 / 0.25 | 与 ✅ 量级一致；每项都能在命令卡上解释 | 加法模型（基础 + 各项附加分钟数） |
| T-02 | 空中任务的命令延迟 | 0（只计 08 的出动准备时间） | ✅ §12.1“玩家的命令随时生效” | 中队层级的简短延迟（10–20 min） |
| T-03 | 后勤/行政配置的命令延迟 | 0（由各系统的执行时间体现）。DC-041 已细分：纯配置开关仍为 0（`Administrative`）；编制操作改用 `OrgAdministrative`（有延迟、非战斗中执行） | 国防部长级配置不是战术命令；避免双重延迟 | 统一 1 小时 |
| T-04 | 编组 Move 的目标可否为多个地块 | 可，最多 3 格（“防区”）；编组 AI 分配营 | 旅 = 一格，但地广人稀时要守 2–3 格（§13.2） | 只能 1 格，多格由玩家拆营 |
| T-05 | 编组命令的分解时机与子命令延迟 | 建制编组：按编组层级延迟，生效时分解，子命令只加距离附加；临时编组：立即分解，按营算 | 一次延迟覆盖整条指挥链；远的营晚到，符合 ✅ §11.1.2 | 父 + 子两次完整延迟 |
| T-06 | 改命令规则 | 新命令完整重算；旧 Active 继续到新命令生效；Halt 立即停（过边中除外） | ✅ “延迟重新开始计算”；避免“改命令 = 原地发呆” | 改命令时原命令立即停止 |
| T-07 | 地块层移动模型 | 两格中心连线上的“纵队头位置”；过半切换归属；10 分钟步内插值精确时刻 | 简单、可手算、和 ✅ 过边规则一致 | 按格内连续坐标 |
| T-08 | 遭遇战判定 | 对面营处于行军/集结/过边，或到达 < 60 min，或对向行军 | ✅ §11.2 只给定性描述 | 只有“对向行军”才算遭遇战 |
| T-09 | 战斗创建时的防守营选择 | 先 `EdgeAssignment`，再地块预备，再最少交战者；自动参战无延迟 | 就地防御是条令反应；不让防守方因延迟白丢地块 | 防守营也要走 Reactive 延迟 |
| T-10 | 战斗结束条件与判定顺序 | §4.7.1 七条，自上而下；09 判定，04 给指标 | ✅ §11.3 三条的可执行化 | 04 全权判定 |
| T-11 | 地块易手后的处理 | 败方在该地块的全部营被迫撤一格；无路 → 被包围，控制权仍易手，失去战斗力后被俘 | 让“包围”自然出现，代价可见 | 无路时营原地全灭；或不易手 |
| T-12 | 精度档调度规则 | 按小时、按战斗预留；成本 = pair-minutes；预算只由 `FidelityProfile` 决定，**与游戏速度无关**；星标不受预算限制 | G-21 可复现；同一场战斗一小时内精度一致便于回放 | 预算随速度档变化，速度变化记入输入日志 |
| T-13 | 玩家正在看的战斗是否自动实时 | 否，只有星标才算；界面提示“标星以实时模拟” | 视图状态不应影响模拟结果 | 打开视图 = 记一条输入并临时提升优先级 |
| T-14 | `FidelityTier.Proxy` 在阶段 1 是否使用 | 不使用（纳卡只有一个战区） | 简化 | 外部大国介入的战斗用 Proxy |
| T-15 | 速度档 | 1 / 5 / 20 / 60 / 240 游戏分钟每秒 | ✅ 最慢 1 min/s；最快“几小时/秒” | 最快 480 |
| T-16 | 昼夜算法与天气 | NOAA 简化公式；Day > 0°，Twilight 0 ~ −6°；阶段 1 天气恒晴 | 精度足够；天气是第二优先 | 只按本地时刻 6–18 点分昼夜 |
| T-17 | 自动暂停默认门槛与过滤器归属 | 12 连 / 15% 损失；类型归 13，09 只出事件 | 符合 00 归属表 | `AutoPauseFilter` 改归 09 |
| T-18 | 通信干扰的输入来源 | 05 提供 `GetCommsJamming(tile, country)`，阶段 0 恒 0；系数 0.6 | 05 已管电磁管控/电子侦察 | 由 08（电子战飞机）或单独的 EW 规格提供 |
| T-19 | 脱离接触的分工 | 09 触发与等待，04 执行与代价；建议组织 30 min × 状态系数 | 00 把 `Disengage` 归 04 | 09 全权（固定代价表） |
| T-20 | 条带步错峰 | 默认关闭（00 §5.1） | 先求简单 | 开启，降低峰值耗时 |
| T-21 | 跨地块打击的情报 | 用下令时的快照，命中修正按 `ageMs = 开火时刻 − 情报时间戳` 交给 05 的 `ExposureAccuracyFactor` | ✅ §11.1.1 | 开火时用最新情报 |
| T-22 | 寻路默认绕开敌方地块 | 代价 × 3（目的地除外） | 防止无意中路过敌格触发战斗 | 不绕开，最短路 |
| T-23 | 燃油耗尽的营 | 速度 0，可停在边上；弃车步行阶段 1 不做 | 简单；06/07 后续决定 | 自动弃车步行 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 命令类别 | `OrderClass` | `Planned / Reactive / UrgentSimple / Administrative（纯配置，0 延迟）/ Forced / OrgAdministrative（编制操作，有延迟、非战斗中执行）`，决定延迟系数（DC-041） | 09 |
| 命令失败原因 | `OrderFailReason` | `ValidateOrder` 的返回值，写入 `OrderFailed` 通知 | 09 |
| 编制操作命令 | `OrgAdminPayload` / `OrgAdminKind` | 合并营、合并连、撤编走命令通道（生效时调 07） | 09 |
| 挖壕状态 | `EntrenchState` | 地块层挖壕进度 [0,1]；达门槛转 `Entrenched`（DC-165） | 09 |
| 控制权变更原因 | `TileControlChangeReason` | `Handover / Scenario`：非战斗的控制权改写 | 09 |
| 命令槽位 | `OrderSlot` | 同一单位同一槽位只允许 1 条 Pending + 1 条 Active | 09 |
| 命令状态 | `OrderStatus` | `Pending / Active / Completed / Superseded / Cancelled / Failed` | 09 |
| 延迟明细 | `OrderDelayBreakdown` | 命令延迟各乘数的记录，供界面解释 | 09 |
| 停止 | Halt（`Move` 且 path 为空） | 停止移动、就地防守的紧急简单命令 | 09 |
| 移动阶段 | `MovePhase` | `Approach / Crossing / Depart / HeldAtEdge / WaitingDisengage` | 09 |
| 营移动状态 | `BattalionMoveState` | 营的地块归属、段内进度、纵队长度等组件 | 09 |
| 战斗触发 | `BattleTrigger` / `BattleTriggerKind` | 触发交界边战斗的记录；`Attack / Meeting` | 09 |
| 战斗结束原因 | `BattleEndReason` | 见 §3.5 | 09 |
| 精度档设置 | `FidelityProfile` | `Low / Standard / High / AllFull / AllCached`；决定每小时实时模拟预算 | 09 |
| 精度分配 | `FidelityAssignment` | 某战斗本小时窗口的精度档与原因 | 09 |
| 配对分钟 | pair-minutes | 调度成本单位：（空间单元数）² × 分钟 | 09 |
| 光照条件 | `LightCondition` | `Day / Twilight / Night` | 09 |
| 暂停原因 | `PauseReasons` | `[Flags]`：Player / AutoPauseBattle / AutoPauseEvent / Modal / Loading | 09 |
| 通知 | `Notification` / `NotificationKind` | 通知列表条目 | 09（数据）/ 13（呈现） |
| 被包围 | Encircled（`NotificationKind.UnitEncircled`） | 地块易手时无路可撤的营的状态 | 09 |
| 情报快照 | `IntelSnapshot` | 下令时的暴露等级、时间戳、位置误差、观察到的姿态 | 09 |
| 防守分配 | `EdgeAssignment` | 营在所在地块内负责哪条边或作为地块预备（定义在 12） | 12 |
