# 11 战略层（国家、预算、采购、政治、战争与停火）

> 依据：总纲 §18（全部）、§19.6–19.7、§21 第 10–15 项、§3.4、§0 总方针。术语以 [00_glossary.md](00_glossary.md) 为准（其 🟡 G-xx 视为暂定采用）。
> 本文件编号的待确认决策为 `S-xx`（见第 10 节）。剧本数据（纳卡）见 [14_scenario_nk.md](14_scenario_nk.md)。
> 标记：✅ 总纲已确认；🟡 建议待确认；**[阶段 2+]** 只留扩展点，阶段 1 不实现。

---

## 1. 目标与范围

### 1.1 这个系统解决什么问题
玩家是**国防部长**，不是国家元首（总纲 §18.2）。战略层把“钱、时间、政治资本”三种资源变成“部队、装备、弹药、训练”，并给出开战、停火的政治边界。它是核心循环（总纲 §1）里“预算、采购、训练 → 战备状态 → 危机/战争”这一段的承载者。

设计取舍（对应总方针 §0）：
1. **不是经济模拟**：预算是剧本给定的年度固定值（GDP 只作参数），不模拟增长、税收、通胀（总纲 §18 ✅）。
2. **每个机制都要换来决策**：预算六条线、采购三种方式、二手/升级/退役、训练强度、动员、游说，各自对应明确的取舍；所有数字（批准概率、到货日期、疲劳分项）**直接显示给玩家**。
3. **政治判定尽量确定化**：领导层对作战方案的审批用**确定性评分 + 公开门槛**（玩家看得到差几分），只有外国政府的审批（进口批准、供应中断）和随机危机事件用 RNG。

### 1.2 阶段 1（纳卡 MVP）包含
| 模块 | 阶段 1 内容 |
|---|---|
| 国家 `Country` | 预算、人力（兵役制度）、关系、信任度、议题、紧张度、威慑值、战争疲劳的持有者 |
| 年度预算 `DefenseBudget` | 六条线：人员、运行维护（O&M）、采购、训练、基础设施、战备储备；外加固定义务（债务偿还、合同付款）。**解决总纲 §21-12** |
| 采购 | 进口三方式（批准概率 + 交付时间表）、国内生产线（产能、扩产、萎缩）、二手市场、升级改装、退役（**🟡 S-05/S-06，回应 §21-11**） |
| 政治 | 信任度、紧张度阶梯（双边）、作战方案审批、3 个议题、游说与腐败（简化）、危机事件（数据驱动） |
| 战争 | `War` 实体、开战理由、战时追加预算、动员等级、动员时间、战争疲劳、停火（**🟡 S-10，回应 §21-14**） |
| 外部大国 | 俄罗斯、土耳其、伊朗（主动行为体，简化）；以色列、白俄罗斯等（只作供应国）——“红线 + 调停 + 供货”三件事（🟡 S-12） |
| 沙盒目标 | 年度《国防评估》指标 + 剧本挑战目标（**🟡 S-13，回应 §21-15**） |
| 历史事件 | 三档历史模式（**🟡 S-14，回应 §21-10**） |

### 1.3 阶段 1 不包含（只留扩展点）
- 军火出口（§18.6）**[阶段 2+]**：采购接口按“买方/卖方对称”设计，出口就是把本国当卖方。
- 联合演习（§18.9）**[阶段 2+]**：只保留 `JointExercise` 类型占位。
- 核风险（§18.10）：纳卡两交战国都不拥核；俄罗斯只作为调停方/红线方出现，红线一触发就强制停火（见 4.9），**核风险不会开始累积**。`NuclearRisk` 只定义字段，阶段 1 恒为 0 **[阶段 2+]**。
- 同盟卷入战争的完整规则（§18.13）**[阶段 2+]**：阶段 1 用“红线”近似 CSTO 与土阿关系。
- 非常规政治手段 (b) 中的“散布情报”“策划边境事件”**[阶段 2+]**（需要第三方情报识破模型）；阶段 1 只做“抵近巡逻”“边境演习”。
- 军工企业利益交换要求（§18.2-7a 的“要求优先采购”等）**[阶段 2+]**。
- 封存基地启封（`StorageBase`）**[阶段 2+]**；阶段 1 退役 = 处置。
- 占领区管理、和约 **[阶段 2+]**；阶段 1 只做停火。
- 海军舰艇采购、VLS 装填模板 **[阶段 3]**。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单
| # | 决策 | 何时 | 主要取舍 |
|---|---|---|---|
| D1 | 年度预算分配：O&M 资金率、训练强度、采购/基建/储备/游说的比例 | 每年 12 月（预算编制窗口）；年内可在可支配线之间调整 | 现在的战备 vs 未来的装备 |
| D2 | 进口申请：型号 × 数量 × 卖方 × 方式（纯外购/本地组装/全部本地化） | 任意时间 | 单价/前期投入/批准概率/战时依赖 |
| D3 | 购买二手批次 | 批次有效期内 | 便宜、快 vs 状态差、故障多 |
| D4 | 升级改装项目（型号 A → A′） | 任意时间 | 花钱和停用时间 vs 买新 |
| D5 | 退役装备 | 任意时间 | 省 O&M vs 少了数量 |
| D6 | 国内生产线：开工率、扩产（原址/新址） | 任意时间 | 维持产能的“保险费” vs 现在的采购钱 |
| D7 | 基建项目：新建仓库、加固、机场掩体 | 任意时间 | 见 06 |
| D8 | 申请贷款（剧本提供的信贷额度） | 有额度时 | 现在多买 vs 以后每年还债 |
| D9 | 边境行动：抵近巡逻、边境演习 | 和平/紧张/危机 | 推高紧张度、推高“强硬”议题；有擦枪走火风险 |
| D10 | 游说：给某个议题投钱 | 任意时间 | 推动议题 vs 腐败曝光风险 |
| D11 | 提交作战方案 | 紧张度 ≥ `Crisis`，或战争中 | 消耗信任度；批准则开战 |
| D12 | 申请动员等级 | 危机或战争中 | 兵力和追加预算 vs 战争疲劳 |
| D13 | 危机事件选项 | 事件触发时 | 强硬/克制 |
| D14 | 接受/拒绝停火提议 | 调停方提出时（疲劳过高时领导层强制接受） | 保住战果 vs 继续打的代价 |
| D15 | 历史模式、沙盒开关（开局设置） | 新游戏 | 见 4.12 |

### 2.2 反馈清单（数字透明）
| # | 反馈 | 内容 |
|---|---|---|
| F1 | 预算面板 | 六条线 + 固定义务的金额与占比；O&M 需求 vs 拨款；“按当前分配，3 年后可交付 X 辆 T-72B3” |
| F2 | 采购单 | 每个申请：**批准概率及分项**（关系 +x、敏感度 −y…）、预计裁决日、交付时间表、付款时间表、依赖清单 |
| F3 | 生产线面板 | 产能、开工率、闲置天数、“再闲置 N 天开始萎缩” |
| F4 | 信任度 | 当前值、近 90 天变化明细、解职门槛 |
| F5 | 紧张度 | 双边分数、所处等级、驱动因素明细 |
| F6 | 作战方案审批单 | 军方评估（成功率 ± 区间、伤亡、天数），**领导层评分各分项与批准门槛** |
| F7 | 战争疲劳 | 总值与分项（时间、伤亡、失地、费用、战果），停火门槛 |
| F8 | 《国防评估》年报 | 战备评分、对手净评估、威慑值、预算执行率、挑战目标进度 |
| F9 | 事件简报 | 冷静的简报文风（§18.2-7） |

---

## 3. 数据结构

> 命名空间 `MoD.Sim.Strategic`。货币一律 `Musd`（2020 年不变价美元，G-10）。归一化量 [0, 1]（G-09）。ID 按 00 §2.2 用强类型。

### 3.1 国家与政治状态

```csharp
readonly record struct CountryId(int value);          // 加载时按 ISO3 字母序编号（00 §2.2）
readonly record struct WarId(int value);
readonly record struct ContractId(int value);
readonly record struct ProductionLineId(int value);
readonly record struct ProjectId(int value);          // 基建/扩产/升级项目共用
readonly record struct MarketLotId(int value);
readonly record struct EventInstanceId(int value);

enum CountryRole : int { Belligerent = 1, ExternalActor = 2, SupplierOnly = 3 }   // 14 指定

sealed class Country {
    CountryId id;
    string iso3;                         // "ARM"
    CountryRole role;
    bool isPlayable;
    double gdpMusd;                      // 当年 GDP 参数（剧本给出逐年值，不模拟）
    double populationM;                  // 人口，百万
    bool isNuclear;                      // 阶段 1 只读
    DefenseBudget budget;                // 3.2
    ConscriptionSystem conscription;     // 3.6
    PoliticalState politics;             // 3.3
    double deterrence;                   // [0,1]，威慑值
    List<CreditLine> creditLines;        // 3.2
    ExternalActorPolicy? externalPolicy; // 仅 role = ExternalActor / SupplierOnly
    ExportPolicy? exportPolicy;          // 作为卖方时的出口政策（3.4）
}

sealed class PoliticalState {
    double trust;                        // [0,1] 国防部长信任度（只对玩家国家和 AI 国家的“部长”有意义）
    long trustBelowFireSinceMs;          // 低于解职门槛的起始时刻；-1 = 未低于
    double corruption;                   // [0,1]
    SortedDictionary<IssueId, double> issueSupport;    // [0,1]，界面 ×100 显示为 0–100（§18.2-6）
    SortedDictionary<IssueId, double> issueBaseline;   // 回落目标
    double leadershipHawkishness;        // [0,1]，剧本给出；影响方案审批与“主动开战”
    List<TrustLedgerEntry> trustLedger;  // 最近 365 天的变化明细（F4）
}

enum IssueId : int {                      // 阶段 1 只做 3 个；只能追加
    None = 0,
    HardlineVsRival = 1,                 // “对 <对手> 采取强硬立场”；对手由剧本指定
    DefenseBudgetIncrease = 2,
    ConscriptionReform = 3               // 阶段 1：只影响合同兵比例目标（3.6），见 S-08
}

record TrustLedgerEntry(long timeMs, double delta, TrustReason reason, string? refId);
enum TrustReason : int {
    None = 0, PlanSubmitted = 1, PlanRejected = 2, BudgetRequest = 3, SensitiveImport = 4,
    DeliveryOnTime = 5, ContractOverrun = 6, CrisisHandled = 7, CrisisMishandled = 8,
    BattleWon = 9, BattleLost = 10, WarWon = 11, WarLost = 12, AssessmentAccurate = 13,
    AssessmentInaccurate = 14, ScandalExposed = 15, Drift = 16, EventEffect = 17
}

// 双边关系（无向；存一份，键 (min(a,b), max(a,b))）
sealed class Relation {
    CountryId a, b;                      // a.value < b.value
    double value;                        // [-1, 1]
    double baseline;                     // 回落目标（剧本给）
    RelationFlags flags;
    AllianceTier? alliance;              // null = 无
}
[Flags] enum RelationFlags : int { None = 0, Alliance = 1, ArmsEmbargo = 2, Sanctions = 4, Aid = 8 }
enum AllianceTier : int { None = 0, MutualDefense = 1, StrategicPartner = 2, Friendly = 3 }

// 双边紧张度（有向对：不需要，按无向存）
sealed class TensionState {
    CountryId a, b;
    double score;                        // [0,1]，和平时期的连续量
    double baseline;                     // 回落目标（剧本给，可被事件永久改变）
    TensionLevel level;                  // 由 score 与战争状态推导（4.6）
}
enum TensionLevel : int { Peace = 0, Tension = 1, Crisis = 2, LimitedConflict = 3, TotalWar = 4 }
```

### 3.2 预算

```csharp
enum BudgetLine : int {                    // 只能追加
    Personnel = 1,              // 人员：工资、津贴、给养（按人头计算，玩家不能直接设）
    OperationsMaintenance = 2,  // 运行维护：装备维护保养、备件日常消耗、节点维护、燃油（非训练）
    Procurement = 3,            // 采购：新合同首付、二手批次、升级项目、国内生产线的产品款
    Training = 4,               // 训练：训练活动的非弹药成本（燃油、寿命、场地）；训练弹药从库存出（4.3.4）
    Infrastructure = 5,         // 基础设施：仓库/加固/机场掩体（06 定义项目）、国内生产线扩产
    WarReserves = 6,            // 战备储备：按 06 的储备目标购买弹药、燃油、备件（采购路径同 4.4/4.5）
    Lobbying = 7                // 游说（可为 0；上限见常数 LobbyingCapShare）
}
enum ObligationKind : int { DebtService = 1, ContractPayment = 2 }

sealed class DefenseBudget {
    int fiscalYear;                       // 当前预算年（公历年）
    double baseMusd;                      // 剧本给的当年基础预算 B_base(y)
    double crisisBonusMusd;               // 当年已拨的危机追加
    double warSupplementMusd;             // 当年已拨的战时追加（按天累计）
    double issueBonusMusd;                // “增加国防预算”议题带来的增量（年初确定）
    double totalMusd => baseMusd + crisisBonusMusd + warSupplementMusd + issueBonusMusd;

    BudgetAllocation plan;                // 年初定的分配（D1）
    SortedDictionary<BudgetLine, double> spentMusd;      // 年内已花
    SortedDictionary<ObligationKind, double> obligationsMusd;  // 当年固定义务（年初计算，年内追加）
    double shortfallMusd;                 // 当年无法覆盖的义务（触发 4.2.4）
    List<double> warSupplementHistoryMusd;  // 每场战争总追加（计算战后紧缩用）
}

sealed class BudgetAllocation {
    double omFundingRatio;                // O&M 拨款 / O&M 需求，[0.5, 1.2]，默认 1.0
    TrainingIntensity defaultTraining;    // 全军默认训练强度
    SortedDictionary<FormationId, TrainingIntensity> trainingOverride;   // 按建制编组覆盖（FormationId 归 01）
    // 剩余可支配资金在下面 4 条线之间按比例分（和 = 1）
    double procurementShare, infrastructureShare, warReservesShare, lobbyingShare;
}
enum TrainingIntensity : int { Minimal = 0, Low = 1, Normal = 2, High = 3 }

sealed class CreditLine {                  // 例：2015 年俄罗斯对亚美尼亚 2 亿美元军贷
    CountryId lender;
    double limitMusd, drawnMusd;
    double interestRatePerYear;           // 0.03 = 3%
    int graceYears;                       // 宽限期
    int repaymentYears;
    bool restrictedToLenderGoods;         // 只能买贷方装备
    long availableFromMs, expiresAtMs;
}
```

