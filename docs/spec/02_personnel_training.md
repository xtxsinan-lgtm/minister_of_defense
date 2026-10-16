# 02 人员与练度

> 依据：总纲 §4（两层练度、相似度、增长衰减、训练学校产能）、§3.4（战备等级）、§9.3③（名册、单兵不记练度）、§9.12（伤员归队保留练度、补充方式）、§15.1（伞降资格）、§18.11（兵役制度）、§6 第 1 条（型号越多人员越难调用）。
> 术语、ID、单位以 [00_glossary.md](00_glossary.md) 为准；G-xx 🟡 视为暂定采用（尤其 **G-07：练度按“旅 × 专业”记录，独立营按“营 × 专业”**）。
> 本文件 🟡 编号 `P-xx`，汇总在第 10 节。
> 已对齐的相邻规格：01（编制树、`OnCrewModelChange`、维护组织）、03（`GetSkill` 用法 `0.4 × 通用 + 0.6 × 专有`；交战经验报告）、05（伪装/侦察练度）、06（`ConsumeForTraining`、`MobilityProfile`）、11（`TrainingIntensity`、`ConscriptionSystem`、动员到位目标、升级保留系数、训练计费）。

---

## 1. 目标与范围

### 1.1 解决什么问题
1. **人从哪里来、多快来**：训练学校产能（按训练体系）、义务兵/合同兵/军官的来源、预备役、动员到位——把“编制改动”变成“要多训练多少人、要几年”的硬约束（总纲 §4.3 ✅、§18.11）。
2. **人有多好**：两层练度（通用 / 型号专有），换装时按相似度打折，训练让它增长、不训练让它衰减，实战让它提高（§4.1–4.3）。
3. **训练要花真东西**：弹药基数、燃油、装备寿命（使用小时 → 故障 → 备件）、预算（§4.3）。
4. **名册**：每个班有一份按人记录的名册（专业、岗位、服役类型、伤亡状态），供 03 班级模拟、07 伤亡与补充使用（§9.3③）。

### 1.2 阶段划分

| 内容 | 阶段 0（试验场） | 阶段 1（纳卡） | 阶段 2+ |
|---|---|---|---|
| 专业表、名册、`PersonnelRecord` | ✅ | ✅ | |
| 练度存储 `SkillRecord`、`GetSkill` | ✅（练度预设：新兵/常备/老兵/精锐） | ✅ | |
| 相似度系数 | ✅ | ✅ | |
| 训练增长/衰减、资源消耗 | — | ✅ | 按编组单独设强度（P-05 备选） |
| 实战经验 | ✅（试验场可选开关） | ✅ | |
| 训练学校、毕业、分配 | — | ✅ | 学校作为可被打击的设施 |
| 义务兵退役、合同兵、军官 | — | ✅ | |
| 预备役池、动员到位执行 | — | ✅ | |
| 战备等级的人员在编比例 | — | ✅ | |
| 伞降资格 | 字段 | 字段 + 学校 | 空降行为（08） |
| 凝聚力 | — | **不做**（总纲 §9.12(5) 🟡、00 `Cohesion`） | 可选 |
| 飞行员、舰员的专门培养 | — | 飞行员只用本文件通用学校模型（08 补飞行小时） | 阶段 3 舰员 |

### 1.3 不包含
- 谁被打中、伤成什么样 → 03；伤员后送、治愈、阵亡统计、补充分配算法、重组 → 07（本文件提供人员池与合并练度的函数）。
- 兵役制度的政治改革、人员费单价、训练费计费、动员**命令**与到位时间曲线 → 11（`ConscriptionSystem`、`MobilizationLevel`、`MobDays*` 归 11）。本文件**执行**到位、维护预备役池明细。
- 弹药与燃油库存 → 06；故障与备件消耗 → 07（本文件只累加使用小时）。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单

| # | 决策 | 在哪做 | 默认值 |
|---|---|---|---|
| D1 | 全军**训练强度**（`Minimal / Low / Normal / High`） | 预算面板（11 的 `BudgetAllocation`） | `Normal` |
| D2 | 个别编组的**训练强度覆盖**（如重点旅 `High`、二线旅 `Low`） | 部队面板 | 不覆盖（P-05） |
| D3 | **扩建训练学校**（某训练体系 +N 人/年） | 人力面板 → 11 建设项目 | — |
| D4 | 学校**招训优先级**：某专业加权（如“优先培养无人机操作员”） | 人力面板 | 按缺口自动分配 |
| D5 | **战时速成班**开关（课程缩短，毕业练度降低） | 人力面板 | 关（战时提示打开） |
| D6 | 合同兵比例目标（需议题支持，11 S-08） | 预算/议题面板（11） | 剧本值 |
| D7 | 各营战备等级（01 D8；人员在编比例按本文件） | 部队面板 | 剧本值 |
| D8 | 申请动员（11）；动员时是否接收**志愿者**补缺 | 动员面板 | 接收 |
| D9 | 换装决策的人员代价（01 改型号绑定时，本文件给出练度损失预估） | 01 部队面板 | — |

### 2.2 反馈清单

| # | 反馈 | 公式/来源 |
|---|---|---|
| F1 | 每个旅（练度归属）× 专业：人数、通用练度、各型号专有练度，0–100 显示（G-09） | §3.4 |
| F2 | **趋势预测**：“按当前强度，180 天后通用练度 0.48 → 0.55；平衡点 0.53” | §4.6.4 平衡点公式 |
| F3 | 训练消耗（每年）：弹药基数、燃油吨数、车辆使用小时、训练费；资源不足时“实际训练强度”与原因 | §4.6.2 |
| F4 | 换装预估：“T-72B → T-90S：坦克炮长专有练度 0.62 → 0.31（相似度 0.5：同属苏式体系）” | §4.3 |
| F5 | 学校面板：每个训练体系的产能、在训人数、本年毕业、各专业缺口、按当前产能补齐需要几天 | §4.8 |
| F6 | 义务兵轮换的代价：“服役期 24 个月 → 每年需要新训 X 人；全军平均通用练度被拉低约 Y” | §4.6.4 |
| F7 | 预备役池：人数、平均练度（随离队年数下降）、可满足的动员规模 | §4.10 |
| F8 | 动员时间线：每个营各专业到位进度、补缺来源（同专业 / 同体系代岗 / 步兵代岗 / 志愿者） | §4.11 |
| F9 | 伤员归队提示：“本周 37 名轻伤员归队，保留原练度” | §4.9 |

---

## 3. 数据结构

命名空间：`MoD.Sim.Personnel`。

### 3.1 专业表（`data/schema/specialties.yaml`，**沿用**，新增可选字段）

```yaml
specialties:
  - id: tank_gunner
    name: 坦克炮长
    school: armor                    # 已有：训练体系
    # ---- 新增可选（P-02、P-20）----
    operates: [mbt]                  # 本专业操作的装备类别 → 型号专有练度按这些类别里的具体型号记
    crew_of: [mbt]                   # 车组专业：下车时留车（03 §4.x 读取）
    pay_category: contract           # 缺省按 §4.12 推导（officer/political_officer → officer）
    fill_priority: 2                 # 班内岗位填充优先级（小者先填）；缺省见 §4.9.2
```

缺省 `operates` 表（数据没写时使用；03 的 `crew_of` 缺省 = 所有 `tank_*` 与 `vehicle_*` 专业，类别同下表前两行）：

| 专业 | operates |
|---|---|
| `tank_commander, tank_gunner, tank_driver, tank_loader` | mbt |
| `vehicle_commander, vehicle_gunner, vehicle_driver` | ifv, apc, recon_ifv, assault_gun, amphibious_assault_vehicle, light_armored_vehicle, mrap, sp_mortar_howitzer, atgm_vehicle, spaag, sam_short, sam_vehicle_manpads, howitzer_light_sp, howitzer_heavy_sp |
| `rifleman, grenadier, team_leader, squad_leader` | rifle, underbarrel_gl |
| `automatic_rifleman` | lmg |
| `marksman` | dmr |
| `sniper, spotter` | sniper_rifle, anti_materiel_rifle |
| `at_gunner, assistant_gunner` | atgm_portable, atgm_heavy, reusable_launcher, disposable_launcher, thermobaric_launcher |
| `mg_gunner` | gpmg, hmg, agl, sniper_gl |
| `mortarman` | mortar_light, mortar_medium, mortar_heavy, mortar_vehicle |
| `artilleryman` | howitzer_light_towed, howitzer_light_sp, howitzer_light_truck, howitzer_heavy_towed, howitzer_heavy_sp, howitzer_heavy_truck, sp_mortar_howitzer |
| `rocket_artilleryman` | mrl_light, mrl_long_range, tbm_launcher, coastal_ashm_launcher |
| `manpads_gunner` | manpads |
| `ad_crew` | spaag, aa_gun_towed, aa_mg, sam_short, sam_medium, sam_long, c_ram |
| `radar_operator` | radar_counter_battery, radar_battlefield |
| `uav_operator` | uav_micro, uav_hand_launched, uav_small_vtol, uav_tactical, loitering_munition, fpv_drone |
| `ew_operator` | ew_vehicle |
| `driver` | truck_medium, truck_heavy, semi_tractor, utility_vehicle |
| `engineer` | engineer_vehicle, mine_clearing_vehicle, bridge_layer |
| `mechanic` | armored_recovery_vehicle |
| `signaler` | radio_handheld, tactical_terminal |
| `pilot, aircrew` | 航空器类别（08 使用） |
| 其他（officer、staff、medic、scout、intel、cbrn、supply、cook、military_police、special_operator、jtac、forward_observer、political_officer、nco_senior） | 无 → 只有“专业技能”（型号键 0） |

