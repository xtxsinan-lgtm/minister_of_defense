# 04 交界边条带层（EdgeBattle、条带、五条线 A–E）

> 依据：总纲 §9.3①②④、§9.2、§10.5、§11.1.1、§11.1.2、§11.2、§11.3、§11.4、§19.3、§19.9；术语表 [00](00_glossary.md)（尤其 §3.6 条带坐标、§5 更新顺序、§6 确定性）。
> 本文件定义：`EdgeBattle`、`Strip`、`StripTerrain`（生成）、`StripElement`、`ContactLine`、五条线 `BattleLine` A–E 的推进与耦合、`BreachProgress`、`PenetrationProgress`、`FortificationLevel`、`EchelonRole`、`Frontage`、条令 AI `StripDoctrineAi`、片段的生成与写回、支援火力共享队列 `SupportFireBroker`、地面跨地块火力结算、脱离接触 `Disengage`、按阶段拆分的战报数据。
> 片段**内部**怎么打见 [03](03_squad_combat.md)；战斗**何时触发、何时判定结束、地块归属**由 [09](09_time_orders.md) 判定（本文件提供指标并执行创建/结束）；暴露度见 [05](05_recon_exposure.md)；条带补给车队的逻辑见 [06](06_logistics.md) §4.8；损伤之后的恢复见 [07](07_damage_repair.md)。
> 标记：✅ 总纲已定；🟡 建议待确认（编号 `E-xx`，汇总在第 10 节）。

---

## 1. 目标与范围

**解决的问题**：两个相邻地块之间发生地面战斗时，在一条“宽 = 边长、纵深 ±40 km”的条带上，以连/炮兵连/营属支援分队为位置单元，按条令自动部署和机动，并让**五条线同时推进**：

| 线 | `BattleLine` | 本文件做什么 |
|---|---|---|
| A 纵深打击 | `DeepStrike = 1` | 跨地块火力、条带纵深目标（指挥所、预备队、集结地、保障区）的地面远程火力结算；接收 08 的空袭事件 |
| B 侦察与反侦察 | `Recon = 2` | 计算条带内地面侦察与战术无人机对敌营的侦察速率，写给 05；战术无人机的损耗 |
| C 反炮兵与火力消耗 | `CounterBattery = 3` | 炮兵/迫击炮任务分配、反炮兵雷达定位、打了就转移、对运动中连的拦阻射击、巡飞弹出击 |
| D 破障 | `Breaching = 4` | 防守方布雷/障碍密度、进攻方破障进度、工事等级 |
| E 直瞄交战 | `DirectFire = 5` | 按正面宽度生成 `Engagement`（03 内部模拟），共享支援火力排队，写回推进与损失 |

并据此给 09 提供结束判据（`PenetrationProgress`、`IsCombatEffective` 等），给 13 提供按阶段拆分的战报数据。

**设计原则落点**：
- 条带层**始终实时**模拟（总纲 §9.3）；只有 E 线片段可能用 `Cached` 精度（09 决定）。
- 条带层**不额外加随机**（✅ 总纲 §21-1）：连续量（破障、工事、推进度、侦察速率）用期望值；离散事件（命中、击毁、雷达定位成功）抽样。
- “堆兵有代价”“防御优势”“请求链”都由机制产生：正面宽度限制同时片段数；集结抬高特征值（05）招来 A/C 线火力；工事和预设诸元来自防守时间；支援火力共享排队。

| 阶段 | 包含 | 不包含 |
|---|---|---|
| 阶段 0 | 标准地形条带（试验场：单条边，双方各 1 个营到 1 个旅）；五条线全部规则；片段生成与写回；支援火力共享队列；AAR 数据。暴露度用固定值；A 线只有条带内的远程火力 | 真实地图；跨地块打击命令；空中层（巡飞弹用本文件的后备拦截公式） |
| 阶段 1 | 由真实 DEM/地表覆盖生成的条带地形（纳卡）；09 的触发/结束；05 的暴露度；08 的空袭与巡飞弹飞行/拦截；06 的条带车队；跨地块地面火力（远程火箭炮、战术导弹） | 城市多层建筑；电子战对条带通信的细粒度模型（只用 05/08 给的干扰强度）；两栖登陆条带（阶段 3） |
| 阶段 2+ | 预留：大规模 FPV（`isFpv` 弹药走本文件后备公式）、河流强渡专门规则、条带地形季节变化 | — |

---

## 2. 玩家能做什么、看到什么

玩家**不能**在条带上操作（总纲 §9.3：连级视图只读）。玩家在条带之外的决策，以及它们在条带上的落点：

**决策清单**

| 决策（在哪做） | 条带上的落点 |
|---|---|
| 哪些营/旅进哪个地块、进攻还是留守（09 命令、12 编组 AI） | 谁参战；`EdgeBattle` 是否产生；参战营数 vs 正面宽度 → 第一梯队/第二梯队/预备队（§4.11） |
| 何时撤退（09 撤退命令） | 脱离接触的组织时间与途中挨打（§4.12）；受损车辆遗弃（07） |
| 🟡 旅的**火力支援优先** `FireSupportPriority`（`CloseSupport / Balanced / CounterFire`，旅设置，E-05） | 炮兵连在 E 线待命与 C 线任务之间的比例（§4.6.2） |
| 编制：工兵、扫雷车、反炮兵雷达、战术无人机、自行 vs 牵引火炮、近程防空（01） | D 线破障速度；C 线定位与生存（打了就转移的时间）；B 线侦察速率与无人机损耗；巡飞弹拦截 |
| 弹药基数、巡飞弹库存（06/11） | C/A 线可出动任务数 |
| 电磁管控（05 的 `EmconState`） | 防空雷达开机才能拦截，但开机会被反辐射巡飞弹优先选中（§4.6.5） |
| 后勤策略（06 的 `NightOnly/Auto`） | 车队在杀伤区的损耗（§4.15 威胁场） |
| 星标（13） | 片段用 `Full` 精度、可回放到班（09 调度） |

**反馈清单**（13 呈现；数字全部来自本文件的数据）

| 反馈 | 数据 |
|---|---|
| 条带视图：北约军标的连、炮兵连、接触线、雷场与破障通道（按扇区的 `obstacleDensity / breach` 着色）、火力连线、射程覆盖 | `StripElement` 位置、`ContactLine`、`SectorState`、`FireMission` 记录 |
| 敌方单位按暴露等级显示（L1 只显示“有东西”…） | 05 `GetLevel` |
| 五条线状态条：A/C 线本小时任务数与命中、B 线双方对敌暴露等级、D 线各扇区破障 %、E 线活跃片段数 / 正面宽度 | `LineSnapshot` |
| **瓶颈提示**（§4.14.3 的规则表）：如“第 2 炮兵连够不到对方炮兵阵地”“2 连等迫击炮已 6 分钟”“3 号扇区破障停滞：敌火力覆盖 0.8” | `BottleneckHint` |
| 战后报告按阶段拆分损失：“本旅 60% 的装备损失发生在 C 线（敌巡飞弹），破障用了 14 小时，直瞄交战只占损失的 25%” | `BattleLossLedger` 汇总（§4.14） |
| 24 小时阶段战报 | `PeriodicBattleReportData` |
| 回放（只存事件）；`Full` 片段可回放到班 | `BattleEventLog`（15） |

---

## 3. 数据结构

命名空间 `MoD.Sim.Strip`。ID 强类型（00 §2.2）。坐标单位米，**战斗坐标**（00 §3.6：进攻方一侧 y < 0）。

### 3.1 枚举

```csharp
public enum BattleLine : int { None = 0, DeepStrike = 1, Recon = 2, CounterBattery = 3, Breaching = 4, DirectFire = 5 }
public enum EchelonRole : int { FirstEchelon = 1, SecondEchelon = 2, Reserve = 3 }
public enum StripSide : int { Negative = -1, Positive = +1 }      // y<0 一侧 / y>0 一侧（06 的 int side 即此值）
public enum BattleRole : int { Attacker = 1, Defender = 2 }        // 战斗开始时的角色；遭遇战按 09 给的 attacker
public enum StripElementKind : int {
    Company = 1,            // 连（含坦克连、步兵连、侦察连）
    FireUnit = 2,           // 炮兵连 / 火箭炮连 / 营迫击炮排（间瞄火力单位）
    SupportDetachment = 3,  // 营直属支援分队（反坦克排、防空排、工兵排、侦察排…）的集合
    Headquarters = 4,       // 营部/旅部（班集合）
    AirDefense = 5,         // 防空连/排（同时在 08 登记）
    LoiteringBattery = 6,   // 巡飞弹/无人机打击分队
    Logistics = 7           // 营辎重队、旅保障区的位置标记（库存在 06）
}
public enum StripTask : int {
    Hold = 1, Advance = 2, Reserve = 3, Withdraw = 4, Counterattack = 5,
    FireSupport = 6, Relocate = 7, Breach = 8, Recon = 9, Reorganize = 10, Deploy = 11
}
public enum ElementState : int { Idle = 1, Moving = 2, Locked = 3, Relocating = 4, Firing = 5, Disengaging = 6, Gone = 7 }
public enum FireSupportPriority : int { CloseSupport = 1, Balanced = 2, CounterFire = 3 }   // 🟡 E-05
// 方的编码：IStripQuery / StripLogistics（06）用 StripSide（±1）；其余 API 与结构体用 sideIndex（0 = 进攻方，1 = 防守方）。
public enum FireMissionKind : int {
    EngagementSupport = 1,  // E 线请求（03 的 FireSupportRequest）
    CounterBattery = 2, Interdiction = 3, PrepFire = 4, BreachSuppression = 5,
    DeepStrike = 6, Loitering = 7, Smoke = 8
}
```

### 3.2 条带与地形

```csharp
public sealed class Strip {                         // 每条发生过战斗的边一个；地形不随战斗改变
    public EdgeId edgeId;
    public double edgeLengthM;                      // 10 给的真实边长
    public StripTerrain terrain;                    // 规范方向存储（00 §3.6）
    public Vec2D p0, ex, ey;                        // 规范坐标系在“地块局部平面”里的原点和单位向量（§4.1.1）
    public int sectorCount;                         // = Frontage（§4.2.2）
    public double sectorWidthM;
    public SectorTerrainSummary[] sectorSummary;    // 每扇区的地形摘要（预计算）
}

public sealed class StripTerrain {
    public const double CellM = 250;                // 🟡 E-02
    public int nx;                                  // = ceil(edgeLengthM / CellM)
    public int ny;                                  // = 320（−40 km … +40 km）
    public StripCell[] cells;                       // 下标 = iy * nx + ix（规范坐标）
    public int dataVersion;                         // 10 的地形数据版本
    public bool fromRealDem;                        // true = 真实 DEM 采样；false = 程序生成
}

public struct StripCell {
    public TerrainType terrain;                     // 10 的枚举（Open, Mixed, Forest, Urban, Mountain, Marsh, Water…）
    public double elevationM;
    public double slopeDeg;
    public byte roadClass;                          // 0 无；1 小路；2 普通公路；3 干线（与 10 LinkCapacityClass 同序）
    public double vehiclePassability;               // [0,1]，越野通过性（§4.1.3）
    public double footPassability;                  // [0,1]
    public double losScaleM;                        // 视距尺度（03 §5.2 LosScaleM[terrain] × 起伏修正）
}

public sealed class SectorTerrainSummary {
    public double xMinM, xMaxM;
    public double[] terrainFraction;               // 按 TerrainType，统计 y ∈ [−3000, +3000]（规范坐标，用时按 orientation 换算）
    public double vehicleAvenue;                    // 扇区内 y∈[−3000,+3000] 的车辆可通行格比例（≥ AvenuePassMin 的格）
    public double reliefM;                          // 高程标准差
    public double meanLosScaleM;
}
```

### 3.3 战斗

```csharp
public sealed class EdgeBattle {                    // 归属 04
    public EdgeBattleId id;
    public EdgeId edgeId;
    public int orientation;                         // +1：进攻方在 tileA 一侧；−1：否则（00 §3.6）
    public SimTime startTime;
    public long startTick;
    public BattleTriggerKind kind;                  // 09：Attack | Meeting
    public BattleSideState[] sides;                 // [0] = 进攻方（StripSide.Negative），[1] = 防守方（Positive）
    public List<StripElementId> elements;           // 按 id 升序
    public SectorState[] sectors;                   // 长度 sectorCount
    public ContactLine contact;
    public double penetrationProgress;              // [0,1]
    public double breachProgress;                   // [0,1]，全战斗汇总（界面用）
    public List<EngagementId> activeEngagements;    // 按 id 升序
    public List<FireMission> missions;              // 未完成的任务（按 missionId 升序）
    public List<ScheduledGroundEvent> pendingEvents;// 已排程、未到时刻的地面事件（按 00 §6.4 排序键）
    public List<GroundStrikeEvent> pendingAirEvents; // 08 交来的、未到时刻的对地事件（类型归属 08 §4.4）
    public BattleLossLedger ledger;
    public LineCounters counters;                   // 五条线的累计统计（AAR）
    public int periodicIndex;                       // 已出的 24h 报告数
    public bool isEnded;
}

public sealed class BattleSideState {
    public CountryId country;
    public BattleRole role;
    public StripSide stripSide;
    public List<OrgUnitId> battalions;              // 参战营（升序）
    public List<OrgUnitId> disengagingBattalions;
    public DoctrineProfile doctrine;                // 按国家（14 数据）
    public SortedDictionary<int, FireSupportPriority> brigadePriority;   // 键 FormationId.value
    public double fireSupportSuppression;           // [0,1] 给 03（§4.6.7）
    public double initialCombatPower;               // 开战时本方参战营 CombatStrength 之和
}

public sealed class SectorState {
    public int index;
    public double obstacleDensity;                  // [0,1] 防守方在本扇区布设的雷障密度（D 线）
    public double breach;                           // [0,1] 进攻方在本扇区的破障进度
    public double defFireOnBreach;                  // [0,1] 上一条带步防守方火力对破障点的覆盖（D 线）
    public StripElementId attackerCompany;          // 本扇区第一梯队攻方连（0 = 无）
    public StripElementId defenderCompany;          // 覆盖本扇区的守方连（0 = 无）
    public EngagementId activeEngagement;           // 0 = 无
    public long cooldownUntilTick;                  // 片段结束后再生成的冷却
    public double breachStartedAtH, breachDoneAtH;  // AAR：破障耗时（−1 = 未开始/未完成）
}

public sealed class ContactLine {                   // 00：接触线 y = c(x)，分段常数（每扇区一个值）
    public double[] yM;                             // 战斗坐标；开始时全 0
    public double YAt(double xM) => yM[SectorOf(xM)];
}

public sealed class DoctrineProfile {               // 按国家的条令参数（14 数据，缺省见 §5）
    public double companyAttackFrontageM, companyDefenseFrontageM;
    public double reserveFraction;                  // 编入预备队的连比例
    public double secondEchelonFraction;
    public double dismountRangeM;                   // 传给 03
    public double rotateThreshold;                  // 连战斗力低于此值时轮换
    public double attackMinForceRatio;              // 发起 AttackPosition 的最低局部兵力比
    public double prepFireMin;                      // 攻击前炮火准备时长
    public bool allowNightInfiltration;
    public FireSupportPriority defaultFirePriority;
}
```

