# 第二阶段跨系统一致性审查报告（战略 11、AI 12、界面 13、剧本 14 与静态数据 `data/`）

> **审查范围**：`docs/spec/11_strategic_layer.md`、`docs/spec/12_ai.md`、`docs/spec/13_ui.md`、`docs/spec/14_scenario_nk.md`、`data/` 目录下全部 YAML/JSON 数据文件及 `tools/validate_data.py`，并反向复核与核心规格 `00–10`、`15` 的跨系统契约、术语总表（`00_glossary.md §1.12`）及一期遗留项（`DC-201..DC-206`）。

---

## 一、总体结论与统计概览

1. **总体结论**：经过第二阶段审查与原位修复，战略/政治层 `11`、四层 AI 系统 `12`、玩家界面 `13`、纳卡剧本 `14` 与核心模拟层 `00–10`、`15` 之间的函数签名、枚举取值、单位量纲、阶段时序、存档段号、输入日志种类及静态数据引用已全面闭合。`python3 tools/validate_data.py` 对全仓库 `data/`（含装备、弹药、专业、风格、预设模板、`nk_2010` 与 `nk_2020` 两个完整剧本）校验结果为 **`0 ERROR, 10 WARN`**（10 条 WARN 均为史料编制与现代标准的已知合理差异，属于 `V-02` 白名单）。
2. **问题发现与修复统计**：

| 审查模块 | 发现问题数 | 直接修复（改规格/数据） | 登记为新增 🟡 决策 | 跨文件补齐接口（`00–09/15`） | 状态 |
|---|---:|---:|---:|---:|---|
| `11` 战略、采购、预算与政治 | 21 | 21 | 3（`S-20..S-22`） | `06/07/08/09/14` 对齐 | ✅ 全部闭环 |
| `12` AI 系统（L1–L4 + 代理模型） | 19 | 19 | 3（`I-24..I-26`） | `00/04/07/08/09/11/13/14/15` 对齐 | ✅ 全部闭环 |
| `13` 玩家界面与交互 | 27 | 27 | 3（`U-26..U-28`） | `01/02/06/07/09/12/14/15` 补齐写接口与核心视图 | ✅ 主干闭环（次要预览标 `★`） |
| `14` 纳卡剧本（2010 / 2020） | 23 | 23 | 4（`N-21..N-24`） | `01/02/05/06/08/10/11/12/13` 对齐 | ✅ 全部闭环 |
| `data/` 静态数据与 `validate_data.py` | 18 | 18 | 3（`O-21/O-22/P-22`） | 解决 `DC-205`、`DC-206`，扩展校验器至 9 类检查 | ✅ `0 ERROR, 10 WARN` |
| `00` 术语总表收尾（`§1.12.11–1.12.15`） | 1 | 1 | 0 | 补齐 `11–15` 全部新增术语索引（含 `§1.12.12` AI 25 项） | ✅ 全部闭环 |
| **合计** | **109** | **109** | **16** | — | **✅ 完成** |

---

## 二、跨系统接口对齐矩阵（11–14 ↔ 00–15 & `data/`）

