# 06 后勤补给（Logistics）

> 依据：总纲 §5（弹药）、§19（后勤补给）、§6（备件）、§9.3（条带）、§11.1、§12.5、§18.1/18.7。术语、单位、ID、`TickPhase` 以 [00_glossary.md](00_glossary.md) 为准；其中 🟡 G-xx 按“暂定采用”处理（尤其 G-17：`MobilityProfile` 整体归本文件）。
> 本文件的 🟡 编号为 `L-xx`，汇总在第 10 节。

---

## 1. 目标与范围

### 1.1 本系统解决什么问题
1. **弹药基数**（§5.1）：把旅内每件武器的默认基数汇总成旅的基数、吨位和配比；这是编制设计→弹药需求→采购的桥梁。
2. **物资从哪来、怎么到前线**（§19）：储备仓库 / 工厂 / 进口口岸 →（国家级运力）→ 前进后勤中心 →（后勤旅）→ 旅保障区 →（条带上：旅保障营、营保障连）→ 连。
3. **哪里是瓶颈、哪里怕被打**：流量图、节点面板、关键节点分析（§19.10）。
4. **被切断会怎样**（§19.9）：随行携带量、耗尽效果、包围圈。
5. **玩家定“囤多少”，AI 定“放哪里”**（§19.7）；海空军按枚储备、前置、库存上限（§5.2）。
6. **保质期、仓储费、进口渠道、本国产能落地**（§19.6、§19.7）。

### 1.2 阶段划分

| 内容 | 阶段 0 | 阶段 1（纳卡 MVP） | 阶段 2+ |
|---|---|---|---|
| `AmmoBasis` 汇总、`AmmoComposition`、`CarriedLoad` 初始化、班随身库存 `SquadCarriedState` | ✅（试验场需要） | ✅ | |
| `MobilityProfile`（G-17） | ✅（试验场读油耗、载重只做显示） | ✅ | |
| 后勤节点、库存、网络流、承运方、在途货物 | — | ✅ | 性能优化（§7.9） |
| 条带末段补给（车队） | 可选：试验场里可关闭（默认无限补给） | ✅ | |
| 打击节点/桥梁/交通线、切断、包围圈 | — | ✅ | |
| 储备目标、战略方向、AI 分配 | — | ✅ | |
| 空军弹药按枚、机场节点、前置、上限 | — | ✅ | |
| 进口口岸（陆路、空运）、渠道策略、轨距断点 | — | ✅ | 海港口岸（阶段 2，随海军） |
| 工厂节点（产能由 11 算）、国家工业节点 | — | ✅（每国 1–3 个） | 自动生成其他国家 |
| 保质期与轮换 | — | ✅ | 延寿项目 |
| 封存基地 `StorageBase` | — | 只留数据结构 | ✅ |
| 空运 / 空投补给 | — | ❌（🟡 L-10） | ✅ |
| 海军港口、VLS 补充 | — | — | 阶段 3 |

### 1.3 不包含
- 车辆修复、备件**消耗**、医疗、补充兵员**来源**：07。本文件只负责它们的**存储和运输**。
- 生产线产能、预算：11。本文件接收“产出了多少”，告诉 11“缺多少、仓储花多少钱”。
- 每发弹药的效果、武器默认基数的**数值**：03（地面）/ 08（空中）。
- 条带的坐标系、威胁场的计算：04。本文件定义条带上补给的**逻辑**，04 在 `StripStep` 里调用。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单（全部是“配置”，不调度车队，§19.1）

| # | 决策 | 层级 | 何时 | 代价/取舍 |
|---|---|---|---|---|
| D1 | 旅的**基数配比**：每种武器各弹种几发、选哪个弹药型号（如 155mm 普通榴弹 vs 制导炮弹） | 旅（可存为模板默认） | 任何时候；改动从下一次补给起生效 | 贵弹少带 → 吨位低、效果高、采购贵 |
| D2 | **储备目标**：陆军按物资大类“N 天战时消耗” | 全国 | 平时 | 占采购预算、仓储费、保质期报废 |
| D3 | 海空军精确弹药**按枚**设储备目标 | 全国 × 弹药型号 | 平时 | 同上 |
| D4 | **重点战略方向**比例（如东 60%） | 全国 | 平时/危机 | 判断错 → 开战时方向上缺货 |
| D5 | **新建储备仓库**：位置、容量、加固等级 | 全国 | 平时（建设需数年） | 靠前快但易挨打；加固贵 |
| D6 | **展开/前推前进后勤中心**（需后勤旅） | 后勤旅 | 战时 | 靠前车程短但易挨打；转移期间吞吐为 0 |
| D7 | 节点**分散度** | 每个节点 | 任何时候（改变需 24h） | 难被打 vs 周转慢 |
| D8 | **前置弹药**到某方向/机场 | 方向或机场 | 危机 | 前沿库存被一次打掉的风险 |
| D9 | 机场/前进中心**库存上限**（天数或枚数） | 每个节点 | 任何时候 | 控风险 vs 持续出动能力 |
| D10 | **进口渠道策略**：分散 / 最快 / 最安全 | 每种进口物资（按物资大类或弹药型号） | 任何时候 | 速度 vs 风险 |
| D11 | **补给优先**旗标（某旅/某机场优先） | 旅/机场 | 战时 | 其他单位被挤占 |
| D12 | **空陆运力优先**：`Balanced / AirFirst / LandFirst` | 全国 | 战时 | 空军弹药调拨与陆军补给争运力（§5.2） |
| D13 | 旅的**前沿补给方式**：`Auto / Continuous / NightOnly` | 旅 | 战时 | 白天送：快但挨打；只在夜间：慢但安全（§19.2 俄乌教训） |
| D14 | 仓库间调拨的**手动覆盖**（从 A 调 N 吨/型号到 B） | 节点对 | 任何时候 | 占运力 |
| D15 | 编制里放多少卡车、油罐车、后勤旅（在 01 的编辑器里做，本系统给反馈） | 模板 | 平时 | 人员、预算 vs 补给半径 |

### 2.2 反馈清单（数字要透明）

| # | 反馈 | 在哪看 | 数据来源（本文件的函数/视图） |
|---|---|---|---|
| F1 | 旅基数：总吨位、各弹药型号发数、需要几辆卡车运一个基数 | 编制编辑器、旅面板 | `AmmoBasisView` |
| F2 | “按当前编制，155mm 制导炮弹储备只够 9 天” | 储备面板、通知 | `ReserveGapReport` |
| F3 | 流量图：线粗 = 日运量，颜色 = 利用率，≥ 90% 标红，切断标黑虚线 | 地图图层 | `FlowMapView` |
| F4 | 节点面板：每天收到多少、需求多少、库存撑几天（按物资大类和关键型号） | 点节点 | `NodePanelView` |
| F5 | 关键节点分析：“这座桥被炸掉，前线 3 个旅的补给下降 45%” | 后勤面板 | `KeyNodeReport` |
| F6 | 旅的补给状态：随行携带量剩余（天数）、保障区库存、是否被切断、包围圈预计还能撑几天 | 旅面板、地图图标 | `UnitSupplyView`、`PocketInfo` |
| F7 | 条带视图里的车队：位置、损失、等待夜间 | 条带视图（13） | `ConvoyView` |
| F8 | 每辆卡车运多远、往返几小时、需要多少卡车才能满足需求（“缺 23 辆卡车”） | 后勤旅面板、旅面板 | `CarrierView` |
| F9 | 保质期：明年将报废多少吨/多少钱 | 储备面板 | `ShelfLifeReport` |
| F10 | 进口：各口岸利用率、在途、口岸被关闭的原因 | 进口面板 | `ImportView` |
| F11 | 战后报告里的后勤项：“本旅在 3 天内因补给不足闲置 14 小时（NoAmmo）”“损失卡车 12 辆” | AAR（13） | 统计计数器（§4.14） |

---

## 3. 数据结构

> 命名空间 `MoD.Sim.Logistics`。所有集合遍历按 ID 升序（00 §6.4）。下面 `double` 字段若无后缀即为无量纲，并注明范围。

### 3.1 枚举

```csharp
public enum SupplyClass : byte { None = 0, Ammunition = 1, Fuel = 2, SpareParts = 3, General = 4 }   // ✅ §19.6

public enum FuelType : byte { None = 0, Diesel = 1, JetFuel = 2 }    // 汽油并入 Diesel（简化）

public enum NodeRole : byte {                // 00 已列 1–7；8 为本文件新增（见第 11 节）
    None = 0, Depot = 1, ForwardHub = 2, Airbase = 3, Port = 4 /*阶段3*/, Factory = 5,
    ImportGateway = 6, IndustryNode = 7, FieldCache = 8
}

public enum NodeOpState : byte { None = 0, Operational = 1, Deploying = 2, Packing = 3, Moving = 4, UnderConstruction = 5, Destroyed = 6 }

public enum TransportMode : byte { None = 0, Road = 1, Rail = 2, Air = 3 /*仅进口口岸外部段*/, Sea = 4 /*阶段2+*/ }

public enum CarrierKind : byte {
    None = 0,
    NationalRail = 1,      // 国家铁路车皮（每国一个池）
    NationalRoad = 2,      // 国家公路运力池：中央汽车运输部队 + 动员民用卡车（🟡 L-04）
    LogisticsBrigade = 3,  // 后勤旅（每个后勤旅一个池，绑定它展开的前进中心）
    BrigadeOrganic = 4,    // 旅保障营卡车（条带上 BSA→BT；剩余运力可自取，见 §4.6）
    BattalionOrganic = 5   // 营保障连卡车（条带上 BT→连）
}

public enum CargoKind : byte { None = 0, Supply = 1, ReplacementEquipment = 2, ReplacementPersonnel = 3 }

public enum SupplyPriorityTier : byte { P0 = 0, P1 = 1, P2 = 2, P3 = 3, P4 = 4 }   // 数字小 = 优先

public enum ImportChannelPolicy : byte { None = 0, Distributed = 1, Fastest = 2, Safest = 3 }   // ✅ §19.6

public enum AirLandPriority : byte { Balanced = 0, AirFirst = 1, LandFirst = 2 }

public enum ForwardResupplyPolicy : byte { Auto = 0, Continuous = 1, NightOnly = 2 }

public enum ConvoyState : byte { None = 0, Loading = 1, Outbound = 2, WaitingForNight = 3, Unloading = 4, Returning = 5, Idle = 6 }

public enum MunitionShelfClass : byte { None = 0, SmallArms = 1, UnguidedGunMortar = 2, UnguidedRocket = 3, Guided = 4 }

public enum WarheadClass : byte { None = 0, Small = 1, Medium = 2, Large = 3 }   // < 50kg / 50–250kg / > 250kg 装药+战斗部
```

### 3.2 物资键与数量单位

```csharp
// 一个“物资”的键。弹药按型号；备件按装备型号；燃油按油种；一般物资只有一种。
public readonly record struct ItemKey(SupplyClass cls, int handle) : IComparable<ItemKey>
{
    // Ammunition : handle = 弹药型号运行时句柄（EquipmentModel 句柄，带 MunitionProfile）
    // SpareParts : handle = 装备型号句柄（每型号一个抽象备件库存，§6）
    // Fuel       : handle = (int)FuelType
    // General    : handle = 0
    // 排序：先 cls，再 handle（全序）
}
```

| 物资 | 库存数量单位 | 换算成吨（运输只看吨位，§19.6） |
|---|---|---|
| Ammunition | 发/枚（`double`，界面向下取整） | `qty × munition.roundWeightKg × PackagingFactor / 1000`；`roundWeightKg` = 03 `MunitionProfile.roundWeightKg`（整发全重） |
| SpareParts | 备件单位（含义由 07 定义） | `qty × PartsUnitMassKg(model) / 1000`（本文件数据，默认 `DefaultPartsUnitMassKg`） |
| Fuel | 吨 `T` | 原样；升 ↔ 吨用 `DieselDensityKgPerL` / `JetFuelDensityKgPerL` |
| General | 吨 `T` | 原样 |
| 补充装备（`CargoKind.ReplacementEquipment`） | 件 | `EquipmentModel.massKg / 1000`（01 核心字段） |
| 补充兵员（`CargoKind.ReplacementPersonnel`） | 人 | `qty × PersonnelTransportMassKg / 1000` |

```csharp
public static class ItemMass { public static double MassT(ItemKey k, double qty); }  // 按上表；未知型号质量 → 加载时报错
```

### 3.3 库存与批次

```csharp
public sealed class StockEntry
{
    public double quantity;                         // ≥ 0，单位见 §3.2
    // 只对 Ammunition 使用：按生产年份分批，键 = 公历年（int），值 = 数量。Σ值 == quantity（容差 1e-9）
    public SortedList<int, double> lotsByYear;      // 其他类别为 null
}

public sealed class Stockpile                        // 00：`Stockpile`
{
    public SortedDictionary<ItemKey, StockEntry> entries;   // 有序，禁止 Dictionary
    public double TotalMassT();                     // 按 ItemKey 升序累加
    public double MassT(SupplyClass c);
}
```

### 3.4 后勤节点