### 3.4 条带元素

```csharp
public sealed class StripElement {                  // 归属 04
    public StripElementId id;
    public EdgeBattleId battleId;
    public StripElementKind kind;
    public OrgUnitId orgUnitId;                     // 连/排；SupportDetachment、Headquarters 用营 id
    public OrgUnitId battalionId;
    public List<SquadId> squads;                    // 本元素包含的班（升序）
    public int sideIndex;                           // 0 进攻方、1 防守方
    public Vec2D posM;                              // 战斗坐标
    public Vec2D targetPosM;                        // 条令目标位置
    public StripTask task;
    public EchelonRole echelon;
    public ElementState state;
    public int sector;                              // 所属扇区（−1 = 不在扇区内，如炮兵、预备队）
    public double fortLevel;                        // [0,1] 工事等级（守方；攻方停止后也会增长，§4.7.3）
    public long cooldownUntilTick;
    public long stateUntilTick;                     // Relocating/Deploy 的结束刻
    public bool isSharedAsset;                      // 地块级资产（旅炮、防空）在本条带的投影
    public Vec2D tileLocalPosM;                     // 共享资产在地块局部平面的位置（§4.1.1）
    public double footprintW, footprintD;           // 展开时的正面×纵深（§4.4.4）
}

public readonly record struct StripElementInfo(     // IStripQuery.CompaniesOf 的返回项（06 只读）
    StripElementId id, OrgUnitId company, Vec2D posM, bool isLocked);

public sealed class FireUnitState {                 // 组件，键 = StripElementId（kind == FireUnit / LoiteringBattery）
    public StripElementId elementId;
    public int tubes;                               // 有足够乘员、未损坏的炮/管/发射车数（每条带步刷新）
    public double rangeMaxM, rangeMinM;
    public bool isDeployed;                         // 已展开可射击
    public SimTime freeAt;                          // 队列中最后一个任务的结束时刻
    public SimTime lastFiredAt;
    public bool reservedForE;                       // 本条带步被指定为 E 线待命
    public List<FireMissionId> queue;               // 按 §4.9.4 全序排序
    public bool knownByEnemyCb;                     // 本步被敌反炮兵雷达定位（§4.6.4）
}
```

### 3.5 火力任务与地面事件

```csharp
public sealed class FireMission {
    public FireMissionId id;
    public FireMissionKind kind;
    public StripElementId fireUnit;
    public FireSupportRequestId requestId;          // 仅 EngagementSupport
    public TargetRef target;                        // StripElement | Battalion(地块内) | Node | Crossing | Loc | Point
    public Vec2D aimPointM;                         // 下达时的瞄准点（含情报误差，§4.4.2）
    public double tleSigmaM;                        // 目标定位误差 σ
    public ModelHandle munition;                    // 弹种（YAML id 加载时转句柄，00 §2.2）
    public int rounds;                              // 总发数
    public SimTime fireAt, impactAt;
    public BattleLine lineTag;                      // AAR 归因（§4.14.1）
    public int priorityClass;                       // §4.9.4
    public MissionStatus status;                    // Queued | Firing | Done | Cancelled
}

public readonly record struct ScheduledGroundEvent(
    long timeMs, FireMissionId missionId, int roundIndex, ulong sourceEntityId, int seq);
```

### 3.6 战报数据

```csharp
public sealed class BattleLossEntry {               // 07 的 Apply* 在单位处于战斗中时回调 RecordLoss 写入
    public long timeMs;
    public int sideIndex;
    public OrgUnitId battalionId;
    public SquadId squadId;
    public TemplateHandle squadTemplate;
    public LossKind kind;                           // Person | Vehicle | Equipment
    public int severity;                            // CasualtyState 或 DamageLevel（07）的整数值
    public ModelHandle model;                       // 车辆/装备型号；人员为 0
    public SpecialtyHandle specialty;               // 人员专业；装备为 0
    public BattleLine line;
    public CategoryHandle sourceCategory;           // 造成损失的武器类别（巡飞弹、榴弹炮、ATGM…）
    public bool friendlyFire;
}
public sealed class BattleLossLedger { public List<BattleLossEntry> entries; }   // 追加序 = (timeMs, 写入顺序)

public sealed class LineCounters {
    public int[] missionsByKind;  public int[] roundsByKind;
    public int lmLaunched, lmIntercepted, lmHits;
    public int uavLost;  public int cbLocates;  public int engagementsSpawned;
    public int[] engagementOutcomes;                // 按 EngagementOutcome
    public List<double> supportResponseS;           // 03 的请求从发现到首发落地
}

public readonly record struct BottleneckHint(int rule /*1–6 = §4.14.3 的 H1–H6*/, StripElementId subject, double[] numbers);

public sealed class PeriodicBattleReportData {
    public EdgeBattleId battleId; public int periodIndex; public SimTime from, to;
    public LossBreakdown[] bySide;                  // 按线、按来源类别、按严重度、按班模板
    public double penetrationProgress, breachProgress;
    public double[] contactYM;
    public double[] combatPowerFraction;            // [side] 当前/开战
    public List<BottleneckHint> hints;
}
```

---

## 4. 算法与公式

### 4.0 调用时机总览（与 00 §5.2 一致）

| `TickPhase` | 频率 | 本文件做什么 |
|---|---|---|
| 70 `BattleLifecycle` | 每 10 min | 09 判定触发后调用 `CreateEdgeBattle` / `JoinBattle`（按 `EdgeId` 升序） |
| 80 `StripStep` | 每 `StripStepMinutes`（5），对每个活跃战斗按 `EdgeBattleId` 升序 | §4.3 的子步骤 |
| 80 `StripStep`（§4.3 第 10 步） | 每条带步 | 未锁定元素的疲劳、压制消退、燃油（00 阶段 120 `Consumption` 的条带部分在此完成） |
| 100 `EngagementStep` 末 | 每刻 | `SupportFireBroker.Commit()`：把本刻所有片段缓冲的请求统一入队（§4.9.4） |
| 110 `GroundEventApply` | 每刻 | 应用本刻到时的地面事件（不属于任何活跃片段的落点、巡飞弹命中、08 的对地事件）（§4.4.3） |
| 140 `BattleEnd` | 每条带步 | 先算指标（§4.10、§4.13）；09 判定后调用 `EndEdgeBattle`（§4.13.3） |
| 150 `Reporting` | 每刻 | 24h 报告（09 调用 `MakePeriodicReport`） |

### 4.1 条带地形生成（每条边一次，结果固定）

#### 4.1.1 坐标系（规范方向，00 §3.6）

- 10 提供边的两个端点 `E_a, E_b`（经纬度）、两个地块中心。地块局部平面：以**边中点**为原点的等距圆柱近似 `X = R × Δlon × DMath.Cos(lat0)`、`Y = R × Δlat`（R = 6 371 008.8 m，lat0 = 边中点纬度）。
- `p0` = 面朝 +y（从 tileA 看向 tileB）时左手边的端点；`ex = (p1 − p0)/|p1 − p0|`；`ey` = `ex` 逆时针转 90°，并保证 `ey` 指向 tileB 中心（若点积 < 0 则取反并交换端点）。
- 规范坐标 ↔ 平面：`P = p0 + x·ex + y·ey`；`x = (P − p0)·ex`，`y = (P − p0)·ey`。
- 战斗坐标 ↔ 规范坐标：`orientation = +1` 相同；`−1` 时 `(x, y)_battle = (L − x, −y)_canonical`。
- 经纬度 ↔ 战斗坐标（08 用）：`Vec2D LatLonToBattle(EdgeBattleId, LatLon)` = 经纬度 → 地块局部平面（上面的等距圆柱近似）→ 规范坐标 → 战斗坐标；`LatLon BattleToLatLon(EdgeBattleId, Vec2D)` 为其逆（`LatLon` 见 10）。
- **共享资产（G-08 的映射规则，E-03）**：地块级资产（旅属炮兵、防空、巡飞弹分队）只存一个“地块局部平面位置” `tileLocalPosM`（相对于**所在地块中心**的平面坐标）。在某条带里的位置 = 把它换到该边的平面（两平面原点差由 10 的经纬度算出，常量）后用上式投影。同一资产在同一地块的多条边上有不同的投影，但是同一个实体、同一个弹药库存、同一个任务队列。

#### 4.1.2 真实地形采样（阶段 1，`fromRealDem = true`）

10 的离线流水线对每个格子中心 `P(ix, iy)` 采样：高程（DEM 双线性）、坡度（3×3 Sobel）、地表覆盖众数（ESA WorldCover 10 m → 映射到 `TerrainType`）、格内道路最高等级（OSM）。04 只读结果文件 `data/map/strips/<edgeId>.bin`（格式由 10 定义）。纳卡全部约 180 条陆地边离线生成，约 180 × 29 440 格 × 32 B ≈ 170 MB 未压缩；🟡 E-02 讨论是否只为可能交战的边生成。

#### 4.1.3 程序生成（阶段 0 标准地形 / 无数据时）

```text
输入：两个地块的 TerrainComposition（10）：各 TerrainType 占比 f_A[t], f_B[t]；高程均值/标准差 μ, σ；道路密度 ρ（km/km²）
RNG：Rng.ForKey(RngDomain.MapGen, Mix(tileA) ^ tileB, SaltTerrainNoise)   // 与世界种子无关（E-04）
1. 值噪声 n1(ix, iy)：在 2 km 网格上取 U[0,1) 随机值，双线性插值到 250 m 格（同一 RNG 流按格网点 (gy, gx) 升序抽）
2. 每个格子的目标占比：y<0 用 f_A，y>0 用 f_B；|y| < 2000 m 时线性混合
3. 分类：按半边分别对 n1 排序（平局按格子下标），按顺序 Water → Urban → Forest → Marsh → Mountain → Mixed → Open
   依次划给累计占比（这样每半边的面积占比精确等于 f）
4. 高程：elev = μ_side + σ_side × (2·n2 − 1) × 1.7，n2 为另一张 4 km 值噪声；Mountain 格再 + σ_side
5. 坡度：读 10 的 slopeHalfDeg/2（无输入文件时由相邻格高程差算）；vehiclePassability = VehPass[terrain] × max(0, 1 − slopeDeg / VehSlopeMaxDeg)
                              footPassability = FootPass[terrain] × max(0.2, 1 − slopeDeg / FootSlopeMaxDeg)
6. 道路：干线数 = round(ρ × L × 80 km / 1000 / 20)，至少 1；每条为沿 y 方向的折线，起点 x 由 RNG 均匀抽，
   每 1 km 横向偏移 ±250 m（RNG），所经格子 roadClass = 2（第一条为 3）；道路格 vehiclePassability = 1
7. losScaleM = LosScaleM[terrain]（03 §5.2）× (1 + min(2, reliefLocal / 100 m))^(-0.5)   （起伏越大视距越碎）
```

扇区摘要（§3.2）在生成后立即计算并缓存。

### 4.2 创建战斗与部署

#### 4.2.1 `CreateEdgeBattle(EdgeId e, CountryId attacker, CountryId defender, BattleTriggerKind kind, List<OrgUnitId> attackers, List<OrgUnitId> defenders, SimTime at)`

```text
1. strip = LoadOrGenerateStrip(e)；orientation = (attacker 在 tileA 一侧 || kind == Meeting) ? +1 : −1   // G-06
2. 新建 EdgeBattle（ID 按创建顺序分配，00 §2.2）；sides[0] = 攻方，sides[1] = 守方
3. sectors：sectorCount 与 sectorWidthM 见 §4.2.2；contact.yM[] = 0
4. 守方部署（§4.11.1，条令“预设防御”）：
     每个守方连：fortLevel = 09.GetEntrenchProgress(battalionId)（[0,1]）
     每个扇区 obstacleDensity = ObstacleInit(守方营在防守地块的驻守时长 h, 工兵能力)（§4.7.1）
   Meeting：守方也按“行军纵队”放置（同攻方，镜像到 y>0）
5. 攻方放置：按 09 给的营顺序、营内连 OrgUnitId 升序，形成纵队：
     第 k 个连：pos = (L/2 + 道路偏移, −ArrivalDepthM − k × ColumnSpacingM)，task = Deploy，
     stateUntilTick = now + AttackDeployMin（展开时间），之后条令 AI 分派扇区
6. 共享资产：攻守双方旅属 FireUnit / AirDefense / LoiteringBattery 若在两地块之一，创建投影元素（isSharedAsset = true）
7. 每方 initialCombatPower = Σ 参战营 CombatStrength（03 §4.13，按营汇总）
8. 通知 05：本战斗双方营进入战斗（05 改用 StripReconSample）
```

- `JoinBattle(battleId, battalionId, sideIndex, asCounterattack)`：该营的连以纵队放在本方 `ArrivalDepthM` 处，`EchelonRole.Reserve`，`task = Deploy`；`asCounterattack == true`（09 的反冲击营）时，其连立即 `task = Counterattack`，目标扇区 = contact 最深者（§4.11.3）。
- 防守方无营（09 §4.6.2 第 4 条）：照常创建；E 线不生成片段，攻方按 §4.10.2 无抵抗推进。

#### 4.2.2 正面宽度与扇区（00 `Frontage`）

```text
sectorCount = max(1, round(edgeLengthM / DoctrineAttackFrontage))      DoctrineAttackFrontage = 攻方 doctrine.companyAttackFrontageM（缺省 1200 m）
sectorWidthM = edgeLengthM / sectorCount
Frontage（同时可进行的连级片段上限）= sectorCount
```

23 km 的边 → 19 个扇区，与总纲 §9.3“15–20 个连”一致。**正面宽度只限制同时片段数**，不限制在条带上的连数——多出来的连自然成为第二梯队和预备队（✅ 总纲 §9.3①）。扇区的车辆通行性 `vehicleAvenue` 决定能否用车辆进攻（§4.9.2），所以纳卡山地的有效“机械化正面”远小于 19。

### 4.3 条带步（阶段 80，每 5 分钟，`dtS = 300`）