### 3.3 采购

```csharp
enum ProcurementMode : int { DirectPurchase = 1, LocalAssembly = 2, FullLocalization = 3 }   // ✅ §18.1
enum AcquisitionKind : int { NewImport = 1, Domestic = 2, SecondHand = 3, Upgrade = 4 }
enum ContractState : int {
    Draft = 0, PendingApproval = 1, Rejected = 2, Active = 3, Suspended = 4,
    Completed = 5, Cancelled = 6
}

// EquipmentModel 的 ProcurementProfile（00 §4.3：11 归属；YAML 键 procurement）
sealed class ProcurementProfile {
    double costMusd;                      // 新品出口单价（2020 不变价）；没有数据时由剧本价格表给（14）
    int serviceYear;                      // 可采购起始年（§18.3）
    int? endProductionYear;               // 停产年；之后只能二手
    string[] producers;                   // ISO3，可多国（如 T-72 系：RUS, UKR(1991–), BLR 修理厂…）
    int sensitivity;                      // 0 = 通用（卡车、轻武器）… 3 = 战略敏感（弹道导弹、远程防空）
    int leadTimeDays;                     // 纯外购从批准到首批交付的天数；未给按类别默认（常数表 LeadTimeDefault*）
    int lotSize;                          // 每批交付数量；未给按 max(1, quantity/4)
    int lotIntervalDays;                  // 批间隔；未给 = 90
    double omRatePerYear;                 // 年维护费 / 单价；未给按类别组默认（常数表 OmRate*）
    double partsShareOfOm;                // O&M 中“备件”占比（转成 07 的备件库存）；默认 0.4
    bool localAssemblyAllowed, fullLocalizationAllowed;
    double assemblySetupMusd, localizationSetupMusd;   // 前期投入；未给按合同总额比例（常数表）
    string[] historicalExportsTo;         // ISO3；用于批准概率的“历史出口”项
}

sealed class ProcurementContract {
    ContractId id;
    CountryId buyer, seller;              // 国内生产时 seller = buyer
    string modelId;                       // EquipmentModel id（弹药也是 EquipmentModel）
    int quantity;
    AcquisitionKind kind;
    ProcurementMode mode;                 // kind = NewImport 时有效
    double unitPriceMusd;
    double upfrontMusd;                   // 一次性前期投入（建组装厂/技术转让）
    ContractState state;
    long submittedMs, decisionDueMs;
    double approvalProbability;           // 提交时计算并冻结（F2 显示）
    ApprovalBreakdown breakdown;
    List<DeliveryLot> schedule;
    List<PaymentMilestone> payments;
    int deliveredCount;
    double conditionOfDelivered;          // [0,1]；新品 = 1，二手 = 批次状态
    bool financedByCredit;                // 用 CreditLine 支付
    DependencyList dependency;            // §18.7（3.5）
    int? marketLotId;                     // 二手批次来源
}
record DeliveryLot(long dueMs, int quantity, bool delivered);
record PaymentMilestone(long dueMs, double amountMusd, bool paid);

record ApprovalBreakdown(double logitBase, double relationTerm, double blocTerm, double historyTerm,
                         double sensitivityTerm, double warTerm, double rivalTerm, bool embargoed);

// 国内生产线（00：ProductionLine，挂在 Factory 上；Factory 是 06 的 LogisticsNode）
enum LineState : int { Active = 1, Idle = 2, UnderConstruction = 3 }
sealed class ProductionLine {
    ProductionLineId id;
    NodeId factoryNodeId;                 // NodeId 归 06；NodeRole.Factory
    CountryId owner;
    string[] modelIds;                    // 可生产的型号（同一线可切换，切换耗时 LineSwitchDays）
    string activeModelId;
    double capacityPerYear;               // 单位：件/年（弹药：发/年）
    double nominalCapacityPerYear;        // 建成时的产能（萎缩前）
    double utilization;                   // [0,1] 玩家设定开工率
    double fractionalOutput;              // 小数产出累加器
    int idleDaysConsecutive;              // 开工率 < LineIdleUtilization 的连续天数
    bool isAssemblyOnly;                  // 本地组装线：依赖进口零件包（3.5）
    double unitCostMusd;                  // 国内生产单价
    LineState state;
}

// 二手市场批次
enum ConditionGrade : int { Poor = 1, Fair = 2, Good = 3 }
sealed class MarketLot {
    MarketLotId id;
    CountryId seller;
    string modelId;
    int quantity;
    ConditionGrade grade;
    double condition;                     // [0,1]，由 grade 决定（常数表）
    double unitPriceMusd;                 // 4.5.1
    long availableFromMs, expiresAtMs;
    bool sold;
}

// 升级路径（数据：data/procurement/*.yaml 的 upgrades，见 14）
sealed class UpgradePath {
    string id;                            // "t72a_to_t72b3"
    string fromModelId, toModelId;
    double costPerUnitMusd;
    int daysPerUnit;                      // 单车在厂时间
    string[] providers;                   // ISO3（卖方提供升级）或 "domestic"
    NodeId? domesticFacility;             // 国内可升级的工厂
    double capacityPerYear;               // 每年最多升级多少
    double typeSkillRetention;            // 型号专有练度保留系数（交给 02），默认 0.8
}
sealed class UpgradeProject {
    ProjectId id; CountryId owner; string upgradePathId; CountryId provider;
    int quantityOrdered, inShop, completed;
    ContractId? contractId;               // 外国提供时伴随一个采购合同（用于批准与付款）
}

// 基建与扩产项目
enum ProjectKind : int { LineExpansion = 1, NewLineNewSite = 2, LineRestart = 3, InfrastructureFrom06 = 4, Upgrade = 5 }
sealed class Project {
    ProjectId id; CountryId owner; ProjectKind kind;
    double totalCostMusd, spentMusd;
    int nominalDays;                      // 满额拨款时的工期
    double progress;                      // [0,1]
    ProductionLineId? lineId;             // 扩产对象
    double capacityDeltaPerYear;          // 扩产增量
    string? infraRef;                     // 06 的项目引用
}
```

### 3.4 出口政策与外部行为体

```csharp
sealed class ExportPolicy {                // 作为卖方
    SortedDictionary<CountryId, double> willingness;   // [-1,1] 对每个买方的出售意愿修正；缺省 0
    SortedDictionary<CountryId, int> maxSensitivity;   // 对每个买方允许的最高敏感度；缺省 3
    bool requiresEndUseRestriction;       // 合同附带使用限制（§18.7：禁止打击某些地块）
}

enum InterventionRung : int {             // 外部行为体的介入阶梯（4.10）
    None = 0, Statements = 1, ArmsSupply = 2, IntelSharing = 3, Mediation = 4,
    Peacekeeping = 5, DirectIntervention = 6
}
sealed class ExternalActorPolicy {
    SortedDictionary<CountryId, double> stance;        // [-1,1] 对各交战国的倾向
    InterventionRung maxRung;                          // 该行为体在本剧本中最高会走到哪一级
    List<RedLine> redLines;
    CeasefireTemplateRef[] mediationTemplates;         // 作为调停方时可用的停火模板（14 定义）
    int mediationFirstDay;                             // 战争开始后第几天开始提出停火
    int mediationIntervalDays;
}
sealed class RedLine {
    string id;                            // "rus_csto_armenia_proper"
    CountryId protectedCountry;           // 被保护方
    TileSetRef tiles;                     // 触发区域（14 给 H3 列表或“某国 de jure 领土”）
    RedLineTrigger trigger;               // EnemyGroundForcesEnter / StrikesOnTiles / CapitalThreatened
    int graceHours;                       // 进入后多少小时内撤出可免触发
    RedLineEffect effect;                 // Warning → ForcedCeasefire → DirectIntervention（阶段 1 只做前两种）
    double relationPenalty;               // 对违反方
}
enum RedLineTrigger : int { EnemyGroundForcesEnter = 1, StrikesOnTiles = 2, CapitalThreatened = 3 }
enum RedLineEffect : int { Warning = 1, ForcedCeasefire = 2, DirectIntervention = 3 }   // 3 = [阶段 2+]
```

### 3.5 依赖清单（§18.7）

```csharp
enum DependencyChannel : int { Item = 1, SpareParts = 2, Ammunition = 3, Software = 4 }
sealed class DependencyList {             // 每个“国家 × 型号”一份（合同交付后合并）
    string modelId; CountryId owner;
    SortedDictionary<DependencyChannel, CountryId> source;   // 自给时 = owner
    SortedDictionary<DependencyChannel, double> vulnerability; // [0,1]：0 = 自给，1 = 完全依赖
    bool endUseRestricted;                // 使用限制（09 读取：禁止对受限地块下 CrossTileStrike）
    TileSetRef? restrictedTiles;
}
```

规则：`vulnerability` 按方式取值（常数表 `DepVuln*`）：纯外购 1.0/1.0/1.0/1.0；本地组装 0.6/0.6/1.0/0.8；全部本地化 0.1/0.1/0.2/0.1；国内自研 0。二手：同纯外购，但 `source` 可选“任一生产国”（多来源，见 4.11）。

### 3.6 人力与兵役（§18.11，归 11）

```csharp
sealed class ConscriptionSystem {
    bool conscription;                    // 是否义务兵役
    int termMonths;                       // 服役期（亚美尼亚 24、阿塞拜疆 18/12，见 14）
    int annualIntakeCap;                  // 每年最多征召人数
    double contractShareTarget;           // 合同兵占士兵比例目标 [0,1]
    double contractShare;                 // 当前
    int reservePool;                      // 可动员预备役人数（有服役经历）
    double reserveGeneralSkill;           // 预备役平均通用练度 [0,1]（02 读取）
    SortedDictionary<PayCategory, double> payMusdPerHeadYear;   // 年人均人员费（剧本给）
}
enum PayCategory : int { Conscript = 1, Contract = 2, Officer = 3, ReservistMobilized = 4, Civilian = 5 }
```

### 3.7 战争、动员、停火

```csharp
enum CasusBelli : int { None = 0, SelfDefense = 1, AllyRequest = 2, TerritorialClaim = 3, Unprovoked = 4 }
enum MobilizationLevel : int { None = 0, Partial = 1, Full = 2 }
enum WarPhase : int { Active = 1, Ceasefire = 2, Ended = 3 }

sealed class War {
    WarId id;
    long startMs;
    WarPhase phase;
    SortedSet<CountryId> sideA, sideB;    // sideA = 发起方
    SortedDictionary<CountryId, CasusBelli> casusBelli;
    SortedDictionary<CountryId, WarSideState> sides;
    List<CeasefireOffer> offers;
    long? ceasefireMs;
    double nuclearRisk;                   // 阶段 1 恒为 0 [阶段 2+]
}
sealed class WarSideState {
    CountryId country;
    MobilizationLevel mobilization;
    long mobilizationOrderedMs;
    OperationPlan? approvedPlan;
    double fatigue;                       // [0,1]，4.8 的公式（无状态，每小时重算）
    FatigueBreakdown fatigueBreakdown;
    int killedCumulative;                 // 07 汇总（KIA + 失踪中确认死亡；见 4.8）
    int coreTilesAtStart;                 // 开战时控制的地块数
    int coreTilesLost;                    // 其中目前被敌控制的数目
    int enemyTilesGained;                 // 开战时敌控、现在我控
    int objectiveTilesTotal, objectiveTilesHeld;
    double supplementSpentMusd;
    bool leadershipDemandsCeasefire;
}
record FatigueBreakdown(double time, double casualties, double territory, double cost, double gains);

sealed class OperationPlan {              // §18.2-2
    int id; CountryId owner; CountryId target;
    TileSetRef objectiveTiles;
    SortedSet<FormationId> committedFormations;
    long submittedMs;
    PlanAssessment assessment;            // 来自 12 的代理模型（期望值 + 置信区间，§21-1 ✅）
    double leadershipScore;               // 4.7
    bool approved;
}
record PlanAssessment(double successP, double successPHalfWidth, int expectedKilled,
                      int expectedDays, int expectedEquipmentLost);

sealed class CeasefireOffer {
    CountryId mediator;                   // 俄罗斯等；直接谈判时 = 发起方
    long offeredMs, expiresMs;
    string templateId;                    // 14 定义（停火线 + 移交条款 + 维和区）
    SortedDictionary<CountryId, bool?> responses;   // null = 未答复
}

sealed class PeacekeepingZone {           // 停火后维和区（如拉钦走廊）
    CountryId actor; TileSetRef tiles; long startMs, endMs;
}

// 地块的法理归属（与 09 的 TileControl 区分）
sealed class TileClaimTable {             // 每个 Tile 一个 de jure 所有者（14 初始化）
    SortedDictionary<ulong /*H3Index*/, CountryId> deJure;
}
```