### 3.2 训练体系表（新文件 `data/schema/schools.yaml`）

```yaml
schools:
  - {id: infantry,    course_days: 120, conscript_course_days: 60}
  - {id: armor,       course_days: 180, conscript_course_days: 120}
  - {id: mech,        course_days: 150, conscript_course_days: 90}
  - {id: artillery,   course_days: 180, conscript_course_days: 120}
  - {id: air_defense, course_days: 210, conscript_course_days: 150}
  - {id: uav,         course_days: 120, conscript_course_days: 90}
  - {id: officer,     course_days: 1095}          # 军官学院；不招义务兵
  - {id: nco,         course_days: 180}
  - {id: aviation,    course_days: 730}           # 飞行员（08 补充飞行小时要求）
  - {id: airborne,    course_days: 30, qualification_only: true}  # 伞降资格（不产生新人，只给已有人员加资格）
  # 其余 specialties.yaml 中出现的 school 缺省：course_days 120，conscript_course_days 90
```
全部为 `confidence: estimated`（量级来自常见“新兵训练 2–4 个月 + 专业训练”的公开说法），14 可按国家覆盖。

各国学校产能由剧本给（14）：`manpower.schools: {armor: {capacity_per_year: N}, ...}`。

### 3.3 枚举与 ID

```csharp
public readonly record struct PersonnelId(int value);       // 00 §2.2：顺序分配，0 = 空
public readonly record struct SchoolHandle(int value);

public enum ServiceType : byte {
    None = 0, Conscript = 1, Contract = 2, Officer = 3,
    Reservist = 4,      // 动员入列的预备役
    Volunteer = 5       // 动员时接收的无服役经历志愿者（P-15）
}
// 与 11 的 PayCategory 映射：Conscript→Conscript，Contract→Contract，Officer→Officer，
// Reservist→ReservistMobilized，Volunteer→ReservistMobilized。

public enum DetachReason : byte { None = 0, Casualty = 1, Discharge = 2, Transfer = 3, ToPool = 4, Training = 5 }

public enum SkillPreset : byte { None = 0, Green = 1, Regular = 2, Veteran = 3, Elite = 4 }   // 阶段 0 试验场
// TrainingIntensity 由 11 定义：Minimal / Low / Normal / High（本文件只读）
```

### 3.4 名册与人员

```csharp
public sealed class PersonnelRecord {       // 名册里的一个人；不起名字，不存练度（总纲 §9.3③）
    public PersonnelId id;
    public CountryId country;
    public SpecialtyHandle specialty;
    public ServiceType serviceType;
    public SquadId squad;                   // 0 = 不在任何班（后送、待编池、在途）
    public byte positionIndex;              // 在班模板岗位表里的下标（§4.9.2）；255 = 超编/无岗位
    public CasualtyState casualty;          // 07 定义枚举与转移；本字段由 03/07 写
    public bool airborneQualified;
    public SimTime serviceEndTime;          // 义务兵退役时刻；其他类型 = SimTime.MaxValue
}

public sealed class RosterState { public SquadId squad; public List<PersonnelId> members; }   // 按 positionIndex、再按 id 升序

// 人离开练度归属期间暂存练度（后送、在 07 待编池、在途）。回到班里时用它合并（总纲 §9.12(4)：伤愈归队保留原练度）。
public sealed class CarriedSkillState {     // 组件，键 PersonnelId（P-04）
    public PersonnelId person;
    public double general;
    public double type;                     // 对 typeModel 的专有练度
    public ModelHandle typeModel;           // 0 = 专业技能
    public SimTime detachedAt;
}
```

### 3.5 练度记录

```csharp
// 练度归属 = 01 的维护组织：营的最近建制旅级编组；没有旅级上级的营自成一个（G-07）
public readonly record struct SkillHolderKey(bool isBattalion, int id);   // isBattalion=false → FormationId

public sealed class TypeSkillEntry {
    public ModelHandle model;               // 0 = 专业技能（该专业无 operates，或此人手上没有对应装备）
    public int headcount;                   // 当前在归属内、操作该型号的人数
    public double value;                    // 均值 [0,1]
}

public sealed class SkillRecord {           // 键：(holder, specialty)
    public SkillHolderKey holder;
    public SpecialtyHandle specialty;
    public int headcount;                   // 在归属内（在班里，CasualtyState ∈ {Healthy, LightWounded 且未后送}）的人数
    public double general;                  // 通用练度均值 [0,1]
    public SortedDictionary<ModelHandle, TypeSkillEntry> type;
    public SimTime lastCombatAt;            // 最近一次获得实战经验的时刻（显示用）
}

public readonly record struct SkillValue(double general, double type);   // GetSkill 返回值；03 自己组合 0.4/0.6

public sealed class FormationTrainingState {   // 组件，键 SkillHolderKey
    public SkillHolderKey holder;
    public TrainingIntensity? overrideIntensity;  // null = 用全国设置（P-05）
    public bool refit;                         // 07 整建制轮换休整中：强度至少 High
    public double lastFulfillment;             // 上一小时训练资源满足率 [0,1]（显示）
}
```

### 3.6 人员池、学校、预备役（聚合存储，不建 `PersonnelRecord`）

```csharp
public readonly record struct PoolKey(CountryId country, SpecialtyHandle specialty, ServiceType serviceType);

public sealed class SkillPool {             // 聚合：人数 + 练度均值
    public int count;
    public double general;
    public double type;                     // 对 typeModel 的专有练度
    public ModelHandle typeModel;           // 该池人员受训时用的型号（学校型号，§4.8.4）；0 = 专业技能
}

public sealed class TrainedPoolState { public SortedDictionary<PoolKey, SkillPool> pools; }   // 毕业待分配

public sealed class SchoolCohort {
    public SpecialtyHandle specialty; public ServiceType serviceType;
    public int count; public SimTime startAt; public SimTime graduateAt; public bool accelerated;
}
public sealed class SchoolState {           // 键 (CountryId, SchoolHandle)
    public CountryId country; public SchoolHandle school;
    public double capacityPerYear;          // 毕业生/年（= 年招训上限）
    public double intakeAccumulator;        // 小数累加（§4.8.2）
    public double contractAccumulator;      // 合同兵比例分配用累加器
    public List<SchoolCohort> cohorts;      // 按 startAt、specialty 句柄升序
    public SortedDictionary<SpecialtyHandle, double> priorityWeight;   // D4，缺省 1.0
    public bool accelerated;                // D5
}

public sealed class ReservePoolState {      // 键 (CountryId, SpecialtyHandle)；全部求和 = 11 ConscriptionSystem.reservePool（P-12）
    public SkillPool pool;                  // serviceType 固定视为 Reservist
}

public sealed class CountryManpowerState {  // 每国一份
    public CountryId country;
    public bool allowVolunteers = true;     // D8
    public int conscriptsDrawnThisYear;     // 对照 11 annualIntakeCap
    public SortedDictionary<SpecialtyHandle, SpecialtyHandle> schoolModelCache;  // 不存档，加载后重算
}
```

---

## 4. 算法与公式

> **本系统不使用随机数**：练度是连续量，按期望值计算（00 §6.2 方差规则）；人员分配全部确定性，平局按 ID/句柄升序。

### 4.1 执行顺序（`TickPhase.Calendar` = 30）

同一刻内 11 → 02 → 07 → 12（09 §5 表）。本文件：

