# 14 纳卡战区剧本（阶段 1 MVP）

> 依据：总纲 §21-4（MVP = 纳卡战区）、§21-16、§18、§19.5–19.6、§9.3 全球地图；[00 术语表](00_glossary.md)（🟡 G-xx 暂定采用，特别是 G-10 货币基准、G-12 模板前缀、G-13 纳卡部队归属、G-15 数据目录）；[01](01_org_templates.md) §3.4、§4.8、§4.17；[02](02_personnel_training.md)；[05](05_recon_exposure.md) `SatelliteAsset`；[06](06_logistics.md) §6.3；[09](09_time_orders.md) 关键地块；[11](11_strategic_layer.md)；[12](12_ai.md) §3.6；[15](15_save_determinism.md) 确定性初始化。
> 本文件编号的待确认决策为 `N-xx`（第 10 节）。叙事保持中立，只讲军事（总纲 §21-4）。
> 标记：✅ 总纲已确认；🟡 建议待确认；**[阶段 2+]** 只留扩展点。

---

## 1. 目标与范围

### 1.1 解决什么问题
把“纳卡战区”变成一个**可加载、可复现、可校准**的剧本：给出地图范围、两个开局（2010-01-01、2020-09-27）的国家参数、预算、库存、编制、后勤节点、进口关系、外部大国、事件、剧本目标，以及**历史校准目标**（V2）与**十年战役可玩性搜索**（V4）的具体做法。

### 1.2 阶段 1 包含
| 内容 | 位置 |
|---|---|
| 战区范围规则、区域（地块集合）、控制锚点、关键地块、卫星 | `data/scenarios/nk_common/theater.yaml` |
| 国家参数、预算路径（2010–2020）、人力、首都、国家级运力（铁路/公路池）、关系、出口政策、外部大国、信贷、停火模板 | `data/scenarios/nk_common/countries.yaml` |
| 采购属性（单价、可采购年份、敏感度）、国内生产线、升级路径、二手市场池、历史采购清单 | `data/scenarios/nk_common/procurement.yaml` |
| 危机事件（历史 + 通用） | `data/scenarios/nk_common/events.yaml` |
| 后勤节点种子、战略方向预设、开局储备 | `data/scenarios/nk_common/logistics_nodes.yaml` |
| AI 国家配置 | `data/scenarios/nk_common/ai_profiles.yaml` |
| 剧本呈现数据（剧本列表、配色、投影、时区、地名、主要对手、引导、默认展示密度；§3.9） | `data/scenarios/nk_common/presentation.yaml` |
| 引导步骤（13 §4.8.2 格式） | `data/tutorial/nk_2010.yaml`、`data/tutorial/nk_2020.yaml` |
| 开局：库存、编制、空军基地、开局练度、目标 | `data/scenarios/nk_2010/scenario.yaml`、`data/scenarios/nk_2020/scenario.yaml` |
| 2020 年战争校准目标 | `data/scenarios/nk_2020/calibration.yaml` |
| 新装备型号（含 01 M2 新类别 `tbm_launcher`、`loitering_launcher`、`loitering_munition` 的型号；原 `data/equipment_pending/` 已并入，id 不变，DC-205 ①） | `data/equipment/nk_models.yaml`；战术弹道导弹弹体在 `data/equipment/ground_munitions.yaml` |
| 编制模板（苏式遗产，两国同构；含原 `data/templates_pending/` 的巡飞弹、战术导弹模板，已并入） | `data/templates/arm_sov_legacy.yaml`、`data/templates/aze_sov_legacy.yaml` |
| 全军概览（与 chn/usa 同类） | `data/orbat/arm.yaml`、`data/orbat/aze.yaml` |

### 1.3 阶段 1 不包含
- 1992–94 年第一次纳卡战争（总纲 §21-4 ✅ 不做）。
- 海军与里海（阶段 3）；巴库港按陆地口岸处理。
- 外国部队直接参战（俄 102 基地、土耳其 F-16 不实例化；11 S-12/S-19）。
- 纳卡的独立国家实体（G-13 → 本文件 N-01：并入 ARM）。
- 2020-11-10 之后的事件（2021 年后边境冲突、2023 年事件）**[阶段 2+]**。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策
| # | 决策 | 何时 |
|---|---|---|
| P1 | 选剧本（`nk_2010` / `nk_2020`）与国家（ARM / AZE） | 新游戏 |
| P2 | 选历史模式（Historical / Plausible / Free，11 §4.12；缺省见剧本） | 新游戏 |
| P3 | 是否开启“最高决策者”沙盒（11 S-07 相关） | 新游戏 |
| P4 | 输入世界种子（可选，15） | 新游戏 |
| P5 | 之后的一切决策走 11（战略）、01（编制）、09（命令）等 | 游戏中 |

### 2.2 反馈
| # | 反馈 | 内容 |
|---|---|---|
| R1 | 剧本简报 | 冷静的简报文风：双方军费（2020 年不变价）、主要装备数量对比表（标注 confidence）、接触线态势、挑战目标 |
| R2 | 目标面板 | 本国目标及进度（11 `DefenseReview.challengeProgress`） |
| R3 | 数据可信度 | 简报和装备卡上，`estimated`/`uncertain` 的数字带图标与来源链接（总方针“数字要透明”） |
| R4 | 结局页 | 目标结算 + 与史实对照（nk_2020：天数、阵亡、装备损失、领土与史实区间并排） |

---

## 3. 数据结构

### 3.1 文件布局与加载顺序
```text
data/scenarios/
  nk_common/   countries.yaml theater.yaml procurement.yaml events.yaml logistics_nodes.yaml ai_profiles.yaml presentation.yaml
  nk_2010/     scenario.yaml
  nk_2020/     scenario.yaml calibration.yaml
data/tutorial/ nk_2010.yaml nk_2020.yaml            # 13 §4.8.2 格式；由 presentation.yaml 的 tutorial_file 引用
data/map/      tiles.bin edges.bin … regions.yaml   # 10 §3.9 输出（只读）
data/map/nk/control/nk_loc_1994.yaml                # 10 §3.6 ControlSnapshot（只读）
```
- `scenario.yaml` 的 `scenario.includes` 列出共享文件（相对 `data/scenarios/`）。加载顺序 = 列表顺序；后加载的同名键**不覆盖**前者（共享文件之间无重叠键），剧本文件里的 `*_overrides` 才覆盖（§4.3 O2）。允许的覆盖键：`oob.<ISO3>.overrides`（§4.3 O2）、`ai_profile_overrides.<ISO3>`（按字段替换 `profiles[]` 中同国条目的字段）、`presentation_overrides`（按字段替换 §3.9 的同名字段）。
- 剧本 ID：`nk_2010`、`nk_2020`（00 §2.1 规则 `<战区>_<年份>[_<月>]`，月可省；与 15 的测试用例一致）。
- 地图：14 不读任何多边形/GeoJSON；运行时只读 10 的地图产物（`IMapQuery`，10 §3.8）和控制快照（§4.2 第 3 步）。

### 3.2 来源与可信度约定
- 每个数据文件头列出**来源键**（如 `wp_arm_eq_2020` = 某维基百科**固定修订版** `oldid` 链接；`wb_milex` = World Bank 转载的 SIPRI 军费）。条目用 `src:` / `source:` 引用键。
- `confidence`：`stated`（来源直接给出）/ `estimated`（依据写在 `basis`/`note`）/ `uncertain`（来源互相矛盾或只有区间）。**data/README 中 stated 指“知乎原文”，本剧本文件中指“文件头所列公开来源”**（N-02）。
- 维基百科修订版只作“转引 IISS 等的二手来源”；所有 `uncertain` 的库存数字在 N-10 中列为“须用 IISS Military Balance 2010/2020 原表核对”。
- 货币一律 2020 年不变价百万美元：`musd2020 = musdCurrent × 100 / USDeflator(y)`，平减指数来自 World Bank `NY.GDP.DEFL.ZS`（USA，2020 = 100）。

### 3.3 运行时类型（`MoD.Data.Scenario`，只在加载时使用；运行时状态归各系统）

```csharp
public sealed class ScenarioDefinition {
    public string id;                         // "nk_2010"
    public string theaterId;                  // "nk"
    public SimTime start;                     // UTC
    public SimTime suggestedHorizon;          // 挑战目标结算日；不是游戏结束
    public string[] playable;                 // ISO3
    public HistoricalMode defaultMode;        // 11 §3.10
    public string controlSnapshotId;          // 10 §3.6 ControlSnapshot.snapshotId；纳卡两个开局都 = "nk_loc_1994"（DC-170）
    public List<CountryDef> countries;        // 来自 countries.yaml
    public List<RelationDef> relations;
    public List<TensionDef> tensions;
    public SortedDictionary<string, ExportPolicyDef> exportPolicies;     // 卖方 ISO3 → 政策
    public SortedDictionary<string, ExternalActorDef> externalActors;
    public List<CreditLineDef> creditLines;
    public List<CeasefireTemplate> ceasefireTemplates;
    public TheaterDef theater;                // regions、controlAnchors、keyTiles、satellites（theater.yaml）
    public ProcurementData procurement;
    public List<CrisisEventDef> events;       // 11 §3.8（YAML 映射见 §3.8）
    public List<NodeSeed> nodes;              // 06 §6.3 schema
    public SortedDictionary<string, CountryLogisticsDef> countryLogistics;   // 战略方向预设（logistics_nodes.yaml）
    public SortedDictionary<string, OpeningStockDef> openingStocks;
    public List<AiCountryProfile> aiProfiles; // 12 §3.6（YAML 映射见 §3.11）
    public ScenarioPresentation presentation; // §3.9（供 13）
    public SortedDictionary<string, InventorySpec> inventory;            // ISO3 → 库存
    public SortedDictionary<string, List<FormationSpec>> oob;            // ISO3 → 顶层编组
    public SortedDictionary<string, SortedDictionary<string, string>> airBasing; // ISO3 → modelId → nodeId
    public SortedDictionary<string, PersonnelStartDef> personnelStart;
    public List<ScriptedStartItem> scriptedStart;
    public List<OpenContractDef> openContracts;
    public SortedDictionary<string, List<GoalDef>> goals;
    public CalibrationDef calibration;        // 仅 nk_2020；可为 null
    public ulong dataHash;                    // = 15 SaveHeader.dataHash（全部静态数据文件按路径 ordinal 排序后内容的 XxHash64，含 10 的地图文件）；14 不另算
}

public sealed class CountryDef {
    public string iso3; public CountryRole role; public bool playable; public string rival;
    public string capitalKeyTile;                                 // key_tiles 中的 id（12 §4.1.3 “首都”）；非交战国为 null
    public SortedDictionary<int, double> gdpMusdByYear, populationMByYear, baseBudgetMusdByYear;
    public ConscriptionDef conscription;
    public SortedDictionary<int, HeadcountDef> headcountByYear;   // 只用于校验（§4.4）
    public PoliticsDef politics;                                  // initialTrust, hawkishness(年→值), issueBaseline
    public SortedDictionary<int, double> deterrenceInitial;       // 键 = 年份；取 ≤ 开局年的最大键
    public double railFleetPayloadT;                              // §3.10 → 06 RailFleetPayloadT(c)，t
    public SortedDictionary<MobilizationLevel, double> nationalTruckPayloadT;   // §3.10 → 06 NationalTruckPayloadT(c, level)，t；键 = 11 MobilizationLevel
}
public sealed class InventorySpec {
    public SortedDictionary<string, int> counts;                  // modelId → 数量（已按 §3.7 R3 合并分项；不含 R6 弹药）
    public SortedDictionary<string, int> munitionCounts;          // §3.7 R6：弹药型号 → 枚数（进 06 库存，不生成 EquipmentItem）
    public SortedDictionary<string, int> subTotals;               // 原始带前缀的分项（"_nk_t72a" → 316），只供显示/审计
    public string[] autoFillCategories; public double autoFillShare;
    public string confidenceNote;
}
public sealed class FormationSpec {
    public string id; public string name;
    public OrgLevel echelon; public string echelonLabel;          // OrgLevel 归 01
    public string hqTemplate;                                     // role: hq 的营模板
    public double latDeg, lonDeg;
    public ReadinessTier tier; public int priority;               // 01 ReadinessTier / allocationPriority
    public List<ChildSpec> children;                              // 子编组（旅/团模板，level ≥ Brigade 且 < echelon）
    public List<ChildSpec> direct;                                // 直属营（营模板，level == Battalion）
    public string inheritFrom;                                    // 只在 2020：复用 2010 的同 id 编组
}
// 数据兼容：YAML 中旧键 `pending_m2` / `add_pending_m2` 若出现，按 `direct` / `add_direct` 读入（01 M2 已落地，DC-205）。
public sealed class ChildSpec {
    public string template; public int count = 1; public string name;
    public double? latDeg, lonDeg; public ReadinessTier? tier; public int? priority;
    public SortedDictionary<string, string> binding;              // 类别 → 型号（营级覆盖，01 modelOverrides）；只对 direct 有效
}
public sealed class RegionDef { public string id; public RegionRule rule; }   // 规则种类见 §4.1.3（全部只用 10 的地块数据 + H3 求值，无多边形）
public sealed class ControlAnchor { public string name; public double latDeg, lonDeg; public SortedDictionary<string, string> controllerByScenario; }
public sealed class KeyTileDef { public string id; public double latDeg, lonDeg; public double value; }
public sealed class SatelliteDef {                                // theater.yaml satellites[] → 05 SatelliteAsset（§3.12）
    public string id; public string owner; public ReconMeans means;   // ReconMeans 归 05
    public double revisitH; public double quality; public SimTime from;
    public string[] sharesWith;                                   // 数据中的候选共享国；是否生效见 §3.12
}

public sealed class CeasefireTemplate {                           // 11 §4.8.6 引用
    public string id; public string mediator;                     // ISO3 或 "any"
    public ConditionExpr condition;                               // §4.7.1
    public int appliesWhenWarDayAtLeast;                          // 缺省 0
    public List<HandoverClause> handovers;
    public PeacekeepingClause peacekeeping;                       // 可为 null
}
public sealed class HandoverClause { public string region; public string from, to; public int days; public string exceptRegion; }
public sealed class PeacekeepingClause { public string actor; public string[] regions; public int years; public int troops; }

public enum GoalType : int { WarOutcome = 1, WarCost = 2, Survival = 3, Budget = 4 }
public sealed class GoalDef { public string id; public GoalType type; public SimTime? deadline; public GoalCriteria success, altSuccess, stretch; }

public sealed class CalibrationDef { /* 结构与 calibration.yaml 一一对应：duration, personnel_killed, equipment_losses_oryx, territory, timeline_milestones, qualitative_checks；每项 value + band */ }

public sealed class ScenarioInitOptions { public string scenarioId; public string playerIso3; /* null = 无玩家（观战/V2） */ public HistoricalMode mode; public bool sandboxSupremeLeader; public ulong worldSeed; }
```