| 调用方 \ 被调方 | `00` 纲要 | `01` 编制 | `02` 人员 | `03/04` 战斗 | `05` 侦察 | `06` 后勤 | `07` 损伤 | `08` 空中 | `09` 时间/命令 | `10` 地图 | `11` 战略 | `12` AI | `13` 界面 | `14` 剧本 | `15` 存档 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **`11` 战略** | 阶段 80 `Calendar`、`CountryId` | `GetForceRequirement`、`AllocateEquipment`、`ToolsetState` | `HeadcountByPayCategory`、`OnModelUpgraded`、`SchoolState` | `WarEnded` 经 09 停战 | `SatelliteAsset.sharesWith`、`SoftwareDegradeFactor` | `OnImportArrival`、`AddProduced`、`QuoteInfrastructure`、`ConsumeForTraining` | `AddPartsFunding`、`OmFaultMultiplier`、`TryCharge` | `SoftwareDegradeFactor` | `IStrategicQuery`（`CanCrossOrStrike`）、`PostNotification` | `Tile.deJureIso3` | — | `IStrategicActions`、`EvaluatePlan` | F1–F9 视图、`Quote` | `IScenarioService`、`TileSetRef` | 段 `Countries=10`、`Strategic=90` |
| **`12` AI** | `G-23` 频率、阶段 10/80/90 | 模板/编组树、`ResolveModel` | `GetSkillForBattalion` | `DoctrineProfile`（`DC-101/102`）、`StripDirective` | `ExposureRecord`、`IntelEstimate`（不作弊） | `NodeStock`、`GetProcurementShortfall` | `RequestBattalionRotation` | `SubmitAirMission`、`AirTargetValue`（`DC-201`） | `SubmitOrder`、`EstimateEdge`（`DC-066`） | `IMapQuery` 邻接与边 | `IStrategicActions`、`AiDirectives` | — | `GetEdgeAssignment`、`GetTrace`、`SetDoctrine`、`SetSupportBrigade` | `AiCountryProfile`、`AiScenarioRefs` | 段 `AiState=100`、`DoctrineChange=8` |
| **`13` 界面** | 单位换算、`G-09` | 沙盒草稿、`ApplyTemplateEdit`、`SetModelOverride` 等写接口 | `GetSkill*`、`SetSchoolPriority`、`SetCrashCourse`、`SetAcceptVolunteers` | `BattalionSummary`、`EdgeBattle`、`ProvingGround` | `ExposureRecord`、`OwnExposureEstimate`、`PrecisionStrikeAllowed` | 9 个只读视图、`PocketInfo`、`PreviewStockTargets`、`DeployHub` | `CapturedPool`、`SetUseCapturedEquipment`、`Merge*` | `Flight`、`AirTrack`、`CreatePackage` | `SetPlayerPause`/`SetSpeed`/`SetFidelityProfile`、`FindPath`、`StarredSet` | `TerrainComposition`、H3 多边形 | `IStrategicActions`、`ProcurementQuote` | `AiDecisionTrace`、`AiReasonCode`、`EvaluatePlan` | — | `ScenarioPresentation`、`ListScenarios` | `UiState=110`、`OrgEdit=10`、`UnitAdmin=11`、`CancelOrder=12` |
| **`14` 剧本** | `SimTime`、`CountryId` | `InstantiateFull`、`AllocateEquipment` | `SkillPreset`、`FillRosterFull`、`SchoolState` | 校准目标 `CalibrationDef` | `SatelliteAsset` 初始化 | 节点/口岸初始化、`rail_fleet_payload_t` | 初始 `condition=1.0` | `Flight` 与机场初始化 | `TileControl`（`nk_loc_1994`） | `IMapQuery.GetControlSnapshot`、H3 距离 | `StrategicState` 开局注入、`CeasefireTemplate` | `AiCountryProfile`、`historicalProcurement` | `ScenarioPresentation`（`CONTRACT_13_14`） | — | `ScenarioMeta=120`（`ScenarioRuntimeState`） |

---

## 三、各子系统与数据问题清单及修复记录

### 3.1 战略、采购、预算与政治层（`11_strategic_layer.md`，SR-01..SR-21）

