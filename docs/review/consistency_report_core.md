# 一致性审查报告：模拟核心（第 1 部分）

范围：`00_glossary`、`01`–`10`、`15`。11–14 只作为接口的另一端检查，没有修改（见第 5 节“交给第 2 部分”）。
配套文件：[decisions_core.md](decisions_core.md)（待确认决策汇总）。

## 1. 概况

| 项 | 数量 |
|---|---|
| 发现的问题总数 | **213**（接口核对 186 条 + 主审查自查 27 条） |
| 已直接修复 | **187** |
| 移入决策清单 | **19**（另有 4 条“修复 + 决策”，修复了接口部分，取舍部分进入决策清单） |
| 交给第 2 部分 | **7**（另有 6 条“核心侧已修，11–14 侧待改”） |
| 🟡 条目 | 去重前 252 条（规格内）+ 21 条（审查新增）→ 合并后 208 行待决：**A 46 / B 142 / C 20**；另有 14 行由审查直接解决 |
| 修改的文件 | 00、01、02、03、04、05、06、07、08、09、10、15、`data/schema/categories.yaml` |

方法：4 个只读子 agent 分别核对 01/02/07、03/04、05/08、06/09/10/15 第 3、4、6 节中的每一处跨规格引用（名称、签名、单位、频率、语义），并反查别的规格对它们的调用。原始报告存在会话的 scratch 目录（`report_A…D.md`）。随后由 5 个修复 agent 按文件分工修改（每个文件只有一个修改者），主审查最后统一核对，并处理修复后新出现的问题。

问题编号：`A.Cnn` = 01/02/07 报告，`B.I-nn` = 03/04 报告，`C.Xnn` = 05/08 报告，`D.C-nn` = 06/09/10/15 报告，`L-nn` = 主审查自查。

## 2. 接口矩阵（精简）

“初查”是修复前的状态，“现状”是本轮修复后的状态。每个接口只列一次。