| 频率 | 步骤 | 节 |
|---|---|---|
| 每天 00:00 | D1 学校毕业 → D2 义务兵退役 → D3 学校招训 → D4 预备役老化 → D5 向 11 同步预备役总数与练度 | §4.8、§4.10 |
| 每 60 分钟 | H1 人数对账 → H2 实战经验结算（上一小时排队的报告）→ H3 训练资源请求 → H4 练度更新 → H5 动员到位 | §4.4.6、§4.7、§4.6、§4.11 |
| 事件（即时） | `JoinSquad` / `LeaveSquad` / `OnCrewModelChange` / `OnModelUpgraded` / `OnSkillHolderChanged` | §4.4 |

`dtH = 1`（小时步）；`dtD = 1/24`（以天为单位的速率常数用它）。

### 4.2 基础查找

**练度归属** `HolderOf(squad)`：`bn = 01.squad.battalionId`；`f = 01.GetMaintenanceOrg(bn)`（建制链上最近的 `echelon == Brigade` 编组 → `SkillHolderKey(false, f)`；没有 → `SkillHolderKey(true, bn)`）。配属不改变归属（01 O-07）。

**一个人操作的型号** `OperatedModel(person)`：
```csharp
ModelHandle OperatedModel(PersonnelRecord p) {
    var ops = Operates(p.specialty);                 // §3.1，有序列表
    if (ops.Count == 0 || p.squad.value == 0) return default;          // 专业技能
    // 本班中 status ∈ {Active, Stored} 的装备里，类别在 ops 中、排在 ops 列表最前的类别；同类别取 item id 最小者
    foreach (var cat in ops)
        foreach (var item in 01.ItemsOf(p.squad).Where(i => i.slotCategory == cat).OrderBy(i => i.id))
            return item.model;
    return default;
}
```
（一个班两名同专业的人操作同一件装备时，两人都记到该型号——练度是“这个专业对这个型号的熟练程度”，不是“这件装备的”。）

### 4.3 型号相似度 `Similarity(a, b)`（总纲 §4.2 🟡）

```csharp
double Similarity(ModelHandle a, ModelHandle b) {
    if (a == b) return 1.0;
    if (a.value == 0 || b.value == 0) return 0.0;
    if (explicitRules.TryGet(Pair(a, b), out var f)) return f;        // data/schema/similarity.yaml，对称
    var ma = models[a]; var mb = models[b];
    if (ma.category != mb.category) return CrossCategory(ma.category, mb.category);   // 缺省 0（P-03）
    double s;
    if (UpgradeLinked(ma, mb) || ma.family == mb.family) s = SimUpgrade;           // 同型升级 / 同谱系
    else if (Bloc(ma.origin) == Bloc(mb.origin))           s = SimSameBloc;          // 同一设计体系
    else if (IsPair(Bloc(ma.origin), Bloc(mb.origin), Soviet, Chinese)) s = SimSovietChinese;
    else                                                     s = SimCrossBloc;        // 不同体系
    return Math.Max(s, SimilarityFloor(categoryGroup(ma.category)));                  // 简单装备有下限
}
bool UpgradeLinked(m1, m2)   // 沿 upgrade_of 链（各自最多 3 步）相遇即为 true
```

设计体系 `Bloc(origin)`（数据 `data/schema/design_blocs.yaml`，缺省表如下，P-03）：

| Bloc | origin（ISO3） |
|---|---|
| `Soviet` | SUN, RUS, UKR, BLR, KAZ, ARM, AZE, GEO（本地改进苏式装备） |
| `Chinese` | CHN, PRK |
| `Western` | USA, GBR, DEU, FRA, ITA, ESP, NLD, BEL, SWE, NOR, FIN, DNK, CAN, AUS, ISR, TUR, KOR, JPN, POL（2000 年后新型号） |
| `Other` | 其余 |

`SimilarityFloor`：`small_arms` 组 0.5，`c4i` 组 0.5，其他组 0。

`explicitRules` 文件格式：`similarity: [{a: t72b, b: t90s, factor: 0.6, notes: ...}]`。

### 4.4 练度的合并原语（事件驱动）

所有原语只改 `SkillRecord`，都是加权平均，**不会凭空产生或丢失“练度总量”**。

#### 4.4.1 离开 `LeaveSquad(person, reason)`
```text
rec = Skill[HolderOf(p.squad), p.specialty]; m = OperatedModel(p)
写 CarriedSkillState(p) = (rec.general, rec.type[m].value 或 TypeOf(rec, m), m, now)   // reason ≠ Discharge 时
rec.headcount −= 1;  rec.type[m].headcount −= 1         // 均值不变
p.squad = 0
reason == Discharge → 进入预备役池（§4.10.2），删除 PersonnelRecord
reason == Casualty 且 07 判定阵亡 → 07 删除记录与 CarriedSkillState
```
人数降到 0 的条目保留其 `value`（“部队的记忆”），新人加入时按 0 权重被覆盖。

#### 4.4.2 加入 `JoinSquad(person, squad)`
加入者的练度来源（按顺序取第一个存在的）：`CarriedSkillState` → 调用方给出的 `(g, t, tModel)`（来自人员池）→ `(NewcomerFloorG, TypeSkillFloor, 0)`。
```text
H = rec.headcount; rec.general = (H × rec.general + g) / (H + 1); rec.headcount += 1
m  = OperatedModel(person)（加入后计算）
t' = (tModel == m) ? t : max(TypeSkillFloor, Similarity(tModel, m) × t)
e  = rec.type[m]（不存在则新建 value = 0, headcount = 0）
e.value = (e.headcount × e.value + t') / (e.headcount + 1); e.headcount += 1
删除 CarriedSkillState(person)
```
批量加入 n 个练度相同的人时，等价于一次 `(H×G + n×g)/(H+n)`。

#### 4.4.3 换装 `OnCrewModelChange(squad, category, from, to)`（01 发出）
```text
对 squad 名册中所有 Operates 含 category 的人 p（按 id 升序）：
   若 OperatedModel(p) 在换装前 = from（换装后 = to）：
      t_from = TypeOf(rec, from)
      t'     = max(TypeSkillFloor, Similarity(from, to) × t_from)
      rec.type[from].headcount −= 1
      rec.type[to] 按 4.4.2 的方式加权并入 t'
```
✅ 总纲 §4.2：换装后专有练度 = 原值 × 相似度系数；不单设换装期（换装后的战斗力下降直接由练度体现）。

#### 4.4.4 升级改装 `OnModelUpgraded(item, from, to, retention)`（11 §4.6 发出）
同 4.4.3，但相似度用 11 给的 `retention`（`UpgradePath.typeSkillRetention`，缺省 0.8）代替 `Similarity(from, to)`。

#### 4.4.5 归属变更 `OnSkillHolderChanged(bn, oldHolder, newHolder)`（01 永久调动、组建编组时发出）
```text
对 bn 内每个专业 s：n_s = bn 中该专业在位人数；对每个型号 m：n_sm
   旧归属：headcount −= n_s，type[m].headcount −= n_sm（均值不变）
   新归属：以旧归属的均值 (G_old, T_old[m]) 批量加入 n_s / n_sm 人（4.4.2 的批量公式）
```

#### 4.4.6 每小时人数对账（H1，防止漏事件）
从名册重算每个 `(holder, s)` 的 `headcount` 与每个 `type[m].headcount`。若重算值 **大于** 记录值（有人没走 `JoinSquad` 就进来了）：差额按 `(NewcomerFloorG, TypeSkillFloor)` 并入，并在调试日志里记一条“漏事件”；若小于：直接改为重算值（均值不变）。正式版本里此日志应为 0 条（§9 V-07）。

### 4.5 查询 `GetSkill`

```csharp
// 00 §7 约定的签名：03/05/08 只读
SkillValue GetSkill(FormationId formation, SpecialtyHandle s, ModelHandle m)
    => GetSkill(new SkillHolderKey(false, formation.value), s, m);
SkillValue GetSkillForBattalion(OrgUnitId bn, SpecialtyHandle s, ModelHandle m)   // 推荐：自动解析独立营
    => GetSkill(HolderOfBattalion(bn), s, m);

SkillValue GetSkill(SkillHolderKey h, SpecialtyHandle s, ModelHandle m) {
    if (!Skill.TryGet((h, s), out var rec)) return new(NewcomerFloorG, TypeSkillFloor);
    return new(rec.general, TypeOf(rec, m));
}
double TypeOf(SkillRecord rec, ModelHandle m) {
    if (rec.type.TryGetValue(m, out var e) && (e.headcount > 0 || e.value > 0)) return e.value;
    // 没有直接经验：取已有条目里“相似度 × 练度”的最大值（替代装备、缴获装备的情形）
    double best = TypeSkillFloor;
    foreach (var e2 in rec.type.Values)                         // SortedDictionary：按型号句柄升序
        best = Math.Max(best, Similarity(e2.model, m) * e2.value);
    return best;
}
```
- ✅ 替代装备“型号专有练度按老型号算”（总纲 §3.3）：03 传入的 `m` 就是实际操作的老型号，自然取老型号的条目。
- **代岗**（人不是这个岗位的专业，例如步兵操作迫击炮，总纲 §9.12(2)）：`GetSkillOffSpecialty(h, personSpecialty, slotSpecialty, m)`：
  - `general` = 本人专业的通用练度；
  - `type` = 同一训练体系（`school` 相同）→ `OffSpecialtySameSchool × TypeOf(slot 专业记录, m)`；否则 → `TypeSkillFloor`。