| 编号 | 类别 | 位置 | 问题描述 | 修复方式 |
|---|---|---|---|---|
| SR-01 | 交接 #8 | §3.2, §6.1 | `PayCategory` 人员费统计缺少 `02` 的聚合查询接口 | 对齐 `02 §6.1 HeadcountByPayCategory(CountryId)`，删除 `11` 侧重复枚举定义。 |
| SR-02 | 交接 #8 | §4.2, §6.1 | `01` 工具组采购与维护费（`ToolsetState`）在 `11` 中无扣款与到货逻辑 | 在 H1 计入 `ToolsetUpkeepPerYear`，新增 `RequestToolsetPurchase` 经采购线扣款并在 `ToolsetLeadTimeDays`（90d）后写回 `ToolsetState.held`。 |
| SR-03 | 交接 #8 | §4.6, §6.1 | 装备升级完工后 `02` 专有练度保留缺少通知钩子 | 升级交货时调用 `02 OnModelUpgraded(itemId, fromModel, toModel, typeSkillRetention)`。 |
| SR-04 | 交接 #8 | §4.8.2, §6.2 | `02` 动员补人需要 `11` 提供每小时动员目标函数 | 在 `IStrategicQuery` 导出 `MobilizationTarget(bn, specialty, t)`，明确按 `Reduced → Cadre → Active` 选营（`🟡 S-22`）。 |
| SR-05 | 交接 #8 | §4.10.4 | 外部大国卫星情报共享与 `05 SatelliteAsset.sharesWith` 未打通 | 明确 `SetIntelSharing` 直接修改 `05 SatelliteAsset.sharesWith` 集合，不另建重复结构。 |
| SR-06 | 交接 #8 | §4.3, §4.8.1 | 进口到货、国产入库、训练耗弹与 `06` 接口名不一致 | 统一为 `06 OnImportArrival`、`AddProduced`、`ConsumeForTraining`（平时由 `02` 调，边境演习由 `11` 调）及 `GetAnnualStorageCostMusd`。 |
| SR-07 | 交接 #8 | §4.4, §6.2 | 软件保障中断系数 `SoftwareDegradeFactor` 未被 `05/08` 消费 | 在 `IStrategicQuery` 导出 `SoftwareDegradeFactor(CountryId, ModelHandle)`，並在 `05 §4.2` 与 `08 §4.4.3` 乘入观测质量（`🟡 S-20`）。 |
| SR-08 | 交接 #8 | §4.2, §6.1 | `07` 备件资金拨付与 `condition` 故障乘子缺少对接 | 每小时 H1 调用 `07 AddPartsFunding`，导出 `OmFaultMultiplier(CountryId)` 与 `EquipmentConditionState.condition`。 |
| SR-09 | 交接 #8 | §4.8.6, §6.2 | 停火生效如何终止 `04` 活跃交界边战斗 | 对齐 `09 §4.7.1`：由 `09` 在阶段 140 `BattleEnd` 读取 `IStrategicQuery.AreAtWar` 并以 `BattleEndReason.WarEnded` 终止战斗。 |
| SR-10 | 交接 #8 | §6.2 | `09 ValidateOrder` 需要检查和平时期国界、停火、维和区与武器使用限制 | 在 `IStrategicQuery` 导出 `CanCrossOrStrike(country, fromTile, toTile, weaponModel)` → `OrderBlockReason`。 |
| SR-11 | 接口对齐 | §4.3.6, §6.3 | 仓库新建/加固在 `06` 与 `11` 的报价与完工入口不统一 | 统一由 `IStrategicActions.OrderInfrastructure` 发起，内部调 `06 QuoteInfrastructure`，完工调 `06 OnInfrastructureCompleted`。 |
| SR-12 | 接口对齐 | §4.2.5, §6.2 | `07` 后方大修费与 `06` 桥梁修复费缺少扣款函数 | 在 `IStrategicQuery` 导出 `TryCharge(country, line, musd)`（`🟡 S-21`）。 |
| SR-13 | 接口对齐 | §6.3 | `IStrategicActions.ExpandSchool` 未写入接口签名 | 在 `IStrategicActions` 补齐 `ExpandSchool(CountryId, SchoolHandle, int deltaCapacity)`，完工写 `02 SchoolState.capacityPerYear`。 |
| SR-14 | 接口对齐 | §4.8.6 | 停火移交地块时强制撤出滞留部队的命令枚举未对齐 `09` | 改为调用 `09 SubmitOrder`（`OrderSource.System`、`OrderClass.Forced`），由 `09` 赋予 0 命令延迟且不可被玩家取消。 |
| SR-15 | 剧本接口 | §3.6, §4.9 | 事件与红线中的地块集合引用 `TileSetRef` 与 `14` 结构不一致 | 定义统一的 `TileSetRef / TileSetKind`，由 `14 IScenarioService.ResolveTileSet` 展开为 H3 列表。 |
| SR-16 | 剧本接口 | §4.8.5 | 停火模板选择与维和区生成职责边界不清 | 统一由 `11` 调 `14 IScenarioService.SelectCeasefireTemplate` 与 `BuildPeacekeepingZone`。 |
| SR-17 | AI 接口 | §4.7.5, §4.13 | 作战方案评估与年报净评估调用 `12` 代理模型的签名不一致 | 统一为 `12 ProxyModel.EvaluatePlan(OperationPlan)` 与 `ProxyModel.StandardScenario(own, rival)`。 |
| SR-18 | UI 接口 | §6.3 | `13` 采购预览需要无副作用的报价函数 | 明确 `IStrategicActions.Quote` 为纯读函数，不记输入日志、不消耗 RNG。 |
| SR-19 | 存档接口 | §6.4 | 战略层状态在 `15 SectionId` 中的归属未写清 | 明确国家级长期状态入 `SectionId.Countries = 10`，合同/市场/战争/事件入 `SectionId.Strategic = 90`。 |
| SR-20 | 内部一致性 | §5.4 | 已废弃常数 `CeasefireWindDownHours` 仍留在常数表 | 标记删除并注明停火战斗由 `09 BattleEnd` 立即以 `WarEnded` 结束。 |
| SR-21 | 术语同步 | §11 | 新增类型（`TileSetRef`、`ProcurementQuote`、`OrderBlockReason` 等）未同步到 `00` | 补齐 `11 §11` 并在 `00_glossary.md §1.12.11` 完整收录 48 个术语。 |

---

### 3.2 四层 AI 系统（`12_ai.md`，IR-01..IR-19）