```csharp
public readonly record struct NodeId(int value);

public sealed class LogisticsNode                    // 00：`LogisticsNode`，归属 06
{
    public NodeId id;
    public string dataId;                // snake_case，如 "aze_depot_ganja"；FieldCache 用 "cache_<id>"
    public CountryId owner;
    public NodeRole role;
    public ulong tileId;                 // H3 第 4 级
    public double storageCapacityT;      // 总库容（吨），≥ 0；Factory/ImportGateway 视为 +∞（用 double.PositiveInfinity）
    public double throughputTPerH;       // 装卸吞吐（进+出，吨/小时）
    public int hardeningLevel;           // 0–3：0 露天，1 掩体，2 加固，3 地下
    public double dispersion;            // [0, 1]
    public double dispersionTarget;      // 玩家设定；实际值每小时向目标移动 1/DispersionChangeH
    public bool hasRailAccess;           // 节点直连铁路（仓库/工厂由数据给出；前进中心：所在地块有铁路货运站即为 true）
    public NodeOpState state;
    public SimTime stateUntil;           // Deploying/Packing/UnderConstruction 结束时刻
    public double throughputDamage;      // [0, 1]，被打击造成的吞吐损失
    public SimTime lastStruckAt;
    public FormationId deployedBy;       // ForwardHub：展开它的后勤旅；其他为 0
    public Stockpile stock;
    public NodeCaps caps;                // 玩家上限
    public bool priorityFlag;            // D11（机场可用）
    public ImportGatewayData gateway;    // 仅 ImportGateway 非 null
    public SimTime cacheExpiresAt;       // 仅 FieldCache
}

public sealed class NodeCaps
{
    public double maxDaysOfSupply;                          // ≤ 0 表示不限；对陆军物资按节点服务对象的消耗率换算
    public SortedDictionary<int, double> maxCountByMunition; // 机场：弹药型号句柄 → 最多枚数（D9）
}

public sealed class ImportGatewayData
{
    public TransportMode externalMode;       // Road / Rail / Air（Sea 阶段 2+）
    public CountryId transitCountry;         // 经过的第三国（GEO、IRN…）；0 = 直接与供应国接壤
    public double capacityTPerDay;           // 口岸外部段日处理上限（含换装）
    public bool gaugeBreak;                  // 有轨距断点：capacityTPerDay 已含换装站能力
    public SortedDictionary<CountryId, double> externalLeadTimeH; // 供应国 → 外部段运输时间（小时）
    public bool isOpen;                      // 由 11 的外交状态与事件决定（§4.12）
    public string closedReason;              // 界面显示用的本地化键
}
```

### 3.5 旅保障区、营辎重队、班随身库存

```csharp
public sealed class BrigadeSupportArea               // 00：`BrigadeSupportArea`
{
    public FormationId brigade;          // 旅级建制编组（Formation.echelon == Brigade）
    public ulong tileId;                 // 由 12 的编组 AI 设置；默认 = 旅部所在地块
    public Stockpile stock;
    public double maxStockT;             // = BsaBaseStockT + 旅保障营卡车总载重（车上也算库存）
    public SortedDictionary<ItemKey, double> rateEmaPerH;   // 本旅（含下属营）每小时消耗的指数滑动平均
    public ForwardResupplyPolicy policy;
    public bool priorityFlag;            // D11
    public bool isCutOff;                // §4.9
    public int pocketId;                 // 0 = 未被包围
}

public sealed class BattalionTrains                  // 00：`BattalionTrains`
{
    public OrgUnitId battalion;
    public Stockpile stock;
    public double maxStockT;             // = 营保障连卡车总载重 × BtStockFactor
}

// 班的随行携带量（CarriedLoad 的落地）。03 开火时通过 §6 的 API 扣减；06 补给时增加。
public sealed class SquadCarriedState
{
    public SquadId squad;
    public SortedDictionary<ItemKey, double> qty;       // Ammunition：发；Fuel：吨（车辆油箱合计）；General：吨
    public SortedDictionary<ItemKey, double> fullQty;   // “满载”参考：按 AmmoComposition 与车辆油箱容量算出
    public double daysWithoutGeneral;                   // §4.9
}
```

**独立营**（不属于任何有 BSA 的旅）：挂到 12 指定的“保障旅”的 BSA；若没有指定，挂到其所在地块路程最近的己方旅的 BSA；仍没有则直接从最近节点自取（用自己营保障连的卡车，§4.6）。🟡 L-17

### 3.6 弹药基数

```csharp
// 03 在 WeaponProfile 中给出：每种武器型号的默认基数
//   DefaultAmmoLoad { List<(int munitionHandle, int rounds)> }   —— 03 定义，06 只读
public sealed class AmmoComposition                  // 旅一级的覆盖（D1）
{
    public FormationId brigade;
    // 武器型号句柄 → 该武器每件的弹药配置（覆盖 DefaultAmmoLoad）；不在表里的武器用默认值
    public SortedDictionary<int, List<(int munitionHandle, int rounds)>> perWeaponModel;
}

public sealed class AmmoBasis                         // 计算结果，不存档（可随时重算）
{
    public FormationId brigade;
    public SortedDictionary<int, double> roundsByMunition;  // 弹药型号 → 发数（一个基数）
    public double massT;                                    // 一个基数的运输吨位（含包装）
    public int trucksToCarry;                               // ceil(massT / StandardTruckPayloadT)，仅显示
}

public sealed class CaliberGroupDef                  // 数据：data/logistics/caliber_groups.yaml
{
    public string id;                    // 一组 = 物理上可互换的弹药，如 "cal_152mm_sov"、"cal_155mm_nato"、"cal_122mm_grad"
    public List<int> munitionHandles;
}
```

### 3.7 `MobilityProfile`（G-17 暂定整体归 06）

```csharp
public sealed class MobilityProfile          // YAML 键：mobility（EquipmentModel 下）
{
    public double roadSpeedMps;              // 数据 road_speed_kph
    public double offroadSpeedMps;           // 数据 offroad_speed_kph
    public FuelType fuelType;
    public double fuelCapacityL;
    public double fuelRoadLPer100Km;         // 数据 fuel_road_l_per_100km
    public double offroadFuelMult;           // 默认 OffroadFuelMultDefault
    public double idleFuelLPerH;             // 怠速/发电；默认 = fuelRoadLPer100Km × IdleFuelFactorPerH
    public double cargoPayloadT;             // 货运卡车载重；非运输车 0
    public double liquidPayloadL;            // 油罐车容量；非油罐车 0
    public bool isAirdroppable;              // 08 用
    public bool isSlingLoadable;             // 08 用
}
```
缺数据时：按类别默认值（`data/logistics/mobility_defaults.yaml`，键 = `EquipmentCategory` id），并在加载日志里记 `confidence: estimated`。

### 3.8 运输网络

```csharp
public enum GNodeKind : byte { None = 0, TileRoad = 1, TileRail = 2, Logistics = 3, Bsa = 4 }

public sealed class GNode { public int index; public GNodeKind kind; public ulong tileId; public NodeId node; public FormationId bsaOf; }

public sealed class Arc
{
    public int index;                    // 构图时按 (fromIndex, toIndex, mode) 升序编号
    public int from, to;                 // GNode index（有向；同一条路两个方向各一条 Arc，容量各自独立）
    public TransportMode mode;
    public EdgeId edge;                  // 跨地块弧：对应的 Edge（10）；地块内接入弧：default
    public double lengthM;               // Road：10 的 RoadRoute.routeLengthM；Rail：RailLink.routeLengthM；接入弧：IntraTileAccessM
    public double baseCapTPerH;          // 未受损时容量（§4.2.2）
    public double speedMps;              // 车队/列车平均速度
    public double capFactor;             // [0,1]：控制权、战斗、桥梁、打击的综合系数（§4.2.3）
    public double lossFraction;          // [0,1)：每次通过的预期货损比例（§4.10.3）
    public double residualTPerH;         // 本小时剩余容量（分配时递减）
    public List<CrossingId> crossings;   // 本弧依赖的桥梁/隧道（10）
    public double TravelH => lengthM / speedMps / 3600.0;
}

public sealed class SupplyGraph          // 拓扑变化时重建；每小时只刷新 capFactor / lossFraction / residual
{
    public List<GNode> nodes;            // 顺序：先所有 TileRoad（按 tileId 升序），再 TileRail，再 Logistics（NodeId 升序），再 Bsa（FormationId 升序）
    public List<Arc> arcs;
    public List<int>[] outArcs, inArcs;  // 每个列表内按 Arc.index 升序
    public int topologyVersion;
}
```

### 3.9 承运方、在途货物、车队

```csharp
public readonly record struct CarrierId(int value);

public sealed class CarrierPool
{
    public CarrierId id;
    public CarrierKind kind;
    public CountryId owner;
    public FormationId formation;        // LogisticsBrigade / BrigadeOrganic：所属编组；国家池：0
    public OrgUnitId battalion;          // BattalionOrganic：所属营
    public NodeId boundHub;              // LogisticsBrigade：其展开的前进中心（未展开 = 0，池不可用）
    public double generalPayloadT;       // 可用（未损坏、未在条带车队中）的干货载重合计 × CarrierAvailability
    public double liquidPayloadT;        // 油罐载重（吨）合计 × CarrierAvailability
    public double usedGeneralTH;         // 本小时已占用的“吨·小时”
    public double usedLiquidTH;
}

public readonly record struct ShipmentId(int value);

public sealed class Shipment
{
    public ShipmentId id;
    public CountryId owner;
    public CargoKind cargo;
    public SortedDictionary<ItemKey, double> items;              // Supply：物资→数量
    public SortedDictionary<ItemKey, SortedList<int,double>> lots; // 弹药批次随货走
    public int replacementRef;            // 补充装备/兵员：07 的请求 ID
    public double massT;
    public int destGNode;                 // Logistics 或 Bsa 节点
    public List<int> path;                // Arc index 列表（从源到目的）
    public int nextArc;                   // 下一条要走的弧在 path 中的下标
    public double hoursLeftOnArc;         // 当前弧剩余小时
    public CarrierId carrier;             // 主承运方（用于损失归属）
    public SupplyPriorityTier tier;
    public SimTime dispatchedAt;
}

public readonly record struct ConvoyId(int value);

public sealed class SupplyConvoy                       // 条带上的车队（§4.8）
{
    public ConvoyId id;
    public EdgeBattleId battle;
    public int side;                                   // 战斗坐标中的一侧：-1 进攻方坐标侧 / +1 防守方坐标侧（04 定义）
    public CarrierKind kind;                           // BrigadeOrganic 或 BattalionOrganic
    public List<EquipmentItemId> trucks;               // 按 ID 升序
    public SortedDictionary<ItemKey, double> cargo;
    public OrgUnitId destUnit;                         // 营（BSA→BT）或连（BT→连）
    public ConvoyState state;
    public double xM, yM;                              // 战斗坐标
    public double legLengthM, legProgressM;
    public double stateHoursLeft;
}
```

### 3.10 需求、储备、战略方向

```csharp
public sealed class SupplyRequest                      // 每小时临时对象
{
    public int sinkGNode;
    public SupplyClass cls;                            // 一个请求 = (汇点, 物资大类)
    public SortedDictionary<ItemKey, double> deficit;  // 各物资缺口（数量）
    public double massT;                               // Σ 缺口吨位
    public SupplyPriorityTier tier;
    public bool priorityFlag;
    public int stage;                                  // 1 = 国家级，2 = 作战级（§4.5）
}

public sealed class StockTargetSettings                // 每国一份（D2、D3）
{
    public SortedDictionary<SupplyClass, double> landDays;     // Ammunition/Fuel/SpareParts/General → 天
    public SortedDictionary<int, double> airMunitionCount;     // 弹药型号句柄 → 枚
    public AirLandPriority airLandPriority;
    public SortedDictionary<SupplyClass, ImportChannelPolicy> importPolicyByClass;
    public SortedDictionary<int, ImportChannelPolicy> importPolicyByMunition;   // 覆盖按类
}

public readonly record struct StrategicDirectionId(int value);

public sealed class StrategicDirection                 // 00：`StrategicDirectionWeight` 的载体
{
    public StrategicDirectionId id;
    public string name;
    public List<RegionId> regions;                     // Region（10）；每个 Region 至多属于一个方向
    public double weight;                              // [0,1]；同一国家所有方向之和 = 1（界面强制归一）
}

public sealed class PrepositionOrder                   // D8
{
    public int id;
    public CountryId owner;
    public StrategicDirectionId direction;             // 二选一
    public NodeId airbase;
    public double days;                                // 按“激增强度”的天数
}
```

### 3.11 封存基地（阶段 2+，只留结构）

```csharp
public sealed class StorageBase                        // 00：`StorageBase`，阶段 2+
{
    public NodeId node;                                // 复用 LogisticsNode（role = Depot，标志 isStorageBase）
    public SortedDictionary<int, List<StoredItem>> itemsByModel;
}
public sealed class StoredItem { public EquipmentItemId item; public double condition; /*[0,1]，每年 −StorageConditionDecayPerY*/ public bool cannibalized; }
```
启封决策（时间、钱、备件）由 11 定义；06 只负责存放、状态衰减、启封后作为 `ReplacementEquipment` 运输。

---

## 4. 算法与公式

### 4.0 执行时序总览

| `TickPhase` | 频率 | 06 做什么 |
|---|---|---|
| 30 `Calendar`（日） | 每 1440 分钟 | 保质期检查（§4.13）；储备目标与 AI 分配重算（§4.11）；关键节点分析（§4.15，只读） |
| 40 `Logistics` | 每 60 分钟 | §4.1–§4.7、§4.9、§4.12 的全部步骤 |
| 80 `StripStep` | 每 `StripStepMinutes` | 04 调用 `StripLogistics.Step()`（§4.8） |
| 110 `GroundEventApply` | 每刻 | 节点/桥梁/交通线打击效果（§4.10） |
| 120 `Consumption` | 每 60 分钟（地块层部队） | 未在条带上的营的燃油、给养消耗（§4.3）；条带/片段内的消耗由 03/04 通过 API 直接扣减 |

`Logistics` 阶段内部顺序（每小时，`n % 60 == 0`）：
```text
L1 节点状态推进（展开/转移计时、修复、分散度趋近、FieldCache 过期）
L2 在途货物推进与到达（§4.4）
L3 刷新网络容量与风险（§4.2）
L4 连通性与切断判定（§4.9）
L5 承运方运力刷新（§4.6）
L6 生成需求（§4.5.1）
L7 阶段 2 分配：节点 → 旅保障区（§4.5）
L8 阶段 1 分配：国家级（§4.5）
L9 进口到货分配到口岸（§4.12）
L10 地块层末段：BSA → 未在条带上的营（§4.7）
L11 统计（EMA、流量图）
```

