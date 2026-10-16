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
| 国家参数、预算路径（2010–2020）、人力、关系、出口政策、外部大国、信贷、停火模板 | `data/scenarios/nk_common/countries.yaml` |
| 采购属性（单价、可采购年份、敏感度）、国内生产线、升级路径、二手市场池、历史采购清单 | `data/scenarios/nk_common/procurement.yaml` |
| 危机事件（历史 + 通用） | `data/scenarios/nk_common/events.yaml` |
| 后勤节点种子、国家级运力、开局储备 | `data/scenarios/nk_common/logistics_nodes.yaml` |
| AI 国家配置 | `data/scenarios/nk_common/ai_profiles.yaml` |
| 开局：库存、编制、空军基地、开局练度、目标 | `data/scenarios/nk_2010/scenario.yaml`、`data/scenarios/nk_2020/scenario.yaml` |
| 2020 年战争校准目标 | `data/scenarios/nk_2020/calibration.yaml` |
| 新装备型号（现有类别） | `data/equipment/nk_models.yaml` |
| 新装备型号（待 01 M2 新类别） | `data/equipment_pending/nk_models_m2.yaml` |
| 编制模板（苏式遗产，两国同构） | `data/templates/arm_sov_legacy.yaml`、`data/templates/aze_sov_legacy.yaml` |
| 待 M2 的模板（巡飞弹连、战术导弹营） | `data/templates_pending/nk_pending_templates.yaml` |
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
  nk_common/   countries.yaml theater.yaml procurement.yaml events.yaml logistics_nodes.yaml ai_profiles.yaml
  nk_2010/     scenario.yaml
  nk_2020/     scenario.yaml calibration.yaml
```
- `scenario.yaml` 的 `scenario.includes` 列出共享文件（相对 `data/scenarios/`）。加载顺序 = 列表顺序；后加载的同名键**不覆盖**前者（共享文件之间无重叠键），剧本文件里的 `*_overrides` 才覆盖（§4.3 O2）。
- 剧本 ID：`nk_2010`、`nk_2020`（00 §2.1 规则 `<战区>_<年份>[_<月>]`，月可省；与 15 的测试用例一致）。

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
    public List<CountryDef> countries;        // 来自 countries.yaml
    public List<RelationDef> relations;
    public List<TensionDef> tensions;
    public SortedDictionary<string, ExportPolicyDef> exportPolicies;     // 卖方 ISO3 → 政策
    public SortedDictionary<string, ExternalActorDef> externalActors;
    public List<CreditLineDef> creditLines;
    public List<CeasefireTemplate> ceasefireTemplates;
    public TheaterDef theater;
    public ProcurementData procurement;
    public List<CrisisEventDef> events;       // 11 §3.8（YAML 映射见 §3.8）
    public List<NodeSeed> nodes;              // 06 §6.3 schema
    public SortedDictionary<string, CountryLogisticsDef> countryLogistics;
    public SortedDictionary<string, OpeningStockDef> openingStocks;
    public List<AiCountryProfile> aiProfiles; // 12 §3.6
    public SortedDictionary<string, InventorySpec> inventory;            // ISO3 → 库存
    public SortedDictionary<string, List<FormationSpec>> oob;            // ISO3 → 顶层编组
    public SortedDictionary<string, SortedDictionary<string, string>> airBasing; // ISO3 → modelId → nodeId
    public SortedDictionary<string, PersonnelStartDef> personnelStart;
    public List<ScriptedStartItem> scriptedStart;
    public List<OpenContractDef> openContracts;
    public SortedDictionary<string, List<GoalDef>> goals;
    public CalibrationDef calibration;        // 仅 nk_2020；可为 null
    public string dataHash;                   // 15：所有已读文件按路径 ordinal 排序后拼接内容的 XxHash64（十六进制）
}

public sealed class CountryDef {
    public string iso3; public CountryRole role; public bool playable; public string rival;
    public SortedDictionary<int, double> gdpMusdByYear, populationMByYear, baseBudgetMusdByYear;
    public ConscriptionDef conscription;
    public SortedDictionary<int, HeadcountDef> headcountByYear;   // 只用于校验（§4.4）
    public PoliticsDef politics;                                  // initialTrust, hawkishness(年→值), issueBaseline
    public SortedDictionary<int, double> deterrenceInitial;       // 键 = 年份；取 ≤ 开局年的最大键
}
public sealed class InventorySpec {
    public SortedDictionary<string, int> counts;                  // modelId → 数量（已按 §4.2 R3 合并分项）
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
    public List<ChildSpec> children;                              // 子编组（旅/团模板）
    public List<ChildSpec> direct;                                // 直属营（营模板）
    public List<ChildSpec> pendingM2;                             // 依赖 M2 的营；M2 未落地时跳过并记日志
    public string inheritFrom;                                    // 只在 2020：复用 2010 的同 id 编组
}
public sealed class ChildSpec {
    public string template; public int count = 1; public string name;
    public double? latDeg, lonDeg; public ReadinessTier? tier; public int? priority;
    public SortedDictionary<string, string> binding;              // 类别 → 型号（营级覆盖，01 modelOverrides）
}
public sealed class RegionDef { public string id; public RegionRule rule; }   // 规则种类见 §4.1.3
public sealed class ControlAnchor { public string name; public double latDeg, lonDeg; public SortedDictionary<string, string> controllerByScenario; }
public sealed class KeyTileDef { public string id; public double latDeg, lonDeg; public double value; }

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

public sealed class ScenarioInitOptions { public string scenarioId; public string playerIso3; public HistoricalMode mode; public bool sandboxSupremeLeader; public ulong worldSeed; }
```