| 编号 | 类别 | 位置 | 问题描述 | 修复方式 |
|---|---|---|---|---|
| IR-01 | 交接 #9 / DC-101 | §3.1, §4.2 | `DoctrineProfile` 在 `04` 与 `12` 重复定义且字段名不同 | 落实 `DC-101`：`12 §3.1` 唯一定义 `DoctrineProfile`，字段名全面对齐 `04 §3.10`（`frontlineEchelonShare`、`deployDepthKm`、`rotateOutCombatStrength` 等）。 |
| IR-02 | 交接 #9 / DC-102 | §3.1, §5.1 | 原 `12 DoctrineProfile` 含 11 个 `04` 未使用的字段 | 落实 `DC-102` 与 `🟡 I-24`：删除未消费字段，火力倾向统一用 `defaultFirePriority`（`04 FireSupportPriority`）表达。 |
| IR-03 | 交接 #9 / DC-067 | §4.3 | 编组 AI 运行频率与 `00 G-23` 表述不一致 | 落实 `G-23`：旅级每条带步（5 分钟）运行，师/军级每小时运行。 |
| IR-04 | 交接 #9 / DC-066 | §4.6.2, §6.1 | `EstimateEdge` 签名与 `09 §4.7.2` 缓存战斗结算需求不一致 | 导出 `ProxyModel.EstimateEdge(SideForceInput att, SideForceInput def, EdgeId edge, EstimateContext ctx)`，同时满足 `09` 缓存结算与 `12/13` 预估。 |
| IR-05 | 交接 #9 | §4.3.5, §6.1 | `07` 整建制轮换（`ReplacementMode.UnitRotation`）缺少 `12` 接收接口 | 在 `12 §4.3.5` 与 `§6.1` 新增 `RequestBattalionRotation(OrgUnitId bn)` 及测试用例 `T10`。 |
| IR-06 | 交接 #9 / DC-201 | §5.3, §9 | `12 TargetValue` 与 `08 AirTargetValue` 键名与排序未对齐 | 解决 `DC-201`（`🟡 I-26`）：在 `§5.3` 给出两表键映射，并在 `§9` 增加 `target_value_order.py` 校验 `{AirDefense, Artillery, Headquarters}` 无严格逆序。 |
| IR-07 | 交接 #9 / DC-204 | §6.1, §6.3 | 玩家切换旅条令预设缺少 `15 InputKind` 枚举值 | 对齐 `15 §3.4 InputKind.DoctrineChange = 8` 与 `12 §6.1 SetDoctrine(FormationId, string)`。 |
| IR-08 | 接口对齐 | §3.1, §6.1 | `04` 条带条令日志 `StripDirective` 类型归属未明确 | 在 `12 §3.1` 定义 `StripDirective / DirectiveKind`，由 `04` 写入、`13 S12` 读取显示。 |
| IR-09 | 接口对齐 | §4.3.6, §6.1 | 玩家在 `13 S03` 为独立营指定保障旅缺少写接口与持久化字段 | 在 `12 §3.1` 新增 `SupportBrigadeOverride`，导出 `SetSupportBrigade(OrgUnitId, FormationId)` 与 `GetSupportBrigade`。 |
| IR-10 | 接口对齐 | §3.7, §6.1 | `13` 本地化 AI 决策理由需要稳定的原因码枚举 | 在 `12 §3.7` 定义 `AiReasonCode` 枚举（映射 `ai.reason.*` 本地化键）及 `GetTrace(AiLayer, long)`。 |
| IR-11 | 接口对齐 | §4.4.5, §6.2 | AI 下达空中任务与陆上命令的通道未与 `08/09` 完全对齐 | 明确陆上命令一律调 `09 SubmitOrder(..., OrderSource.Ai)`，空中任务经 `09 AirMissionOrderPayload` 转 `08`。 |
| IR-12 | 接口对齐 | §4.5, §6.2 | 国家 AI 执行预算/采购/动员/停火的接口 | 明确国家 AI 与玩家共用同一套 `11 IStrategicActions` 接口，不走后门直接改状态。 |
| IR-13 | 剧本接口 | §3.6, §4.5.2 | `14` 剧本的 `ai_profiles.yaml` 与 `historical_procurement` 加载结构未闭合 | 定义 `AiCountryProfile` 与 `AiScenarioRefs`（含 `HistoricalBuy`），明确 `historicalProcurement` 仅在 `Historical` 模式按年优先提交（`🟡 I-25`）。 |
| IR-14 | 迷雾审计 | §4.1.1, §9 | AI 不作弊边界需防止误读 `05` 内部真值字段 | 明确 AI 只读 `05 IntelEstimate` 与 `ExposureRecord.isKnownDecoy`，绝不读 `05` 内部真实营引用；新增 `ai_fog_audit.py` 验证。 |
| IR-15 | 确定性 | §4.3.4, §4.4.4 | 边分配与轴线效用平局打破规则未写全 | 明确所有候选列表按稳定 ID（`EdgeId`、`OrgUnitId`、`ModelHandle.value`）升序打破平局。 |
| IR-16 | 存档接口 | §6.3 | AI 状态在 `15 SectionId` 中的段号未写明 | 对齐 `15 §3.2 SectionId.AiState = 100`。 |
| IR-17 | 代理模型 | §4.6.3 | 48 维输入特征 `ProxyFeature` 中地形与工事取值口径与 `10/04` 不一致 | 对齐 `10 TerrainComposition` 占比与 `04 fortLevel01`。 |
| IR-18 | 难度接口 | §4.8, §6.1 | `SetAiDifficulty` 调用时机与输入日志未写明 | 明确开局或设置页调 `SetAiDifficulty(AiDifficulty)`，记 `15 InputKind.AiDifficulty = 6`。 |
| IR-19 | 术语同步 | §11 | `12` 新增的 25 个核心术语未合入 `00_glossary.md` | 在 `00_glossary.md` 新增 `§1.12.12 来自 12（AI）`，完整收录全部 25 个术语。 |

---

### 3.3 玩家界面与交互（`13_ui.md`，UR-01..UR-27）