### 4.1 弹药基数（阶段 0 起）

```text
对旅 b 中每件装备 w（EquipmentItem，其型号有 WeaponProfile），按武器型号 M(w)：
    load(M) = AmmoComposition.perWeaponModel[M]  若有覆盖
            = WeaponProfile(M).defaultLoad   否则
BasisRounds[b][m] = Σ_w Σ_{(m, r) ∈ load(M(w))} r
BasisMassT[b]     = Σ_m BasisRounds[b][m] × roundWeightKg(m) × PackagingFactor / 1000
```
- 统计范围：旅内所有营（含旅直属营）里**状态不是 Destroyed/Abandoned** 的装备实例（07 的 `VehicleDamageState`）。模板视图（编辑器）用模板槽位 × 绑定型号代替实例。
- `CarriedLoad`（随行携带量）满载定义：每件武器带 `load(M)` 一份（即 1 个基数，`CarriedAmmoBases = 1.0`）；车辆油箱满；班的给养 `CarriedGeneralDays` 天。
  - `fullQty[ammo m]`（班级）= Σ_{班内武器 w} rounds(m in load(M(w)))
  - `fullQty[Fuel f]` = Σ_{班内车辆, fuelType=f} fuelCapacityL × density / 1000
  - `fullQty[General]` = 班人数 × `GeneralKgPerPersonDay` × `CarriedGeneralDays` / 1000
- 通用口径组：一件武器可用的弹药 = 03 在 `WeaponProfile.munitions` 给出的列表。补给时如果首选弹药型号缺货，同 `CaliberGroup` 且在 `munitions` 内的其他型号可以替代（按 `ItemKey` 升序选第一个有货的），并记 `substitutedRounds` 计数供 AAR。

```csharp
AmmoBasis ComputeBasis(FormationId b) {
    var rounds = new SortedDictionary<int,double>();
    foreach (var w in Org.ItemsInFormation(b).OrderBy(i => i.id))           // 01 提供
        if (w.model.weapon != null && !Damage.IsLost(w.id))
            foreach (var (m, r) in LoadFor(b, w.model)) rounds[m] = rounds.GetValueOrDefault(m) + r;
    double massKg = 0; foreach (var (m, r) in rounds) massKg += r * Munition(m).roundWeightKg * PackagingFactor;
    return new AmmoBasis { brigade = b, roundsByMunition = rounds, massT = massKg / 1000,
                           trucksToCarry = (int)Math.Ceiling(massKg / 1000 / StandardTruckPayloadT) };
}
```

**基数与储备天数的关系**（🟡 L-16）：全国储备目标以“天”为主（§19.7 ✅），旅界面显示等效基数：`basesEquivalent = landDays[Ammunition] × StandardWarDayAmmoBases`。

### 4.2 构建运输网络

#### 4.2.1 拓扑（拓扑变化时重建：节点增删、地块控制权变化、桥梁状态变化不需要重建）
对每个国家 c 分别建图（只含 c 可用的部分；共享地图数据，图对象按国家分开）：
1. **TileRoad 节点**：c 控制的每个地块（09 的 `TileControl`）。
2. **TileRail 节点**：上述地块中 `RailLink` 不为 None 的地块（至少一条铁路边）。
3. **Road 弧**：相邻两地块都为 c 控制且 `Edge.road.cls != None`（10）→ 两个方向各一条。
4. **Rail 弧**：同理，`Edge.rail.cls ∈ {ConventionalSingle, ConventionalDouble}`。`HighSpeed` **不承运物资**（只运兵员，§19.4），建一条只允许 `CargoKind.ReplacementPersonnel` 的弧（标志 `personnelOnly`）。
5. **铁公转运弧**：地块 `hasRailFreightTerminal == true`（10）→ TileRail↔TileRoad 各一条，容量 `RailRoadTransferTPerH × railFreightTerminalCount`，长度 0，成本 `TransferHandlingH`。
6. **节点接入弧**：每个 `LogisticsNode`（c 所有、`state ∈ {Operational}`）→ 与所在地块 TileRoad 相连（长度 `IntraTileAccessM`）；若 `hasRailAccess` 且地块有 TileRail，再与 TileRail 相连（长度 0）。接入弧容量 = +∞（节点吞吐用节点预算单独限制，§4.5.3）。
7. **BSA 节点**：每个旅保障区与其地块 TileRoad 相连（长度 `IntraTileAccessM`，容量 +∞）。

#### 4.2.2 基础容量和速度（数据来自 10，常数见第 5 节）
```text
Road 弧（边 e）:
    routes = e.road.routes（最多 3 条，10 给出，每条有 cls, routeLengthM, mountainFactor）
    baseCapTPerH = Σ_k RoadCapTPerH[routes[k].cls] × routes[k].mountainFactor
    speedMps     = RoadConvoySpeedKph[routes[0].cls] × routes[0].mountainFactor / 3.6
    lengthM      = routes[0].routeLengthM
Rail 弧:
    baseCapTPerH = RailCapTPerH[e.rail.cls]
    speedMps     = RailSpeedKph / 3.6
    lengthM      = e.rail.routeLengthM
    若 e.rail.gaugeBreak：该弧容量再取 min(baseCap, GaugeTransferTPerH)，成本 + GaugeTransferH
```

#### 4.2.3 每小时刷新 `capFactor`
```text
capFactor(arc) = controlFactor × battleFactor × crossingFactor × strikeFactor × seasonFactor
controlFactor  = 1（两端都是己方控制，建图已保证）
battleFactor   = 0  若 arc.edge 上有活跃 EdgeBattle（前线边不能当补给线）；否则 1
crossingFactor = 见下
strikeFactor   = 1 − TileLocThreat(c, toTile).capReduction    // §4.10.3
seasonFactor   = e.road.routes[k].winterFactor（阶段 1 恒为 1；10 预留字段，🟡 M-08 关联）
```
**桥梁/隧道（`CrossingId`）**：10 为每条弧的每条路线列出所依赖的 crossing，并为“该 crossing 断掉时”预计算了**绕行路线**（`bypass`）。
```text
对 Road 弧逐条路线 k：
    down_k = {x ∈ routes[k].crossings | crossingState[x].capFactor < 1}
    若 down_k 为空：路线容量 = 原值
    若 down_k 只有一个 x，且 bypass(x, e, k) 存在、且绕行路线自身依赖的 crossing 都完好：
         路线容量 = RoadCapTPerH[bypass.cls] × bypass.mountainFactor
               + crossingState[x].capFactor × 原路线容量          // 临时便桥恢复的部分
         若 k == 0，速度、长度改用 bypass 的值（取能力更大的那条）
    否则：路线容量 = crossingState 各 capFactor 的最小值 × 原路线容量
arc.baseCapTPerH 每小时按上式重算（不改拓扑）
```

#### 4.2.4 弧成本（单位：小时当量）
```text
cost(arc) = TravelH(arc) + RiskPenaltyH × arc.lossFraction + (arc 是转运弧 ? TransferHandlingH : 0)
```
`RiskPenaltyH` 对进口“最安全”策略乘 `SafestRiskMult`，对“最快”策略取 0（§4.12）。

### 4.3 消耗与消耗率

**每小时消耗（地块层，`TickPhase 120`，只对未放进条带的营）**
```text
燃油（每辆车 v，按 09 给出的上一小时行驶距离 kmMoved(v) 与道路/越野比例 offroadShare）：
    L = kmMoved × fuelRoadLPer100Km/100 × (1 − offroadShare + offroadShare × offroadFuelMult)
      + (kmMoved == 0 ? idleFuelLPerH × IdleDutyCycle : 0)
    吨 = L × density(fuelType) / 1000
给养：吨 = 班人数（Healthy+LightWounded）× GeneralKgPerPersonDay / 24 / 1000
弹药：地块层不消耗（训练由 02 调用 ConsumeForTraining 从仓库扣）
备件：07 通过 ReportConsumption 报告
```
扣减顺序：先扣班的 `SquadCarriedState`；班的库存不足时**不**自动从营辎重队拿（补给只通过 §4.7/§4.8 的运输进行）。

**消耗率估计**（供需求、天数显示）：每个 BSA 维护 `rateEmaPerH[item]`
```text
每小时：actual = 本小时该旅所有下属班报告的实际消耗（API ReportConsumption 汇总）
rateEma ← rateEma + (actual − rateEma) × (1 − 0.5^(1/RateEmaHalfLifeH))
rateFloor[item] = 平时基础消耗（燃油：车辆怠速 + 给养；弹药 0）
rateForPlanning = max(rateEma, rateFloor)
```
`0.5^(1/RateEmaHalfLifeH)` 用 `DMath.Pow` 预先算好成常数。

**标准战时日消耗**（用于“天数”目标与显示，与实际战况无关，§4.11）
```text
StdDay[b][ammo m]   = StandardWarDayAmmoBases × BasisRounds[b][m]
StdDay[b][Fuel f]   = StandardWarDayFuelFills × Σ_{车辆, fuelType=f} fuelCapacityL × density / 1000
StdDay[b][General]  = 人数 × GeneralKgPerPersonDay / 1000
StdDay[b][Parts p]  = 07 提供的 StandardWarDayPartsRate(b, p)
```

### 4.4 在途货物

```text
每小时 L2，对每个 Shipment（按 ShipmentId 升序）：
  budgetH = 1.0
  while budgetH > 0 and nextArc < path.Count:
      arc = path[nextArc]
      if arc.capFactor == 0 or 到达端地块已不由 owner 控制:
          → Stranded(shipment); break
      step = min(budgetH, hoursLeftOnArc)
      hoursLeftOnArc −= step; budgetH −= step
      if hoursLeftOnArc <= 1e-9:
          ApplyTransitLoss(shipment, arc)              // §4.10.3：按 arc.lossFraction 期望货损
          nextArc++; if nextArc < path.Count: hoursLeftOnArc = TravelH(path[nextArc])
  if nextArc == path.Count: Deliver(shipment)          // 加进目的地库存；超库容部分转 FieldCache（同地块）
```
- 发货时 `hoursLeftOnArc` 初始化为 `NodeHandlingH × (1 + DispersionHandlingPenalty × src.dispersion) + TravelH(path[0])`（装车时间并进第一段）。
- **Stranded**：在当前弧起点所在地块生成（或合并进已有的）`FieldCache` 节点（owner 不变，`storageCapacityT = +∞`，`hardeningLevel = 0`，`dispersion = 0.5`，`cacheExpiresAt = now + FieldCacheLifetimeH`）。下一小时它就是普通源节点，可被就近取用。地块被敌方占领时，地块内的 FieldCache 全部归占领方（缴获，记入 AAR）。
- `ApplyTransitLoss` 用**期望值**（连续量，00 §6.2 方差规则：货物是连续量）：`每个物资数量 ×= (1 − lossFraction)`；损失的卡车按 §4.10.3 另算（离散）。

### 4.5 网络流分配：两阶段 + 优先级分层 + 轮转配额贪心

**为什么不用精确最小费用流**：物资按类别和型号是多商品流，精确解要 LP，弱 agent 难实现、难解释。这里用“按优先级分层、层内轮转配额、每次走最便宜可行路径”的贪心，结果确定、可解释（“为什么这个旅没拿到 → 同层排在前面的请求用完了这座桥的容量”）。🟡 L-01

#### 4.5.1 生成需求（L6）

```text
对每个 BSA s（旅 b）：
  target[item] = BsaTargetH × rateForPlanning[item] + downstreamDeficit[item]
      downstreamDeficit = Σ_{b 的营辎重队} (BT 满载 − BT 库存) + Σ_{b 的班} (fullQty − qty)   （只计该物资）
  deficit[item] = max(0, target − stock − inbound[item])          // inbound = 目的地是 s 的在途数量
  按物资大类合并成请求；请求吨位还要 ≤ (maxStockT − stock.TotalMassT() − inboundMassT)，超出按比例缩
  tier：
    s 的旅有营在活跃 EdgeBattle 中：Ammunition/Fuel → P0；General/SpareParts → P1
    否则：任一物资 stock < 0.5 × target → P1；其余 → P3

对每个 Airbase a：
  aiTarget[m] = AirbaseTargetDays × 08.ExpectedDailyUse(a, m)          // m 为空中弹药型号或 JetFuel
  target[m] = min(aiTarget[m] 或前置命令目标（取大者）, caps.maxCountByMunition[m]（若有）)
  tier：airLandPriority == AirFirst → P0；LandFirst → P3；Balanced → P2
        有前置命令的物资 → max(P2, 上面结果)（即不低于 P2）

对每个 ForwardHub h（stage 1 汇点）：
  served(h) = 上一小时阶段 2 中从 h 取货的 BSA 集合；若为空，= 路径成本最低的源是 h 的 BSA 集合
  target[item] = HubTargetH × Σ_{s∈served} rateForPlanning_s[item]，下限 HubFloorT（按旅基数比例分摊）
  再受 caps.maxDaysOfSupply 和库容限制；tier = P2

对每个 Depot d：target 由 §4.11 每日计算；tier = P4
手动调拨（D14）：tier = P2（玩家明确要求）
补充装备/兵员（07 请求）：前线部队的 → P1；其他 → P3
```

#### 4.5.2 两个阶段