### 3.8 危机事件（数据驱动）

```csharp
sealed class CrisisEventDef {             // YAML：data/scenarios/<id>/events.yaml 或 data/events/*.yaml
    string id;
    EventScope scope;                     // Global / Dyad / Country
    List<Condition> triggers;             // 全部满足才可能触发
    double mtthDays;                      // 平均触发时间（满足条件时），0 = 条件满足立即触发
    bool oneShot;
    long? notBeforeMs, notAfterMs;        // 日期窗口
    List<EventOption> options;            // 第一个为默认（玩家超时未选或 AI 平局时）
    string textKey;                       // 文案键（预先生成并人工审核，§20.4）
    bool historical;                      // 是否属于“历史事件”（4.12）
}
sealed class EventOption { string id; string textKey; List<Effect> effects; double aiWeight; }
sealed class Condition { ConditionType type; string? arg; double min, max; }
enum ConditionType : int {
    TensionScore = 1, TensionLevelAtLeast = 2, RelationValue = 3, TrustValue = 4, IssueSupport = 5,
    DateBetween = 6, FlagSet = 7, FlagNotSet = 8, AtWar = 9, NotAtWar = 10, HistoricalModeIs = 11,
    PlayerCountryIs = 12, TileControlledBy = 13, MobilizationAtLeast = 14, FatigueAtLeast = 15
}
sealed class Effect { EffectType type; string? target; double value; string? arg; }
enum EffectType : int {
    TensionDelta = 1, TensionBaselineDelta = 2, TrustDelta = 3, RelationDelta = 4, IssueDelta = 5,
    BudgetBonusMusd = 6, SetFlag = 7, ClearFlag = 8, StartWar = 9, CloseImportGateway = 10,
    OpenImportGateway = 11, AddMarketLot = 12, DelayDeliveries = 13, SuspendSupplier = 14,
    BorderSkirmish = 15, GrantCreditLine = 16, SetLeadershipHawkishness = 17, AiDirective = 18,
    OfferCeasefire = 19, DeterrenceDelta = 20
}
sealed class EventInstance { EventInstanceId id; string defId; long firedMs; CountryId? country;
                             string? chosenOptionId; long responseDeadlineMs; }
```

### 3.9 沙盒指标

```csharp
sealed class DefenseReview {              // 每年 1 月 1 日生成（F8）
    int year; CountryId country;
    double readinessScore;                // [0,1]，界面 ×100
    double netAssessment;                 // [0,1]：标准想定下“守住/达成目标”的概率（12 代理模型）
    double deterrence;
    double budgetExecution;               // 实际花出 / 可用
    int contractsDelayed;
    SortedDictionary<string, double> challengeProgress;   // 剧本目标 id → [0,1]
}
```

### 3.10 历史模式与沙盒
```csharp
enum HistoricalMode : int { Historical = 1, Plausible = 2, Free = 3 }   // 4.12，S-14
sealed class StrategicSettings { HistoricalMode mode; bool sandboxSupremeLeader; ulong worldSeed; }
```

---

## 4. 算法与公式

> 执行时机：全部在 `TickPhase.Calendar`（30），顺序 **年 → 日 → 时**（00 §5.2）。本节标出每步属于哪一子步。所有遍历按 ID 升序（00 §6.4）。

### 4.0 战略层每次 Calendar 调用的顺序

```csharp
void OnCalendar(long tick) {
    var t = new SimTime(tick * 60000);
    if (IsJan1Midnight(t)) YearlyStep(t);           // 4.2.1–4.2.3, 4.5.2(市场年批), 4.13 年报
    if (tick % 1440 == 0) DailyStep(t);             // 4.5.2(季度批次), 4.11 供应中断检查（每 7 天）
    if (tick % 60 == 0) HourlyStep(t);              // 下面 H1–H12
}
void HourlyStep(SimTime t) {
    // dtH = 1
    H1_BudgetAccrual(t);          // 4.2.5 人员/O&M/训练/基建按小时计费
    H2_ContractDecisions(t);      // 4.4.3 到期的批准裁决
    H3_Payments(t);               // 4.4.5
    H4_Deliveries(t);             // 4.4.4 / 4.5 / 4.6.2 升级完工
    H5_Production(t);             // 4.5.3 国内生产线
    H6_Projects(t);               // 扩产/基建进度
    H7_Mobilization(t);           // 4.8.2
    H8_Events(t);                 // 4.9 危机事件
    H9_Tension(t);                // 4.6
    H10_Issues_Corruption(t);     // 4.7.3, 4.7.4
    H11_War(t);                   // 4.8 疲劳、红线、停火
    H12_Trust(t);                 // 4.7.1 漂移 + 解职判定
}
```

### 4.1 国家初始化（读剧本时）
1. 由 14 读入：`Country` 列表、`gdpMusd` 逐年表、`baseBudgetMusd` 逐年表、`ConscriptionSystem`、`payMusdPerHeadYear`、`Relation`、`TensionState`、`ExternalActorPolicy`、`ExportPolicy`、`CreditLine`、`ProductionLine`、`TileClaimTable`、初始合同（开局时已签、未交付完的合同）。
2. 若剧本未给某年基础预算：`B_base(y) = B_base(lastGivenYear) × (1 + BudgetDriftPerYear)^(y − lastGivenYear)`（`DMath.Pow`）。
3. 初始 `trust = InitialTrust`（剧本可覆盖）。

### 4.2 年度预算（解决 §21-12）

#### 4.2.1 年初总额（每年 1 月 1 日 00:00）
```
B_total(y) = B_base(y) + issueBonus(y)          // crisisBonus、warSupplement 年内追加，年初为 0
issueBonus(y) = (support[DefenseBudgetIncrease] ≥ IssueBudgetThreshold)
                ? B_base(y) × IssueBudgetBonusShare : 0
```
同时把上一年的 `support[DefenseBudgetIncrease]` 减去 `IssueBudgetConsume`（议题“兑现”后回落）。

#### 4.2.2 固定义务（年初计算）
```
Personnel(y)  = Σ_c headcount_c × pay_c                 // c ∈ PayCategory；headcount 由 02 的名册统计（年初快照）
DebtService(y)= Σ_creditLines annuity(drawn, rate, repaymentYears)  当 y ≥ drawYear + graceYears
               + Σ_wars postWarDebtService(y)           // 4.8.5
ContractPay(y)= Σ_contracts Σ_payments 落在 y 年的金额
annuity(P, r, n) = P × r / (1 − (1 + r)^(−n))；r = 0 时 = P / n
```
人员费不是“分配”出来的：它是编制和兵役制度决定的**结果**（玩家改编制、改合同兵比例就会改变它）。年内人数变化（动员、伤亡）按小时重新计费（4.2.5），超出年初值的部分在战时由战时追加覆盖。

#### 4.2.3 可支配资金与分配
```
Discretionary = B_total − Personnel − DebtService − ContractPay
OM_req   = Σ_items omRate(model) × costMusd(model) × TierOmFactor(tier(item))
         + Σ_nodes NodeUpkeepMusdPerYear(node)            // 节点维护费由 06 提供
OM_alloc = OM_req × omFundingRatio
Train    = Σ_formations personnel(f) × TrainCostPerHeadYear[intensity(f)]
Rest     = Discretionary − OM_alloc − Train
Procurement_new = Rest × procurementShare      // 新合同首付、二手、升级、国内产品款
Infrastructure  = Rest × infrastructureShare
WarReserves     = Rest × warReservesShare
Lobbying        = min(Rest × lobbyingShare, B_total × LobbyingCapShare)
```
- `tier(item)`：装备所在营的 `ReadinessTier`（01）；未编入营的库存装备按 `Cadre` 档计。
- 默认分配（新游戏或玩家未操作）：`omFundingRatio = 1.0`，训练 `Normal`，`procurementShare = 0.6, infrastructureShare = 0.15, warReservesShare = 0.25, lobbyingShare = 0`。

#### 4.2.4 资金不足（Rest < 0 或 Discretionary < 0）
按以下顺序**自动削减**，直到 `Rest ≥ 0`，并给玩家一条通知（列出每步削了多少）：
1. 游说 → 0；2. 基础设施 → 0；3. 战备储备 → 0；4. 新采购 → 0；
5. 训练强度逐级下调（全军统一，High→Normal→Low→Minimal）；
6. `omFundingRatio` 以 0.05 为步长下调，最低 `OmFundingMin`；
7. 仍不足：合同付款**顺延**（按合同 ID 升序，后签的先顺延），每顺延一份合同 → 该合同交付表整体后移 `PaymentSlipDelayDays`，信任度 `TrustContractOverrun`；
8. 仍不足：`shortfallMusd` 记账，人员费照付（不允许欠饷），信任度每月 `TrustShortfallPerMonth`。

#### 4.2.5 小时计费（H1）
```
dtH = 1
spend[Personnel]            += Personnel_now_perYear × dtH / 8760      // Personnel_now 用当前名册
spend[OperationsMaintenance]+= OM_alloc × dtH / 8760
spend[Training]             += Train_now × dtH / 8760
// O&M 中备件部分转成 07 的备件库存（按型号）：
partsAddedMusd(model) = omRate × costMusd × count × omFundingRatio × partsShareOfOm × dtH / 8760
```
- `partsAddedMusd` 交给 07/06：按 `PartsUnitCostMusd(model)` 换算成抽象备件数量；对于 `vulnerability[SpareParts] > 0` 的进口型号，只有供应国未中断时才入库（4.11）。
- O&M 资金率对故障率的影响交给 07：`FaultRateMultiplier = 1 + OmFaultSlope × max(0, 1 − omFundingRatio)`。
- 年度结束：未花完的可支配资金**不结转**（作废）；已签合同的未付款项按付款表继续（S-02）。

#### 4.2.6 年内调整
- 玩家可随时修改 `procurementShare/infrastructureShare/warReservesShare/lobbyingShare` 和训练强度；剩余年度按新比例计算（已花的不退）。
- 危机追加：紧张度达到 `Crisis` 时，每年最多一次，领导层自动拨 `CrisisBonusShare × B_base`（进入 `crisisBonusMusd`，全部计入 `Procurement_new` 与 `WarReserves` 按当前比例分）。
- 申请追加：玩家可申请（消耗 `TrustBudgetRequest`），批准条件：`support[DefenseBudgetIncrease] ≥ 0.5` 或紧张度 ≥ `Crisis`；批准额同危机追加。

### 4.3 训练、战备与人员（与 02 衔接）
1. 训练强度 → 02：02 用 `TrainingIntensity` 计算练度增长（02 定义速率）。11 只负责计费与弹药扣减请求。
2. 训练弹药：每个编组每年消耗 `TrainAmmoBasisPerYear[intensity]` 个弹药基数（06 的 `AmmoBasis`），**从库存扣除**（06 执行），所以训练与战备储备直接竞争（§4.3、§19.7）。
3. 训练装备寿命：训练强度对 07 的故障与寿命消耗乘数 `TrainWearFactor[intensity]`。
4. 动员时间（00 归 11）：见 4.8.2。
5. 合同兵比例：`contractShare` 每年向 `contractShareTarget` 移动至多 `ContractShareStepPerYear`；人员费随之变化。`contractShareTarget` 只能在议题 `ConscriptionReform ≥ IssueReformThreshold` 时由玩家提高（S-08）。

### 4.4 进口采购（§18.1 ✅）

#### 4.4.1 生成报价（玩家选择型号、卖方、方式、数量时即时计算，F2）
```
前提：serviceYear ≤ 当前年；seller ∈ producers（或二手市场批次）；
      mode 允许（localAssemblyAllowed / fullLocalizationAllowed）；quantity ≥ ModeMinQuantity[mode]
unitPrice = costMusd × ModePriceFactor[mode] × (1 + WarPremium × buyerAtWar) × (1 − PatronDiscount × isPatron)
upfront   = mode == DirectPurchase ? 0
          : mode == LocalAssembly ? max(assemblySetupMusd, AssemblySetupShare × costMusd × quantity)
          : max(localizationSetupMusd, LocalizationSetupShare × costMusd × quantity)
total     = upfront + unitPrice × quantity
isPatron  = (alliance(buyer,seller) ∈ {MutualDefense, StrategicPartner})
```