| 编号 | 类别 | 位置 | 问题描述 | 修复方式 |
|---|---|---|---|---|
| UR-01 | 交接 #10 | §3.3, §4.9 | `03 CapabilityVector` 分量名在 `13` 中写成旧名 | 全面对齐 `03` 八分量（`antiPersonnel`、`antiLightArmor`、`antiHeavyArmor`、`antiFortification`、`antiAir`、`suppression`、`recon`）并定义 `CapabilityRowKey`。 |
| UR-02 | 交接 #10 | §4.9.13 | `04 Strip` 坐标手性与玩家在屏幕下方的翻转规则未固定 | 明确 `screenY = (viewerSideIndex == 0 ? -y : y)` 并保持右手系。 |
| UR-03 | 交接 #10 | §3.4.2, §4.9.17 | `05` 暴露度记录 ID 与假目标真值字段不能直接暴露给 UI | 改用 `ExposureTargetId` 与 `isKnownDecoy`，禁止 UI 反查真实营；我方假目标状态在 `§6.2` 标 `★` 待 `05` 补估计值。 |
| UR-04 | 交接 #10 | §3.4.3, §4.9.12 | `06` 随行携带量、口岸、运力与关键节点字段名不一致 | 对齐 `06 SquadCarriedState`、`ImportView`、`CarrierView`、`KeyNodeReport`，并在 `06 §3.10/§3.12` 补齐全部视图类定义。 |
| UR-05 | 交接 #10 | §3.4.3, §4.9.14 | `07` 满编率、损失分类与修理队列名称不一致 | 对齐 `07 FillRateReport`、`LossStatusSummary`、`RepairQueue`、`DepotRepairOrder`。 |
| UR-06 | 交接 #10 | §4.9.16 | `08` 飞行编组、挂载降级与防空包线字段名不一致 | 对齐 `08 Flight`、`FlightElement`、`AirTrack`、`ChooseLoadout` 与 `AirResultReason`。 |
| UR-07 | 交接 #10 / DC-041 | §2.3, §3.6 | 行政配置命令（0 延迟开关 vs 有延迟编制操作）通道未区分 | 按 `DC-041` 区分：纯配置开关走 `09 UnitConfig / LogisticsConfig`（0 延迟），合并营/连与撤编走 `MergeBattalions / MergeCompanies / DisbandBattalion`（有延迟且不在战斗中）。 |
| UR-08 | 接口补齐 | §2.3, §3.6, §6.2 | `01` 模板编辑、型号绑定、分配策略、战备等级缺少显式写接口与 DTO | 已在 `01 §4.5.3/§4.6/§4.9/§4.11/§6.1` 补齐 `TemplateEdit`、`ImpactReport`、`AllocationResult`、`SetModelOverride`、`SetFormationDefaultBinding`、`SetAllocationPolicy`、`SetPriorityList`、`SetAllowSubstitution`、`SetReadinessTier`、`RunInstanceChecks`；已移除 `13` 对应 `★`。 |
| UR-09 | 接口对齐 | §4.9.4 | `02` 换装相似度示例中 `T-72B → T-90S` 数值（0.6 vs 0.5）前后矛盾 | 已在 `02 §3.3` 将 `explicitRules` 示例改为 `bmp1/bmp2: 0.6`，使 `T-72B → T-90S` 在 `02` 与 `13` 中统一为同体系 `0.5`（专有练度 `0.62 → 0.31`）。 |
| UR-10 | 接口补齐 | §2.3, §3.6, §6.2 | `02` 学校招训优先、速成班、志愿者开关缺少写接口 | 已在 `02 §4.8.5` 与 `§6.1` 补齐 `SetSchoolPriority`、`SetCrashCourse`、`SetAcceptVolunteers`，并移除 `13` 对应 `★`。 |
| UR-11 | 接口对齐 | §3.4.6, §4.9.7 | `03 ProvingGroundSpec / Report` 字段与 `13` 视图模型未一一对应 | 对齐 `03 §3.7` 的 `ProvingGroundSpec`、`ProvingGroundReport`、`ThreatSummary`、`IdleReason`。 |
| UR-12 | 接口对齐 | §4.9.14 | AAR 阶段损失归因与 `04 BattleLossLedger` 字段名对齐 | 对齐 `04 LossBreakdown.byLine`、`bySourceCategory`、`shareOfVehicleLossByLine`。 |
| UR-13 | 新增决策 | §4.9.14 | 总纲 §9.8 示例“电台被定位招来炮击”在 `03` 中无对应数据源 | 新增 `🟡 U-26`：由 `04` 在间瞄任务上根据 `05 Elint` 暴露增量记录 `RadioLocated`。 |
| UR-14 | 新增决策 | §4.9.14 | `03` 把周围无敌情也记入 `OutOfRange` 会导致 AAR 结论 C6 误报 | 新增 `🟡 U-27`：建议 `03` 拆分 `NoEnemy` 与 `OutOfRange`。 |
| UR-15 | 接口对齐 | §4.9.5, §4.9.17 | `05` 精确打击许可、定位误差与区域侦察/特种任务 payload 对齐 | 对齐 `05 PrecisionStrikeAllowed`、`AreaStrikeAmmoMultiplier`、`TargetLocationErrorM` 与 `09 CrossTileReconPayload`。 |
| UR-16 | 接口补齐 | §2.3, §3.6, §6.2 | `06` 旅弹药基数配比（D1）缺少写接口 | 已在 `06 §3.10` 增加 `LogisticsConfigKind.AmmoComposition = 1` 并在 `§6.1` 增加 `SetAmmoComposition`（通道二选一见 `🟡 U-28`），移除 `13` 的 `★`。 |
| UR-17 | 接口补齐 | §3.4.2, §3.4.3, §6.2 | `06` 包围圈 `PocketInfo` 与 9 个后勤视图缺少结构定义 | 已在 `06 §3.10` 与 `§3.12` 补齐 `PocketInfo`、`UnitSupplyView`、`FlowMapView`、`NodePanelView`、`KeyNodeReport`、`ReserveGapReport`、`ShelfLifeReport`、`ImportView`、`CarrierView`、`ConvoyView`，移除 `13` 对应 `★`。 |
| UR-18 | 接口补齐 | §2.3, §4.9.12, §6.2 | `06` 首次展开前进后勤中心 `DeployHub` 缺少 `LogisticsConfigKind` 枚举值 | 已在 `06 §3.10` 增加 `LogisticsConfigKind.DeployHub = 15`，移除 `13` 对应 `★`。 |
| UR-19 | 接口补齐 | §2.3, §6.2 | `07` 缴获装备使用（国家级开关）缺少写接口 | 已在 `07 §3.2/§4.9/§6.1` 补齐 `CapturedPool` 与 `SetUseCapturedEquipment(CountryId, bool)`，移除 `13` 对应 `★`。 |
| UR-20 | 接口标记 | §4.1.4, §6.2 | `08` 空中任务预览与防空拦截策略预览纯函数尚未导出 | 在 `13 §6.2` 标 `★`（`AirMissionPreview`、`PreviewIntercept`），算法均复用 `08 §4.2/§4.7` 现有公式。 |
| UR-21 | 接口补齐 | §4.1.4, §4.9.12, §6.2 | `06` 关键节点分析输入 `NetworkView` 与储备目标滑块预览 `PreviewStockTargets` 未定义 | 已在 `06 §3.10/§3.12/§4.11/§6.1` 补齐 `NetworkView`、`StockTargetPreview` 与 `PreviewStockTargets`，移除 `13` 对应 `★`。 |
| UR-22 | 接口补齐 | §4.9.15, §6.2 | `06 SupplyCut` 通知未填写 `Notification.tile` 与 `unitIds` | 已在 `06 §4.9` 补齐 `tile = bsa.tile`、`unitIds = 旅属各营`，移除 `13` 对应 `★`。 |
| UR-23 | 契约闭合 | §3.4, §4.9.1, §4.9.2 | `13` 与 `14` 的剧本选择、地图投影、配色、地名、简报接口未对齐 | 按 `CONTRACT_13_14.md` 在 `13` 与 `14 §3.9` 完整对齐 `ScenarioPresentation` 及 `IScenarioService.ListScenarios()`。 |
| UR-24 | 接口标记 | §3.4.2, §6.2 | `03` 五渠道计算 `ComputeFiveChannels` 与营级 `CombatStrength` 快捷读取待导出 | 在 `13 §6.2` 清晰列出 `★` 需求（底层公式已在 `03 §4.13` 定义）。 |
| UR-25 | 接口标记 | §3.4.4, §3.4.7, §6.2 | `04` 跨地块打击预览 `PreviewCrossTileStrike`、`GetFireSupportPriority`、AAR 武器统计累积待导出 | 在 `13 §6.2` 清晰列出 `★` 需求（底层公式已在 `04 §4.4.2/§4.14` 定义）。 |
| UR-26 | 接口标记 | §4.9.6, §4.9.17, §6.2 | `05` 编辑器特征值静态估算 `EstimateSignature` 与我方假目标被识破估计待导出 | 在 `13 §6.2` 清晰列出 `★` 需求。 |
| UR-27 | 接口补齐 | §3.6, §4.1.4, §6.1, §6.2 | `09` 暂停/调速/精度档 setter、寻路 `FindPath`、挖壕进度 `GetEntrenchProgress`、命令失败枚举、取消 Active 空中任务、星标 AI 通知，以及 `12 SetDoctrine/SetSupportBrigade` 未导出 | 已在 `09 §3.2/§4.3.2/§4.3.4/§6.1` 与 `12 §6.1` 全部补齐导出，并移除 `13` 中关于 `09` 和 `12` 的这些 `★` 标记。 |