| 调用方 → 被调方 | 接口 / 数据 | 初查 | 现状 |
|---|---|---|---|
| 04 → 03 | `CreateEngagement(SectorContext, …)` | `SectorContext` 未定义、缺字段 | ✅ 03 §3.2 定义 `SectorContext`，04 补齐字段 |
| 04 → 03 | `ForceEnd(EngagementId)` | 缺失 | ✅ 03 §4.10 |
| 04 → 03 | `EngagementResult`（含 `reconCoverage`） | 缺少侦察覆盖 | ✅ |
| 03 → 04 | 读条带地形 | 未做方向变换 | ✅ 04 `TerrainAtBattle` |
| 03 ↔ 04 | broker 排队键、发射间隔、`fireAt` 修正 | 两处写法不同 | ✅ 统一按 04 §4.9.4、03 §4.5.4 |
| 03 → 06 | 班弹药存储 | 03、06 各有一份 | ✅ 唯一存储 06 `SquadCarriedState`；03 用片段内缓存 |
| 06 → 03 | `defaultLoad` / `munitions` / `roundWeightKg` / `caliberGroup` / `shelfClass` / `warheadKg` | 字段名不同、字段缺失 | ✅ |
| 03 → 07 | `ApplyCasualty` / `ApplyVehicleDamage` / `RollVehicleDamage`（`Aspect`） | 参数个数不对；`Aspect` 未定义 | ✅ `Aspect` 归 03；签名照抄 07 |
| 03 → 01 | `GetRequestChain(NodeRef)` / `IsAttachedHop` / `coordinationFactor` | `NodeOwner` 未定义；03 自己重算 | ✅ |
| 01 → 03 | `GetSystemMassKg` / `ComputeDismountLoadKg` / `Effectiveness` / `GetMaxRangeM` / `CapIndex(model)` | 缺失 | ✅ 03 §6.4 |
| 03/07 → 02 | `GetSkillForBattalion` | 用 `GetSkill(FormationId)`，与归属不符 | ✅（空军归属见 DC-089） |
| 03/04 → 02 | `CombatExperienceReport` | 04 不提交 | ✅ |
| 03/04 → 05 | `TargetLocationErrorM`、`opticsClass*`、`engagementSigMult`、`GetSignature` | 公式重复、字段缺失 | ✅ |
| 03 → 09 | 光照枚举 | `LightLevel` 与 `LightCondition` 重复 | ✅ 统一用 09 `LightCondition` |
| 03/04 → 15 | 地形和缓存的随机流 | 用 `For`（混入了世界种子） | ✅ `Rng.ForKey` |
| 04 → 06 | `NodeStrikeEvent`（`WarheadClassOf`、`ulong` 来源 ID） | 缺映射；类型不一致 | ✅ 06 增加 `WarheadClassOf` |
| 06 → 04 | `IStripQuery` / `StripElementInfo` | 类型未定义 | ✅ |
| 04 ↔ 08 | `SelectCasTarget` / `CancelScheduledEvent` / `OnLoiteringResult` / `LaunchLoiteringSearch` / `RegisterGroundLaunchedMissile` / `SetTileLocalPos` / 经纬度换算 | 缺失 | ✅（`CasPlatformClass` 归 08） |
| 08 → 04 | 对地事件队列与排序键 | 键缺 `TickPhase`/`domainOrder` | ✅ |
| 04 ↔ 12 | `DoctrineProfile`、条带条令决策 | 两处定义、互相冲突 | ⏳ DC-101、DC-102 |
| 04/05 → 09 | `GetEntrenchProgress` | 缺失 | ⏳ DC-165 |
| 09 → 04 | `JoinBattle(asCounterattack)` / `HasEffectiveCompanies` / `QueueCrossTileStrike(Order)` | 缺失、类型不对 | ✅ |
| 09 → 04 | `AttackerCompaniesAllOnOwnSide` 的语义 | 接触线 vs y < 0 | ⏳ DC-024 |
| 08 → 05 | 观测姿态、观测位置、`GetSignature`、`GetExposure` | 缺字段、缺函数 | ✅ |
| 05 ↔ 08 | `ReconDwellSample`（`sourceKind`、`nightFactor`）、`radarOnFraction` 窗口 | ID 可能冲突；窗口差一步 | ✅ |
| 08 → 06 | 节点、桥梁、交通线打击 | 在阶段 90 直接调用 | ✅ 排队到 110 应用 |
| 08 → 06 | `TryDrawFromNode` / `ReturnToNode` | `ReturnToNode` 缺失 | ✅ |
| 08 → 07 | 飞机故障率 | 08、07 重复定义 | ✅ 07 `ReliabilityProfile.failurePerFlightH` |
| 08 → 09 | `StrikeTargetKind` / `targetEntityId` | 两处定义；int 与 ulong | ✅ 归 09 |
| 08 → 11 | 弹药单价 | 08 重复定义 `costMusd` | ✅ 用 11 `ProcurementProfile.costMusd` |
| 08 → 10 | 地块高程、MaskFactor 地形 | 名称不对；用了 Hills | ✅ |
| 08 → 01 | `CreateRearDetachment` | 缺失 | ✅ 01 §3.5/§6.1（留守人员如何排除见 DC-207） |
| 08 → 09 | 打击用哪一刻的情报 | 与 T-21 冲突 | ⏳ DC-044 |
| 08 ↔ 04 | 空袭瞄准点模型 | 两套模型 | ⏳ DC-155 |
| 09 → 00 | 阶段频率（检查点、空中步、条带消耗、和平时期 AI、阶段战报） | 多处写死数值；阶段放错 | ✅ |
| 09 → 01 | `CommandState.quality` / `orderDelayMultiplier` / 整编倍率 | 函数名不对；缺整编项 | ✅ |
| 09 → 05 | `CrossTileReconPayload` → `StartAreaReconTask` / `StartSofMission` | 字段不全 | ✅ |
| 09 → 06 | `IsOutOfFuel` / `ApplyConfig` / `distanceMovedLastHourM` | 缺失 | ✅ |
| 09 → 10 | `RoadFactor` 的键 | 用错枚举 | ✅ `ToMarchRoadClass` |
| 09 → 12 | 影响力图访问 | 函数名不对 | ✅ `InfluenceMap.Get` |
| 09 → 15 | `InputLog.Append(InputKind, bytes)`、`CancelOrder` | 签名不对、缺枚举成员 | ✅ |
| 01/02/05 → 09 | `IsInBattle` / `OnBattalionLeftBattle` / `BattalionTileChanged` / `GetBattalionPosition` / `GetLightConditionAtEdge` | 缺失 | ✅ |
| 全部 → 09 | 营的 ID 类型 | `BattalionId` 与 `OrgUnitId` 混用 | ✅ 统一 `OrgUnitId`（00 §2.2） |
| 07 → 02 | `DrawFromTrainedPool` / `JoinSquad` / `LeaveSquad` / `ReleaseToPool` / `MedicalDischarge` | 名称不对、缺失；07 直接改名册 | ✅ |
| 07 → 01 | 库存表示；`RepairThroughputMult` | 用了不存在的 `EquipmentDepotStock`；未调用 | ✅ |
| 01 → 07 | `PartsPerItemPerYear`；撤编 | 缺失；两处定义 | ✅ |
| 01 ↔ 07 | `ReorgPolicy` 枚举 | 两个枚举、整数值相反 | ✅ 类型统一（是否保留两个开关见 DC-014） |
| 07 → 06 | `TryDrawParts` / `RequestTransport` 返回 `SimTime` / `NearestDepot` | 缺失；签名不对 | ✅ |
| 02 → 06 | `ComputeBasis(OrgUnitId)` / `ConsumeForTraining(OrgUnitId, …)` / `FuelDensityTPerL` | 缺少重载和函数 | ✅ |
| 02 → 11 | `trainingOverride` / `defaultTraining` | 字段名不对；两处存覆盖 | ✅ |
| 01 → 11 | 战备等级维护费倍率 | 数值冲突 | ✅ 以 11 `TierOmFactor` 为准 |
| 06 → 10 | `ActiveRoad`/`ActiveRail`/`Cls`/`bypasses`/`TopologyVersion` | 读基础版本；字段名不对 | ✅ |
| 06 → 09 | `SupplyCut` / `ReserveGap` 通知 | 未发送；枚举缺成员 | ✅ |
| 06 → 14 | `rail_fleet_payload_t` / `national_truck_payload_t` | 14 没有提供 | ⏩ 第 2 部分 |
| 10 → 14 | `ControlSnapshot`、地图路径 | 14 自己做多边形判定 | ⏩ 第 2 部分 |
| 全部 → 15 | 各规格的存档清单 | 02/03/04/06/07/09/10 缺失 | ✅ 每个规格 §6 增加一行 `SectionId` |
| 10 → 15 | `MapState` 是否存档 | 未定义 | ✅ 派生量，读档后重算 |
| 13 → 15 | `StarredSet` 存哪个段；`InputKind.OrgEdit/UnitAdmin` | 无归属段；缺成员 | ✅ 15 侧已改；13 侧待改 |
| 00 §5.2 ↔ 各规格 | Calendar 归属（01/06/09/10）、阶段 120 的消耗 | 漏登记；重复扣减 | ✅ |
| 00 ↔ 各规格 | 枚举成员（FireMode、TargetClass、DepthBand、NodeRole、AirMissionType、TerrainType）、Profile 表、`ExposureAccuracyFactor` 签名 | 过时 | ✅ |