#### 4.4.2 批准概率（§18.1 🟡：关系、阵营、敏感度、出口政策、战争/制裁）
```
if (flags(buyer,seller) has ArmsEmbargo) or sensitivity > maxSensitivity[seller→buyer]: p = 0
logit = ModeLogitBase[mode]
      + BetaRelation  × relation(buyer, seller)                       // [-1,1]
      + BetaBloc      × (alliance(buyer,seller) != None ? 1 : 0)
      + BetaHistory   × (buyer ∈ historicalExportsTo ? 1 : 0)
      + BetaWillingness × willingness[seller→buyer]                    // [-1,1]
      − BetaSensitivity × sensitivity                                  // 0..3
      − BetaWar       × (buyerAtWar ? 1 : 0)
      − BetaRival     × (alliance(seller, rivalOf(buyer)) != None ? 1 : 0)
p = clamp(1 / (1 + DMath.Exp(−logit)), 0, ApprovalPMax)
```
- `rivalOf(buyer)`：剧本给出的主要对手（纳卡：互为对手）。
- 二手批次：`mode` 视为 `DirectPurchase`，`sensitivity` 减 1（下限 0）。
- 提交时：冻结 `p` 和 `breakdown`；`decisionDueMs = now + DecisionDays[mode] × 86 400 000`；信任度扣 `TrustPerSensitivity × sensitivity`（§18.2-3 “申请敏感的进口项目”消耗信任度）。

#### 4.4.3 裁决（H2）
```
rng = Rng.For(RngDomain.Strategic, contractId, decisionTick, SaltApproval)
approved = rng.Bernoulli(p)
```
- 批准：`state = Active`，按 4.4.4 生成交付表和付款表；扣 `upfront` 的 `UpfrontPayShare` 部分（其余随交付付）。
- 拒绝：`state = Rejected`；信任度 `TrustImportRejected`；同一（买方, 卖方, 型号）`RetryCooldownDays` 内不能再申请。

#### 4.4.4 交付表
```
DirectPurchase:
  first = approvalMs + leadTimeDays
  lots  = ceil(quantity / lotSize)；第 k 批（k = 0..lots−1）到货 first + k × lotIntervalDays
LocalAssembly:
  组装线建设期 AssemblySetupDays（期间可选附带 DirectPurchase 首批 = AssemblyInitialDirectShare × quantity，按纯外购价）
  建成后：创建 ProductionLine(isAssemblyOnly = true, capacityPerYear = max(quantity / AssemblyContractYears, 1))
  合同剩余数量由该线按 4.5.3 生产；之后该线可继续接单（需零件包进口合同，单价 = unitPrice）
FullLocalization:
  建设期 LocalizationSetupDays；建成后创建 ProductionLine(isAssemblyOnly = false)，可生产该型号整车、备件、配套弹药（弹药型号见 06）
```
- 到货（H4）：生成 `EquipmentItem`（01）进入买方**国家库存**（06 的 `ImportGateway` 节点，再由 06 运送到仓库）；新品 `condition = 1`。
- 交付时间常数按类别组默认值（常数表 `LeadTimeDefault*`）——数据里有 `lead_time_days` 时以数据为准。

#### 4.4.5 付款（H3）
- DirectPurchase：签约付 `DownPaymentShare × total`，其余按每批交付比例付。
- LocalAssembly / FullLocalization：`upfront` 在建设期内按天均摊；产品款按产出付。
- 用信贷（`financedByCredit`）：付款从 `CreditLine.drawnMusd` 扣（不占当年预算），超出额度部分转为预算付款；`restrictedToLenderGoods` 时只能用于 `seller == lender` 的合同。

### 4.5 国内生产、二手市场

#### 4.5.1 二手价格与状态
```
condition = ConditionByGrade[grade]                 // Poor 0.35, Fair 0.6, Good 0.85
ageYears  = currentYear − serviceYear(model)
unitPrice = costMusd × UsedPriceBase × (0.5 + condition) × max(UsedAgeFloor, 1 − UsedAgeSlope × ageYears)
leadTime  = UsedLeadTimeDays（整修 + 运输）
```
- 二手装备交付时 `EquipmentConditionState.condition = condition`（组件，见 6），07 用它放大故障率：`FaultRateMultiplier *= 1 + UsedFaultSlope × (1 − condition)`。
- 二手装备整修：可下单“整修”（Upgrade 的特例 `refurbish`，目标型号 = 原型号），把 condition 提到 `RefurbishTargetCondition`，费用 `RefurbishCostShare × costMusd`。

#### 4.5.2 市场批次生成（年初 + 每季度第一天 00:00）
```
for each (seller, model) in scenario.marketPool (按 seller ISO3, modelId 排序):
    if !(seller 政策允许卖给任一可玩国) continue
    rng = Rng.For(Strategic, Mix(sellerId) ^ modelHandle, tick, SaltMarket)
    if rng.Bernoulli(entry.quarterlyP):
        qty   = entry.qtyMin + rng.NextInt(entry.qtyMax − entry.qtyMin + 1)
        grade = 按 entry.gradeWeights 加权抽样（15 提供 WeightedChoice）
        创建 MarketLot，expiresAt = now + MarketLotLifetimeDays
```
- 剧本（14）给 `marketPool`：卖方、型号、季度出现概率、数量区间、状态权重（依据历史二手流向）。
- 一个批次只能卖给一个买方；AI 国家同样会买（12 决策）。同一刻多个买方申请同一批次：按（申请时刻，国家 ID）升序先到先得。

#### 4.5.3 国内生产线（H5）
```
if line.state != Active: skip
fundedRate = min(1, linefundsAvailable / requiredFunds)   // 产品款从 Procurement_new 或 WarReserves（弹药）支付
outputH = line.capacityPerYear × line.utilization × fundedRate / 8760
if line.isAssemblyOnly && !partsKitsAvailable(line): outputH = 0          // 零件包断供（4.11）
line.fractionalOutput += outputH
while line.fractionalOutput >= 1: 生成 1 件（交给订单或进入国家库存）; fractionalOutput −= 1
```
- 萎缩（每天检查一次，在 DailyStep）：
```
if utilization < LineIdleUtilization: idleDaysConsecutive++ else idleDaysConsecutive = 0
if idleDaysConsecutive > LineIdleGraceDays:
    capacityPerYear *= (1 − LineAtrophyPerYear / 365)
```
- 重启：`LineRestart` 项目，费用 = `LineRestartCostShare × (nominal − current) × ExpansionCostPerUnitYear(line)`，工期 `LineRestartDays`。
- 扩产（D6）：`LineExpansion` 项目：`cost = ΔcapacityPerYear × expansionCostMusdPerUnitYear`，工期 `ExpansionDays`；战时可选“加急”：工期 × `WartimeRushTimeFactor`，费用 × `WartimeRushCostFactor`；新址建线：费用 × `NewSiteCostFactor`，工期 + `NewSiteExtraDays`（§19.6 🟡 扩产选址）。
- 项目进度（H6）：`progress += (spentThisHour / totalCost)`，`spentThisHour = min(Infrastructure 余额小时额度, totalCost / nominalDays / 24)`。资金不足时按比例变慢。

#### 4.5.4 退役（D5，S-06）
- 选中装备（按型号 × 数量，从未编入营的库存优先，再按 AllocationPolicy 的逆序从营中抽出）立即移除；该型号 O&M 需求下降。
- 退役装备阶段 1 **直接处置**（无残值）。出售到二手市场和封存 **[阶段 2+]**。
- 系统提示：“退役后，该型号全军需求缺口 +N”（读 01 的 `ForceRequirement`）。

### 4.6 升级改装（S-05）
1. 下单：选 `UpgradePath`、数量、提供方（外国或国内工厂）。外国提供时生成一个 `ProcurementContract(kind = Upgrade)` 走 4.4.2 批准（`sensitivity` 用目标型号的值）。
2. 送修：每天从库存/营中抽取 `min(待修, capacityPerYear/365 × 累加)` 件进入工厂（这些装备在 `daysPerUnit` 天内不可用），抽取顺序按 01 的 `AllocationPolicy` 的**逆序**（最后才动一线营）。
3. 完工：该 `EquipmentItem` 的 `modelId` 改为 `toModelId`，`condition = max(condition, UpgradeConditionAfter)`；通知 02：所在编组对应专业的型号专有练度 × `typeSkillRetention`（02 执行）。
4. 付款：按完工件数 × `costPerUnitMusd`。

### 4.7 信任度、议题、游说、作战方案

#### 4.7.1 信任度（H12）
- 变化来源与数值见常数表 `Trust*`（总纲 §18.2-3 的增加/消耗/下降三类全部覆盖）。
- 漂移：`trust += (TrustDriftTarget − trust) × TrustDriftPerDay / 24`。
- 解职（失败条件 §18.8）：`trust < TrustFireThreshold` 持续 `TrustFireGraceDays` 天 → 游戏失败；或丑闻曝光且 `trust < TrustScandalFireThreshold` → 立即失败。
- 沙盒“最高决策者”模式：信任度仍计算并显示，但不触发解职，方案自动批准。

#### 4.7.2 评估准确度（战争结束或停火时）
```
err = |actualDays − expectedDays| / max(expectedDays, 1) + |actualKilled − expectedKilled| / max(expectedKilled, 1)
trust += (err ≤ AssessAccurateErr) ? TrustAssessmentAccurate : (err ≥ AssessInaccurateErr ? TrustAssessmentInaccurate : 0)
```

#### 4.7.3 议题（H10）
```
support[i] += (baseline[i] − support[i]) × IssueRevertPerDay / 24
```
- 事件、战果、玩家行动（边境行动 +`IssueHardlinePerBorderAction`）通过 `Effect.IssueDelta` 改变。
- 门槛效果：
  - `HardlineVsRival ≥ IssueHardlineWarThreshold` 且紧张度 ≥ `Crisis`：玩家的作战方案**自动批准**；AI 国家的领导层可能**主动开战**（12 读取此标志）。
  - `DefenseBudgetIncrease ≥ IssueBudgetThreshold`：下年预算追加（4.2.1）。
  - `ConscriptionReform ≥ IssueReformThreshold`：允许提高 `contractShareTarget`。

#### 4.7.4 游说与腐败（H10，阶段 1 简化）
```
投入 x Musd（一次性，从 Lobbying 线扣）到议题 i：
Δsupport = LobbyEffectMax × (1 − DMath.Exp(−x / LobbyScaleMusd(country)))     // 收益递减
cumulativeLobby[i] += x   // 同一议题的累计投入越多，效果越小：实际 Δ × LobbyFatigue^(cumulativeLobby/LobbyScale)
corruption += CorruptionPerMusd(country) × x
每小时：corruption −= corruption × CorruptionDecayPerYear / 8760
曝光（每天一次，DailyStep）：pExpose = CorruptionExposeK × corruption²
    rng = Rng.For(Strategic, countryId, tick, SaltScandal)
    if Bernoulli(pExpose): trust += TrustScandal；冻结 Lobbying 线余额；corruption ×= 0.5
```
`LobbyScaleMusd(country) = LobbyScaleShare × B_base`（小国花小钱就有效果，避免跨国不一致）。

#### 4.7.5 作战方案审批（§18.2-2；确定性评分）
```
plan.assessment = ProxyModel.Evaluate(plan)      // 12 提供：successP ± halfWidth、伤亡、天数
score =  W_success   × assessment.successP
       − W_casualty  × min(1, expectedKilled / (CasualtyNormPerM × populationM))
       + W_trust     × trust
       + W_hardline  × support[HardlineVsRival]
       + W_hawk      × leadershipHawkishness
       + CasusBelliBonus[casusBelli]
       + TensionBonus[tensionLevel]
approved = score ≥ PlanApprovalThreshold  ||  sandboxSupremeLeader
          || (support[HardlineVsRival] ≥ IssueHardlineWarThreshold && tensionLevel ≥ Crisis)
提交即扣 TrustPlanSubmitted；被拒再扣 TrustPlanRejected；同一目标 PlanCooldownDays 内不可重交。
```
- 防御作战（被进攻）自动批准，不需要方案（§18.2-4）。
- 批准后：创建 `War`（若尚未开战），开战方 `casusBelli` 按方案选择；`relation` 按 `RelationWarPenalty[casusBelli]` 下降（对所有 `ExternalActor` 与 `SupplierOnly` 国家，乘以其 `stance` 的符号权重，见 4.10）。
- 评分各分项和门槛全部显示（F6）。

### 4.8 紧张度、战争、动员、疲劳、停火

#### 4.8.1 紧张度（H9）
```
score += (baseline − score) × TensionRevertPerDay / 24
score += Σ 本小时的事件/行动 delta
score = clamp(score, 0, 1)
level = war(a,b).Active ? (anyFull(mobilization) ? TotalWar : LimitedConflict)
      : score ≥ TensionCrisisAt ? Crisis : score ≥ TensionTensionAt ? Tension : Peace
```
- 玩家行动（D9）：抵近巡逻 `+TensionPatrol`，边境演习 `+TensionExercise`（并消耗训练弹药，等同一次 `High` 训练周）；每次行动按 `BorderIncidentP` 的概率触发事件 `border_skirmish`（14 的事件表）。
- 跨级审批：从 `Tension` 推到 `Crisis` 以上的行动（边境演习在 `Tension` 及以上时）需领导层同意：`approved = trust + 0.5 × support[Hardline] ≥ EscalationApprovalThreshold`（确定性，显示差值）。

