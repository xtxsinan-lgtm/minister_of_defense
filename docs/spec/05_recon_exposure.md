# 05 侦察与暴露度

> 依据：总纲 §10（侦察与暴露度）、§16（特种部队）、§9.3①（B 线）、§11.1.1（跨地块打击）、§11.1.2（过边）、§12.3（侦察任务）、§19.9（打击节点需 L4）。
> 术语、单位、更新顺序、RNG 一律按 [00_glossary.md](00_glossary.md)。00 的 🟡 G-xx 按“暂定采用”处理。
> 本文件的 🟡 编号为 `R-xx`，汇总在第 10 节。

---

## 1. 目标与范围

### 1.1 解决什么问题
1. 回答“**谁对谁知道多少**”：每个国家对每个敌方目标有一份连续的暴露度 `exposure ∈ [0, 5]`，取整得到等级 L0–L5。
2. 让“侦察 / 伪装 / 电磁管控 / 假目标 / 姿态 / 集结”变成**有代价、有反馈的决策**：
   - 买什么侦察手段（卫星、无人机、电子侦察、特种部队）；
   - 部队要不要挖壕、分散、静默、布假目标；
   - 什么时候打（L4 才能精确打击；情报会过时）。
3. 给 03 / 04 / 08 / 12 / 13 提供**唯一的情报入口**：其他系统只读 `ExposureLevel`、情报时间戳和本文件提供的函数，不自己解读连续值（00 §3.7）。

### 1.2 阶段划分
| 内容 | 阶段 0（试验场） | 阶段 1（纳卡 MVP） | 阶段 2+ |
|---|---|---|---|
| 暴露度 | **固定值**：剧本设置双方对彼此的等级（默认 L3，age = 0），不更新 | 完整模型 | — |
| 特征值 | 计算并在编制编辑器里显示（作为反馈），但不参与结算 | 完整 | — |
| 侦察手段 | — | 9 种 `ReconMeans` 全部可用（纳卡实际用到：卫星、电子侦察、大型/中型无人机、特种部队、地面侦察、巡飞弹顺带侦察） | 太空资产采购、反卫星（§21-17） |
| 欺骗 | — | 地面假目标、假电台；空中诱饵见 08 | 更复杂的欺骗战役 |
| 特种部队 | — | 侦察任务 `SofMission` | 目标指示、破袭（🟡 R-15） |
| 天气 | — | 接口留好，系数固定（🟡 R-21） | 天气系统 |
| 海上目标 | — | — | 阶段 3（舰艇暴露度沿用本模型） |

### 1.3 不包含
- 空中目标的探测（雷达看飞机）**不走暴露度**，走 08 的空情 `AirTrack`（🟡 A-20，见 08）。
- 片段内部的“谁先看见谁”（班级发现概率）由 03 定义；条带上连级的局部发现由 04 定义。本文件只给它们**起始条件**和**营级等级**。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单
| # | 决策 | 在哪做 | 代价 / 取舍 |
|---|---|---|---|
| D1 | 采购侦察手段（无人机组、电子侦察站、侦察营、伪装器材、假目标） | 采购（11） | 预算 |
| D2 | 部队姿态（挖壕 / 集结 / 行军）、行军方式（密集 / 疏散） | 移动命令（09） | 挖壕要时间；疏散慢 |
| D3 | 营 / 旅的**电磁管控** `EmconState`（Active / Partial / Silent） | 营 / 旅设置 | 静默 → 命令延迟变长（09 读取，见 §6）、防空雷达不能开（08） |
| D4 | 是否**布设假目标**（营有假目标器材时） | 营设置 `deployDecoys` | 占用器材、被识破后无效 |
| D5 | **区域侦察任务**：给侦察资产划地块、设优先级、设风险容忍度 | 区域任务面板 | 风险高 → 无人机损失多 |
| D6 | **特种部队任务**：进入方式、地块、天数、回报间隔、撤出方式 | SOF 面板 | 回报越勤越容易暴露 |
| D7 | **跨地块打击的时机**：等到 L4 还是用 L2–L3 做面积打击 | 打击命令（04/08） | 面积打击费弹、效率低 |
| D8 | 看“我方暴露度估算”后，决定加强伪装、分散、静默、转移 | 估算视图 | — |

### 2.2 反馈清单（数字要透明）
| # | 反馈 | 内容 |
|---|---|---|
| F1 | 敌方单位卡（按等级显示） | L1 “有东西”；L2 规模估计（带误差范围，如“约 1 个营，±40%”）；L3 类型（可能识别错，显示置信度）；L4 精确位置 + “情报 x 分钟前”；L5 剩余兵力、弹药、疲劳的估计 |
| F2 | 情报年龄 | 每条敌方情报显示“上次观测时间”，过时情报变灰；L4 过了半衰期显示“定位已过时，不能精确打击” |
| F3 | 特征值分解（编制编辑器 + 营面板） | “特征值 0.31 = 规模 1.00 × 姿态 0.60 × 地形 0.73 × 伪装 0.83 × 工事 0.85”；电磁特征值单列 |
| F4 | 暴露度来源分解 | 对某个敌方营：“本小时 +0.42：TB2 组 68%，电子侦察 22%，地面侦察 10%” |
| F5 | 我方暴露度估算 | 每个我方营：“敌方大约掌握 L2–L4”，主要来源（如“你的电台开机贡献 40%”），建议动作 |
| F6 | 假目标状态 | 我方：假目标还在骗 / 已被识破（我方估计）；敌方：已识破的假目标在地图上标“假” |
| F7 | 区域任务面板 | 每个地块分到的侦察时间比例、当前最高等级、预计损失率 |
| F8 | SOF 面板 | 剩余补给天数、累计情报、被发现风险等级、下次回报时间 |

---

## 3. 数据结构

> 命名空间 `MoD.Sim.Recon`。所有字段单位后缀按 00 §3.1。

### 3.1 枚举

```csharp
// 00 已定义，重复列出以便实现（值不得改）
enum ExposureLevel { None = 0, Presence = 1, Size = 2, Type = 3, Targetable = 4, Status = 5 }
enum ReconMeans {
    None = 0, OpticalSatellite = 1, RadarSatellite = 2, Elint = 3, LargeUav = 4,
    GmtiAircraft = 5, ReconPod = 6, MediumUav = 7, SpecialForces = 8, GroundRecon = 9
}
enum Posture { None = 0, Entrenched = 1, Defending = 2, Resting = 3, Assembling = 4,
               Marching = 5, Attacking = 6, CrossingEdge = 7 }        // 状态切换归 09
enum EmconState { Active = 0, Partial = 1, Silent = 2 }
enum SofInsertion { GroundInfiltration = 1, Parachute = 2, HeliInsertion = 3 }

// 本文件新增
enum ExposureTargetKind { None = 0, Battalion = 1, SofTeam = 2, Decoy = 3, LogisticsNode = 4, Crossing = 5 }
enum SignatureChannel { Physical = 0, Emitter = 1 }
enum ReconRiskTolerance { Low = 1, Medium = 2, High = 3 }
enum TilePriority { Low = 1, Normal = 2, High = 3 }
enum SofMissionPhase { Planned = 0, Inserting = 1, OnStation = 2, Exfiltrating = 3,
                       Completed = 4, Compromised = 5, Destroyed = 6 }
enum IntelTypeGuess { Unknown = 0, Armor = 1, MechInfantry = 2, Infantry = 3, Artillery = 4,
                      AirDefense = 5, Headquarters = 6, Logistics = 7, Recon = 8, SpecialForces = 9 }
```

### 3.2 目标引用

```csharp
readonly record struct ExposureTargetId(ExposureTargetKind kind, ulong id);
// Battalion: id = OrgUnitId.value；SofTeam: id = OrgUnitId（连）；Decoy: id = DecoyGroupId；LogisticsNode: NodeId
// Crossing: id = CrossingId (10)（桥梁/渡口；机场、工厂按 06 NodeRole 归入 LogisticsNode）
// 排序：先 kind 升序，再 id 升序（全序，用于遍历）
```

### 3.3 静态数据 Profile（挂在 `EquipmentModel` 上，05 归属，00 §4.3）

```csharp
class SignatureProfile {                 // YAML 键: signature
    double vehicleEquivalent;            // 物理特征的“车辆当量”贡献/件，≥0。缺省按类别表 §5.2
    double emitRadio;                    // 电台/通信发射强度/件，≥0。缺省 0（HQ 班另有缺省，§4.1.3）
    double emitRadar;                    // 雷达发射强度/件，≥0（防空雷达、炮位侦校雷达、战场监视雷达）
    double decoyVehicleEquivalent;       // 仅假目标器材：展开后模拟的车辆当量
    double decoyEmit;                    // 仅假辐射源：模拟的电磁发射强度
    double decoyQuality;                 // [0,1]，多光谱假目标高；充气假目标约 0.3–0.5
    IntelTypeGuess decoyMimics;          // 假目标模拟成哪类部队
    double engagementSigMult = 1.0;      // 片段内的被发现系数（03 使用，03 C-08）
}

class SensorProfile {                    // YAML 键: sensor
    ReconMeans reconMeans;               // 该装备提供哪种侦察手段；None = 不提供
    double groundReconValue;             // 对“地面侦察力量”的贡献/件（参考：一个侦察连 ≈ 1.0）
    double eoQuality;                    // [0,1] 光电/成像质量（无人机转塔、吊舱）；缺省 0.7
    double nightFactor;                  // [0,1] 夜间效率；有热像 0.8–1.0，无热像 0.3
    double uavRadiusKm_dataOnly;         // 数据键 radius_km：中型无人机作用半径（加载成 uavRadiusM）
    double uavRadiusM;
    double enduranceH;                   // 中型无人机续航
    double elintRangeM;                  // 地面电子侦察站作用距离
    double thermalFill;                  // 该装备是否带热像（0/1），用于营的夜间能力汇总
    OpticsClass opticsClassDay, opticsClassNight;   // 观瞄器材等级（枚举归 03 §4.2.2，05 只承载数据；03 C-08）
    // —— 以下字段供 08 使用（空中探测），05 只负责定义 ——
    double airRadarRangeMAt1m2;          // 对 1 m² 目标的探测距离（数据键 air_radar_range_km_at_1m2）
    double airRadarMaxAltM;              // 雷达能看到的最高目标高度
    double slowTargetFactor;             // [0,1]，老式动目标显示对慢速目标的探测距离折减；1 = 无折减
    bool   isLookDown;                   // 机载下视雷达（预警机），不受地杂波低空折减
    double opticalAirRangeM;             // 光学/红外对空搜索距离（对 1 m² 等效、白天）
    double esmRangeFactor;               // 电子支援措施：能在“对方雷达自身探测距离 × 本系数”处发现辐射源
}
```

YAML 示例（新增数据时用；数值为估算，`confidence: estimated`）：