### 3.4 采购数据（映射到 11 的 `ProcurementProfile` 等）
- `procurement_profiles.<modelId>` → 11 `ProcurementProfile`（键 snake_case → camelCase）。额外字段：`export_from_year`（卖方开始出口该型号的年份，早于它批准概率 = 0；可被事件 flag 解除，如 `tb2_export_aze_open`）、`basis`（文字）。
- `production_lines[]` → 11 `ProductionLine`（`factory` = 06 节点 id；`pending_m2: true` 的线在 M2 前跳过）。
- `upgrades[]` → 11 `UpgradePath`；`availability`（可选，ISO3 列表）限制可下单国家；`from: "*"` 的 `refurbish_generic` 是 11 §4.5.1 整修的通用路径。
- `market_pool[]` → 11 §4.5.2 的市场池条目（`years` = 允许出现的年份区间，含端点）。
- `historical_procurement` → 12 的扩展字段（N-11）：AI 在 Historical/Plausible 模式下以此为“参考采购计划”。

### 3.5 外部大国与口岸
- `external_actors` → 11 `ExternalActorPolicy`；`supply_in_war` 覆盖 11 §4.10.4 的 `supplyContinueP` 公式；`intel_sharing` 打开 05 `SatelliteAsset.sharesWith`（05 R-12）。
- 红线 `tiles`：`{de_jure: ISO3}` 或 `{region: id}`；`effects` 是按 `after_hours` 递进的效果序列（11 `RedLineEffect`）。
- 口岸（06 `ImportGatewayData`）在 `logistics_nodes.yaml`；事件 `close_import_gateway` 关闭（如 2020 年格鲁吉亚禁运过境）。

### 3.6 编制模板的生成方式
- 两国模板由同一生成脚本产生（仓库外脚本，参数：前缀、国家差异），保证两国模板**同构**（只在旅/团级不同：亚为“团”`echelon_label: regiment`，阿为“旅”）。依据苏军编制 FM 100-2-3（1991）。人工修改任一文件时，必须同步修改另一个（N-15）。
- 主要模板（每国一套，`arm_`/`aze_` 前缀）：