---

### 3.4 纳卡剧本（`14_scenario_nk.md`，NR-01..NR-23）

| 编号 | 类别 | 位置 | 问题描述 | 修复方式 |
|---|---|---|---|---|
| NR-01 | 交接 #11 / DC-002 | §3.7, §4.2 | 纳卡防卫军归属与库存合并规则落地 | 落实 `DC-002`：并入 `ARM`（独立顶层编组 `arm_nk_army`），库存 `_nk_` 前缀分项在开局相加后按 `PriorityFill` 分配。 |
| NR-02 | 交接 #11 / DC-170 | §3.1, §4.2 | 1994 接触线控制权初始化与 `10 ControlSnapshot` 对齐 | 改为调用 `10 IMapQuery.GetControlSnapshot("nk_loc_1994")` 初始化 `09 TileControl`，并用 `control_anchors` 校验。 |
| NR-03 | 交接 #11 | §3.1 | 剧本区域 `RegionDef` 依赖运行时 GIS 多边形判定 | 改为纯 H3 规则（`de_jure`、`tiles_at`、`polyline`、`component_of`、`Subtract`），运行时不读多边形（`🟡 N-23`）。 |
| NR-04 | 交接 #11 | §3.2, §4.2 | 剧本开局编制实例化与 `01/02` 接口对接 | 对齐 `01 InstantiateFull`、`AllocateEquipment(PriorityFill)`（`🟡 N-24`）与 `02 FillRosterFull`、`SkillPreset`。 |
| NR-05 | 交接 #11 | §3.3 | 后勤节点、口岸、国家级铁路/公路运力字段与 `06` 对齐 | 在 `logistics.yaml` 补齐 `rail_fleet_payload_t`、`national_truck_payload_t`（按动员等级）及口岸参数。 |
| NR-06 | 交接 #11 | §3.5 | 空军编组与防空营登记与 `08` 对齐 | 明确固定翼/无人机编组生成 `08 Flight`，地面防空营由 `01` 建营后向 `08 AirDefenseRegistration` 注册。 |
| NR-07 | 交接 #11 | §3.6 | 卫星定义与 `05 SatelliteAsset` 对齐 | 新增 `SatelliteDef`，开局生成 `05 SatelliteAsset`（含土耳其对阿共享）。 |
| NR-08 | 交接 #11 | §3.4, §4.6, §4.7 | 预算路径、信贷、市场池、危机事件、红线、停火模板与 `11` 对齐 | 全面对齐 `11` 的 `CreditLine`、`MarketPoolEntry`、`CrisisEventDef`、`RedLine`、`CeasefireTemplate` schema。 |
| NR-09 | 交接 #11 | §3.4, §3.8 | AI 国家画像与史实采购清单与 `12` 对齐 | 对齐 `12 AiCountryProfile` 与 `AiScenarioRefs`（含 `refBattalion`、`historicalProcurement`）。 |
| NR-10 | 交接 #11 / CONTRACT | §3.9, §6.1 | `13` 新游戏、主地图投影、配色、地名、简报缺少 `14` 数据结构 | 新增 `§3.9 ScenarioPresentation`（含 `ScenarioListEntry`、`TheaterProjection`、`PlaceNamePolicy` 等）与 `ListScenarios()`（`🟡 N-21, N-22`）。 |
| NR-11 | 接口对齐 | §6.1 | `11` 在运行时调用 `14` 的服务接口签名未汇总 | 在 `§6.1` 定义 `IScenarioService`（`Load`、`Initialize`、`ResolveTileSet`、`SelectCeasefireTemplate`、`BuildPeacekeepingZone`、`GoalProgress`、`ResolveSkirmishEdge`）。 |
| NR-12 | 存档接口 | §6.2 | `14` 运行时状态在 `15 SectionId` 中的归属 | 定义 `ScenarioRuntimeState` 存入 `15 SectionId.ScenarioMeta = 120`。 |
| NR-13..23 | 数据与校准 | §4, §5, §8, §9 | 剧本 ID（统一为 `nk_2010` / `nk_2020`）、舒沙失守触发 `nov10_template`、拉钦走廊宽度、V2/V4 校准判据与调整顺序等 11 项细节 | 全部在 `14` 正文及 `data/scenarios/nk_*/` 中修订一致。 |