### 3.4 采购数据（映射到 11 的 `ProcurementProfile` 等）
- `procurement_profiles.<modelId>` → 11 `ProcurementProfile`（键 snake_case → camelCase）。合并规则：型号文件自身的 `procurement` 键（00 §4.3）为底，本剧本条目**按字段覆盖**；`service_year` 两处都没给 → 取 `EquipmentModel.serviceYear`（01 M3 可选字段）；仍没有 → 加载报错。额外字段：`export_from_year`（卖方开始出口该型号的年份）与 `export_unlock_flag`（= 11 `exportUnlockFlag`，全局旗标名）：`y < export_from_year` 且该旗标未设置 → 批准概率 = 0（如 TB2：`export_from_year: 2018`，事件 `tur_2020_tb2_offer` 设置 `tb2_export_aze_open`；11 须在 §4.4.2 读取，见 §6.2）；`confidence`、`basis`（文字，只供审计）。
- `production_lines[]` → 11 `ProductionLine`（`factory` = 06 节点 id；`expansion_cost_musd_per_unit_year` → `expansionCostMusdPerUnitYear`，每增加 1 件/年产能的费用，2020 不变价百万美元）。`from_year ≤ y0` 的线开局即 `Active`；`from_year > y0` 的线开局创建为 `UnderConstruction`，并附一个 11 `Project`（`kind = NewLineNewSite`、`totalCostMusd = 0`、`nominalDays` = 开局到 `from_year` 年 1 月 1 日 00:00Z 的天数），即“外生建成”，不占玩家预算（接口需求，§6.2）。
- `upgrades[]` → 11 `UpgradePath`；`availability`（可选，ISO3 列表）限制可下单国家；`from_year`（可选）之前不可下单；`from: "*"` 的 `refurbish_generic` 是 11 §4.5.1 整修的通用路径（`cost_share_of_unit_cost` × 型号单价 = `costPerUnitMusd`）。
- `market_pool[]` → 11 §4.5.2 的市场池条目（`years` = 允许出现的年份区间，含端点；缺省 = 不限）。
- `historical_procurement` → 12 的扩展字段（N-11）：AI 在 Historical/Plausible 模式下以此为“参考采购计划”。

### 3.5 外部大国与口岸
- `external_actors` → 11 `ExternalActorPolicy`（`mediation_template_ids` → `mediationTemplateIds`）；`supply_in_war.<ISO3>` 直接给出 11 §4.10.4 的 `supplyContinueP(actor, buyer)`（替代该处公式；未给的买方仍用公式；11 须读取，见 §6.2）；`intel_sharing` 决定 05 `SatelliteAsset.sharesWith`（§3.12）。
- 红线 `tiles`：`{de_jure: ISO3}` → 11 `TileSetRef(DeJure, ISO3)`，`{region: id}` → `TileSetRef(Region, id)`，展开由 `ExpandTileSet`（§6）完成；`effects: [{effect, after_hours}]` → 11 `List<RedLineStep(afterHours, effect)>`（按 `after_hours` 升序；`effect` → `RedLineEffect`；阶段 1 不允许 `direct_intervention`）。
- 口岸（06 `ImportGatewayData`）在 `logistics_nodes.yaml`；事件 `close_import_gateway` 关闭（如 2020 年格鲁吉亚禁运过境）。

### 3.6 编制模板的生成方式
- 两国模板由同一生成脚本产生（仓库外脚本，参数：前缀、国家差异），保证两国模板**同构**（只在旅/团级不同：亚为“团”`echelon_label: regiment`，阿为“旅”）。依据苏军编制 FM 100-2-3（1991）。人工修改任一文件时，必须同步修改另一个（N-15）。
- 主要模板（每国一套，`arm_`/`aze_` 前缀）：

| 层级 | 模板 | 要点 |
|---|---|---|
| 班 | `*_mr_bmp_sq`（8 人）、`*_mr_btr_sq`（9）、`*_rifle_sq`（9，无车）、`*_tank_crew`（3）、炮兵/火箭炮/防空/侦察/工兵/通信班、`*_bn_support_sq`、`*_bde_hq_bn`、`*_bde_support_sq`（聚合） | 槽位只写类别 |
| 营 | `*_mr_bn_bmp`（428 人，30 IFV）、`*_mr_bn_btr`（455）、`*_rifle_bn`（432）、`*_tank_bn`（31 辆）、`*_arty_sp122_bn`/`sp152`/`wheeled152`/`towed122`/`towed152`（各 18 门）、`*_mrl_bn`（18）、`*_mrl_lr_bn`（12）、`*_ad_bn`、`*_bde_hq`、`*_bde_support_bn`、`*_tbm_bn`（4 部 `tbm_launcher`）、`aze_loitering_bn`（2 个巡飞弹连 = 8 部 `loitering_launcher`） | `default_bindings` 为苏式默认型号 |
| 旅/团 | 亚：`arm_mr_regt`（2 469）、`arm_rifle_regt`（2 199）、`arm_nk_defence_regt`（3 028，uncertain）；阿：`aze_mr_bde`（2 855）、`aze_mr_bde_light`（2 402）、`aze_arty_bde`、`aze_mrl_bde` | 团/旅直属连 → 01 §4.4.3 直属队营 |

### 3.7 库存键规则（`inventory.<ISO3>`）
| 规则 | 内容 |
|---|---|
| R1 | 普通键 = `modelId: count`。型号必须存在于 `data/equipment/`。 |
| R2 | 以 `_` 开头的键是元数据（`_confidence`、`_auto_fill_categories`、`_auto_fill_share`、`_oryx_check`），不是型号。 |
| R3 | `_nk_<modelId>` = 纳卡防卫军分项；加载时**累加**到 `<modelId>`，并在 `subTotals` 中保留原值（G-13 / DC-002：纳卡装备属于 ARM，但简报可分开显示）。 |
| R4 | （已废止：01 M2 已落地，原 `PendingM2Skipped` 跳过规则不再使用，DC-205。） |
| R5 | `_auto_fill_categories` 中的类别：不由数据给数，按 §4.3.3 生成 `floor(需求 × _auto_fill_share)` 件（低价值装备：步枪、卡车、电台、迫击炮、反坦克导弹发射器、便导…）。 |
| R6 | 型号的类别属于弹药组（`categories.yaml` 中 `group ∈ {air_munition, ground_munition}`，如 `loitering_munition`、`tbm_missile`）的键 = **弹药枚数**（DC-205 ①）：不生成 `EquipmentItem`，进入 `munitionCounts`，由 §4.5 第 2 步作为 06 `ItemKey(SupplyClass.Ammunition, model)` 库存放入本国 storage 最大的 Depot；该型号不再按“天数”另算开局储备（避免重复）。 |

### 3.8 事件 YAML 与 11 `CrisisEventDef` 的映射
| YAML | 11 字段 | 说明 |
|---|---|---|
| `window: [d1, d2]` | `notBeforeMs` = d1 00:00Z，`notAfterMs` = d2 23:59Z | |
| `scope` | `EventScope`（`global`/`dyad`/`country` → `Global`/`Dyad`/`Country`） | |
| `text_key`、`options[].text_key` | `textKey` | 缺省：事件 = `strat.event.<id>`，选项 = `strat.event.<id>.<optionId>`（与 13 S21 的 `strat.event.<id>.body` 同前缀）；`summary` 只给实现者看，不进游戏 |
| `triggers[].type` | `ConditionType`（snake_case → PascalCase） | `tension_level_at_least` 的 `arg` 为 `TensionLevel` 名；`triggers: []` = 无条件 |
| `options[].effects[].type` | `EffectType` | `target: self` = 响应该事件的国家（`Dyad` 事件对两国各实例化一次，`self` 分别为两国；11 须确认，见 §6.2）；`arg` 中的关系对写 `"A-B"`，其中 `self` 同样替换 |
| `start_war` 的 `arg` | `key=value;…` 字符串 | 11 使用的键：`casus_belli`（11 `CasusBelli` 的 snake_case）、`aims`（逗号分隔的发起国 `war_aims[].id`，→ 作战目标地块）。14 使用、须 11 保存到 `War` 的键（接口需求 §6.2）：`scope`（`limited`/`total`，缺省 `total`；§4.7.1 `WarScope` 条件读取）、`max_days`（有限战争的天数上限：战争第 `max_days` 天由 `template` 指定的停火模板生成强制停火提议）、`template`（停火模板 id）。11 未支持前：`scope` 一律按 `total`，`max_days`/`template` 忽略（V2b 不可用） |
| `ai_directive` 的 `arg` | `kind=<kind>;aim=<warAimId>;due=<时刻>` | 一条效果 = 11 的一个 `AiDirective{kind, warAimId, dueMs}`；`kind ∈ {offensive, mobilize}`（11 §3.8）；`aim` 只在 `offensive` 时必填，必须是该国 profile 的 `war_aims[].id`（§3.11）；`due` 为 ISO 时刻（UTC），省略 = 事件触发时刻。多个目标写多条效果；12 §4.5.5 到期执行 |
| `border_skirmish` 的 `arg` | `edge_near:<anchor>`、`edge_between:<a>,<b>`、`edge_random:contact_line` | §4.9.3 解析成具体交界边 |
| 旗标 | `FlagSet`/`FlagNotSet` 的 `arg` | 只用事件 `set_flag` 设置的旗标，或 11 定义的系统旗标；本剧本用到的系统旗标 `big_contract_signed_last_90d` 须由 11 定义（接口需求，§6.2） |