| 层级 | 模板 | 要点 |
|---|---|---|
| 班 | `*_mr_bmp_sq`（8 人）、`*_mr_btr_sq`（9）、`*_rifle_sq`（9，无车）、`*_tank_crew`（3）、炮兵/火箭炮/防空/侦察/工兵/通信班、`*_bn_support_sq`、`*_bde_hq_bn`、`*_bde_support_sq`（聚合） | 槽位只写类别 |
| 营 | `*_mr_bn_bmp`（428 人，30 IFV）、`*_mr_bn_btr`（455）、`*_rifle_bn`（432）、`*_tank_bn`（31 辆）、`*_arty_sp122_bn`/`sp152`/`wheeled152`/`towed122`/`towed152`（各 18 门）、`*_mrl_bn`（18）、`*_mrl_lr_bn`（12）、`*_ad_bn`、`*_bde_hq`、`*_bde_support_bn` | `default_bindings` 为苏式默认型号 |
| 旅/团 | 亚：`arm_mr_regt`（2 469）、`arm_rifle_regt`（2 199）、`arm_nk_defence_regt`（3 028，uncertain）；阿：`aze_mr_bde`（2 855）、`aze_mr_bde_light`（2 402）、`aze_arty_bde`、`aze_mrl_bde` | 团/旅直属连 → 01 §4.4.3 直属队营 |

### 3.7 库存键规则（`inventory.<ISO3>`）
| 规则 | 内容 |
|---|---|
| R1 | 普通键 = `modelId: count`。型号必须存在于 `data/equipment/` 或（M2 后）`data/equipment_pending/`。 |
| R2 | 以 `_` 开头的键是元数据（`_confidence`、`_auto_fill_categories`、`_auto_fill_share`、`_oryx_check`），不是型号。 |
| R3 | `_nk_<modelId>` = 纳卡防卫军分项；加载时**累加**到 `<modelId>`，并在 `subTotals` 中保留原值（G-13：纳卡装备属于 ARM，但简报可分开显示）。 |
| R4 | 依赖 M2 类别的型号（`scud_b` 等）在 M2 未落地时：读入但不实例化，记日志 `PendingM2Skipped`。 |
| R5 | `_auto_fill_categories` 中的类别：不由数据给数，按 §4.3.3 生成 `floor(需求 × _auto_fill_share)` 件（低价值装备：步枪、卡车、电台、迫击炮、反坦克导弹发射器、便导…）。 |

### 3.8 事件 YAML 与 11 `CrisisEventDef` 的映射
| YAML | 11 字段 | 说明 |
|---|---|---|
| `window: [d1, d2]` | `notBeforeMs` = d1 00:00Z，`notAfterMs` = d2 23:59Z | |
| `triggers[].type` | `ConditionType`（snake_case → PascalCase） | `tension_level_at_least` 的 `arg` 为 `TensionLevel` 名 |
| `options[].effects[].type` | `EffectType` | `target: self` = 事件作用的国家；`arg: "ARM-RUS"` = 关系对 |
| `start_war` 的 `arg` | `key=value;…` 字符串 | 键：`scope`（`limited`/`total`）、`casus_belli`、`aims`、`max_days`、`template` |
| `border_skirmish` 的 `arg` | `edge_near:<anchor>`、`edge_between:<a>,<b>`、`edge_random:contact_line` | §4.9.3 解析成具体交界边 |

---

## 4. 算法与公式

> 本文件的算法只在**新游戏初始化**时运行一次（15：初始化是 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数），之后由各系统接管。唯一例外：§4.7（停火模板求值）、§4.8（目标求值）、§4.9（历史模式的脚本节点）在运行时被 11 调用。
> 随机：`RngDomain.Scenario = 13`；salt 表见 §5.3。遍历顺序：国家按 ISO3 ordinal；编组按文件顺序；其余按 id ordinal。

### 4.1 加载与校验（`ScenarioLoader.Load(id)`）
1. 读 `scenario.yaml`，按 `includes` 读共享文件；计算 `dataHash`。
2. **引用校验**（任何一条失败 → 加载报错，列出全部错误）：型号、模板、节点 id、区域 id、关键地块 id、停火模板 id、信贷 id、事件引用的口岸/区域 —— 全部存在；`playable ⊆ countries`；每个可玩国家都有 `inventory`、`oob`、`ai_profiles`、`goals`。
3. **数值校验**：`base_budget_musd_by_year` 覆盖 `[开局年, horizon 年]` 内至少开局年（缺的年按 11 §4.1 第 2 条外推）；人口 > 0；`0 ≤ autoFillShare ≤ 1`；概率字段 ∈ [0,1]；关系 ∈ [−1,1]。
4. **地图校验**（需要 10 的输出 `data/map/nk/`）：
   1. 战区地块数 ∈ `[expected_tile_count × 0.85, × 1.15]`（即 56–76）。
   2. 每个 `control_anchors` 的坐标所在地块存在于战区；开局控制方（§4.2.3）与表中 `nk_2010`/`nk_2020` 列一致。
   3. 每个 `key_tiles` 坐标所在地块存在。
   4. 每个区域展开后非空（`nk_contact_line_arm_side` 除外，它在停火时计算）。