| 阶段 | 源（必须有该物资库存） | 汇 | 承运方 | 可用弧 |
|---|---|---|---|---|
| 2（作战级，先算） | ForwardHub、Depot、FieldCache（Airbase 不向 BSA 供货） | BSA | 源是 ForwardHub：其后勤旅池；任意源：请求旅的 `BrigadeOrganic` 剩余运力（§4.6）；独立营自取：`BattalionOrganic` | 只 Road |
| 1（国家级，后算） | Depot、Factory、ImportGateway、FieldCache、ForwardHub（只在调拨命令中作为源） | ForwardHub、Airbase、Depot | `NationalRail`（铁路弧）、`NationalRoad`（公路弧） | Road + Rail + 转运弧 |

阶段 2 先算，使前线运输优先占用公路容量。两阶段都用本小时开始时的库存（已扣除本小时更早分配出的量），本小时发出的货在途，不会在同一小时被再转运。

#### 4.5.3 层内轮转配额贪心

```csharp
void Allocate(int stage, List<SupplyRequest> reqs, Country c) {
    // 全序：tier 升序 → priorityFlag（true 在前）→ sinkGNode 升序 → cls 升序
    reqs.Sort(RequestComparer);
    foreach (var tierGroup in reqs.GroupBy(r => r.tier).OrderBy(g => g.Key)) {
        var list = tierGroup.ToList();                                       // 保持上面的排序
        var remaining = list.ToDictionary(r => r, r => r.massT);
        var quantum   = list.ToDictionary(r => r, r => Math.Max(MinQuantumT, r.massT * QuantumFraction));
        var exhausted = new HashSet<SupplyRequest>();
        for (int round = 0; round < MaxRoundsPerTier; round++) {
            bool progress = false;
            foreach (var r in list) {
                if (exhausted.Contains(r) || remaining[r] <= EpsT) continue;
                double q = Math.Min(quantum[r], remaining[r]);
                var best = FindBestSource(stage, r, q, c);                    // 见下
                if (best == null || best.maxT <= EpsT) { exhausted.Add(r); continue; }
                double x = Math.Min(q, best.maxT);
                Commit(stage, r, best, x);                                    // 扣源库存、扣弧余量、扣节点吞吐、扣承运方吨·时；生成 Shipment
                remaining[r] -= x; progress = true;
            }
            if (!progress) break;
        }
    }
}
```

**`FindBestSource`**：从汇点出发在**反向图**上跑 Dijkstra（多源最短路的反向写法）：
```text
dist[sink] = 0；优先队列按 (dist, gnodeIndex) 升序（平局按索引）
只走 residualTPerH > EpsT 且 capFactor > 0 的弧；阶段 2 只走 Road 弧；personnelOnly 弧只对补充兵员开放
每弹出一个节点 u：
    若 u 是本阶段合法源，且 u 有 r 的任一“仍有缺口的物资”的库存 > EpsT，
    且 u 的节点吞吐余量 > EpsT（Factory/ImportGateway 用其产出/口岸日上限折算的每小时值）：
        还原路径 P（u → sink 的弧序列）
        对每个可用承运方 k（顺序：LogisticsBrigade(绑定 u) → BrigadeOrganic(请求旅) → BattalionOrganic；阶段 1：铁路段用 NationalRail，公路段用 NationalRoad）：
            cycleH_k = 2 × Σ_{arc∈P, 由 k 承运} TravelH(arc) + 2 × NodeHandlingH × (1 + DispersionHandlingPenalty × u.dispersion)
            capByCarrier_k = (k 剩余吨·时) / cycleH_k        // 燃油：先用 liquid，不足时用 general，general 每吨按 1/FuelInGeneralEfficiency 吨计
        maxT = min( min_{arc∈P} residual(arc),
                    节点吞吐余量(u), 节点吞吐余量(汇点若是 LogisticsNode),
                    可供物资吨位(u, r),
                    capByCarrier（阶段 1：铁路与公路两段都要满足，取二者最小）)
        若 maxT > EpsT：返回 {u, P, maxT, carrier}
        否则继续 Dijkstra（换下一个更远的源）
    松弛 u 的入弧（反向）：dist[v] = dist[u] + cost(arc)
找不到 → null
```
- 节点吞吐余量：`throughputTPerH × (1 − throughputDamage) × (1 − DispersionThroughputPenalty × dispersion) − 本小时已进出吨位`。
- **一次发货内的物资构成**（同一请求同一源）：按缺口比例分配、受源库存限制的注水法：
```text
share_i = x × d_i / Σd；若 share_i > avail_i 则 share_i = avail_i，把差额按其余物资的 d 比例再分，最多重复 #物资 次
弹药从源扣减时按 FEFO（最早年份批次先出，§4.13）；批次随货
```
- **承运方吨·时**的含义（透明公式，F8）：一个承运方每小时能发出的吨位 = 可用载重 ÷ 往返小时。例：载重 1000t、往返 8h → 125 t/h。🟡 L-03

### 4.6 承运方运力（L5）

```text
NationalRail(c)：generalPayloadT = 14 剧本给出的 RailFleetPayloadT(c) × RailFleetAvailability；liquid 同（油罐车皮）
NationalRoad(c)：generalPayloadT = NationalTruckPayloadT(c, MobilizationLevel)（14/11 给出：动员越高越大）
LogisticsBrigade(f)：Σ_{f 内状态完好、不在条带车队中的卡车} cargoPayloadT × CarrierAvailability
                     liquid = Σ 油罐车 liquidPayloadL × DieselDensityKgPerL / 1000 × CarrierAvailability
                     只有 boundHub 处于 Operational 时可用
BrigadeOrganic(b)：  同上，统计旅保障营（12/01 标记为旅直属后勤营的营）卡车里**当前在 BSA 闲置**的部分
                     （条带车队占用的车不计；地块层末段 §4.7 用掉的吨·时先扣）→ 剩余可用于阶段 2 自取
BattalionOrganic(u)：营保障连卡车；只在独立营自取时用于阶段 2
每小时开始 usedGeneralTH = usedLiquidTH = 0
```
“哪些卡车属于后勤用途”：`EquipmentModel` 的 `mobility.cargoPayloadT > 0` 或 `liquidPayloadL > 0`，且所在班的 `TemplateRole == Support` 或 `EquipmentPool`（01）。作战车辆即使有载重也不计入。

### 4.7 地块层末段：BSA → 未在条带上的营（L10）

```text
对每个旅 b 的每个营 u（不在任何活跃 EdgeBattle 的条带上），按缺口比例（deficitMassT / fullMassT）降序、平局 OrgUnitId 升序：
  distM = (u 与 BSA 同地块) ? IntraTileAccessM : 道路网络最短路长度(BSA 地块 → u 地块)（只走己方 Road 弧）
  若不可达：跳过（u 可能被切断，§4.9）
  cycleH = 2 × distM / (RoadConvoySpeedKph[最差路段等级] / 3.6) / 3600 + 2 × UnitHandlingH
  可运 = BrigadeOrganic(b) 剩余吨·时 / cycleH
  x = min(可运, u 的缺口吨位, BSA 对应库存)
  直接从 BSA 库存转入 u 下属班的 SquadCarriedState（§4.8.4 的分配规则），扣 BrigadeOrganic 吨·时 x × cycleH
```
地块层末段**不模拟车队、不计损失**（没有交战条带时卡车处在己方纵深，损失由 LOC 打击另算）。距离越远补得越慢，这就是“营离旅主力太远”的自然代价。

### 4.8 条带末段：车队（04 在 `StripStep` 调用）

```csharp
public static class StripLogistics {
    // 每个条带步、每个活跃 EdgeBattle、每一方各调用一次；04 负责调用顺序（EdgeBattleId 升序，进攻方坐标侧先）
    public static void Step(EdgeBattleId battle, int side, double dtS, IStripQuery strip);
}
// 04 实现的查询接口（06 只读）
public interface IStripQuery {
    double EdgeLengthM { get; }
    double OwnDepthToY(int side, double ownDepthM);               // 00 §3.6
    IEnumerable<StripElementInfo> CompaniesOf(OrgUnitId battalion);// 连的位置、是否锁定在 Engagement 中
    double EstimatedEnemyTubeRangeM(int side);                     // 按 05 暴露度 ≥ L3 的敌炮兵型号最大射程；不明时返回 DefaultEnemyTubeRangeM
    // 卡车沿直线从 (x1,y1) 到 (x2,y2) 行驶时，每辆车的“预期被毁次数”积分（无量纲，≥0）
    double TruckKillIntegral(int side, double x1, double y1, double x2, double y2, bool isNight);
    LinkCapacityClass BestRoadClassOnEdge { get; }                 // 10 的 Edge.road.routes[0].cls
}
```

#### 4.8.1 位置
- BSA：己方纵深 `ownDepth = clamp(EstimatedEnemyTubeRangeM + BsaStandoffM, BsaMinDepthM, BsaMaxDepthM)`，x = 边长/2。一个旅同时在多个条带上时，每个条带里各有一个 BSA 投影，**共享同一个库存对象**（G-08：条带是抽象空间）。
- 营辎重队 BT：x = 该营在本条带的连的 x 平均；己方纵深 = 连的己方纵深平均 + `BtStandoffM`，再夹在 [平均 + `BtMinStandoffM`, 平均 + `BtMaxStandoffM`]。
- 连补给点：连的位置向己方纵深后移 `CompanyPointStandoffM`。

#### 4.8.2 车队派遣（每个条带步开始）
```text
旅级（BSA → BT），承运 = BrigadeOrganic(b) 中在 BSA 闲置的卡车（按 EquipmentItemId 升序取）：
  对本条带上 b 的每个营 u，计算 needRatio = (BT.maxStockT − BT 库存吨 − 在途到 u 的吨) / BT.maxStockT
  按 needRatio 降序（平局 OrgUnitId 升序），对 needRatio > ConvoyDispatchThreshold 的营：
      loadT = min(BT 缺口吨, BSA 可供吨)
      n = clamp(ceil(loadT / 单车载重), ConvoyMinTrucks, ConvoyMaxTrucks)，且 ≤ 闲置车数；n == 0 → 停止
      装货：按 BT 的物资缺口比例注水（同 §4.5.3）
      新建 SupplyConvoy(state = Loading, stateHoursLeft = ConvoyLoadH)
营级（BT → 连），承运 = BattalionOrganic(u) 中在 BT 闲置的卡车：
  对 u 的每个**未被 Engagement 锁定**的连 k，needRatio = Σ_{k 的班}(fullQty − qty) 吨 / Σ fullQty 吨
  同上规则派车，目标连补给点
```

#### 4.8.3 车队推进（每个条带步，dtH = dtS/3600）
```text
Loading/Unloading：stateHoursLeft −= dtH；到 0 转下一状态（Unloading 结束时把货转入 BT 库存或连的班，§4.8.4）
Outbound/Returning：
  若 policy 生效为 NightOnly 且 目标点己方纵深 < NightOnlyDepthM 且 09.IsNight(tile, now) == false 且 当前在起点：
      state = WaitingForNight（每步重查）
  speedMps = StripConvoySpeedKph[BestRoadClassOnEdge] / 3.6 × (isNight ? NightSpeedFactor : 1)
             × (当前己方纵深 < KillZoneDepthM ? KillZoneSpeedFactor : 1)
  d = min(speedMps × dtS, legLengthM − legProgressM)
  从当前位置沿直线前进 d（legLengthM = 欧氏距离 × StripRoadFactor；位置按比例插值）
  λ = strip.TruckKillIntegral(side, 起点, 终点, isNight) × StripRoadFactor
  p = 1 − DMath.Exp(−λ)
  rng = Rng.For(RngDomain.Logistics, Mix(convoyId) ^ (ulong)stripStepIndex, tick, SaltConvoyLoss)
  对 trucks 按 EquipmentItemId 升序：若 rng.Bernoulli(p) → 该车被击中：
      07.ApplyVehicleHit(itemId, DamageCause.Interdiction)；从车队移除
      货物按该车所占载重比例损失（Outbound 时）
  到达：Outbound → Unloading(ConvoyUnloadH)；Returning → Idle（卡车回到闲置池）
```
- `Auto` 策略：每个条带步计算白天一次往返的预期损失率 `p_rt = 1 − exp(−2 × λ_day_full_leg)`；若 `p_rt > NightOnlyAutoThresholdP` 则本步按 NightOnly，否则 Continuous。
- 被击中的卡车**离散抽样**，货损由被击中车辆决定（与 00 §6.2 一致：击毁是离散事件）。

#### 4.8.4 卸货到连：分配到班
```text
对连 k 收到的每个物资 item 的数量 Q：
  需求_j = fullQty_j[item] − qty_j[item]，j 为 k 的班（只计 >0）
  若 Σ需求 ≤ Q：全部补满，余量回 BT（随返程车）
  否则：按需求比例分配（注水），按 SquadId 升序处理舍入（数量是 double，无舍入问题；显示时向下取整）
弹药型号替代：班需要的型号 m 没有，但车上有同 CaliberGroup 且被该班武器接受的 m'，按 §4.1 规则替代
```

#### 4.8.5 阶段 0 试验场
`ProvingGround` 默认 `InfiniteSupply = true`：班的随身库存在每个片段开始时补满，不跑本节。可切换成 `false` 来检验“营保障连卡车数量”的价值（此时 BSA 视为无限库存，只模拟 BSA→BT→连的车队）。

### 4.9 切断与包围圈（L4）

```text
对国家 c：
  open 图 = §4.2 的图中 capFactor > 0 的弧
  源集合 S0 = c 的所有 Operational 节点中 role ∈ {Depot, Factory, ImportGateway(isOpen)} 的
  从 S0 做 BFS（无容量限制）→ 可达集合 R
  对每个 BSA s：isCutOff = (s 的 GNode ∉ R)
  包围圈：对所有 ∉ R 的 TileRoad 节点做连通分量；pocketId = 分量内最小 tileId 的稳定编号（按出现顺序 1,2,…，每小时重新编号，界面用 tileId 显示）
  被切断的 BSA 仍可以从**同一分量内**的节点（ForwardHub/FieldCache/Depot）取货——§4.5 自然只会找到可达的源
  营的切断：营所在地块 ∉ R 且与其 BSA 不在同一分量 → 该营 isCutOff（只能靠随身库存）
```