### 3.9 剧本呈现数据（`ScenarioPresentation`，供 13 使用）
数据文件 `data/scenarios/nk_common/presentation.yaml`（加入两个 `scenario.yaml` 的 `includes`），剧本文件用 `presentation_overrides` 按字段覆盖。13 中的 `TODO(14)` 全部指向本节字段。

```csharp
public sealed class ScenarioPresentation {
    public List<ScenarioListEntry> scenarioListEntries;           // YAML scenario_list：本战区全部剧本（S01）
    public Dictionary<CountryId, CountryColors> countryColors;    // YAML country_colors（键写 ISO3，加载时转 CountryId）
    public string neutralHex;                                     // YAML country_colors.neutral
    public TheaterProjection projection;                          // YAML projection（只用于显示）
    public int displayUtcOffsetMin;                               // YAML display_utc_offset_min；纳卡 = +240
    public PlaceNamePolicy placeNamePolicy;                       // YAML place_name_policy
    public List<PlaceName> placeNames;                            // YAML place_names
    public List<KeyTileRef> keyTiles;                             // 不在 presentation.yaml 里写：由 theater.yaml key_tiles 加载后生成（不复制数据）
    public Dictionary<CountryId, CountryId> mainRival;            // YAML main_rival；必须与 countries[].rival 一致，否则加载报错
    public string tutorialFile;                                   // YAML tutorial_file；null = 无引导
    public DisclosureLevel defaultDisclosure;                     // YAML default_disclosure；DisclosureLevel 归 13 §3.1
}
public sealed class ScenarioListEntry { public string id; public string titleKey; public string blurbKey; public DateTime startUtc;
                                        public List<CountryId> playable; public string difficultyNoteKey; }
public sealed class CountryColors { public string primaryHex; public string secondaryHex; }   // "#RRGGBB"
public enum MapProjectionKind : int { LambertConformalConic = 1 }   // 14 定义，13 引用（13 的 ProjectionKind 是另一回事）
public sealed class TheaterProjection { public MapProjectionKind kind = MapProjectionKind.LambertConformalConic;
                                        public double stdParallel1Deg, stdParallel2Deg, centralMeridianDeg, originLatDeg; }
public enum DisputedNameOrder : int { PlayerFirst = 1, FixedAzFirst = 2, FixedHyFirst = 3 }
public sealed class PlaceNamePolicy {
    public DisputedNameOrder disputedOrder;   // 争议地名两种官方名的先后（🟡 N-22）
    public string separator;                  // 两名之间的分隔，" / "
    public string observerNameField;          // 无玩家（观战/V2）时的争议地名：取 "nameEn"
}
public sealed class PlaceName { public string id; public double lat; public double lon;
                                public string nameHy; public string nameAz; public string nameEn; public bool disputed; }
public sealed class KeyTileRef { public string id; public ulong tile; public double value; }   // tile = 坐标所在 H3 r4 单元
```
- **剧本列表**：`ListScenarios()`（§6）在新游戏界面打开时读取 `data/scenarios/*/scenario.yaml` 与其 include 的 `presentation.yaml`，只取 `scenario_list`，不做 §4.1 的完整校验；文本键 `data.scenario.<id>.title / .blurb / .difficulty`（13 S01）。
- **配色**：从 Okabe–Ito 色盲安全色板选取：ARM 主色 `#E69F00`（橙）、辅色 `#D55E00`（朱红）；AZE 主色 `#0072B2`（蓝）、辅色 `#56B4E9`（天蓝）；中立/无人控制 `#999999`（灰）。两方以“橙 vs 蓝”区分（色相与明度都不同），不依赖红/绿。13 的“黑白 + 斜线”模式不受影响。
- **投影**：兰伯特等角圆锥（只用于显示；距离一律用大圆距离，00 §3.4）。战区范围取 10 §4.13 的包围盒（38.30–41.95°N，43.4–50.7°E）。标准纬线按“纬度跨度 1/6 与 5/6 处”的常用规则：`stdParallel1Deg = 38.9`、`stdParallel2Deg = 41.35`；`centralMeridianDeg = 47.05`（经度中点）；`originLatDeg = 40.1`（纬度中点）。
- **时区**：`display_utc_offset_min = 240`（亚美尼亚 AMT、阿塞拜疆 AZT 均为 UTC+4）。亚美尼亚 2011 年前、阿塞拜疆 2015 年前每年夏季实行夏令时（UTC+5），是否按日期显示夏令时见 🟡 N-21；当前按固定 +240 显示。模拟内部一律 UTC（00 §3.3）。
- **地名**：叙事中立（总纲 §21-4）。`disputed: true` 的地名（冲突区内，即法理属 AZE、1994–2020 由亚方控制或有亚方官方名的地点）显示两国官方名并列，例如 `Xankəndi / Stepanakert`；顺序见 🟡 N-22。`disputed: false` 的地名只显示法理国家的官方名（拉丁转写）。界面语言的译名（如中文“斯捷潘纳克特”）走本地化键 `data.place.<id>.name`（13 §4.5.2），由 13 的本地化表提供；`nameHy` 为亚美尼亚官方名的拉丁转写，`nameAz` 为阿塞拜疆官方拉丁字母名，`nameEn` 为英语常用名。地名表覆盖 theater.yaml 中全部 `key_tiles` 与 `control_anchors`，以及 oob 中出现的马尔图尼（见 presentation.yaml）。
- **主要对手**：`main_rival: {ARM: AZE, AZE: ARM}`（13 顶栏 `tensionWithMainRival`）。
- **引导**：`tutorial_file` 指向 `data/tutorial/<scenarioId>.yaml`（各剧本用 `presentation_overrides` 指定）。文件格式 = 13 §4.8.2：`steps[]`，每步字段 `id`（步骤 id）、`trigger`（`{hook: <钩子 id>}` 或 `{after: <步骤 id>}`）、`highlight`（`{control: <13 §4.8.3 控件 id>, filter?: <字符串>}`）、`text_key`（`tut.*` 文本键）、`complete_on`（`{hook: <钩子 id>, where?: {…}}`）、`pause`（可选，缺省 false）。钩子 id 只能取 13 §4.8.2 的最小集。
- **默认展示密度**：`default_disclosure: standard`（13 U-18；新游戏首次进入时 13 仍会询问一次）。
- **停火地图预览（S21）**：不新增数据；13 用 §4.7 的 `SelectCeasefireTemplate` 与模板的 `handovers`/`peacekeeping` 区域（经 §4.1.3 展开为地块）绘制。

### 3.10 国家级运力（`countries.yaml` → 06 §4.6）
| YAML（每个交战国条目下） | 06 读取 | 单位 | 语义 |
|---|---|---|---|
| `rail_fleet_payload_t` | `RailFleetPayloadT(c)` | t | 国家铁路车皮池可供军用的总载重；06 再乘 `RailFleetAvailability` 得到 `NationalRail` 的 `generalPayloadT`（油罐车皮同值，06 §4.6） |
| `national_truck_payload_t: {none, partial, full}` | `NationalTruckPayloadT(c, MobilizationLevel)` | t | 国家公路运力池（中央汽车运输部队 + 动员民用卡车，06 L-04 / DC-031）在 11 `MobilizationLevel` = `None`/`Partial`/`Full` 时的总载重；必须 `none ≤ partial ≤ full`（加载校验） |
- 数值全部 `confidence: estimated`，依据写在 countries.yaml 的 `transport_basis`（年铁路货运量与周转天数的量级推算；动员民用卡车按登记货车数的小比例），须用亚美尼亚统计委员会（ArmStat）与阿塞拜疆铁路（ADY）年报核对（N-10 同类工作）。

### 3.11 AI 国家配置的映射（`ai_profiles.yaml` → 12 §3.6）
| YAML | 12 | 说明 |
|---|---|---|
| `profiles[]` 各字段 | `AiCountryProfile` 同名字段（snake_case → camelCase） | `training_peace/crisis` → `TrainingIntensity`；`doctrine_id` ∈ 12 §3.2 预设 id |
| `war_aims[]: {id, region[], key_tiles[], value}` | `WarAim {id, tiles, value}` | `tiles` = 各 `region` 按 §4.1.3 展开的地块 ∪ 各 `key_tiles` 所在地块，H3 升序去重 |
| `reforms[]` | `ReformOption` | `template_id` 必须是营模板（01 `level == Battalion`） |
| `reference_templates.ref_mech_inf_bn` | 12 §4.1.2 `RefBattalionTemplate` | |
| `reference_templates.by_type.<branch>` | 12 §4.1.2 `CpPerVe[type]` 的参考模板 | 键 = 01 `Branch` 的 snake_case（`armor`、`mech_infantry`、`motor_infantry`、`light_infantry`、`artillery`、`air_defense`） |
| `formation_role_tags.<tag>: [模板 id…]` | `ReformOption.attachToFormationRole` | 编组的“角色”= 其编组模板 id 所在的标签 |
| `historical_procurement`（procurement.yaml） | 12 扩展（N-11） | |
| `countries[].capital_key_tile` | 12 §4.1.3“首都” | 首都地块 = 该关键地块所在地块 |
| — | 12 §4.6.8“14 的关键前线格” | 定义：评估时刻本国控制、且（与对手控制地块相邻 或 是 `key_tiles` 之一）的地块 |
- 剧本文件可用 `ai_profile_overrides.<ISO3>` 覆盖个别字段（nk_2020：AZE `doctrine_id: western`，对齐 12 I-02）。

### 3.12 卫星（`theater.yaml satellites[]` → 05 `SatelliteAsset`）
| YAML | 05 字段 | 说明 |
|---|---|---|
| `owner` | `owner` | ISO3 → `CountryId` |
| `means` | `means` | `optical_satellite`/`radar_satellite` → `ReconMeans.OpticalSatellite`/`RadarSatellite` |
| `revisit_h`、`quality` | `revisitH`、`quality` | |
| — | `passPhaseH` | §4.2 第 13 步用世界种子生成 |
| `shares_with` | `sharesWith` | 只有当 `external_actors.<owner>.intel_sharing.to` 含该国且 `from_year ≤ y0` 时开局写入；`from_year > y0` 的由 11 §4.10.4 在该年 1 月 1 日加入（接口需求，§6.2）。owner 不是外部行为体（如 Azersky）时 `shares_with` 必须为空 |
| `from` | （05 无对应字段） | 发射/启用日期；`from > start` 的卫星需要 05 增加启用时刻字段（见 §6.2），在此之前不过顶 |
- 卫星句柄 `satHandle` = 按 `id` ordinal 排序后的序号（从 1 起），用于 §4.2 第 13 步的 RNG 混合。
- 05 不再要求 14 提供“初始固定设施清单”（固定设施由 05 直接从 06/10 读取，05 §6.1）。

---

## 4. 算法与公式

> 本文件的算法只在**新游戏初始化**时运行一次（15：初始化是 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数），之后由各系统接管。唯一例外：§4.7（停火模板求值）、§4.8（目标求值）、§4.9（历史模式的脚本节点）在运行时被 11 调用。
> 随机：`RngDomain.Scenario = 13`；salt 表见 §5.3。遍历顺序：国家按 ISO3 ordinal；编组按文件顺序；其余按 id ordinal。