```csharp
void StripStep(EdgeBattle b, long tick) {
    ApplyFinishedEngagements(b);        // 1. 读取本刻之前结束的片段结果，写回（§4.9.6），解锁连
    RefreshElements(b);                 // 2. 由班的实际状态重算每个元素：可用炮管、CombatStrength、速度、footprint
    LineA_DeepStrike(b, tick);          // 3. §4.4：规划条带纵深目标的远程火力任务；跨地块打击命令到期的任务排程
    LineB_Recon(b, tick);               // 4. §4.5：侦察速率 → 05；无人机损耗
    LineC_CounterBattery(b, tick);      // 5. §4.6：炮兵分配、反炮兵、拦阻、巡飞弹
    LineD_Breaching(b);                 // 6. §4.7：布雷、破障、工事
    DoctrineMove(b);                    // 7. §4.11：梯队、轮换、预备队、移动、炮兵阵位
    LineE_SpawnEngagements(b, tick);    // 8. §4.9：生成片段（同刻阶段 100 执行第一步）
    for (side in [Negative, Positive]) StripLogistics.Step(b.id, (int)side, C.StripStepMinutes * 60, this);   // 9. 06 §4.8（攻方坐标侧先）
    StripConsumption(b, C.StripStepMinutes * 60);           // 10. 未锁定元素的疲劳/压制消退/燃油（00 阶段 120 的条带部分在此完成）
    UpdateContactAndPenetration(b);     // 11. §4.10
    UpdateHintsAndCounters(b);          // 12. §4.14.3
    SubmitFireUnitExperience(b);        // 13. 本步有开火、拦截或出动的火力单位（炮兵、防空、无人机班）按（营, 专业, 型号）提交 02 CombatExperienceReport，contactMinutes = StripStepMinutes
}
```

**同一刻内的共享资源**：同一个旅属炮兵连被多条边引用时，各战斗在第 5 步只**提出**任务（缓冲），所有战斗的第 5 步结束后，按 §4.9.4 的全序键统一入队（00 §5.2 规则 6）。实现上：阶段 80 末尾调用 `SupportFireBroker.CommitPlanned()`。

### 4.4 A 线：纵深打击与地面跨地块火力

#### 4.4.1 任务来源

| 来源 | 说明 | `lineTag` |
|---|---|---|
| 09 `QueueCrossTileStrike(Order o)`（`o.payload is CrossTileStrikePayload`，09 §3.2） | 玩家/AI 对其他地块的打击命令；在命令生效时刻（09）到达本文件 | `DeepStrike` |
| 条带内纵深目标（条令自动） | 攻守双方射程足够的火力单位，对敌方己方纵深 ≥ `DeepTargetDepthM`（5 km）的目标：指挥所、预备队、集结中的连、炮兵以外的保障元素、BSA/BT 标记 | `DeepStrike` |
| 08 空袭（非 CAS） | 08 结算后给出 `GroundStrikeEvent`，04 在阶段 110 应用到条带元素 | `DeepStrike` |

条令自动纵深任务只在火力单位**不是** E 线待命、且 C 线没有更高效用目标时产生（§4.6.2 统一评分，纵深目标的价值见 `TargetValueC`）。

#### 4.4.2 一次打击的瞄准与弹数（地面远程火力，00：04 负责）

```text
情报快照（下令时）：level = 05.GetLevel(c, target)，ageMs = 05.GetAgeMs，posture = 05 IntelEstimate.observedPosture（观察时姿态）
直接观察：若本方有元素（FO、无人机轨道）在本条带步内直接观察到目标连（§4.5.3），σ_TLE 取 03 §4.5.3 表的观察者值
否则：σ_TLE = 05.TargetLocationErrorM(level, ageMs, posture)
精确打击许可：precise = 05.PrecisionStrikeAllowed(level, ageMs, posture)
弹数：rounds = BaseRounds[target kind, munition] × (precise ? 1 : 05.AreaStrikeAmmoMultiplier(level, ageMs, posture))，
      再截断到火力单位可用弹药与 MaxRoundsPerMission
瞄准点 aim = 目标“观察方相信的位置”= 真位置 + 偏移，偏移 ~ N(0, σ_TLE²) 每轴（RNG SaltStrikeOffset，一次任务一个偏移）
时间：fireAt = max(命令生效或任务入队, freeAt) + (isDeployed ? 0 : setupTimeS)
              + layTimeS × (autoLay ? AutoLayFactor : 1) × LaySkillMult × 1/(1 − 0.7 × fireSupportSuppression)（03 §4.5.4）；
      impactAt = fireAt + 距离 / speedMps
每发落点时刻：impactAt + floor(k / tubes) × 60 / rofSustainedRpm（各管同时射击；火箭炮：整齐射时间 / 发数）
```

- 精确制导弹药（`isGuided`）：每发落点偏移 = 公共偏移（σ_TLE）+ `guidedCepM` 散布；非制导：公共偏移 + `cepPerKmM × 距离km` 散布（03 §4.6.4 的 σ_tot）。
- 交给 08 的发射：`isInterceptable` 弹药（战术弹道导弹、巡航导弹）在 fireAt 调用 `08.RegisterGroundLaunchedMissile(...)`（08 §4.12），被拦截时 08 回调 `CancelScheduledEvent`；巡飞弹的跨地块打击（A 线）调用 `08.LaunchLoiteringSearch(...)`（08 §4.10.1），结果经 `OnLoiteringResult` 回传。
- 目标在移动：观察方相信的位置 = 情报时位置；目标真实位置 = 当前位置——**情报越旧，偏得越远**，由 05 的 `AgeFactor` 和真实移动共同体现。

#### 4.4.3 落点结算（阶段 110，按 00 §6.4 事件排序）

```text
对每个到时的 ScheduledGroundEvent 与 pendingAirEvents（两表合并，按 (timeMs, TickPhase, domainOrder, sourceEntityId, seq) 升序；domainOrder：04 地面事件 0、08 对地事件 1）：
  若落点所在位置属于某活跃 Engagement 的格子范围（x∈扇区、y 在片段范围）→ 已在阶段 100 作为 ExternalImpactEvent 交给 03，此处跳过
  否则按目标类型：
   StripElement（连等）：展开为班（§4.4.4 布局），对落点周围 3·Rs 内的每个班调用 03 的面杀伤单发结算
       AreaFire.ResolveRound(munition, impactPoint, squadsNearby, classOf, rng)   // 03 §4.6.4；含工事削减与误伤
   攻顶直接命中（巡飞弹、MAM-L）：选中元素中的一件车辆（§4.6.5 的选择规则），按 03 §4.6.3 Top 方位结算
   地块内营（未参战，A 线跨地块）：营的班按“地块内布局”展开：中心 = 09.GetBattalionPosition(bn)（换到地块局部平面），散布半径 TileFootprintM[posture]，
       班按 SquadId 升序放在半径内的确定性螺旋点上（黄金角螺旋，r_j = R√((j+0.5)/n)，θ_j = j × 2.39996 rad）
   Node / Crossing：hits = Σ_rounds Bernoulli(1 − exp(−NodeRadiusM² / (2σ_round²)))，
        调用 06.OnNodeStrike(new NodeStrikeEvent(node, attacker, WarheadClassOf(munition.warheadKg) /*06 §3.1 阈值*/, hits, timeMs, (int)missionId))
        或 06.OnCrossingStrike(new CrossingStrikeEvent(crossing, WarheadClassOf(munition.warheadKg), hits, timeMs, (int)missionId))
   Loc（打道路上的卡车）：trucksKilledExpected = rounds × LocKillPerRound × min(1, 06.GetTrafficTrucksPerH(victim, tile) / LocTrafficNorm)，调用 06.OnLocStrike
RNG：Rng.For(RngDomain.Strip, Mix(missionId) ^ (ulong)roundIndex, tick, SaltStrikeRound)
损失标签：LossSource { line = mission.lineTag, sourceModelId = 火力单位型号, kind = 弹种 }
```

#### 4.4.4 条带元素展开布局

```text
footprint：展开 Hold：W = min(sectorWidthM, doctrine.companyDefenseFrontageM) × 0.8，D = DeployedDepthM（500）
           Advance 或 state == Moving：W = 300，D = CompanyColumnM（1000）；Reserve 或 Deploy：W = D = 600；FireUnit：W = 400，D = 300
n = 班数；nCols = ceil(sqrt(n × W / D))；nRows = ceil(n / nCols)
第 j 个班（SquadId 升序）：x = pos.x − W/2 + (j % nCols + 0.5) × W/nCols；y = pos.y + (side==攻方 ? −1 : +1) × ((j / nCols + 0.5) × D/nRows − D/2)
班的 TargetClass：按 03 §4.6.1 规则（没有射手时，反斜面只对非高抛弹生效；工事用元素 fortLevel）；σe = 03 的 spreadM
```

不需要 RNG，布局只依赖班的 ID 顺序——同一时刻同一连的展开是确定的。

### 4.5 B 线：侦察与反侦察

#### 4.5.1 写给 05 的侦察速率（每条带步，每个观察方国家 × 每个敌方参战营）

```text
reconRatePerH(c → β) = Σ_{本方元素 k} ContactRecon(k, β) + Σ_{本方无人机轨道 u} UavRecon(u, β)
ContactRecon(k, β) = GroundReconRatePerH × reconPower(k) × max_{β 的连 j} LosFrac(k, j)        （只计距离 ≤ ContactReconRangeM 的 j）
   reconPower(k) = BaseCompanyRecon + Σ_{k 的可用装备} groundReconValue(model)（05 §5.2 缺省）× (0.5 + 0.5 × reconSkill)
   LosFrac(k, j) = exp(−dist(k, j) / meanLosScale(沿线 4 个采样格))
UavRecon(u, β) = UavReconRatePerH[category] × availability(u) × [β 的任一连在 u 的覆盖圆内（半径 = 型号 range_km，缺省 UavRangeM[category]）]
   availability(u) = min(1, endurance_h / (endurance_h + UavTurnaroundH))
reconRatePerH(c → β) += Σ_{本条带步写回的、c 方与 β 的连交战的片段 r} EngReconRatePerH × r.reconCoverage[c]   （03 EngagementResult，§4.9.6）
inContact = 过去 60 分钟内 c 与 β 有过 E 线片段
写入 05.StripReconSample(battleId, c, β, reconRatePerH, inContact, sampleMinutes = StripStepMinutes)
```

05 负责乘以目标的特征值、反侦察并积分（05 §4.2.5）。

#### 4.5.2 战术无人机轨道与损耗

- 每方每个营的 `uav_micro / uav_hand_launched / uav_small_vtol / uav_tactical` 件数中，`availability` 比例在空中。轨道中心：该营第一梯队连的平均 x、接触线前方 `UavOrbitDepthM[category]`（敌方纵深 1–5 km）。
- 损耗（每条带步，每架在空中的无人机）：

```text
λ_loss(per h) = Σ_{敌方防空元素 a，距离轨道中心 ≤ a 的射程} AdKillPerH[a 的类别] × (a 雷达开机 ? 1 : OpticalOnlyFactor)
              + Σ_{敌方连 j 在覆盖圆内} SmallArmsUavKillPerH
p = 1 − exp(−λ_loss × dtH)；Bernoulli（RNG SaltUavLoss，键 = 该无人机 EquipmentItemId）→ 07.ApplyVehicleDamage(Destroyed)
```

阶段 1 中型/大型无人机（`uav_tactical` 以上、`uav_male`）的轨道和损耗由 08/05 处理，本节只管营属小型无人机。

#### 4.5.3 条带内“直接观察”（给 C、A 线定位用）

本方在本条带步内**直接观察**到敌方元素 j，当且仅当：存在本方元素 k（有 `forward_observer`/侦察兵/车辆光学的连、FO 小组）满足 `dist ≤ ObserveRangeM[k 的最佳观瞄等级]`（03 §4.2.2 表的白天/夜间射程）且 `LosFrac(k, j) ≥ ObserveLosMin`；或 j 在本方无人机轨道覆盖圆内且 j 的 05 特征值 `05.GetSignature(battalionOf(j)).physical` ≥ `UavObserveSigMin`。直接观察不改暴露度（暴露度由 05 积分），只决定**本步**射击的 σ_TLE（§4.4.2）。

### 4.6 C 线：反炮兵与火力消耗

#### 4.6.1 火力单位状态刷新

每条带步：`tubes` = 元素内有 ≥ `crewMin` 可战斗乘员且 07 状态可用的间瞄武器件数 × `tubesPerItem`；`rangeMaxM` 取首选弹种；弹药读 06（`GetAvailable`）。`tubes == 0` → 不参与分配。

#### 4.6.2 E 线待命比例（`FireSupportPriority`）

```text
每方按旅：火力单位（排除营迫击炮排——营迫击炮排总是 E 线待命）按“到本方第一梯队连的平均距离”升序，
前 ceil(n × OnCallFrac[priority]) 个 reservedForE = true
OnCallFrac：CloseSupport 0.7，Balanced 0.5，CounterFire 0.3
待命单位也会执行 C 线任务，但只接受预计在 OnCallMaxBusyS（120 s）内完成的任务，且 E 请求可抢占其未开火的 C 任务（§4.9.4）
```

#### 4.6.3 C 线目标效用（条令效用 AI，双方对称）

对每个未满负荷的火力单位 u（按 id 升序），对每个候选目标 T（在 u 射程内）：

```text
U(u, T) = TargetValueC(T) × Peff(u, T) × Urgency(T) / max(1, RoundsNeeded(u, T) × allocValue(弹种))
Peff = 用 03 §4.6.4 对 T 的期望毁伤（d 用 σ_TLE 的期望：E[exp(−d²/(Rc²+2σe²))] = (Rc²+2σe²)/(Rc²+2σe²+2σ_tot²)）× 每发期望 → 归一到 [0,1]
候选目标与价值 TargetValueC：
  敌火力单位（定位方式：反炮兵雷达定位且未过期，或 05 等级 ≥ Type 且直接观察/无人机覆盖）：CbValue × 敌 tubes
  敌连 正在 Advance/Moving 且被直接观察：InterdictValue × 班数（拦阻射击——“C 线没压住时攻方推进持续挨打”的落点）
  守方：敌方破障分队（攻方工兵元素在扇区内、task == Breach）：BreachPartyValue
  攻方：计划在下 PrepFireMin 内发起 AttackPosition 的扇区里的守方连：PrepValue × (守方 fortLevel + 0.3)
  敌方纵深目标（A 线自动，§4.4.1）：Hq：HqValue；预备队/集结：ReserveValue × 班数；Logistics 标记：LogValue
  敌防空雷达（开机，被直接观察或 L4）：AdValue
Urgency(T)：T 在过去 10 分钟内向本方开火的炮兵 → 2.0；否则 1.0
选择 U 最大的 T（平局 T 的 id 小）；U < CMinUtility → 不出任务
```