**耗尽效果**（每个班独立判断）

| 物资 | 效果 | 实现方 |
|---|---|---|
| 弹药某型号 = 0 | 该型号武器不能开火（`IdleReason.NoAmmo`） | 03 读 `SquadCarriedState` |
| 燃油 = 0 | 该班车辆不能机动：`GetMobilityFactor(squad) = 0`；营的机动系数 = 有油车辆比例（按车辆数），< `ImmobileThreshold` 时营整体不能移动 | 09（地块层）/ 04（条带） |
| 给养 = 0 持续 | `daysWithoutGeneral` 每小时 + 1/24；超过 `GeneralGraceDays` 后，每天：疲劳下限 + `StarvationFatiguePerDay`（03 读 `GetFatigueFloor`）；非战斗减员 `StarvationCasualtyPerDay` 比例（转 07，`CasualtyState.LightWounded`，原因 `NonBattle`） | 03 / 07 |
| 备件 = 0 | 07 的故障不能修复 | 07 |

**包围圈耐久预测**（F6）：
```text
EnduranceDays(pocket, cls) = (Σ 包围圈内所有 BSA/BT/班/节点 的该类库存吨) / (Σ 圈内各旅 rateForPlanning[cls] × 24)
分母为 0 → +∞（显示“—”）
```

### 4.10 威胁与打击效果（`TickPhase 110`）

#### 4.10.1 打击节点
04（地面跨地块火力）/08（空袭）结算出命中后调用 `OnNodeStrike(NodeStrikeEvent e)`：
```csharp
public readonly record struct NodeStrikeEvent(NodeId node, CountryId attacker, WarheadClass warhead, int hits, long timeMs, int sourceEntityId);
```
```text
hardMult  = HardeningStockMult[hardeningLevel]
dispMult  = 1 − DispersionDamageReduction × dispersion
每次命中 h = 1..hits（顺序处理）：
  destroyT = BaseDestroyTPerHit[warhead] × hardMult × dispMult
  从库存按各物资吨位比例扣减 destroyT（弹药批次按比例扣）
  弹药殉爆：p = SecondaryBaseP[warhead] × hardMult × dispMult × (弹药吨 / max(总吨, 1))
           rng = Rng.For(Logistics, nodeId, tick, SaltSecondary + h)；若 Bernoulli(p)：
              弹药库存 × (1 − SecondaryFraction)（批次按比例），记事件“殉爆”
  throughputDamage = min(1, throughputDamage + ThroughputDamagePerHit[warhead] × hardMult × dispMult)
lastStruckAt = now
```
修复（L1，每小时）：若 `now − lastStruckAt ≥ RepairQuietH`，`throughputDamage = max(0, throughputDamage − NodeRepairPerH)`。
节点被**占领**（所在地块控制权转移）：Depot/Factory/FieldCache 库存按 `CaptureFraction` 转给占领方（其余视为被己方破坏），节点 `owner` 改为占领方；ForwardHub 被占领 = 后勤旅已撤离或被消灭，库存同上处理。

#### 4.10.2 打击桥梁/隧道
```csharp
public readonly record struct CrossingStrikeEvent(CrossingId crossing, WarheadClass warhead, int hits, long timeMs, int sourceEntityId);
public sealed class CrossingState { public double capFactor; /*[0,1]*/ public SimTime tempRepairAt; public SimTime fullRepairAt; public bool isTunnel; }
```
```text
每次命中：pDestroy = (isTunnel ? TunnelDestroyP : BridgeDestroyP)[warhead]
         rng = Rng.For(Logistics, crossingId, tick, SaltCrossing + h)；Bernoulli → capFactor = 0
         否则 capFactor = max(0, capFactor − PartialDamagePerHit)
被毁（capFactor == 0）时：tempRepairAt = now + BridgeTempRepairH（此后 capFactor = BridgeTempCapFactor，仅当该路线 cls ≤ Primary）
                        fullRepairAt = now + BridgeFullRepairD × 1440 分钟（此后 capFactor = 1）
修复只在 crossing 所在地块为己方控制时计时；被敌方控制期间暂停
```
费用：11 从年度预算扣 `BridgeRepairCostMusd`（按路线等级），扣不出来时修复暂停（🟡 L-11）。

#### 4.10.3 交通线（LOC）打击：对行驶中卡车
08（无人机/飞机按“打击 → 地块 → 交通线”子目标）、04（远程火力打地块内道路）调用：
```csharp
public double GetTrafficTrucksPerH(CountryId owner, ulong tileId);     // 06 提供：上一小时经过该地块的己方卡车数（阶段1/2 公路货运 ÷ 平均单车载重）
public void OnLocStrike(CountryId victim, ulong tileId, double trucksKilledExpected, long timeMs);
```
```text
OnLocStrike：
  kills = trucksKilledExpected（由 08/04 按出动架次与 GetTrafficTrucksPerH 算出）
  离散化：kInt = floor(kills) + (Bernoulli(frac(kills)) ? 1 : 0)，rng = For(Logistics, tileId, tick, SaltLoc)
  受害卡车归属：按本小时经过该地块的各承运方吨位比例分配（按 CarrierId 升序取整，余数给吨位最大的）
     → 每个承运方随机选 kInt_k 辆卡车（其可用卡车按 EquipmentItemId 升序，用同一 rng 不放回抽取）→ 07.ApplyVehicleHit
  货损：经过该地块的在途 Shipment 按吨位比例共损失 kInt × AvgTruckPayloadT（期望值扣减）
  TileLocThreat(victim, tileId) 更新（风险记忆，供成本函数和绕行）：
     lossObs = kInt × AvgTruckPayloadT / max(本小时经过吨位, AvgTruckPayloadT)
     lossEma ← lossEma + (lossObs − lossEma) × LocThreatEmaAlpha
     capReduction = min(LocMaxCapReduction, lossEma × LocCapReductionPerLoss)   // 车队改夜行、加间距导致的通行能力下降
  每小时无新打击：lossEma × (1 − LocThreatDecayPerH)
arc.lossFraction（每小时 L3）= 到达端地块的 lossEma
```
“路线被切断后，系统自动绕行（有一段延迟）”（§19.9）：成本函数里的 `RiskPenaltyH × lossFraction` 让分配在下一小时自动改走风险低的路线；完全不通（capFactor = 0）时在途货物 Stranded。绕行延迟 = 1 小时分配周期 + Stranded 后重新发货的装车时间，**不另设常数**。

### 4.11 储备目标与 AI 分配（每日，`Calendar`）

```text
对国家 c、陆军物资 item（类 cls）：
  NatRate[item] = Σ_{c 的所有旅 b} StdDay[b][item]                          // 吨或发 / 天
  NatTarget[item] = landDays[cls] × NatRate[item]
对每个战略方向 d：
  mix_d[item] = Σ_{b ∈ d} StdDay[b][item] / Σ_{b ∈ d} Σ_{同类 item'} StdDay[b][item']   // 方向内的型号构成；d 内无旅 → 用全国构成
  DirTarget[d][item] = weight_d × Σ_{同类 item'} NatTarget[item'] × mix_d[item]
  b ∈ d：旅部所在地块的 Region ∈ d.regions；不在任何方向 → 归入“其他”方向（自动存在，权重 = 1 − Σ 其他）
方向内分到仓库：
  depots_d = d 内 Operational 的 Depot（按 NodeId 升序）
  DepotTarget[p][item] = DirTarget[d][item] × capacity_p / Σ capacity
  若某仓库 Σ 目标吨 > 库容：超出部分按比例削减，差额放进“仓容不足”报告，并按路径成本就近分给其他方向的仓库
空中弹药（按枚，D3）：
  airTarget[m] 先分给各机场（§4.5.1 的机场目标），剩余放进路径成本到各机场加权最近的仓库
仓库调拨请求：DepotTarget − stock − inbound > 0 → 阶段 1 P4 请求
```
**缺口报告**（F2，每日）：
```text
DaysCovered[item] = 全国库存[item] / NatRate[item]    （NatRate = 0 → 不报告）
若 DaysCovered < landDays × GapWarnFraction → 通知“按当前编制，<型号> 储备只够 N 天”（N 向下取整）
采购缺口给 11：Shortfall[item] = max(0, NatTarget − 全国库存 − 在途 − 已下订单（11 提供）)
```

### 4.12 进口

```text
11 每小时调用 OnImportArrival(ImportBatch batch)：{supplier, items, availableAt（外部到货时刻由 11 的合同/排队计算）}
06 选口岸：候选 G = owner 的 ImportGateway 中 isOpen 且 externalLeadTimeH 含 supplier 的
  策略（按物资查 importPolicyByMunition，再查 importPolicyByClass，默认 Distributed）：
  Distributed：按 capacityTPerDay 比例拆分
  Fastest：选 (externalLeadTimeH[supplier] + 口岸到“需求重心仓库”的路径小时) 最小的口岸；平局 NodeId
  Safest：选“口岸地块到最近敌控地块的距离（地块中心大圆距离）”最大的口岸；平局 NodeId
  每个口岸当天剩余处理量不足时，溢出给次优口岸（Fastest/Safest 按排序，Distributed 按比例）
  货物进入口岸节点的“待入境”队列，到达时刻 = now + externalLeadTimeH；到达后成为口岸库存，阶段 1 自动送往仓库
口岸开闭（由 11 设置 isOpen/closedReason）：
  transitCountry 的 Relation 有 ArmsEmbargo 或过境国宣布禁止军用物资过境（11 的事件）→ 关闭
  口岸地块被敌控 → 关闭
  Air 口岸：额外受 08 的空域状态影响（阶段 1 简化为 11 事件）
轨距断点：口岸 gaugeBreak = true 时其 capacityTPerDay 已是换装站能力，§4.2.2 的弧另有 GaugeTransferTPerH
```
海港口岸（`externalMode = Sea`）阶段 2 开放。🟡 L-14

### 4.13 保质期与轮换（每日）

```text
shelfLifeY(m) = munition_storage.yaml 中的值；没有则按 MunitionShelfClass 默认（第 5 节）
对每个持有者（节点、BSA、BT、班）的每个弹药 m 批次 year：
  若 currentYear − year ≥ shelfLifeY(m)：该批次报废，从库存删除，计入 ShelfLifeReport（数量、吨、按 11 单价折算金额）
发货、消耗、训练扣减一律 FEFO：先扣最早年份
生产：11 产出的弹药批次年份 = 当前年
开局库存：14 给出年龄分布；没给则在 [startYear − shelfLifeY + 1, startYear] 均匀分布（整数年，余数给最新年份）
仓储费（每年 1 月 1 日结算给 11）：Σ 仓库平均库存吨 × StorageCostMusdPerKtY / 1000 × HardeningCostMult[level]
明年报废预测（F9）：Σ 明年到期批次
```
班随身弹药也按批次记账（`SquadCarriedState` 的弹药用 `StockEntry` 语义，简化：班级不分批次，补给时按 FEFO 从来源批次扣、到班后不再追踪年份；🟡 L-13）。

### 4.14 统计与界面数据（L11）

```text
arcFlowTPerH[arc] = 本小时分配到该弧的吨位
arcFlowEmaPerDay[arc] ← EMA(arcFlowTPerH × 24, α = 1 − 0.5^(1/FlowEmaHalfLifeH))
utilization = arcFlowEmaPerDay / (baseCapTPerH × capFactor × 24)；分母 0 → 显示“切断”
isSaturated = utilization ≥ SaturationWarn
节点：receivedTPerDay、dispatchedTPerDay（EMA），demandTPerDay = Σ 服务对象 rateForPlanning × 24
      daysOfSupply[cls] = stock[cls] / (demandPerDay[cls])；分母 0 → “—”
AAR 计数器（按旅）：noAmmoIdleHours、immobileHours、trucksLost、cargoLostT、substitutedRounds
```

### 4.15 关键节点分析（每日，只读，不改世界状态）

```text
候选（按国家）：本日 arcFlowEma > 0 的弧所依赖的 crossing；有出货的 ForwardHub/Depot/ImportGateway；
               有流量的铁公转运地块；度 ≥ 2 且有流量经过的 TileRoad 节点（作为“地块枢纽”）
稳态需求集 Dss：每个 BSA 的 rateForPlanning × 1h（各物资），每个机场的 ExpectedDailyUse/24
              所有 Depot/Factory/ImportGateway 视为库存无限；承运方用当前运力
基线：在当前 capFactor 下跑 §4.5 的两阶段分配（复制状态），得到各旅送达吨 base_b
对每个候选 x（按 (类型, id) 升序）：
   复制基线状态，把 x 置为不可用（crossing：capFactor=0 并按 §4.2.3 用绕行；节点：删除；地块：删除其所有弧）
   重跑 → got_b
   dropTotal = 1 − Σ got_b / Σ base_b
   按顶层编组（Formation 链上最高一级）分组的 drop
输出前 KeyNodeTopN 个（按 dropTotal 降序，平局按候选 id）
文案模板：“{x} 被摧毁：{n} 个{编组层级}的补给下降 {drop:P0}”，n = drop ≥ KeyNodeGroupThreshold 的顶层编组数
```
12 可对敌方用同一函数（输入它“看到的”敌方网络：只含暴露度 ≥ L3 的节点，§6）。

---

## 5. 常数表

> 全部放在 `data/tuning/06_logistics.yaml`（G-15）。键名 = 下表名称的 snake_case。`confidence` 未注明的均为 `estimated`。