#### 4.1.3 区域规则的展开（10 提供多边形与地块表；14 规定规则语义）
| 规则 | 语义 |
|---|---|
| `de_jure == X` | `TileClaimTable.deJure[t] == X` |
| `gadm_l1 / gadm_l2: name` | 地块中心落在该 GADM 4.1 行政区多边形内 |
| `gadm_l2_union: [..]` / `union: [区域..]` | 并集 |
| `!区域`、`&&` | 补集、交集（在战区地块全集内） |
| `地块与折线相交` | 10 提供的“地块—线段相交”判定（大圆线段） |
| `与伊朗边界相邻` | 地块有一条边的对侧是战区外且对侧国家为 IRN（10 的边界表） |
| 求值顺序 | 按 `regions` 的文件顺序；引用的区域必须在前面定义（否则加载报错） |

### 4.2 世界状态初始化（`ScenarioInitializer.Run(def, options)`，顺序固定）
1. **国家**（11 §4.1）：创建 `Country`（按 ISO3 字母序得到 `CountryId`，00 §2.2）。开局年 `y0 = start.Year`：`gdpMusd = gdpByYear[y0]`、`populationM = popByYear[y0]`、`budget.baseMusd = baseBudgetByYear[y0]`。按年取值的字段（`hawkishness`、`contract_share_target`、`deterrence_initial`）取 **≤ y0 的最大年份键**的值；没有则取最小键的值。
2. **关系、紧张度、出口政策、外部行为体、信贷、停火模板**：直接映射（§3.4、§3.5）。`tension.score_by_start[scenarioId]` 为初值。
3. **地块**：
   1. `TileClaimTable`：按 `de_jure.rule`。
   2. **开局 `TileControl`（09）**：`conflict_zone` 内的地块按 1994–2020 接触线多边形（10 的输入 `data/map/nk/sources/loc_1994.geojson`）判定：中心在亚方控制多边形内 → ARM，否则 AZE；其余地块 = 法理归属。（N-06）
   3. 校验控制锚点（§4.1 第 4.2 条）。
4. **库存**：按 §3.7 R1–R4 合并，得到 `InventorySpec.counts`。
5. **编制实例化**：§4.3。
6. **装备生成与分配**：§4.3.3。
7. **人员**：§4.4。
8. **后勤**：§4.5。
9. **空军**：§4.5.3。
10. **采购状态**：生产线（`from_year ≤ y0`）、在途合同 `open_contracts`（直接创建 `ProcurementContract.state = Active`，交付表从 `next_lot` 起按 11 §4.4.4）。
11. **政治状态**：`trust = initial_trust`；`issueSupport = issueBaseline`；`leadershipHawkishness` 见第 1 步。
12. **历史模式**：`options.mode`（缺省 `defaultMode`）写入 `StrategicSettings`；登记 `scriptedStart`（§4.9）。
13. **卫星**：`from ≤ start` 的卫星创建 05 `SatelliteAsset`；`passPhaseH = rng.NextDouble() × revisitH`，`rng = Rng.For(Scenario, Mix(satHandle), 0, SaltSatPhase)`。
14. **AI**：非玩家国家挂 12 的 `AiCountryProfile`（玩家国家也加载，用于“AI 顾问建议”与 V4 默认策略）。