- **营平均**（05 伪装/侦察用）：`UnitAverageGeneral(bn) = Σ_s n_s × G_s / Σ n_s`（按营内在位人数加权，s 按句柄升序累加）；`UnitAverageType(bn, specialties)` 同理取各人操作型号的专有练度。
- 结果每小时变化一次；调用方可缓存到下一个 `Calendar` 小时步。

### 4.6 日常训练（总纲 §4.3 🟡）

#### 4.6.1 训练强度
`I(h) = overrideIntensity ?? 11.BudgetAllocation.trainingIntensity`；`refit == true` 时 `I = max(I, High)`。（11 在预算不足时会自动下调全国强度，11 §4.2。）

**参与训练的比例** `share(h)` = 归属内**不在战斗中**（09 `IsInBattle(bn) == false`）且不在整编中、战备等级不是 `Cadre`（骨干营人员只做保管，P-13）的营的在位人数 / 归属在位总人数。

#### 4.6.2 资源请求（H3）
对每个归属 h（按 key 升序），`f` 为实际满足率：
```text
// 弹药（11 §4.3：每个编组每年 TrainAmmoBasisPerYear[I] 个基数，从库存扣）
basis   = 06.ComputeBasis(h 对应的编组)                       // 每种弹药 ItemKey → 每基数发数
for each (k, q) in basis（ItemKey 升序）:
    req_k = q × TrainAmmoBasisPerYear[I] × share / 8760
    got_k = 06.ConsumeForTraining(编组, k, req_k)            // P-18：需要 06 返回实际扣减量
fAmmo = Σ got_k × mass_k / Σ req_k × mass_k                   // 按质量加权；Σreq = 0 → 1

// 车辆训练小时与燃油
for each 归属内参与训练的营里、status == Active、有 MobilityProfile 的装备 item（id 升序）:
    hours = TrainVehicleHoursPerYear[I] / 8760
    item.usageHours += hours                                  // 07 据此算故障、消耗备件（07 另乘 11 的 TrainWearFactor[I]）
    fuelL += hours × TrainAvgSpeedKph × mobility.fuelRoadLPer100Km / 100 × mobility.offroadFuelMult
reqFuelT = fuelL × 06.FuelDensityTPerL(fuelType)
gotFuelT = 06.ConsumeForTraining(编组, ItemKey(Fuel, fuelType), reqFuelT)
fFuel = reqFuelT > 0 ? gotFuelT / reqFuelT : 1

f = min(fAmmo, fFuel);  lastFulfillment = f
```
- 训练费（非弹药，人头费）由 11 按 `TrainCostPerHeadYear[I]` 计费，本文件提供人数。
- 独立营归属（`isBattalion`）用该营作为“编组”参数调用 06（06 按营所在方向仓库扣）。

#### 4.6.3 练度更新（H4）
```text
capG = CapG[Minimal] + f × (CapG[I] − CapG[Minimal])          // 资源不足 → 有效上限下降（P-06）
capT = CapT[Minimal] + f × (CapT[I] − CapT[Minimal])
对每个 SkillRecord rec（按 (holder, specialty) 升序）：
    if rec.headcount == 0: continue
    rG = (rec.general < capG) ? 1 / TauUpG[I] : 1 / TauDownG
    rec.general += share × (capG − rec.general) × rG × dtD
    对每个 e in rec.type.Values（e.headcount > 0）：
        rT = (e.value < capT) ? 1 / TauUpT[I] : 1 / TauDownT
        e.value += share × (capT − e.value) × rT × dtD
```
- 训练只把练度拉向“该强度能维持的水平”：高于上限的（打过仗的老兵）会慢慢回落到上限（衰减），低于上限的慢慢上升。
- 战斗中的营（`share` 不含）既不训练也不衰减。
- 每次更新后 clamp 到 [0, 1]。

#### 4.6.4 平衡点（界面 F2、F6 的透明数字）
有人员轮换时（义务兵退役、合同兵离队后由学校毕业生补入），归属平均通用练度的长期平衡点：
```text
X* = (cap / τ + ρ × X0) / (1 / τ + ρ)
   cap = CapG[I]；τ = TauUpG[I]（天）；ρ = 每天轮换比例 = 1 / 平均服役天数；X0 = 补入者练度
```
例：`Normal`（cap 0.6，τ 240 d），义务兵服役 24 个月（ρ = 1/730），补入练度 0.3 → `X* = (0.0025 + 0.000411)/(0.0041667 + 0.0013699) = 0.526`；合同兵平均服役 5 年（ρ = 1/1825），补入 0.4 → `X* = 0.577`。这就是“义务兵制 vs 职业兵制”在练度上的差别（§18.11），界面直接显示。
时间预测：无轮换时 `X(t) = cap − (cap − X(0)) × exp(−share × t / τ)`（只用于显示，`DMath.Exp`）。

### 4.7 实战经验（H2）

03 在每个 `Engagement` 结束时、04 在每个条带步为火力单位（炮兵、防空、无人机班）提交报告，进入本小时队列：
```csharp
public readonly record struct CombatExperienceReport(
    OrgUnitId battalion, SpecialtyHandle specialty, ModelHandle model,   // model = 该专业操作的型号，0 = 无
    int survivors,                                                        // 片段结束时仍在位的人数
    double contactMinutes);                                               // 人均交战分钟数（03 定义统计口径）
```
H2 按（营 id, 专业句柄, 型号句柄）升序处理：
```text
rec  = Skill[HolderOfBattalion(battalion), specialty]
k    = min(1, CombatGainPerHourG × contactMinutes / 60)
dG   = k × (CombatCap − rec.general)                       // 个人增量（期望值）
rec.general += (survivors / max(1, rec.headcount)) × dG     // 摊到归属平均
（专有练度同理，用 CombatGainPerHourT，作用于 rec.type[model]；model = 0 时作用于专业技能条目）
rec.lastCombatAt = now
```
- 一个归属下多份报告依次累加（顺序固定，见上）。
- `survivors / headcount > 1`（数据错误）时截断为 1。

### 4.8 训练学校（总纲 §4.3 ✅：按专业受产能限制）

#### 4.8.1 需求与缺口
```text
required[s]   = Σ_本国营 01.PersonnelRequirement(bn)[s] × TierPersonnelFill(bn.tier, s)     // 平时目标
have[s]       = 在班人数 + 07 待编池中该专业人数 + TrainedPool[s] 人数 + 在训人数
discharging[s]= 未来 course_days 天内到期退役的义务兵人数（预判，避免断档）
shortfall[s]  = max(0, required[s] − have[s] + discharging[s])
```

#### 4.8.2 招训（D3，每天）
```text
对每所学校（按 (country, school) 升序）：
    sch.intakeAccumulator += sch.capacityPerYear / 365
    n = floor(sch.intakeAccumulator); sch.intakeAccumulator −= n
    if n == 0: continue
    候选专业 = 该体系下 shortfall > 0 的专业；权重 w_s = shortfall[s] × priorityWeight[s]
    if 无候选: 把 n 退回 intakeAccumulator（上限 = 一天产能，多余作废），continue
    分配 n_s：按 w_s 比例取整，余数按小数部分降序、平局按专业句柄升序（最大余数法）
    对每个 n_s > 0：拆分服役类型（§4.8.3），生成 SchoolCohort(startAt = now, graduateAt = now + 课程天数)
```

#### 4.8.3 服役类型拆分（P-10）
- 学校 `officer` → 全部 `Officer`。
- 其他学校：`cs = 11.ConscriptionSystem.contractShare`；`sch.contractAccumulator += n_s × cs`；`nContract = floor(contractAccumulator)`，累加器减去它；`nConscript = n_s − nContract`。
- `conscription == false` → 全部 `Contract`。
- 义务兵受年度上限：`nConscript ≤ annualIntakeCap − conscriptsDrawnThisYear`，超出部分不招（产能闲置并在 F5 提示“征兵上限”）。1 月 1 日清零 `conscriptsDrawnThisYear`。
- 合同兵人数不设上限（受预算约束：11 按人头付费）。🟡 P-10
- 课程天数：义务兵用 `conscript_course_days`，其他用 `course_days`；战时速成（D5）× `WartimeCourseFactor`。