### 5.1 物资与质量

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `PackagingFactor` | 1.35 | — | 1.2–1.6 | 弹药箱、托盘使整发质量增加 20–60%（估计） |
| `DieselDensityKgPerL` | 0.84 | kg/L | 0.82–0.86 | 柴油标准密度（stated, EN 590 范围） |
| `JetFuelDensityKgPerL` | 0.80 | kg/L | 0.775–0.84 | Jet A-1 / TS-1 典型值 |
| `GeneralKgPerPersonDay` | 4.0 | kg/(人·天) | 2.5–8 | 口粮约 1.5–2kg，加医疗、被装、杂项；饮用水就地解决不计（估计） |
| `DefaultPartsUnitMassKg` | 50 | kg | 10–200 | 抽象备件单位；07 定义含义后校准 |
| `PersonnelTransportMassKg` | 150 | kg/人 | 100–200 | 人 + 个人装备 |
| `StandardTruckPayloadT` | 10 | t | 5–20 | 仅用于“几辆车运一个基数”的显示（KamAZ-5350/Ural-4320 级 6–10t） |

### 5.2 随行携带量与标准战时日消耗

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `CarriedAmmoBases` | 1.0 | 基数 | 0.5–1.5 | 定义：每件武器带一个默认基数（§5.1） |
| `CarriedGeneralDays` | 3 | 天 | 1–5 | 单兵 + 车载口粮常见 2–3 日份 |
| `StandardWarDayAmmoBases` | 0.33 | 基数/天 | 0.2–1.0 | 苏式计划常用“进攻日 0.5–1 基数、平均 0.3 左右”（估计）；用于“天数”换算 |
| `StandardWarDayFuelFills` | 0.5 | 油箱/天 | 0.25–1.0 | 机械化部队平均每天半箱（估计） |
| `IdleDutyCycle` | 0.25 | — | 0–1 | 驻止时发动机/发电运转比例 |
| `IdleFuelFactorPerH` | 0.05 | (L/h)/(L/100km) | 0.02–0.1 | 怠速油耗约为百公里油耗的 5%/h |
| `OffroadFuelMultDefault` | 1.6 | — | 1.3–2.5 | 越野油耗上升 |

### 5.3 网络容量与速度（10 给等级，06 给数值）

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `RoadCapTPerH[Motorway]` | 2000 | t/h（单向） | 1000–4000 | 持续军用通行量，计入民用交通、间距、事故（估计；物理上限更高，车辆通常才是瓶颈） |
| `RoadCapTPerH[Primary]` | 800 | t/h | 400–1500 | 同上 |
| `RoadCapTPerH[Secondary]` | 300 | t/h | 150–600 | |
| `RoadCapTPerH[Tertiary]` | 100 | t/h | 50–200 | |
| `RoadCapTPerH[Track]` | 25 | t/h | 10–60 | |
| `RoadConvoySpeedKph[Motorway / Primary / Secondary / Tertiary / Track]` | 50 / 40 / 30 / 20 / 10 | km/h | ±50% | 军用车队平均（含停歇） |
| `RailCapTPerH[ConventionalSingle]` | 600 | t/h | 300–1000 | 单线约 15–25 对列车/日 × 净载 ~1000t（估计） |
| `RailCapTPerH[ConventionalDouble]` | 2000 | t/h | 1000–4000 | |
| `RailSpeedKph` | 30 | km/h | 20–50 | 货运平均旅速（含会让、编组） |
| `RailRoadTransferTPerH` | 300 | t/h/站 | 100–800 | 每个货运站的铁公转运能力 |
| `GaugeTransferTPerH` | 100 | t/h | 30–400 | 换装站（转载或换轮对），口岸数据可覆盖 |
| `GaugeTransferH` | 12 | h | 4–48 | |
| `IntraTileAccessM` | 15000 | m | 5000–25000 | 地块中心到节点/BSA 的平均路程（对边 40km 的一半左右） |
| `TransferHandlingH` | 4 | h | 1–12 | 铁公转运 |
| `NodeHandlingH` | 1 | h | 0.5–3 | 每端装/卸 |
| `UnitHandlingH` | 0.5 | h | 0.25–2 | 部队端卸载 |

### 5.4 承运方

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `CarrierAvailability` | 0.85 | — | 0.6–0.95 | 保养、司机轮休 |
| `RailFleetAvailability` | 0.8 | — | 0.5–0.95 | |
| `FuelInGeneralEfficiency` | 0.8 | — | 0.5–1 | 干货车装油桶的效率 |
| `RailFleetPayloadT(c)`、`NationalTruckPayloadT(c, level)` | 由 14 给出 | t | — | 剧本数据（亚美尼亚铁路规模小，公路池更重要） |

### 5.5 分配算法

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `QuantumFraction` | 0.1 | — | 0.02–0.25 | 越小越公平，越慢 |
| `MinQuantumT` | 1.0 | t | 0.1–10 | |
| `MaxRoundsPerTier` | 50 | 轮 | 10–200 | 安全上限 |
| `EpsT` | 0.01 | t | — | 数值阈值 |
| `RiskPenaltyH` | 200 | h/（损失比例 1.0） | 50–1000 | 1% 预期货损 ≈ 多走 2 小时 |
| `SafestRiskMult` | 10 | — | 3–30 | |
| `BsaTargetH` | 48 | h | 24–96 | 旅保障区保持约 2 天 |
| `BsaBaseStockT` | 600 | t | 200–2000 | 地面堆放上限（不含车上） |
| `BtStockFactor` | 1.0 | — | 0.5–1.5 | BT 库存 = 营卡车载重 × 系数 |
| `HubTargetH` | 72 | h | 24–168 | |
| `HubFloorT` | 500 | t | 0–2000 | |
| `AirbaseTargetDays` | 3 | 天 | 1–10 | §5.2 示例“3 天” |
| `RateEmaHalfLifeH` | 12 | h | 4–48 | |

### 5.6 条带车队

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `BsaStandoffM` | 5000 | m | 0–10000 | BSA 在敌身管火炮射程外（§19.2） |
| `BsaMinDepthM` / `BsaMaxDepthM` | 20000 / 35000 | m | — | §19.3 ✅ |
| `DefaultEnemyTubeRangeM` | 25000 | m | 15000–40000 | 152/155mm 普通弹 |
| `BtStandoffM`、`BtMinStandoffM`、`BtMaxStandoffM` | 3000 / 2000 / 5000 | m | — | §19.2 |
| `CompanyPointStandoffM` | 500 | m | 200–1000 | §19.2 |
| `StripRoadFactor` | 1.3 | — | 1.1–1.8 | 道路曲折 |
| `StripConvoySpeedKph[Motorway…Track]` | 40 / 35 / 25 / 18 / 10 | km/h | ±50% | 战区内灯火管制、规避 |
| `NightSpeedFactor` | 0.7 | — | 0.4–1 | |
| `KillZoneDepthM` | 15000 | m | 5000–25000 | §19.2：最后 10–20km 是杀伤区 |
| `KillZoneSpeedFactor` | 0.7 | — | 0.4–1 | |
| `NightOnlyDepthM` | 15000 | m | 5000–25000 | |
| `NightOnlyAutoThresholdP` | 0.02 | — | 0.005–0.1 | 白天一次往返预期损失 > 2% 时改夜行 |
| `ConvoyMinTrucks` / `ConvoyMaxTrucks` | 2 / 20 | 辆 | — | |
| `ConvoyDispatchThreshold` | 0.25 | — | 0.05–0.5 | 缺口达到 25% 才派车 |
| `ConvoyLoadH` / `ConvoyUnloadH` | 0.5 / 0.5 | h | 0.25–2 | |

### 5.7 切断

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `GeneralGraceDays` | 2 | 天 | 1–5 | §19.9“几天以后” |
| `StarvationFatiguePerDay` | 0.1 | /天 | 0.05–0.3 | 疲劳下限上升 |
| `StarvationCasualtyPerDay` | 0.005 | /天 | 0.001–0.02 | 非战斗减员 |
| `ImmobileThreshold` | 0.5 | — | 0.3–0.8 | 有油车辆比例低于此营不能机动 |
| `FieldCacheLifetimeH` | 168 | h | 24–720 | 无人管理的临时堆放点一周后视为散失 |

### 5.8 打击

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `BaseDestroyTPerHit[Small / Medium / Large]` | 5 / 40 / 150 | t | ×0.3–×3 | 估计；殉爆另算 |
| `SecondaryBaseP[Small / Medium / Large]` | 0.02 / 0.15 / 0.30 | — | 0–0.6 | 估计；2022 萨基、2023 多个前沿弹药库殉爆案例说明露天集中堆放风险高 |
| `SecondaryFraction` | 0.3 | — | 0.1–0.8 | 殉爆毁掉该节点弹药的比例 |
| `HardeningStockMult[0..3]` | 1.0 / 0.6 / 0.25 / 0.05 | — | — | 露天/掩体/加固/地下 |
| `HardeningCostMult[0..3]` | 1.0 / 1.3 / 2.0 / 4.0 | — | — | 仓储费倍率 |
| `DispersionDamageReduction` | 0.7 | — | 0.3–0.9 | |
| `DispersionThroughputPenalty` | 0.4 | — | 0.1–0.6 | §19.5 分散的代价 |
| `DispersionHandlingPenalty` | 1.0 | — | 0.2–2 | 分散后装卸时间最多翻倍 |
| `DispersionChangeH` | 24 | h | 6–72 | |
| `ThroughputDamagePerHit[Small / Medium / Large]` | 0.02 / 0.10 / 0.25 | — | — | |
| `RepairQuietH` | 6 | h | 1–24 | |
| `NodeRepairPerH` | 0.01 | /h | 0.002–0.05 | |
| `CaptureFraction` | 0.3 | — | 0–0.8 | 撤退方来不及运走/破坏的比例 |
| `BridgeDestroyP[Small / Medium / Large]` | 0.02 / 0.25 / 0.5 | — | — | 每次命中 |
| `TunnelDestroyP[…]` | 0 / 0.05 / 0.15 | — | — | 隧道难以彻底摧毁，多为入口封堵 |
| `PartialDamagePerHit` | 0.2 | — | 0.05–0.5 | |
| `BridgeTempRepairH` | 72 | h | 24–240 | 工兵便桥/浮桥 |
| `BridgeTempCapFactor` | 0.3 | — | 0.1–0.6 | |
| `BridgeFullRepairD` | 60 | 天 | 14–365 | |
| `AvgTruckPayloadT` | 8 | t | 5–15 | LOC 打击换算 |
| `LocThreatEmaAlpha` | 0.5 | — | 0.1–1 | |
| `LocThreatDecayPerH` | 0.05 | /h | 0.01–0.2 | |
| `LocCapReductionPerLoss` | 5 | — | 1–20 | 观察到 10% 损失 → 通行能力 −50% |
| `LocMaxCapReduction` | 0.7 | — | 0.3–0.9 | |

### 5.9 储备、保质期、界面

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `ShelfLifeY[SmallArms / UnguidedGunMortar / UnguidedRocket / Guided]` | 25 / 20 / 15 / 12 | 年 | ±50% | 估计；制导弹药受电池、发动机药柱、电子件限制 |
| `StorageCostMusdPerKtY` | 0.5 | 百万美元/(千吨·年) | 0.1–2 | 估计（$500/t/年） |
| `GapWarnFraction` | 0.5 | — | 0.2–1 | 低于目标一半时提醒 |
| `FlowEmaHalfLifeH` | 12 | h | 6–48 | |
| `SaturationWarn` | 0.9 | — | 0.7–1 | §19.10“接近饱和标红” |
| `KeyNodeTopN` | 10 | — | 5–30 | |
| `KeyNodeGroupThreshold` | 0.1 | — | 0.05–0.3 | 下降 ≥10% 才计入“n 个集团军” |
| `StorageConditionDecayPerY` | 0.03 | /年 | 0.01–0.1 | 阶段 2+ |
| `HubDeployH` / `HubPackH` | 24 / 12 | h | 6–72 | §4.16 |
| `HubStorageT` / `HubThroughputTPerH` | 3000 / 250 | t、t/h | ×0.3–×3 | 每个后勤旅（基准规模），按其卡车载重线性缩放：× (旅载重 / 1000t) |
| `DepotBuildYears` | 3 | 年 | 1–6 | §19.5“新建要好几年” |

### 5.10 RNG salt（`RngDomain.Logistics = 6`）

| 名称 | 值 | 用途 |
|---|---|---|
| `SaltConvoyLoss` | 1 | 条带车队卡车损失 |
| `SaltSecondary` | 100（+命中序号） | 节点殉爆 |
| `SaltCrossing` | 200（+命中序号） | 桥梁摧毁 |
| `SaltLoc` | 300 | LOC 打击取整与选车 |

### 4.16（补）前进后勤中心展开与转移
（放在常数表后以便引用常数；属于第 4 节算法。）
```text
命令 DeployHub(logBrigade, tile)：条件 = tile 己方控制 且（tile.hasRailFreightTerminal 或 存在 cls ≥ Primary 的 Road 边接入该 tile）
   后勤旅移动到 tile（09 的地块层移动）→ 到达后 state = Deploying，stateUntil = now + HubDeployH
   → Operational：创建 LogisticsNode(role=ForwardHub, storageCapacityT = HubStorageT × scale, throughputTPerH = HubThroughputTPerH × scale)
命令 MoveHub(logBrigade, newTile)：state = Packing（stateUntil = now + HubPackH，吞吐为 0）
   Packing 结束：库存 ≤ 该后勤旅干货+液货载重 → 全部随车；否则超出部分在原地块生成 FieldCache
   后勤旅移动 → 到达后 Deploying → Operational（库存转入新节点）
后勤旅在移动中被打：按普通营处理（09/04/08），损失的卡车与车上库存同比例损失
```

---

## 6. 与其他系统的接口

### 6.1 06 提供的 API