### 4.3 编制实例化（调用 01 的实例化与分配接口）
**O1 顶层编组**：对 `oob[ISO3]` 中每个 `FormationSpec`（文件顺序）：
```csharp
var f = Org.CreateFormation(country, echelon, kind: FormationKind.Organic, name, echelonLabel);
f.hqBattalionId = Org.InstantiateBattalion(hqTemplate, f, tile(lat, lon), tier);
foreach (var c in spec.children) for (k = 0; k < c.count; k++)
    Org.InstantiateFormationFromTemplate(c.template, parent: f, tile(c.lat ?? spec.lat, c.lon ?? spec.lon), c.tier ?? spec.tier, c.priority ?? spec.priority);
foreach (var d in spec.direct) for (k = 0; k < d.count; k++) {
    var bn = Org.InstantiateBattalion(d.template, f, tile(...), d.tier ?? spec.tier);
    foreach (var (cat, model) in d.binding) bn.modelOverrides[cat] = model;   // 01 §4.6
}
foreach (var p in spec.pendingM2) if (Categories.Has("tbm_launcher") && Categories.Has("loitering_munition")) { /* 同 direct */ } else Log(PendingM2Skipped, p);
f.allocationPriority = spec.priority;
```
- `tile(lat, lon)` = 坐标所在 H3 r4 单元；若不在战区或不在本国控制的地块：取**同国控制地块中中心距离最近者**（距离相同取 H3 数值小者），并记日志。
- 子编组名：`name` 缺省为 `"<模板 name> <序号>"`。

**O2 继承（`nk_2020`）**：`oob.<ISO3>.inherit_from: nk_2010` → 先取 `nk_2010` 同国 `oob` 列表的**深拷贝**，再按 `overrides`（按 id 匹配顶层编组）修改字段：`tier`、`lat/lon`（只改编组本身位置，子编组位置**不变**，除非也被 override）、`add_direct`（追加到 `direct`）、`add_pending_m2`（追加到 `pendingM2`）。override 引用不存在的 id → 加载报错。

**O3 战备等级**：编组的 `tier` 作为下属营的缺省 `ReadinessTier`；`ChildSpec.tier` 覆盖。人员在编比例由 02 按等级决定。

#### 4.3.3 装备生成与分配
```text
1. 对每个型号 m：生成 counts[m] 件 EquipmentItem（01），owner = 国家，status = Active，condition = 1，locationNode = 本国 Depot 中
   storage 最大者（同容量取 id ordinal 小者），holder = 0。
2. 自动补足（R5）：对每个 c ∈ autoFillCategories：
     need_c = Σ_营 01.ForceRequirement 中类别 c 的 requiredFull
     m_c    = 该类别在各营的解析型号（01 ResolveModel）；同一类别多个型号时按 requiredFull 比例拆分（最大余数法，平局按 modelId ordinal）
     生成 floor(need_c × autoFillShare) 件（按型号拆分后各自 floor），同第 1 步入库
3. 调用 01 AllocateEquipment(country, scope = 全国, policy = PriorityFill, allowSubstitution = true)
   - 01 按 allocationPriority 升序、同优先级按 FormationId 升序补满（01 §4.8）；简编/骨干营只补到 requiredPeacetime（01 §4.9）
4. 余量留在仓库（库存），供战时补充（07）。
```
- `condition`：开局装备一律 1.0（N-16：是否给老旧苏式装备初始状态 < 1）。

### 4.4 人员（02）
1. 预备役池、预备役练度、学校产能：读 `countries.yaml` 与 `personnel_start.schools`（02 §开局初始化）。
2. 现役人员：由 02 按“营模板人员需求 × 战备等级在编比例”生成；通用练度按 `personnel_start.<ISO3>.general_skill[tier]`，纳卡防卫军编组（`arm_nk_army` 子树）再加 `nk_defence_army_general_bonus`；型号专有练度统一取 `type_skill`。
3. **人数校验（警告，不报错）**：
```
generated = Σ 生成的现役人数（含指挥部、保障）
target    = headcount_by_year[y0].total
若 |generated − target| / target > HeadcountTolerance：记 Warning “开局人数 generated 与资料 target 相差 x%”
```
   调平方法（给数据维护者，不在运行时自动做）：调整 `oob` 中编组的 `tier` 或个数。