#### 4.8.4 毕业（D1）
```text
cohort.graduateAt ≤ now → TrainedPool[(country, specialty, serviceType)] 并入 cohort.count 人：
    g = GraduateG[serviceType] × (accelerated ? AcceleratedSkillFactor : 1)
    t = GraduateT[serviceType] × (accelerated ? AcceleratedSkillFactor : 1)
    tModel = SchoolModel(country, specialty)
    按人数加权并入池的 (general, type)；池的 typeModel 不同时：先把旧池 type 换算到新 tModel（× Similarity）再加权
义务兵服役期从入伍（招训）起算。人员池不保存个人入伍时刻，因此从池中取出义务兵时设 `serviceEndTime = now + termMonths × 30.4375 天 − conscript_course_days`（近似：视为刚毕业）。
```
**学校型号** `SchoolModel(country, s)`：本国所有 `EquipmentItem`（含库存）中、类别在 `Operates(s)` 内、件数最多的型号（平局按句柄升序）；`Operates(s)` 为空 → 0。每天 D1 前重算。
> 这就是总纲 §6 第 1 条的机制：型号越杂，学校按“主力型号”培训，毕业生分到少数型号的部队时专有练度要再乘相似度。

#### 4.8.5 产能扩建
- 玩家下单：`ExpandSchool(country, school, ΔcapacityPerYear)` → 11 建设项目（费用 `SchoolExpansionCostMusdPerSeat × Δ`，工期 `SchoolExpansionDays`）；完工时 `capacityPerYear += Δ`。
- 训练学校的运行费含在 11 的训练费里。

#### 4.8.6 人员池出口（给 07）
```csharp
// 07 的补充分配（平时补员与战时补充都走这里）调用
List<PersonnelId> DrawFromTrainedPool(CountryId c, SpecialtyHandle s, int n, ServiceType? prefer = null);
// 生成 n 个 PersonnelRecord（squad = 0），每人写 CarriedSkillState = 池的 (general, type, typeModel)；池 count −= n
// 服役类型优先顺序：prefer → Contract → Conscript → Officer（仅当 s 属于 officer 体系）
// 随后 07 对每人调用 JoinSquad(person, squad)
int TrainedPoolAvailable(CountryId c, SpecialtyHandle s);   // 01 传导提示用
```

### 4.9 岗位、在编比例与名册填充

#### 4.9.1 战备等级的人员在编比例 `TierPersonnelFill(tier, s)`（总纲 §3.4 ✅）

| 专业所属体系 | Active | Reduced | Cadre |
|---|---|---|---|
| `officer`、`nco` | 1.0 | 1.0 | 0.6 |
| 技术专业：`armor, mech, artillery, air_defense, sensor, uav, ew, signal, engineer, maintenance, aviation, jtac, medical` | 1.0 | 0.7 | 0.15 |
| 其他（`infantry, motor, logistics, recon, sniper, staff, mp, cbrn, special_forces, intel`） | 1.0 | 0.5 | 0.05 |

全部 `confidence: estimated`（量级依据：苏式简编部队平时约 50–70%、骨干部队约 10–25% 在编，以军官和技术骨干为主；P-13）。营的平时目标人数 `= Σ_s ceil(满编[s] × fill − 1e-9)`。

#### 4.9.2 班内岗位表
- 班模板 `personnel` 按 `(fill_priority, 专业句柄)` 升序展开成岗位列表，第 k 个岗位 `positionIndex = k`。
- 缺省 `fill_priority`：`squad_leader, officer, tank_commander, vehicle_commander` = 0；`tank_gunner, vehicle_gunner, tank_driver, vehicle_driver, tank_loader` 及其他 `crew_of` 非空的专业 = 1；`mg_gunner, at_gunner, automatic_rifleman, mortarman, artilleryman, rocket_artilleryman, ad_crew, manpads_gunner, signaler, medic` = 2；其余 = 3。
- 营内“下一个要填的空岗”的顺序：班的 `role`（Hq → Line → Support → EquipmentPool）→ 01 的营内填充方式（`Consolidate` 按班 DFS 顺序；`KeepStructure` 按连轮转，01 §4.8.5）→ 班内 `positionIndex` 升序。
- 降级（如 Active → Reduced）时多出的人：按上述顺序的**逆序**离岗，进入 07 待编池（职业兵）或提前退役进预备役（义务兵）。

#### 4.9.3 试验场快速填充（阶段 0）
`FillRosterFull(squad, preset)`：为每个岗位创建 `PersonnelRecord`（serviceType = Contract），对该营建立临时归属 `SkillHolderKey(true, bn)`，练度取预设：

| 预设 | general | type |
|---|---|---|
| `Green` | 0.30 | 0.30 |
| `Regular` | 0.55 | 0.60 |
| `Veteran` | 0.75 | 0.80 |
| `Elite` | 0.90 | 0.90 |

### 4.10 义务兵退役与预备役池（总纲 §18.11）

#### 4.10.1 退役（D2）
```text
if 本国 MobilizationLevel ≥ Partial（11）: 暂停全部退役（P-11），跳过
否则对本国所有 serviceType == Conscript 且 serviceEndTime ≤ now 的人（按 id 升序）：LeaveSquad(p, Discharge)
合同兵自然离队：每天按 ContractAttritionPerYear / 365 的比例（对每个 (holder, s) 计算期望人数，累加器取整，从岗位逆序挑人）离队，同样进预备役池
```

#### 4.10.2 进入预备役池
退役者以所在归属的 `(rec.general, TypeOf(rec, m))` 并入 `ReservePool[(country, s)]`（加权平均；池 `typeModel` 不同时按 4.8.4 的方法换算）。

#### 4.10.3 老化（D4）
```text
pool.general −= (pool.general − ReserveFloorG) × dtDay / (ReserveDecayYears × 365)
pool.type    −= (pool.type    − TypeSkillFloor) × dtDay / (ReserveDecayYears × 365)
pool.count   −= pool.count × ReserveAttritionPerYear / 365      （累加器取整；表示超龄退出预备役）
```

#### 4.10.4 与 11 同步（D5）
`11.ConscriptionSystem.reservePool = Σ_s pool.count`；`reserveGeneralSkill = Σ count × general / Σ count`（Σ = 0 时保持原值）。**本文件是这两个字段在开局之后的唯一写入者**（P-12）。
开局初始化：14 给出 `reservePool` 与 `reserveGeneralSkill`；按本国满编人员需求的专业比例（`Σ_bn 01.PersonnelRequirement`）拆到各专业（最大余数法），各专业练度 = `reserveGeneralSkill`，专有练度 = `reserveGeneralSkill × ReserveTypeRatio`，`typeModel = SchoolModel`。

### 4.11 动员到位（总纲 §3.4；命令与时间曲线归 11 §4.8.2）

11 每小时给出 `MobilizationTarget(bn, s, t)`（该营该专业到时刻 t 应**新增到位**的人数，线性曲线；终值 = 满编 − 动员令下达时的在位人数，由 11 按 01 的满编需求计算，P-21）。H5：
```text
对本国营（id 升序）、专业（句柄升序）：
   due = floor(MobilizationTarget(bn, s, now) + 1e-9) − (本次动员已到位人数)   // 目标是连续值，向下取整
   while due > 0：按来源顺序取一人（P-14）：
     1. ReservePool[s]                  → serviceType Reservist，练度 = 池值
     2. 同一训练体系其他专业的预备役池    → Reservist，本人专业 = 池的专业（代岗，03 用 GetSkillOffSpecialty）
     3. infantry 体系预备役池（rifleman 优先）→ Reservist，代岗
     4. allowVolunteers → 新建 Volunteer：general = VolunteerG，type = TypeSkillFloor，专业 = 岗位专业
     5. 都没有 → 停止，F8 显示“缺 N 人”
     放入该营下一个空岗（§4.9.2）：JoinSquad(p, squad)
```
- 动员入列的人员 `serviceEndTime = MaxValue`；复员（11 降低动员等级）时 `Reservist/Volunteer` 按岗位逆序 `LeaveSquad(Discharge)` 回预备役池（志愿者也进入预备役池，带着练度）。
- 到位后的整训没有特殊规则：营不在战斗中就按 §4.6 训练（骨干营动员后 `tier` 已由 11/01 改为 Active，`share` 计入）。界面显示“预计 N 天后通用练度达到 X”。