任务入队后按 §4.4.2 计算时间与弹数（`RoundsNeeded` = `RoundsPerTube[kind] × tubes`，03 §5.3 同表），落点按 §4.4.3 结算。

#### 4.6.4 反炮兵雷达与“打了就转移”

```text
敌方火力单位 u 本步有任务开火 → 对本方每部可用且开机的 radar_counter_battery r（按 EquipmentItemId 升序）：
   若 dist(r, u) ≤ CbRadarRangeM[r 的型号或缺省] 且 dist(r, 落点) ≤ CbRadarRangeM：
      Bernoulli(CbLocateP × (u 为迫击炮 ? 1 : CbArtyMult))（RNG SaltCbLocate，键 = Mix(r) ^ missionId）
      成功：本方获得 u 的定位 fix（σ = CbRadarTleM，有效至 now + CbFixValidMin），u.knownByEnemyCb = true；counters.cbLocates++
         （本方也把它报给 05：作为一次 GroundRecon 速率脉冲 CbReconPulse 加到 u 所在营的 StripReconSample）
   雷达开机本身给 05 记一次电磁特征事件（05 处理）
打了就转移（条令）：u 最后一发出膛后，若 敌方有任何反炮兵雷达或无人机轨道覆盖 u（按本方的情报：05 等级 ≥ Presence 即视为有）：
   u.state = Relocating，stateUntilTick = now + RelocateMin[deployType]（自行 SP 3，车载 6，牵引 20 分钟），
   目标位置 = 当前位置横向 ±RelocateDistM（交替方向，按任务序号奇偶），期间 tubes 不可用
反炮兵弹落点时：若目标 u 已离开原位置 > RelocateEscapeM → 落在空地（只对附近其他元素生效）
```

**涌现**：自行火炮能在敌反炮兵弹到达（定位 + 链路 + 准备 + 飞行 ≈ 3–6 分钟）前撤离，牵引火炮不能——这正是“自行 vs 牵引”的采购价值；没有反炮兵雷达的一方打不了对方炮兵，只能靠无人机。

#### 4.6.5 巡飞弹与无人机打击（纳卡 2020 的关键）

```text
LoiteringBattery u（装备 loitering_munition 类别，C-18 新类别；或 08 管理的察打无人机不在此）：
每条带步出动数 sorties = min(库存, floor(LaunchRatePerH × launchers × dtH + carry))；carry 为小数累积（确定性）
目标选择（对每次出动，按优先级取第一个存在的，平局 id 小）：
  1. 敌防空元素且雷达开机（反辐射导引头型号 seeker = AntiRadiation 时优先）
  2. 敌火力单位（定位 fix 有效，或 05 等级 ≥ Type）
  3. 敌连中的车辆，连的 05 等级 ≥ Type 或被本方无人机覆盖
  4. 无目标 → 不出动
飞行与拦截：
  阶段 1：调用 08.LaunchLoiteringMunition(u, munitionId, targetElement, launchTime) → 08 负责飞行、搜索获取（05 §4.4.5）、
          地面防空拦截（AirDefenseRegistration）；08 回传 GroundStrikeEvent（含 pHitDirect）或“被拦截/未获取”
  阶段 0 与 08 缺失时的后备公式（E-07）：
     到达时刻 = 发射 + 距离 / speedMps
     P_intercept = 1 − Π_{目标附近 AdCoverRangeM 内的敌防空元素 a}(1 − AdPkVsLm[a 的类别] × (a 雷达开机 ? 1 : OpticalOnlyFactor))
     P_acquire  = 1 − exp(−SearchK × 05.GetSignature(battalionOf(目标)).physical × seekerQuality × LoiterMin)   （同 05 §4.4.5 的形式）
     到达后：Bernoulli(P_intercept) → 被拦截（counters.lmIntercepted++）；否则 Bernoulli(P_acquire × pHitDirect) → 命中
命中：选中目标元素里的一件车辆：防空 → 雷达/发射车；火力单位 → 炮/发射车；连 → 按 TargetValue（03）降序取第一件可用车辆（平局 itemId 小）
      按 03 §4.6.3 Top 方位结算（topMm 很薄 → 几乎必然击穿），车内人员按 03 表
lineTag = CounterBattery（即使目标是坦克——AAR 的“C 线（敌无人机）”）
```

**纳卡可表达性检查**：Osa/Strela-10/Kub 的 `AdPkVsLm` 低（小 RCS、低空慢速、老旧雷达，常数表 0.10–0.25），且雷达开机即成为第 1 优先级目标；`EmconState.Silent` 时不被反辐射弹选中，但 `OpticalOnlyFactor` 使其拦截能力几乎为零——**“开机被打、关机无用”的困境**自然出现。

#### 4.6.6 拦阻射击对运动中连的效果

由 §4.6.3 的 `Interdict` 目标产生普通任务，落点按 §4.4.3 对展开成纵队的班结算（`Advance/Moving` 布局，人员多为乘车 → 打到车上按车辆面杀伤）。无需额外“攻方挨打倍率”：只要守方火力单位没被压制、弹药足、能观察到，攻方推进就持续挨打。

#### 4.6.7 给 03 的 `fireSupportSuppression`

```text
fireSupportSuppression[s] = 1 − Σ_{s 的火力单位} tubes_now × (state ∉ {Relocating}) / max(1, Σ tubes_at_battle_start)
```

（它只影响 03 中支援火力的射击节奏，03 §4.5.4；真正的“压住对方炮兵”体现在对方炮少了、在转移、弹药少。）

### 4.7 D 线：破障、布雷、工事

#### 4.7.1 初始雷障

```text
ObstacleInit(prepH, E_def) = ObstacleMax × (1 − exp(−prepH / τ))，τ = E_def ≥ 1 ? ObstaclePrepTauEngH : ObstaclePrepTauNoEngH
prepH = 守方营在防守地块连续处于 Defending/Entrenched 的小时数（09）；E_def = 守方营工兵当量（下式）
按扇区：车辆可通行性高的扇区优先（条令把雷场放在坦克可通行方向）：
   obstacleDensity_i = ObstacleInit × (0.5 + 0.5 × vehicleAvenue_i / max_j vehicleAvenue_j)
```

工兵当量：`E = Σ_班 (engineer 专业可战斗人数 × (0.5 + 0.5 × skill)) / EngineerSquadSize + MineClearVehEquiv × 可用 mine_clearing_vehicle + EngVehEquiv × 可用 engineer_vehicle`。

#### 4.7.2 每条带步（dtH = 5/60）

```text
守方持续布设（总纲：防守方持续布设）：
  dO_i = (LayRatePerH × E_def,i + RemoteMineRatePerH × remoteMiningSalvos_i) / sectorWidthKm × (1 − O_i) × dtH
  E_def,i = 守方 task == Hold 的工兵元素按扇区分配（平均分到其连覆盖的扇区）
  remoteMiningSalvos_i：守方火力单位本步执行的 Smoke/BreachSuppression 外的“远程布雷”任务（弹种 kind == Mine，阶段 1 若有）
  O_i ← min(1, O_i + dO_i)；布设会部分抵消已开辟的通道：B_i ← B_i × (1 − dO_i / max(O_i, ε))

攻方破障（只在 attackerCompany ≠ 0 的扇区，且该扇区攻方工兵 task == Breach 或第一梯队连带有工兵）：
  E_att,i = 分配到扇区 i 的攻方工兵当量 + InfantryBreachEquiv × [扇区有攻方步兵连]
  defFireOnBreach_i = min(DefFireCap, (守方本步对扇区 i 破障点的已执行任务发数 / BreachFireNorm)
                                      + DirectOverwatch × [守方覆盖连有效且其压制 < 0.5])
  dB_i = BreachRatePerH × E_att,i / max(BreachMinDensity, O_i × sectorWidthKm) × (1 − defFireOnBreach_i) × (1 − s_eng) × dtH
  B_i ← min(1, B_i + dB_i)；O_i == 0 时 B_i = 1
  首次 B_i > 0 记 breachStartedAtH；首次 B_i ≥ BreachFullGate 记 breachDoneAtH
战斗汇总：breachProgress = mean_{有攻方第一梯队的扇区}(O_i > 0 ? B_i : 1)
```

- **门槛**（✅🟡 总纲 §9.3①）：`B_i < BreachAttackGate`（0.3）且 `O_i > ObstacleNegligible`（0.1）→ 该扇区只生成 `Reconnaissance/Infiltration`；`≥ BreachAttackGate` → 可生成 `AttackPosition`；片段内的触雷概率用 `(O_i, B_i)`（03 §4.9.2）。
- 攻方工兵元素在破障时是守方 C 线的 `BreachPartyValue` 目标（§4.6.3）——“C 线压不住，破障就慢、就死工兵”。

#### 4.7.3 工事等级

```text
每条带步，对 task ∈ {Hold, Reserve} 且未锁定、本步未移动的元素（双方都有；攻方停止推进后也会挖工事）：
  F ← F + (1 − F) × (1 − exp(−dtH / FortTauH × (1 + FortEngBoost × engSupport)))
  engSupport = 1 若同营有工兵元素在 2 km 内，否则 0
元素移动 > FortMoveResetM：F ← F × FortMoveRetain
被 HE 命中：03 的 fortDamagePerHit（片段内）与 §4.4.3 的面杀伤（条带上）直接削减 F
给 05：fortLevel01(营) = 该营元素 F 的人数加权平均
```

### 4.8 （保留编号：与 03 对齐的扇区地形摘要用法）

片段生成时，04 给 03 的地形以条带格子为准（03 §4.1 第 2 步经 `TerrainAtBattle` 读 `StripTerrain`，已做方向变换）；`OutcomeCache` 用的地形类（03 §4.14.1）由 `SectorTerrainSummary.terrainFraction` 与 `reliefM` 判定。

### 4.9 E 线：片段生成、支援火力共享、写回

#### 4.9.1 每条带步生成（扇区 index 升序）

```text
对每个扇区 i：若 sectors[i].activeEngagement ≠ 0 或 now < cooldownUntilTick → 跳过
  候选进攻元素 k（A 方 = 本扇区里 task ∈ {Advance, Counterattack} 的连；反冲击时 A 方是守方）：
     未锁定；CombatStrength(k) ≥ CompanyMinAttackStrength；不在 Deploy/Relocate；
  候选对手 D：敌方元素中 x 与扇区 [xMin−sectorWidth/2, xMax+sectorWidth/2] 有交集、距 k ≤ EngageTriggerRangeM 的连/支援分队（按距离升序，平局 id 小）
  触发：k 与 D 中最近者距离 d ≤ EngageTriggerRangeM，且（本方对 D 所属营 05 等级 ≥ Presence 或 d ≤ BlindContactRangeM）
  类型：
     k.task == Counterattack                                → Counterattack
     D 最近者 task ∈ {Advance, Deploy} 或 state == Moving     → Meeting
     O_i > ObstacleNegligible 且 B_i < BreachAttackGate      → 夜间且 doctrine.allowNightInfiltration 且 k 有徒步/乘车步兵 ? Infiltration : Reconnaissance
     否则                                                   → AttackPosition，额外要求：
        LocalForceRatio = CombatStrength(k) / max(ε, Σ_{D 中参战部分} CombatStrength) ≥ doctrine.attackMinForceRatio，
        且（攻方已对 D 执行过 ≥ doctrine.prepFireMin 的炮火准备，或无可用火力单位）；
        否则：k 停在 d = EngageTriggerRangeM 处等待（task 不变），并为 D 请求 PrepFire（§4.6.3）
  参战班：A 方 = k 的全部班（车辆 vehicleAvenue_i < AvenuePassMin 时，k 的车辆不参战、留在后方 1 km——山地只能步兵进攻）；
         B 方 = D 中：若 D 的连正面宽于 1.5 × sectorWidth，只取其排中 x 范围与扇区相交的排（排按 OrgUnitId 升序均分连的正面），
                     加上 4 km 内的营属支援分队中的反坦克/机枪/迫击炮班
  ctx（03 §3.2 SectorContext）：battleId，type（上面判定的类型），x0M = 扇区 xMin，frontageM = sectorWidthM，contactYAt = contact.YAt，attackDir = (A 方是战斗攻方 ? +1 : −1)，
       light = 09.GetLightConditionAtEdge(edgeId, now)，visibilityFactor = 1（阶段 1），obstacleDensity = O_i，breach = B_i，
       fortificationLevel = B 方各元素 F 的人数加权平均，
       knowledgeOfEnemy[s] = 05.GetLevel(s 国家, 对方营)，supportAssets[s] = §4.9.3，fireSupportSuppression[s]，
       doctrine[s]，fidelity = 09.GetTier(battleId)
  03.CreateEngagement(ctx, squadsA, squadsB) → engagementId；锁定参战元素（state = Locked，G-18）；activeEngagement = id
  counters.engagementsSpawned++；同刻阶段 100 执行第一步
同一战斗同时活跃片段数 ≤ sectorCount（每扇区至多 1 个，自然满足）
```

- **伏击（05 §6.3 建议，采纳）**：守方对攻方营 ≥ `Targetable` 时 03 给守方起始航迹；= `Type` 时只有 `CueFactor`（03 §4.1 第 5 步）；攻方对守方营 ≤ `Size` 时攻方无 —— 不需要另设修正。
- `Reconnaissance` 片段结束后，进攻元素回到原位置；它的价值在 03 写给 05 的侦察贡献，以及 E 线下一次的 `knowledgeOfEnemy`。

#### 4.9.2 车辆可通行扇区

`vehicleAvenue_i < AvenuePassMin`（0.3）：车辆不能参加该扇区的片段，也不能在该扇区无抵抗推进时越野（只能沿道路格）；步兵可以。纳卡山地扇区多为此类 → 进攻需要大量步兵、推进慢。

#### 4.9.3 支援资产清单（给 03）

```text
supportAssets[s] = { u ∈ s 的火力单位 | tubes > 0 ∧ u.reservedForE ∧ dist(u, 扇区中心 (x, contactY)) ≤ u.rangeMaxM − 500 }
每项：SupportAssetRef { fireUnitElementId, orgUnitId, ownerBattalion, ownerFormation, level（排/连/营/旅）, rangeMaxM, rangeMinM, munitionId }
```

03 据此判断“可达”，并用 01 的 `GetRequestChain(squadId, u.orgUnitId)` 求跳数和 `sameEchelonOwner`。