### 4.1 加载与校验（`ScenarioLoader.Load(id)`）
1. 读 `scenario.yaml`，按 `includes` 读共享文件；应用 `*_overrides`；`dataHash` 取 15 的全局值（§3.3）。
2. **引用校验**（任何一条失败 → 加载报错，列出全部错误）：型号、模板（`direct`/`reforms` 必须是营模板，`children` 必须是 level ≥ Brigade 且低于上级 echelon 的编组模板）、节点 id、区域 id、关键地块 id、停火模板 id、信贷 id、事件引用的口岸/区域/warAim/锚点、`capital_key_tile`、`presentation.main_rival` 与 `countries[].rival` 一致、`tutorial_file` 存在 —— 全部存在；`playable ⊆ countries`；每个可玩国家都有 `inventory`、`oob`、`ai_profiles`、`goals`。
3. **数值校验**：`base_budget_musd_by_year` 覆盖 `[开局年, horizon 年]` 内至少开局年（缺的年按 11 §4.1 第 2 条外推）；人口 > 0；`0 ≤ autoFillShare ≤ 1`；概率字段 ∈ [0,1]；关系 ∈ [−1,1]；`national_truck_payload_t` 单调不减（§3.10）。
4. **地图校验**（需要 10 的输出：`data/map/*.bin`、`data/map/regions.yaml` 与控制快照 `data/map/nk/control/<controlSnapshotId>.yaml`，10 §3.9；14 不读任何多边形）：
   1. 战区地块（10 `TileFlags.IsTheater`）数 ∈ `[expected_tile_count × (1 − TileCountTolerance), × (1 + TileCountTolerance)]`（即 56–76）。
   2. 每个 `control_anchors` 的坐标所在地块是战区地块；其开局控制方（§4.2 第 3.2 步，取自控制快照）与表中 `nk_2010`/`nk_2020` 列一致。
   3. 每个 `key_tiles` 坐标所在地块是战区地块。
   4. 每个区域展开后非空（`nk_contact_line_arm_side` 除外，它在停火时计算）。

#### 4.1.3 区域规则的展开（只用 10 的地块数据与 H3 计算；14 规定规则语义）
| 规则（theater.yaml `regions.<id>`） | 语义 |
|---|---|
| `de_jure: X` | 战区地块中 `Tile.deJureIso3 == X`（10 §3.2；与 11 `TileClaimTable` 同源） |
| `tiles_at: [[lat, lon], …]` | 各点所在 H3 r4 单元（00 §3.5 的 `latLngToCell`），只保留战区地块；点不在战区 → 加载报错 |
| `polyline: [[lat, lon], …]` | 相邻两点间沿大圆每 `PolylineSampleKm` 取一个样点（含两端点），样点所在单元的并集（只保留战区地块） |
| `component_of: {de_jure: X, seed: [lat, lon]}` | 从 seed 所在地块出发，只经过 `deJureIso3 == X` 的战区地块、按 10 的邻接（`Tile.neighbors`）可达的地块集合（BFS，邻居按 h3 升序） |
| `adjacent_to_outside: X` | 战区地块中，至少有一个邻居是外围格（`TileFlags.IsContext`）且其 `deJureIso3 == X` 的地块 |
| `union: [区域…]`、`not: 区域`、`all: [区域…]` | 并集、补集（在战区地块全集内）、交集 |
| `computed_at_ceasefire: true` | 不在加载时展开（`nk_contact_line_arm_side`，§4.7.2） |
| 求值顺序 | 按 `regions` 的文件顺序；引用的区域必须在前面定义（否则加载报错） |
- 行政区（rayon）级区域用 `tiles_at` 的一组代表点近似（区中心 + 大区的补充点），不再用 GADM 多边形（🟡 N-23，替代 N-05 的做法）。

### 4.2 世界状态初始化（`ScenarioInitializer.Run(def, options)`，顺序固定）
1. **国家**（11 §4.1）：创建 `Country`（按 ISO3 字母序得到 `CountryId`，00 §2.2）。开局年 `y0 = start.Year`：`gdpMusd = gdpByYear[y0]`、`populationM = popByYear[y0]`、`budget.baseMusd = baseBudgetByYear[y0]`。按年取值的字段（`hawkishness`、`contract_share_target`、`deterrence_initial`）取 **≤ y0 的最大年份键**的值；没有则取最小键的值。
2. **关系、紧张度、出口政策、外部行为体、信贷、停火模板**：直接映射（§3.4、§3.5）。`tension.score_by_start[scenarioId]` 为初值。
3. **地块**：
   1. `TileClaimTable`（11）：每个战区地块 `deJure[t] = Tile.deJureIso3`（10 §3.6 末句）。
   2. **开局 `TileControl`（09）**：读控制快照 `controlSnapshotId`（10 §3.6 `ControlSnapshot`，纳卡 = `nk_loc_1994`）：快照中有记录的战区地块 → `controllerIso3[t]`；快照中没有记录的战区地块 → 法理归属。（10 已用多数决把 1994 年接触线换成地块控制；G-13/DC-002：阿尔察赫部队控制的地块记为 ARM。N-06）
   3. 校验控制锚点（§4.1 第 4.2 条）。
4. **库存**：按 §3.7 R1–R3、R6 合并，得到 `InventorySpec.counts` 与 `munitionCounts`。
5. **编制实例化**：§4.3。
6. **装备生成与分配**：§4.3.3。
7. **人员**：§4.4。
8. **后勤**：§4.5（含国家级运力 §3.10 → 06）。
9. **空军**：§4.5.3。
10. **采购状态**：生产线（§3.4 的 `from_year` 规则）、在途合同 `open_contracts`（直接创建 `ProcurementContract.state = Active`，交付表从 `next_lot` 起按 11 §4.4.4）。
11. **政治状态**：`trust = initial_trust`；`issueSupport = issueBaseline`；`leadershipHawkishness` 见第 1 步。
12. **历史模式**：`options.mode`（缺省 `defaultMode`）写入 `StrategicSettings`；登记 `scriptedStart`（§4.9）。
13. **卫星**：`theater.satellites` 中 `from ≤ suggestedHorizon` 的每颗卫星创建 05 `SatelliteAsset`（字段映射 §3.12）；`passPhaseH = rng.NextDouble() × revisitH`，`rng = Rng.For(Scenario, Mix(satHandle), 0, SaltSatPhase)`。
14. **AI**：非玩家国家挂 12 的 `AiCountryProfile`（玩家国家也加载，用于“AI 顾问建议”与 V4 默认策略）。

### 4.3 编制实例化（调用 01 的实例化与分配接口，签名照 01 §4.4、§4.12）
**O1 顶层编组**：对 `oob[ISO3]` 中每个 `FormationSpec`（文件顺序）：
```csharp
// 01 §4.4.1：OrgUnitId InstantiateBattalion(TemplateHandle th, CountryId country, FormationId organic, ReadinessTier tier)
// 01 §4.4.2：FormationId InstantiateFormation(TemplateHandle th, CountryId country, FormationId organicParent)
// 01 §4.12 ：CreateOrganicFormation(echelon, hqBn, members) → 新 Organic Formation 的 FormationId
var hq = Org.InstantiateBattalion(T(spec.hqTemplate), country, organic: default, spec.tier);
Place(hq, tile(spec.lat, spec.lon));
var members = new List<NodeRef>();                         // 成员：子编组与直属营（文件顺序）
foreach (var c in spec.children) for (k = 0; k < c.count; k++) {
    var cf = Org.InstantiateFormation(T(c.template), country, organicParent: default);
    SetTierAndPriority(cf, c.tier ?? spec.tier, c.priority ?? spec.priority);   // 见下
    PlaceAll(cf, tile(c.lat ?? spec.lat, c.lon ?? spec.lon));
    if (c.name != null) Formations[cf].name = c.name + (c.count > 1 ? $" {k + 1}" : "");
    members.Add(NodeRef.Formation(cf));
}
foreach (var d in spec.direct) for (k = 0; k < d.count; k++) {
    var bn = Org.InstantiateBattalion(T(d.template), country, organic: default, d.tier ?? spec.tier);
    foreach (var (cat, model) in d.binding) Units[bn].modelOverrides[C(cat)] = M(model);   // 01 §4.6 第 1 级
    Place(bn, tile(d.lat ?? spec.lat, d.lon ?? spec.lon));
    members.Add(NodeRef.Unit(bn));
}
var f = Org.CreateOrganicFormation(spec.echelon, hq, members);   // 成员 organicParent/organicFormation 改为 f
Formations[f].name = spec.name; Formations[f].echelonLabel = spec.echelonLabel;
Formations[f].defaultTier = spec.tier; Formations[f].allocationPriority = spec.priority;
```
- `SetTierAndPriority(cf, tier, prio)`：对 `cf` 及其建制子树中的每个编组设 `defaultTier = tier`、`allocationPriority = prio`，对子树中每个营设 `tier = tier`（01 §4.4.2 实例化时编组的 `defaultTier` 尚未设置，所以由 14 事后统一写入）。
- `Place(bn, t)`：初始化时直接写 09 组件 `BattalionMoveState.currentTile = t`、`legFromTile = t`、`legToTile = 0`、`arrivedTileAt = start`（驻止）；`PlaceAll(f, t)` 对编组子树内全部营调用 `Place`。
- `CreateOrganicFormation` 在开局调用时处于和平时期、无战斗，01 §4.12 的前置条件（指挥部营 `role == Hq`、成员 echelon 低于新编组）由 §4.1 第 2 步的模板校验保证。
- `tile(lat, lon)` = 坐标所在 H3 r4 单元；若不在战区或不在本国控制的地块：取**同国控制地块中中心距离最近者**（距离相同取 H3 数值小者），并记日志。
- 子编组名：`name` 缺省为 01 实例化给的模板名；给了 `name` 且 `count > 1` 时加序号。
- `T(id)`、`C(id)`、`M(id)`：snake_case id → 01 的 `TemplateHandle`、`CategoryHandle`、`ModelHandle`。

**O2 继承（`nk_2020`）**：`oob.<ISO3>.inherit_from: nk_2010` → 先取 `nk_2010` 同国 `oob` 列表的**深拷贝**，再按 `overrides`（按 id 匹配顶层编组）修改字段：`tier`、`lat/lon`（只改编组本身位置，子编组位置**不变**，除非也被 override）、`add_direct`（追加到 `direct`）。override 引用不存在的 id → 加载报错。

**O3 战备等级**：编组的 `tier` 作为下属营的缺省 `ReadinessTier`；`ChildSpec.tier` 覆盖。人员在编比例由 02 按等级决定。

**O4 开局工事**（仅 `nk_2020` 的 `fortification_start`）：映射待 DC-165 决定。若采用 DC-165 ①（09 `EntrenchState`），则对开局时位于“与敌控地块相邻的本国控制地块”上的营调用 09 `SetEntrenchProgress(bn, p)`，`p` 按等级取 `high = 1.0`、`medium = 0.6`、`low = 0.3`（bal）；若采用 ②，由 04 定义等级刻度后再补。

#### 4.3.3 装备生成与分配
```text
1. 对每个型号 m ∈ counts：生成 counts[m] 件 EquipmentItem（01 §3.5），owner = 国家，status = Active，holder = 0，
   locationNode = 本国 Depot 中 storageCapacityT 最大者（同容量取 id ordinal 小者）；11 EquipmentConditionState.condition = 1。
2. 自动补足（R5）：rows = 01 GetForceRequirement(country)（ForceRequirementRow 按 (类别, 型号) 给出 requiredFull）
   对每个 c ∈ autoFillCategories、每行 r（r.category == c，r.model ≠ 0，按 ModelHandle 升序）：
      生成 floor(r.requiredFull × autoFillShare) − （第 1 步已生成的同型号件数，下限 0）件，同第 1 步入库
   r.model == 0（营未解析出型号）：跳过并记日志（数据应给出 default_bindings）
3. 设置 01 CountryOrgSettings[country].policy = AllocationPolicy.PriorityFill（N-24），priorityList 为空（= 按 allocationPriority）；
   调用 01 AllocateEquipment(country, scope = 本国全部营（OrgUnitId 升序）)
   - 01 §4.8.4(b)：按营的建制编组 allocationPriority 升序、再按编组 id、营 id 补满；替代按编组的 allowSubstitution（缺省 true）
   - 营的目标 = 模板槽位 × TierEquipmentTarget(tier)（01 §4.9），所以简编/骨干营只补到平时目标
   - 开局阶段 01 的“发放”直接设 status = Active（不经 06 运输，01 §4.8 阶段 0 规则同样适用于开局）
4. 余量留在仓库（库存），供战时补充（07）。
```
- `condition`：开局装备一律 1.0（N-16：是否给老旧苏式装备初始状态 < 1）。
- 自动补足的拆分直接用 01 需求表的 (类别, 型号) 行，不再另做最大余数拆分（T3 改写见第 8 节）。