### 4.12 给 11 的人数统计
`HeadcountByPayCategory(country)`：遍历本国名册（含 `squad = 0` 但未阵亡的人），按 §3.3 映射累加；专业属于 `officer` 体系的 Contract/Conscript 一律计为 `Officer`。11 年初取快照、每小时取当前值（11 §4.2.5）。

### 4.13 伞降资格（总纲 §15.1 🟡）
- 学校 `airborne`（`qualification_only`）：招训对象是**已在班里**、所在营模板 `branch ∈ {LightInfantry, SpecialForces, Recon}` 的未取得资格人员；按产能每天抽取（营 id、人 id 升序），课程期间人员仍留在班里（简化：不影响该营的战备与训练 `share`）。毕业：`airborneQualified = true`。
- 给 08：`AirborneQualifiedShare(bn) = 有资格在位人数 / 在位人数`。

---

## 5. 常数表

全部放在 `data/tuning/02_personnel.yaml`（G-15）。练度类常数无量纲 [0,1]（G-09）。

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `SimUpgrade` | 0.8 | — | 0.7–0.9 | 总纲 §4.2 表“同一型号的升级版 0.7–0.9” |
| `SimSameBloc` | 0.5 | — | 0.4–0.6 | 总纲 §4.2“同一系列、同一国家的设计体系 0.4–0.6” |
| `SimCrossBloc` | 0.15 | — | 0.1–0.2 | 总纲 §4.2“同类但不同体系 0.1–0.2” |
| `SimSovietChinese` | 0.25 | — | 0.15–0.4 | 估算：早期中国装备源于苏式 |
| `SimilarityFloor[small_arms / c4i]` | 0.5 / 0.5 | — | 0.3–0.8 | 估算：枪械、电台换型快 |
| `TypeSkillFloor` | 0.05 | — | 0–0.1 | 约定：完全陌生型号的最低值 |
| `NewcomerFloorG` | 0.15 | — | 0.1–0.25 | 约定：无记录者的通用练度 |
| `OffSpecialtySameSchool` | 0.5 | — | 0.3–0.7 | 估算：同训练体系代岗 |
| `CapG[Minimal/Low/Normal/High]` | 0.25 / 0.45 / 0.60 / 0.75 | — | 各 ±0.1 | 平衡：`Normal` 的义务兵军队平衡点约 0.5（§4.6.4）；实战可到 `CombatCap` |
| `CapT[Minimal/Low/Normal/High]` | 0.20 / 0.45 / 0.65 / 0.80 | — | 各 ±0.1 | 平衡 |
| `TauUpG[Minimal/Low/Normal/High]` | 365 / 300 / 240 / 180 | d | ×0.5–2 | 估算：通用素养需要一两年 |
| `TauDownG` | 730 | d | 365–1460 | 估算：衰减慢于增长 |
| `TauUpT[Minimal/Low/Normal/High]` | 180 / 120 / 90 / 60 | d | ×0.5–2 | 估算：熟悉一个型号需要几个月 |
| `TauDownT` | 365 | d | 180–730 | 估算 |
| `TrainVehicleHoursPerYear[Minimal/Low/Normal/High]` | 20 / 60 / 120 / 200 | h/车/年 | ×0.5–2 | 估算；`confidence: estimated` |
| `TrainAvgSpeedKph` | 15 | km/h | 10–25 | 估算：训练场平均速度 |
| `TrainAmmoBasisPerYear[...]` | 见 11（0.05 / 0.15 / 0.3 / 0.6） | 基数/编组/年 | — | 11 常数，本文件只引用 |
| `CombatGainPerHourG` | 0.01 | 1/h | 0.003–0.03 | 估算：几十小时实战显著提高练度；V-02 校准 |
| `CombatGainPerHourT` | 0.015 | 1/h | 0.005–0.04 | 估算 |
| `CombatCap` | 0.95 | — | 0.85–1.0 | 约定 |
| `GraduateG/T[Conscript]` | 0.30 / 0.30 | — | 0.2–0.4 | 估算 |
| `GraduateG/T[Contract]` | 0.40 / 0.40 | — | 0.3–0.5 | 估算 |
| `GraduateG/T[Officer]` | 0.45 / 0.40 | — | 0.35–0.55 | 估算 |
| `WartimeCourseFactor` | 0.5 | — | 0.3–0.8 | 估算：战时速成班 |
| `AcceleratedSkillFactor` | 0.8 | — | 0.6–0.95 | 平衡 |
| `SchoolExpansionDays` | 365 | d | 180–730 | 估算 |
| `SchoolExpansionCostMusdPerSeat` | 0.02 | Musd/（人·年产能） | 0.005–0.05 | 估算；`confidence: estimated` |
| `ContractAttritionPerYear` | 0.15 | 1/年 | 0.08–0.25 | 估算：合同兵平均服役约 6–7 年 |
| `ReserveFloorG` | 0.2 | — | 0.1–0.3 | 估算 |
| `ReserveDecayYears` | 5 | 年 | 3–10 | 估算 |
| `ReserveAttritionPerYear` | 0.07 | 1/年 | 0.04–0.12 | 估算：预备役义务约 15 年 |
| `ReserveTypeRatio` | 0.6 | — | 0.3–0.9 | 估算：开局预备役专有练度 / 通用练度 |
| `VolunteerG` | 0.15 | — | 0.05–0.3 | 估算：无服役经历的志愿者 |
| `TierPersonnelFill` | 见 §4.9.1 表 | — | ±50% | 估算（苏式简编/骨干部队量级），P-13 |
| 试验场预设 | 见 §4.9.3 表 | — | — | 约定 |

---

## 6. 与其他系统的接口

### 6.1 本系统提供

| 函数 / 数据 | 调用方 | 时机 |
|---|---|---|
| `SkillValue GetSkill(FormationId, SpecialtyHandle, ModelHandle)`、`GetSkillForBattalion(OrgUnitId, …)`、`GetSkillOffSpecialty(…)` | 03（`0.4 × general + 0.6 × type`）、05、08 | 片段创建时；每小时可缓存 |
| `UnitAverageGeneral(OrgUnitId)`、`UnitAverageType(OrgUnitId, specialties)` | 05（伪装、侦察）、01（指挥部练度 `G_hq`） | 每 Exposure 步 / 每小时 |
| `double Similarity(ModelHandle, ModelHandle)` | 01（替代顺序）、07（缴获装备）、13（换装预估） | 按需 |
| 名册：`RosterState`、`PersonnelRecord`、`PresentCount(SquadId)`、岗位表 | 01（指挥部人数）、03、07 | 按需 |
| `TierPersonnelFill(tier, specialty)` | 01（传导提示）、11（动员终值） | 按需 |
| `TrainedPoolAvailable(country, specialty)`、`DrawFromTrainedPool(...)` | 01、07 | 按需（07 每小时补充） |
| `JoinSquad(PersonnelId, SquadId)`、`LeaveSquad(PersonnelId, DetachReason)` | 07（补充、后送、归队、重组）、11（复员） | 事件 |
| `HeadcountByPayCategory(country)` | 11（人员费） | 年初、每小时 |
| 训练强度覆盖、学校状态、缺口、毕业预测 | 13 | 界面 |
| 写 11：`ConscriptionSystem.reservePool`、`reserveGeneralSkill` | 11 | 每天 D5 |
| `AirborneQualifiedShare(OrgUnitId)` | 08 | 按需 |
| 学校扩建请求 `ExpandSchool(...)` → 11 建设项目 | 11 | 玩家下令 |

### 6.2 本系统使用

| 来源 | 数据 / 函数 | 用途 |
|---|---|---|
| 01 | 编制树、`ItemsOf(squad)`、`GetMaintenanceOrg(bn)`（= 练度归属）、`PersonnelRequirement(bn)`、营 `tier`、营内填充顺序；事件 `OnCrewModelChange`、`OnSkillHolderChanged`、`OnBattalionCreated/Removed` | 归属、岗位、换装 |
| 03 | `CombatExperienceReport`（片段结束） | 实战经验 |
| 04 | `CombatExperienceReport`（条带步，火力单位） | 实战经验 |
| 06 | `ComputeBasis(FormationId)`、`ConsumeForTraining(FormationId, ItemKey, qty)`（需返回实际扣减量，P-18）、`MobilityProfile`、`FuelDensityTPerL(fuelType)` | 训练消耗 |
| 07 | `CasualtyState`、待编池人数、是否后送；`refit` 状态（整建制轮换） | 人数、训练 |
| 09 | `IsInBattle(bn)` | 训练 share |
| 11 | `TrainingIntensity`、`ConscriptionSystem`（`conscription`、`termMonths`、`annualIntakeCap`、`contractShare`）、`MobilizationLevel`、`MobilizationTarget(bn, s, t)`、`OnModelUpgraded(..., retention)` | 训练、征召、动员、升级 |
| 14 | 各国学校产能、开局预备役、开局练度（按编组 × 专业，或全国统一值） | 开局 |