#### 4.8.2 动员（H7）
- 申请：玩家申请 `Partial/Full`；`Partial` 在紧张度 ≥ `Crisis` 或战争中自动批准；`Full` 需要战争中，或 `trust ≥ FullMobTrustMin`。被进攻方的 `Full` 自动批准。
- 效果：
```
callUp = (Partial ? MobPartialShare : MobFullShare) × reservePool
按顺序填充：Reduced 档营 → Cadre 档营 → 新组建（玩家下令）
每个营的到位时间：Active 0；Reduced MobDaysReduced；Cadre MobDaysCadre
到位曲线：线性；第 h 小时到位比例 = min(1, h / (days × 24))
入营人员通用练度 = reserveGeneralSkill（交给 02）
```
  人员实际入列由 02/07 执行（11 只给“该营某专业应到位人数随时间的目标”）。
- 战时追加（4.8.4）与疲劳乘数随动员等级变化。

#### 4.8.3 战争疲劳（H11；**无状态公式**，每小时重算，F7 分项显示）
```
days      = (now − war.startMs) / 86 400 000.0
time      = FatigueTimePerDay × MobTimeFactor[mobilization] × days
casualties= FatigueCasPerKiaPerM × killedCumulative / populationM
territory = FatigueTerritory × coreTilesLost / max(1, coreTilesAtStart)
cost      = FatigueCost × supplementSpentMusd / max(1, B_base)
gains     = − FatigueGains × objectiveTilesHeld / max(1, objectiveTilesTotal)
fatigue   = clamp(time + casualties + territory + cost + gains, 0, 1)
leadershipDemandsCeasefire = fatigue ≥ FatigueSeekCeasefire
```
- `killedCumulative`：07 汇总本国 `CasualtyState.Killed` 的人数（失踪/被俘不计入，S-11）。
- `coreTilesAtStart`：开战时本国控制（`TileControl`，09）的地块数，**包括非法理领土**（纳卡：亚方控制的地块）。

#### 4.8.4 战时预算（§18.4）
```
capShare = MobCapShareGdp[mobilization]                    // None 0, Partial 0.07, Full 0.25
annualSupplement = max(0, capShare × gdpMusd − B_base) × WarGrantFraction
每小时：warSupplementMusd += annualSupplement / 8760；supplementSpentMusd 同步累加
```
- 追加资金按玩家当前比例进入 `Procurement_new / WarReserves / Infrastructure`（扩产）。钱多了瓶颈是产能（4.5.3）——这是设计意图（§18.4）。

#### 4.8.5 战后紧缩
停火/结束时：`postWarDebt = supplementSpentMusd × PostWarRepayShare`，分 `PostWarRepayYears` 年等额（无息）进入 `DebtService`。

#### 4.8.6 停火（解决 §21-14，S-10）
**触发来源**
1. 调停方提议：外部行为体（`maxRung ≥ Mediation`）在战争第 `mediationFirstDay` 天起，每 `mediationIntervalDays` 天提出一次；或任一交战方 `leadershipDemandsCeasefire` 变为 true 时 24 小时内提出。模板选择：按 `mediationTemplates` 顺序取**第一个条件满足的**模板（14 定义条件，例如“阿方已控制舒沙”）。
2. 红线触发 `ForcedCeasefire`（4.10）：立即生成一个**强制**提议（双方必须接受）。
3. 直接谈判：交战方达成 `objectiveTilesHeld / objectiveTilesTotal ≥ ObjectiveAchievedShare` 时，可向对方提出“按现控制线停火”。

**接受规则**
```
AI 方或玩家方被强制：
accept = forced
      || fatigue ≥ FatigueForceAccept
      || (fatigue ≥ FatigueSeekCeasefire && trend ≤ 0)
      || objectiveShare ≥ ObjectiveAchievedShare
trend = 最近 72 小时 (enemyTilesGained − coreTilesLost) 的变化（> 0 = 我方在推进）
玩家方：fatigue ≥ FatigueForceAccept 时领导层强制接受（不可拒绝）；否则玩家选择。
拒绝调停：relation(拒绝方, mediator) += RelationRefuseMediation
```
**生效**（双方都接受后，下一个整点）
1. `War.phase = Ceasefire`；所有 `EdgeBattle` 由 04 在 `CeasefireWindDownHours` 内结束（不再生成新片段，双方停止进攻命令；09 拒绝跨线 Move/CrossTileStrike 命令）。
2. **停火线 = 当前 `TileControl`**（09）。正在过边的营，按归属地块计。
3. 模板移交条款：按模板列出的地块，`TileControl` 改为受让方；该地块内出让方的营在 `HandoverDays` 内自动撤出到最近的己方地块（09 执行移动）。
4. 维和区：创建 `PeacekeepingZone`，区内地块双方都不能进入或打击，`endMs = start + 模板年限`。
5. 战后结算：威慑值（4.10.3）、信任度（`TrustWarWon/Lost` 按“目标完成率”判定）、评估准确度（4.7.2）、紧缩（4.8.5）、紧张度 `baseline += TensionPostWarBaselineDelta`。
6. 停火后，战争可以“重启”：需要新的作战方案（`casusBelli` 视为 `TerritorialClaim`），且 `relation(mediator)` 惩罚 ×2。
- 和约、占领区管理 **[阶段 2+]**：`War.phase = Ended` 只在剧本结束或和约系统实现后使用。

### 4.9 危机事件（H8）
```
for each def in eventDefs (按 id 升序):
    for each scopeInstance (Country/Dyad 按 ID 升序):
        if fired-and-oneShot: continue
        if !AllConditionsTrue(def.triggers, scopeInstance): continue
        if mode filter: def.historical && mode == Free → skip（Free 模式不触发历史事件）
        pHour = def.mtthDays == 0 ? 1 : 1 − DMath.Exp(−1 / (def.mtthDays × 24))
        rng = Rng.For(Strategic, Mix(defHandle) ^ scopeKey, tick, SaltEvent)
        if rng.Bernoulli(pHour): Fire(def, scopeInstance)
```
- 触发后：玩家国家 → 弹出简报（游戏暂停可选），`responseDeadline = now + EventResponseHours`；超时按第一个选项。AI 国家 → 12 按 `aiWeight` 与效用选择（确定性：同权重时取第一个）。
- 同一小时多个事件触发：按（事件 id, 范围键）升序依次处理，前一个事件的效果对后一个的条件**不回溯**（条件在本小时开始时已判定）。
- `BorderSkirmish` 效果：请求 04 在指定交界边生成一场**有限交战**（`EdgeBattle`，参战规模限连级、持续上限 `SkirmishMaxHours`，不触发 `War`）；结果（伤亡、是否丢失阵地）回写事件链。

### 4.10 外部大国（S-12）

#### 4.10.1 行为体与阶梯
| 行为体 | 阶段 1 角色 | 最高阶梯 | 说明 |
|---|---|---|---|
| 俄罗斯 RUS | 供应国（双方）、调停方、红线方（CSTO：亚美尼亚本土） | `Peacekeeping`（红线后 `ForcedCeasefire`） | 直接参战 **[阶段 2+]** |
| 土耳其 TUR | 供应国（阿方）、情报/顾问支持、红线方（纳希切万、阿塞拜疆本土） | `IntelSharing` | 停火后联合监控中心只作文本 |
| 伊朗 IRN | 边境敏感方（阿拉斯河沿线） | `Statements` | 炮弹/火箭落入伊朗领土 → 关系与紧张事件 |
| 以色列 ISR | 供应国（阿方：无人机、巡飞弹、LORA、Barak-8） | `ArmsSupply` | 战时继续供货的概率高（14 数据） |
| 白俄罗斯、乌克兰、塞尔维亚、捷克等 | 供应国/二手来源 | `ArmsSupply` | 只走 4.4/4.5 |

#### 4.10.2 红线（H11）
```
for each redLine (按 id 升序):
    violated = trigger 条件成立（例：敌方地面营位于 redLine.tiles 任一地块，归属已切换）
    if violated: 记 violationStartMs（若未记）
    else: 清除
    if violated && now − violationStartMs ≥ graceHours:
        Warning：事件 + relation(violator, actor) += relationPenalty；升级到下一效果的计时器再开始
        ForcedCeasefire：生成强制停火提议（4.8.6）
```
- 纳卡剧本红线（数据在 14）：俄罗斯“亚美尼亚本土地面进入”、土耳其“纳希切万地面进入”、伊朗“伊朗领土受打击”（仅 Warning）。

#### 4.10.3 威慑值
```
停火时：deterrence += DeterWin × (objectiveShare − 0.5) × 2 + DeterExchange × clamp(lossRatio − 1, −1, 1)
lossRatio = enemyKilled / max(1, ownKilled)
每天：deterrence += (DeterBaseline − deterrence) × DeterRevertPerYear / 365
```
威慑值供 12（AI 开战意愿）和 4.13 年报使用。

#### 4.10.4 供应国战时行为（与 4.11 合并执行）
- 每个外部行为体对每个交战国：`supplyContinueP = clamp(0.5 + 0.5 × stance[buyer] − 0.3 × (stance[enemy] > 0.5 ? 1 : 0), 0, 1)`，用于 4.11 的中断判定。
- 情报共享（`IntelSharing`）：把外部行为体的卫星加入受援国的共享名单——即在 05 的 `SatelliteAsset.sharesWith` 中加入受援国（05 R-12：MVP 盟国只共享卫星）；阶段 1 只有土耳其对阿塞拜疆（14 `external_actors.TUR.intel_sharing`）。

### 4.11 供应依赖与战时中断（§18.7）
每 7 天（DailyStep，`day % 7 == 0`）对每个（买方, 供应国）对，若买方在战争中：
```
pSuspend = (1 − supplyContinueP(seller, buyer)) × SuspendScale
rng = Rng.For(Strategic, Mix(buyerId) ^ sellerId, tick, SaltSuspend)
if Bernoulli(pSuspend): 该供应国对该买方的所有 Active 合同 → Suspended，交付暂停；
                       DependencyChannel 中 source = seller 的备件/弹药补给停止（06/07 读取）
已暂停的：同样概率按 (1 − pSuspend) 恢复
```
- 运输线：进口物资经 06 的 `ImportGateway` 入境；剧本事件可关闭口岸（`CloseImportGateway`，例：2020 年格鲁吉亚禁止军火过境）。口岸全关时，交付积压在“境外”。
- 软件支持中断：`vulnerability[Software] × 中断天数 / SoftwareDecayDays` 交给 05/08 作为传感器/电子战效能衰减（上限 `SoftwareDecayMax`）。
- 使用限制：`endUseRestricted` 由 09 在下达 `CrossTileStrike` 时检查。

### 4.12 历史事件处理（回应 §21-10，S-14）
| 模式 | 含义 | 纳卡默认 |
|---|---|---|
| `Historical` | 历史事件按剧本日期**确定**发生（`mtthDays = 0` + 日期窗口），AI 获得“历史指令”（`AiDirective`，如“2020-09-27 发动进攻”）；玩家行为可让条件失效（例如玩家是阿方则指令不作用于玩家） | `nk_2020` |
| `Plausible` | 历史事件变成“有条件、有概率”的事件：保留条件（紧张度、军力对比、日期窗口），用 `mtthDays` 抽样；AI 无历史指令，按 12 的效用决策 | `nk_2010` |
| `Free` | 不触发 `historical: true` 的事件；只保留外生背景（预算路径、型号服役年份） | — |
- **外生背景**不受模式影响：剧本给出的预算路径（如阿塞拜疆随油价的预算变化）、型号服役年份、外部国家政策的逐年变化。理由：它们是“国防部长无法影响的”环境（§18 总原则）。
- 1990 开局的全球事件（苏联解体等）**[阶段 3]**，届时用同一机制。

### 4.13 沙盒目标（回应 §21-15，S-13）
每年 1 月 1 日为每个可玩国家生成 `DefenseReview`：
```
readinessScore = 0.35 × avgFillRate + 0.25 × avgGeneralSkill + 0.15 × avgTypeSkill
               + 0.15 × min(1, ammoDaysOfWar / ammoDaysTarget) + 0.10 × omFundingRatioCapped
netAssessment  = ProxyModel.StandardScenario(country, rival)    // 12：“对手沿接触线全面进攻 14 天”想定下我方守住/达成目标的概率
budgetExecution= Σ spent / B_total
challengeProgress[g] = 剧本目标的进度函数（14 定义）
```
- 年报只供显示，不改变规则（沙盒没有胜利条件，§18.8 ✅）。
- 年报中给出与上一年的差值和“主要拖累项”（分项中下降最多的一项）。

---

## 5. 常数表

> 存放：`data/tuning/11_strategic.yaml`（G-15）。“来源/理由”中 **est** = `confidence: estimated`，**bal** = 平衡需要。