### 4.4 人员（02）
1. 预备役池、预备役练度：读 `countries.yaml` 的 `conscription.reserve_pool`、`reserve_general_skill`（02 的“开局初始化”段）。学校产能：`personnel_start.schools.<ISO3>.<schoolId>: {capacity_per_year: N}` = 02 §3.2 的 `manpower.schools`（`schoolId` ∈ `data/schema/schools.yaml`）；未列出的学校按 02 的缺省处理（接口需求，§6.2）。
2. 现役人员：由 02 按“营模板人员需求 × 战备等级在编比例”生成；开局练度按 02 的“按编组 × 专业”输入给出：每个编组的通用练度 = `personnel_start.<ISO3>.general_skill[该编组 tier]`，纳卡防卫军编组（`arm_nk_army` 子树）再加 `nk_defence_army_general_bonus`；所有专业相同；型号专有练度统一取 `type_skill`。
3. **人数校验（警告，不报错）**：
```
generated = Σ 生成的现役人数（含指挥部、保障）
target    = headcount_by_year[y0].total
若 |generated − target| / target > HeadcountTolerance：记 Warning “开局人数 generated 与资料 target 相差 x%”
```
   调平方法（给数据维护者，不在运行时自动做）：调整 `oob` 中编组的 `tier` 或个数。
4. 薪酬类别拆分（11 `PayCategory`）：现役按 02 的岗位（`officer`、`political_officer` → Officer；`nco_*`、`squad_leader`、`team_leader` 及按 `contractShare` 抽中的士兵 → Contract；其余 → Conscript），`contractShare` 用 11 的累加器拆分（02 P-10）。

### 4.5 后勤与空军
1. 节点：`nodes[]` 全部按 06 §6.3 创建（`from_year` 只允许出现在 `factory` 节点上，只影响对应生产线，§3.4）；坐标 → 所在地块；该地块开局不在本国控制 → 加载报错（防止节点落到对方控制区）。
2. 国家级运力（§3.10）：把 `railFleetPayloadT`、`nationalTruckPayloadT` 交给 06 的 `NationalRail(c)` / `NationalRoad(c)` 承运方（06 §4.6）。
3. 战略方向（06 §3 `StrategicDirection`）：`strategic_direction_preset.<ISO3>.<name>: {weight, anchors: [...]}`；`anchors` 是 `key_tiles`/`control_anchors` 的名字；方向的 `regions` = 各锚点所在地块的 10 `RegionOf(tile)`（去重）；一个 Region 已被前面的方向占用则跳过（06：每个 Region 至多属于一个方向）；权重归一。
4. 开局储备：`opening_stocks[scenarioId][ISO3]` 的 `ammunition_days / fuel_days / spare_parts_days / general_days` = 06 `StockTargetSettings.landDays[Ammunition / Fuel / SpareParts / General]`；开局库存 = 06 §4.11 按这些天数算出的 `DepotTarget`（即开局时各仓库正好达到目标）；年龄分布按 06 §4.13（`uniform` 或 `{last_10y_share}`：近 10 年占比，其余均匀分布在更早的保质期内）。R6 列出的弹药型号不按天数计算，改为 `munitionCounts[m]` 枚全部放进第 1 步所述 storage 最大的 Depot（批次年份 = 开局年）。
5. **空军**（08）：`air_force.<ISO3>.<modelId> = nodeId` → 该型号全部库存（分配后剩余的、类别属于航空器/MALE 无人机的件）在该机场编成 `Flight`（作战飞机 4 架一组，余数单独一组；直升机同；MALE 无人机按 08 的“组”规则）。

### 4.6 外部大国（对 11 的数据补充）
- 俄罗斯：供应双方、调停（停火模板 `nov10_template` → `freeze_template`）、红线“亚美尼亚本土”（CSTO）。俄军 102 基地**不实例化**（N-03）。
- 土耳其：阿方供应国（TB2、T-300、T-122、Cobra）、卫星情报共享（2012 年起，`intel_sharing`）、红线“纳希切万”“阿本土”。
- 伊朗：阿拉斯河沿线落弹 → 警告与关系惩罚（红线 `irn_araz_spillover`，只 Warning）。
- 以色列：阿方供应国（`supply_in_war = ISR→AZE` 取 `export_policies.ISR` 的意愿，战时继续供货概率高）。
- 白俄罗斯、乌克兰、捷克、塞尔维亚、中国、摩尔多瓦：只作供应国/二手来源。
- 格鲁吉亚：过境国（`transit_only`），事件 `geo_transit_ban_2020` 关闭其口岸。

### 4.7 停火模板求值（运行时，由 11 §4.8.6 调用）
#### 4.7.1 条件表达式
```csharp
bool Eval(ConditionExpr e, WarContext w) => e.kind switch {
    Always => true,
    Any    => e.children.Any(c => Eval(c, w)),
    All    => e.children.All(c => Eval(c, w)),
    TileControlledBy => TileControl(KeyTileCell(e.keyTile)) == e.country,
    ShareOfRegionControlled => CountControlled(e.region, e.country) / (double)RegionSize(e.region) >= e.min,
    WarScope => w.scope == e.scope,          // limited / total
};
```
- 选择：按调停方 `mediation_template_ids` 列表顺序，取第一个 `Eval == true` 且 `warDay ≥ appliesWhenWarDayAtLeast` 的模板；都不满足 → `freeze_template`。

#### 4.7.2 维和区计算
- `lachin_corridor`：区域展开结果中**当时由 ARM 控制**的地块。
- `nk_contact_line_arm_side`：`nk_oblast` 中由 ARM 控制、且至少一条边的对侧地块由 AZE 控制的地块（停火生效时刻的 `TileControl`，移交条款执行**之后**计算）。
- 维和区 = 上述并集；`endMs = 生效时刻 + years × 365 × 86 400 000`（不计闰日，与 00 §3.3 日历一致的简化，N-17）。

#### 4.7.3 移交
- `handovers` 按列表顺序执行：区域中 `from` 控制的地块（减去 `except_region`）→ 在 `days` 天后（生效时刻 + days × 24h）`TileControl` 改为 `to`；期间 09 让 `from` 方的营撤出（11 §4.8.6 第 3 条）。

### 4.8 目标求值（运行时，11 §4.13 调用；结算点 = 停火生效时或 `deadline`）
| 判据 | 计算 |
|---|---|
| “保住开战时控制地块的 ≥ p” | `1 − coreTilesLost / coreTilesAtStart ≥ p`（11 `WarSideState`，停火生效时、移交执行**后**） |
| “key_tiles {…} 全部由 X 控制” | 逐个 `TileControl(KeyTileCell(k)) == X` |
| “控制 region 的 ≥ p” | 同 §4.7.1 `ShareOfRegionControlled` |
| “≤ D 天内触发模板 T” | `War.ceasefireMs − War.startMs ≤ D × 86 400 000` 且采用模板 = T |
| “阵亡 ≤ N” | 11 `WarSideState.killedCumulative ≤ N` |
| “未触发 forced_ceasefire 红线” | 该战争期间没有任何 `RedLine` 进入 ForcedCeasefire |
| “netAssessment ≥ x” | 指定日期的 `DefenseReview.netAssessment`（12 标准想定） |
| “无 shortfall” | 区间内每年 `DefenseBudget.shortfallMusd == 0` |
| 进度 `challengeProgress` | 布尔判据：0 或 1；比例判据：`min(1, 当前值 / 门槛)`（越小越好的判据用 `min(1, 门槛 / max(当前值, ε))`） |

### 4.9 历史模式与开局脚本
1. **Historical**：`scriptedStart` 的条目按 `at` 时刻排程：`event` 条目在该刻强制触发对应事件（忽略 `mtth_days` 与条件中的随机部分，条件仍需满足；不满足 → 跳过并记日志）；`mobilization` 条目对**非玩家**国家直接设置动员等级（玩家国家只弹出“领导层建议动员”提示）。
2. **Plausible**：`scriptedStart` 全部不执行（事件条目与动员条目都跳过）；历史事件按 11 §4.9 的 `mtth_days` 抽样。
3. **Free**：同 Plausible，且 `historical: true` 的事件全部不触发。
4. 与玩家冲突的 AI 指令（`ai_directive` 指向玩家国家）一律忽略（11 §4.12）。

#### 4.9.3 `border_skirmish` 的交界边解析
- 锚点名 = theater.yaml `control_anchors[].name`。
- `edge_near:<anchor>`：锚点所在地块的边中，对侧地块由另一交战国控制者，取边中点距锚点最近的一条（平局按 `EdgeId` 升序）。
- `edge_between:<a>,<b>`：两锚点所在地块相邻 → 该边；不相邻 → 取 a 所在地块中朝向 b（边中点到 b 的距离最小）且对侧为敌控的边。
- `edge_random:contact_line`：所有“两侧分属 ARM、AZE 控制”的边按 `EdgeId` 升序排列，`rng.NextInt(n)` 选一条；`rng = Rng.For(Scenario, Mix(eventHandle), tick, SaltSkirmishEdge)`。

### 4.10 剧本事实汇总（供简报与校验；全部来自数据文件）
**预算（2020 年不变价，百万美元；来源 wb_milex → 换算）**

| 年 | 2010 | 2012 | 2014 | 2016 | 2018 | 2019 | 2020 |
|---|---|---|---|---|---|---|---|
| ARM | 464.4 | 430.4 | 500.3 | 462.7 | 528.7 | 660.8 | 634.0 |
| AZE | 1 736.0 | 3 670.9 | 3 745.5 | 1 498.5 | 1 722.6 | 1 879.2 | 2 237.8 |
| 比值 AZE/ARM | 3.7 | 8.5 | 7.5 | 3.2 | 3.3 | 2.8 | 3.5 |

**主要装备（开局库存，ARM 含纳卡；confidence 见数据文件）**

| 类别 | ARM 2010 | AZE 2010 | ARM 2020 | AZE 2020 |
|---|---|---|---|---|
| 主战坦克 | 481 | 282 | 449 | 395 |
| 步战车/侦察车（BMP/BRM/BMD/BRDM） | 482 | 127 | 523 | 304 |
| 装甲输送车（BTR/MT-LB） | 295 | 587 | 453 | 558 |
| 身管火炮（≥122mm，含自行，不含迫榴炮） | 489 | 385 | 567 | 330 |
| 火箭炮 | 91 | 87 | 109 | 191 |
| 战术弹道导弹发射车 | 8 | 3 | 16 | 8 |
| 中远程防空发射车（S-125 以上） | 53 | 27 | 55 | 69 |
| 固定翼作战/教练攻击机（fighter 类别） | 22 | 43 | 26 | 36 |
| MALE/战术/手抛无人机 | 0 | 10 | 15 | 64 |
| 巡飞弹（枚） | 0 | 0 | 0 | 250 |

> 表中数字由数据文件逐项汇总（脚本复算，§9.1）。

> 2010 → 2020 的结构性变化（阿方无人机/巡飞弹/远程火力，亚方几乎不变）正是 MVP 要检验的机制（总纲 §21-4“为什么选它”）。

**地图**：亚美尼亚 29 743 km² + 阿塞拜疆 86 600 km²（含纳希切万）≈ 116 343 km² → H3 r4 约 66 格；2020 年接触线约 8–10 条交战边（总纲 §21-4）。

---

## 5. 常数表

### 5.1 剧本加载
| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `TileCountTolerance` | 0.15 | — | 0.1–0.25 | 66 格为估算（§4.10） |
| `HeadcountTolerance` | 0.25 | — | 0.1–0.4 | 模板为简化苏式编制，后苏联部队缺编普遍 |
| `AutoFillShareDefault` | 0.9 | — | 0.7–1.0 | bal；数据可按国家覆盖 |
| `NkDefenceGeneralBonus` | 0.05 | — | 0–0.15 | bal（数据字段 `nk_defence_army_general_bonus`） |
| `PolylineSampleKm` | 5 | km | 2–10 | §4.1.3 `polyline` 规则的取样间距；远小于地块边长（18–27 km），保证不漏过沿线地块 |