### 6.3 时机（与 00 §5.2 一致）
- `Calendar`（30）每日 D1–D5、每小时 H1–H5，排在 11 之后、07 之前（09 §5）。
- 事件类原语在调用方所在阶段即时执行（如 07 在 `DamageRepair`（130）调用 `LeaveSquad`）。
- 03/04 的经验报告排队，在下一次 H2 结算（避免同一刻内改动被 03 读到）。

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| `SkillRecord.headcount == 0` | 训练跳过；保留均值作为“记忆”；新人加入时按 0 权重覆盖 |
| 查询不存在的 (holder, specialty) | 返回 `(NewcomerFloorG, TypeSkillFloor)` |
| 型号 0 或类别不同 | 相似度 0（除非显式规则） |
| 旅被撤销 / 营调出旅 | 01 发 `OnSkillHolderChanged`，按 §4.4.5 搬迁 |
| 营全灭 | 07 对每人 `LeaveSquad(Casualty)`；记录保留 |
| 学校产能为 0 | 不招训；F5 提示 |
| 某专业不属于任何已知学校 | 加载 Error（`specialties.yaml` 必须写 `school`）；`schools.yaml` 缺该学校时用缺省课程天数 |
| 义务兵年度上限用完 | 义务兵名额为 0，只招合同兵（若 `contractShare > 0`）；F5 提示 |
| `conscription == false` 但剧本给了义务兵 | 开局保留，到期退役后不再补义务兵 |
| 动员时预备役池为空 | 按 §4.11 降级来源；都没有则缺人（11 已提示“无可动员人员”） |
| 动员期间退役 | 暂停（P-11）；复员后第一天积压的到期义务兵一次退役 |
| 资源满足率 `f = 0` | 有效上限 = `Minimal` 上限 → 练度向低水平衰减 |
| 归属内营全部在战斗中 | `share = 0`：不训练、不衰减 |
| 练度超出 [0,1] | 每次更新后 clamp |
| 人员池 `typeModel` 与并入者不同 | 先把池的 type 乘 `Similarity(旧, 新)` 换算到新 tModel，再加权 |
| `CarriedSkillState` 存在很久（长期住院） | 归队时先按 `TauDownG/TauDownT` 向 `ReserveFloorG/TypeSkillFloor` 衰减 `now − detachedAt` 天（显示用公式，`DMath.Exp`） |
| 同一小时多份经验报告 | 按（营, 专业, 型号）升序依次累加 |
| 01 换装事件与 07 补充同一刻 | 事件按发生顺序即时处理；结果与顺序有关但确定（调用方顺序由 00 §5.2 固定） |
| 03 报告 `survivors > headcount` | 比例截断为 1 |

---

## 8. 测试用例

> 型号夹具：`t72b`（mbt, family t72, SUN）、`t72b3`（mbt, family t72, RUS）、`t72a`（mbt, family t72, SUN）、`t90s`（mbt, family t90, RUS）、`ak74`（rifle, SUN）；`m1a2_sepv2`、`ztz99a`、`m4a1` 用现有数据。`bmp2`（ifv, SUN）。

**T1 相似度**
- `t72b↔t72b3 = 0.8`（同谱系）；`t72b↔t90s = 0.5`（同属 Soviet）；`t72b↔m1a2_sepv2 = 0.15`；`t72b↔ztz99a = 0.25`；`ak74↔m4a1 = max(0.15, 0.5) = 0.5`（枪械下限）；`t72b↔bmp2 = 0`（不同类别）；任何型号与自身 = 1。

**T2 换装合并**
- 输入：归属 `tank_gunner`：`type[t72b] = {headcount 93, value 0.62}`；一个营的 31 名炮长换装 `t90s`（无条目）。
- 期望：`type[t90s] = {31, 0.31}`（0.5 × 0.62）；`type[t72b] = {62, 0.62}`；界面的人数加权平均 `(62×0.62 + 31×0.31)/93 = 0.5167`。

**T3 一天训练**
- 输入：`general = 0.4`，`Normal`，`f = 1`，`share = 1`，跑 24 个小时步。
- 期望：`0.6 − 0.2 × (1 − 1/5760)^24 = 0.400832`（误差 ≤ 1e-6）。

**T4 轮换平衡点**
- 输入：`Normal`，义务兵 24 个月，补入 0.3。
- 期望：公式值 `X* = 0.002910959 / 0.005536530 = 0.5258`；用每天退役/补入的离散模拟跑 15 年，归属平均通用练度在 `0.526 ± 0.01` 内。

**T5 资源不足**
- 输入：`Normal`，弹药满足率 0.5，燃油 1.0 → `f = 0.5`。
- 期望：`capG = 0.25 + 0.5 × 0.35 = 0.425`；`capT = 0.20 + 0.5 × 0.45 = 0.425`；`lastFulfillment = 0.5`。

**T6 新兵加入**
- 输入：归属 `rifleman` 300 人、`general 0.55`；100 名毕业生 `general 0.3`。
- 期望：`(165 + 30)/400 = 0.4875`。另：坦克炮长毕业生池 `typeModel = t72b3, type = 0.3`，分到装 `t72b` 的营 → `t' = 0.8 × 0.3 = 0.24`。

**T7 学校招训分配**
- 输入：`armor` 产能 3650/年（每天 10 人），缺口 `tank_commander 10、tank_driver 20、tank_gunner 30、tank_loader 0`，权重 1，`contractShare = 0.25`，累加器 0。
- 计算：比例 1.667 / 3.333 / 5.0 → 取整 1/3/5（9），余 1 给小数最大的 commander → `[commander 2, driver 3, gunner 5]`。服役类型（按专业句柄升序 commander → driver → gunner）：commander：acc 0.5 → 合同 0；driver：acc 0.5 + 0.75 = 1.25 → 合同 1，acc 0.25；gunner：0.25 + 1.25 = 1.5 → 合同 1，acc 0.5。
- 期望：合同兵 `[0, 1, 1]`，义务兵 `[2, 2, 4]`；累加器剩 0.5。

**T8 实战经验**
- 输入：归属 `rifleman` 100 人、`general 0.5`；报告 `survivors 40, contactMinutes 120`。
- 期望：`k = 0.02`，`dG = 0.02 × 0.45 = 0.009`，归属 `+0.4 × 0.009 = 0.0036` → `0.5036`。

**T9 动员到位**
- 输入：骨干营需要新增 300 名 `rifleman`；11 曲线 `MobDaysCadre = 21` → 第 24 小时目标 `300 × 24 / 504 = 14.29`；预备役池 `rifleman` 1000 人、`general 0.4`；归属原有 15 人、`0.6`。
- 期望：到位 14 人（向下取整）；归属 `general = (9 + 5.6)/29 = 0.50345`；池剩 986 人。

**T10 预备役老化**
- 输入：池 `general 0.5`，跑 365 个日步。
- 期望：`0.2 + 0.3 × (1 − 1/1825)^365 = 0.445606`（误差 ≤ 1e-5）。

**T11 无直接经验的型号**
- 输入：归属 `tank_gunner` 只有 `type[t72b] = {50, 0.6}`。
- 期望：`GetSkill(..., t72a).type = 0.48`；`GetSkill(..., m1a2_sepv2).type = max(0.05, 0.15 × 0.6) = 0.09`。

**T12 战备等级在编**
- 输入：骨干营满编 `officer 30、squad_leader 40、rifleman 300、vehicle_gunner 60`。
- 期望：平时目标 `18、24、15、9`（合计 66）。

**T13 退役与冻结**
- 输入：一名义务兵 `serviceEndTime ≤ now`，所在归属 `rifleman` 均值 0.55；预备役池 `rifleman` 1000 人、0.4；无动员。
- 期望：此人离队，池 `(400 + 0.55)/1001 = 0.400150`，1001 人；归属均值不变。若 `MobilizationLevel = Partial` → 不退役，池不变。

---

## 9. 验证建议（Python）