```yaml
- id: bayraktar_tb2
  category: uav_male
  sensor: {recon_means: large_uav, eo_quality: 1.0, night_factor: 0.8}
  confidence: estimated
- id: orbiter3
  category: uav_tactical
  sensor: {recon_means: medium_uav, eo_quality: 0.8, night_factor: 0.7, radius_km: 100, endurance_h: 7}
  confidence: estimated
- id: inflatable_t72_decoy
  category: decoy_vehicle            # 新类别，见第 11 节
  signature: {decoy_vehicle_equivalent: 1.0, decoy_quality: 0.4, decoy_mimics: armor}
  confidence: estimated
```

### 3.4 运行时组件

```csharp
// 每个营一份（ECS 组件，键 = 营的 OrgUnitId）。由 05 在 Exposure 阶段重算。
class SignatureState {
    OrgUnitId battalionId;
    double vehicleEquivalent;      // VE，≥0
    double sizeTerm;               // sqrt(VE / VeRef)
    double postureMult, terrainMult, camoMult, fortMult, densityMult;   // 各乘子，便于 F3 显示
    double physical;               // S_phys ≥ 0
    double emitter;                // S_emit ≥ 0
    double emitterRadar;           // S_emit 中的雷达部分 = sqrt(radarScore / EmitRef)（§4.1.3）
    double counterRecon;           // [0, CounterReconMax]，本营所在地块本方的反侦察系数（vsGround）
}

// 每个（观察国, 目标）一份。只为“有过任何贡献”的对创建；exposure 衰减到 < ExposureDropThreshold 且无贡献时删除。
class ExposureRecord {
    CountryId observer;
    ExposureTargetId target;
    double exposure;               // [0, 5]
    SimTime lastObservedTime;      // 最近一次“被观测”（定义见 §4.3 第 5 步）的时刻
    double lastObservedLatDeg, lastObservedLonDeg;   // lastObservedTime 时目标的真实位置（来自 09/04），与 lastObservedTime 同时写入
    SimTime lastLevelChangeTime;
    H3Index lastKnownTile;         // 观察方认为目标所在的地块（L1 起有效）
    bool isKnownDecoy;             // 已识破的假目标（只对 Decoy 目标有意义；对真实目标恒 false）
    double decoyRevealProgress;    // [0, 1]，到 1 识破
    IntelEstimate estimate;        // 给玩家/AI 看的带误差情报快照
    // 本步来源分解（F4），只保留当前步
    double[] lastGainByMeans;      // 长度 10，下标 = (int)ReconMeans
}

class IntelEstimate {
    ExposureLevel level;
    double estVehicleEquivalent;   // L2+：带误差的规模（VE）
    int estPersonnel;              // L2+：带误差的人数
    IntelTypeGuess typeGuess;      // L3+
    double typeConfidence;         // [0,1] 显示用
    double estStrengthFraction;    // L5：剩余兵力比例估计 [0,1]（真值来自 07 满编率）
    double estAmmoFraction;        // L5
    double estFatigue;             // L5
    Posture observedPosture;       // lastObservedTime 时目标的姿态（§4.4.2 用，不读真值）
    long refreshEpoch;             // 误差抽样的轮次号（§4.6）
}

// 每个营一份侦察相关设置（05 归属；09 UnitConfig 写入；08 AirDefenseRegistration.emcon 每步复制本字段）
class ReconConfig {
    OrgUnitId battalionId;
    EmconState emcon = EmconState.Active;
    bool deployDecoys;
}

// 地块 × 国家的反侦察系数（每步重算，不存档）
class TileCounterReconState {
    H3Index tile; CountryId country;
    double vsUav;                  // [0, CounterReconMax]
    double vsGround;               // [0, CounterReconMax]
}

// 08 每个空中步写入的观测样本（缓冲；05 在下一个 Exposure 阶段消费后清空）
readonly record struct ReconDwellSample(
    CountryId observer, H3Index tile, ReconMeans means,
    double dwellS,                 // 本空中步内在该地块上空的有效观测秒数，(0, 60]
    double sensorQuality,          // = SensorProfile.eoQuality（巡飞弹用其导引头质量）
    double standoffFactor,         // [0,1]，见 08 §4.4.7
    ulong sourceId,                // FlightElementId / MissileInFlightId / 营 OrgUnitId，排序与叠加用
    byte sourceKind,               // 1 = FlightElement，2 = Missile，3 = Battalion
    double nightFactor);           // 该源的夜间系数（08 按 SensorProfile.nightFactor 填写），§4.2.6

// 04 每个条带步写入的地面侦察样本（缓冲）
readonly record struct StripReconSample(
    EdgeBattleId battleId, CountryId observer, OrgUnitId targetBattalion,
    double reconRatePerH,          // 04 算出的、针对该营的地面侦察速率（已含 04 局部因素）
    bool inContact,                // 过去 60 分钟内与该营有过 E 线片段
    double sampleMinutes);         // 本样本代表的分钟数（= StripStepMinutes）

// 卫星资产（剧本数据，14 提供）
class SatelliteAsset {
    CountryId owner;
    ReconMeans means;              // OpticalSatellite 或 RadarSatellite
    double revisitH;               // 对战区的平均重访间隔（小时）
    double passPhaseH;             // 第一次过顶相对剧本开始的偏移（小时）
    double quality;                // [0,1] 分辨率等综合
    CountryId[] sharesWith;        // 情报共享国（🟡 R-12）
}

// 假目标组
class DecoyGroup {
    DecoyGroupId id;               // 运行时强类型 ID
    OrgUnitId ownerBattalion;
    H3Index tile;
    double vehicleEquivalent;      // 展开的假车当量
    double emit;                   // 假辐射源强度
    double quality;                // 加权平均 decoyQuality
    IntelTypeGuess mimics;
    List<EquipmentItemId> items;   // 构成它的器材实例
}

// 区域侦察任务
class AreaReconTask {
    AreaReconTaskId id;
    CountryId owner;
    List<(H3Index tile, TilePriority priority)> tiles;    // 按 tile 升序存
    List<ReconAssetRef> assets;    // 分配的资产：FlightId（大型无人机/侦察机）或 营 OrgUnitId（中型无人机）
    ExposureLevel desiredLevel;    // 想达到的等级，缺省 Targetable
    ReconRiskTolerance risk;
    // 运行时（每 60 分钟重算）
    Dictionary<H3Index, double> dwellShare;   // 每个地块分到的时间比例，Σ = 1（遍历时按 tile 升序）
}
readonly record struct ReconAssetRef(bool isFlight, ulong id);

// 特种部队任务
class SofMission {
    SofMissionId id;
    OrgUnitId sofCompany;          // 特种部队按连操作（§16 ✅）
    H3Index targetTile;
    SofInsertion insertion, extraction;
    double durationDays;           // 计划侦察天数
    double reportIntervalH;        // 回报间隔：2 / 6 / 12 / 24
    SofMissionPhase phase;
    SimTime phaseStartTime, nextReportTime;
    double suppliesDays;           // 剩余补给天数
    // 未回报的情报缓冲：目标 → 累计增量（回报时一次性写入 ExposureRecord）
    SortedDictionary<ExposureTargetId, double> pendingGain;
    double reportEmitSpikeRemainingH;   // 回报后特征值抬高的剩余时间
}

// 我方暴露度估算（每 60 分钟重算，给 13 显示）
class OwnExposureEstimate {
    OrgUnitId battalionId; CountryId enemy;
    double shadowLow, shadowHigh;  // [0,5] 两条影子暴露度
    ExposureLevel levelLow, levelHigh;
    (ReconMeans means, double share)[] topContributors;   // 最多 3 个
    string[] hintKeys;             // 建议动作的本地化键（如 "hint_emcon_partial"）
}
```

---

## 4. 算法与公式

### 4.0 调用时机总览
- **`TickPhase.Exposure`（50），每 `ExposureStepMinutes = 10` 分钟一次**，`dtH = 10/60 = 1/6`（00 §5、G-02）。按下列顺序执行 4.1 → 4.8。
- **我方暴露度估算**（4.9）和**区域任务分配**（4.10）：每 60 分钟一次，在同一 Exposure 阶段末尾执行（`tick % 60 == 0`）。
- **SOF 任务状态机**（4.11）：每个 Exposure 步。
- **阶段 0**：整个 Exposure 阶段跳过；`GetLevel()` 返回剧本固定值，`ageMs = 0`。

所有遍历：观察国 `CountryId` 升序 → 目标 `ExposureTargetId` 升序（00 §6.4）。

### 4.1 特征值（每步对每个营重算）

#### 4.1.1 车辆当量与规模项
```
VE = Σ_items vehicleEquivalent(model) × count_alive + personnelAlive × VePerPerson
sizeTerm = sqrt(VE / VeRef)
```
- `count_alive`：未被摧毁、未遗弃的装备件数（07 的状态；可修复的受损车辆计入）。
- 缺省 `vehicleEquivalent` 按类别表（§5.2）；人员 `VePerPerson = 0.02`（50 人 ≈ 1 辆车）。
- `VeRef = 50`（一个机步营约 50）。

#### 4.1.2 物理特征值
```
S_phys = sizeTerm × postureMult × terrainMult × camoMult × fortMult × densityMult
postureMult = PostureMult[posture] × (posture ∈ {Marching, CrossingEdge} ? MarchModeMult[marchMode] : 1)
terrainMult = Σ_t share_t × TerrainConcealment[t]           // share_t 来自地块的 TerrainComposition（10），Σ share = 1
camoQuality = 0.5 × camoKitFill + 0.5 × camoSkill
camoMult    = 1 − CamoMaxReduction × camoQuality
fortMult    = 1 − FortMaxReduction × fortLevel01            // fortLevel01 ∈ [0,1]，由 04 提供（不在战斗中时 09 提供挖壕进度）
densityMult = min(DensityMultMax, 1 + DensityK × max(0, VE_tileSide / DensityRefVe − 1))
```
- `camoKitFill`：营内配了伪装器材（新类别 `camo_kit`，见第 11 节）的车辆比例 = min(1, 伪装器材件数 / 车辆件数)。数据里没有任何伪装器材时取 `CamoKitDefault = 0.3`（🟡 R-18）。
- `camoSkill`：营的平均通用练度 = 02 `UnitAverageGeneral(battalionId)`。
- `VE_tileSide`：同一地块内**同一国家所有营**的 VE 之和（含本营）。这体现“堆兵有代价”（§9.3①）。
- **过边中的营**（`Posture.CrossingEdge`）：对两个地块的观察都有效（§11.1.2）；地形乘子取两地块按过边进度加权：`terrainMult = (1−p) × T_from + p × T_to`。

#### 4.1.3 电磁特征值
```
emitScore = Σ_items emitRadio(model)  × count × RadioEmconFactor[emcon] × activityMult
          + Σ_items emitRadar(model)  × count × RadarEmconFactor[emcon]
          + (该营每个 role = Hq 的班) × HqRadioDefault × RadioEmconFactor[emcon] × activityMult   // 数据缺失时的缺省
S_emit = sqrt(emitScore / EmitRef)
radarScore   = Σ_items emitRadar(model) × count × RadarEmconFactor[emcon]      // emitScore 的雷达项
S_emitRadar  = sqrt(radarScore / EmitRef)                                     // 写入 SignatureState.emitterRadar
activityMult = (posture == Attacking || 该营处于活跃 EdgeBattle) ? 1.5 : 1.0
```
- 防空营的雷达开关**由 08 的防空登记决定实际状态**（Partial 时按 08 报告的“本步开机时间比例”替换 `RadarEmconFactor`）：`RadarEmconFactorEffective = radarOnFraction`（08 §4.7.2 写入 `AirDefenseRegistration.radarOnFraction`）。