#### 4.9.4 `SupportFireBroker`（全局唯一，跨战斗；00 §5.2 规则 6）

```text
缓冲：阶段 100 中 03 提交的 FireSupportRequest；阶段 80 中 C/A 线规划的 FireMission
Commit（阶段 100 末执行 E 请求；阶段 80 末执行计划任务）：
  1. 把所有新请求按全序键排序：(priorityClass, sameEchelonOwner ? 0 : 1, arrivedAtFdcAt, requestId)
     priorityClass：Emergency 1，Immediate 2，Normal 3，PrepFire 4，BreachSuppression 4，CounterBattery 5，Interdiction 6，DeepStrike 7
     FireMission（C/A 线计划任务）取：sameEchelonOwner = 1，arrivedAtFdcAt = 规划所在刻起点，平局键 = (EdgeBattleId, missionId)
  2. 依次处理每个请求：候选火力单位 = 请求给出的可达列表（03：supportAssets 中可达者；C/A：规划时指定的那一个）
     对每个候选 u 计算预计 fireAt（§4.4.2，含队列：在 u.queue 中按同一全序键找到插入位置；排在它前面的任务的结束时刻）
     选 fireAt 最早者；平局：层级低者（排 < 连 < 营 < 旅），再 orgUnitId 小者
  3. 抢占：priorityClass ≤ 3 的 E 请求可插到 u 队列中 priorityClass ≥ 4 且 fireAt > now + 60 s 的任务之前；被推后的任务重算时间，
     若推后超过 PlannedMaxDelayS 则取消（status = Cancelled）
  4. 回填 request.fireUnit / fireAt / impactAt（03 §4.5.4 的公式）；为每发生成 ScheduledGroundEvent
  5. 若首发落点 < 下一刻起点 → 钳到下一刻起点 + 1 ms（03 §4.5.5）
落点交付：阶段 100 开始时，把落点时刻在本刻、且落点在某活跃片段范围内的事件转成 03 的 ExternalImpactEvent；
          片段已结束或落点不在片段内 → 阶段 110 由 §4.4.3 结算
```

**这就是“请求链”的完整落点**：营迫击炮排只在本营的片段之间排队；旅炮被多个营、多条边的片段同时申请，还要兼顾 C 线——集中但慢。

#### 4.9.5 片段的精度与缓存模式

`fidelity == Cached` 时 03 立即按 03 §4.14.3 给出结果与 `durationMin`；04 照常锁定参战元素直到 `startTime + durationMin` 所在刻，再执行 §4.9.6 写回。缓存片段**不**向 broker 提交请求，支援等级只通过缓存键 `supportLevel` 体现（E-10）。`supportLevel` 计算：0 = `supportAssets` 为空；1 = 只有营迫击炮；2 = 另有旅/营炮兵；3 = 另有精确制导弹药或巡飞弹可用。

#### 4.9.6 写回（`ApplyFinishedEngagements`，片段结束后的第一个条带步）

```text
r = 03.EngagementResult
扇区 i：activeEngagement = 0
推进：contact.yM[i] += r.seizedDepthM × attackDir    // attackDir：片段 A 方是战斗攻方 +1，否则 −1
     （contact 只在“阵地被夺取”时移动；03 的 seizedDepthM 已只计被夺取的守方阵地纵深）
元素：
  r.outcome ∈ {AttackerSeized, DefenderWithdrew}：
     B 方元素 → 退到 contact.YAt + attackDir × DefenderFallbackM（远离 A 方），fortLevel × FallbackFortRetain，task = Hold
     A 方元素 → 停在 contact.YAt − attackDir × 200 m，task = Advance（继续），cooldown = CooldownWinMin
  r.outcome ∈ {DefenderHeld, AttackerRepulsed, MutualBreak}：
     A 方元素 → 后撤到 contact.YAt − attackDir × RepulseFallbackM，task = Reorganize（≥ RepulseReorgMin，期间 07 的排内重组），cooldown = CooldownLossMin
  Stalemate：A 方原地，cooldown = CooldownStalemateMin
  解锁（state = Idle）；元素的 squads 列表删除已无人员与装备的班（班实体保留在营里，07 管）
遗留物：r.droppedItems 与片段内失去机动的车辆 → 07.RegisterBattlefieldItems(battleId, items, 位置(战斗坐标))，
       之后由战场控制决定回收/遗弃（07 §4.2；控制方判定用 §4.13.4 的规则）
统计：counters.engagementOutcomes[r.outcome]++；supportResponseS 追加 r.requestStats
```

### 4.10 接触线、推进度、无抵抗推进

#### 4.10.1 推进度

```text
penetrationProgress = mean_{i=0}^{sectorCount−1} clamp(contact.yM[i] / CaptureDepthM, 0, 1)
```

推进度 ≥ 1 → 09 判 `TileCaptured`（09 §4.7.1 第 3 条）。

#### 4.10.2 无抵抗推进与侧翼

```text
对每个扇区 i：若攻方有 task == Advance 的有效连 k 在扇区内，且 守方在扇区 i 及相邻扇区内、距 contact 3 km 内没有有效元素：
   v = k 的条带速度（§4.11.4）× (1 − O_i × (1 − B_i))（雷场减速）
   contact.yM[i] += v × dtS（并把 k 移到 contact − 200）
侧翼暴露（守方条令）：若守方连 d 覆盖扇区 j，且某相邻扇区 j±1 的 contact.yM − contact.yM[j] ≥ FlankExposureM，
   且守方无预备队可在 FlankReactMin 内反冲击（§4.11.3）→ d 后撤到 y = max(相邻 contact) − FlankFallbackM，
   contact.yM[j] = 该新位置 − DefenderStandoffM（接触线拉直），d.fortLevel × FallbackFortRetain
```

（推进度用平均值，所以窄而深的突破本身不会立刻易手地块，但会通过侧翼规则迫使守方整条线后撤——E-08。）

### 4.11 条令 AI（`StripDoctrineAi`）

双方使用同一套规则（总纲 §20.1：稳定、合理、符合条令），参数来自各国 `DoctrineProfile`。

#### 4.11.1 守方部署（开战与每条带步检查）

```text
可用连 = 守方参战营中未锁定、CombatStrength ≥ CompanyIneffective 的连（升序）
nFirst = min(可用连数 − ceil(可用连数 × (reserveFraction + secondEchelonFraction)), ceil(L / companyDefenseFrontageM))
扇区重要度：w_i = 0.6 × vehicleAvenue_i + 0.4 × (道路格比例_i) + [i 是已有攻方连的扇区] × 0.5
第一梯队分配：按 w_i 把扇区串分成 nFirst 段连续扇区（每段 w 之和尽量相等；贪心从左到右切），
   段按 w 之和降序，与连按 antiArmor 能力降序配对（坦克/反坦克强的连守车辆通道；纯步兵连守山地/城市）
   位置：x = 段中点，y = contact.YAt(x) + DefenseDepthM（守方在 y>0 一侧，战斗坐标），task = Hold
第二梯队：y = contact + SecondEchelonDepthM，x = 最重要的段；预备队：y = contact + ReserveDepthM，x = L/2
```

#### 4.11.2 攻方部署与主攻方向

```text
扇区进攻价值：a_i = (0.5 + vehicleAvenue_i) × (0.5 + B_i) / (0.2 + 守方在扇区的已知 CombatStrength_i)（已知 = 按 05 等级：< Size 时用 1.0 的默认估计）
主攻：取 a 之和最大的连续 m 个扇区（m = 第一梯队连数 = min(可用连 × (1 − reserve − secondEchelon), sectorCount)）
第一梯队连按 CombatStrength 降序分到主攻扇区（a 降序）；task = Advance
攻方工兵元素：分到主攻扇区中 O_i 最大的若干个，task = Breach（每扇区至多 1 个）
第二梯队跟进主攻扇区之后 SecondEchelonDepthM；预备队在 ReserveDepthM
```

主攻方向每 `ReplanMin`（60 分钟）重算一次；正在片段中的扇区不改分配。

#### 4.11.3 轮换、预备队、反冲击

- **轮换**：第一梯队连 `CombatStrength < rotateThreshold` 且未锁定 → 与同营（无则同旅、同战斗方）的第二梯队有效连互换位置；被换下的连 `task = Reorganize`，移到 `ReserveDepthM`；不在片段中满 `RestReorgMinH`（07）后 07 自动做连/营内重组（07 §4.6.2）。
- **攻方投入第二梯队**：某扇区 `AttackerSeized` 后，若该扇区 contact 推进 ≥ `ExploitTriggerM`，第二梯队连前出接替（超越），原第一梯队连转第二梯队。
- **守方反冲击**：若存在扇区 contact.yM ≥ `CounterattackTriggerM` 或 penetrationProgress ≥ `CounterattackTriggerP`，且守方有有效预备队连 → 该连 `task = Counterattack`，目标扇区 = contact 最深者；E 线把它当 A 方生成 `Counterattack` 片段（09 §4.6.4 的反冲击营也走这里）。成功的反冲击按 §4.9.6 把 contact 推回（attackDir = −1）。

#### 4.11.4 移动

```text
每条带步：元素朝 targetPosM 直线移动 d = v × dtS（不越过目标）
v（m/s）= 元素中最慢的车辆 06.MobilityProfile.offroadSpeedMps × 路径平均 vehiclePassability（沿线每 250 m 采样）
         或 徒步 = 03 BaseFootSpeedMpm[terrain] / 60 × 负重与疲劳修正（03 §4.8.2，用元素平均值）
         × 06.GetMobilityFactor(battalion)（燃油）
沿道路：若起止两点都在道路格 2 km 内，取 max(越野, 道路速度 × RoadMult（03 §5.5）)
越过接触线：攻方元素 y 不得超过 contact.YAt(x) − ContactStandoffM（只能通过片段夺取或 §4.10.2 前推）；守方对称
火力单位阵位：己方纵深 = clamp(ArtyRangeUseFrac × rangeMaxM, ArtyMinDepthM, ArtyMaxDepthM)；营迫击炮在本营连后 MortarDepthM
防空：与所保护的火力单位/指挥所同位，横向 500 m；指挥所：己方纵深 HqDepthM
```

### 4.12 脱离接触（`RequestDisengage(battleId, battalionId, at)`，09 §4.5）

```text
1. 组织：该营元素 state 不变，task 不变，持续 DisengageOrganizeMin × (营有元素在片段中 ? DisengageEngagedMult : 1)
   （期间继续承受 A/C/E 线打击；不再生成以该营为 A 方的新片段）
2. 撤离：组织完成后，元素按“离接触线由远到近”的顺序每条带步放行一个（掩护后撤），task = Withdraw，
   targetPos = 己方纵深 DisengageSafeDepthM；锁定在片段中的元素等片段结束后放行
3. 撤离途中：元素布局为 Moving（纵队），特征值高（05 按 Marching），自然成为对方 C 线 Interdict 目标
4. 失去机动的受损车辆：调用 07.OnDisengage(battalionId, battleId) —— 07 按其规则决定拖走或遗弃（07 §4.2.4）
5. 该营所有元素 己方纵深 ≥ DisengageSafeDepthM 或已离开条带 → 从 sides[].battalions 移到 disengagingBattalions，
   元素 state = Gone，调用 09.OnDisengaged(battalionId, now)
6. 该营原覆盖的扇区若再无守方有效元素 → §4.10.2 的无抵抗推进生效
```

### 4.13 战斗力指标与结束

#### 4.13.1 `IsCombatEffective(OrgUnitId battalionId)`（09 调用）

```text
CS_bn = 03 的 CombatStrength 公式，按营汇总（分子 = 营当前 CapabilityVector；分母 = 模板满编参考，同练度）
IsCombatEffective = CS_bn ≥ BattalionEffectiveThreshold（0.30，09 建议值）
```

#### 4.13.2 其他给 09 的指标

| 函数 | 定义 |
|---|---|
| `double PenetrationProgress(battleId)` | §4.10.1 |
| `bool AttackerCompaniesAllOnOwnSide(battleId)` | 攻方所有元素：未锁定、`task ≠ Advance/Counterattack`、且 `y ≤ contact.YAt(x) − ContactStandoffM`（🟡 E-09：以接触线为界，而不是 09 原文的 y < 0，以保留已夺取的地面） |
| `int FrontageSlots(battleId)` | `sectorCount`（09 调度成本估计用） |
| `int CompaniesOnStrip(battleId)` | 双方 `kind == Company` 且 state ≠ Gone 的元素数 |
| `bool IsInStrikeRange(OrgUnitId shooterBn, TargetRef t)` | 射手营中射程最远的可用间瞄武器 `rangeMaxM` ≥ 射手位置（战斗中 = 条带投影；否则地块位置）到目标位置的平面距离 |
| `bool HasEffectiveCompanies(EdgeBattleId, int sideIndex)` | 该方存在 `kind == Company`、state ≠ Gone 且 CombatStrength ≥ `CompanyIneffective` 的元素（09 结束规则 2） |
| `void QueueCrossTileStrike(Order o)` | `o.payload is CrossTileStrikePayload`（09 §3.2）；§4.4.1；09 在命令生效时调用 |

#### 4.13.3 `EndEdgeBattle(battleId, BattleEndReason reason, SimTime at)`（09 判定后调用）

```text
1. 对每个活跃片段调用 03.ForceEnd(engagementId)（以当前状态生成 EngagementResult，outcome = Stalemate；03 §4.10），然后 §4.9.6 写回
2. 未执行的火力任务全部取消；已出膛（fireAt ≤ now）的仍按时落地（阶段 110）
3. 战场控制（§4.13.4）→ 07.ResolveBattlefieldControl(battleId, controllerOf(pos) 函数)
4. 元素解散：连回到营的地块层状态；SquadCombatState（压制、疲劳）保留；fortLevel 写回 09 的挖壕进度（守方，原地留守时）
5. 生成最终战报数据（§4.14.2）；通知 05 双方营离开战斗
6. isEnded = true；条带地形保留（供下次同一条边）
```

#### 4.13.4 战场控制判定（给 07）

```text
controllerOf(x, y)：
  reason ∈ {TileCaptured, DefenderIneffective, DefenderWithdrew} → 攻方（整个条带）
  reason == AttackerWithdrew → y ≥ contact.YAt(x) − AttackerHoldBandM 的位置归守方，其余归攻方（攻方撤退时接触线附近的东西丢给守方）
  其他 → y < contact.YAt(x) ? 攻方 : 守方
战斗进行中（07 每小时回收用）：同“其他”规则
```

### 4.14 战报数据（按阶段拆分）

#### 4.14.1 归因规则（`BattleLine`）