### 5.2 剧本数值（集中在数据文件；此处列出须调参的关键量）
| 名称（数据键） | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `tension.score_by_start.nk_2010` | 0.45 | — | 0.35–0.6 | 冻结冲突常态（bal） |
| `tension.score_by_start.nk_2020` | 0.80 | — | 0.65–0.9 | 托武兹冲突后的危机（bal） |
| `leadership_hawkishness` AZE 2010/2016/2020 | 0.60/0.70/0.80 | — | ±0.15 | bal（史实走向） |
| `leadership_hawkishness` ARM 2010/2018 | 0.35/0.30 | — | ±0.15 | bal |
| `contract_share_target` ARM 2010/2020 | 0.25/0.45 | — | ±0.1 | 2017 年约 1.9 万义务兵 + 2.3 万职业军人 |
| 薪酬 ARM（义务/合同/军官） | 0.0015/0.006/0.012 | Musd/人/年 | ×0.5–×2 | 反推人员费占比约 45–50%（estimated） |
| 薪酬 AZE（义务/合同/军官） | 0.002/0.010/0.018 | Musd/人/年 | ×0.5–×2 | estimated |
| `reserve_pool` ARM/AZE | 210 000 / 300 000 | 人 | — | stated（wp_arm_2020 / wp_azelf_2020） |
| `opening_stocks` 弹药天数 ARM/AZE（2020） | 25 / 60 | d | 10–90 | bal（真实值未公开） |
| `supply_in_war` RUS→ARM / RUS→AZE / TUR→AZE | 0.7/0.5/0.95 | — | — | bal |
| 红线 `grace_hours` / 强制停火延迟 | 24 / 72 | h | 0–96 | bal |
| `mediation_first_day` / `interval` | 7 / 7 | d | 3–14 | 2020 年俄方 10-10 首次斡旋（第 13 天），bal 取早 |
| `nov10_template` 条件：七区控制比例 | 0.5 | — | 0.4–0.7 | bal（史实：阿方控制南四区 ≈ 七区的一半时接受） |
| 维和年限 / 人数 | 5 / 1 960 | 年 / 人 | — | stated（wp_cf2020） |
| 移交天数 阿格达姆/克尔巴贾尔/拉钦 | 10/15/21 | d | — | stated（11-20、11-25、12-01） |

### 5.3 RNG salt（`RngDomain.Scenario = 13`）
| salt | 值 | 用途 |
|---|---|---|
| `SaltTieBreak` | 1 | 预留：初始化中的随机平局（当前规则全部确定性，不使用） |
| `SaltAutoFillSplit` | 2 | 预留（当前用最大余数法，不使用） |
| `SaltSatPhase` | 3 | 卫星过顶相位 |
| `SaltSkirmishEdge` | 4 | `edge_random` 交界边选择 |

---

## 6. 与其他系统的接口

| 对方 | 方向 | 内容 | 时机 |
|---|---|---|---|
| 01 | 调用 | `InstantiateBattalion(TemplateHandle, CountryId, FormationId organic, ReadinessTier)`（§4.4.1）、`InstantiateFormation(TemplateHandle, CountryId, FormationId organicParent)`（§4.4.2）、`CreateOrganicFormation(echelon, hqBn, members)`（§4.12）、`GetForceRequirement(CountryId)`、`AllocateEquipment(CountryId, IEnumerable<OrgUnitId> scope)`（§4.8）；写 `CountryOrgSettings.policy`、`CountryOrgSettings.countryDefaults`（取各国模板 `default_bindings`）、`Formation.name/echelonLabel/defaultTier/allocationPriority`、`OrgUnit.tier/modelOverrides`、`EquipmentItem` | 初始化 |
| 02 | 写/调用 | 预备役池与练度（`reservePool`、`reserveGeneralSkill`）、学校产能（`manpower.schools`）、开局练度（按编组 × 专业）；02 生成名册 | 初始化 |
| 05 | 写 | `SatelliteAsset`（§3.12，含 `sharesWith`）、战区地块列表（= 10 `IsTheater` 地块）；**不**提供固定设施清单（05 从 06/10 读，DC-119） | 初始化 |
| 06 | 写 | 节点（06 §6.3 schema）、`RailFleetPayloadT`/`NationalTruckPayloadT`（§3.10）、`StockTargetSettings.landDays` 与开局库存及年龄分布、`StrategicDirection`、R6 弹药库存、口岸 | 初始化 |
| 08 | 写 | 按型号与机场编成 `Flight` | 初始化 |
| 09 | 写 | 开局 `TileControl`（控制快照）、`BattalionMoveState` 初始位置（驻止）、关键地块表（调度优先级 `keyTile`） | 初始化 |
| 10 | 读 | `IMapQuery`（`TryGetTile`、`Neighbors`、`TileCenter`、`RegionOf`、`GreatCircleM`）、`Tile.deJureIso3/flags/neighbors`、`data/map/*.bin`、`data/map/regions.yaml`、控制快照 `data/map/nk/control/<controlSnapshotId>.yaml`（`ControlSnapshot.controllerIso3`） | 加载 |
| 11 | 写/被调用 | 国家、预算、兵役、关系、紧张度、出口政策、外部行为体、信贷、生产线与外生建成项目、在途合同、事件、停火模板、目标、`TileClaimTable`；运行时被调用 §4.7、§4.8、§4.9 | 初始化 / 运行时 |
| 12 | 写 | `AiCountryProfile`（§3.11）、参考模板、编组角色标签、`historical_procurement`、关键地块价值、首都、“关键前线格”定义 | 初始化 |
| 13 | 读 | `ScenarioPresentation`（§3.9）、`ListScenarios()`、简报、目标面板、结局页的视图数据（§2.2）、停火模板（S21 预览） | 新游戏界面 / 游戏中 |
| 15 | 约束/存档 | 初始化为 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数；存档见 §6.1 | 新游戏 / 存读档 |

```csharp
public interface IScenarioService {
    IReadOnlyList<ScenarioListEntry> ListScenarios();                         // §3.9（S01，不做完整校验）
    ScenarioDefinition Load(string scenarioId);                               // §4.1
    WorldState Initialize(ScenarioDefinition def, ScenarioInitOptions opt);   // §4.2–4.6
    void RunScriptedStart(long tick);                                         // §4.9：11 在每小时事件步（11 §4.9）开始时调用
    CeasefireTemplate SelectCeasefireTemplate(WarId war, CountryId mediator); // §4.7.1：11 §4.8.6 调用
    PeacekeepingZone BuildPeacekeepingZone(CeasefireTemplate t, WarId war);   // §4.7.2：11 §4.8.6 生效时调用
    IReadOnlyList<ulong> ExpandTileSet(TileSetRef s);                         // 11 §3.4 TileSetRef：DeJure → TileClaimTable 中归该国的地块；Region → §4.1.3 规则（加载后缓存）；
                                                                              // Explicit → 11 StrategicState.explicitTileSets[key]；结果 H3 升序。11 红线/停火、12 warAims、13 预览使用
    double GoalProgress(CountryId c, string goalId);                         // §4.8：11 §4.13 调用
    EdgeId ResolveSkirmishEdge(string arg, long tick, ulong eventHandle);    // §4.9.3：11 执行 BorderSkirmish 效果时调用
}
public sealed class ScenarioRuntimeState {      // 14 唯一的运行时状态
    public string scenarioId; public ScenarioInitOptions options; public ulong dataHash;
    public int nextScriptedIndex;               // scriptedStart 中下一个未执行条目的下标（按 at 升序）
}
```

### 6.1 存档清单（15）
- `SectionId.Scenario = 70`（15 §3.2），flags = `Required | InStateHash`；组件：`ScenarioRuntimeState`（`scenarioId`、`ScenarioInitOptions`、`dataHash`、`nextScriptedIndex`）。
- 不存档（派生，读档后重建）：`ScenarioDefinition`（按 `scenarioId` 重新 `Load`；读到的 `dataHash` 与 `SaveHeader.dataHash` 不同 → 按 15 的数据版本不符处理）、区域展开缓存、`ScenarioPresentation`、`KeyTileRef`。
- 14 初始化时写入其他系统的状态（国家、编制、节点、卫星、`TileControl` 等）归各系统自己的段存档。

### 6.2 对其他规格的接口需求（未满足前，本文件相应功能按“备注”降级）
| 规格 | 需求 | 备注 |
|---|---|---|
| 05 | `SatelliteAsset` 增加启用时刻（如 `long activeFromMs`），过顶早于它时跳过 | 未加前：`from > start` 的卫星在开局即生效（偏差：nk_2010 中 Göktürk/Azersky 提前可用） |
| 11 | `War` 保存 `start_war` 的 `scope`/`maxDays`/`template` 并在第 `maxDays` 天生成该模板的强制停火提议（§3.8）；§4.4.2 读取 `exportFromYear` + `exportUnlockFlag`（11 已有）；§4.10.4 读取 `supply_in_war` 覆盖值；§4.10.4 按 `intel_sharing.from_year` 在当年 1 月 1 日把受援国加入 `sharesWith`；§4.9 每小时事件步开始时调用 `RunScriptedStart`；§4.8.6 调用 `SelectCeasefireTemplate`/`BuildPeacekeepingZone`；§4.13 调用 `GoalProgress`；`BorderSkirmish` 调用 `ResolveSkirmishEdge`；定义 `EventScope`、`TileSetRef`；确认 `Dyad` 事件对两国各实例化一次（§3.8 的 `self`）；定义系统旗标 `big_contract_signed_last_90d`；确认 `totalCostMusd = 0` 的“外生建成”项目按 `nominalDays` 完工 | 见报告 |
| 12 | `AiCountryProfile` 增加 `historicalProcurement`（N-11）；I-02 映射与本剧本一致（ARM `soviet`、AZE 2010 `soviet` / 2020 `western`） | |
| 02 | 学校产能未列出时的缺省值 | 本剧本已给出主要学校 |
| 09 | （可选）提供开局放置营的接口，替代 14 直接写 `BattalionMoveState` | |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 10 的地图产物缺失 | 加载失败，提示运行地图流水线；阶段 0 不需要本剧本 |
| 控制锚点所在地块的开局控制方与表不符 | 加载报错（说明 10 的控制快照或锚点坐标有误，N-06） |
| 控制快照文件缺失 | 加载报错，提示运行 10 的 S8 步骤生成 `data/map/nk/control/<controlSnapshotId>.yaml` |
| 编组坐标落在敌控/战区外地块 | 移到最近的本国控制地块并记日志（§4.3 O1） |
| 节点坐标落在敌控地块 | 加载报错（§4.5） |
| 某区域的代表点全部落在同一地块（`tiles_at`） | 允许（区域 = 1 格）；与另一区域完全重合也允许（地块精度下的近似，N-23） |
| 库存少于模板需求 | 正常：01 PriorityFill 让低优先级营缺编 |
| 库存多于需求 | 余量入库（供补充） |
| 同一型号既有 `t72a` 又有 `_nk_t72a` | R3 累加 |
| `inherit_from` 链 | 只允许一层（2020 → 2010）；多层或环 → 加载报错 |
| 玩家选阿方 + Historical 模式 | 开局脚本中针对阿方的 `ai_directive`/`mobilization` 不执行；事件 `aze_2020_september_offensive` 改为提示“作战方案已获批准”（11 §4.7.5） |
| 停火模板的移交区域中有第三方地块 | 只移交 `from` 方控制的地块 |
| 维和区与移交区重叠（拉钦走廊） | `except_region` 先从移交中扣除，再建维和区 |
| 两个可玩国家都由 AI 控制（观战/V2） | 允许；`playerIso3 = null` |
| 年份键缺失（如 hawkishness 只有 2010、2016） | 取 ≤ 年份的最大键（§4.2 第 1 步） |

---

## 8. 测试用例

**T1 货币换算**：`ARM 2010 = 395.0115 × 100 / 85.058 = 464.4`（四舍五入 0.1）；`AZE 2016 = 1396.9691 × 100 / 93.227 = 1498.5`。期望与 `countries.yaml` 一致。

**T2 库存合并（R3）**：`nk_2010` ARM：`t72a: 137` + `_nk_t72a: 316` → `counts.t72a = 453`，`subTotals["_nk_t72a"] = 316`；`mbt` 类别合计 = 453 + `t80b` 20 + `t55` 8 = **481**（§4.10 表）。