4. 薪酬类别拆分（11 `PayCategory`）：现役按 02 的岗位（`officer`、`political_officer` → Officer；`nco_*`、`squad_leader`、`team_leader` 及按 `contractShare` 抽中的士兵 → Contract；其余 → Conscript），`contractShare` 用 11 的累加器拆分（02 P-10）。

### 4.5 后勤与空军
1. 节点：`nodes[]`（`from_year ≤ y0`）按 06 §6.3 创建；坐标 → 所在地块；该地块开局不在本国控制 → 加载报错（防止节点落到对方控制区）。
2. 开局储备：`opening_stocks[scenarioId][ISO3]` 的天数 × 06 的标准战时日消耗 → 各物资吨数；06 按 `strategic_direction_preset` 把总量分到各 Depot；年龄分布按 06 §4.12（`uniform` 或 `{last_10y_share}`：近 10 年占比，其余均匀分布在更早的保质期内）。
3. **空军**（08）：`air_force.<ISO3>.<modelId> = nodeId` → 该型号全部库存（分配后剩余的、类别属于航空器/MALE 无人机的件）在该机场编成 `Flight`（作战飞机 4 架一组，余数单独一组；直升机同；MALE 无人机按 08 的“组”规则）。

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
- 选择：按调停方 `mediation_templates` 列表顺序，取第一个 `Eval == true` 且 `warDay ≥ appliesWhenWarDayAtLeast` 的模板；都不满足 → `freeze_template`。

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
2. **Plausible**：`scriptedStart` 只保留 `mobilization` 以外的**非事件**条目（即全部跳过）；历史事件按 11 §4.9 的 `mtth_days` 抽样。
3. **Free**：同 Plausible，且 `historical: true` 的事件全部不触发。
4. 与玩家冲突的 AI 指令（`ai_directive` 指向玩家国家）一律忽略（11 §4.12）。

#### 4.9.3 `border_skirmish` 的交界边解析
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
| 01 | 调用 | `CreateFormation`、`InstantiateFormationFromTemplate`、`InstantiateBattalion`、`AllocateEquipment`、`ForceRequirement`、`ResolveModel`；`CountryOrgSettings.countryDefaults`（取各国模板 `default_bindings`） | 初始化 |
| 02 | 调用 | 生成名册、预备役池、学校产能、开局练度 | 初始化 |
| 05 | 写 | `SatelliteAsset`（含 `sharesWith`）、战区地块列表、阶段 0 固定暴露度 | 初始化 |
| 06 | 写 | 节点、国家级运力、开局储备与年龄分布、战略方向预设、口岸 | 初始化 |
| 08 | 写 | 按型号与机场编成 `Flight` | 初始化 |
| 09 | 写 | 开局 `TileControl`、关键地块表（调度优先级） | 初始化 |
| 10 | 读 | `data/map/nk/` 地块、边、区域多边形、接触线多边形、边界表 | 加载 |
| 11 | 写/被调用 | 国家、预算、关系、出口政策、外部行为体、信贷、事件、停火模板、目标；运行时调用 §4.7、§4.8、§4.9 | 初始化 / 运行时 |
| 12 | 写 | `AiCountryProfile`、参考模板、编组角色标签、`historical_procurement`、关键地块价值 | 初始化 |
| 13 | 读 | 简报、目标面板、结局页的视图数据（§2.2） | — |
| 15 | 约束 | 初始化为 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数；存档记录 `scenarioId` 与 `dataHash` | 新游戏 / 读档 |