#### 4.1.4 特种部队小队、假目标、节点的特征值
- **SOF 小队**：`S_phys = SofBaseSignature × (1 − 0.5 × sofSkill)`；回报后 `ReportSpikeH` 小时内 `S_emit = SofReportEmit`，否则 0。
- **假目标组**：`S_phys = sqrt(VE_decoy / VeRef) × DecoyPostureMult × terrainMult`；`S_emit = sqrt(emit_decoy / EmitRef)`。（假目标不享受伪装和工事加成——它就是要被看见。）
- **后勤节点 / 机场 / 桥 / 工厂**：不计算特征值，见 4.8（🟡 R-10）。

#### 4.1.5 反侦察系数（每个地块 × 国家）
```
ewCoverage   = min(1, Σ ew_vehicle 件数（该国在该地块的所有营） / EwVehiclesForFullCoverage)
reconPowerOwn = Σ 该国在该地块所有营的 groundReconPower（§4.4.6）
vsUav    = min(CounterReconMax, CounterUavEwWeight × ewCoverage)
vsGround = min(CounterReconMax, CounterGroundReconWeight × min(1, reconPowerOwn / 2) + CounterGroundEwWeight × ewCoverage)
```
- 防空打无人机**不在这里**：被打下来的无人机自然没有观测时长（08 负责）。
- 卫星、电子侦察的反制 = 姿态 / 伪装 / 电磁管控本身，不另设系数。

### 4.2 收集本步的侦察贡献

对每个（观察国 c，地块 t，手段 m），先算**覆盖度** `coverage ∈ [0, ~2.5]`，然后对地块内每个敌方目标算增量。

#### 4.2.1 空中样本（LargeUav、GmtiAircraft、ReconPod，以及巡飞弹顺带的 MediumUav）
```
对每个 (c, t, m)，取本 Exposure 步缓冲里的所有 ReconDwellSample，按 (sourceKind, sourceId) 合并（同一源的样本 dwellS 相加，quality/standoff/nightFactor 取 dwell 加权平均）
f_i = (Σ dwellS_i / (ExposureStepMinutes × 60)) × sensorQuality_i × standoffFactor_i          // 每个源一个 f_i ∈ [0,1]
把 f_i 按 (f_i 降序, sourceKind 升序, sourceId 升序) 排序
coverage(c,t,m) = Σ_k f_(k) × SameMeansStackDecay^k         // k = 0,1,2…
```
- `SameMeansStackDecay = 0.6`：第 2 架、第 3 架的边际价值递减。

#### 4.2.2 中型无人机（`MediumUav`，抽象，不进入空中层 🟡 R-11）
每个拥有 `reconMeans = MediumUav` 装备的营 b（属于国家 c）：
```
readyCount = 该型完好件数
flightHoursPerStep = readyCount × MediumUavDutyCycle × (ExposureStepMinutes / 60)      // 机时预算
候选地块 = 与营所在地块中心距离 ≤ uavRadiusM 的地块
分配：若 b 被分配给某个 AreaReconTask → 按该任务的 dwellShare（只取候选地块）
      否则（缺省条令）→ 营所在地块的敌方相邻地块平均分配；没有敌方相邻地块就不飞
f(t) = flightHoursPerStep × share_t / (ExposureStepMinutes / 60) × eoQuality × 11.SoftwareDegradeFactor(c, model)   // 截断到 ≤ readyCount；软件保障中断系数见 11 §4.11
coverage(c,t,MediumUav) 按 4.2.1 的方式叠加（每个营作为一个源，sourceId = 营 ID）
```
- 损失：每个地块每小时损失概率由 08 的 `AbstractUavAttritionPerH(c, t, modelId)` 给出（08 §4.9.3）。本步对每个营每个地块抽样一次：`Bernoulli(1 − (1 − pLossPerH)^(f(t) × dtH))` → 命中则对该营一件完好的中型无人机（EquipmentItemId 升序第一件）调用 `07.ApplyVehicleDamage(item, Destroyed, Catastrophic, now, src, default, 0)`。RNG：`For(Exposure, Mix(battalionId) ^ tile, tick, SaltMediumUavLoss)`。

#### 4.2.3 卫星过顶（`OpticalSatellite`, `RadarSatellite`）
```
第 k 次过顶时刻 = scenarioStart + (passPhaseH + k × revisitH) 小时，k = 0,1,2…
若某次过顶落在 [stepStart, stepStart + 10min)：
   对覆盖区（剧本给出的战区全部地块）每个敌方目标，产生一次“脉冲”增量（不是速率）：
   impulse = SatImpulse[m] × quality × channelSig × envFactor × movingFactorSat
   光学卫星：过顶地块本地太阳高度 < 0（夜间）→ envFactor = 0；否则 envFactor = CloudFactorExpected (0.6)
   雷达卫星：envFactor = 1
   movingFactorSat：目标 Posture ∈ {Marching, CrossingEdge} → SatMovingFactor[m]，否则 1
```
- 脉冲与速率一样走 4.3 的封顶和难度规则（把脉冲当作本步的 `gain × dtH`）。
- 情报共享：`sharesWith` 中的国家也获得同样的脉冲（🟡 R-12）。

#### 4.2.4 电子侦察（`Elint`）
- 来源：拥有 `reconMeans = Elint` 的地面装备（覆盖与其所在地块中心距离 ≤ `elintRangeM` 的地块）；带电子侦察吊舱的飞行编组由 08 写入 `ReconDwellSample(means = Elint)`。
- 地面站：`coverage = min(ElintStackMax, Σ_站 11.SoftwareDegradeFactor(c, 站型号))`（每站基础值 1.0，乘软件保障中断系数，11 §4.11；不按距离衰减，简化）。
- 通道 = 电磁特征值（§4.2.6）。