### 5.1 预算与人员
| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `BudgetDriftPerYear` | 0.0 | 1/年 | −0.05–0.05 | 剧本未给年份时不变（总纲：预算固定） |
| `TierOmFactor[Active/Reduced/Cadre]` | 1.0 / 0.6 / 0.3 | — | 0.2–1.0 | est：简编/骨干营装备多封存、少动用（§3.4 维护费不同） |
| `OmRate[ground_vehicle]` | 0.04 | 1/年 | 0.02–0.08 | est：地面装备年维护约为购置价 3–5% 的经验量级 |
| `OmRate[artillery/air_defense]` | 0.05 | 1/年 | 0.02–0.10 | est |
| `OmRate[aircraft/helicopter]` | 0.10 | 1/年 | 0.05–0.20 | est：航空装备运行成本显著更高 |
| `OmRate[uav]` | 0.08 | 1/年 | 0.04–0.15 | est |
| `OmRate[small_arms]` | 0.02 | 1/年 | 0.01–0.05 | est |
| `PartsShareOfOm` | 0.4 | — | 0.2–0.6 | est |
| `OmFundingMin` | 0.5 | — | 0.3–0.7 | bal：再低等于放弃装备 |
| `OmFaultSlope` | 2.0 | — | 1–4 | bal：资金率 0.5 → 故障率 ×2 |
| `TrainCostPerHeadYear[Min/Low/Normal/High]` | 0.0002 / 0.0005 / 0.001 / 0.002 | Musd/人/年 | ×0.5–×2 | est：每人每年 200–2000 美元非弹药训练费（剧本可按国家覆盖） |
| `TrainAmmoBasisPerYear[Min/Low/Normal/High]` | 0.05 / 0.15 / 0.3 / 0.6 | 基数/编组/年 | ×0.5–×2 | est |
| `TrainWearFactor[...]` | 0.5 / 0.8 / 1.0 / 1.4 | — | — | est |
| `LobbyingCapShare` | 0.02 | — | 0–0.05 | bal |
| `IssueBudgetThreshold` | 0.70 | — | 0.6–0.85 | bal |
| `IssueBudgetBonusShare` | 0.05 | — | 0.02–0.10 | bal |
| `IssueBudgetConsume` | 0.20 | — | 0.1–0.3 | bal |
| `CrisisBonusShare` | 0.03 | — | 0–0.10 | bal（§18.2-5 “少量追加”） |
| `PaymentSlipDelayDays` | 180 | d | 90–365 | est |
| `ContractShareStepPerYear` | 0.05 | 1/年 | 0.02–0.10 | est：兵役改革需好几年（§18.11） |

### 5.2 采购
| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `ModePriceFactor[Direct/Assembly/Localization]` | 1.00 / 0.85 / 0.75 | — | 0.6–1.1 | ✅ §18.1 定性：外购单价最高；数值 est |
| `AssemblySetupShare` | 0.15 | 合同额比例 | 0.05–0.3 | est |
| `LocalizationSetupShare` | 0.50 | 合同额比例 | 0.3–1.0 | est（含技术转让） |
| `ModeMinQuantity[...]` | 1 / 50 / 100 | 件 | — | bal：防止买 1 辆就建厂 |
| `AssemblySetupDays` | 730 | d | 365–1095 | est |
| `LocalizationSetupDays` | 1460 | d | 1095–2555 | est |
| `AssemblyInitialDirectShare` | 0.2 | — | 0–0.5 | est：常见“首批成品 + 后续组装”模式 |
| `AssemblyContractYears` | 4 | 年 | 2–8 | est |
| `ModeLogitBase[...]` | 1.5 / 0.5 / −1.0 | logit | ±1 | bal：中性关系下 p ≈ 0.82 / 0.62 / 0.27，对应 ✅ “最高/中等/最低” |
| `BetaRelation` | 2.0 | /单位关系 | 1–3 | bal |
| `BetaBloc` | 1.0 | — | 0.5–2 | bal |
| `BetaHistory` | 1.0 | — | 0–2 | §18.3 “历史上是否出口过作为参考” |
| `BetaWillingness` | 1.5 | — | 0.5–3 | bal |
| `BetaSensitivity` | 0.8 | /级 | 0.4–1.5 | bal |
| `BetaWar` | 1.5 | — | 0.5–3 | bal |
| `BetaRival` | 1.0 | — | 0–2 | bal |
| `ApprovalPMax` | 0.98 | — | 0.9–1 | bal：永远保留一点不确定 |
| `DecisionDays[...]` | 60 / 120 / 180 | d | 30–365 | est |
| `RetryCooldownDays` | 365 | d | 180–730 | bal |
| `DownPaymentShare` | 0.2 | — | 0–0.5 | est |
| `UpfrontPayShare` | 0.3 | — | 0–1 | est |
| `WarPremium` | 0.25 | — | 0–0.5 | §18.7 “战时涨价”，est |
| `PatronDiscount` | 0.10 | — | 0–0.3 | est（俄对 CSTO 盟友内部价） |
| `LeadTimeDefault[small_arms/ground_vehicle/artillery/air_defense/aircraft/uav/munition]` | 120 / 365 / 365 / 540 / 730 / 180 / 180 | d | ×0.5–×2 | est |
| `LotIntervalDaysDefault` | 90 | d | 30–180 | est |
| `UsedPriceBase` | 0.25 | — | 0.1–0.5 | est |
| `UsedAgeSlope` | 0.02 | 1/年 | 0–0.05 | est |
| `UsedAgeFloor` | 0.3 | — | 0.1–0.5 | est |
| `ConditionByGrade[Poor/Fair/Good]` | 0.35 / 0.60 / 0.85 | — | — | est |
| `UsedFaultSlope` | 1.5 | — | 0.5–3 | bal |
| `UsedLeadTimeDays` | 150 | d | 60–365 | est |
| `RefurbishCostShare` | 0.10 | — | 0.05–0.2 | est |
| `RefurbishTargetCondition` | 0.85 | — | 0.7–1 | est |
| `MarketLotLifetimeDays` | 180 | d | 90–365 | bal |
| `UpgradeConditionAfter` | 0.9 | — | 0.8–1 | est |
| `TypeSkillRetentionUpgrade` | 0.8 | — | 0.7–0.9 | 总纲 §4.2 “同型升级 0.7–0.9” |
| `DepVuln[Direct]` | 1/1/1/1 | — | — | §18.7 表 |
| `DepVuln[Assembly]` | 0.6/0.6/1.0/0.8 | — | — | §18.7 “部分缓解”，est |
| `DepVuln[Localization]` | 0.1/0.1/0.2/0.1 | — | — | §18.7 “基本不受影响” |