```csharp
public interface IScenarioService {
    ScenarioDefinition Load(string scenarioId);                               // §4.1
    WorldState Initialize(ScenarioDefinition def, ScenarioInitOptions opt);   // §4.2–4.6
    CeasefireTemplate SelectCeasefireTemplate(WarId war, CountryId mediator); // §4.7.1
    PeacekeepingZone BuildPeacekeepingZone(CeasefireTemplate t, WarId war);   // §4.7.2
    double GoalProgress(CountryId c, string goalId);                         // §4.8
    EdgeId ResolveSkirmishEdge(string arg, long tick, ulong eventHandle);    // §4.9.3
}
```

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 10 的地图产物缺失 | 加载失败，提示运行地图流水线；阶段 0 不需要本剧本 |
| 控制锚点所在地块的开局控制方与表不符 | 加载报错（说明接触线多边形或锚点有误，N-06） |
| 编组坐标落在敌控/战区外地块 | 移到最近的本国控制地块并记日志（§4.3 O1） |
| 节点坐标落在敌控地块 | 加载报错（§4.5） |
| M2 未落地 | `pending_m2` 的营、型号、生产线、模板全部跳过并记日志；剧本仍可玩（失去战术导弹与巡飞弹） |
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

**T3 自动补足（R5）**：某类别 `need = 1 237`、`autoFillShare = 0.9` → 生成 `floor(1113.3) = 1 113`。若该类别两个型号需求 900 : 337（比例 0.7276 : 0.2724），先算 `1113 × 0.7276 = 809.8 → 809`、`1113 × 0.2724 = 303.2 → 303`，余 1 给小数部分大者（0.8 > 0.2）→ 810 / 303。

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
1. `tools/validate_data.py` 0 错误（当前已满足：新增模板/型号只用现有类别）。
2. 引用完整性（型号、模板、节点、区域、模板、信贷、事件引用）全部可解析（脚本复刻 §4.1 第 2 条）。
3. 库存 ≥ Oryx 损失下限（`nk_2020`：坦克 449 ≥ 255，牵引炮 459 ≥ 250，自行炮 108 ≥ 29，火箭炮 109 ≥ 84，防空导弹 109 ≥ 39）。
4. 人员费占比：按 11 §4.2.2 与本剧本薪酬，开局年人员费 / 预算：ARM ∈ [0.40, 0.55]，AZE ∈ [0.15, 0.35]。（ARM 2020：40 120×0.0015 + 24 070×0.006 + 8 750×0.012 ≈ 309.6 → 48.8%。）
5. 开局实例化后人数 vs `headcount_by_year`（±25%）。

### 9.2 V2 历史校准（`nk_2020`；本文件给目标，11 §9.2 给疲劳部分）
**设置**：`nk_2020`，Historical 模式，双方 AI（`playerIso3 = null`），200 个种子；精度档按 09 的固定规则（允许 Cached）；运行到停火或第 120 天。
**比较对象**：`calibration.yaml`。
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
| N-01 | 纳卡防卫军归属（G-13） | 🟡 并入 ARM：同一 `Country`，独立顶层编组 `arm_nk_army`；库存分项用 `_nk_` 前缀保留 | 叙事中立、外交实体最少；玩家操作上本就是一方 | 用 ISO 用户自定义码独立参战方 |
| N-02 | 剧本数据的 `confidence: stated` 含义 | 🟡 指“文件头所列公开来源”，并要求固定修订版链接 | 维基页面会变；固定 `oldid` 可复核 | 只接受原始出版物（IISS 原表） |
| N-03 | 俄 102 基地 | 🟡 不实例化，只作为红线与叙事 | 2020 年未参战；实例化会诱导“拉俄参战”的玩法 | 实例化为不可控中立部队 |
| N-04 | 纳卡自身军费 | 🟡 不加（`nk_supplement = 0`），亚方预算只用 SIPRI 亚美尼亚数 | 无公开数据；人员费反推已含纳卡人数 | 加 15–25% 估算 |
| N-05 | NKAO 边界近似 | 🟡 用 GADM 2 级 rayon 并集近似 | 地块精度（~40 km）下误差可接受 | 手工数字化 1988 年 NKAO 边界 |
| N-06 | 1994–2020 接触线数据 | 🟡 由 10 按公开地图手工数字化成 `loc_1994.geojson`，用控制锚点校验 | 没有权威开源矢量数据 | 用 OSM 争议边界标签（不完整） |
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
| 待迁移跳过 | `PendingM2Skipped` | 依赖 01 M2 新类别的数据在迁移前被跳过的日志代码 |
| 纳卡分项 | `_nk_<modelId>`（数据键） | 并入 ARM 库存前的纳卡防卫军数量 |