## 3. 问题清单

状态：F = 已修复；D = 移入决策清单；H = 交给第 2 部分；F+D、F+H = 核心侧已修，余下部分进入决策清单或交给第 2 部分。

### 3.1 主审查自查（L-01–L-27）

| 编号 | 涉及 | 问题 | 状态 |
|---|---|---|---|
| L-01 | 03/06（04 E-16） | 班弹药同时存在 03 `SquadAmmoState` 与 06 `SquadCarriedState` | F：03 改为 `EngagementAmmoCache`（片段内缓存），给出创建、写回规则 |
| L-02 | 03/04（E-11） | 缺 `ForceEnd` | F |
| L-03 | 03/06/08（L-24） | `MunitionProfile` 缺 `caliberGroup/shelfClass`；06/08 用了不存在的 `massKg`、`defaultAmmoLoad`、`acceptedMunitions` | F |
| L-04 | 03/08 | `warheadKg` 在 03、08 各定义一次 | F：只留 03 的通用字段 |
| L-05 | 06/07（H-07） | 缺 `TryDrawParts` | F |
| L-06 | 06/08（A-14） | 缺 `ReturnToNode` | F |
| L-07 | 05/08/10（M-02） | 用了 `Hills`/`Wetland`；缺 `Mixed` | F（`TerrainConcealment[Mixed] = 0.8` 为估算，见 DC-192） |
| L-08 | 00/10（M-08） | dated override 没有在 00 §5.2 登记 | F |
| L-09 | 09/10（M-18） | 边中点定义不一致 | F |
| L-10 | data | 缺 8 个装备类别 | F |
| L-11 | 01/07 | `ReorgFillMode` 与 `ReorgPolicy` 重复，整数值相反 | F+D（DC-014） |
| L-12 | 03/09 | `LightLevel` 与 `LightCondition` 重复 | F |
| L-13 | 00 | 枚举行、Profile 表、`ExposureAccuracyFactor` 签名过时 | F |
| L-14 | 00 | 01–10、15 的新增术语没有合并 | F：00 §1.12 |
| L-15 | 00 | 归属表缺少各规格新增的组件和实体 | F：00 §4.2 新增 11 行 |
| L-16 | 01/04/08/data | `loitering_munition` 既当发射单元又当弹药 | D（DC-205）+ H |
| L-17 | 03/data | 地面弹药型号没有类别 | D（DC-206）+ H |
| L-18 | 07/08 | 修复后 08 用 `mtbfH`，07 新增了 `failurePerFlightH` | F：08 读 `failurePerFlightH` |
| L-19 | 05/02（A.C53） | 伪装练度应读 02 `UnitAverageGeneral` | F |
| L-20 | 00/09 | 24 h 阶段战报：00 已移到 150，09 仍在日分支里检查 | F |
| L-21 | 04/09/13 | `SetFireSupportPriority` 没有命令通道 | F：09 `UnitConfigField.FireSupportPriority = 9` |
| L-22 | 04/06 | `WarheadClassOf` 未定义 | F：06 §3.1 |
| L-23 | 04/08 | `CasPlatformClass` 未定义；08 的弹药仍用字符串 ID | F：08 新增枚举，弹药一律改用 `ModelHandle` |
| L-24 | 04/06 | 打击事件的来源 ID 仍按 `int` 转换 | F：`ulong` |
| L-25 | 00/04/09 | 条带消耗在 80 和 120 各扣一次 | F：120 只处理地块层驻止部队 |
| L-26 | 01/03/04/09 | 留守分队的人员仍会被算进参战和位置 | D（DC-207） |
| L-27 | 05/08 | 08 的射频搜索打不到节点上的雷达 | D（DC-208） |