| 函数 | 调用者 | 时机 | 说明 |
|---|---|---|---|
| `AmmoBasis ComputeBasis(FormationId)` / `AmmoBasisView BasisForTemplate(templateId, bindings, composition)` | 01 编辑器、13、11 | 按需 | §4.1 |
| `void InitCarriedLoad(SquadId, double fillFraction)` | 14 开局、07 新建班 | 创建时 | 按 `fullQty × fill` 填充 |
| `bool TryConsume(SquadId, ItemKey, double qty, out double got)` | 03（开火）、04、08（地面防空拦截弹） | 每次消耗 | 不足时 got < qty；自动尝试 CaliberGroup 替代由调用方决定（03 传入可接受列表） |
| `void ReportConsumption(OrgUnitId battalion, ItemKey, double qty)` | 03/04/07 | 消耗后 | 供消耗率 EMA |
| `double GetAvailable(SquadId, ItemKey)` | 03 | 每步 | 只读 |
| `double GetMobilityFactor(OrgUnitId battalion)` / `(SquadId)` | 09、04 | 每移动步 | §4.9 |
| `double GetFatigueFloor(SquadId)` | 03 | 每步 | 给养断绝 |
| `bool TryDrawFromNode(NodeId, ItemKey, double qty, out double got)` | 08（机场挂弹）、02（训练，FEFO） | 按需 | 机场挂载从机场节点扣 |
| `bool TryDrawParts(OrgUnitId battalion, int modelHandle, double qty, out double got)` / `bool TryDrawParts(FormationId brigade, int modelHandle, double qty, out double got)` | 07（修理，07 H-07） | 每小时 `DamageRepair` | 从营辎重队（`BattalionTrains.stock`）或旅保障区（`BrigadeSupportArea.stock`）扣 `ItemKey(SupplyClass.SpareParts, modelHandle)`；单位 = 07 §3 定义的“备件单位”；不足时 got < qty，返回 `got ≥ qty` |
| `void ReturnToNode(NodeId, ItemKey, double qty)` | 08（降落时退回未消耗的挂载弹药，08 A-14） | 降落时（`AirStep`） | 加回该节点 `Stockpile`；弹药批次年份记为当年（简化）；超出 `storageCapacityT` 也照常入库（与 FieldCache 溢出规则无关） |
| `double ConsumeForTraining(FormationId, ItemKey, double qty)` | 02 | 每小时 | 从该编组所在方向的仓库（Depot，NodeId 升序）按 FEFO 扣；不足就少扣。**返回值 = 实际扣到的数量**（0 ≤ 返回值 ≤ qty），02 据此折算训练效果（02 P-18） |
| `void AddProduced(NodeId factory, ItemKey or EquipmentModel, double qty)` | 11 | `Calendar` 时 | 产出入库（批次年份 = 当年） |
| `void OnImportArrival(ImportBatch)` | 11 | 每小时 | §4.12 |
| `Shortfall GetProcurementShortfall(CountryId)` | 11、12 | 每日 | §4.11 |
| `double GetAnnualStorageCostMusd(CountryId)` | 11 | 年度 | §4.13 |
| `void RequestTransport(ReplacementRequest)` | 07 | 按需 | 补充装备/兵员运输，返回预计到达时刻；到达时回调 07 `OnReplacementDelivered` |
| `void OnNodeStrike(NodeStrikeEvent)` / `OnCrossingStrike(CrossingStrikeEvent)` / `OnLocStrike(...)` | 04、08 | `GroundEventApply` | §4.10 |
| `double GetTrafficTrucksPerH(CountryId, ulong tile)` | 04、08 | 结算 LOC 打击前 | §4.10.3 |
| `void StripLogistics.Step(...)` | 04 | `StripStep` | §4.8 |
| `UnitSupplyView`、`NodePanelView`、`FlowMapView`、`KeyNodeReport`、`ConvoyView`、`ReserveGapReport`、`ShelfLifeReport`、`ImportView`、`CarrierView` | 13 | 界面刷新 | 只读视图 |
| `KeyNodeReport AnalyzeKeyNodes(CountryId owner, NetworkView view)` | 12 | 每日 | 对敌方：view 只含其暴露度 ≥ L3 的节点和已知的路网 |
| `IEnumerable<LogisticsNode> NodesInTile(ulong tile)` | 05（特征值）、08/04（目标选择） | 按需 | 节点作为目标；特征值由 05 按 `storage/dispersion/hardening` 计算 |

### 6.2 06 需要的输入

| 来源 | 数据 | 用途 |
|---|---|---|
| 00/10 | `Tile`、`Edge`（`RoadLink.routes`、`RailLink`、`crossings`、`bypass`）、`hasRailFreightTerminal`、`Region` | §4.2 |
| 01 | 编制树、`EquipmentItem`、`EquipmentModel.massKg`、`TemplateRole`、`Formation.echelon` | 卡车统计、基数 |
| 03 | `WeaponProfile.defaultLoad`、`munitions`；`MunitionProfile.roundWeightKg`、`caliberGroup`、`shelfClass`、`warheadKg`（03 §3.1；`shelfClass = None` 时用 06 的 `munition_storage.yaml`） | §4.1 |
| 04 | `IStripQuery`、地面跨地块火力命中事件 | §4.8、§4.10 |
| 05 | 敌炮兵型号的暴露度（`EstimatedEnemyTubeRangeM` 内部用） | BSA 位置 |
| 07 | `IsLost(item)`、`ApplyVehicleHit`、`StandardWarDayPartsRate`、补充请求 | |
| 08 | `ExpectedDailyUse(airbase, item)`、空袭命中事件、LOC 打击 | §4.5.1、§4.10 |
| 09 | `TileControl`、`IsNight(tile, time)`、上一小时行驶距离、EdgeBattle 活跃集合 | |
| 11 | 产出、进口批次、口岸开闭、动员等级、预算可用性、已下订单 | |
| 12 | BSA 所在地块、独立营的保障旅指定、后勤中心 AI 布局（AI 国家） | |
| 14 | 节点种子、开局库存与年龄分布、`RailFleetPayloadT`、`NationalTruckPayloadT`、战略方向预设 | |

### 6.3 数据文件（本文件定义 schema）

```yaml
# data/scenarios/<剧本>/logistics_nodes.yaml（14 填数，06 定义 schema）
nodes:
  - id: arm_depot_goris           # 示例，位置/容量需 14 按公开资料核实
    owner: ARM
    role: depot                   # depot | forward_hub | airbase | factory | import_gateway | industry_node
    lat_deg: 39.51
    lon_deg: 46.34
    storage_capacity_t: 8000
    throughput_t_per_h: 150
    hardening_level: 1
    dispersion: 0.3
    has_rail_access: false
    confidence: estimated
  - id: arm_gateway_bagratashen
    owner: ARM
    role: import_gateway
    lat_deg: 41.24
    lon_deg: 44.82
    gateway: { external_mode: road, transit_country: GEO, capacity_t_per_day: 3000,
               gauge_break: false, external_lead_time_h: { RUS: 48 } }
# data/logistics/munition_storage.yaml
munitions:
  - id: m795_155mm_he
    shelf_class: unguided_gun_mortar
    shelf_life_y: 20          # 可选，覆盖默认
# data/logistics/caliber_groups.yaml、data/logistics/mobility_defaults.yaml（按类别默认 MobilityProfile）
```

---

## 7. 边界情况

1. **除零**：`cycleH` 理论上 ≥ 2×`NodeHandlingH` > 0；`NatRate = 0` 不报告；`daysOfSupply` 分母 0 显示“—”；`Σ capacity = 0`（方向内无仓库）→ 该方向目标全部转“仓容不足”并分给其他方向。
2. **空集合**：国家没有后勤旅 → 阶段 2 只能靠旅自取（`BrigadeOrganic`）；没有任何源 → 所有请求 exhausted，不报错。没有 BSA 的旅（全灭只剩旅部）→ 不生成请求。
3. **单位全灭**：营全灭 → 其 BT 库存转入 BSA（若可达）否则在原地生成 FieldCache；旅保障营全灭 → BSA 库存保留但 `BrigadeOrganic` 运力为 0（只能靠 §4.7 停止，条带车队停止）。
4. **同一小时节点被毁又有货要发**：`GroundEventApply`（110）在 `Logistics`（40）之后执行，所以本小时的分配用的是打击前的状态；货已发出（在途），按 §4.4 下一小时处理。
5. **两条请求同时争最后一点容量**：轮转顺序固定（§4.5.3 全序），可复现。
6. **FieldCache 在包围圈内**：可被圈内单位取用（阶段 2 源）；过期后删除（视为散失）。
7. **口岸全部关闭**：进口批次在供应国侧排队（11 维护），06 不接收。
8. **库容不足**：到货超过目的地库容 → 超出部分在同地块转 FieldCache，并发通知。
9. **库存为负**：所有扣减先 `Math.Min(qty, available)`；断言 `quantity ≥ −1e-9`，小于 0 时夹到 0 并记录调试警告。
10. **ItemKey 型号不存在**（存档版本升级删除了型号）→ 加载时把库存转给同 CaliberGroup 的第一个型号；无组则丢弃并记日志。
11. **前线移动导致 BSA 地块被占领**：BSA 立即移动到 12 指定的新地块（若 12 未指定：沿旅部撤退方向的第一个己方地块），库存超出 `BrigadeOrganic` 载重的部分留下变 FieldCache（随后被占领方缴获）。
12. **条带上 BSA 投影位置 > 条带边界**：夹到 ±40km 内。
13. **车队目标连在途中进入 Engagement 被锁定**：车队到达后等待（Unloading 不开始），每步重查；锁定超过 1h 则转去该营 BT 卸货。
14. **燃油自身的运输消耗**：不计（简化，卡车燃油视为承运方内部消耗）。🟡 L-03 附注
15. **性能**（阶段 2）：请求数 ~ 旅数 × 4；MVP ~ 30 旅 → ~120 请求 × 10 轮 × Dijkstra(~300 节点) ≈ 毫秒级。阶段 2 若 > 1000 请求，允许按方向把图拆成子图（不跨方向的请求只在子图里搜），结果必须与整图一致（测试覆盖）。

---

## 8. 测试用例

> 除注明外，常数取第 5 节初始值。

**T1 弹药基数（手算）**
旅：10 辆坦克，默认基数 = 穿甲弹 20 发（每发 20kg）+ 榴弹 20 发（每发 30kg）；6 门榴弹炮，默认 40 发（每发 45kg）。
- 坦克：10 × (20×20 + 20×30) = 10 000 kg；炮：6 × 40 × 45 = 10 800 kg；合计 20 800 kg × 1.35 = **28.08 t**。
- `trucksToCarry = ceil(28.08 / 10) = 3`。
- 若把 2 门炮报告为 Destroyed：炮 4 × 1800 = 7200 → (10 000 + 7200) × 1.35 = **23.22 t**。

**T2 承运方吨·时（手算）**
后勤旅 120 辆卡车 × 10t × 0.85 = 1020 t 可用；前进中心到 BSA 路程 90km，Secondary 公路（30 km/h），mountainFactor = 1，分散度 0。
- 单程 3h；`cycleH = 2×3 + 2×1 = 8h`；每小时可发 1020/8 = **127.5 t/h**（= 3060 t/天）。
- 若分散度 = 1：`NodeHandlingH` 有效值 = 2h → cycle = 6 + 4 = 10h → **102 t/h**。

**T3 层内公平（手算）**
同一层（P1）两个请求：A（汇点 index 小）100t、B 50t；唯一源有 90t，其余不受限。quantum：A = 10、B = 5。
- 每轮 A +10、B +5；6 轮后 A = 60、B = 30，源耗尽。结果 **A = 60t，B = 30t**（2:1，与需求成比例）。

**T4 优先级（手算）**
一条公路弧容量 100 t/h；P0 请求 80t、P3 请求 80t，同一源，库存充足，承运方充足。
- P0 先分完 80t；剩余容量 20 → P3 得 **20t**。

**T5 拉钦走廊稳态（手算，供 V3 对照）**
戈里斯前进中心 → 斯捷潘纳克特 BSA：85km，路线等级 Primary，mountainFactor = 0.6。
- 速度 = 40 × 0.6 = 24 km/h；单程 = 3.542h；cycle = 7.083 + 2 = **9.083h**。
- 弧容量 = 800 × 0.6 = **480 t/h**（单条路线）。
- 需求 1200 t/天 = 50 t/h → 需要载重 50 × 9.083 = 454.2t → 卡车 454.2 / (10 × 0.85) = 53.4 → **54 辆**。
- 结论：道路容量是需求的 9.6 倍，瓶颈是“只有一条路”和卡车数量，不是通行能力。

**T6 切断耐久（手算）**
被切断的营：随身弹药 = 1 基数 = 30t，战斗中消耗 rateEma = 0.5 基数/天 = 15 t/天；BSA 同分量内有 45t 弹药，同圈内另有 2 个同样的营。
- 圈内弹药 = 3 × 30 + 45 = 135t；消耗 = 3 × 15 = 45 t/天 → `EnduranceDays = 3.0` 天。
- 给养：每营 500 人，随身 3 天，BSA 无给养 → 3 天后给养 = 0，再过 `GeneralGraceDays` = 2 天（即第 5 天起），疲劳下限每天 +0.1，每天减员 0.5%（每营 2.5 人/天）。

**T7 节点打击（确定性部分手算）**
仓库库存 10 000t（弹药 6000t、燃油 4000t），加固等级 2，分散度 0；2 次 Medium 命中。
- `destroyT` 每次 = 40 × 0.25 × 1 = 10t，按比例：弹药 −6t、燃油 −4t；两次后弹药 5988t、燃油 3992t。
- 殉爆 p（第 1 次）= 0.15 × 0.25 × 1 × (6000/10000) = **0.0225**；若抽中，弹药 × 0.7。
- `throughputDamage` = 2 × 0.10 × 0.25 = **0.05**。
- 测试固定 `worldSeed`，断言殉爆结果与 RNG 给出的序列一致（15 提供固定种子的期望序列）。