**T3 自动补足（R5）**：01 需求表中类别 `truck_medium` 有两行：`(truck_medium, ural4320)` `requiredFull = 900`、`(truck_medium, kamaz_5350)` `requiredFull = 337`；`autoFillShare = 0.9`；库存中已有 `ural4320` 100 件。期望：生成 `ural4320` `floor(810) − 100 = 710` 件、`kamaz_5350` `floor(303.3) = 303` 件。

**T4 坦克分配（PriorityFill，忽略战备等级的平时比例）**：`nk_2010` ARM 的 MBT 需求：纳卡防卫军 5 个 `arm_nk_defence_regt` × 31 + 直属坦克营 31 = 186（优先级 10）；1 军 2 × 31 + 31 = 93（20）；2 军 93（40）；3 军 155（50）；4 军 124（50）；5 军 31（70）。库存 481（含替代 T-80B、T-55）。期望：纳卡 186 → 余 295；1 军 93 → 202；2 军 93 → 109；3 军（FormationId 小于 4 军）得 109、缺 46；4 军、5 军 0。（实际分配还受 01 §4.9 简编营只补平时目标的影响，该测试关闭此规则以便手算。）

**T5 停火模板选择**：调停方 RUS，模板顺序 `[nov10_template, freeze_template]`，第 20 天。
- 情况 a：阿方控制舒沙地块 → `nov10_template`。
- 情况 b：舒沙仍为亚方；七区共 20 格（示例），阿方控制 11 格（0.55 ≥ 0.5）→ `nov10_template`。
- 情况 c：阿方控制 9 格（0.45）且无舒沙 → `freeze_template`。
- 情况 d：同 a 但第 5 天（`applies_when_war_day_at_least = 7`）→ `freeze_template`。

**T6 维和区**：停火时 `lachin_corridor` 展开为 3 格，其中 2 格亚方控制；`nk_oblast` 中亚方控制 6 格，其中 4 格与阿控地块相邻。期望维和区 = 2 + 4 = 6 格；`endMs = start + 5 × 365 × 86 400 000`。

**T7 目标求值**：`arm_hold_2020`，开战时控制 30 格，停火时失去 8 格，舒沙/斯捷潘纳克特/拉钦都在 → `1 − 8/30 = 0.733 ≥ 0.7` 且关键地块满足 → 成功，进度 1。若失去 10 格 → 0.667，进度 `min(1, 0.667/0.7) = 0.952`，未成功。

**T8 年份键取值**：AZE `leadership_hawkishness {2010: 0.60, 2016: 0.70, 2020: 0.80}`：`nk_2010` 开局 → 0.60；若玩家在 2016-04 读档新开（不适用，开局只取 y0）——运行中由事件 `set_leadership_hawkishness` 改变；`nk_2020` 开局 → 0.80。

**T9 继承（O2）**：`nk_2020` AZE：`aze_4th_corps` 覆盖 `tier: active`、位置 (40.3744, 47.1267)，其子编组位置仍为 2010 年数据（巴库）。期望：军部营在巴尔达所在地块，子旅在巴库所在地块（之后由 12 的 AI 前调）。

**T10 skirmish 边解析**：`edge_between:tovuz,berd`，两锚点所在地块相邻 → 选该边；若不相邻，取托武兹地块中边中点距 Berd 最近且对侧为亚控的边。

**T11 人数校验**：`nk_2020` ARM 生成 61 000 人，`target = 72 943` → 偏差 16.4% < 25% → 无警告；生成 50 000 → 31.5% → Warning。

---

## 9. 验证建议（对应计划 V1–V7）

### 9.1 V1 数据一致性（`tools/validation/v1_nk_data.py`）
1. `tools/validate_data.py` 0 错误（该脚本已检查 `data/scenarios/**` 的型号、模板、类别引用与 oob 层级；01 M2 类别已并入 `categories.yaml`）。
2. 引用完整性（型号、模板、节点、区域、模板、信贷、事件引用）全部可解析（脚本复刻 §4.1 第 2 条）。
3. 库存 ≥ Oryx 损失下限（`nk_2020`：坦克 449 ≥ 255，牵引炮 459 ≥ 250，自行炮 108 ≥ 29，火箭炮 109 ≥ 84，防空导弹 109 ≥ 39）。
4. 人员费占比：按 11 §4.2.2 与本剧本薪酬，开局年人员费 / 预算：ARM ∈ [0.40, 0.55]，AZE ∈ [0.15, 0.35]。（ARM 2020：40 120×0.0015 + 24 070×0.006 + 8 750×0.012 ≈ 309.6 → 48.8%。）
5. 开局实例化后人数 vs `headcount_by_year`（±25%）。

### 9.2 V2 历史校准（`nk_2020`；本文件给目标，11 §9.2 给疲劳部分）
**设置**：`nk_2020`，Historical 模式，双方 AI（`playerIso3 = null`），200 个种子；精度档按 09 的固定规则（允许 Cached）；运行到停火或第 120 天。
**比较对象**：`calibration.yaml`。
**区间来源（DC-190：目标区间由 14 依据公开统计核定）**：史实值全部取自 `calibration.yaml` 文件头的公开来源键（`wp_war` 信息框：持续天数、双方官方阵亡、领土约 72%；`wp_cf`：移交日期、维和规模；`wp_tl`：时间节点；`oryx`：视觉确认装备损失，属下限）。区间宽度（bal，大致规则）：持续时间中位数约 −20%/+25%、p10–p90 约 ±70%；阵亡约为史实值的 0.6–1.5 倍（官方数字本身有失踪与统计口径差异）；Oryx 项取约 0.6–1.4 倍且下限不低于视觉确认数的 60%（视觉确认是下限，但模拟的“永久损失 + 遗弃 + 被缴获”与其分类不完全对应）；领土比例约 ±0.15。下表与 `calibration.yaml` 的 `band` 字段一致，两处改动必须同步。
**判据**：
| 类别 | 必须满足 | 说明 |
|---|---|---|
| 持续时间 | 中位数 ∈ [35, 55] 天；p10–p90 ⊂ [25, 75] | 史实 44 天 |
| 阵亡 | ARM 中位数 ∈ [2 500, 5 500]；AZE ∈ [1 800, 4 500]；比值 ∈ [1.0, 1.8] | 史实 3 825 / 2 906 |
| 领土 | 战斗中失去的亚方开战控制地块比例中位数 ∈ [0.25, 0.50]；含移交的总比例 ∈ [0.55, 0.85] | 史实约 72%（含移交） |
| 停火模板 | ≥ 60% 种子采用 `nov10_template` | 11 §9.2 第 3 条 |
| 红线 | ≥ 90% 种子未触发 `rus_csto_armenia_proper` 的强制停火 | |
| 装备损失（Oryx 区间） | 坦克、IFV、牵引炮、自行炮、火箭炮、防空导弹、卡车 7 项中 ≥ 5 项的中位数落在区间内 | 视觉确认是下限，区间已放宽 |
| 时间节点 | 南线 4 城地块易手日期与史实差 ≤ 15 天的种子比例 ≥ 50% | |
| 定性（uncertain） | A+C 线损失占比、前两周防空消耗 —— 只报告，不作硬判据 | |

**辅助校准 V2b（可选，2016 年四月战争）**：`nk_2010` 在 2016-04-01 由事件 `aze_2016_april_war` 触发有限战争（`max_days = 7`）。期望：持续 3–7 天；**无地块易手**（史实阿方获得 8–20 km²，远小于一格）；双方阵亡各 30–200（史实官方：亚 91、阿 31，阿方非官方 94；来源 Wikipedia “2016 Nagorno-Karabakh conflict” 信息框）。
**不达标时的调参顺序**：①剧本参数（库存的 uncertain 项、工事初值、开局练度、弹药天数）→ ② 11 的疲劳常数 → ③ 03/04/05 的战斗与侦察参数（属各自 V 项）。每次调参记录到 `docs/calibration_log.md`（由验证者维护）。

### 9.3 V4 十年战役可玩性搜索（`nk_2010`，亚美尼亚是否有“可行但困难”的路线）
框架与判据表见 [11 §9.3](11_strategic_layer.md)；本节给出纳卡的**具体**设置。

**1. 快速模拟器**（Python，`tools/validation/v4_nk_campaign.py`）
- 时间步：月。每月：11 的预算计费、采购裁决（批准概率按 11 §4.4.2，用同一常数文件）、交付、生产、升级、训练（02 的练度增长按强度的月度增量）、二手市场（季度）、事件（历史事件按 Plausible 模式抽样）。
- 战争触发：阿方 AI 每月用 12 的 `ProxyModel` 评估 `war_aims` 的成功率；`successP ≥ war_start_p_min (0.6)` 且紧张度 ≥ Crisis 且 2016 年后 → 开战（Plausible）。另设“史实日期强制开战”变体：2020-09-27 必开战（检验“打不起来”以外的路线）。
- 战争结算：战区级代理模型（12 `ProxyModel` 的战区版本：输入双方营能力向量汇总、防空覆盖率、无人机/巡飞弹数量、纵深火力、工事等级、弹药天数；输出每日各前线地块易手概率与伤亡），疲劳与停火按 11 §4.8，停火模板按本文件 §4.7。
- 性能要求：一次 10 年 + 战争的运行 ≤ 5 ms（单核），以支持下面的搜索规模。

**2. 亚美尼亚的策略空间（每年一个决策向量，10 年）**
| 维度 | 取值 |
|---|---|
| 预算模板（采购/基建/储备） | {0.6/0.15/0.25, 0.45/0.25/0.30, 0.35/0.40/0.25, 0.70/0.05/0.25, 0.30/0.20/0.50, 0.50/0.30/0.20} |
| O&M 资金率 | {0.85, 1.0, 1.1} |
| 训练强度 | {Low, Normal, High} |
| 合同兵目标 | {保持, +0.1（需议题达标）} |
| 采购组合（每项 0 / 少 / 多） | 防空：Tor-M2KM（2/6 部）、Buk-M1-2（4/8）、Osa 翻新（白俄二手 4/12）、S-300PS 二手（4/8）；电子战：Repellent-1（2/6）、Avtobaza（1/3）；反炮兵雷达 1L219（2/6）；远程火力：Smerch（6/12）、TOS-1A（3/6）、Iskander-E（2/4）；装甲：T-72→T-72B3 升级（20/60/年）、二手 T-72B/BMP-2 批次；反坦克：Kornet（30/90）；单兵防空：Igla-S（50/150）；无人机：国产 Krunk 线扩产（+10/+30 件/年）、HRESH 线（2020 前不可用）；飞机：Su-30SM（0/4/8）、Su-25 翻新 |
| 工事投资（基建线中划给前沿工事的比例） | {0, 0.3, 0.6} |
| 战备储备目标（弹药天数） | {20, 40, 60} |
| 俄贷款 | {用, 不用}（2016 年起可用） |
| 动员准备（预备役复训，训练线） | {无, 每年 5 000 人, 15 000 人} |

**3. 对手（阿塞拜疆）三档**
- H：史实预算路径 + `historical_procurement` 清单（Historical 采购，Plausible 开战）。
- P：12 的阿方 AI 默认采购（`ai_profiles.yaml`）。
- B：“理性最优回应”：对 H 档下最优的 10 个亚方策略，用同样的搜索方法优化阿方采购（交替优化 2 轮）。

**4. 搜索**
- 方法：拉丁超立方随机抽样 5 000 个策略 → 取前 5% 做 CMA-ES（或遗传算法）各 3 000 次评估；总评估 ≥ 20 000 个策略；每个策略 50 个种子。
- 随机基线：从策略空间均匀抽样 2 000 个，作为“困难度”分母。

**5. 结果分类（每次运行）**
| 类 | 定义 |
|---|---|
| A 威慑成功 | 2020-12-31 前未开战（Plausible 触发规则下） |
| B 守住 | 开战，停火时保住开战控制地块 ≥ 70%，且舒沙、斯捷潘纳克特、拉钦走廊均由 ARM 控制 |
| C 有限失败 | 开战，保住 40–70%，关键地块至少保住 2 个 |
| D 史实式失败 | 保住 < 40% 或失去舒沙（触发 `nov10_template`） |
| E 崩溃 | 保住 < 15% 或纳卡全部地块失守 |