### 3.2 01/02/07 报告（A.C01–C54）

- **F（47 条）**：C01–C12、C14–C24、C26–C30、C32、C35–C45、C48、C50、C52、C53。另外，C25、C46、C47 核心侧已修（分别为 F+D、F+H、F+H）。
  - 要点：07 改为通过 02 的 API 写名册；02 增加 `ReleaseToPool`、`MedicalDischarge`、`PresentCount`、`OnEquipmentAssigned`；01 增加 `NodeKind.Formation` 和 `RearDetachment`，改用 `SkillHolderKey`；07 增加 `PartsPerItemPerYear`、`RecoveryClass`、`MunitionGroupOf` 重载、`ApplyAggregateLosses`。
  - 修复时做的小取舍：02 的 `MedicalDischarge` 也删除记录，避免继续计饷；01 的 `RearDetachment` 只标记物理分离（后续见 DC-207）；`ApplyAggregateLosses` 按每人 Bernoulli 抽样。
- **D（4 条 + 1 条部分）**：C13 → DC-014；C31 → DC-090；C51 → DC-091；C54 → DC-075；C25 的空军部分 → DC-089。
- **H（3 条）**：C33（11 `MobilizationTarget`）、C34（11 `GetUnitCostMusd`）、C49（14 调用 01 时用的函数名）。

### 3.3 03/04 报告（B.I-01–I-47）