| 损失发生在 | 归因 |
|---|---|
| 片段内，直射/片段内间瞄/外部 E 请求的支援火力 | `DirectFire` |
| 片段内触雷 | `Breaching` |
| 片段内被 04/08 注入的非 E 事件（巡飞弹、空袭） | 事件自身 `lineTag` |
| 条带上：C 线任务（反炮兵、拦阻、巡飞弹、对破障点的压制除外） | `CounterBattery` |
| 条带上：对破障分队的压制、片段外触雷 | `Breaching` |
| 条带上/地块内：A 线任务与 08 非 CAS 空袭 | `DeepStrike` |
| 08 CAS（落在片段外） | `CounterBattery`（E-12） |
| 06 车队被毁（`TruckKillIntegral`） | `CounterBattery`（来源类别记“交通线拦截”） |

#### 4.14.2 汇总与模板句

```text
LossBreakdown（每方）：
  byLine[line] = { 人员：阵亡/重伤/轻伤/失踪 人数；车辆：Destroyed/DepotRepair/FieldRepairable/Abandoned/Captured 件数；价值合计 }
  bySourceCategory[category]、bySquadTemplate[template]、shareOfVehicleLossByLine = 车辆损失（Destroyed+DepotRepair+Abandoned+Captured）按线占比
  breachHours = mean_{有攻方第一梯队的扇区}(breachDoneAtH − breachStartedAtH)（未完成用当前时刻）
  supportResponse 分布：P50、P90、按四段（通信/排队/准备/飞行）均值（03 的时间戳）
  lmStats：出动/被拦截/命中；uavLost；cbLocates；trucksLost（06）
模板句（13 渲染，数字全部来自上面）：
  "本旅 {shareOfVehicleLossByLine[最大线]:P0} 的装备损失发生在 {线名}（{该线最大来源类别}），破障用了 {breachHours:F0} 小时，直瞄交战只占损失的 {share[DirectFire]:P0}。"
```

#### 4.14.3 瓶颈提示（每条带步重算，`BottleneckHint`）

| 规则 | 触发条件 | 文本模板 |
|---|---|---|
| H1 够不到 | 本方火力单位对任一已定位敌火力单位距离 > rangeMaxM | “{火力单位} 够不到对方炮兵阵地（差 {Δ:F1} km）” |
| H2 等支援 | 某片段内有未完成请求的等待时间 > `HintWaitS` | “{连} 等 {火力类型} 支援已 {t:F0} 分钟” |
| H3 破障停滞 | 扇区 dB/dt < `HintBreachStallPerH` 且 defFireOnBreach ≥ 0.5 | “{扇区} 破障停滞：敌火力覆盖 {f:P0}” |
| H4 防空困境 | 本方防空元素在过去 1 小时被巡飞弹命中 ≥ 1 次且处于 Active | “{防空连} 开机后遭反辐射巡飞弹打击” |
| H5 补给危险 | 06 车队往返预期损失 > `HintConvoyLossP` | “{营} 的补给车队在杀伤区损失率 {p:P0}/往返” |
| H6 正面饱和 | 攻方有 ≥ 3 个有效连在等待（无空扇区） | “正面宽度已满：{n} 个连在第二梯队等待” |

### 4.15 威胁场与 `TruckKillIntegral`（06 的 `IStripQuery`）

```text
对 side s 的卡车，敌方 e = 对方：
density(x, y)（每米预期被毁次数）= TruckThreatBasePerM × Pobs_e(x, y) × Cap_e(x, y) × (isNight ? NightThreatMult : 1)
  Pobs_e(x, y) = min(1, exp(−OwnDepthOf_s(x,y) / ObsDepthScaleM) + UavCover_e(x, y))
       OwnDepthOf_s = 该点距 s 方接触线的己方纵深（≥ 0）；UavCover_e = e 方无人机轨道覆盖圆内为 UavCoverObs，否则 0
  Cap_e(x, y) = min(1, Σ_{e 的火力单位 u，dist ≤ rangeMaxM} tubes_u / TubeNorm + Σ_{e 的 LoiteringBattery，射程内} LaunchRatePerH × launchers / LmNorm)
TruckKillIntegral(s, x1, y1, x2, y2, isNight) = Σ_{k=0}^{K−1} density(中点_k) × Δs，K = ceil(长度 / 500 m)，Δs = 长度 / K
EstimatedEnemyTubeRangeM(s) = max_{e 方火力单位 u，s 方对 u 所属营 05 等级 ≥ Type} rangeMaxM；无则 06 的 DefaultEnemyTubeRangeM
```

---

## 5. 常数表

> 存于 `data/tuning/04_strip_layer.yaml`。未注明者 `confidence: estimated`；“V2 校准”指第 9 节。

### 5.1 几何与时间

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `StripStepMinutes` | 5 | min | 5/6/10 | 00 G-04；引用 09/00，不在 04_strip_layer.yaml 中定义 |
| `StripTerrain.CellM` | 250 | m | 100–500 | 总纲“分辨率几百米”；23 km × 80 km ≈ 2.9 万格 |
| `DoctrineAttackFrontage`（`companyAttackFrontageM` 缺省） | 1200 | m | 800–1500 | 总纲 §9.3：每连 1–1.5 km |
| `companyDefenseFrontageM` 缺省 | 1800 | m | 1000–3000 | 苏式连防御正面 1–1.5 km，北约可达 3 km |
| `ArrivalDepthM` / `ColumnSpacingM` | 8000 / 1000 | m | — | 纵队从己方纵深进入 |
| `AttackDeployMin` | 30 | min | 15–60 | 由行军队形展开为战斗队形 |
| `DefenseDepthM` / `SecondEchelonDepthM` / `ReserveDepthM` | 500 / 3000 / 7000 | m | — | 连防御阵地、营第二梯队、旅预备队的量级 |
| `ContactStandoffM` | 300 | m | 100–800 | 双方不进入对方阵地，接触距离 |
| `DeepTargetDepthM` | 5000 | m | 3000–8000 | A 线与 C 线目标的分界 |
| `CaptureDepthM` | 8000 | m | 5000–15000 | 突破守方主防御地带（营防御纵深 3–5 km + 旅第二梯队），V2 校准 |
| `FlankExposureM` / `FlankFallbackM` / `FlankReactMin` | 3000 / 1000 / 60 | m / m / min | — | |
| `DefenderStandoffM` | 300 | m | — | |

### 5.2 E 线

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `EngageTriggerRangeM` | 3500 | m | 2500–4500 | 03 的 Far 带上限 4 km |
| `BlindContactRangeM` | 1500 | m | 800–2000 | 未侦察到也会撞上 |
| `CompanyMinAttackStrength` | 0.5 | — | 0.3–0.7 | |
| `attackMinForceRatio` 缺省 | 1.2 | — | 0.8–3 | 局部；炮兵/工事效果已在片段中体现，不再要求 3:1 |
| `prepFireMin` 缺省 | 15 | min | 0–60 | |
| `CooldownWinMin` / `CooldownLossMin` / `CooldownStalemateMin` | 10 / 60 / 20 | min | — | |
| `DefenderFallbackM` / `RepulseFallbackM` | 1500 / 1500 | m | — | |
| `FallbackFortRetain` | 0.3 | — | 0–0.5 | 新阵地为仓促阵地 |
| `RepulseReorgMin` | 30 | min | — | |
| `AvenuePassMin` | 0.3 | — | 0.2–0.5 | |
| `PlannedMaxDelayS` | 600 | s | — | |
| `OnCallFrac` | 0.7 / 0.5 / 0.3 | — | — | E-05 |
| `OnCallMaxBusyS` | 120 | s | — | |

### 5.3 A/C 线

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `BaseRounds`（vs 连 / 火力单位 / 指挥所 / 节点） | 2 / 3 / 4 / 6 每管 | 发 | ×0.5–2 | |
| `MaxRoundsPerMission` | 72 | 发 | — | 一个营齐射量级 |
| `CbRadarRangeM` 缺省（迫击炮 / 火炮） | 15000 / 20000 | m | — | 1L219、AN/TPQ-36 量级 |
| `CbLocateP` / `CbArtyMult` | 0.85 / 0.9 | — | 0.5–0.95 | |
| `CbRadarTleM` / `CbFixValidMin` | 50 / 20 | m / min | — | |
| `CbReconPulse` | 2.0 | /h | — | |
| `RelocateMin`（SP / 车载 / 牵引） | 3 / 6 / 20 | min | — | 自行火炮出入阵地 1–3 min，牵引 15–30 min |
| `RelocateDistM` / `RelocateEscapeM` | 1000 / 300 | m | — | |
| `TargetValueC`：`CbValue`, `InterdictValue`, `BreachPartyValue`, `PrepValue`, `HqValue`, `ReserveValue`, `LogValue`, `AdValue` | 3, 1, 8, 4, 10, 0.8, 2, 6 | — | — | 条令优先级的量化；V5 检查 |
| `CMinUtility` | 0.05 | — | — | |
| `LaunchRatePerH`（每发射装置） | 2 | 架次/h | 1–6 | Harop 级发射车 |
| `AdPkVsLm`（Osa / Strela-10 / ZSU-23-4 / Tor-M2 / 现代 SHORAD+EW） | 0.15 / 0.10 / 0.20 / 0.55 / 0.7 | — | — | 2020 纳卡大量老旧防空被巡飞弹/TB2 摧毁（公开图像统计）；V2 校准 |
| `AdCoverRangeM` | 8000 | m | — | 近程防空保护半径 |
| `OpticalOnlyFactor` | 0.2 | — | 0–0.4 | 雷达关机时只能光学 |
| `SearchK` / `LoiterMin` | 同 05 / 20 | — / min | — | |
| `TileFootprintM`（Assembling / Defending / Marching / Resting） | 1500 / 3000 / 1000 / 2500 | m | — | |
| `NodeRadiusM` | 150 | m | — | |
| `LocKillPerRound` / `LocTrafficNorm` | 0.05 / 20 | — / 车/h | — | |

### 5.4 B 线

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `GroundReconRatePerH` | 1.0 | /h | 0.5–3 | 与 05 `GroundReconRate` 同量纲 |
| `BaseCompanyRecon` | 0.1 | — | — | |
| `ContactReconRangeM` | 3000 | m | — | |
| `UavReconRatePerH`（micro / hand / vtol / tactical） | 0.5 / 1.0 / 1.5 / 2.5 | /h | — | |
| `UavRangeM` 缺省 | 3000 / 10000 / 20000 / 50000 | m | — | 类别典型（data/equipment/uav.yaml） |
| `UavOrbitDepthM` | 1500 / 4000 / 8000 / 15000 | m | — | |
| `UavTurnaroundH` | 0.3 | h | — | |
| `AdKillPerH`（便导 / 高射机枪 / 自行高炮 / 近程弹） | 0.3 / 0.2 / 0.8 / 1.0 | /h | — | 对小型无人机 |
| `SmallArmsUavKillPerH` | 0.02 | /h | — | |
| `ObserveLosMin` / `UavObserveSigMin` | 0.5 / 0.3 | — | — | |
| `EngReconRatePerH` | 0.5 | /h | — | 片段航迹覆盖率折算的侦察速率；估算，由 R-V1 校准（E-17） |

### 5.5 D 线与工事

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `ObstacleMax` | 0.9 | — | — | |
| `ObstaclePrepTauEngH` / `NoEngH` | 48 / 120 | h | — | 有工兵 2 天、无工兵 5 天形成主要障碍 |
| `LayRatePerH` | 0.03 | 密度·km/(h·工兵班当量) | — | |
| `RemoteMineRatePerH` | 0.05 | 密度·km/齐射 | — | |
| `EngineerSquadSize` | 8 | 人 | — | |
| `MineClearVehEquiv` / `EngVehEquiv` | 3 / 1.5 | 工兵班当量 | — | UR-77 类扫雷车一次开辟 80–90 m 通道 |
| `InfantryBreachEquiv` | 0.2 | — | — | 无工兵时步兵手工排雷 |
| `BreachRatePerH` | 0.02 | km/(h·工兵班当量) | 0.01–0.05 | 1 个工兵连 + 2 扫雷车（E = 9）、密度 0.6、扇区 1.2 km、无敌火 → 0.25/h，约 3 小时到 0.7；敌火覆盖 0.8 且工兵被压制 → 约 28 小时（总纲示例“破障用了 14 小时”在此区间内）；V2 校准 |
| `BreachMinDensity` | 0.1 | — | — | |
| `BreachFireNorm` / `DirectOverwatch` / `DefFireCap` | 24 发 / 0.3 / 0.9 | — | — | |
| `BreachAttackGate` / `BreachFullGate` / `ObstacleNegligible` | 0.3 / 0.7 / 0.1 | — | ✅🟡 | 总纲 §9.3①门槛 |
| `FortTauH` / `FortEngBoost` | 24 / 1.0 | h / — | 12–72 | 野战工事一昼夜成形 |
| `FortMoveResetM` / `FortMoveRetain` | 500 / 0.2 | m / — | — | |

### 5.6 条令、脱离接触、指标

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `reserveFraction` / `secondEchelonFraction`（苏式 / 北约式） | 0.1 / 0.3；0.3 / 0.1 | — | — | 苏式两个梯队；北约强调预备队 |
| `rotateThreshold` | 0.5 | — | 0.3–0.7 | |
| `CompanyIneffective` | 0.25 | — | — | |
| `ReplanMin` | 60 | min | — | |
| `ExploitTriggerM` / `CounterattackTriggerM` / `CounterattackTriggerP` | 1500 / 2500 / 0.25 | m / m / — | — | |
| `ArtyRangeUseFrac` / `ArtyMinDepthM` / `ArtyMaxDepthM` | 0.4 / 3000 / 15000 | — / m / m | — | 总纲：火炮部署在接触线后 5–15 km |
| `MortarDepthM` / `HqDepthM` | 1500 / 6000 | m | — | |
| `DisengageOrganizeMin` / `DisengageEngagedMult` | 30 / 1.5 | min / — | — | 09 建议值 |
| `DisengageSafeDepthM` | 8000 | m | — | 出敌身管炮兵主要射程 |
| `BattalionEffectiveThreshold` | 0.30 | — | 0.2–0.4 | 09 建议值 |
| `AttackerHoldBandM` | 1000 | m | — | |

### 5.7 威胁场与提示

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `TruckThreatBasePerM` | 2e-6 | 1/m | 1e-7–1e-5 | 杀伤区（己方纵深 0–10 km）白天 10 km 路程约 1–2% 损失；V2 校准 |
| `ObsDepthScaleM` | 5000 | m | 3000–15000 | 无人机时代“最后 10–20 km 是杀伤区”（总纲 §19.2） |
| `UavCoverObs` | 0.5 | — | — | |
| `TubeNorm` / `LmNorm` | 18 / 4 | 管 / 架次/h | — | |
| `NightThreatMult` | 0.4 | — | 0.2–0.8 | 夜间补给（总纲 §19.2）；对有热像无人机的敌人应升高（05 夜间系数） |
| `HintWaitS` / `HintBreachStallPerH` / `HintConvoyLossP` | 300 / 0.02 / 0.05 | — | — | |