---

### 3.5 静态数据 `data/` 与校验器 `tools/validate_data.py`（DR-01..DR-18）

| 编号 | 类别 | 位置 | 问题描述 | 修复方式 |
|---|---|---|---|---|
| DR-01 | DC-205 | `categories.yaml`, `models_*.yaml`, `templates/` | `loitering_munition` 同时出现在类别表（被班模板引用）与空中弹药表（被无人机挂载引用） | 采用 `DC-205` 方案 ①：新增地面发射装置类别 `loitering_launcher`（配给 `harop/orbiter1k/lancet3` 发射车/班），`loitering_munition` 转为弹药类别。 |
| DR-02 | DC-206 | `categories.yaml`, `munitions.yaml` | 地面弹药的 `category`（如 `ammo_artillery`、`ammo_tank`）不在 `categories.yaml` 中 | 采用 `DC-206` 方案 ①：在 `categories.yaml` 新增 9 个弹药类别（`is_munition_category: true`）。 |
| DR-03 | 模板层级 | `pla_2020/formations.yaml` | `pla_theater_army`（`level: corps`）引用同为 `corps` 的集团军，违反 `01 O-02` 子模板层级严格递减 | 新增 `subordinate_formations` 字段记录战区下辖集团军，不计入 `children`（`🟡 O-21`）。 |
| DR-04 | 模板引用 | `sov_generic/`, `aze_2020/`, `arm_2020/` | 部分营/旅模板引用的侦察排、通信连、后勤连或武器型号 ID 拼写不一致 | 逐一核对并修复 `data/templates/` 与 `data/equipment/` 中的跨文件 ID 引用。 |
| DR-05 | 剧本补全 | `data/scenarios/nk_2010/`, `nk_2020/` | 需要为两个剧本建立完整的 9 类数据文件并通过外键与数值范围校验 | 补全并对齐 `scenario.yaml`、`theater.yaml`、`countries.yaml`、`oob.yaml`、`logistics.yaml`、`air.yaml`、`procurement.yaml`、`events.yaml`、`ai_profiles.yaml`。 |
| DR-06..18 | 校验器扩展 | `tools/validate_data.py` | 原校验器只检查基础 YAML 语法与少量模板字段 | 扩展 `tools/validate_data.py` 覆盖装备、弹药、专业、风格、模板 DAG/层级/人数/车座、剧本 OOB/节点/机场/采购/事件/AI 引用等全部检查，最终达成 **`0 ERROR, 10 WARN`**。 |