“成功” = A 或 B。

**6. 判据（全部满足 = “可行但困难”）**
| 判据 | 门槛 |
|---|---|
| 存在性 | 至少 1 个策略对 H 档的成功率 ≥ 50%（50 种子） |
| 困难度 | 随机基线中“成功率 ≥ 50%”的策略占比 ∈ [1%, 15%] |
| 默认策略接近史实 | 亚方 AI 默认策略（`ai_profiles.yaml`）对 H 档：D+E 类 ≥ 60%，且失去控制地块比例中位数 ∈ [0.3, 0.6] |
| 稳健性 | 最优策略对 B 档的成功率 ≥ 25% |
| 无万能解 | 最优策略对 H 档成功率 ≤ 85%；逐项删除采购组合中的一项后重算，任一单项贡献 ≤ 改善量的 50% |
| 不依赖漏洞 | 最优策略全程无 `shortfall`、信任度从未低于 0.25、未使用“最高决策者”沙盒 |
| 敏感性 | 单价 ±50%、批准概率 logit ±1、阿方预算 ±20%、代理模型偏置 ±0.1 的 16 个组合中，最优策略在 ≥ 10 个组合里仍“成功率 ≥ 40%” |
| 可读性（人工） | 最优策略的关键因素能在年报/AAR 中看到（防空覆盖、电子战、工事、弹药天数等） |

**7. 输出**：策略分布报告（按边际贡献排序的投资项）、成功策略的 10 年预算曲线示例、阿方 B 档的最优回应清单。
**8. 不达标时的调整顺序**（不改战斗模型，那是 V2 的职责）：
- 太难（存在性/困难度不达标）：① 扩大亚方可得采购（二手池：白俄 Osa/S-125、俄 Tor/Buk 的 `quarterly_p`；俄贷款额度）→ ② 亚方出口政策意愿（RUS→ARM `willingness`）→ ③ 11 的交付期常数。
- 太易：反向调整；或提高阿方 `aggression`（威慑过易时）。
- 每次调整后重跑 V2（剧本参数变化不能破坏 2020 校准）。

### 9.4 其他
- 05 的 R-V3（纳卡 2020 情报画面）、06 的 V3（后勤，拉钦走廊单点依赖：删除拉钦走廊地块后纳卡补给下降应 ≥ 80%）使用本剧本数据。
- 15 的 H1 黄金回放用 `nk_2020` 前 72 小时。

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| N-01 | 纳卡防卫军归属（G-13） | 🟡 并入 ARM：同一 `Country`，独立顶层编组 `arm_nk_army`；库存分项用 `_nk_` 前缀保留（**DC-002 已同意**，已在 §3.7 R3、§4.2 第 3.2 步、countries.yaml、scenario.yaml 落实） | 叙事中立、外交实体最少；玩家操作上本就是一方 | 用 ISO 用户自定义码独立参战方 |
| N-02 | 剧本数据的 `confidence: stated` 含义 | 🟡 指“文件头所列公开来源”，并要求固定修订版链接 | 维基页面会变；固定 `oldid` 可复核 | 只接受原始出版物（IISS 原表） |
| N-03 | 俄 102 基地 | 🟡 不实例化，只作为红线与叙事 | 2020 年未参战；实例化会诱导“拉俄参战”的玩法 | 实例化为不可控中立部队 |
| N-04 | 纳卡自身军费 | 🟡 不加（`nk_supplement = 0`），亚方预算只用 SIPRI 亚美尼亚数 | 无公开数据；人员费反推已含纳卡人数 | 加 15–25% 估算 |
| N-05 | NKAO 边界近似 | 🟡 用 GADM 2 级 rayon 并集近似（审查注：14 不再读多边形，实际做法改为 N-23 的代表点） | 地块精度（~40 km）下误差可接受 | 手工数字化 1988 年 NKAO 边界 |
| N-06 | 1994–2020 接触线数据 | 🟡 由 10 按公开地图手工数字化成 `loc_1994.geojson`，用控制锚点校验（审查注：10 已把它转成 `ControlSnapshot nk_loc_1994`，DC-170；14 只读快照） | 没有权威开源矢量数据 | 用 OSM 争议边界标签（不完整） |
| N-07 | 仓库/基地位置 | 🟡 用城市级坐标（公开资料没有真实仓库位置） | 地块精度下足够；避免臆造“精确”位置 | 不放仓库，按规则生成 |
| N-08 | 装备单价 | 🟡 采用数量级估算 + V4 ±50% 敏感性扫描；结论若敏感则先用 SIPRI TIV 校准 | 公开出口单价极少 | 直接用 SIPRI TIV 作为价格 |
| N-09 | 盟国情报共享 | 🟡 只开土耳其卫星对阿共享（2012 起）；俄对亚不共享 | 公开证据有限；与 05 R-12 一致 | 都不共享；都共享 |
| N-10 | uncertain 库存数字 | 🟡 先用当前估算，须用 IISS Military Balance 2010/2020 原表逐项核对 | IISS 为付费资料，当前只能二手转引 | — |
| N-11 | 史实采购清单的存放 | 🟡 放剧本 `procurement.yaml` 的 `historical_procurement`，作为 12 `AiCountryProfile` 的扩展字段 | AI 在 Historical/Plausible 模式需要“参考计划” | 写成事件 |
| N-12 | 2016 年四月战争 | 🟡 收录为可选历史事件（Historical/Plausible 开启，Free 关闭）；玩家是阿方时以“机会事件”出现 | 既是校准点（V2b），也是十年剧本的中期考验 | 不收录 |
| N-13 | 人道主义停火 | 🟡 只作事件（影响关系），不暂停战斗 | 2020 年三次均未持续 | 机械暂停 24–72 小时 |
| N-14 | 开局练度 | 🟡 按国家 × 战备等级统一值；纳卡加 0.05 | 无可靠量化数据；保持透明 | 按编组逐个设定 |
| N-15 | 两国模板同构 | 🟡 用同一生成脚本产出，只在旅/团级不同 | 苏式遗产相同；减少维护量 | 两国分别手写 |
| N-16 | 开局装备状态 | 🟡 一律 1.0（老旧由型号属性体现） | 简单；二手采购才引入状态 | 苏式遗留装备 0.7–0.9 |
| N-17 | 维和区年限的日历 | 🟡 按 365 天/年（与 00 无闰秒约定的简化一致） | 简单 | 按公历加年 |
| N-18 | 阿方兵役期 | 🟡 18 个月（uncertain，另一说 24） | 常见说法 | 24 |
| N-19 | 巴库港 | 🟡 阶段 1 不建模海运入口 | 海运阶段 2+（06） | 作为陆地口岸 |
| N-20 | 地图范围 | 🟡 只含 ARM ∪ AZE 法理领土；邻国地块不实例化、边不可通行 | 与总纲“约 65 格”一致 | 加一圈邻国地块作缓冲 |
| N-21 | 战区时间是否显示历史夏令时 | 🟡 建议：固定 UTC+4（`display_utc_offset_min = 240`）显示，不模拟夏令时。理由：亚美尼亚 2012 年起、阿塞拜疆 2016 年起已取消夏令时，2020 剧本不受影响；2010 剧本中夏季差 1 小时只影响显示，固定偏移更简单、存档/回放无歧义 | 显示与模拟分离，模拟一律 UTC | 备选：按日期显示历史夏令时（2010–2011 年夏季亚方 UTC+5，2010–2015 年夏季阿方 UTC+5；两国不同时需选一国为准） |
| N-22 | 争议地名两种官方名的先后顺序 | 🟡 建议：`PlayerFirst`——玩家所属国家的官方名在前、对方官方名在后（如玩家为 AZE：`Xankəndi / Stepanakert`；玩家为 ARM：`Stepanakert / Xankəndi`）；观战/V2 只显示英语常用名。理由：玩家扮演一国国防部长，本国公文用语在前更自然；两名始终并列，不隐藏任何一方 | 叙事中立靠“并列 + 无评价”实现 | 备选：固定按法理归属（阿方名在前）；固定按字母序；只显示英语名 |
| N-23 | 行政区级区域的近似方法 | 🟡 建议：用代表点（`tiles_at`）+ 折线取样（`polyline`）+ 法理连通（`component_of`）定义区域，运行时只用 10 的地块数据与 H3 计算。理由：交接项要求 14 不再做多边形判定；纳卡七区单区面积 700–3 000 km²，小于或接近一格（约 1 770 km²），“地块中心落在多边形内”反而可能让小区为空 | 地块精度下两种做法误差相近 | 备选：由 10 的流水线按 GADM 2 级多边形面积多数决输出 `data/map/nk/scenario_regions.yaml`（需改 10） |
| N-24 | 开局装备分配后全国分配策略的缺省值 | 🟡 建议：开局用 `PriorityFill` 分配后保持 `CountryOrgSettings.policy = PriorityFill`（玩家可改）。理由：与开局分配结果一致，战时补充沿用同一优先级，玩家看到的“谁缺装备”不会在第一小时突变 | 01 缺省为 `Even` | 备选：开局分配完成后改回 01 缺省 `Even` |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 剧本定义 | `ScenarioDefinition` | 一个剧本全部静态数据的加载结果 |
| 剧本初始化选项 | `ScenarioInitOptions` | 剧本 id、玩家国家、历史模式、沙盒、世界种子 |
| 剧本服务 | `IScenarioService` | 加载、初始化、停火模板选择、维和区、目标求值、事件边解析 |
| 库存规格 | `InventorySpec` | 剧本给出的国家库存（含纳卡分项与自动补足规则） |
| 编组规格 | `FormationSpec` / `ChildSpec` | 剧本开局编制的描述（模板、位置、战备等级、优先级、绑定） |
| 区域定义 | `RegionDef` | 剧本中按规则定义的地块集合（行政区、法理领土、走廊等） |
| 控制锚点 | `ControlAnchor` | 用于校验开局控制方的地名坐标 |
| 关键地块定义 | `KeyTileDef` | 09 调度与 12 地块价值使用的剧本关键地块 |
| 停火模板 | `CeasefireTemplate` | 停火的条件、移交条款与维和条款（11 引用） |
| 移交条款 / 维和条款 | `HandoverClause` / `PeacekeepingClause` | 停火模板的组成部分 |
| 剧本目标 | `GoalDef` / `GoalType` | 可选挑战目标及其判据 |
| 校准目标 | `CalibrationDef` | 史实对照值与验收区间（V2） |
| 开局脚本 | `ScriptedStartItem` | Historical 模式下按时刻执行的事件/动员条目 |
| 纳卡分项 | `_nk_<modelId>`（数据键） | 并入 ARM 库存前的纳卡防卫军数量 |
| 剧本呈现数据 | `ScenarioPresentation` | 供 13 使用的剧本列表、配色、投影、时区、地名、主要对手、引导文件、默认展示密度 |
| 剧本列表条目 | `ScenarioListEntry` | 新游戏界面中一个剧本的 id、标题/简介键、开始时刻、可玩国家、难度说明键 |
| 国家配色 | `CountryColors` | 地图控制色（主色、辅色，十六进制） |
| 战区投影 | `TheaterProjection` / `MapProjectionKind` | 显示用地图投影参数（阶段 1 只有兰伯特等角圆锥） |
| 地名 / 地名规则 | `PlaceName` / `PlaceNamePolicy` / `DisputedNameOrder` | 地名的亚、阿、英三种写法与争议地名并列显示规则 |
| 关键地块引用 | `KeyTileRef` | 关键地块 id、所在地块、价值（由 `key_tiles` 生成） |
| 卫星定义 | `SatelliteDef` | 剧本中的卫星数据（生成 05 `SatelliteAsset`） |
| 剧本运行时状态 | `ScenarioRuntimeState` | 14 唯一存档的状态：剧本 id、初始化选项、数据哈希、开局脚本进度 |
| 国家级运力参数 | `rail_fleet_payload_t` / `national_truck_payload_t`（数据键） | 06 `NationalRail` / `NationalRoad` 承运方的总载重（后者按动员等级） |