### 5.3 生产线
| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LineIdleUtilization` | 0.10 | — | 0.05–0.2 | bal |
| `LineIdleGraceDays` | 365 | d | 180–730 | §18.1 🟡 “停产太久” |
| `LineAtrophyPerYear` | 0.25 | 1/年 | 0.1–0.5 | est |
| `LineRestartCostShare` | 0.5 | — | 0.3–1 | est |
| `LineRestartDays` | 270 | d | 90–540 | est |
| `ExpansionDays` | 540 | d | 365–1095 | est |
| `WartimeRushTimeFactor` | 0.6 | — | 0.4–0.9 | est |
| `WartimeRushCostFactor` | 1.5 | — | 1.2–2.5 | est |
| `NewSiteCostFactor` | 1.3 | — | 1–2 | §19.6 🟡 |
| `NewSiteExtraDays` | 180 | d | 90–365 | §19.6 🟡 |
| `LineSwitchDays` | 60 | d | 14–180 | est |

### 5.4 政治、战争
| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `InitialTrust` | 0.6 | — | 0.4–0.8 | bal |
| `TrustFireThreshold` | 0.15 | — | 0.05–0.25 | bal |
| `TrustFireGraceDays` | 30 | d | 0–90 | bal：给玩家补救时间 |
| `TrustScandalFireThreshold` | 0.25 | — | — | bal |
| `TrustDriftTarget` / `TrustDriftPerDay` | 0.5 / 0.002 | — / 1/d | — | bal |
| `TrustPlanSubmitted` | −0.05 | — | −0.1–0 | §18.2-3 |
| `TrustPlanRejected` | −0.05 | — | — | bal |
| `TrustBudgetRequest` | −0.04 | — | — | §18.2-3 |
| `TrustPerSensitivity` | −0.01 | /级 | — | §18.2-3 |
| `TrustImportRejected` | −0.02 | — | — | bal |
| `TrustContractOverrun` | −0.03 | /合同 | — | §18.2-3 |
| `TrustShortfallPerMonth` | −0.02 | — | — | bal |
| `TrustDeliveryOnTime` | +0.01 | /合同完成 | — | §18.2-3 |
| `TrustCrisisHandled` / `Mishandled` | +0.03 / −0.05 | — | — | 由事件效果给出的默认值 |
| `TrustBattleWon` / `Lost` | +0.005 / −0.005 | /场（营级以上） | — | bal |
| `TrustWarWon` / `TrustWarLost` | +0.20 / −0.30 | — | — | §18.2-3 “打败仗” 代价落在玩家身上 |
| `TrustAssessmentAccurate` / `Inaccurate` | +0.05 / −0.10 | — | — | §18.2-3 |
| `AssessAccurateErr` / `AssessInaccurateErr` | 0.3 / 1.0 | — | — | bal |
| `TrustScandal` | −0.30 | — | −0.5–−0.1 | §18.2-7 “信任度暴跌” |
| `IssueRevertPerDay` | 0.003 | 1/d | 0.001–0.01 | bal |
| `IssueHardlineWarThreshold` | 0.80 | — | 0.7–0.9 | bal |
| `IssueReformThreshold` | 0.65 | — | — | bal |
| `IssueHardlinePerBorderAction` | +0.02 | — | — | bal |
| `LobbyEffectMax` | 0.15 | — | 0.05–0.3 | bal |
| `LobbyScaleShare` | 0.005 | 占 B_base | — | bal |
| `LobbyFatigue` | 0.5 | — | 0.3–0.8 | §18.2-7 收益递减 |
| `CorruptionPerMusd` | 0.10 / LobbyScaleMusd | 1/Musd | — | bal：投入 1 个 Scale → 腐败 +0.1 |
| `CorruptionDecayPerYear` | 0.3 | 1/年 | — | bal |
| `CorruptionExposeK` | 0.01 | /天 | 0.003–0.03 | bal：腐败 0.5 时每天 0.25%，约一年 60% |
| `W_success, W_casualty, W_trust, W_hardline, W_hawk` | 1.0, 0.6, 0.4, 0.4, 0.3 | — | — | bal |
| `CasualtyNormPerM` | 1000 | 人/百万人口 | — | bal |
| `CasusBelliBonus[Self/Ally/Claim/Unprovoked]` | 1.0 / 0.4 / 0.2 / −0.5 | — | — | §18.5 正当性排序 |
| `TensionBonus[Peace/Tension/Crisis/LC/TW]` | −0.5 / −0.2 / 0.1 / 0.3 / 0.3 | — | — | bal |
| `PlanApprovalThreshold` | 1.0 | — | 0.8–1.3 | bal |
| `PlanCooldownDays` | 30 | d | — | bal |
| `TensionRevertPerDay` | 0.01 | 1/d | — | bal |
| `TensionTensionAt` / `TensionCrisisAt` | 0.35 / 0.65 | — | — | bal |
| `TensionPatrol` / `TensionExercise` | +0.03 / +0.08 | — | — | bal |
| `BorderIncidentP` | 0.05 | /次行动 | — | bal |
| `EscalationApprovalThreshold` | 0.7 | — | — | bal |
| `TensionPostWarBaselineDelta` | +0.15 | — | — | bal |
| `MobPartialShare` / `MobFullShare` | 0.4 / 1.0 | 预备役比例 | — | est |
| `MobDaysReduced` / `MobDaysCadre` | 5 / 21 | d | 3–14 / 14–45 | est：简编营补人、骨干营补人加整训 |
| `FullMobTrustMin` | 0.5 | — | — | bal |
| `MobCapShareGdp[None/Partial/Full]` | 0 / 0.07 / 0.25 | GDP 比例 | 0 / 0.05–0.10 / 0.20–0.40 | §18.4 表 |
| `WarGrantFraction` | 1.0 | — | 0.5–1 | bal |
| `PostWarRepayShare` / `PostWarRepayYears` | 0.5 / 3 | — / 年 | — | §18.4 “战后紧缩” |
| `FatigueTimePerDay` | 0.002 | 1/d | 0.001–0.005 | 校准：见 9.2 |
| `MobTimeFactor[None/Partial/Full]` | 1.0 / 1.5 / 2.0 | — | — | §18.4 “疲劳累积较快/很快” |
| `FatigueCasPerKiaPerM` | 0.00035 | 每（阵亡/百万人口） | 0.0002–0.0006 | 校准：亚美尼亚 2020（9.2） |
| `FatigueTerritory` | 0.8 | — | 0.5–1.2 | 校准 |
| `FatigueCost` | 0.1 | — | 0–0.3 | bal |
| `FatigueGains` | 0.3 | — | 0.1–0.5 | bal |
| `FatigueSeekCeasefire` | 0.6 | — | 0.5–0.75 | bal |
| `FatigueForceAccept` | 0.9 | — | 0.8–0.95 | 校准：亚美尼亚 11-09 接受停火 |
| `ObjectiveAchievedShare` | 0.8 | — | 0.6–1 | bal |
| `CeasefireWindDownHours` | 6 | h | 1–24 | bal |
| `HandoverDays` | 10 | d | 7–21 | 史实：2020-11-20/25、12-01 三次移交 |
| `RelationRefuseMediation` | −0.10 | — | — | bal |
| `RelationWarPenalty[Self/Ally/Claim/Unprovoked]` | 0 / −0.05 / −0.10 / −0.30 | — | — | §18.5 |
| `DeterWin` / `DeterExchange` / `DeterBaseline` / `DeterRevertPerYear` | 0.15 / 0.05 / 0.5 / 0.1 | — | — | bal |
| `SuspendScale` | 0.5 | /7 天 | 0.2–1 | bal |
| `SoftwareDecayDays` / `SoftwareDecayMax` | 180 / 0.3 | d / — | — | est |
| `EventResponseHours` | 24 | h | 6–72 | bal |
| `SkirmishMaxHours` | 12 | h | 2–48 | bal |

### 5.5 RNG salt 表（`RngDomain.Strategic = 11`）
| salt | 值 | 用途 |
|---|---|---|
| `SaltApproval` | 1 | 进口批准裁决 |
| `SaltMarket` | 2 | 二手批次生成 |
| `SaltMarketQty` | 3 | 二手批次数量与状态（同一流内顺序：先数量后状态） |
| `SaltEvent` | 4 | 危机事件触发 |
| `SaltScandal` | 5 | 腐败曝光 |
| `SaltSuspend` | 6 | 供应中断/恢复 |
| `SaltBorderIncident` | 7 | 边境行动引发事件 |

---

## 6. 与其他系统的接口

| 对方 | 方向 | 内容 | 时机 |
|---|---|---|---|
| 01 编制 | 读 | `ForceRequirement`、营的 `ReadinessTier`、`AllocationPolicy`、`EquipmentItem` 计数 | 年初；采购面板打开时 |
| 01 | 写 | 交付时创建 `EquipmentItem`（库存）；升级时改 `modelId`；退役时删除 | H4、4.5.4、4.6 |
| 02 人员 | 读 | 按 `PayCategory` 的人数、`School` 产能 | 年初、H1 |
| 02 | 写 | `TrainingIntensity`、动员到位目标、预备役练度、升级后的练度保留系数 | 变更时 |
| 05 侦察 | 写 | `SatelliteAsset.sharesWith`（外部行为体情报共享，05 R-12）；软件支持中断的效能衰减 | 4.10.4、4.11 |
| 06 后勤 | 读 | 节点维护费、储备目标缺口、`ImportGateway` 状态 | 年初、H1 |
| 06 | 写 | 新交付物资入口岸、口岸开关、工厂节点产出、训练弹药扣减请求、`WarReserves` 采购的弹药 | H4、H5、事件 |
| 07 损伤 | 写 | `FaultRateMultiplier`（O&M、二手状态）、备件入库、供应中断标志 | H1、4.11 |
| 07 | 读 | 本国阵亡累计 `killedCumulative` | H11 |
| 09 时间/命令 | 读 | `TileControl`、战斗结果（营级以上胜负）| H11 |
| 09 | 写 | 战争状态（和平时禁止跨国界 `Move`/`CrossTileStrike`）、停火时的命令封锁、移交撤出、维和区禁入、使用限制 | 状态变化时 |
| 04 条带 | 写 | 停火时结束所有 `EdgeBattle`；`BorderSkirmish` 有限交战请求 | 4.8.6、4.9 |
| 12 AI | 读/写 | AI 国家通过与玩家**相同的** `IStrategicActions` 调用；12 提供 `ProxyModel.Evaluate`（方案）与 `StandardScenario`（年报） | 随时 |
| 13 UI | 读 | 全部 F1–F9 视图模型 | — |
| 14 剧本 | 读 | 国家参数、预算路径、合同、生产线、市场池、事件、红线、停火模板、目标 | 加载时 |
| 15 存档 | 读/写 | 本文件所有状态类；RNG 不存流状态（00 §6.2） | 存/读档 |

```csharp
interface IStrategicActions {                     // 玩家 UI 与 AI 共用，所有调用在 OrderIntake 后、下一次 Calendar 生效
    ProcurementQuote Quote(CountryId buyer, string modelId, CountryId seller, ProcurementMode mode, int qty);
    ContractId Submit(ProcurementQuote q, bool useCredit);
    void BuyMarketLot(CountryId buyer, MarketLotId lot);
    ProjectId OrderUpgrade(CountryId owner, string upgradePathId, CountryId provider, int qty);
    void Retire(CountryId owner, string modelId, int qty);
    void SetAllocation(CountryId owner, BudgetAllocation a);
    void SetLineUtilization(ProductionLineId line, double u);
    ProjectId ExpandLine(ProductionLineId line, double deltaPerYear, bool newSite, bool rush);
    void BorderAction(CountryId owner, CountryId target, BorderActionType t);
    void Lobby(CountryId owner, IssueId issue, double musd);
    int SubmitPlan(OperationPlan p);
    void RequestMobilization(CountryId owner, MobilizationLevel lvl);
    void RequestBudgetSupplement(CountryId owner);
    void AnswerEvent(EventInstanceId e, string optionId);
    void AnswerCeasefire(WarId w, CountryId c, bool accept);
}
enum BorderActionType : int { Patrol = 1, Exercise = 2 }
```

组件（00 §0 第 2 条）：
```csharp
sealed class EquipmentConditionState { EquipmentItemId itemId; double condition; bool inUpgradeShop; long shopUntilMs; }  // on EquipmentItem（01）
```

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| `B_base = 0` 或剧本未给预算 | 加载报错（剧本校验）；运行时 `max(1, B_base)` 防除零（疲劳、游说分母） |
| `populationM = 0` | 加载报错 |
| 同一刻玩家与 AI 抢同一二手批次 | 按（提交时刻, CountryId）升序，先到先得；后者收到“已售出”通知，不扣信任度 |
| 合同交付时买方已灭亡/剧本结束 | 合同 `Cancelled`，不退款 |
| 批准概率 p = 0（禁运） | 不允许提交；按钮置灰并显示原因 |
| 供应国同时是交战对手的盟友且买方正在打仗 | 4.4.2 中 `BetaRival` 与 `BetaWar` 同时生效；可为 0 但不为负 |
| 生产线 capacity 萎缩到 < 0.01/年 | 视为 0，`state = Idle`，只能 `LineRestart` |
| 升级送修时装备正在战斗中（所在营在 `EdgeBattle`） | 跳过该件，取下一件；全部在战斗中则当天不送修 |
| 动员时预备役池为 0 | 动员仍可宣布（效果只有追加预算和疲劳乘数），并提示“无可动员人员” |
| 战争中某方全部地块丢失 | `coreTilesLost/coreTilesAtStart = 1`；疲劳 ≥ 0.8 → 几乎必然接受停火；若无调停方，自动生成“直接谈判”提议 |
| 两场战争同时进行 | 疲劳、追加预算按战争分别计算；预算追加取各战争 `annualSupplement` 的**最大值**（不叠加，S-09）；动员等级取最高 |
| 停火提议过期而有一方未答复 | 视为拒绝 |
| 同一小时红线与疲劳都触发停火 | 红线的强制提议优先（同一小时只保留一个提议，优先级：ForcedCeasefire > 调停 > 直接谈判） |
| 维和区内仍有营 | 停火生效时由 09 自动撤到最近的己方地块；无可撤之处则该营留在原地并冻结（不可移动、不参战） |
| 事件效果引用了不存在的国家/口岸 | 加载时校验报错；运行时跳过该效果并写日志 |
| 年初预算编制时玩家未确认 | 沿用上一年比例 |
| 货币浮点误差 | 显示保留 0.1 Musd；判断“余额不足”用 `< −1e−6` |

---

## 8. 测试用例

> 全部可手算。`exp(x)` 取 4 位小数。

**T1 年度预算分配**
- 输入：`B_base = 600`，议题支持 0.5（无追加）；人员 260，债务 0，合同付款 40；`OM_req = 100`，资金率 1.0；训练：人员 45 000 × 0.001 = 45；比例 0.6/0.15/0.25/0。
- 计算：`Discretionary = 600 − 260 − 0 − 40 = 300`；`Rest = 300 − 100 − 45 = 155`；采购 93、基建 23.25、储备 38.75、游说 0。
- 期望：`{Personnel 260, ContractPay 40, O&M 100, Training 45, Procurement 93, Infrastructure 23.25, WarReserves 38.75}`，合计 600。

**T2 资金不足削减顺序**
- 输入：同 T1，但合同付款 = 200。`Discretionary = 140`，`Rest = 140 − 100 − 45 = −5`。
- 期望：游说 0、基建 0、储备 0、新采购 0 后仍为 −5 → 训练降为 `Low`：`45 000 × 0.0005 = 22.5` → `Rest = 140 − 100 − 22.5 = 17.5 ≥ 0`，停止。最终训练 22.5、O&M 100，`Rest = 17.5` 全部按比例进入四条线（采购 10.5、基建 2.625、储备 4.375）。通知列出 5 步。

**T3 批准概率**
- 输入：亚美尼亚向俄罗斯纯外购敏感度 3 的型号；`relation = 0.8`、同盟 `MutualDefense`、历史出口过、`willingness = 0`、不在战争、俄与阿无同盟。
- `logit = 1.5 + 2.0×0.8 + 1.0 + 1.0 + 0 − 0.8×3 − 0 − 0 = 2.7`；`p = 1/(1+e^−2.7) = 1/(1+0.0672) = 0.9370`。
- 期望：`p = 0.937`（±0.001），信任度 −0.03。
- 变体：阿塞拜疆向土耳其申请“全部本地化”敏感度 2：`relation = 0.9`、`StrategicPartner`、无历史、`willingness = 0.5`：`logit = −1.0 + 1.8 + 1.0 + 0 + 0.75 − 1.6 = 0.95` → `p = 1/(1+0.3867) = 0.7211`。

**T4 交付表**
- 输入：纯外购 40 辆，`leadTimeDays = 365`，`lotSize = 10`，`lotIntervalDays = 90`，批准于 2012-03-01 00:00。
- 期望：4 批，到货 2013-03-01、2013-05-30、2013-08-28、2013-11-26（2013 非闰年：365 天后为 2013-03-01，此后每 +90 天）。签约付 20%，每批付总额的 20%。

**T5 生产线萎缩**
- 输入：`capacityPerYear = 100`，开工率 0.05 持续 365 + 73 天。
- 期望：前 365 天不变；之后 73 天每天 ×(1 − 0.25/365)：`100 × (1 − 0.000684932)^73 = 100 × e^(73×ln(0.999315068)) ≈ 100 × e^(−0.0500171) ≈ 95.12`。

**T6 战争疲劳（亚美尼亚 2020 校准）**
- 输入：`days = 44`，`Full`，`killed = 3 800`，`populationM = 2.96`，`coreTilesLost/coreTilesAtStart = 0.35`，`supplementSpent = 0`，`objectiveTilesHeld = 0`。
- `time = 0.002 × 2.0 × 44 = 0.176`；`cas = 0.00035 × 3800 / 2.96 = 0.4493`；`terr = 0.8 × 0.35 = 0.28`；合计 `0.9053`。
- 期望：`fatigue ≈ 0.905 ≥ 0.9` → 领导层强制接受停火。

**T7 战争疲劳（阿塞拜疆 2020）**
- 输入：`days = 44`，`Partial`，`killed = 2 900`，`populationM = 10.1`，失地 0，目标完成 0.6。
- `time = 0.002×1.5×44 = 0.132`；`cas = 0.00035 × 2900/10.1 = 0.1005`；`gains = −0.3 × 0.6 = −0.18`；合计 `0.0525`。
- 期望：`fatigue ≈ 0.05`，不主动求停火；停火须由调停模板或目标达成触发。

**T8 二手价格**
- 输入：`costMusd = 2.0`，`Fair`（0.6），`serviceYear = 1985`，当前 2012（27 年）。
- `ageFactor = max(0.3, 1 − 0.02×27) = 0.46`；`price = 2.0 × 0.25 × 1.1 × 0.46 = 0.253`。
- 期望：0.253 Musd/件；故障率乘数 `1 + 1.5×0.4 = 1.6`。

**T9 游说收益递减**
- 输入：`B_base = 600` → `LobbyScaleMusd = 3`；首次投入 3 Musd。
- `Δ = 0.15 × (1 − e^−1) = 0.15 × 0.6321 = 0.0948`；`LobbyFatigue^(0/3) = 1`；腐败 `+0.1`。
- 再投入 3：`Δ = 0.0948 × 0.5^(3/3) = 0.0474`；腐败累计 0.2（忽略衰减）。

**T10 作战方案审批**
- 输入：`successP = 0.7`，`expectedKilled = 2000`，`populationM = 10`（norm = 10 000 → 0.2），`trust = 0.6`，`hardline = 0.6`，`hawk = 0.5`，`casusBelli = TerritorialClaim`，`Crisis`。
- `score = 0.7 − 0.6×0.2 + 0.4×0.6 + 0.4×0.6 + 0.3×0.5 + 0.2 + 0.1 = 0.7 − 0.12 + 0.24 + 0.24 + 0.15 + 0.3 = 1.51` ≥ 1.0 → 批准。
- 变体：`Peace` 且 `Unprovoked`：`1.51 − 0.3 − 0.5 − 0.5 = 0.21` → 拒绝，显示“差 0.79”。

**T11 事件小时概率**
- 输入：`mtthDays = 30`。`pHour = 1 − e^(−1/720) = 0.0013879`。

---

## 9. 验证建议（Python 脚本，对应计划 V1–V7）

### 9.1 V-预算（属 V1 数据一致性）
- 脚本 `tools/validate_strategic.py`：读 14 的剧本，按 4.2 跑开局年预算，检查：人员费占比落在剧本给的历史区间（亚美尼亚、阿塞拜疆人员费约占军费 40–55%，`confidence: estimated`）；`Rest ≥ 0`；O&M 需求不超过预算的 30%。

### 9.2 V2（历史校准：2020 年战争回放）中本系统负责的部分
- 用 14 的 `nk_2020` 开局，由 12 的“历史指令” AI 双方对打 200 个种子。本系统检查：
  1. 停火日分布：中位数落在第 35–55 天（史实 44 天：2020-09-27 至 11-10）。
  2. 亚美尼亚停火时疲劳分项：伤亡项 0.35–0.55、领土项 0.2–0.4（与 T6 一致）；阿塞拜疆疲劳 < 0.3。
  3. 停火模板命中率：≥ 60% 的种子落入“11-10 式”模板（阿方控制舒沙 → 移交三区 + 拉钦走廊维和）。
- 若 1 不达标，调 `FatigueCasPerKiaPerM`、`FatigueTerritory`（只在调参范围内）；若超出范围仍不达标，说明 03/04 的伤亡率或推进速度有问题，而不是疲劳公式的问题。

### 9.3 V4（十年战役可玩性搜索：亚美尼亚有没有“可行但困难”的路线）
**问题**：`nk_2010` 开局，亚美尼亚玩家在 10 年（2010-01-01 → 2020-09-27 阿方史实开战日；Plausible 模式下 AI 自己决定开战日）内能否通过预算、采购、训练、工事、动员准备，使 2020 年前后的战争结果显著好于史实？
**方法**（离线，不跑完整模拟）：
1. **快速战略模拟器**：Python 重写 4.2–4.8 的预算、采购、生产、疲劳公式（与 C# 同一套常数，读 `data/tuning/11_strategic.yaml`），战斗结果用 12 的代理模型（`ProxyModel`）按“战区级”估算：输入双方营的能力向量汇总、防空/无人机/纵深火力指标、工事等级，输出每天地块易手概率与伤亡。
2. **策略空间**（亚美尼亚，每年一个决策向量，共 10 年）：
   - 预算分配：`omFundingRatio ∈ {0.8, 1.0, 1.1}`；训练 ∈ {Low, Normal, High}；采购/基建/储备比例 ∈ 6 种模板；
   - 采购组合：从 14 的“亚美尼亚可得采购清单”中选（如：Tor-M2KM、Osa 升级、电子战系统、二手 T-72、巡飞弹、反炮兵雷达、俄贷款项目、伊斯坎德尔、Su-30SM）；
   - 兵役/动员准备：合同兵比例目标、预备役训练；
   - 工事：基建预算投向前沿工事（04/06 的工事等级上限）；
   - 是否使用俄贷款。
3. **对手**：阿塞拜疆 AI 按 12 的采购效用（Plausible 模式）+ 史实预算路径；附加两档：史实采购清单（Historical）与“理性最优”采购（搜索得到的阿方最佳回应）。
4. **搜索**：随机搜索 + CMA-ES / 遗传算法，每个候选策略跑 50 个种子；预算：≥ 20 000 个策略评估。
5. **判据（全部满足才算“可行但困难”）**：

| 指标 | 定义 | 目标区间 |
|---|---|---|
| 存在性 | 找到至少 1 个策略，对 Historical 阿方的结果中位数：亚方在停火时保住 ≥ 70% 开战时控制的地块，或战争在 21 天内以“冻结”模板结束 | 必须存在 |
| 困难度 | 随机策略（均匀抽样）中达到上条的比例 | 1%–15%（太高 = 太容易，太低 = 不可能） |
| 默认策略 | AI 默认分配（4.2.3 默认值 + 12 的亚方 AI）对 Historical 阿方的结果 | 接近史实（失去 30%–60% 控制地块） |
| 稳健性 | 最优亚方策略对“理性最优”阿方的成功率 | ≥ 25%（否则说明亚方只能靠对手犯错） |
| 不存在万能解 | 最优策略的成功率 ≤ 85%；且没有单一采购项贡献 > 50% 的改善（逐项删除重算） | 两条都满足 |
| 预算合理 | 最优策略不依赖 `shortfall` 或信任度被解职 | 必须 |
| 机制可读 | 最优策略的关键因素能在年报/AAR 中被看到（例如“防空覆盖率”“工事等级”“无人机交换比”） | 人工检查 |

6. **输出**：策略分布报告（哪些投资组合有效，按边际贡献排序）；若“困难度”不在区间，调整的优先顺序：①剧本参数（亚方可得采购清单、二手市场池、俄贷款额度）→ ②本文件常数（批准概率、交付期）→ ③不改战斗模型（那是 V2 的职责）。

### 9.4 其他
- 批准概率表：扫描 relation × sensitivity × mode，画热力图，检查和“史实是否卖过”的一致性（例如俄对阿出售 S-300PMU2 在 2010 年前后应为 p > 0.5；以色列对亚美尼亚出售任何敏感度 ≥ 2 的型号 p < 0.1）。
- 生产线萎缩：绘制 10 年产能曲线，检查“维持 15% 开工率”的保险费是否低于“萎缩后重启”的成本（设计意图：保持一点生产有价值，§18.1）。

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| S-01 | 预算分几条线（§21-12） | 🟡 六条：人员、O&M、采购、训练、基建、战备储备，外加游说与固定义务（债务、合同） | 每条都对应一个独立决策；“人员”是结果而非分配 | 五条（储备并入采购）；更细的十几条（太会计化） |
| S-02 | 年度结余是否结转 | 🟡 可支配资金不结转；已签合同按付款表 | 鼓励年度规划，简单 | 结转 10%；全部结转 |
| S-03 | 训练弹药从哪来 | 🟡 从战备库存扣，储备线负责补 | 让“训练 vs 囤弹”成为真实取舍（§4.3、§19.7） | 训练线单独购买训练弹 |
| S-04 | 进口批准用 logistic 公式 + 一次 RNG 裁决 | 🟡 是；概率和分项冻结并显示 | 外国政府决策有不确定性；数字透明 | 确定性门槛 |
| S-05 | 升级改装（§21-11） | 🟡 `UpgradePath` 数据驱动，装备送厂停用、按产能排队、练度按同型升级系数保留 | 不做研发时最重要的“旧装备变新”手段 | 升级即时完成（失去取舍） |
| S-06 | 退役与二手（§21-11） | 🟡 阶段 1：二手只买不卖、按季度生成批次、状态影响故障；退役 = 处置 | 卖二手等于出口（阶段 2） | 阶段 1 即可卖二手 |
| S-07 | 作战方案审批确定性 | 🟡 确定性评分 + 公开门槛 | 不可刷档、透明 | 概率审批 |
| S-08 | 阶段 1 的议题 | 🟡 3 个：对对手强硬、增加国防预算、兵役改革（只影响合同兵目标） | 最小可用集合 | 增加“摆脱对俄依赖”等 |
| S-09 | 多场战争的追加预算 | 🟡 取最大值不叠加 | 防止制造小战争刷钱 | 叠加 |
| S-10 | 战争结束（§21-14） | 🟡 阶段 1 只做停火：停火线 = 当前控制；调停方模板可附带移交条款与维和区；和约与占领区管理阶段 2 | 纳卡 2020 的结局正是“控制线 + 移交 + 维和” | 直接做和约谈判 |
| S-11 | 疲劳是否计入失踪/被俘 | 🟡 不计（只计阵亡） | 公开统计口径以阵亡为主，便于校准 | 计入 0.5 权重 |
| S-12 | 外部大国模型 | 🟡 只做“供货 + 调停 + 红线 + （土耳其）情报共享”；不做外国部队直接参战 | 纳卡史实中外部大国未直接参战；工作量可控 | 俄军 102 基地作为可参战部队 |
| S-13 | 沙盒目标感（§21-15） | 🟡 年度《国防评估》：战备评分、对手净评估、威慑、预算执行、挑战目标 | 用已有机制（代理模型）产生“进步感” | 积分/成就系统 |
| S-14 | 历史事件（§21-10） | 🟡 三档：Historical / Plausible / Free；外生背景（预算路径、服役年份）不受模式影响 | 兼顾“重演历史”和“改变历史” | 只做 Historical；只做 Free |
| S-15 | 战略层更新频率 | 🟡 全部挂在 Calendar 小时步，萎缩与市场按天/季度门控（与 00 §5.2 一致，无需改总表） | 一个入口，顺序固定 | 预算、生产按天 |
| S-16 | 关系值范围 | 🟡 [−1, 1]（有符号，不适用 G-09 的 [0,1]） | 关系天然有正负 | [0,1] 以 0.5 为中性 |
| S-17 | 疲劳用无状态公式 | 🟡 是（每小时由累计量重算） | 透明、可测、可校准；战果可以“抵消”疲劳 | 积分式（有记忆） |
| S-18 | 信贷 | 🟡 剧本提供 `CreditLine`（如俄对亚 2015/2017 军贷），不允许玩家任意借款 | 史实存在且是重要选择；任意借款会变成经济模拟 | 不做信贷 |
| S-19 | 红线效果 | 🟡 阶段 1 只做 Warning 与 ForcedCeasefire，不做外国直接参战 | 见 S-12 | — |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 预算线 | `BudgetLine` | 年度预算的分配类别（人员、O&M、采购、训练、基建、战备储备、游说） |
| 固定义务 | `ObligationKind` | 年初先扣除的债务偿还、合同付款 |
| 预算分配 | `BudgetAllocation` | 玩家设定的 O&M 资金率、训练强度、可支配资金比例 |
| 训练强度 | `TrainingIntensity` | `Minimal/Low/Normal/High` |
| 信贷额度 | `CreditLine` | 剧本给出的外国军贷 |
| 采购合同 | `ProcurementContract` | 一次采购（进口/国内/二手/升级）的全过程状态 |
| 获取方式 | `AcquisitionKind` | `NewImport/Domestic/SecondHand/Upgrade` |
| 采购属性 | `ProcurementProfile` | `EquipmentModel` 的采购子对象（YAML 键 `procurement`） |
| 批准分项 | `ApprovalBreakdown` | 批准概率 logit 的各项 |
| 交付批次 | `DeliveryLot` | 合同中一次到货 |
| 二手批次 | `MarketLot` | 二手市场上的一批装备 |
| 状态等级 / 状态值 | `ConditionGrade` / `EquipmentConditionState.condition` | 二手装备新旧程度 |
| 升级路径 / 升级项目 | `UpgradePath` / `UpgradeProject` | 型号 A → A′ 的改装 |
| 项目 | `Project` | 扩产、重启、基建、升级的通用进度对象 |
| 出口政策 | `ExportPolicy` | 卖方对各买方的意愿与敏感度上限 |
| 外部行为体政策 | `ExternalActorPolicy` | 外部大国的倾向、介入阶梯、红线、调停模板 |
| 介入阶梯 | `InterventionRung` | 声明→供货→情报→调停→维和→直接介入 |
| 红线 | `RedLine` | 外部大国的触发区域与后果 |
| 停火提议 / 停火模板 | `CeasefireOffer` / `CeasefireTemplate`（数据在 14） | 停火的提出与条款 |
| 维和区 | `PeacekeepingZone` | 停火后双方不得进入/打击的地块集合 |
| 法理归属表 | `TileClaimTable` | 每个地块的 de jure 所有国（区别于 09 的 `TileControl`） |
| 战争方状态 | `WarSideState` | 某国在某场战争中的动员、疲劳、地块统计 |
| 疲劳分项 | `FatigueBreakdown` | 时间、伤亡、领土、费用、战果五项 |
| 方案评估 | `PlanAssessment` | 代理模型给出的成功率 ± 区间、伤亡、天数 |
| 危机事件定义 / 实例 | `CrisisEventDef` / `EventInstance` | 数据驱动事件 |
| 条件 / 效果 | `Condition` / `Effect` | 事件的触发条件与效果 |
| 国防评估 | `DefenseReview` | 年度沙盒指标报告 |
| 历史模式 | `HistoricalMode` | `Historical/Plausible/Free` |
| 战略设置 | `StrategicSettings` | 历史模式、最高决策者沙盒开关、世界种子 |
| 薪酬类别 | `PayCategory` | 人员费计算类别 |
| 边境行动 | `BorderActionType` | `Patrol/Exercise` |
| 战略行动接口 | `IStrategicActions` | 玩家与 AI 共用的战略层命令接口 |
| 情报共享（外部行为体） | 复用 05 `SatelliteAsset.sharesWith` | 外部行为体向受援国共享卫星情报（不新增类型） |