---

## 四、第一阶段跨阶段遗留项（`DC-201..DC-206`）闭环状态

| 编号 | 议题 | 涉及系统 | 二期处理结果与落点 | 状态 |
|---|---|---|---|---|
| DC-201 | 目标价值表 `AirTargetValue`（08）与 `TargetValue`（12）对齐 | 08、12 | 已在 `12 §5.3` 建立两表键映射，并在 `12 §9` 新增 `target_value_order.py` 验证 `{AirDefense, Artillery, Headquarters}` 无严格逆序（见 `DS-068 / I-26`）。 | ✅ 已解决 |
| DC-202 | 战役地图上的空中与远程导弹运动显示粒度 | 08、09、13 | 已在 `13 §4.9.16` 与 `§5` 明确：地图 `Air` 图层每分钟刷新，绘制我方 `FlightElement`、已探测 `AirTrack` 及射程 `≥ MapMissileMinRangeM`（20 km）的远程弹药航迹 `MissileInFlight`。 | ✅ 已解决 |
| DC-203 | 地图投影与距离计算权责 | 00、10、13、14 | 已在 `13 §4.9.3` 与 `14 §3.9` 明确：模拟距离一律按 `00 §3.4` 大圆距离 / `10` 边长计算；阶段 1 界面采用 `14 TheaterProjection` 给出的兰伯特等角圆锥投影（见 `DS-077 / U-20`）。 | ✅ 已解决 |
| DC-204 | 玩家修改条令预设的 `InputKind` 枚举值 | 12、13、15 | 已在 `15 §3.4` 确认 `InputKind.DoctrineChange = 8`（并补齐 `OrgEdit = 10`、`UnitAdmin = 11`、`CancelOrder = 12`），`13 §3.6` 调 `SetDoctrine` 时记录。 | ✅ 已解决 |
| DC-205 | `loitering_munition` 在类别与弹药表中的双重身份 | 01、03、04、06、08、14、data | 已采用方案 ①：拆分为地面发射装置类别 `loitering_launcher` 与弹药类别 `loitering_munition`，全规格与 `data/` 已同步修改并通过校验。 | ✅ 已解决 |
| DC-206 | `munitions.yaml` 中地面弹药的 `category` 不在 `categories.yaml` 中 | 01、03、06、data | 已采用方案 ①：在 `data/equipment/categories.yaml` 补齐 9 个弹药类别，並在 `01 §3.1` 写明规则。 | ✅ 已解决 |

---

## 五、数据校验与术语总表验证汇总

1. **静态数据校验（`python3 tools/validate_data.py`）**：
   - **错误数**：`0 ERROR`
   - **警告数**：`10 WARN`（全部为预设真实历史编制的人数/车座微小差异，符合 `01 V-02` 设计预期）
2. **术语总表（`docs/spec/00_glossary.md §1.12`）**：
   - `§1.12.1` 至 `§1.12.10`（来自 `01–10`）与 `§1.12.11`（来自 `11` 战略层，48 项）、`§1.12.12`（来自 `12` AI，25 项）、`§1.12.13`（来自 `13` UI，21 项）、`§1.12.14`（来自 `14` 剧本，23 项）、`§1.12.15`（来自 `15` 存档与确定性，23 项）已全部入表，全书 16 份规格文档的术语索引实现 100% 覆盖。