| 编号 | 验证 | 方法 | 通过标准 |
|---|---|---|---|
| V-01 | 练度动力学参考实现 | Python 复现 §4.4、§4.6、§4.10；与平衡点公式、T3/T4/T10 对照 | 误差 ≤ 1e-6（公式）/ ≤ 0.01（离散模拟） |
| V-02 | 练度标定 | 与 03 试验场（V1）联动：同一编制在 `general/type` = 0.3、0.5、0.7、0.9 下对打，看交换比曲线；再反推 `CapG/CapT`、`CombatGain` | 常备 `Normal` 义务兵军队 ≈ 0.5；职业 `High` ≈ 0.7；两者对打交换比落在设计目标（由 03 给出） |
| V-03 | 人力管线是否够用 | 读 14 的亚、阿开局编制与学校产能：每年需新训人数 = Σ义务兵 / 服役期 + 合同兵流失；按学校体系比较产能 | 开局平时状态下缺口能在 1–2 年内补齐；输出每个体系的“补齐天数”报告 |
| V-04 | 2020 动员合理性 | 按 11 的 `MobDays*` 与本文件来源顺序模拟亚美尼亚 2020-09-27 起的动员 | 到位曲线与公开叙述的量级一致（`confidence: uncertain`，只做合理性检查） |
| V-05 | 相似度矩阵审阅 | 打印 MVP 全部型号两两相似度表（按类别分组） | 人工审阅无明显不合理项；需要的写进 `similarity.yaml` |
| V-06 | 训练消耗量级 | 每个旅每年的弹药基数、燃油吨数、车辆小时 × 强度；联合 11 的 `validate_strategic.py` 算训练线占预算比例 | 落在 11 给出的预算结构区间内 |
| V-07 | 事件完整性与守恒 | 跑 10 年无战争模拟：H1 对账日志条数；归属搬迁前后 Σ(人数 × 均值) 守恒 | 对账 0 条；守恒误差 ≤ 1e-9 |
| V-08 | 确定性 | 同种子跑两遍，比较全部 `SkillRecord`、池、名册 | 逐位相同 |

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| P-01 | 练度记录粒度（G-07） | 旅 × 专业；无旅级上级的营 × 专业；配属不改变归属 | 总纲 §4.3；数据量小；与训练产能、维护组织一致 | 统一营 × 专业（§9.3③ 的说法） |
| P-02 | 型号专有练度的键 | (归属, 专业, 型号)；不操作装备的专业用型号键 0 作为“专业技能” | 型号专有练度天然按型号；05 需要侦察兵等的专业练度 | (归属, 专业) 单值，换装时整体打折 |
| P-03 | 相似度推导规则 | 显式表 > 同谱系/升级链 0.8 > 同体系 0.5 > 苏↔中 0.25 > 不同体系 0.15；枪械/电台下限 0.5；跨类别 0 | 直接落实总纲 §4.2 三档；体系由 origin 推导，数据量最小 | 只用显式表；或按 family 层级树推导 |
| P-04 | 离开归属的人暂存练度 | 用 `CarriedSkillState` 暂存（只在离开期间存在） | 实现“伤愈归队保留原练度”（§9.12(4)）；平时仍不按人记练度 | 归队按归属当前均值（伤员归队没有额外价值） |
| P-05 | 训练强度的作用范围 | 全国一个强度（11）+ 可选的编组覆盖；11 按覆盖后的强度计费 | 重点旅/二线旅是真实决策；默认不覆盖不增加负担 | 只有全国一个强度（11 目前的设计） |
| P-06 | 训练资源不足的效果 | 有效上限在 `Minimal` 与所选强度之间按满足率插值 | 连续、透明，“省钱 → 练度下降”（§4.3） | 资源不足时直接降一档 |
| P-07 | 战斗中的训练与经验 | 战斗中的营不训练、不衰减；经验按交战分钟、存活者摊到归属；下一小时结算 | 期望值、可解释；避免同刻读写冲突 | 战斗中照常训练；经验立即结算 |
| P-08 | 学校按什么型号培训 | 本国件数最多的型号 | 让“型号多样性 → 人员难调用”自然出现（§6 第 1 条） | 按毕业生去向型号培训（多样性无人员代价） |
| P-09 | 招训分配 | 按缺口比例（可加权），最大余数法 | 预设接近最优，玩家只需偶尔加权 | 玩家手动配额 |
| P-10 | 合同兵来源 | 不设人数上限，受预算约束；按 `contractShare` 用累加器拆分 | 11 已用 `contractShare` 管理；阶段 1 简单 | 剧本给每年合同兵招募上限 |
| P-11 | 动员期间是否冻结退役 | 冻结（Partial 及以上） | 战时常见做法（亚、阿 2020 均如此，`confidence: estimated`） | 不冻结 |
| P-12 | 预备役池的归属与写入 | 本文件维护按专业的明细，并每天写回 11 的总数与平均练度 | 退役流量、老化都在本文件；11 只需要总量 | 11 维护总量，本文件只读 |
| P-13 | 战备等级在编比例与骨干营训练 | 见 §4.9.1；骨干营平时不参与训练 | 苏式简编/骨干部队的量级；骨干营“只做保管” | 骨干营照常训练（练度高但花钱） |
| P-14 | 动员补缺顺序 | 同专业 → 同体系代岗 → 步兵代岗 → 志愿者 | 让“预备役专业结构”成为可见的问题 | 只用同专业，缺了就缺 |
| P-15 | 志愿者 | 允许（可关），`general 0.15`，按动员预备役计费 | 纳卡 2020 有大量志愿者（`confidence: estimated`） | 不建模 |
| P-16 | 战时速成班 | 课程 × 0.5，毕业练度 × 0.8，玩家开关 | 真实取舍：快 vs 好 | 不提供 |
| P-17 | 更新频率 | 练度、动员每小时；学校、退役、预备役每天 | 与 00 §5.2“时：训练”一致；学校按天足够 | 练度也按天 |
| P-18 | 06 接口 | 请 06 把 `ConsumeForTraining` 改为返回实际扣减量（`double`），并提供 `FuelDensityTPerL` | 训练满足率需要它（06 文字已写“返回实际量”，签名是 `void`） | 先调用 `TryDrawFromNode` 自行汇总 |
| P-19 | 凝聚力 | 阶段 1 不做 | 00 `Cohesion` 🟡、总纲 §9.12(5) | — |
| P-20 | 专业表新增字段 | `operates`、`crew_of`、`pay_category`、`fill_priority` 均可选，缺省表见 §3.1 | 03 需要车组标记；练度需要“谁操作什么” | 写死在代码 |
| P-21 | 动员到位目标的语义 | 11 给“新增到位人数”，终值 = 满编 − 动员时在位 | 避免重复计算已在位人员 | 11 给“总在位人数”目标 |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 服役类型 | `ServiceType` | 义务兵、合同兵、军官、动员预备役、志愿者；映射到 11 的 `PayCategory`。 |
| 练度归属 | `SkillHolderKey` | 练度记录的承载单位：建制旅，或无旅级上级的营（= 01 的维护组织）。 |
| 型号练度条目 | `TypeSkillEntry` | (归属, 专业, 型号) 的人数与专有练度均值；型号键 0 = 专业技能。 |
| 练度值 | `SkillValue` | `GetSkill` 返回的 (通用, 专有) 二元组。 |
| 暂存练度 | `CarriedSkillState` | 人员离开归属期间（后送、待编池、在途）暂存的练度，归队时并入。 |
| 训练人员池 | `TrainedPoolState` / `SkillPool` | 毕业待分配人员的聚合（人数 + 练度均值 + 受训型号）。 |
| 学校型号 | `SchoolModel` | 某专业在本国件数最多的操作型号，学校按它培训。 |
| 学员批次 | `SchoolCohort` | 同日入学、同专业、同服役类型的一批学员。 |
| 预备役池 | `ReservePoolState` | 按专业的预备役人数与练度，随时间老化。 |
| 训练状态 | `FormationTrainingState` | 归属的训练强度覆盖、休整标志、上小时资源满足率。 |
| 训练参与比例 | `share` | 归属内不在战斗、不在整编、非骨干营的在位人员比例。 |
| 实战经验报告 | `CombatExperienceReport` | 03/04 提交的（营, 专业, 型号, 存活人数, 交战分钟）。 |
| 岗位下标 | `positionIndex` | 人员在班模板岗位表中的位置。 |
| 代岗 | `GetSkillOffSpecialty` | 人员操作非本专业岗位时的练度计算。 |
| 设计体系 | `DesignBloc` | 由 origin 推导的装备设计体系（苏式、中式、西方、其他），用于相似度。 |
| 相似度下限 | `SimilarityFloor` | 简单装备（枪械、电台）跨体系相似度的最低值。 |
| 练度预设 | `SkillPreset` | 试验场用的新兵/常备/老兵/精锐练度组合。 |
| 平衡点 | `X*` | 给定训练强度与人员轮换下，归属平均练度的长期稳定值（界面显示）。 |