---

## 6. 与其他系统的接口

### 6.1 本文件提供

| 接口 | 调用者 | 时机 |
|---|---|---|
| `EdgeBattleId CreateEdgeBattle(EdgeId, CountryId attacker, CountryId defender, BattleTriggerKind, List<OrgUnitId> attackers, List<OrgUnitId> defenders, SimTime at)` | 09 | 阶段 70 |
| `void JoinBattle(EdgeBattleId, OrgUnitId battalion, int sideIndex /*0=attacker,1=defender*/, bool asCounterattack)` | 09 | 阶段 70 |
| `void RequestDisengage(EdgeBattleId, OrgUnitId battalion, SimTime at)` | 09 | 命令生效时 |
| `void EndEdgeBattle(EdgeBattleId, BattleEndReason, SimTime at)` | 09 | 阶段 140 |
| `double PenetrationProgress(EdgeBattleId)`、`bool IsCombatEffective(OrgUnitId)`、`bool AttackerCompaniesAllOnOwnSide(EdgeBattleId)`、`int FrontageSlots(EdgeBattleId)`、`int CompaniesOnStrip(EdgeBattleId)`、`bool HasEffectiveCompanies(EdgeBattleId, int sideIndex)` | 09（结束判定、调度） | 阶段 140 / 调度开窗 |
| `PeriodicBattleReportData MakePeriodicReport(EdgeBattleId, int periodIndex)` | 09 | 每 24 h |
| `bool IsInStrikeRange(OrgUnitId, TargetRef)`、`void QueueCrossTileStrike(Order o)`（`o.payload is CrossTileStrikePayload`） | 09 | 命令校验 / 生效 |
| `void SetFireSupportPriority(FormationId, FireSupportPriority)` | 13（作为模拟输入经 09 命令队列生效） | 命令生效时 |
| `StripCell TerrainAtBattle(EdgeBattleId, double xM, double yM)`（按 orientation 做规范 → 战斗坐标变换） | 03 | 片段创建时 |
| `SupportFireBroker.Submit(FireSupportRequest)`、`Commit()` | 03 / 本文件 | 阶段 100 内 / 末 |
| `IEnumerable<ExternalImpactEvent> EventsForEngagement(EngagementId, long tick)` | 03 | 阶段 100 开始 |
| `void RecordLoss(EdgeBattleId, BattleLossEntry)` | 07（单位在战斗中时） | 事件发生时 |
| `IStripQuery`（`OwnDepthToY`、`CompaniesOf`、`EstimatedEnemyTubeRangeM`、`TruckKillIntegral`、`BestRoadClassOnEdge`、`EdgeLengthM`） | 06 | 阶段 80 |
| `fortLevel01(OrgUnitId battalion)`、`bool InActiveBattle(OrgUnitId)`、`bool FiredThisStep(OrgUnitId artilleryBattalion)`、`StripReconSample` 缓冲 | 05 | 条带步写，暴露步读 |
| `StripView`（元素、接触线、扇区、任务连线、提示） | 13 | 界面刷新 |
| `BattlefieldControllerAt(EdgeBattleId, Vec2D)` | 07 | 回收/遗弃判定 |
| `(StripElementId target, Vec2D aimPosM, double tleSigmaM, bool directlyObserved) SelectCasTarget(EdgeBattleId, int side, CasPlatformClass, Vec2D orbitPosM)`：候选 = 对 side 而言的敌方元素中被直接观察（§4.5.3）或 05 等级 ≥ `Type` 者；按 §4.6.3 的 `TargetValueC` 降序（平局：距 orbitPosM 近者，再 id 小）取第一个；aimPosM = 目标元素当前位置，tleSigmaM = 直接观察 ? 03 §4.5.3 观察者值 : 05.TargetLocationErrorM（偏移由 08 §4.8.2 施加）；无候选返回 target = 0 | 08 | 阶段 90 |
| `void CancelScheduledEvent(FireMissionId, int roundIndex)` | 08（导弹被拦截） | 阶段 90 |
| `void OnLoiteringResult(LaunchId, MissileState result /*Impact / Intercepted / Lost*/)` | 08 | 阶段 90 |
| `Vec2D LatLonToBattle(EdgeBattleId, LatLon)`、`LatLon BattleToLatLon(EdgeBattleId, Vec2D)`（§4.1.1） | 08 | 任意 |
| `void SetTileLocalPos(OrgUnitId sharedAsset, Vec2D tileLocalPosM)`（共享资产转移后更新，§4.1.1） | 08（防空转移） | 阶段 90 |

### 6.2 本文件需要

| 来源 | 需要 | 用途 |
|---|---|---|
| 03 | `CreateEngagement`、`EngagementResult`、`ForceEnd(EngagementId)`（03 §4.10）、`AreaFire.ResolveRound`、直射 Top 方位结算函数、`CombatStrength`/`CapabilityVector`、`ClassOf`、`OutcomeCache` | E 线、条带上的火力结算、指标 |
| 01 | 编制树、`GetRequestChain`、`EquipmentModel` 与 03 的 Profile、营的建制编组 | 元素构成、请求链 |
| 02 | `GetSkill`；提交 `CombatExperienceReport`（§4.3 第 13 步） | 工兵当量、侦察技能；火力单位实战经验 |
| 05 | `GetLevel`、`GetAgeMs`、`ExposureAccuracyFactor`、`TargetLocationErrorM`、`PrecisionStrikeAllowed`、`AreaStrikeAmmoMultiplier`、`GetSignature(battalion).physical`（S_phys）、`IntelEstimate.observedPosture`、`EmconState`、`groundReconValue` 缺省表 | B/C/A 线 |
| 06 | `StripLogistics.Step`、`GetAvailable/TryConsume`、`GetMobilityFactor`、`MobilityProfile`、`OnNodeStrike/OnCrossingStrike/OnLocStrike`、`GetTrafficTrucksPerH` | 补给、弹药、机动、A 线 |
| 07 | `ApplyCasualty`、`ApplyVehicleDamage`、`RollVehicleDamage`、`RegisterBattlefieldItems`、`ResolveBattlefieldControl`、`OnDisengage`、车辆可用状态 | 损失与恢复 |
| 08 | `LaunchLoiteringMunition`（🟡 E-07）、`LaunchLoiteringSearch`、`RegisterGroundLaunchedMissile`、`GroundStrikeEvent` 队列、`AirDefenseRegistration`（雷达开机、射程） | C 线巡飞弹、空袭、防空 |
| 09 | `GetEntrenchProgress(battalion)`、`GetLightConditionAtEdge(EdgeId, SimTime)`、`GetTier`、`OnDisengaged`、`GetBattalionPosition(OrgUnitId)`、姿态时长 | 部署、昼夜、精度、脱离 |
| 10 | 边端点/长度、地块中心、`TerrainComposition`、离线条带地形文件 | §4.1 |
| 12 | `EdgeAssignment`、编组 AI 对参战营的分配 | 参战营（经 09） |
| 14 | 各国 `DoctrineProfile` | 条令参数 |
| 15 | `Rng.For`、`DMath`、`BattleEventLog`、ID 分配器 | 确定性 |

### 6.3 RNG salt 表

| 域 | salt | 值 | 用途 | entityKey |
|---|---|---|---|---|
| `Strip` | `SaltStrikeOffset` | 1 | 一次任务的公共瞄准偏移 | `missionId` |
| `Strip` | `SaltStrikeRound` | 2 | 每发落点与逐人/逐车抽样（03 的面杀伤在此流内） | `Mix(missionId) ^ roundIndex` |
| `Strip` | `SaltCbLocate` | 3 | 反炮兵雷达定位 | `Mix(radarItemId) ^ missionId` |
| `Strip` | `SaltUavLoss` | 4 | 小型无人机损耗 | 无人机 `EquipmentItemId` |
| `Strip` | `SaltLmIntercept` | 5 | 巡飞弹后备拦截 | `Mix(lmLaunchId) ^ 1` |
| `Strip` | `SaltLmHit` | 6 | 巡飞弹获取与命中 | `Mix(lmLaunchId) ^ 2` |
| `Strip` | `SaltNodeHit` | 7 | 节点/桥梁命中数 | `Mix(missionId) ^ roundIndex` |
| `MapGen` | `SaltTerrainNoise` | 1 | 程序生成条带地形 | `Mix(tileA) ^ tileB` |

### 6.4 存档（15）

| 去向 | 内容 |
|---|---|
| 15 | 存档：`SectionId.Strip`（= 31，15 §3.2）；组件：所有未结束的 `EdgeBattle`（含 `BattleSideState`、`SectorState`、`ContactLine`、`missions`、`pendingEvents`、`pendingAirEvents`、`BattleLossLedger`、`LineCounters`）、`StripElement`、`FireUnitState`、`SupportFireBroker` 的队列与缓冲、反炮兵定位 fix、巡飞弹出动小数累积 carry、脱离接触进度；不存档（派生，读档后重建）：`Strip`/`StripTerrain`/`SectorTerrainSummary`（由 10 的条带文件或 §4.1.3 程序生成重建）、`BottleneckHint`、`StripView` |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 防守方无参战营 | 战斗照常创建；无片段；攻方按 §4.10.2 推进，推进度很快达到 1 → 09 判占领 |
| 攻方连全部失去战斗力 | E 线无候选；09 第 2/6/7 条判定结束 |
| 双方同一刻同一扇区都想发起片段（守方反冲击 vs 攻方进攻） | 每扇区一刻只生成一个：攻方元素优先（候选按 sideIndex 升序、再元素 id），另一方的请求下一条带步再判 |
| `sectorCount` 计算为 0（极短边） | `max(1, …)` |
| 共享火力单位同时被多条边、多个片段申请 | broker 全序键统一排序（§4.9.4），与战斗处理顺序无关 |
| 火力单位在任务排队期间被摧毁 | 未出膛任务取消；03 请求状态 `Cancelled`，计入 AAR 响应统计的“未响应” |
| 落点时刻目标已转移 | 按落点实际位置结算（打到空地或打到别的元素） |
| 片段结束时仍有在飞弹药 | 阶段 110 按条带结算（§4.4.3） |
| 接触线越过 ±40 km 条带边界 | 推进度早在 8 km 时达到 1；为安全 `contact.yM` 钳到 [−38000, +38000] |
| 某扇区 `vehicleAvenue = 0` 且攻方只有坦克连 | 不能参加片段（无步兵），只能在扇区外等待——AAR 提示“缺步兵”（H6 变体） |
| 同一营在两条边（不允许，09 §4.6.3） | 本文件断言；违反时拒绝 `JoinBattle` |
| 战斗结束时元素在 `Relocating` | 直接解散，回到营的地块层状态 |
| `TruckKillIntegral` 起点 = 终点 | 长度 0 → 返回 0 |
| 05 尚无记录（阶段 0） | `GetLevel` 返回固定值 `ProvingGroundExposure`（试验场设置，缺省 `Type`） |
| 08 不存在（阶段 0） | 巡飞弹用 §4.6.5 后备公式；空袭事件由试验场脚本注入 |
| 地形文件缺失 | 程序生成（§4.1.3），并在日志中标记 `fromRealDem = false` |

---

## 8. 测试用例

**T1 扇区**：`edgeLengthM = 22 600`，`companyAttackFrontageM = 1200` → `round(18.83) = 19` 个扇区，`sectorWidthM = 1189.47 m`。

**T2 坐标变换**：`orientation = −1`，`L = 22 600`，规范坐标 (5000, −3000) → 战斗坐标 (17 600, +3000)。己方纵深：守方（Positive 侧）在战斗坐标 y = +3000 → `OwnDepthM = 3000`。

**T3 破障速率**：扇区宽 1.2 km，`O = 0.6`，攻方工兵当量 `E = 3 + 2 × 3 = 9`（1 个工兵连 ≈ 3 个班当量 + 2 辆扫雷车各 3），`defFireOnBreach = 0`，工兵未被压制，`BreachRatePerH = 0.02`：`dB/dt = 0.02 × 9 / (0.6 × 1.2) = 0.25 /h`；一步（dtH = 1/12）后 `B = 0.020833`；到 0.7 需 2.8 h。只有 1 个工兵排（`E = 1`）+ 步兵（0.2）：`0.02 × 1.2 / 0.72 = 0.0333 /h`，到 0.7 需 21 h。

**T4 有敌火的破障**：同 T3（E = 9）但 `defFireOnBreach = 0.8`、工兵压制 0.5：`dB/dt = 0.25 × 0.2 × 0.5 = 0.025 /h`，一步 `ΔB = 0.0020833`；到 0.7 需 28 h——“C 线压不住，破障就拖成一天多”。

**T5 工事增长**：`F = 0`，`FortTauH = 24`，有工兵：一步 `F = 1 − exp(−(1/12)/24 × 2) = 1 − exp(−0.006944) = 0.006920`；24 小时（288 步）后 `F = 1 − exp(−2) = 0.8647`。

**T6 推进度**：19 个扇区，contact = [0×15, 2000, 4000, 8000, 10000] → clamp/8000 = [0…, 0.25, 0.5, 1, 1] → 平均 `2.75 / 19 = 0.1447`。侧翼规则：扇区 15（2000）相邻扇区 14（0）差 2000 < 3000，不触发；扇区 17（8000）与 16（4000）差 4000 ≥ 3000 → 守方覆盖扇区 16 的连后撤到 `8000 − 1000 = 7000`，contact[16] = 6700。

**T7 支援火力排队**：时刻 t 的阶段 100 末 Commit。同一旅炮兵连（6 门 D-30，tubes = 6，已展开，`layTimeS = 60`，`autoLay = false`，练度 0.6 → `LaySkillMult = 1.5 − 0.3 = 1.2` → 每个任务调炮 72 s；`rof = 6` 发/分/门 → 每发间隔 `60/(6×6) = 1.667 s`）。队列里已有 C 线 CounterBattery 计划（priorityClass 5，fireAt = t+150 s，18 发）。新到：片段 E1 的 Immediate 请求（arrivedAtFdc = t+165 s，旅属火力 → `sameEchelonOwner = false`）、片段 E2 的 Emergency 请求（arrivedAtFdc = t+200 s）。排序：E2（1）→ E1（2）→ CB（5）。
- E2：CB 未出膛且 150 > t+60 → 可被抢占；fireAt = 200 + 72 = **t+272**；vs 人员 2 发/管 × 6 = 12 发，最后一发出膛 272 + 11 × 1.667 = t+290.3。
- E1：fireAt = max(165, 290.3) + 72 = **t+362.3**；12 发，最后一发 t+380.7。
- CB：fireAt = 380.7 + 72 = **t+452.7**，被推后 302.7 s < `PlannedMaxDelayS`（600）→ 保留。