**T8 保质期 FEFO（手算）**
某 Guided 弹药（12 年）批次：2005 年 100 枚，2010 年 200 枚。
- 2017-01-01 日检：2017 − 2005 = 12 ≥ 12 → 2005 批报废 100 枚。剩 2010 批 200。
- 另一情形（2016 年，无报废）消耗 150：先扣 2005 的 100，再扣 2010 的 50 → 剩 2010 批 150。

**T9 桥梁被毁与绕行（手算）**
边 e 唯一路线：Primary，mountainFactor 1.0，依赖桥 X；bypass(X) = Tertiary，mountainFactor 0.8，长度 +40%。
- 正常：容量 800 t/h，速度 40 km/h。
- X 被毁：容量 = 100 × 0.8 + 0 × 800 = **80 t/h**；速度 = 20 × 0.8 = 16 km/h。
- 72h 后便桥：容量 = 80 + 0.3 × 800 = **320 t/h**；速度取能力更大的那条（原路线 320×… 规则：k=0 用容量较大者的速度 → 原路线 240 t/h vs 绕行 80 t/h → 用原路线速度 40 km/h）。

**T10 进口分散（手算）**
两个开放口岸：G1 300 t/天、G2 100 t/天，策略 Distributed，批次 200t。
- G1 = 150t、G2 = 50t。若 G2 当天已用 80t（剩 20t）：G2 = 20t，溢出 30t 给 G1 → **G1 = 180t、G2 = 20t**。

**T11 确定性**：同一存档、同一命令序列跑 72 小时两次，所有节点库存、Shipment 列表、车队损失逐位相同；把 `Dictionary` 遍历顺序人为打乱（测试钩子）结果不变。

---

## 9. 验证建议（Python）

**V3：后勤（本文件主导）** —— 脚本 `tools/validation/v3_logistics.py`，读 10 的 MVP 输出（`data/map/nk/`）与 14 的节点种子，用 `networkx` 复现 §4.5 的分配算法（同样的全序、同样的常数，读 `data/tuning/06_logistics.yaml`）。

1. **拉钦走廊吞吐 vs 需求**
   - 输入：戈里斯（或前进中心）→ 斯捷潘纳克特的实际路径（10 输出的 Edge 链），需求按三档强度：低（无战斗，给养+怠速 ≈ 200 t/天）、中（≈ 700 t/天）、高（≈ 1500 t/天）。（需求数字由 14 的 2020 开局部队按 §4.3 公式算出；上面是量级预期。）
   - 输出：所需卡车数、弧利用率、和 T5 手算一致（误差 < 1%）。
   - 期望：道路容量不成为瓶颈（利用率 < 40%）；卡车数在亚美尼亚可用后勤运力的量级内。若利用率 > 80%，检查 10 的 mountainFactor 是否过低。
2. **切断耐久**
   - 删掉拉钦路线（2020 年开局时 2017 年开通的瓦尔德尼斯—马尔塔克特公路是否作为第二通道，按 10 的 dated override 两种情况各跑一次）。
   - 输出：每类物资的耐久天数曲线；对比“只有拉钦”与“拉钦 + 瓦尔德尼斯—马尔塔克特”的差别。
   - 期望：只有拉钦时切断即全面切断，耐久 = 圈内库存 / 消耗（3–7 天量级，取决于 14 的开局库存）；有第二通道时供应下降 ≤ 该通道容量所能弥补的比例。
3. **关键节点分析合理性**
   - 对亚美尼亚方：期望拉钦路线上的地块枢纽（或哈卡里河桥，若 10 识别为 crossing）排第 1，`dropTotal` > 0.8（纳卡方向）。
   - 对阿塞拜疆方：期望没有任何单点 `dropTotal` > 0.5（铁路 + 多条公路冗余）；叶夫拉赫、甘贾一带铁路枢纽应进前 5。
   - 对亚美尼亚全国进口：期望格鲁吉亚方向口岸（巴格拉塔申等）与伊朗方向（阿加拉克/梅格里）口岸互为冗余；关闭格鲁吉亚过境后进口能力下降比例 = 格鲁吉亚口岸容量占比。
4. **公平与确定性**：随机生成 1000 个小图（20 节点、10 请求），Python 与 C# 实现结果逐项比对（容差 1e-9）。
5. **规模基准**：阶段 2 规模（700 地块、200 旅）单小时分配耗时 < 20 ms（C#）。

与其他验证项的关系：V1–V2（03/04 的战斗与条带）提供的弹药消耗率用于校准 `StandardWarDayAmmoBases`；V5（若计划中为纳卡 2020 历史校验）需要本文件的切断效果。

---

## 10. 待确认决策

| 编号 | 决策 | 🟡 建议 | 理由 | 备选 |
|---|---|---|---|---|
| L-01 | 网络流算法 | 优先级分层 + 层内轮转配额 + 反向 Dijkstra 找最便宜可行源（贪心，非精确最小费用流） | 多商品流精确解要 LP；贪心确定、可解释、毫秒级 | 每层用单商品 SSP 最小费用流（按吨，忽略型号）后再按型号拆；或调用 LP 库 |
| L-02 | 阶段顺序 | 每小时先算作战级（节点→BSA），再算国家级；都用本小时开始时的库存 | 前线优先占公路容量；避免同一小时内多次转运 | 一次性联合求解 |
| L-03 | 承运方模型 | “吨·时预算”：每小时可发吨位 = 可用载重 ÷ 往返小时；不模拟单车，不计卡车自身油耗 | 公式透明（F8），直接把“卡车数量”变成决策 | 显式模拟每支车队（只在条带上做） |
| L-04 | 国家公路运力池 | 设 `NationalRoad` 池（中央汽车运输部队 + 动员民用车），大小由剧本和动员等级决定 | 总纲 §19.8 只写铁路、海运；亚美尼亚几乎全靠公路，没有这一池就无法从仓库到前进中心 | 不设，国家级只有铁路；公路段一律由后勤旅承担 |
| L-05 | 在途货物与滞留 | 货物按路径逐弧推进；前方断路 → 在当地变 `FieldCache`（新增 `NodeRole.FieldCache = 8`） | 切断的时间效果真实可见；不需要“退回”规则 | 发货即到（无在途）；断路货物退回源头 |
| L-06 | 优先级分层 | P0 战斗中旅的弹药/燃油；P1 战斗中旅的其他、低库存旅；P2 机场/前进中心/手动调拨；P3 其他旅；P4 仓库调拨；空陆优先由 D12 改变机场所在层 | §5.2 要求空军调拨与陆军争运力并可干预 | 统一按缺口比例分配不分层 |
| L-07 | 条带末段 | 显式车队（旅：BSA→BT；营：BT→连），卡车损失离散抽样，`NightOnly/Auto` 策略 | §19.3 要求条带上看得见卡车往返和损耗；§19.2 夜间补给教训 | 连续流量 + 期望损失（不显示车队） |
| L-08 | 随行携带量 | 1 个基数、满油箱、3 天给养 | 与“基数”定义一致 | 按模板可调（班模板加 `carried_bases` 字段） |
| L-09 | 切断效果数值 | 给养断 2 天后疲劳下限 +0.1/天、减员 0.5%/天；有油车 < 50% 营不能机动 | §19.9 只给定性 | 给养断即开始累积 |
| L-10 | 空运/空投补给 | 阶段 1 不做；接口预留（`AirSupplyDelivery` → 作为一个临时 FieldCache 入库） | 纳卡 2020 双方都没有在无人机威胁下大规模空投；减少 08 工作量 | 阶段 1 做简化版（运输机/直升机按架次运吨位到机场或着陆场） |
| L-11 | 打击伤害模型与修复费用 | 按战斗部等级给“每次命中毁吨数 + 殉爆概率”；桥梁按命中概率摧毁，72h 便桥、60 天全修；修复费用由 11 扣 | 简单、可调；殉爆体现“集中堆放”风险 | 按战斗部质量连续函数；不设便桥 |
| L-12 | 前进中心展开/转移 | 展开 24h、打包 12h；超出车载能力的库存留作 FieldCache；规模按后勤旅卡车载重缩放 | §19.5“展开和转移都要时间” | 固定规模；转移时库存全部自动随行 |
| L-13 | 弹药批次 | 节点、BSA、BT 按生产年份记批次，FEFO；班级不记批次 | 保质期要能算；班级记批次数据量大、无决策价值 | 全部不记批次，按“平均年龄”近似 |
| L-14 | 进口口岸 | 阶段 1：陆路（公路/铁路）+ 空运口岸；过境国可以关闭口岸；海港阶段 2 | §19.6；纳卡战争中格鲁吉亚曾宣布禁止军用物资过境 | 阶段 1 也开放里海港口（巴库/阿拉特） |
| L-15 | 战略方向定义 | 方向 = 一组 Region（10），玩家可编辑；不在任何方向的归“其他” | Region 已是补给/行政单位（§9.3） | 方向 = 罗盘方位扇区 |
| L-16 | 基数与储备天数 | 全国储备以“天”为主（§19.7 ✅）；旅界面显示等效基数（天 × 0.33）；旅只决定配比 | §5.1 的“按旅采购几个基数”与 §19.7 冲突，按天统一更符合“玩家定囤多少” | 以“每旅 N 个基数”为主，天数只显示 |
| L-17 | 独立营补给 | 挂靠 12 指定或最近的旅 BSA；都没有时用自己的卡车直接从节点自取 | 规则简单、离主力远自然吃亏 | 独立营不可补给（只能随身） |
| L-18 | `MobilityProfile` 归属 | 整体归 06（采纳 G-17） | 油耗、载重与后勤强相关 | 速度归 09 |
| L-19 | 补充装备/兵员的运输 | 走同一网络（`CargoKind`），占运力，不进 `Stockpile` | §19.6“兵员和补充装备也占运力” | 补充瞬时到达，只扣时间 |
| L-20 | 封存基地 | 阶段 2+；阶段 1 只留结构 | 纳卡双方封存规模小 | 阶段 1 简化实现 |
| L-21 | 关键节点分析 | 每天一次、稳态需求、源视为无限、只读 | 衡量“网络能力”而非库存；不影响确定性 | 每小时；按实际库存 |
| L-22 | 前线边不能走补给 | 有活跃 EdgeBattle 的边，双方补给弧容量为 0 | 前线不能穿越；简单 | 按推进度部分开放 |
| L-23 | BSA 多条带投影 | 一个旅在多个条带上时，各条带里各有一个 BSA 投影，共享库存 | 与 G-08 一致 | BSA 只出现在主条带上 |
| L-24 | `MunitionProfile` 字段请求 | 请 03 在 `MunitionProfile` 加 `caliberGroup`、`shelfClass`；在此之前用 06 的数据文件 | 字段归属 03 | 全部放 06 数据文件 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 临时堆放点 | `NodeRole.FieldCache`（= 8） | 断路滞留、库容溢出、转移遗留的货物形成的临时节点；无人看管，一定时间后散失；可被缴获 | 06 |
| 物资键 | `ItemKey` | (物资大类, 句柄)：弹药按型号、备件按装备型号、燃油按油种 | 06 |
| 油种 | `FuelType` | `Diesel, JetFuel` | 06 |
| 承运方 / 运力池 | `CarrierPool` / `CarrierKind` | 国家铁路、国家公路、后勤旅、旅属、营属卡车的运力；以“吨·时”预算计 | 06 |
| 吨·时预算 | （规则） | 承运方每小时可发吨位 = 可用载重 ÷ 往返小时 | 06 |
| 在途货物 | `Shipment` | 已发出、沿路径逐弧推进的货物 | 06 |
| 条带补给车队 | `SupplyConvoy` / `ConvoyState` | 条带上 BSA→BT、BT→连往返的卡车组 | 06（逻辑）/ 04（调用） |
| 补给请求 | `SupplyRequest` | 每小时生成的 (汇点, 物资大类) 需求 | 06 |
| 补给优先层 | `SupplyPriorityTier` | `P0`–`P4` | 06 |
| 空陆运力优先 | `AirLandPriority` | `Balanced, AirFirst, LandFirst` | 06 |
| 前沿补给方式 | `ForwardResupplyPolicy` | `Auto, Continuous, NightOnly` | 06 |
| 班随身库存 | `SquadCarriedState` | 班的弹药/燃油/给养实际数量与满载参考；`CarriedLoad` 的落地 | 06 |
| 战略方向 | `StrategicDirection` | 一组 Region + 权重；`StrategicDirectionWeight` 的载体 | 06 |
| 前置命令 | `PrepositionOrder` | 把弹药提前推到某方向或机场 | 06 |
| 交通线威胁 | `TileLocThreat` | 某国在某地块上观察到的卡车/货物损失率（EMA）与通行能力下降 | 06 |
| 打击事件 | `NodeStrikeEvent` / `CrossingStrikeEvent` | 04/08 交给 06 的命中事件 | 06 |
| 战斗部等级 | `WarheadClass` | `Small (<50kg)`、`Medium (50–250kg)`、`Large (>250kg)` | 06（03/08 填） |
| 保质期分类 | `MunitionShelfClass` | `SmallArms, UnguidedGunMortar, UnguidedRocket, Guided` | 06 |
| 标准战时日消耗 | `StdDay` | 用于“天数”目标的标准消耗率（与实际战况无关） | 06 |
| 关键节点报告 | `KeyNodeReport` | 逐个删节点重算得到的补给下降排行 | 06 |
| 包围圈 | `PocketInfo` | 与国家主源不连通的己方地块连通分量及其耐久预测 | 06 |
| 口岸数据 | `ImportGatewayData` | 进口口岸的外部方式、过境国、日处理能力、轨距断点、外部运输时间 | 06 |