#### 4.2.5 地面侦察（`GroundRecon`）
1. **不在同一 EdgeBattle 中的目标**：对每个国家 c 的每个营 b（位于地块 t_b），对 t_b 的每个相邻地块 t' 里的敌方目标：
   `coverage += groundReconPower(b) × AdjacentReconFactor`；对同一地块 t_b 里的敌方目标（如 SOF、渗透者）：`coverage += groundReconPower(b) × SameTileReconFactor`。同一个 (c, t', target) 的多个营按 4.2.1 的方式叠加（`f_i` = 各营贡献，截断到 ≤ `GroundReconPowerCap`）。
2. **同一 EdgeBattle 中的对手营**：改用 04 写入的 `StripReconSample`：
   `gainPerH = Σ_samples reconRatePerH × sampleMinutes / ExposureStepMinutes`（时间加权平均），**直接作为速率**（04 的速率已包含侦察力量与局部因素，不再乘 `coverage × rate`，但仍乘目标的通道特征值和 `(1 − vsGround)`）。
   - 封顶：`inContact == true` → 5；否则 4。
   - 04 未实现前的缺省：`reconRatePerH = GroundReconRate × groundReconPower(observer 营) × StripReconBonus`。

#### 4.2.6 通道特征值与环境系数
```
channelSig(m, target) = PhysWeight[m] × S_phys(target) + EmitWeight[m] × S_emit(target)
envFactor(m, tile)    = 夜间 ? NightFactor(m, 资产) : 1            // × WeatherFactor = 1（🟡 R-21）
```
- 夜间判定：地块中心本地太阳高度 < 0（09 提供 `IsNight(tile, time)`）。
- `NightFactor`：空中资产取样本的 `nightFactor`（4.2.1 里 dwell 加权平均）；地面侦察取 `GroundNightBase + (1 − GroundNightBase) × thermalFillOfBattalion`；SOF 取 `SofNightFactor`。

### 4.3 暴露度更新（每个 (c, target) 对）

```csharp
void UpdateExposure(ExposureRecord r, Contributions contrib, double dtH) {
    double e = r.exposure;
    // 1. 每种手段的“本步增量（未除难度）”
    //    gain_m = Rate[m] × coverage(c, tile(target), m) × channelSig(m,target) × envFactor × (1 − counter_m)
    //    卫星：gain_m × dtH 直接等于 impulse；条带地面侦察：gain_m = gainPerH × channelSig × (1 − vsGround)
    //    counter_m：LargeUav/MediumUav/ReconPod/GmtiAircraft → vsUav；GroundRecon/SpecialForces → vsGround；其他 → 0
    // 2. 按 (CapValue(m,target) 升序, (int)m 升序) 排序，依次累加并封顶
    bool observed = false;
    foreach (var (m, gainPerH) in contrib.SortedByCapThenMeans()) {
        if (gainPerH <= 0) continue;
        double cap = CapValue(m, target, contrib);           // 见 4.3.1
        if (Math.Floor(cap) >= Math.Floor(e)) observed = true;    // 能看到当前等级的手段才算“在观测”
        double g = gainPerH * dtH / LevelDifficulty[(int)Math.Floor(Math.Min(e, 4.999))];
        double before = e;
        e = Math.Min(e + g, Math.Max(e, cap));
        r.lastGainByMeans[(int)m] = e - before;
    }
    // 3. 衰减
    double decayPerH = DecayRate[posture(target)];
    double decayMult = observed ? ObservedDecayFactor : 1.0;
    e = e - e * decayPerH * dtH * decayMult;
    // 4. 夹紧、时间戳
    e = Math.Clamp(e, 0.0, 5.0);
    if (observed) {
        r.lastObservedTime = stepStart;
        (r.lastObservedLatDeg, r.lastObservedLonDeg) = position(target);   // 真实位置：营 = 09 GetBattalionPosition（条带上取 04 位置）；其他目标 = 其所在位置
        r.estimate.observedPosture = posture(target);
    }
    if (Math.Floor(e) != Math.Floor(r.exposure)) r.lastLevelChangeTime = stepStart;
    r.exposure = e;
}
```

#### 4.3.1 封顶 `CapValue`
```
CapValue(m, target) = (MaxLevel(m, target) == 5) ? 5.0 : MaxLevel(m, target) + CapEpsilonTop      // CapEpsilonTop = 0.999
```
即“最高等级 Lk”的手段能把暴露度推到 Lk 的顶端（k.999），但推不进 L(k+1)。

| 手段 | `MaxLevel` | 例外 |
|---|---|---|
| OpticalSatellite | 3 | — |
| RadarSatellite | 3 | — |
| Elint | 3 | 目标当前 `emitterRadar` > 0（雷达开机），或目标是指挥部营（`role = Hq` 的营）且 `emcon == Active` → **4** |
| LargeUav | 4 | — |
| GmtiAircraft | 3 | — |
| ReconPod | 3 | — |
| MediumUav | 4 | — |
| SpecialForces | 5 | — |
| GroundRecon | 4 | 条带样本 `inContact == true` → **5** |

#### 4.3.2 难度
`LevelDifficulty[floor(e)] = [1.0, 1.0, 1.5, 2.0, 3.0]`（索引 0..4）：越往上越难。

#### 4.3.3 换地块
目标营的地块归属切换时（09 在 `LandMovement` 阶段发出 `BattalionTileChanged` 事件，05 在下一个 Exposure 步开头处理）：
```
对每个观察国的记录：exposure = min(exposure × TileChangeRetain, TileChangeCap)      // 0.7, 3.999
lastKnownTile 保持旧值，直到观察方对新地块的贡献使 exposure 增长（那一刻更新为新地块）
```
理由：营换地块后，“精确位置”一定失效（L4 → 最多 L3），但“存在、规模、类型”部分保留。

#### 4.3.4 删除记录
`exposure < ExposureDropThreshold (0.05)` 且本步无贡献 → 删除记录（节省内存）。界面上该目标消失（保留“最后已知”幽灵图标 `GhostIconHours = 24` 小时，13 负责）。

### 4.4 情报用函数（给其他系统调用）

#### 4.4.1 等级
```csharp
ExposureLevel GetLevel(CountryId observer, ExposureTargetId target)
    => record 不存在 ? None : (ExposureLevel)(int)Math.Floor(record.exposure);
long GetAgeMs(CountryId observer, ExposureTargetId target, SimTime now)
    => record 不存在 ? long.MaxValue : now.ms - record.lastObservedTime.ms;
IntelSnapshot GetExposure(CountryId observer, ExposureTargetId target, SimTime now)     // IntelSnapshot 归 09 §3.2
    => new(GetLevel(observer, target), record.lastObservedTime,
           TargetLocationErrorM(level, ageMs, record.estimate.observedPosture), record.estimate.observedPosture);
```

#### 4.4.2 精度系数（00 §3.7 要求的函数；🟡 R-08 增加 posture 参数）
```
ExposureAccuracyFactor(level, ageMs, posture) = LevelAccuracy[level] × AgeFactor(ageMs, posture)
AgeFactor = DMath.Pow(0.5, ageMs / FixHalfLifeMs[posture])
```
- `posture` 取**观察方最后看到时**的姿态（`IntelEstimate.observedPosture`，不读真值）。为与 00 的两参签名兼容，提供重载 `ExposureAccuracyFactor(level, ageMs)`，posture 取 `Defending`。
- 用途：03/04 的间瞄首轮精度、08 的打击精度、面积打击弹药倍数。

#### 4.4.3 精确打击许可（10.5 / 11.1.1）
```
PrecisionStrikeAllowed(level, ageMs, posture) = level >= Targetable && AgeFactor(ageMs, posture) >= PrecisionMinAgeFactor   // 0.5
AreaStrikeAmmoMultiplier(level, ageMs, posture) = 1 / max(AreaStrikeFloor, ExposureAccuracyFactor(level, ageMs, posture))    // AreaStrikeFloor = 0.1
```
- 即：L4 且定位不超过一个半衰期 → 可以精确打击；否则只能面积打击，期望弹药消耗 × 倍数。

#### 4.4.4 目标定位误差（供 08/04 的 GNSS 弹药使用）
```
TargetLocationErrorM(level, ageMs, posture) =
    level >= 4 ? TleBaseM / max(0.05, AgeFactor) :
    level == 3 ? TleL3M : level == 2 ? TleL2M : TleL1M
```

#### 4.4.5 自主搜索获取（供 08：巡飞弹、察打一体无人机“自己找目标”）
```
SearchAcquireProbabilityPerMin(targetChannelSig, seekerQuality, priorLevel, isNight, nightFactor)
  = 1 − exp( −SearchK × targetChannelSig × seekerQuality × PriorLevelBonus[priorLevel] × (isNight ? nightFactor : 1) )
```
- `targetChannelSig`：光电搜索用 `S_phys`；被动雷达导引头用 `emitterRadar`（且仅当雷达开机）。
- 获取成功时，08 调用 `RegisterSelfFix(observer, target, means)`：把 exposure 提到 `max(exposure, 4.0)`、`lastObservedTime = now`（打击方“自己看见了”，同时也就把这个情报带回了本国 → 察打一体）。仅当该平台的 `MaxLevel(means) ≥ 4`（LargeUav/MediumUav/巡飞弹）时允许。

#### 4.4.6 地面侦察力量
```
groundReconPower(b) = min(GroundReconPowerCap,
     Σ_items groundReconValue(model) × count_alive × (0.5 + 0.5 × reconSkill))
```
- `reconSkill`：营里侦察专业（侦察兵、无人机操作员）的平均型号专有练度（02）；无此专业取通用练度。
- 缺省 `groundReconValue` 按类别（§5.2）：`uav_micro` 0.05、`uav_hand_launched` 0.15、`uav_small_vtol` 0.3、侦察车 0.12、`radar_battlefield` 0.3、`radar_counter_battery` 0.2（只对炮兵目标有效，见注）。
- 注：反炮兵雷达对 `IntelTypeGuess.Artillery` 类营且该营本步开过火（04 提供）时，额外给 `GroundRecon` 覆盖 `+0.5`（同地块和相邻地块）（仅对不与观察方在同一 EdgeBattle 的炮兵营；同一战斗内由 04 CbReconPulse 计入）。

#### 4.4.7 特征值查询（供 04 / 08）
```csharp
(double physical, double emitter, double emitterRadar) GetSignature(ExposureTargetId target)
    // Battalion：SignatureState 的 physical / emitter / emitterRadar；SofTeam、Decoy：§4.1.4；LogisticsNode、Crossing：(0, 0, 0)（不算特征值，§4.8）
```

### 4.5 L5 状态与 L2 规模的“真值”来源
- 规模真值：目标的 `VE` 和人数（01/02）。
- L5 真值：剩余兵力比例 = 07 的营人员满编率；弹药比例 = 06 的随行携带量 / 一个基数；疲劳 = 03 汇总值。

### 4.6 情报误差（10.3）
1. **何时刷新**：`refreshEpoch` 在以下情况 +1 并重新抽误差：等级变化；或距上次刷新 ≥ `IntelRefreshH`（6 小时）且本期间被观测过。不刷新时误差保持不变（避免数字每 10 分钟跳）。
2. **规模误差**（L2+）：
   ```
   rng = For(Exposure, Mix(observer.value) ^ Mix(((ulong)target.kind << 56) ^ target.id), refreshEpoch, SaltIntelNoise)
   z = rng.Normal(0, 1)            // 15 提供
   estVE = trueVE × DMath.Exp(SizeErrorSigma[level] × z)
   estPersonnel = (int)Math.Round(truePersonnel × DMath.Exp(SizeErrorSigma[level] × z), MidpointRounding.AwayFromZero)
   ```
   - 界面区间：`[estVE × exp(−σ), estVE × exp(+σ)]`。
   - 注：上式 `tick` 参数位置用 `refreshEpoch`（不是刻号），保证同一轮次结果固定。
3. **类型误判**（L3 时；L4+ 永远正确，除非是假目标）：
   ```
   pConfuse = clamp(TypeConfuseMax × (4 − exposure), 0, TypeConfuseMax)        // exposure ∈ [3,4)
   若 Bernoulli(pConfuse)（同一 rng 流的下一次抽取）→ typeGuess = ConfusableWith[trueType]
   typeConfidence = 1 − pConfuse
   ```
   `ConfusableWith`：Armor↔MechInfantry，Artillery↔AirDefense，Infantry↔Recon，Headquarters↔Logistics，SpecialForces↔Infantry。
   真类型：01 提供 `GetBattalionKind(battalionId)`（返回 01 `Branch`，按下表映射到 `IntelTypeGuess`；🟡 R-20）。

   | 01 `Branch` | `IntelTypeGuess` |
   |---|---|
   | Armor | Armor |
   | MechInfantry、CombinedArms | MechInfantry |
   | MotorInfantry、LightInfantry、AntiTank、Engineer、Cbrn | Infantry |
   | Artillery、FireSupport | Artillery |
   | AirDefense | AirDefense |
   | Headquarters、Signal | Headquarters |
   | Logistics、Maintenance、Medical | Logistics |
   | Recon | Recon |
   | SpecialForces | SpecialForces |
   | Aviation、Other、None | Unknown |
4. **L5 误差**：`estStrengthFraction = clamp(true × exp(StatusErrorSigma × z2), 0, 1)`，`z2` 为同流下一次正态抽样；弹药、疲劳同理（`z3`、`z4`）。

### 4.7 欺骗：假目标（10.3）

#### 4.7.1 布设
- 条件：营的 `ReconConfig.deployDecoys == true`，营姿态 ∈ {Entrenched, Defending, Resting}，营持有 `decoy_vehicle` 或 `decoy_emitter` 器材。
- 营进入上述姿态满 `DecoyDeployH`（2 小时）后，在同一地块创建一个 `DecoyGroup`（每个营最多 1 个），收纳全部假目标器材。营离开地块或姿态变为移动类 → 收回（`DecoyRecoverH` = 1 小时后器材随营走；期间假目标组仍在原地，可以被打）。
- 敌方对 `DecoyGroup` 的暴露度按普通目标的全部规则增长（4.2、4.3）。在敌方界面上它显示为一个 `mimics` 类型、规模按 `VE_decoy` 的营（L2 误差同样适用）。

#### 4.7.2 识破
每个 Exposure 步，对每条 (c, decoy) 记录：
```
对每种在本步对它有正贡献的手段 m：
   若 exposure ≥ DiscrimLevel[m]：
       decoyRevealProgress += Discrimination[m] × (1 − DecoyQualityK × quality) × dtH
若 decoyRevealProgress ≥ 1 → isKnownDecoy = true（敌方界面标“假”；该记录不再增长；12/08 不再选它为目标）
```
- 期望值连续累积，不抽样（00 §6.2 方差规则）。
- 纯假辐射源（`VE_decoy == 0`）：只有电磁通道，ELINT 看得到；任何成像手段达到 `DiscrimLevel` 时，由于“没有车”，`Discrimination` × 3。

#### 4.7.3 被打击
- 打到假目标：消耗弹药；命中会摧毁假目标器材（07 按“软目标”处理）；VE 归零的假目标组删除。
- 打击方的 AAR 记“打击了假目标 ×N”（13）。只有当打击方通过战损评估（任何成像手段在打击后 `BdaWindowH` 小时内覆盖该地块）才知道；否则 AAR 显示“效果未知”。

### 4.8 固定设施（🟡 R-10）
- 后勤节点、机场、桥梁、工厂：**战争开始时**，各国对敌方全部固定设施的暴露度初始化为 `FixedSiteInitialExposure = 4.5`（L4，位置已知）；对其的衰减率 = 0（位置不会变）。
- 设施的 L5（库存多少、跑道是否可用）需要成像手段覆盖：任何 `MaxLevel ≥ 3` 的成像手段在过去 `FixedSiteStatusWindowH = 24` 小时内覆盖过该地块 → exposure 置 5.0，否则回落到 4.5。
- 06 的分散度设置：分散度对打击效果的影响见 06 §4.10（dispMult）。

### 4.9 我方暴露度估算（10.6；每 60 分钟）
对每个我方营 b 和每个敌国 e，维护两条**影子暴露度**，用与 4.3 **完全相同**的公式，只是输入换成“我方能知道的敌方侦察”：

| 输入 | `shadowLow`（只算确认的） | `shadowHigh`（加上推测的） |
|---|---|---|
| 敌方空中侦察 | 过去 60 分钟我方空情 `AirTrack`（08）里分类为敌方无人机/侦察机、且航迹经过 b 所在地块的时长 | 同左 + 敌方拥有该类资产（剧本已知装备清单）且 b 在其航程内时，假设 `AssumedUavCoverage = 0.5` |
| 敌方卫星 | 敌方卫星过顶时刻（轨道公开，**精确已知**） | 同左 |
| 敌方电子侦察 | 0 | 若敌方拥有 Elint 资产且 b 在其范围内，按全覆盖计算 |
| 敌方地面侦察 | 相邻地块中我方暴露度 ≥ L1 的敌方营，按其估计规模推算 `groundReconPower`（用我方的情报估计，不用真值） | 同左 × 1.5 |

- 影子值用真实的 `S_phys`、`S_emit`（自己的特征值自己知道）。
- 每次重算以 1 小时为 `dtH`，6 个 10 分钟子步（与真值一致的离散化）。
- `topContributors`：按影子 High 的本小时增量分解，取前 3。
- 建议（`hintKeys`），按条件依次判断，最多 2 条：
  1. `S_emit` 贡献 > 30% 且 emcon == Active → `hint_emcon_partial`；
  2. 姿态 ∈ {Assembling, Resting} 且 `levelHigh ≥ 4` → `hint_disperse_or_entrench`；
  3. `densityMult > 1.2` → `hint_reduce_concentration`；
  4. `camoKitFill < 0.5` → `hint_buy_camo`；
  5. `levelHigh ≥ 4` 且营无假目标器材 → `hint_decoys`。

### 4.10 区域侦察任务（10.6；每 60 分钟重算分配）
```
对任务的每个地块 t：
   bestLevel_t = 观察国在 t 内所有敌方目标（不含已识破假目标）的最高等级；无目标 → −1
   staleness_t = 该地块内目标的最小 AgeFactor（无目标 → 1）
   need_t = bestLevel_t < 0 ? SearchNeed
          : 1 + max(0, desiredLevel − bestLevel_t) + StaleWeight × (1 − staleness_t)
   risk_t = 08.AbstractUavAttritionPerH(owner, t, 任务中最主要的无人机型号)
   if risk_t > RiskThreshold[risk] → w_t = 0（跳过，F7 显示“风险过高，已跳过”）
   else w_t = PriorityWeight[priority_t] × need_t
dwellShare_t = w_t / Σ w        （Σ w = 0 → 全部为 0，任务挂起并通知）
```
- 空中资产（Flight）：08 按 `dwellShare` 安排轨道：每个资产按 `dwellShare` 比例在各地块上空盘旋（08 §4.4.7）。
- 中型无人机营：按 4.2.2 使用。
- 资产冲突：一个资产只能属于一个任务（新任务分配时从旧任务移除）。

### 4.11 特种部队侦察任务（§16）

#### 4.11.1 状态机
```
Planned → Inserting → OnStation → Exfiltrating → Completed
                   ↘ Compromised → (Exfiltrating | Destroyed)
```

| 阶段 | 持续 | 进入条件 / 规则 |
|---|---|---|
| Inserting | GroundInfiltration：`InfilH = 12`（只能从相邻己方控制地块，夜间开始；白天下令则等到天黑）；Parachute / HeliInsertion：由 08 §4.14 的运输飞行决定（Parachute → `Paradrop`：飞到目标地块 + 08 `LoadUnloadH[Paradrop]` + 08 `ParaAssemblyH`；HeliInsertion → `FastRope`：飞到目标地块 + 08 `LoadUnloadH[FastRope]`） | 地面渗透：开始时对该边上敌方营做一次发现判定 `pDetect = InfilDetectBase × min(2, 敌方该边相邻营的 groundReconPower 总和)`；空中：飞机被击落 → 机上 SOF 按 08 的结果损失 |
| OnStation | `durationDays` 或补给耗尽 | 每步按 4.11.2 产生情报（进缓冲）；每步消耗补给 `dtH / 24` 天 |
| Exfiltrating | 与 Inserting 同规则（撤出方式可以不同） | 完成后连回到出发地块，补给重置 |
| Compromised | 直到撤出完成或被消灭 | 每小时被消灭概率 `SofHuntPerH`；玩家/AI 应立即下令撤出（自动撤出：缺省开启） |

- **补给**：`suppliesDays` 初值 `SofSupplyDays = 5`；耗尽后每天战斗力 −20%（给 03 的疲劳 +0.2/天），并自动转为 Exfiltrating（🟡 R-14）。

#### 4.11.2 情报产出（OnStation）
```
对目标地块内每个敌方目标 x（含假目标）：
    gainPerH = Rate[SpecialForces] × sofSkill × channelSig(SpecialForces, x) × envFactor × (1 − vsGround(tile, x.country))
    pendingGain[x] += gainPerH × dtH
到 nextReportTime：把 pendingGain 逐项按 4.3 规则写入观察国记录（作为一次脉冲，cap = 5，难度按写入时等级），
                   清空缓冲，nextReportTime += reportIntervalH，reportEmitSpikeRemainingH = ReportSpikeH
```
- `sofSkill` = SOF 连的平均型号专有练度（02，侦察专业）。
- 设计意图：回报越勤，情报越新，但电台尖峰越多 → 越容易被敌方电子侦察发现（敌方对 SOF 小队的 `Elint` 封顶为 3，足以触发 4.11.3 的判定）。

#### 4.11.3 被发现与被消灭
- 敌方对 SOF 小队的暴露度按普通目标规则增长（敌方在该地块的营提供 `SameTileReconFactor` 的地面侦察；Elint 看回报尖峰）。
- 每步：若敌方对 SOF 的等级 ≥ `SofCompromiseLevel (3)`：
  `pCompromiseStep = 1 − (1 − SofCompromisePerH × (exposure − 2))^dtH` → 抽样（`For(Exposure, sofCompanyId, tick, SaltSofCompromise)`），命中 → `Compromised`。
- Compromised 期间每步：`pDestroyedStep = 1 − (1 − SofHuntPerH)^dtH`（`SaltSofDestroyed`）。命中 → 连被消灭：调用 `07.OnSofDestroyed(sofCompany)`（人员 `MissingOrCaptured` 50% / `Killed` 50%，由 07 抽样）。

#### 4.11.4 扩展（阶段 2+，🟡 R-15）
- 目标指示：对已达 L3 的单个目标，直接 `RegisterSelfFix`（L4，持续刷新），代价是特征值 × 2。MVP 缺省**关闭**。

---

## 5. 常数表

> 所有常数放 `data/tuning/05_recon_exposure.yaml`（G-15），键名 = 常数名的 snake_case。`confidence` 除注明外均为 `estimated`。

### 5.1 特征值

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `VeRef` | 50 | VE | 30–80 | 一个机步营约 30 辆装甲车 + 10–15 辆卡车 + 500 人 ≈ 50；使参考营在开阔地 sizeTerm = 1 |
| `VePerPerson` | 0.02 | VE/人 | 0.01–0.04 | 50 人的步兵目标 ≈ 1 辆车（估算） |
| `PostureMult[Entrenched]` | 0.35 | — | 0.2–0.5 | §10.2“长期挖壕最难发现”；俄乌经验：堑壕内步兵极难从空中识别 |
| `PostureMult[Defending]` | 0.6 | — | 0.4–0.8 | 已展开但工事不全 |
| `PostureMult[Resting]` | 0.7 | — | 0.5–0.9 | 休整：车辆集中、活动多 |
| `PostureMult[Assembling]` | 1.4 | — | 1.1–1.8 | §10.2“集结最容易暴露” |
| `PostureMult[Marching]` | 1.6 | — | 1.2–2.0 | 道路上的纵队 |
| `PostureMult[Attacking]` | 1.3 | — | 1.0–1.6 | 运动 + 开火 |
| `PostureMult[CrossingEdge]` | 1.8 | — | 1.4–2.2 | §11.1.2“行军纵队特征值很高” |
| `MarchModeMult[Dense]` | 1.15 | — | 1.0–1.3 | 密集纵队 |
| `MarchModeMult[Dispersed]` | 0.8 | — | 0.6–0.95 | 疏散（§11.1.2 🟡） |
| `TerrainConcealment[Open]` | 1.0 | — | — | 基准 |
| `TerrainConcealment[Urban]` | 0.5 | — | 0.3–0.7 | 建筑遮蔽 |
| `TerrainConcealment[Forest]` | 0.45 | — | 0.3–0.7 | 树冠遮蔽 |
| `TerrainConcealment[Mountain]` | 0.6 | — | 0.4–0.8 | 遮蔽 + 阴影；纳卡山地 |
| `TerrainConcealment[Mixed]` | 0.8 | — | 0.6–0.95 | 零散树木/建筑与开阔地交错；估算（10 M-02：TerrainType 无 Hills，起伏用 `elevStdM` 表达） |
| `TerrainConcealment[Marsh]` | 0.85 | — | 0.7–1.0 | |
| `TerrainConcealment[Water]` | 1.0 | — | — | |
| `CamoMaxReduction` | 0.35 | — | 0.2–0.5 | 多光谱伪装网对热/光学的典型削减量级（估算） |
| `CamoKitDefault` | 0.3 | — | 0–0.6 | 数据缺失时的缺省（🟡 R-18） |
| `FortMaxReduction` | 0.3 | — | 0.1–0.5 | 工事遮蔽，与姿态乘子叠加 |
| `DensityRefVe` | 150 | VE | 100–250 | 约 3 个营同处一格开始有拥挤惩罚 |
| `DensityK` | 0.5 | — | 0.2–1.0 | 平衡需要（集结代价） |
| `DensityMultMax` | 2.0 | — | 1.5–3.0 | 防止极端堆叠爆表 |
| `EmitRef` | 10 | — | 5–20 | 一个营部 + 各连电台 ≈ 10（营 `S_emit` ≈ 1） |
| `HqRadioDefault` | 3.0 | /Hq 班 | 1–5 | 指挥所电台网缺省 |
| `RadioEmconFactor` | Active 1.0 / Partial 0.5 / Silent 0.1 | — | — | 静默仍有有线/通信员/最小发射 |
| `RadarEmconFactor` | Active 1.0 / Partial 0.3 / Silent 0 | — | — | Partial = 间歇开机（08 可覆盖为实际开机比例） |
| `SofBaseSignature` | 0.08 | — | 0.03–0.15 | 小队规模极小 |
| `SofReportEmit` | 0.6 | — | 0.3–1.0 | 电台回报尖峰（§16） |
| `ReportSpikeH` | 0.5 | h | 0.2–1 | |
| `DecoyPostureMult` | 0.8 | — | 0.6–1.0 | 假目标“做得像但别太显眼” |

### 5.2 缺省车辆当量 / 地面侦察值（按类别）

| 类别（data/schema） | `vehicleEquivalent` | `groundReconValue` | `emitRadio` | `emitRadar` |
|---|---|---|---|---|
| `mbt`、自行火炮、火箭炮、`sam_long` 发射车 | 1.0 | 0 | 0 | 0（发射车）/ 雷达车 3.0 |
| `ifv`、`apc` | 0.8 | 0 | 0.1 | 0 |
| 卡车、轻型战术车 | 0.5 | 0 | 0 | 0 |
| 牵引火炮、`aa_gun_towed` | 0.6 | 0 | 0 | 0 |
| `sam_short`、`sam_medium`、`spaag`（自带雷达） | 1.0 | 0 | 0.1 | 1.0 |
| `radar_battlefield` | 0.5 | 0.3 | 0 | 0.5 |
| `radar_counter_battery` | 0.5 | 0.2 | 0 | 1.0 |
| `ew_vehicle` | 0.6 | 0 | 0.5 | 0 |
| `uav_micro` / `uav_hand_launched` / `uav_small_vtol` | 0 | 0.05 / 0.15 / 0.3 | 0.02 | 0 |
| `uav_tactical`（地面站计入） | 0.5 | 0 | 0.3 | 0 |
| 侦察车（类别由 01 定，暂按 `ifv` + 标记） | 0.6 | 0.12 | 0.1 | 0 |
| 单兵武器、`manpads` | 0 | 0 | 0 | 0 |

（数值 estimated；理由：使一个机步营 VE ≈ 50、S_emit ≈ 1；侦察连 groundReconPower ≈ 1。）

### 5.3 侦察手段参数

| 手段 | `Rate` /h（卫星为 `SatImpulse` /次） | `MaxLevel` | `PhysWeight` | `EmitWeight` | `Discrimination` /h | `DiscrimLevel` | 理由 |
|---|---|---|---|---|---|---|---|
| OpticalSatellite | 1.5（脉冲） | 3 | 1.0 | 0 | 0.3（每次过顶按 1 小时计） | 2 | §10.4：覆盖大、只在过顶时 |
| RadarSatellite | 1.0（脉冲） | 3 | 1.0 | 0 | 0.6 | 2 | SAR 能区分金属与充气假目标 |
| Elint | 1.5 | 3（雷达/HQ 4） | 0 | 1.0 | 0 | — | 完全取决于电磁管控 |
| LargeUav | 2.5 | 4 | 1.0 | 0 | 0.4 | 3 | 能长时间盯；2020 年 TB2 数小时内定位静止目标 |
| GmtiAircraft | 3.0 × movingFactor | 3 | 1.0 | 0 | 0 | — | 只擅长运动目标 |
| ReconPod | 4.0 | 3 | 1.0 | 0 | 0.3 | 2 | 快但停留短 |
| MediumUav | 1.8 | 4 | 1.0 | 0 | 0.3 | 3 | 战术级 |
| SpecialForces | 1.5 × sofSkill | 5 | 1.0 | 0.2 | 1.0 | 2 | 慢但最准 |
| GroundRecon | 1.0 × coverage | 4（接触 5） | 1.0 | 0.3 | 0.3 | 3 | 在地块战斗中积累 |

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `GmtiMovingFactor` | Marching/CrossingEdge 1.0；Attacking/Assembling 0.5；其他 0.05 | — | — | §10.4 |
| `SatMovingFactor` | 光学 0.3；雷达 0.5 | — | 0.1–0.8 | 运动目标在单次成像中难识别 |
| `CloudFactorExpected` | 0.6 | — | 0.3–0.9 | 南高加索年均云量量级（估算）；期望值，不抽样 |
| `SameMeansStackDecay` | 0.6 | — | 0.4–0.8 | 平衡（多架边际递减） |
| `MediumUavDutyCycle` | 0.4 | — | 0.2–0.6 | 起降、维护、天气 |
| `ElintStackMax` | 1.5 | — | 1–2 | |
| `AdjacentReconFactor` | 0.6 | — | 0.3–0.8 | 相邻地块目标可能在纵深 |
| `SameTileReconFactor` | 1.0 | — | — | |
| `GroundReconPowerCap` | 2.0 | — | 1.5–3 | |
| `StripReconBonus` | 1.5 | — | 1–2.5 | 接触中的侦察效率更高（04 缺省用） |
| `GroundNightBase` | 0.4 | — | 0.2–0.6 | 无热像夜间侦察差 |
| `SofNightFactor` | 0.8 | — | 0.6–1.0 | SOF 夜视器材 |

### 5.4 暴露度动态

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LevelDifficulty` | [1.0, 1.0, 1.5, 2.0, 3.0] | — | 每项 ×0.5–2 | 越精细的情报越难 |
| `DecayRate[Entrenched]` | 0.03 | /h | 0.01–0.06 | 不动的目标情报过时慢（半衰期约 23h） |
| `DecayRate[Defending]` | 0.04 | /h | 0.02–0.08 | |
| `DecayRate[Resting]` | 0.05 | /h | 0.02–0.1 | |
| `DecayRate[Assembling]` | 0.1 | /h | 0.05–0.2 | |
| `DecayRate[Attacking]` | 0.15 | /h | 0.1–0.3 | |
| `DecayRate[Marching]` | 0.3 | /h | 0.2–0.6 | §10.2“机动时衰减更快” |
| `DecayRate[CrossingEdge]` | 0.3 | /h | 0.2–0.6 | |
| `ObservedDecayFactor` | 0.25 | — | 0–0.5 | 被持续观测时只保留少量衰减（🟡 R-04） |
| `CapEpsilonTop` | 0.999 | — | — | 封顶在等级顶端 |
| `TileChangeRetain` | 0.7 | — | 0.5–0.9 | 🟡 R-07 |
| `TileChangeCap` | 3.999 | — | — | 换地块后 L4 失效 |
| `ExposureDropThreshold` | 0.05 | — | 0.01–0.1 | 内存 |
| `GhostIconHours` | 24 | h | 6–72 | 界面 |
| `FixedSiteInitialExposure` | 4.5 | — | — | 🟡 R-10 |
| `FixedSiteStatusWindowH` | 24 | h | 6–72 | |

### 5.5 情报使用

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LevelAccuracy` | [0, 0.05, 0.15, 0.35, 1.0, 1.0] | — | — | §10.5：L4 才能精确；L2–L3 面积打击效率很低 |
| `FixHalfLifeMs[Entrenched]` | 24 h | ms | 12–48 h | 位置几乎不变 |
| `FixHalfLifeMs[Defending]` | 12 h | ms | 6–24 h | |
| `FixHalfLifeMs[Resting]` | 6 h | ms | 3–12 h | |
| `FixHalfLifeMs[Assembling]` | 2 h | ms | 1–4 h | |
| `FixHalfLifeMs[Attacking]` | 30 min | ms | 15–60 min | |
| `FixHalfLifeMs[Marching]` | 15 min | ms | 5–30 min | 车队 15 分钟走 5–8km |
| `FixHalfLifeMs[CrossingEdge]` | 15 min | ms | 5–30 min | |
| `PrecisionMinAgeFactor` | 0.5 | — | 0.3–0.8 | 超过一个半衰期不允许精确打击（🟡 R-09） |
| `AreaStrikeFloor` | 0.1 | — | 0.05–0.2 | 面积打击最多 10 倍弹药 |
| `TleBaseM` | 30 | m | 10–100 | 无人机/卫星定位误差量级 |
| `TleL3M` / `TleL2M` / `TleL1M` | 500 / 2000 / 8000 | m | — | L3 知道大概阵地；L1 只知道在这格 |
| `SearchK` | 0.25 | /min | 0.1–0.5 | 校准：开阔地集结营（S≈1.2）被光电巡飞弹 1 分钟获取概率 ≈ 0.26；见 08 测试 |
| `PriorLevelBonus` | L0 0.3 / L1 0.5 / L2 0.8 / L3 1.0 / L4 1.5 / L5 1.5 | — | — | 知道去哪找就更快 |
| `SizeErrorSigma` | L2 0.4 / L3 0.25 / L4 0.15 / L5 0.05 | — | ±50% | §10.3“等级越低误差越大” |
| `StatusErrorSigma` | 0.15 | — | 0.05–0.3 | |
| `TypeConfuseMax` | 0.25 | — | 0.1–0.4 | L3 刚到时 25% 可能认错 |
| `IntelRefreshH` | 6 | h | 2–12 | 避免数字频繁跳变 |
| `BdaWindowH` | 6 | h | 1–24 | 战损评估窗口 |

### 5.6 欺骗、反侦察、任务、SOF

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `DecoyDeployH` / `DecoyRecoverH` | 2 / 1 | h | 1–6 | 充气假目标展开约 0.5–1 h，加布置 |
| `DecoyQualityK` | 0.7 | — | 0.5–0.9 | 最好的假目标把识破速度降到 30% |
| `CounterReconMax` | 0.5 | — | 0.3–0.7 | 反侦察不能让对方完全失明 |
| `CounterUavEwWeight` | 0.3 | — | 0.1–0.5 | 2020 年电子战对 TB2 效果有限（估算） |
| `CounterGroundReconWeight` | 0.3 | — | 0.1–0.5 | |
| `CounterGroundEwWeight` | 0.2 | — | 0–0.4 | |
| `EwVehiclesForFullCoverage` | 4 | 件 | 2–8 | 一个电子战连 |
| `SearchNeed` | 1.5 | — | 1–3 | 未知地块的搜索价值 |
| `StaleWeight` | 1.0 | — | 0–2 | |
| `PriorityWeight` | Low 1 / Normal 2 / High 3 | — | — | |
| `RiskThreshold` | Low 0.02 / Medium 0.08 / High ∞ | /h | — | 每小时损失概率门槛 |
| `AssumedUavCoverage` | 0.5 | — | 0.2–1 | 影子 High 的假设 |
| `InfilH` | 12 | h | 6–24 | 一夜徒步渗透 |
| `InfilDetectBase` | 0.05 | — | 0.01–0.2 | |
| `SofSupplyDays` | 5 | d | 3–10 | §16“补给只能维持几天” |
| `SofCompromiseLevel` | 3 | 级 | 2–4 | |
| `SofCompromisePerH` | 0.03 | /h/级 | 0.01–0.1 | L3 时约 3%/h，L4 时约 6%/h |
| `SofHuntPerH` | 0.1 | /h | 0.05–0.3 | 被发现后约 10 小时内多半被消灭 |

---

## 6. 与其他系统的接口

### 6.1 05 读取
| 来源 | 数据 | 时机 |
|---|---|---|
| 01 | 营的装备实例与类别、`role`、`GetBattalionKind`、`ModelBinding` | 每个 Exposure 步 |
| 02 | `GetSkill(formationId, specialtyId, modelId)`（通用练度、侦察专业练度） | 每步（可缓存 60 分钟） |
| 04 | `fortLevel01`（战斗中）、`StripReconSample`、营是否在活跃 `EdgeBattle`、炮兵营本步是否开火 | 条带步写缓冲；Exposure 步读 |
| 06 | 随行携带量 / 基数（L5 真值） | 估算刷新时 |
| 07 | 装备存活状态、营满编率 | 每步 |
| 08 | `ReconDwellSample` 缓冲；`AirDefenseRegistration.radarOnFraction`；`AbstractUavAttritionPerH`；我方 `AirTrack`（估算用） | 空中步写缓冲；Exposure 步读 |
| 09 | `Posture`、`MarchMode`、过边进度、`BattalionTileChanged` 事件、`IsNight`、挖壕进度（非战斗） | 每步 |
| 10 | `TerrainComposition`、相邻关系、地块中心 | 加载时 |
| 11 | `SoftwareDegradeFactor(CountryId, ModelHandle)`（11 §4.11；§4.2.2、§4.2.4 使用）；`SatelliteAsset.sharesWith` 由 11 §4.10.4 在情报共享生效时追加 | 每个 Exposure 步读；共享变化时写 |
| 14 | `SatelliteAsset`、战区地块列表 | 加载时 |
| 06/10 | 全部 `LogisticsNode`、`CrossingNode`（固定设施，开战时按 §4.8 初始化为 4.5） | 开战时 |

### 6.2 05 提供
| 使用者 | 接口 | 说明 |
|---|---|---|
| 03 / 04 | `GetLevel`、`GetAgeMs`、`ExposureAccuracyFactor` | 首轮精度、伏击条件（建议见 §6.3） |
| 04 | `PrecisionStrikeAllowed`、`AreaStrikeAmmoMultiplier`、`TargetLocationErrorM` | 地面跨地块火力 |
| 08 | 同上 + `SearchAcquireProbabilityPerMin`、`RegisterSelfFix`、`GetSignature(target)`（§4.4.7：`physical`、`emitter`、`emitterRadar`）、`AreaReconTask.dwellShare` | 空袭门槛、巡飞弹、侦察轨道 |
| 04 | `GetSignature(battalion).physical`（条带元素的 S_phys 取所属营的值） | 条带步 |
| 09 | `EmconState` → 命令延迟乘子：Partial ×1.15、Silent ×1.5（🟡 建议值，09 已采纳） | |
| 09 | `GetCommsJamming(tile, victimCountry)` = `min(1, max_{敌国 e}(ewCoverage(e, tile), 0.5 × max_{相邻地块 t'} ewCoverage(e, t')))`（`ewCoverage` 见 §4.1.5；阶段 0 恒 0；09 T-18） | 命令延迟的干扰项；03 的 `JamIntensity` 也可读它 |
| 09 | `StartAreaReconTask(owner, tiles, assets, desiredLevel, risk)`、`StartSofMission(sofCompany, tile, insertion, extraction, durationDays, reportIntervalH)`、`GetExposure(observer, target, now)`（§4.4.1；返回 `IntelSnapshot`：等级、时间戳、`TargetLocationErrorM`、`observedPosture`） | 侦察命令生效时；打击命令的情报快照 |
| 03 | `SensorProfile` 追加字段（03 C-08）：`OpticsClass opticsClassDay, opticsClassNight`（枚举由 03 §4.2.2 定义，05 只承载数据）；`SignatureProfile` 追加 `double engagementSigMult`（片段内的被发现系数，缺省 1.0，03 使用） | 片段创建时 |
| 12 | `ExposureRecord`（`lastKnownTile`、`lastObservedTime`、`isKnownDecoy`、`estimate`）只读（AI 和玩家一样只看情报画面） | 公平性 |
| 13 | `IntelEstimate`、`SignatureState` 分解、`lastGainByMeans`、`OwnExposureEstimate`、`AreaReconTask` 状态、`SofMission` 状态 | 显示 |
| 15 | 存档：`SectionId.Exposure = 40`（值见 15 §3.2）；组件：全部 `ExposureRecord`、`DecoyGroup`、`AreaReconTask`、`SofMission`、`OwnExposureEstimate`、`ReconConfig`；每个 `SatelliteAsset` 的当前 `sharesWith`（11 §4.10.4 运行时会追加受援国，读档后先载入 14 的静态卫星数据，再用存档里的 `sharesWith` 覆盖；其他字段不存）；缓冲区（`ReconDwellSample`、`StripReconSample`）也要存，因为它们跨刻；不存档（派生，读档后按 §4.1 重建）：`SignatureState`、`TileCounterReconState` | |

### 6.3 给 04 的建议（04 决定是否采纳）
- 战斗开始时，B 线的初始局部暴露度 = 05 的营级 `exposure`。
- **伏击条件**：防守方对进攻方 ≥ L3 且进攻方对防守方 ≤ L2 → 防守方首个片段可用 `EngagementType` 中的伏击修正（03 定义）。
- **间瞄首轮精度乘子** = `ExposureAccuracyFactor(level, ageMs, posture)`，下限 0.15（直接观察的观察员另算）。

### 6.4 RNG salt 表（`RngDomain.Exposure = 5`）
| salt | 值 | 用途 |
|---|---|---|
| `SaltIntelNoise` | 1 | 规模/状态误差、类型误判（同一流按固定顺序：z、Bernoulli、z2、z3、z4） |
| `SaltSofCompromise` | 2 | SOF 被发现 |
| `SaltSofDestroyed` | 3 | SOF 被消灭 |
| `SaltSofInfilDetect` | 4 | 地面渗透发现 |
| `SaltMediumUavLoss` | 5 | 中型无人机损失 |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| `VE = 0`（营全灭但实体还在） | `sizeTerm = 0` → `S_phys = 0`；记录只衰减；营被 01 删除时，相关记录一并删除 |
| `Σ share_t ≠ 1`（地形数据误差） | 归一化；全 0 时 `terrainMult = 1` |
| `EmitRef`、`VeRef` 为 0 | 加载校验拒绝（必须 > 0） |
| 同一步内既有换地块事件又有贡献 | 先处理换地块（4.3.3），再收集贡献 |
| 观察国 = 目标所属国 | 不创建记录（自己不观察自己；估算走 4.9） |
| 盟国 | MVP 不共享暴露度，只有卫星按 `sharesWith` 共享（🟡 R-12） |
| 过边中的营 | 两个地块的贡献都作用于它（4.1.2）；`lastKnownTile` 取归属地块 |
| 多个国家观察同一目标 | 各自独立记录 |
| 假目标所属营被消灭 | 假目标组保留到 `DecoyRecoverH` 后删除（无人回收） |
| 已识破假目标再次被新国家观察 | 识破是按观察国的，新国家从 0 开始 |
| 暴露度在一步内跨越多个等级 | 允许；难度按每种手段累加时的当前等级（4.3 第 2 步），不做等级内插 |
| 卫星过顶恰好在步边界（= stepStart + 10min） | 区间左闭右开，归下一步 |
| SOF 地块被己方占领 | 任务自动 Completed（无需撤出） |
| SOF 回报时目标已离开地块 | 缓冲照样写入（情报是旧的，`lastObservedTime` 取缓冲中该目标最后一次有增量的时刻） |
| `AreaReconTask` 地块全部高风险 | `dwellShare` 全 0，资产按 08 返航待命，通知玩家 |
| 中型无人机营在行军 | 不起飞（`Posture ∈ {Marching, CrossingEdge}` → `readyCount = 0`） |
| 阶段 0 | `GetLevel` 返回固定值；`AgeMs = 0`；其余函数照常 |
| 浮点 | `Math.Floor` 取等级；比较封顶用 `<=`；`DMath.Exp/Pow` 不直接用 `System.Math` |

---

## 8. 测试用例

> 下列数值可手算；保留 6 位小数。`dtH = 1/6`。

### T1 特征值
输入：VE = 50；Defending；地块 50% Open + 50% Forest；`camoKitFill = 0.4`、`camoSkill = 0.6`；`fortLevel01 = 0.5`；同地块本方 VE 合计 100。
计算：sizeTerm = 1；postureMult = 0.6；terrainMult = 0.5×1 + 0.5×0.45 = 0.725；camoQuality = 0.5；camoMult = 1 − 0.35×0.5 = 0.825；fortMult = 0.85；densityMult = 1（100 < 150）。
**期望**：`S_phys = 0.6 × 0.725 × 0.825 × 0.85 = 0.305044`（0.6×0.725 = 0.435；×0.825 = 0.358875；×0.85 = 0.305044）。

### T2 一步增长 + 被观测衰减
输入：T1 的目标；当前 exposure = 2.5；一架 TB2 全程在该地块上空（`f = 1 × 1.0 × 1.0`，coverage = 1）；白天；`vsUav = 0`；只此一种手段。
计算：gainPerH = 2.5 × 1 × 0.305044 = 0.762610；难度（band 2）1.5；g = 0.762610 / 6 / 1.5 = 0.084734；e = 2.584734（< 4.999）。observed = true；衰减 = 2.584734 × 0.04 × (1/6) × 0.25 = 0.004308。
**期望**：exposure = 2.580426；等级 L2。

### T3 封顶与“未被观测”
输入：exposure = 4.2，目标 Defending，雷达未开机，只有 Elint（cap 3 → 3.999）有 gainPerH = 0.3。
计算：排序后 Elint：`floor(3.999) = 3 < floor(4.2) = 4` → 不算 observed；e = min(4.2 + 0.05/1…, max(4.2, 3.999)) = 4.2（不增长）。衰减（未观测，×1）：4.2 × 0.04 / 6 = 0.028。
**期望**：exposure = 4.172；仍为 L4；`lastObservedTime` 不更新。

### T4 行军目标情报迅速过时
输入：exposure = 4.2，目标 Marching，无任何贡献。
计算：4.2 × (1 − 0.3/6) = 4.2 × 0.95 = 3.99。
**期望**：exposure = 3.99 → 降为 L3（失去精确打击资格）。

### T5 精度系数
输入：L4，`ageMs = 30 min`，posture = Marching（半衰期 15 min）。
计算：AgeFactor = 0.5^(30/15) = 0.25；LevelAccuracy[4] = 1。
**期望**：`ExposureAccuracyFactor = 0.25`；`PrecisionStrikeAllowed = false`（0.25 < 0.5）；`AreaStrikeAmmoMultiplier = 4.0`；`TargetLocationErrorM = 30 / 0.25 = 120 m`。
对照：posture = Defending（12 h）、age 30 min → AgeFactor = 0.5^(1/24) ≈ 0.971532 → 允许精确打击。

### T6 假目标识破
输入：敌方对假目标 exposure = 3.2（≥ LargeUav 的 DiscrimLevel 3）；TB2 全程覆盖；`quality = 0.5`。
计算：每小时进度 = 0.4 × (1 − 0.7×0.5) = 0.26；每步 0.043333。
**期望**：第 24 个 Exposure 步后 `decoyRevealProgress = 1.04 ≥ 1` → 识破（第 23 步为 0.996667，未识破）。即约 4 小时。

### T7 卫星脉冲
输入：光学卫星 quality = 1，白天，目标 Assembling 开阔地、VE = 50、camoMult = 0.825、fort 0、density 1 → `S_phys = 1.4 × 0.825 = 1.155`；exposure = 0.5（band 0，难度 1）。
计算：impulse = 1.5 × 1 × 1.155 × 0.6 × 1 = 1.0395；e = min(0.5 + 1.0395, max(0.5, 3.999)) = 1.5395；observed（cap 3 ≥ 0）→ 衰减 = 1.5395 × 0.1 / 6 × 0.25 = 0.006415。
**期望**：exposure = 1.533085（L1）。

### T8 区域任务分配
输入：任务 desiredLevel = L4，3 个地块：A（High，最佳等级 L2，staleness 1）、B（Normal，无已知目标）、C（Normal，最佳 L4，staleness 0.5）；风险都低于阈值。
计算：need_A = 1 + 2 + 0 = 3 → w = 3×3 = 9；need_B = 1.5 → w = 2×1.5 = 3；need_C = 1 + 0 + 1×0.5 = 1.5 → w = 3。Σ = 15。
**期望**：dwellShare A = 0.6，B = 0.2，C = 0.2。

### T9 SOF 被发现概率
输入：敌方对 SOF 的 exposure = 3.5。
计算：每小时 0.03 × 1.5 = 0.045；每步 `1 − (1 − 0.045)^(1/6)` = 1 − 0.955^0.166667 ≈ 0.007645。
**期望**：pCompromiseStep ≈ 0.007645（容差 1e-6，`DMath.Pow` 实现）。

### T10 堆兵代价
输入：同地块本方 VE 合计 300。
**期望**：densityMult = min(2, 1 + 0.5 × (300/150 − 1)) = 1.5。

---

## 9. 验证建议（Python）

> 脚本放 `tools/validate/05_*.py`，直接实现第 4 节公式（无引擎）。计划中的 V 编号由维护者映射。

| # | 验证 | 方法 | 通过标准 |
|---|---|---|---|
| R-V1 | **到达各等级的时间表** | 对 {姿态 7 种} × {地形 4 种} × {伪装 0/0.5/1} × {手段：1 架 TB2、2 架 TB2、中型无人机 1 营、地面侦察 1 连、SOF} 逐步积分，输出到 L1–L4 的小时数 | 开阔地集结营 + 1 架 TB2：L4 ≤ 3 h；山地挖壕伪装好的营 + 1 架 TB2：L4 在 10–24 h；单靠相邻地面侦察对防守营：L3 需 12–36 h；SOF 对防守营 L5 ≤ 36 h |
| R-V2 | **衰减与过时** | 去掉观测后，各姿态从 L4 掉到 L3 的时间 | 行军 < 30 min；挖壕 > 6 h |
| R-V3 | **纳卡 2020 情报画面合理性** | 用 14 的开局（阿方 TB2/Orbiter/Heron + Azersky；亚方以地面侦察、少量 Krunk 为主）跑 72 小时，只算暴露度 | 阿方对亚方一线防守营在 24 h 内多数达 L4；亚方对阿方集结部队多为 L1–L3；对阿方纵深炮兵/无人机地面站多为 L0–L2（与 2020 年亚方“看不见对手”的普遍叙述一致） |
| R-V4 | **假目标价值** | 1 个营带 4 套假目标 vs 不带，比较 48 h 内敌方精确打击落在真目标上的比例（打击方随机选 L4 目标） | 带假目标时，前 6 h 真目标被打比例下降 ≥ 30%；24 h 后基本被识破（差距 < 10%） |
| R-V5 | **电磁管控取舍** | 指挥部营 Active vs Partial vs Silent，敌方仅有 Elint | Active 在 6 h 内达 L4；Silent 停在 L0–L1 |
| R-V6 | **SOF 生存** | 回报间隔 2/6/12/24 h 下，5 天任务的存活率与情报新鲜度 | 2 h 回报：存活 < 60%；24 h：存活 > 85%；单调关系 |
| R-V7 | **参数敏感度** | 对 §5 每个常数 ±50%，看 R-V1 时间表变化 | 没有任何单个常数使结论翻转（如“挖壕比集结更容易发现”） |
| R-V8 | **确定性** | 同种子跑两遍，逐位比较所有 exposure | 完全一致 |

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| R-01 | 特征值拆成物理 / 电磁两个通道 | 采用；各手段按权重读取 | 让电磁管控和 ELINT 成为独立的决策与反制 | 单一特征值 |
| R-02 | 规模项形式 | `sqrt(VE / 50)` | 规模越大越容易发现，但边际递减；与“堆兵代价”的密度乘子分开 | 线性；对数 |
| R-03 | 姿态、地形、伪装乘子数值 | 见 §5.1 | 估算，待 R-V1 校准 | — |
| R-04 | 衰减规则 | 未被观测全速衰减；被观测时 ×0.25 | 总纲“停止侦察就会衰减”；保留少量衰减形成高等级的“维持成本” | 一律衰减；被观测时不衰减 |
| R-05 | 手段封顶的实现 | 按封顶升序累加，封顶值 = Lk + 0.999 | 确定、简单；低级手段推不进高级 | 每种手段单独维护分量取最大 |
| R-06 | 等级难度 | [1, 1, 1.5, 2, 3] | 高等级情报更难 | 不设难度 |
| R-07 | 目标换地块 | exposure × 0.7，且上限 3.999 | 精确位置必然失效 | 清零；不处理 |
| R-08 | `ExposureAccuracyFactor` 签名 | 增加 `posture` 参数（保留两参重载） | 不同姿态的情报过时速度差很多 | 只用两参，半衰期取统一值 |
| R-09 | 精确打击许可 | L4 且定位年龄 ≤ 1 个半衰期 | 总纲“情报越旧，命中率越低” | 只要 L4 |
| R-10 | 固定设施 | 开战即 L4（位置已知、不衰减），L5 需 24 h 内成像 | 仓库、机场、桥的位置和平时期就已知；把侦察价值放在“状态”上 | 设施也走完整暴露度模型 |
| R-11 | 中型无人机是否进空中层 | 不进，按营装备抽象成覆盖 + 08 的抽象损耗 | 数量多、价值低；空中层只放“组”级无人机（§2.1） | 全部进空中层 |
| R-12 | 卫星与盟国情报 | 确定性过顶表 + 期望云量 0.6；盟国只共享卫星，由剧本 `sharesWith` 开关 | 可复现；2020 年外部情报支持说法不一，交给剧本 | 盟国共享全部暴露度 |
| R-13 | 假目标模型 | 假目标是独立的“幽灵营”；识破进度按手段辨识率连续累积 | 有决策（买、布）、有反馈（被识破）、无需微操 | 假目标只降低真目标的暴露度增长 |
| R-14 | SOF 规则 | 情报到回报时才生效；回报引起电磁尖峰；补给 5 天；被发现后每小时 10% 被歼 | 把“回报频率”变成决策 | 情报实时生效 |
| R-15 | SOF 目标指示 | 阶段 2+，MVP 关闭 | 总纲标“以后可扩展” | MVP 就开 |
| R-16 | 我方暴露度估算 | 两条影子暴露度（确认的 / 加推测的），给区间 + 来源 + 建议 | 透明；不泄露敌方真实信息 | 直接显示真值（作弊） |
| R-17 | 区域任务分配 | 优先级 × 需求加权，风险门槛跳过 | 不用微操、可解释 | 玩家手动排轨道 |
| R-18 | 新增类别与伪装缺省 | 新增 `camo_kit`、`decoy_vehicle`、`decoy_emitter`；无数据时伪装器材覆盖率 0.3 | 让伪装、假目标成为可采购装备 | 伪装只看练度 |
| R-19 | 条带 → 05 接口 | 04 每条带步写 `StripReconSample`；接触中封顶 L5 | 总纲“地面侦察 L4–L5，在地块战斗中积累” | 05 自己估算条带内侦察 |
| R-20 | 情报误差与营类型 | 对数正态规模误差（σ 按等级）；L3 类型误判；营类型由 01 的 `GetBattalionKind` 提供 | 等级越低误差越大 | 无误差 |
| R-21 | 天气 | MVP 只有昼夜；天气系数恒为 1（光学卫星用期望云量） | 天气是第二优先（§21-20） | MVP 做简单天气 |
| R-22 | 给 04 的伏击与首轮精度建议 | 见 §6.3 | 把暴露度接到战斗起始条件（§10.5） | 04 自定 |
| R-23 | 电磁管控对命令延迟的影响 | Partial ×1.15、Silent ×1.5（09 采纳） | 静默必须有代价 | 不影响命令 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 物理特征值 / 电磁特征值 | `S_phys` / `S_emit`（`SignatureState.physical / emitter`） | 特征值的两个通道 |
| 车辆当量 | `vehicleEquivalent`（VE） | 计算规模项用的“相当于几辆车” |
| 特征值状态 | `SignatureState` | 营的特征值组件（含各乘子） |
| 暴露目标引用 | `ExposureTargetId` / `ExposureTargetKind` | 营、SOF 小队、假目标组、后勤节点、桥梁/渡口 |
| 情报估计 | `IntelEstimate` | 带误差的情报快照，玩家和 AI 只读它 |
| 观测样本 | `ReconDwellSample` | 08 写给 05 的空中观测时长 |
| 条带侦察样本 | `StripReconSample` | 04 写给 05 的地面侦察速率 |
| 卫星资产 | `SatelliteAsset` | 剧本给出的卫星过顶参数 |
| 假目标组 | `DecoyGroup` / `DecoyGroupId` | 营布设的假目标集合，被敌方当作一个营观察 |
| 识破进度 | `decoyRevealProgress` | [0,1]，到 1 识破 |
| 地块反侦察状态 | `TileCounterReconState` | 地块 × 国家的 `vsUav`、`vsGround` |
| 地面侦察力量 | `groundReconPower` | 营的侦察能力汇总（侦察连 ≈ 1） |
| 自主获取 | `RegisterSelfFix` | 平台自己找到目标并把暴露度提到 L4 |
| 精确打击许可 | `PrecisionStrikeAllowed` | L4 且定位未过时 |
| 目标定位误差 | `TargetLocationErrorM` | GNSS 弹药使用的定位误差 |
| SOF 任务阶段 | `SofMissionPhase` | 任务状态机 |
| 区域任务风险容忍度 | `ReconRiskTolerance` | Low / Medium / High |
| 地块优先级 | `TilePriority` | 区域任务里地块的权重 |
| 情报类型猜测 | `IntelTypeGuess` | 敌方营的类型（L3） |
| 新装备类别 | `camo_kit`、`decoy_vehicle`、`decoy_emitter` | 伪装器材、假车辆、假辐射源（待加入 `data/schema/categories.yaml`） |