**T8 巡飞弹后备拦截**：目标 Osa（雷达开机）附近有 1 部 Osa（`AdPkVsLm = 0.15`）和 1 套 ZSU-23-4（0.20）：`P_intercept = 1 − 0.85 × 0.80 = 0.32`。若 Osa 关机：`1 − (1 − 0.03)(1 − 0.04) = 0.0688`（光学系数 0.2）。

**T9 威胁场积分**：守方卡车从己方纵深 10 km 到 2 km（x 不变，长度 8 km），敌方无无人机覆盖，`Cap = 1`，白天：K = 16，Δs = 500，中点纵深 9750, 9250 … 2250 m；`Σ exp(−d/5000)` = Σ_{k=0}^{15} e^{−(9750−500k)/5000} = 5.3476；`λ = 2e-6 × 5.3476 × 500 = 0.0053476` → 单程每车被毁概率 `1 − e^−0.0053476 = 0.533%`。

**T10 确定性**：两条边共享同一旅炮兵连，交换两场战斗的创建顺序（ID 不变的前提下改为并行执行第 5 步），broker 结果逐位相同。

**T11 门槛**：扇区 O = 0.5、B = 0.25、白天、攻方连有步兵 → 生成 `Reconnaissance`；夜间且 `allowNightInfiltration` → `Infiltration`；B = 0.35 → 若兵力比 ≥ 1.2 且已炮火准备 15 分钟 → `AttackPosition`。

---

## 9. 验证建议（对应计划 V2、V5、V6；与 V1 的关系）

脚本放在 `tools/validation/`，Python 3 + numpy；**用本文件和 03 的同一套公式和常数**（读 `data/tuning/03_*.yaml`、`04_*.yaml`）。E 线片段用 03 的 Python 缓存（V1 生成）抽样，以便几十天的战役在分钟级跑完。

### V2 纳卡 2020 能否大致复现（本文件为主体）

`v2_nk2020.py`：
- **战场**：南线 4 条交界边（阿拉斯河谷：Horadiz—Jabrayil—Zangilan 方向，`Mixed/Open` 为主）+ 中北线 3 条山地边（Fuzuli—Hadrut、Murovdag、Talysh，`Mountain`）。地形：有 DEM 时用 10 的条带文件；否则用 `TerrainClassPg` 参数生成。
- **兵力**（数据由 14 提供，脚本先用公开资料量级的占位）：阿方约 8–10 个旅级集群的一线兵力（T-72A/B、T-90S、BMP-2/3、BTR-82A、2S19/2S3/D-30、BM-21、TOS-1A；巡飞弹 Harop/SkyStriker；TB2 由“简化空中层”按每日架次 × MAM-L 投放生成 `GroundStrikeEvent`）。亚方：预设防御（开战时 `fortLevel` 0.6–0.9、`obstacleDensity` 0.5–0.8），T-72A/B、BMP-2、D-30/2S1、BM-21，防空 Osa/Strela-10/Kub/少量 Tor-M2KM、S-300PS（后两者由简化空中层处理）。
- **跑 44 天**（9 月 27 日—11 月 10 日），每个配置 50 个种子。
- **输出**：每日接触线、地块易手日期、双方损失（按类型、按线、按状态：毁/修/弃/俘）、防空系统存活曲线、弹药消耗。

**通过标准**（区间宽，目标是“规律对、量级对”；具体目标值由 14 用 Oryx 等公开统计核定，E-14）：

| # | 指标 | 合理区间 |
|---|---|---|
| 1 | 亚方 : 阿方 重装备（坦克+步战车+火炮）损失比 | 3 : 1 — 7 : 1 |
| 2 | 亚方近程/中程防空（Osa、Strela-10、Kub）在 44 天内损失比例 | ≥ 50%，其中 ≥ 70% 归因 C/A 线（巡飞弹、无人机） |
| 3 | 亚方重装备损失按线：A + C 占比 | ≥ 50%；E 占比 ≤ 35% |
| 4 | 亚方坦克损失中“遗弃 + 被俘”占比 | 25% — 55%（检验战场控制机制，07） |
| 5 | 推进速度：河谷边突破后 | 平均 1–5 km/天；山地边 ≤ 1 km/天 |
| 6 | 第一个河谷地块易手 | 第 8—20 天（Jabrayil 约第 12 天） |
| 7 | 破障：河谷边从开战到首个扇区 `B ≥ 0.7` | 6—72 小时 |

**反事实敏感性**（模型“能表达”纳卡的关键，必须过）：
- (a) 把亚方 Osa/Strela 换成现代近程防空 + 电子战（`AdPkVsLm` 0.55–0.7）→ 亚方 C 线损失下降 ≥ 40%，河谷推进速度下降 ≥ 30%。
- (b) 去掉阿方 TB2 与巡飞弹 → 损失比降到 ≤ 2.5 : 1，山地边基本不推进。
- (c) 2010 开局式改进：亚方伪装/分散（05 特征值 −30%）+ 防空 `Silent` 策略 → A/C 线损失下降，但防空拦截数也下降（“开机被打、关机无用”的权衡可见）。
- (d) 亚方反炮兵雷达数量 ×3 → 阿方炮兵损失上升，但总体结果变化 < (a)（说明主矛盾在无人机/防空）。

不通过时，脚本按 Sobol 一阶敏感度列出最可能的参数（预期热点：`AdPkVsLm`、`OpticalOnlyFactor`、`LaunchRatePerH`、`CaptureDepthM`、`BreachRatePerH`、05 的特征值）。

### V5 无敌打法搜索（条带层部分）

`v5_strip_exploits.py`，在 V2 的南线单边上：
1. **只打不攻**：攻方只做 A/C 线、从不发起 E 线 → `penetrationProgress` 必须保持 0（地块只能靠 E 线和无抵抗推进易手）；但守方损耗应显著（“火力消耗”有价值但不能代替夺取）。
2. **堆兵**：攻方参战营从 3 增至 12 → 同时片段数被扇区数封顶；单位时间推进的边际收益递减，而 A/C 线损失（集结特征值高）线性以上增长。若推进与营数成正比 → 正面宽度或特征值失效。
3. **轮换刷新**：频繁脱离/再入战斗以“重置”接触线或工事 → 不得带来收益（守方工事保留，攻方损失组织时间与途中挨打）。
4. **无限巡飞弹**：巡飞弹库存 ×10 → 收益应受目标获取（暴露度）与防空约束饱和；若守方全灭于 C 线且无需 E 线 → 检查 `TargetValueC` 与获取概率。
5. **夜间渗透绕障**：只用 `Infiltration` → 推进度增长不得超过 `AttackPosition` 路线的 50%。
6. **条令参数搜索**：CMA-ES 搜索 `DoctrineProfile` 与 `FireSupportPriority`，检查是否存在对所有对手都占优的单一设置（> 85% 胜率）。

### V6 计算性能（条带层部分）

`v6_strip_bench.py`：一条边双方各 1 个旅（约 40 个元素、20 个火力单位、19 个扇区），测一条带步（不含片段内部）的耗时，目标外推到 C# **≤ 1 ms**；`TruckKillIntegral` 每次 ≤ 20 µs；broker 在 100 条边、每刻 200 个请求时的 Commit ≤ 2 ms。若超标，优先缓存每条带步的 `density` 栅格（2 km 粗网格）。

### 与 V1 的关系

V1（03 §9）中“营属/旅属武器服务多个连”的实验，需要本文件 §4.9.4 broker 的 Python 实现（同时 3 个片段、共享 1 个营迫击炮排或 1 个旅炮兵连）。该实现由本节的脚本库提供，V1 直接导入，保证“请求链 + 排队”的语义两边一致。

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| E-01 | 接触线表示 | 每扇区一个 y 值（分段常数） | 与片段的扇区一一对应；足够画图和算推进度 | 连续折线（插值） |
| E-02 | 条带格子与离线生成范围 | 250 m 格；阶段 1 对战区全部陆地边离线生成 | 一次生成、读档快、地形固定（总纲 §9.3） | 500 m 格；首次交战时在线生成并缓存 |
| E-03 | 共享资产（G-08）映射 | 资产存一个地块局部平面位置，向各边投影 | 一个实体、一个库存、几何一致，计算便宜 | 资产只属于一个条带（需要手动指派） |
| E-04 | 程序生成地形的种子 | 不含世界种子（只用边 ID） | 同一条边在所有存档里地形一致，可离线预生成与共享 | 含世界种子（每局不同地形，但违背“真实地形优先”的方向） |
| E-05 | 旅级“火力支援优先”设置 | 加一个三档旅设置（CloseSupport/Balanced/CounterFire） | 把 C/E 线炮兵分配变成玩家能理解的配置决策，而非微操 | 完全由条令 AI 决定 |
| E-06 | 扇区宽度来源 | 由攻方条令的连进攻正面决定 | 进攻方决定接触的“颗粒度” | 固定 1200 m |
| E-07 | 巡飞弹的飞行与拦截 | 阶段 1 由 08 负责（`LaunchLoiteringMunition`），04 负责目标选择与命中效果；阶段 0 用 §4.6.5 后备公式 | 拦截发生在空中层的速度上（总纲 §12.1）；与地面防空双登记一致 | 全部在 04 内结算 |
| E-08 | 推进度定义 | 各扇区推进/8 km 的平均 + 侧翼暴露规则迫使守方拉直战线 | 防止“一点突破即易手”，又能让突破产生连锁后撤 | 取最大值；或按突破宽度阈值 |
| E-09 | `AttackerCompaniesAllOnOwnSide` 的“己方一侧” | 以接触线为界（不要求退回 y < 0） | 停止进攻不应强制放弃已夺取的地面 | 09 原文 y < 0 |
| E-10 | 缓存片段与支援火力 | 缓存模式不向 broker 提交请求，只用 `supportLevel` 键 | 结果分布已包含支援；避免缓存片段与实时片段争抢同一队列造成不可复现的耦合 | 缓存片段按期望发数扣弹药并占用队列时间 |
| E-11 | 03 需新增 `ForceEnd(EngagementId)` | 采纳 | 战斗被 09 判定结束时（如停火、地块因别处原因易手）需要立刻收尾 | 等片段自然结束后才结束战斗 |
| E-12 | CAS 与无人机打击的 AAR 归因 | 落在片段外的 CAS 记 C 线；片段内记事件自身标签 | 与“C 线 = 火力消耗”的玩家理解一致 | 单独一类“空中” |
| E-13 | 破障模型与 `BreachRatePerH` 初值 | 速率 ∝ 工兵当量 / (密度 × 扇区宽)，× (1 − 敌火覆盖)；初值 0.02，由 V2 校准 | 让工兵数量、扫雷车、C 线压制三者都直接可见 | 固定破障时间表 |
| E-14 | V2 目标值的来源 | 由 14 依据 Oryx 等公开图像统计核定区间，本文件只给宽区间 | 避免在规格里臆造精确统计数字 | — |
| E-15 | 条带上不额外随机 | 连续量用期望值；只有命中/定位/拦截抽样 | ✅ 总纲 §21-1 | — |
| E-16 | 03 的 `SquadAmmoState` 与 06 的 `SquadCarriedState` 重复 | 以 06 的 `SquadCarriedState` 为唯一存储，03 通过 06 API 读写，03 的组件降级为片段内缓存 | 一个数据只由一个系统拥有（00 §0-2） | 保留两套并同步 |
| E-17 | EngReconRatePerH 初值 | 0.5 | 估算 | 由 R-V1 校准 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 条带侧 | `StripSide` | `Negative = −1`（y<0）/ `Positive = +1`；06 的 `int side` 即此值 | 04 |
| 战斗角色 | `BattleRole` | `Attacker / Defender`（开战时） | 04 |
| 条带元素类型 | `StripElementKind` | `Company, FireUnit, SupportDetachment, Headquarters, AirDefense, LoiteringBattery, Logistics` | 04 |
| 条带任务 | `StripTask` | `Hold, Advance, Reserve, Withdraw, Counterattack, FireSupport, Relocate, Breach, Recon, Reorganize, Deploy` | 04 |
| 元素状态 | `ElementState` | `Idle, Moving, Locked, Relocating, Firing, Disengaging, Gone` | 04 |
| 扇区 | `SectorState` | 正面宽度的一个“槽”：每扇区至多 1 个活跃片段；带雷障密度、破障进度 | 04 |
| 扇区地形摘要 | `SectorTerrainSummary` | 扇区的地形占比、车辆通道、起伏、视距 | 04 |
| 条带格子 | `StripCell` | 250 m 地形格 | 04 |
| 条令参数 | `DoctrineProfile` | 按国家的条带条令参数（正面、梯队比例、下车距离…） | 04（14 填数据） |
| 火力单位状态 | `FireUnitState` | 间瞄火力单位的炮管、射程、队列、反炮兵暴露 | 04 |
| 火力任务 | `FireMission` / `FireMissionKind` | 条带层间瞄/远程火力任务及其类型 | 04 |
| 支援火力共享队列 | `SupportFireBroker` | 全局唯一的火力单位队列管理器，阶段末按全序键统一排队 | 04 |
| 火力支援优先 | `FireSupportPriority` | 旅设置：`CloseSupport, Balanced, CounterFire` 🟡 | 04 |
| 地面事件 | `ScheduledGroundEvent` | 已排程的落点事件 | 04 |
| 损失账本 | `BattleLossLedger` / `BattleLossEntry` | 战斗内所有损失及其 `BattleLine` 归因 | 04 |
| 线计数 | `LineCounters` | 五条线的任务、出动、拦截、定位等累计统计 | 04 |
| 阶段战报数据 | `PeriodicBattleReportData` | 24 h 报告的数据包 | 04 |
| 瓶颈提示 | `BottleneckHint` | 条带视图的规则化提示（H1–H6） | 04 |
| 共享资产 | `isSharedAsset` / `tileLocalPosM` | 地块级资产在条带上的投影 | 04 |
| 工兵当量 | `EngineerEquivalent`（公式量） | 工兵班、扫雷车、工程车折算的破障/布雷能力 | 04 |
| 威胁场 | `TruckKillIntegral` / `density(x,y)` | 条带上卡车每米被毁期望，供 06 车队 | 04 |