- **F（41 条）**：I-01–I-10、I-14、I-15、I-17–I-30、I-33–I-37、I-39–I-47，加上 I-31 的 04 部分（F+H）。
  - 要点：新增 `Aspect`、`OpticsClass`、`SectorContext`；新增 03 §6.4 提供函数表；04 新增 `TerrainAtBattle`、`LatLonToBattle`、`HasEffectiveCompanies`、`SelectCasTarget`、`StripElementInfo`、`SetTileLocalPos`；新常数 `EngReconRatePerH`（E-17）；Marsh/Water 地形表数值（C-19）。
- **D（5 条）**：I-11 → DC-101；I-12 → DC-102；I-13 → DC-165；I-16 → DC-024；I-38 → DC-156。
- **H（1 条）**：I-32（11 BorderSkirmish → DC-046）。I-31 中 03 的 5 个统计结构交给 13。

### 3.4 05/08 报告（C.X01–X45）

- **F（41 条）**：X01、X02、X05–X39（X31、X37 为部分修复）、X42–X45。
  - 要点：`IntelEstimate.observedPosture`、观测位置、`GetSignature`/`GetExposure`、`ReconConfig`、`ExposureTargetKind.Crossing`、Branch→IntelTypeGuess 映射表；08 的打击事件在阶段 110 应用；`AirTargetValue` 改名；去掉与 11、07 重复的字段。
- **D（3 条 + 2 条部分）**：X03 → DC-155；X04 → DC-044；X40 → DC-156；X31 的挖壕部分 → DC-165；X37 的数值部分 → DC-201。
- **H（1 条）**：X41（11 的软件保障衰减）。

### 3.5 06/09/10/15 报告（D.C-01–C-40）

- **F（35 条）**：C-01、C-02、C-04–C-12、C-15–C-30（C-20、C-21 合并进 C.X32、C.X18）、C-32–C-36、C-38、C-39，加上 C-03 的 15 侧（F+H）。
  - 要点：09 的阶段频率不再写死；09 移动改成两遍算法；`BattalionId` → `OrgUnitId`；06 改用 `ActiveRoad` 等历史版本接口；06 新增 `ApplyConfig`、`NearestDepot`、`RoadDistanceM`；15 补 `InputKind`、修正自动存档触发刻；10 修正记录字节数、定义 `MapState`。
  - 存档清单：所有核心规格的 §6 都有一行 `SectionId`；10 没有存档段（`MapState` 是派生量）；06 的 `SupplyGraph` 只把拓扑当作派生量，弧上的可变量（`capFactor`、`lossFraction`、流量 EMA）要存档。
- **D（3 条）**：C-13 → DC-024；C-14 → DC-165；C-40 → DC-195。
- **H（2 条）**：C-31（14 运力参数）、C-37（14 改用 10 的地图输出）。

### 3.6 已知的轻微遗留（不影响实现，未单独计数）

- 09 测试 T1 的文字仍把 F_load 解释为 load/capacity；数值不变。
- 09 用两个平行列表传 `areaTiles` 和 `tilePriorities`，05 收的是 `List<(H3Index, TilePriority)>`；09 激活命令时把它们按下标合并，语义清楚。
- 08 巡飞弹的 `nightFactor` 取 1.0（修复 agent 的取舍；R-V1 时复核）。

## 4. 对规格作者的后续提醒

- 规格第 10 节的原 🟡 表没有删除；实现时以 [decisions_core.md](decisions_core.md) 的最终结论为准。
- 修复中新增的 🟡（H-18、H-19、C-19、E-17）都已写进对应规格第 10 节，并收进决策清单的 C 级。

## 5. 交给第 2 部分（11–14 与数据）

| # | 规格/数据 | 内容 | 来源 |
|---|---|---|---|
| 1 | 13 | `13_ui.md:510` 写的是“06 SquadAmmoState”，应改为 06 `SquadCarriedState`（经 `GetAvailable` 汇总） | L-01 |
| 2 | 13 | `13_ui.md:668, 1685` 的 `LightLevel` → 09 `LightCondition` | L-12 / B.I-01 |
| 3 | 13 | `StarredSet` 写明“存在 15 `SectionId.Scheduler`” | D.C-03 |
| 4 | 13 | 03 的 `DetectionStats`、`ExposureCausedStrikes`、`SquadTemplateStats`、`ProvingGroundSpec`、`ProvingGroundReport` 尚未定义；需要 13 给出字段需求后由 03 补 | B.I-31 |
| 5 | 13 | 火力支援优先改为通过 09 `UnitConfigField.FireSupportPriority = 9`；发射后转移用 `RelocateAfterFiring = 8`；布设假目标用 `DeployDecoys = 7`；后勤配置用 06 `LogisticsConfigChange`；编制编辑用 15 `InputKind.OrgEdit/UnitAdmin` | L-21 / C.X18 / D.C-16 / D.C-02 |
| 6 | 13 | 行政命令的延迟规则待 DC-041 决定后同步（13:1493 目前写“无延迟”） | DC-041 |
| 7 | 11 | 补 `MobilizationTarget(OrgUnitId, SpecialtyHandle, SimTime)`、`GetUnitCostMusd(ModelHandle)` 的声明 | A.C33 / A.C34 |
| 8 | 11 | 软件保障衰减“交给 05/08”，但 05/08 没有读取方：要么 05/08 加 `SensorDegradeFactor`，要么删掉这句 | C.X41 |
| 9 | 11 | BorderSkirmish 需要 04/09 支持（DC-046） | B.I-32 |
| 10 | 11 | 核心规格现在依赖的 11 字段：`trainingOverride`/`defaultTraining`（02）、`WarSideState.killedCumulative`（07）、`ProcurementProfile.costMusd` 作为弹药单价（08）、`TierOmFactor`（01）。请确认名称与语义 | A.C32/C35/C36、C.X10 |
| 11 | 11/00 | `VlsLoadoutTemplate` 的归属改为 01（DC-075），00 第 126 行待改 | A.C54 |
| 12 | 12 | 补 `RequestBattalionRotation(OrgUnitId)`（07 已调用） | A.C46 |
| 13 | 12 | 代理结算的损失改为调用 07 `ApplyAggregateLosses(bn, personnelLossFrac, vehicleLossFrac, tick)` | A.C47 |
| 14 | 12 | `DoctrineProfile` 的归属（DC-101）、条带条令由谁决策（DC-102）；03 `SectorContext.doctrine` 的类型随之调整 | B.I-11/I-12 |
| 15 | 12 | 12 的 `TargetValue` 与 08 的 `AirTargetValue` 分开调参（DC-201） | C.X37 |
| 16 | 14 | 调用 01 时使用 01 的函数名：`InstantiateFormation`、`CreateOrganicFormation`、`AllocateEquipment(CountryId, IEnumerable<OrgUnitId>)` | A.C49 |
| 17 | 14 | 国家数据补 `rail_fleet_payload_t`、`national_truck_payload_t: {none, partial, full}` | D.C-31 |
| 18 | 14 | 改读 10 的 `data/map/*.bin` 和 `ControlSnapshot`（`nk_loc_1994` 等），删除多边形判定 | D.C-37 |
| 19 | 14 | 存档清单：`SectionId.Scenario = 70` 写进 14 §6 | D.C-04 |
| 20 | 14 | 05 不再要求 14 提供“初始固定设施清单”（改从 06/10 读）；14 需要提供 `SatelliteAsset` 和 `sharesWith` | C.X43 / DC-119 |
| 21 | 14 | G-13 阿尔察赫部队的建模（DC-002）；V2 校准目标区间（DC-190） | — |
| 22 | data | 合并 `data/*_pending` 时：`loitering_munition` 的语义（DC-205）；地面弹药类别（DC-206）；categories.yaml 已加入 8 个新类别，`group` 新增 `personal_equipment`、`deception` | L-10/L-16/L-17 |
| 23 | data | 03 运行时改用句柄（`ModelHandle munitions[]`、`List<(ModelHandle, int)> defaultLoad`），YAML 仍写 snake_case id，加载器负责转换 | B.I-37 |
| 24 | 00 | 11–14 的新增术语尚未合并进 00 §1.12（本轮只合并了 01–10、15） | — |
