# 01 编制模板与编制树

> 依据：总纲 §2、§3、§6、§8、§9.7、§9.11、§5.2（装填模板）、§9.3（编制提醒）、§9.12（缺编原则）。
> 术语、ID、单位以 [00_glossary.md](00_glossary.md) 为准；G-xx 🟡 视为暂定采用。
> 本文件中 🟡 编号为 `O-xx`，汇总在第 10 节。
> 兼容性：本规格**完全兼容**现有 `data/templates/*.yaml`、`data/schema/*.yaml`、`tools/validate_data.py` 的格式；所有新增字段都是**可选**的，旧数据不改也能加载。需要改动现有文件的地方集中列在 §3.9「数据迁移清单」。

---

## 1. 目标与范围

### 1.1 这个系统解决什么问题
1. 把“编制”变成玩家的核心决策：玩家用**班模板 → 上级模板**的嵌套结构设计部队，系统自动算出人员、装备、型号需求（总纲核心循环第一步）。
2. 维护**运行时编制树**：`Formation`（旅/师/集团军/临时编组）→ `OrgUnit`（营/连/排）→ `Squad`（班）→ `EquipmentItem`（装备实例）。其他系统（03 班级模拟、04 条带、07 损伤、09 移动）都从这棵树读数据。
3. 装备**型号绑定**（营 × 类别 → 型号，可继承）、**全军需求汇总**、**装备分配**（平均 / 优先整编 / 一线优先 + 替代装备）。
4. **指挥负荷 / 指挥能力**的计算（给 09 命令延迟、03 协同系数用）。
5. **编制编辑器的自动检查**和**向上传导提示**（总纲 §9.11(3)），以及**按国家风格自动生成排班**（§9.11(1)）。
6. **型号多样性代价**中属于编制侧的部分：维护工具组需求、备件品种线（§6）。
7. 通用的**装填模板**机制（§5.2 垂直发射单元；阶段 3 才用于海军，本文件只定义通用结构）。

### 1.2 阶段划分

| 内容 | 阶段 0（试验场） | 阶段 1（纳卡 MVP） | 阶段 2+ |
|---|---|---|---|
| 模板加载、展开汇总、校验 | ✅ | ✅ | |
| 模板编辑（写时复制、传导提示、自动检查） | ✅ | ✅ | |
| 按风格自动生成排班 | ✅（`sov_legacy`、`pla`、`us` 三种风格） | ✅（加 `arm`、`aze` 可选微调） | 其他风格 |
| 实例化编制树（营、旅模板 → 运行时） | ✅（无地图，单个“国家池”） | ✅ | |
| 型号绑定与继承 | ✅ | ✅ | |
| 装备分配三种策略 + 替代 | ✅（`FrontlineFirst` 退化为 `Even`） | ✅ | |
| 战备等级（装备侧） | — | ✅ | |
| 建制/临时编组、配属 | 仅建制旅 | ✅ | 空军中队/联队行为（08）|
| 指挥负荷 / 能力 | ✅ | ✅ | |
| 多样性代价（工具组、备件线） | 仅显示 | ✅（影响 07 修理） | |
| 装填模板（通用机制） | — | 定义数据结构即可 | 阶段 3 海军使用 |

### 1.3 不包含（由其他规格负责）
- 人员名册、练度、训练、人员在编比例、动员时间 → 02。
- 武器效能、负重计算、能力向量、属性摘要、五渠道数值 → 03（本文件只调用）。
- 满编率、待编池、重组、补充流程 → 07（本文件提供分配算法和槽位结构）。
- 采购、单价、预算、维护费的扣款 → 11（本文件提供数量）。
- 库存的存储与运输 → 06（未发放的整件装备也是 `EquipmentItem`，`holder = 0`，位置记在 `locationNode`，与 11 的“交付时创建 EquipmentItem 进国家库存”一致，见 O-09）。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单（对应总方针第 1、2 条：硬核在选择）

| # | 决策 | 在哪做 | 默认值（预设接近最优） |
|---|---|---|---|
| D1 | 新建 / 修改**班模板**：专业 → 人数，类别 → 槽位数 | 编制编辑器 | 预设库（美式、苏式、解放军式…） |
| D2 | 新建 / 修改**排、连、营模板**：选下级模板和数量（可跨级引用） | 编制编辑器 | 预设库 |
| D3 | **只设计到连**：选连类型 + 风格 + 主要车辆，系统自动生成排和班 | 编制编辑器 | 按国家默认风格 |
| D4 | 旅 / 师 / 集团军**编组模板**（几个营模板 + 指挥部） | 编制编辑器 | 预设库 |
| D5 | 在旅/师上设**默认型号**；在单个营上**覆盖型号** | 部队面板 | 模板里的 `default_bindings` |
| D6 | 全军**分配策略**（平均 / 优先整编 / 一线优先）及优先顺序 | 全军装备面板 | `Even` |
| D7 | 是否允许**替代装备**（按编组开关） | 部队面板 | 允许 |
| D8 | 每个营的**战备等级**（常备满编 / 简编 / 骨干） | 部队面板 | 剧本给定 |
| D9 | 组建**建制编组**（需要指挥部营）或**临时编组**（无指挥部） | 编组面板 | — |
| D10 | 营/旅**配属**到别的编组 | 编组面板（发命令，走 09 命令延迟） | — |
| D11 | 指挥部营/班的规模与通信装备（影响指挥能力） | 通过 D1/D2 实现 | 预设 |
| D12 | 舰艇/发射车的**装填模板**（阶段 3） | 装填编辑器 | 按舰级默认 |

### 2.2 反馈清单（对应总方针第 3 条：数字透明）

| # | 反馈 | 什么时候出现 | 数据来源 |
|---|---|---|---|
| F1 | 模板合计：人数（按专业）、装备（按类别；有绑定时按型号）、单价合计 | 编辑时实时 | §4.2 |
| F2 | **向上传导提示**：本次修改让哪些上级模板、多少个营、全军多少人/装备发生变化；“需要多训练 380 名步兵” | 编辑时实时 | §4.5.3 |
| F3 | **自动检查清单**（超重、职能重复、能力缺口、乘车不匹配、指挥过载、射程越格、缺指挥部…），每条带严重度、原因数字、修改建议 | 编辑时实时 | §4.14 |
| F4 | 五渠道数值（自给能力、减员韧性、负重、乘车适配、弹药）的修改前后对比 | 编辑时实时 | 03 提供，本文件调用 |
| F5 | 全军需求 vs 库存：每个（类别, 型号）的需求、在编、库存、缺口，替代装备数量 | 全军装备面板 | §4.7、§4.8 |
| F6 | 每个营的**型号来源**标签：“营覆盖 / 继承自第 3 旅 / 模板默认 / 国家默认” | 部队面板 | §4.6 |
| F7 | 指挥负荷 / 能力比值，以及它换算成的命令延迟倍率和协同系数 | 部队面板、编辑器 | §4.10 |
| F8 | 多样性面板：每个旅维护多少个“维护组”、工具组套数与缺口、备件品种线数、年维护费 | 全军装备面板 | §4.15 |
| F9 | 分配预览：按当前策略分配后各营各类别的满编率（07 定义满编率，这里给件数） | 点“应用分配”前 | §4.8 |

---

## 3. 数据结构

命名空间：`MoD.Sim.Org`（运行时）、`MoD.Data.Org`（加载）。

### 3.1 枚举

```csharp
// 所有成员显式赋值；只能追加（00 §2.4）。
public enum OrgLevel : byte {
    None = 0, Squad = 1, Platoon = 2, Company = 3, Battalion = 4,
    Brigade = 5, Division = 6, Corps = 7
}   // 数值即“级别高低”，可直接比较大小。数据文件 level: squad … corps。

public enum TemplateRole : byte { Line = 0, Hq = 1, Support = 2, EquipmentPool = 3 }
// 数据 role 字段；缺省 = line。role 可以出现在任何层级（现有数据里有 role: hq 的班、连、营）。

public enum Granularity : byte { Detailed = 0, Aggregate = 1 }   // 数据 granularity；缺省 detailed

public enum Service : byte { None = 0, Army = 1, Air = 2, Navy = 3 }
public enum AirEchelon : byte { None = 0, Squadron = 1, Wing = 2 }   // 空军编组层级（行为见 08）
public enum FormationKind : byte { None = 0, Organic = 1, AdHoc = 2 }
public enum AllocationPolicy : byte { None = 0, Even = 1, PriorityFill = 2, FrontlineFirst = 3 }
public enum ReadinessTier : byte { None = 0, Active = 1, Reduced = 2, Cadre = 3 }

public enum Branch : byte {   // 兵种（用于指挥负荷的“种类多样性”、能力缺口规则、自动生成）
    None = 0, Armor = 1, MechInfantry = 2, MotorInfantry = 3, LightInfantry = 4,
    CombinedArms = 5, Recon = 6, FireSupport = 7, Artillery = 8, AirDefense = 9,
    AntiTank = 10, Engineer = 11, Signal = 12, Logistics = 13, Maintenance = 14,
    Medical = 15, Headquarters = 16, SpecialForces = 17, Aviation = 18, Cbrn = 19,
    Other = 20
}

public enum EquipmentItemStatus : byte {
    None = 0, Active = 1,      // 在编可用
    Stored = 2,                // 在部队驻地封存（骨干营、简编营的部分装备），不计使用小时
    InTransit = 3,             // 从仓库发往部队途中（06 负责运输时长）
    Unserviceable = 4          // 不可用（07 用 VehicleDamageState 细分原因）
}

public enum CommsTier : byte { None = 0, Handheld = 1, Vehicle = 2, Digital = 3 }

public enum CapabilityKind : byte {   // 能力缺口检查用（§4.14.4）
    None = 0, AntiHeavyArmor = 1, AntiLightArmor = 2, AntiFortification = 3,
    IndirectHighAngle = 4, AntiAirLow = 5, Recon = 6, Comms = 7, Medical = 8,
    Breaching = 9, Transport = 10
}

public enum CheckSeverity : byte { None = 0, Info = 1, Warning = 2, Error = 3 }
public enum NodeKind : byte { None = 0, Unit = 1, Squad = 2 }
```

### 3.2 强类型 ID 与句柄

```csharp
// 运行时实体 ID（00 §2.2）：从 1 顺序分配，0 = 空，永不复用。
public readonly record struct FormationId(int value);
public readonly record struct OrgUnitId(int value);      // 排/连/营；“营”在接口里常写作 OrgUnitId（level = Battalion）
public readonly record struct SquadId(int value);
public readonly record struct EquipmentItemId(int value);

// 静态数据句柄：加载时把 snake_case id 按 StringComparer.Ordinal 排序后从 1 编号（00 §2.2）。
public readonly record struct TemplateHandle(int value);
public readonly record struct ModelHandle(int value);
public readonly record struct CategoryHandle(int value);
public readonly record struct SpecialtyHandle(int value); // 定义见 02，这里只引用
public readonly record struct StyleHandle(int value);
public readonly record struct LoadoutTemplateHandle(int value);

public readonly record struct NodeRef(NodeKind kind, int id);  // 编制树里的子节点引用（OrgUnit 或 Squad）
```

### 3.3 静态数据：装备类别与型号（核心字段）

```csharp
public sealed class EquipmentCategory {
    public CategoryHandle handle; public string id; public string name; public string group; // 已有字段
    // ---- 新增可选字段（O-11）----
    public bool isPortable;          // 数据 portable：可由下车人员携行（超重检查只看它）。缺省按 §4.14.1 的默认表
    public bool isCarrier;           // 数据 carrier：能载人（乘车检查只看它）。缺省按默认表
    public CapabilityKind[] provides;// 数据 provides：能力缺口检查的回退表（03 的武器数据就绪后改为由效能推导）
    public string[] roles;           // 数据 roles：职能重复检查的回退表，元素形如 "la_c"（目标类别缩写_纵深带缩写）
    public bool isSupportWeapon;     // 数据 support_weapon：参与职能重复检查（步枪、机枪等“量大”武器为 false）
    public int itemsPerToolset;      // 数据 items_per_toolset：一套维护工具组能保障的件数（§4.15）
}

public sealed class EquipmentModel {   // 01 只定义核心字段；各 Profile 见 00 §4.3
    public ModelHandle handle;
    public string id, name;
    public CategoryHandle category;
    public string family;              // 已有：设计谱系
    public string origin;              // 已有：ISO3 大写
    public int crew;                   // 已有：乘员（缺省 0 = 未知）
    public int capacity;               // 已有：载员（不含乘员）；缺省 −1 = 未知
    public string upgradeOf;           // 新增可选 upgrade_of：本型号是哪个型号的升级版（02 相似度用）
    public string maintenanceGroup;    // 新增可选 maintenance_group：共用维护工具组的型号组；缺省 = family
    public int serviceYear;            // 已规划 service_year（Profile 11 也会读）；缺省 0 = 未知
    public double massKg;              // 整件质量（06 运输、03 负重的回退值）。加载：specs.combat_weight_t × 1000
                                       // → specs.weight_kg → specs.system_weight_kg → 0（未知，06 用类别默认值）
    public bool isDeprecated;
    public Confidence confidence;      // stated / estimated / uncertain
    // specs、ratings、armament 等自由字段保留在 RawSpecs 字典里，各 Profile 规格自己解析。
    public IReadOnlyDictionary<string, object> rawSpecs;
}
```

### 3.4 静态数据：模板（YAML 与运行时）

#### 3.4.1 YAML 格式（**沿用现有格式**，新增字段全部可选）

```yaml
templates:
  # ---- 班模板（唯一直接带人员和槽位的模板）----
  - id: aze_bmp2_mr_sq              # 全局唯一 snake_case；新国家前缀 arm_/aze_（G-12）
    name: BMP-2 摩步班
    level: squad
    role: line                      # line | hq | support | equipment_pool（缺省 line）
    granularity: detailed           # detailed | aggregate（缺省 detailed）
    personnel: {squad_leader: 1, vehicle_gunner: 1, vehicle_driver: 1, mg_gunner: 1, at_gunner: 1, assistant_gunner: 1, rifleman: 3}
    slots: {ifv: 1, rifle: 6, gpmg: 1, reusable_launcher: 1}
    slots_unassigned: {disposable_launcher: 2}
    # ---- 新增可选 ----
    branch: mech_infantry           # 不写则按 §4.3 推导
    weapon_echelon: squad           # squad | platoon | company；超重检查分档，不写则按 §4.14.1 推导
    confidence: estimated
    notes: 示意数据，真实编制由 14 核实。

  # ---- 上级模板（排/连/营/旅/师/集团军）----
  - id: aze_mr_bde_example
    level: brigade
    role: line
    children:                       # 按顺序；顺序决定树的遍历顺序（DFS 顺序）
      - {template: aze_mr_bn_bmp2, count: 3}
      - {template: aze_tank_bn, count: 1}
      - {template: aze_recon_coy, count: 1}   # 跨级引用：旅直接引用连 → 实例化时装进“直属队”营（§4.4.3）
      - {template: aze_mr_bde_hq, count: 1}   # role: hq 的营 = 旅部（总纲 §3.1）
    attached: []                    # 战时加强，不计入合计（已有约定）
    default_bindings: {ifv: bmp2, mbt: t72b}  # 已有：型号继承的起点（§4.6）
    expected_personnel: 0           # 已有：校验用
    expected_equipment: {}          # 已有：校验用
    variant_of: null                # 已有
    unit_ratings: {}                # 已有
    # ---- 新增可选 ----
    branch: combined_arms
    echelon_label: regiment         # 显示用层级名：regiment / defence_region / group 等（O-01）
    style: sov_legacy               # 该模板所属的编制风格（自动生成和预设库分组用）
    generator: null                 # 自动生成的模板才有：{style, archetype, params}（§4.13）
    deprecated: false
```

字段规则（加载时检查，违反为 Error，除非另注）：

| 字段 | 规则 |
|---|---|
| `level` | 必填，七个值之一。 |
| `personnel` / `slots` / `slots_unassigned` | **只允许 `level: squad`**（已有校验）。键必须存在于 specialties / categories；值为正整数。 |
| `children` | **只允许非 squad**。`count` 为正整数。**子模板 level 必须严格低于本模板 level**（新增校验，O-02）。 |
| `role: equipment_pool` | 只允许 squad；不许有 `personnel`。 |
| `role: hq` 且 `level ≥ battalion` | 视为“编组指挥部营”候选（§4.4.2）。 |
| `default_bindings` | 只允许 `level ≥ battalion`；类别和型号必须存在；型号类别 ≠ 键时 Warning（已有）。 |
| `echelon_label` | 只允许 `level ≥ brigade`；自由 snake_case，界面按本地化表显示。 |
| `generator` | 只由系统写入；玩家手动编辑后清空（§4.13.4）。 |

#### 3.4.2 运行时类型

```csharp
public readonly record struct SpecialtyCount(SpecialtyHandle specialty, int count);
public readonly record struct CategoryCount(CategoryHandle category, int count);
public readonly record struct TemplateChild(TemplateHandle template, int count);
public readonly record struct CategoryModel(CategoryHandle category, ModelHandle model);

public abstract class Template {
    public TemplateHandle handle; public string id; public string name;
    public OrgLevel level; public TemplateRole role; public Branch branch; // branch 已推导填好
    public string style; public Confidence confidence;
    public bool isPreset;            // 来自 data/ 的预设模板 = true（只读，O-04）
    public int version;              // 每次编辑 +1；实例记录自己对齐到的版本
    public GeneratorInfo generator;  // 可为 null
}

public sealed class SquadTemplate : Template {
    public Granularity granularity;
    public SpecialtyCount[] personnel;      // 按 SpecialtyHandle 升序
    public CategoryCount[] slots;           // 按 CategoryHandle 升序
    public CategoryCount[] slotsUnassigned; // 按 CategoryHandle 升序
    public OrgLevel weaponEchelon;          // Squad / Platoon / Company；None = 未指定，按 §4.14.1 推导
    public int PersonnelTotal => personnel.Sum(p => p.count);
}

public sealed class UnitTemplate : Template {
    public TemplateChild[] children;        // 保持文件顺序
    public TemplateChild[] attached;        // 不计入合计
    public CategoryModel[] defaultBindings; // 按 CategoryHandle 升序
    public string echelonLabel;             // 可为 null
    public int expectedPersonnel;           // 0 = 未给
}

// 展开合计（§4.2），按模板缓存
public sealed class TemplateTotals {
    public int personnelTotal;
    public SortedDictionary<SpecialtyHandle, int> personnelBySpecialty;
    public SortedDictionary<CategoryHandle, int> slotsByCategory;
    public SortedDictionary<CategoryHandle, int> unassignedByCategory;
    public SortedDictionary<TemplateHandle, int> squadCountByTemplate;  // 每种班模板出现几次
    public bool isComplete;          // 子树里没有缺数据的聚合单位
    public bool usedFallback;        // 人数用 expected_personnel 回填过
}
```

### 3.5 运行时：编制树

```csharp
public sealed class Formation {
    public FormationId id;
    public CountryId country;               // 11 定义
    public Service service;
    public OrgLevel echelon;                // 陆军：Brigade / Division / Corps
    public AirEchelon airEchelon;           // 空军用；陆军为 None
    public string echelonLabel;             // 显示用（regiment 等）；可为 null
    public FormationKind kind;
    public string name;
    public TemplateHandle template;         // 由编组模板实例化时记录；手工组建为 0

    public FormationId organicParentId;     // 建制上级编组；0 = 直属国家
    public FormationId currentParentId;     // 当前上级（配属时 ≠ organic）
    public List<FormationId> childFormations;   // 建制下级编组，按 id 升序
    public List<OrgUnitId> organicBattalions;   // 建制下属营（含指挥部营、直属队营），按 id 升序
    public OrgUnitId hqBattalionId;         // Organic 必须非 0；AdHoc 必须为 0

    // 临时编组专用：成员（只是操作分组，不改变任何建制关系）
    public List<FormationId> adHocMemberFormations;
    public List<OrgUnitId> adHocMemberBattalions;

    public SortedDictionary<CategoryHandle, ModelHandle> defaultBindings; // 玩家设置或模板带来
    public bool allowSubstitution = true;
    public ReadinessTier defaultTier;       // 新建下属营时的默认战备等级
    public int allocationPriority;          // PriorityFill 的排序键，小者优先；缺省 1000
    public bool isLogisticsBrigade;         // 后勤旅用途标记（06 读取）
}

public sealed class OrgUnit {
    public OrgUnitId id;
    public OrgLevel level;                  // Platoon / Company / Battalion
    public TemplateHandle template;
    public int templateVersion;             // 已对齐到的模板版本
    public OrgUnitId parentUnitId;          // 营为 0
    public OrgUnitId battalionId;           // 所属营（营自身 = 自己的 id）
    public List<NodeRef> children;          // 按模板 DFS 顺序
    public string pathKey;                  // 在营内的路径键（§4.4.4），营自身为 ""
    public CountryId country;
    public string name;

    // ---- 以下字段只对营（level == Battalion）有意义 ----
    public FormationId organicFormationId;  // 建制上级编组（可为 0 = 独立营直属国家）
    public FormationId currentFormationId;  // 当前上级（配属时 ≠ organic）
    public FormationId adHocFormationId;    // 所在临时编组（最多一个，O-06）
    public ReadinessTier tier;
    public SortedDictionary<CategoryHandle, ModelHandle> modelOverrides;  // 营级覆盖
    public bool isSyntheticDirect;          // 是否为编组“直属队”合成营（§4.4.3）
    public bool isHqBattalion;              // 是否为某编组的指挥部营
    public SimTime reorganizingUntil;       // 模板变更后的整编截止时刻（§4.5.4）；过去时刻 = 不在整编
}

public sealed class Squad {
    public SquadId id;
    public TemplateHandle template;
    public int templateVersion;
    public OrgUnitId parentUnitId;          // 直接上级（可以是排、连或营——跨级引用）
    public OrgUnitId battalionId;
    public TemplateRole role;               // 从模板复制，便于快速过滤
    public string pathKey;
    public List<EquipmentItemId> items;     // 本班持有的装备实例，按 id 升序
    // 名册 Roster 是 02 的组件：RosterState { SquadId squadId; List<PersonnelId> members; }
}

public sealed class EquipmentItem {
    public EquipmentItemId id;
    public CountryId owner;                 // 所属国家（缴获时由 07 改写）
    public ModelHandle model;               // 11 的升级改装完工时改写（11 §4.6）
    public CategoryHandle slotCategory;     // 占用的槽位类别（= model.category，替代时也相同）
    public bool isUnassignedSlot;           // 占的是 slots_unassigned
    public SquadId holder;                  // 0 = 不在任何班（在库存、在途或在 07 的待编池）
    public NodeId locationNode;             // holder == 0 且在库存时所在的后勤节点（06）；阶段 0 = NodeId(0)“国家池”
    public EquipmentItemStatus status;
    public double usageHours;               // 累计使用小时（02 训练、03/04 作战、07 故障都会累加）
}
// 库存 = 本国所有 holder == 0、status ∈ {Active, Stored}、不在 07 待编池、不在 11 改装厂的 EquipmentItem（O-09）。
// 11 交付时创建（11 H4），11 退役时删除（11 §4.5.4）；本文件只负责发放（holder ← 班）与退回（holder ← 0）。
// 查询加速：维护索引 DepotIndex[(country, model)] → SortedSet<EquipmentItemId>，增删 item 时同步更新。

```

**编制树不变量**（每次结构修改后断言，调试版本每 60 分钟全量检查一次）：
1. 每个 `Squad.parentUnitId` 指向一个存在的 `OrgUnit`，且该 `OrgUnit.children` 含这个班。
2. 每个营恰好属于 0 或 1 个建制编组（`organicFormationId`），并出现在该编组的 `organicBattalions` 中。
3. `Organic` 编组 `hqBattalionId ≠ 0`，且该营 `isHqBattalion = true`；`AdHoc` 编组 `organicBattalions` 和 `childFormations` 为空。
4. 编组的建制父链无环；`echelon` 沿建制父链严格递增（旅 < 师 < 集团军）。
5. `EquipmentItem.holder ≠ 0` 时，该班 `items` 含此装备，且 `slotCategory` 在该班模板的 `slots` 或 `slotsUnassigned` 中存在（超编持有允许，但必须是模板中有的类别）。

### 3.6 型号绑定与需求

```csharp
public enum BindingSource : byte { None = 0, BattalionOverride = 1, Formation = 2, BattalionTemplate = 3, CountryDefault = 4 }

public readonly record struct ResolvedBinding(ModelHandle model, BindingSource source, FormationId fromFormation);

public sealed class ForceRequirementRow {      // 全军需求表的一行
    public CategoryHandle category;
    public ModelHandle model;                 // 0 = 未绑定型号
    public int requiredFull;                  // 按模板满编
    public int requiredPeacetime;             // 按战备等级的平时目标（§4.9）
    public int heldExact;                     // 部队持有的正确型号
    public int heldAsSubstitute;              // 被别的营当替代装备占用的“本型号”件数
    public int depotStock;
    public int Shortfall => Math.Max(0, requiredFull - heldExact - depotStock);
}

public sealed class CountryOrgSettings {      // 每国一份，随存档保存
    public CountryId country;
    public AllocationPolicy policy = AllocationPolicy.Even;
    public List<NodeRef> priorityList;        // PriorityFill 的手动顺序（Formation 或营）；空 = 按 allocationPriority
    public ReorgFillMode fillMode = ReorgFillMode.Consolidate;   // 营内槽位填充方式，见 §4.8.5
    public SortedDictionary<CategoryHandle, ModelHandle> countryDefaults; // 剧本给出（14）
    public string defaultStyle;               // 自动生成默认风格
}
public enum ReorgFillMode : byte { None = 0, Consolidate = 1, KeepStructure = 2 }  // 与 07 的 ReorgPolicy 一一对应
```

### 3.7 指挥负荷与检查结果

```csharp
public sealed class CommandState {            // 组件：每个排/连/营一份
    public OrgUnitId unit;
    public double loadEq;                     // 指挥负荷（无量纲，≥ 0）
    public double capacity;                   // 指挥能力（无量纲，≥ 0）
    public double Ratio => capacity > 0 ? loadEq / capacity : double.PositiveInfinity;
    public double orderDelayMultiplier;       // = max(1, Ratio)，09 的 F_load 再按 FLoadMax 截断
    public double coordinationFactor;         // = min(1, capacity/loadEq)，即 03 的 commandFactor（03 §3.2）
    public CommsTier comms; public int hqHeadcount; public double hqSkill;
    public double quality;                    // [0,1]，09 的 GetCommandQuality（§4.10.4）
    public bool isHeadless;                   // 指挥部失能（§4.10.5），09 的 F_headless
}
// 编组的指挥状态单独存 FormationCommandState { FormationId formation; 其余字段同上 }。
// AdHoc 编组没有指挥状态（不计算，不产生任何效果）。

public sealed class CheckResult {
    public string code;                       // 见 §4.14 代码表，如 "W40_vehicle_capacity"
    public CheckSeverity severity;
    public TemplateHandle template;           // 出问题的模板（编辑器）或 0
    public NodeRef instance;                  // 出问题的实例（运行时）或 default
    public string messageKey;                 // 本地化键
    public SortedDictionary<string, double> numbers; // 消息里的数字（透明）：如 {persons: 9, seats: 7}
    public string suggestionKey;              // 修改建议
}
```

### 3.8 编制风格（自动生成）与装填模板的数据格式
见 §4.13.1 和 §4.16.1。

### 3.9 数据迁移清单（需要改动现有文件或工具的地方）

| # | 文件 | 改动 | 是否破坏兼容 |
|---|---|---|---|
| M1 | `data/schema/categories.yaml` | 每个类别可加 `portable`、`carrier`、`provides`、`roles`、`support_weapon`、`items_per_toolset`；不加时用 §4.14 / §4.15 的默认表 | 否 |
| M2 | `data/schema/categories.yaml` | 新增类别（O-12）：`loitering_munition`（巡飞弹发射单元）、`fpv_drone`（FPV 无人机）、`body_armor`（防弹衣；后三者同 03 C-18）、`tbm_launcher`（战术弹道导弹发射车：飞毛腿、圆点、伊斯坎德尔，纳卡双方都有） | 否 |
| M3 | `data/equipment/*.yaml` | 可加 `upgrade_of`、`maintenance_group`、`service_year` | 否 |
| M4 | `data/templates/*.yaml` | 可加 `branch`、`weapon_echelon`、`echelon_label`、`style`、`deprecated` | 否 |
| M5 | `tools/validate_data.py` | 新增：全局 id 唯一（跨类型）、子模板层级严格更低、`role: equipment_pool` 不许有人员、`default_bindings` 只在营以上、COVERAGE 前缀加 `arm_`/`aze_`、调用 §9 的编辑器检查并输出报告 | 否（只加检查） |
| M6 | 新目录 `data/styles/` | 自动生成风格表（§4.13.1） | 新增 |
| M7 | 新文件 `data/tuning/01_org.yaml` | 本文件第 5 节常数（G-15） | 新增 |
| M8 | 新目录 `data/loadouts/` | 装填模板（阶段 3） | 新增 |

---

## 4. 算法与公式

> 本系统**不使用随机数**（所有算法确定性；平局一律按 ID / 句柄升序裁决，00 §6.4）。
> 集合遍历：模板子节点按文件顺序；其余一律按 ID 升序。

### 4.1 加载（启动时一次；`MoD.Data.Org`）

```csharp
void LoadOrgData() {
    // 1. 读 schema/categories.yaml、schema/specialties.yaml（02）、equipment/*.yaml、templates/*.yaml、styles/*.yaml
    // 2. 全局 id 唯一检查（跨类别/专业/型号/模板/风格），重复 → Error 并拒绝启动（开发版）/跳过后者（模组版）
    // 3. 分配句柄：每类 id 按 StringComparer.Ordinal 排序后从 1 编号
    // 4. 解析模板：未知键忽略（向前兼容），已知键按 §3.4.1 规则检查
    // 5. 层级检查：对每个 children 项，child.level < parent.level，否则 Error E02
    // 6. 环检查：DFS（三色标记），发现环 → Error E01，列出路径
    // 7. 推导 branch（§4.3），预计算 TemplateTotals（§4.2）
    // 8. 所有预设模板 isPreset = true，version = 1
}
```

### 4.2 模板展开合计 `ComputeTotals(t)`

与 `tools/validate_data.py` 的 `totals()` **逐字段一致**（Python 是参考实现，C# 必须对同一数据给出相同数字，见 §9 V-01）。

```csharp
TemplateTotals ComputeTotals(TemplateHandle h) {
    if (cache.TryGet(h, out var c)) return c;
    var t = templates[h];
    var r = new TemplateTotals();
    if (t is SquadTemplate s) {
        foreach (var p in s.personnel) r.personnelBySpecialty[p.specialty] += p.count;
        foreach (var q in s.slots) r.slotsByCategory[q.category] += q.count;
        foreach (var q in s.slotsUnassigned) r.unassignedByCategory[q.category] += q.count;
        r.personnelTotal = s.PersonnelTotal;
        r.squadCountByTemplate[h] = 1;
        r.isComplete = s.personnel.Length > 0 || s.role == TemplateRole.EquipmentPool;
    } else {
        var u = (UnitTemplate)t;
        r.isComplete = u.children.Length > 0;
        foreach (var ch in u.children) {            // attached 不计入
            var sub = ComputeTotals(ch.template);
            r.personnelTotal += sub.personnelTotal * ch.count;
            AddScaled(r.personnelBySpecialty, sub.personnelBySpecialty, ch.count);
            AddScaled(r.slotsByCategory, sub.slotsByCategory, ch.count);
            AddScaled(r.unassignedByCategory, sub.unassignedByCategory, ch.count);
            AddScaled(r.squadCountByTemplate, sub.squadCountByTemplate, ch.count);
            r.isComplete &= sub.isComplete;
        }
    }
    // 聚合回填：子树不完整且本级给了 expected_personnel → 人数用原文总数（专业分布不回填）
    if (!r.isComplete && t is UnitTemplate ut && ut.expectedPersonnel > 0) {
        r.personnelTotal = ut.expectedPersonnel; r.isComplete = true; r.usedFallback = true;
    }
    cache[h] = r; return r;
}
```

- 回填后的人数**只用于显示和预算估算**；人员需求按专业汇总时（给 02），回填出的“缺专业”人数记到虚拟专业 `unspecified`（不训练、不补充，只在界面显示“数据不完整：N 人未细分”）。
- 模板被编辑时，清除该模板及**所有祖先模板**的缓存（祖先 = 反向引用图上可达的模板；反向引用图在加载和每次编辑后重建）。

### 4.3 兵种推导 `InferBranch(t)`

模板写了 `branch` 就用写的；否则：

**班模板**（按顺序判断，第一个成立的为准）：

| # | 条件 | Branch |
|---|---|---|
| 1 | `role == Hq` | `Headquarters` |
| 2 | 有 `mbt` 槽位 | `Armor` |
| 3 | 有 `howitzer_*`、`mrl_*`、`tbm_launcher`、`coastal_ashm_launcher` 槽位 | `Artillery` |
| 4 | 有 `mortar_*`、`sp_mortar_howitzer` 槽位 | `FireSupport` |
| 5 | 有 `sam_*`、`spaag`、`aa_gun_towed`、`c_ram`、`manpads`（且 manpads 是本班唯一武器类） | `AirDefense` |
| 6 | 有 `atgm_vehicle`、`atgm_heavy`、`atgm_portable`、`assault_gun` 槽位，且无 `rifle` | `AntiTank` |
| 7 | 有 `recon_ifv`、`eo_recon_suite`、`radar_battlefield`、`uav_*` 槽位，或专业含 `scout` ≥ 半数 | `Recon` |
| 8 | 专业 `special_operator` ≥ 半数 | `SpecialForces` |
| 9 | 专业 `engineer` ≥ 半数，或有 `engineer_vehicle`/`mine_clearing_vehicle`/`bridge_layer` | `Engineer` |
| 10 | 专业 `signaler` ≥ 半数 | `Signal` |
| 11 | 专业 `medic` ≥ 半数，或有 `armored_ambulance` | `Medical` |
| 12 | 专业 `mechanic` ≥ 半数，或有 `armored_recovery_vehicle` | `Maintenance` |
| 13 | 专业 `supply`/`driver`/`cook` 合计 ≥ 半数，或只有卡车类槽位 | `Logistics` |
| 14 | 有 `ifv`/`apc`/`amphibious_assault_vehicle`，且有步兵专业（`rifleman` 等 infantry 学校） | `MechInfantry` |
| 15 | 有 `light_armored_vehicle`/`mrap`/`truck_*`，且有步兵专业 | `MotorInfantry` |
| 16 | 有步兵专业 | `LightInfantry` |
| 17 | `role == EquipmentPool` 或其他 | `Other` |

“半数”= 该专业人数 × 2 ≥ 班总人数。

**上级模板**：
1. 只看**非 Hq、非 EquipmentPool** 的子节点，按“子节点人数 × count”加权统计各子节点兵种的人数份额。
2. 若本模板 `level ≥ Battalion`，且子节点兵种中出现 `{Armor, MechInfantry, MotorInfantry, LightInfantry}` 里**至少两种**，且这两种的合计份额 ≥ 0.4 → `CombinedArms`。
3. 否则取份额最大的兵种（平局按 `Branch` 数值小者）。
4. 没有合格子节点 → `role == Hq` 时 `Headquarters`，否则 `Other`。

> 例：解放军 `pla_mech_plt`（3 个机步班 + 火力班 + 排部）→ 子节点兵种都是 `MechInfantry` → `MechInfantry`。`pla_heavy_cab`（2 坦克连 + 2 机步连 + 火力连 + 保障连 + 营部连）→ Armor + MechInfantry 合计份额 > 0.4 → `CombinedArms`。

### 4.4 实例化（模板 → 运行时编制树）

#### 4.4.1 营 `InstantiateBattalion(templateH, country, organicFormation, tier)`

```csharp
OrgUnitId InstantiateBattalion(TemplateHandle th, CountryId country, FormationId organic, ReadinessTier tier) {
    var t = (UnitTemplate)templates[th];      // 要求 level == Battalion
    var bn = NewOrgUnit(OrgLevel.Battalion, th, parent: default, pathKey: "");
    bn.battalionId = bn.id; bn.country = country;
    bn.organicFormationId = bn.currentFormationId = organic;
    bn.tier = tier;
    ExpandChildren(bn, t, pathPrefix: "");
    return bn.id;   // 刚创建的营是“空壳”：无人员、无装备。人员由 02 填充，装备由 §4.8 分配。
}

void ExpandChildren(OrgUnit parent, UnitTemplate t, string pathPrefix) {
    var ordinalByTemplate = new SortedDictionary<TemplateHandle, int>();
    foreach (var ch in t.children) {            // 文件顺序
        for (int k = 0; k < ch.count; k++) {
            int ord = ordinalByTemplate.GetValueOrDefault(ch.template); ordinalByTemplate[ch.template] = ord + 1;
            string key = pathPrefix + "/" + templates[ch.template].id + "#" + ord;
            var ct = templates[ch.template];
            if (ct is SquadTemplate) {
                var sq = NewSquad(ch.template, parent.id, parent.battalionId, ct.role, key);
                parent.children.Add(new NodeRef(NodeKind.Squad, sq.id.value));
            } else {
                var u = NewOrgUnit(ct.level, ch.template, parent.id, key);
                u.battalionId = parent.battalionId;
                parent.children.Add(new NodeRef(NodeKind.Unit, u.id.value));
                ExpandChildren(u, (UnitTemplate)ct, key);
            }
        }
    }
}
```

- ID 分配顺序 = 上述 DFS 顺序（00 §2.2 要求确定顺序）。
- 营内的连、排节点 `level` 取其模板的 `level`。

#### 4.4.2 编组 `InstantiateFormation(templateH, country, organicParent)`

```csharp
FormationId InstantiateFormation(TemplateHandle th, CountryId country, FormationId organicParent) {
    var t = (UnitTemplate)templates[th];      // level ∈ {Brigade, Division, Corps}
    var f = NewFormation(echelon: t.level, kind: FormationKind.Organic, template: th,
                         organicParent, currentParent: organicParent, country, label: t.echelonLabel);
    f.defaultBindings = new(t.defaultBindings);   // 模板默认 → 编组默认（玩家之后可改）
    var directChildren = new List<TemplateChild>();   // 低于营的子节点（跨级引用）
    foreach (var ch in t.children) {
        var ct = templates[ch.template];
        for (int k = 0; k < ch.count; k++) {
            if (ct.level >= OrgLevel.Brigade)        // 师引用旅、集团军引用师/旅
                f.childFormations.Add(InstantiateFormation(ch.template, country, f.id));
            else if (ct.level == OrgLevel.Battalion) {
                var bn = InstantiateBattalion(ch.template, country, f.id, f.defaultTier);
                f.organicBattalions.Add(bn);
                if (ct.role == TemplateRole.Hq && f.hqBattalionId.value == 0) { f.hqBattalionId = bn; units[bn].isHqBattalion = true; }
            }
            else directChildren.Add(new TemplateChild(ch.template, 1));
        }
    }
    if (directChildren.Count > 0) f.organicBattalions.Add(CreateSyntheticDirectBattalion(f, directChildren));
    return f.id;
}
```

- 编组模板里有多个 `role: hq` 的营：第一个成为指挥部营，其余当普通营，并出 Warning `E05`。
- 编组模板里没有 `role: hq` 的营：仍按 `Organic` 创建，但 `hqBattalionId` 指向一个**自动补的最小指挥部营**（模板 `sys_min_hq_bn`：1 个 `role: hq` 班，人员 `officer: 2, staff: 4, signaler: 2`，槽位 `radio_handheld: 2`），并出 Error `E04`（编辑器里必须修好；运行时为了不崩溃而兜底）。

#### 4.4.3 直属队合成营（跨级引用的落地方式）🟡 O-03

营是陆军最小控制单位和地图单位（00 §1.1）。编组模板直接引用连、排、班（如苏式团直属的侦察连、工兵连、反坦克连，美式 `us_divarty_hq` 直接引用班）时，这些单位必须挂在某个营上。规则：

- 把编组模板里**所有低于营的直接子节点**，按出现顺序放进**一个**合成营：`isSyntheticDirect = true`、`level = Battalion`、`template = 0`（无模板；它的“目标状态”就是这些子节点的合集）、`name = "<编组名> 直属队"`、兵种按 §4.3 规则对这些子节点推导。
- 合成营 `pathKey` 子节点前缀为 `"/direct"`，路径键规则同 §4.4.4。
- 合成营与普通营完全一样参与地图、条带、补充、指挥负荷（它是编组的一个直接下级）。
- 编组模板被编辑时，合成营按 §4.5.4 重新对齐。

#### 4.4.4 路径键（pathKey）
- 格式：`"/<子模板id>#<同模板序号>"` 逐级拼接，例如 `"/pla_mech_coy#1/pla_mech_plt#0/pla_mech_inf_squad#2"`。
- 序号 = 在同一父节点下、同一个子模板的第几个（从 0 起），**跨不同 children 项累计**（同一模板出现在两个 children 项里时序号连续）。
- 用途：模板修改后的实例对齐（§4.5.4）、存档里的稳定定位、AAR 按班模板拆分。

#### 4.4.5 试验场快速实例化 `InstantiateFull`（阶段 0）
`InstantiateFull(templateH, bindings, skillPreset)`：实例化后立刻按模板 100% 发放装备（直接创建 `EquipmentItem`，不经过库存）和人员（调用 02 `FillRosterFull(squad, skillPreset)`）。只用于 `ProvingGround`（03/13）和测试，不得在战役中调用。

### 4.5 模板编辑

#### 4.5.1 写时复制 🟡 O-04
- 预设模板（`isPreset = true`）只读。玩家修改预设模板时，系统先复制一份玩家模板：`id = "p_" + <国家小写ISO3> + "_" + <自增序号4位>`（如 `p_aze_0007`），`name` 复制原名加“（改）”，`variant_of` = 原模板 id。
- 所有**本国**引用原模板的**玩家模板**，以及本国**实例**（营、编组）是否改指向新模板，由玩家在弹窗中选择：「只改这一处 / 改本国全部引用」。默认 = 改本国全部引用。预设库里的上级模板不受影响。
- 玩家模板存档（15）；可以导出为 YAML（与数据文件同格式，便于分享）。

#### 4.5.2 一次编辑的处理顺序
```csharp
void ApplyTemplateEdit(TemplateEdit e) {
    var before = SnapshotTotalsForAncestors(e.template);        // 祖先模板 + 本国实例的合计
    var beforeChecks = RunChecks(e.template, scope: Ancestors);
    ApplyChange(e); templates[e.template].version++;
    InvalidateCache(e.template);                                // 本模板 + 祖先
    var after = SnapshotTotalsForAncestors(e.template);
    var afterChecks = RunChecks(e.template, scope: Ancestors);
    ShowImpactReport(Diff(before, after), Diff(beforeChecks, afterChecks));   // §4.5.3
    // 实例不立即改；玩家点“确认”后才对实例执行 §4.5.4（编辑器里可以反复试）
}
```

#### 4.5.3 向上传导提示 `ImpactReport`

对被编辑模板 T，列出：
1. **直接影响的模板**：每个祖先模板 A 的合计变化：Δ人数（按专业）、Δ槽位（按类别）。只列有变化的项。
2. **全军影响**：对本国每个使用 T 的营（营模板子树里含 T，或营模板就是 T），汇总：
   - `ΔPersonnel[s] = Σ_营 (after − before)[s] × tierPersonnelFill(营.tier, s)`（02 提供在编比例）
   - `ΔEquipment[(c, model)] = Σ_营 (after − before)[c]`，model 按该营的绑定（§4.6）
3. **需要多训练的人数**：`ΔTrain[s] = max(0, ΔPersonnel[s] − 02.TrainedPoolAvailable(country, s))`。
4. **需要多采购的装备**：`ΔBuy[(c,m)] = max(0, ΔEquipment[(c,m)] − depotStock[m])`，附单价合计（11 `GetUnitCostMusd(m)`）。
5. **新出现 / 消失的检查项**（§4.14），按严重度排序。

显示格式示例（数字全部来自上面的公式）：
> 「BMP-2 摩步班」9 人 → 10 人：影响 3 个上级模板、27 个营；全军步枪手 +11.1%（+243 人在编目标），需要多训练 243 名 `rifleman`（训练池现有 0）；新增 27 条警告「W40 乘车不匹配：班 10 人，BMP-2 可乘 3+7=10 人 → 无剩余座位给排部」……

#### 4.5.4 实例对齐（模板变更落到运行时）`RetargetBattalion(bn)`

```csharp
void RetargetBattalion(OrgUnit bn, SimTime now) {
    var oldNodes = CollectSubtree(bn);                 // pathKey → 节点
    var newShape = BuildShape(templates[bn.template]); // 按 §4.4.1 的规则只算出 pathKey 和模板，不建实体
    // 1. 匹配：pathKey 相同且模板相同 → 保留原节点（人员、装备不动）
    // 2. 旧有新无 → 节点删除；其班里的人员和装备移入营的待编池（07 UnassignedPool）
    // 3. 新有旧无 → 按 DFS 顺序新建空节点（新 ID）
    // 4. 匹配上的班若班模板版本变了（槽位/人员变化）：超出新模板的部分 → 待编池；不足部分留空
    // 5. 按新模板 DFS 顺序重排 children
    // 6. 调用 07.ReorganizeWithinBattalion(bn)：用待编池里的人和装备去填空位（07 规则）
    bn.templateVersion = templates[bn.template].version;
    bool structural = (步骤 2 或 3 发生过);
    bn.reorganizingUntil = structural ? now + RetargetStructuralMs : now;
}
```

- 整编期间（`now < reorganizingUntil`）：营可以移动和防守，但 09 对其命令延迟 × `ReorganizingDelayMult`，03 协同系数 × `ReorganizingCoordinationMult`（理由：真实部队改编需要时间；这也让“临战大改编制”有代价）。
- **正在 `EdgeBattle` 中的营不执行对齐**，排队到它离开战斗（09 通知 `OnBattalionLeftBattle`）后执行。🟡 O-05
- 编组模板变更：新增的营按 §4.4.1 建空壳营；删除的营不自动解散，标记为“编外”（`organicFormationId` 保留，界面提示玩家处理：解散、并入其他营或保留）。理由：解散营会让人员和装备流向何处是玩家决策。

### 4.6 型号绑定解析 `ResolveModel(bn, category)`

✅ 每营每类别只有一个目标型号（总纲 §3.2）。解析顺序（第一个命中的为准）：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | `bn.modelOverrides[c]` | 玩家对这个营单独设的 |
| 2 | 沿**建制**编组链向上：`organicFormation.defaultBindings[c]` → 其 `organicParent` … | 🟡 继承（总纲 §3.2）；**用建制链，不用配属链**（配属不改变型号，O-07） |
| 3 | 营模板的 `default_bindings[c]` | 模板作者的建议 |
| 4 | `CountryOrgSettings.countryDefaults[c]` | 剧本给出（14） |
| 5 | 无 → `ModelHandle(0)` | 需求表里显示为“未指定型号”；分配时**只能用替代**（§4.8.3） |

```csharp
ResolvedBinding ResolveModel(OrgUnit bn, CategoryHandle c) {
    if (bn.modelOverrides.TryGetValue(c, out var m)) return new(m, BindingSource.BattalionOverride, default);
    for (var f = bn.organicFormationId; f.value != 0; f = formations[f].organicParentId)
        if (formations[f].defaultBindings.TryGetValue(c, out m)) return new(m, BindingSource.Formation, f);
    if (bn.template.value != 0 && ((UnitTemplate)templates[bn.template]).TryGetBinding(c, out m))
        return new(m, BindingSource.BattalionTemplate, default);
    if (settings[bn.country].countryDefaults.TryGetValue(c, out m)) return new(m, BindingSource.CountryDefault, default);
    return new(default, BindingSource.None, default);
}
```

- 合成直属队营（无模板）跳过第 3 级。
- 绑定的型号若 `serviceYear > 当前年份` 或该国无法获得（11 判定），界面标红，但不阻止设置（玩家可能已下订单）。
- 改绑定**不会立即换装备**：只改变目标。真正换装发生在下一次分配（§4.8），旧型号装备退回库存。

### 4.7 全军需求汇总 `ComputeForceRequirement(country)`

✅ 全军需求 = Σ（模板槽位数 × 采用该模板的营数），按每个营所选型号分别汇总（总纲 §3.2）。实现上按**营实例**汇总（因为同一模板的营可能型号不同）：

```csharp
// 对本国每个营（含合成直属队营），按 id 升序：
foreach (var bn in BattalionsOf(country)) {
    var totals = TargetTotals(bn);           // 有模板 → ComputeTotals(bn.template)；合成营 → 子节点模板合计之和
    foreach (var (c, n) in totals.slotsByCategory) {
        var m = ResolveModel(bn, c).model;
        rows[(c, m)].requiredFull += n;
        rows[(c, m)].requiredPeacetime += (int)Math.Ceiling(n * TierEquipmentTarget(bn.tier) - 1e-9);
    }
    foreach (var (c, n) in totals.unassignedByCategory) { /* 同上，记入 unassignedRequired 分列 */ }
}
// 持有量：遍历本国所有 EquipmentItem（holder ≠ 0），按 (slotCategory, 该营绑定型号) 归行；
//   item.model == 绑定型号 → heldExact；否则 → 记到 (slotCategory, item.model) 行的 heldAsSubstitute
// 库存：DepotIndex 中本国 holder == 0 的 item，按 (model.category, model) 行计 depotStock
```

- 人员需求按专业同样汇总，输出给 02：`PersonnelRequirement[(bn, specialty)] = totals.personnelBySpecialty[s]`（满编），02 再乘在编比例。
- 刷新时机：模板/绑定/战备等级/编组变更时标记脏；在 `Calendar` 阶段（每 60 分钟）若脏则重算；界面打开时立即重算。

### 4.8 装备分配 `AllocateEquipment(country, scope)`

✅ 平均分配、优先整编、替代装备（总纲 §3.3）；一线优先来自 §9.12(5)。本算法是**纯函数式的分配计划 + 执行**，被以下调用者使用：
- 11：新装备交付入库后（每 60 分钟 `Calendar` 阶段，若当小时有交付）；
- 07：战时补充（`Calendar` 每 60 分钟）；
- 玩家：在全军装备面板点“应用分配”（立即，进入 `OrderIntake` 阶段处理）。

`scope` = 参与的营集合（缺省 = 本国全部营）。“发放”= 从库存里选出具体的 `EquipmentItem`，设 `holder = 班`、`status = InTransit`（06 决定到达时间，到达后转 `Active`；阶段 0 直接 `Active`）。从库存选件的顺序：11 的 `EquipmentConditionState.condition` 降序（无该组件视为 1）→ `locationNode` 到营所在地块的 06 路程升序（阶段 0 忽略）→ item id 升序。“退回库存”= `holder = 0`、`locationNode` = 06 `NearestDepot(营所在地块)`（阶段 0 = `NodeId(0)`），06 负责之后的运输。

#### 4.8.1 每个营每类别的目标与缺口
```text
target(bn, c)   = TargetTotals(bn).slotsByCategory[c] × TierEquipmentTarget(bn.tier)   （向上取整）
exact(bn, c)    = 该营持有、slotCategory == c、model == ResolveModel(bn,c) 的件数（不含 Unserviceable）
subst(bn, c)    = 该营持有、slotCategory == c、model ≠ 绑定型号 的件数
deficitExact    = max(0, target − exact)          // 正确型号还差多少（替代品占着的槽也算缺）
deficitAny      = max(0, target − exact − subst)  // 空槽数
```

#### 4.8.2 分配顺序（四轮）
1. **第 1 轮：正型号，常规槽位。** 对每个（类别 c, 型号 m）按 (c, m) 句柄升序：参与者 = 绑定为 m 且 `deficitExact > 0` 的营；可用量 A = 库存中型号 m 的件数；按策略（§4.8.4）算每营分得 x。发给某营的 x 件中，**先替换该营的替代装备**（min(x, subst) 件，替换下来的替代品退回库存，优先替换相似度最低的，平局按 item id 升序），剩余填空槽。
2. **第 2 轮：替代，常规槽位。** 仅对 `allowSubstitution == true`（取营的建制编组链上最近的设置；无编组 = true）的营。参与者 = `deficitAny > 0` 的营。对每个营按 §4.8.3 的候选型号顺序逐个尝试；同一候选型号在多个营之间按策略分配。
3. **第 3 轮：正型号，`slots_unassigned`。** 同第 1 轮。
4. **第 4 轮：替代，`slots_unassigned`。** 同第 2 轮。

理由：先保证“正确型号”的需要（第 1 轮看完所有型号后才开始替代），避免把别人急需的正型号当替代品发掉。

#### 4.8.3 替代候选型号顺序
对营 bn 的类别 c（绑定型号 m，可能为 0）：候选 = 库存 > 0、`category == c`、`≠ m` 的所有型号，排序键：
1. `02.Similarity(m', m)` 降序（m = 0 时全部视为 0）；
2. `serviceYear` 降序（新的优先；0 视为最旧）；
3. `ModelHandle` 升序。

✅ 替代装备“属性按老型号算、专有练度也按老型号算”（总纲 §3.3）：替代品就是一个普通的 `EquipmentItem`，其 `model` 是替代型号，03/02 按实际 `model` 读取，无需特殊处理。界面在该营显示“替代装备 N 件”标签。

🟡 O-08：**不允许跨类别替代**（如用装甲输送车顶步战车槽）。理由：类别就是“同类”的定义（categories.yaml 注释）。备选：增加 `substitutable_categories` 表（ifv ↔ apc 等），按很低的优先级跨类别替代。

#### 4.8.4 三种策略

**(a) `Even` 平均分配（注水法 + 最大余数）**

目标：分配后各营“正确型号满编比” `(held_i + x_i) / t_i` 尽量相等。`held_i` 在第 1、3 轮 = `exact`，在第 2、4 轮 = `exact + subst`；`t_i` = `target`；`d_i = t_i − held_i > 0`。

```csharp
int[] EvenSplit(int A, int[] held, int[] t, OrgUnitId[] ids) {
    int D = Σ(t[i] - held[i]);
    if (A >= D) return t[i] - held[i] for all i;                 // 够分：全部补满
    // 找水位 ρ ∈ [0,1]：Σ max(0, ρ·t_i − held_i) = A
    // 按 r_i = held_i / t_i 升序（平局按 id 升序）遍历，标准注水：
    var order = indices sorted by (held[i]/(double)t[i], ids[i]);
    double sumT = 0, sumH = 0; double rho = 0;
    for (k = 0; k < n; k++) {
        sumT += t[order[k]]; sumH += held[order[k]];
        double next = (k + 1 < n) ? held[order[k+1]] / (double)t[order[k+1]] : 1.0;
        double rhoCand = (A + sumH) / sumT;                       // 前 k+1 个营共享水位
        if (rhoCand <= next) { rho = rhoCand; break; }
    }
    double[] xs = max(0, rho * t[i] - held[i]);                   // 连续解
    int[] x = floor(xs); int rem = A - Σx;
    // 最大余数：按 (xs[i] - x[i]) 降序，平局按 ids 升序，逐个 +1，且 x[i] < t[i]-held[i]
    return x;
}
```

**(b) `PriorityFill` 优先整编**
- 顺序：`CountryOrgSettings.priorityList` 非空时，按列表展开（Formation 展开为其建制子树中所有营，DFS：指挥部营 → 其余营按 id 升序 → 子编组按 id 升序递归）；列表外的营排在最后，按下面的缺省顺序。
- 缺省顺序：按营的建制编组 `allocationPriority` 升序，再按编组 id、营 id 升序；无编组的营排最后（按 id）。
- 按顺序把每个营补满 `d_i`，直到 A 用完。

**(c) `FrontlineFirst` 一线优先**
- 一线营 = 09 `IsFrontline(bn)` 为真（营所在地块与敌方控制地块相邻，或正在 `EdgeBattle` 中；定义归 09）。
- 先在一线营之间用 `Even`；若有剩余，再在其他营之间用 `Even`。
- 阶段 0（无地图）：`IsFrontline` 全为假 → 等于 `Even`。

#### 4.8.5 营内槽位填充 `AssignToSlots(bn, items)`
营分到的装备要放到具体的班：
- 候选槽位 = 营子树中所有班的空槽位（该类别：`模板槽位数 − 已持有该类别件数`），每个空槽一个条目。
- 排序：
  1. 班的 `role`：`Hq` → `Line` → `Support` → `EquipmentPool`；
  2. `fillMode == Consolidate`：按班的 DFS 顺序（先把前面的连排补满）；
     `fillMode == KeepStructure`：轮转——先按“所属连在营中的序号”分桶，每轮从每个连各取 DFS 顺序的第一个空槽，直到用完（各连平均缺编）。
- `fillMode` 与 07 的 `ReorgPolicy` 一一对应（07 修改时同步）。
- 每放入一件：`item.holder = squad`，并调用 02 `OnCrewModelChange`（若替换了不同型号）或 `OnEquipmentAssigned`。

#### 4.8.6 退役/换装：退回旧型号
营绑定从 m 改为 m' 后，第 1 轮发放 m' 时替换下来的 m 件退回库存（§4.8.2）。若没有 m' 库存，旧型号 m 继续作为“替代装备”留在营里（这就是“先给某一个营换装”的自然过程，总纲 §3.2）。

### 4.9 战备等级（装备侧）

✅ 三档：常备满编 / 简编 / 骨干（总纲 §3.4）。人员在编比例和动员人员时间见 02；动员命令和预算见 11。本文件定义**装备侧**：

| 等级 | 装备目标 `TierEquipmentTarget` | 平时状态 | 装备维护费倍率（给 11） | 启封时间 |
|---|---|---|---|---|
| `Active` | 1.0 | 全部 `Active` | 1.0 | — |
| `Reduced` | 1.0 | 有人操作的部分 `Active`，其余 `Stored`（比例 = 1 − 02 给出的人员在编比例，按班 DFS 逆序封存） | `0.5 + 0.5 × 人员在编比例` | `ActivationReducedMs` |
| `Cadre` | 1.0 | 全部 `Stored`（骨干人员只做保管） | `CadreUpkeepMult` | `ActivationCadreMs` |

- 🟡 O-10：装备目标三档都按 1.0（苏式简编/骨干部队的典型做法：装备齐全封存在驻地，缺的是人）。备选：骨干营装备也只配 50%，其余存在中央仓库（降低平时采购需求）。
- `Stored` 装备：不计使用小时；不参与战斗；启封时由 07 消耗备件（启封备件量由 07 定义）。
- 战备等级改变（玩家决定或 11 动员）：`Active ← Reduced/Cadre` 时，对 `Stored` 装备启动启封计时；计时到点转 `Active`。降级时立即把多余装备转 `Stored`（同上的选择顺序）。

---

### 4.10 指挥负荷与指挥能力（总纲 §9.7）

> 指挥负荷 = 直接下级的数量 × 下级种类的多样性；指挥能力由“部班”的通信装备和练度决定；负荷超过能力时命令延迟变长、协同打折（§9.7）。
> 计算时机：`Calendar` 阶段每 60 分钟全量重算（量很小：阶段 1 每国约几千个节点）；编制结构变化（实例化、对齐、配属生效、指挥部人员伤亡写回）时对受影响节点立即重算。

#### 4.10.1 直接下级与当量
对排/连/营节点 X：
- 直接下级 = `X.children` 中**除去** `role ∈ {Hq, EquipmentPool}` 的子节点（班看 `Squad.role`，单位看其模板 `role`）。
- 每个下级的当量 `w = LevelGapWeight[gap]`，`gap = X.level − child.level`（班的 level = Squad）：gap 1 → 1.0，gap 2 → 0.6，gap ≥ 3 → 0.35。

对建制编组 F：
- 直接下级 = `currentParentId == F` 的编组 + `currentFormationId == F` 的营，**除去** `F.hqBattalionId`。（用**当前**关系：配属进来的算，配属出去的不算。）
- `gap = F.echelon − child.level`（营 = 4，旅 = 5…），当量同上；**配属进来的**（organic ≠ F）再 × `AttachedLoadWeight`。

`N_eq = Σ w`。

#### 4.10.2 多样性
下级兵种 `b(child)`：单位 → 模板 `branch`（§4.3）；合成直属营 → 推导值；编组 → 其模板 `branch`，无模板时对其直接下级用 §4.3 上级模板规则推导。
```text
p_b   = Σ_{child: b(child)=b} w(child) / N_eq
D     = 1 + DiversityWeight × (1 − Σ_b p_b²)          // 全同兵种 D = 1；种类越杂越接近 1 + DiversityWeight
loadEq = N_eq × D                                    // N_eq = 0 时 loadEq = 0
```

#### 4.10.3 指挥能力
指挥部班集合 `HQ(X)`：
- 排/连/营 X：X 的直接子班中 `role == Hq` 的班，加上 X 的直接子单位中模板 `role == Hq` 的单位子树里的所有班（如 `pla_bn_hq_coy` 里的 `pla_bn_hq`）。
- 建制编组 F：`F.hqBattalionId` 子树中的所有班。

```text
hqHeadcount = HQ(X) 中“在位”人员数（02 PresentCount：CasualtyState == Healthy，且不在后送/待编池）
hqTemplateHeadcount = HQ(X) 各班模板人数之和（模板目标）
StaffFactor  = clamp( sqrt(hqHeadcount / RefHqStaff[level]), StaffFactorMin, StaffFactorMax )
SkillFactor  = 0.75 + 0.5 × G_hq                      // G_hq = HQ(X) 人员通用练度按人数加权均值（02 GetSkill 的 general），∈[0,1]
CommsFactor  = CommsFactorTable[CommsTier(X)]
capacity     = BaseCapacity[level] × CommsFactor × SkillFactor × StaffFactor
```

`CommsTier(X)`（只看 `HQ(X)` 中 `status == Active` 的装备与在位人员，第一个成立者为准）：
1. 有 `tactical_terminal`，或有 `armored_command_vehicle` 且其型号 `rawSpecs.datalink == true` → `Digital`
2. 有 `armored_command_vehicle`、`mbt`、`ifv`、`apc`、`recon_ifv`、`light_armored_vehicle` 中任一（车载电台）→ `Vehicle`
3. 有 `radio_handheld`，或有专业 `signaler` 的在位人员 → `Handheld`
4. 否则 `None`

数据缺口：若 `HQ(X)` 的某个班模板是 `granularity: aggregate` 且没有 `slots`，按 `Vehicle` 计，并出 Info `W70`；若 HQ 班模板没有 `personnel`，`hqHeadcount` 与 `RefHqStaff[level]` 相等（`StaffFactor = 1`）。

#### 4.10.4 输出
```text
r                     = loadEq / capacity                          （capacity ≤ 0 → r = +∞）
orderDelayMultiplier  = max(1, r)                                   // 09 的 F_load = clamp(r, 1, FLoadMax)
coordinationFactor    = min(1, capacity / loadEq)                   // = 03 的 commandFactor；loadEq = 0 → 1
quality q             = clamp( (CommsFactor × SkillFactor − QMin) / (QMax − QMin), 0, 1 )   // 09 的 GetCommandQuality
                        其中 QMin = 0.6 × 0.75 = 0.45，QMax = 1.25 × 1.25 = 1.5625
```
- 09 同时使用 `q`（F_hq，始终起作用）与 `r`（F_load，只在过载时起作用）。通信和练度因此既影响“基础延迟”也影响“过载阈值”；这是有意的：好的部班既下令快，又管得多。🟡 O-13（与 09 T-01 一并确认）
- 整编中（§4.5.4）：`coordinationFactor × ReorganizingCoordinationMult`。

#### 4.10.5 指挥部失能
`isHeadless = (hqHeadcount < HeadlessShare × hqTemplateHeadcount)` 或（编组）指挥部营已被删除。失能时 `capacity × HeadlessCapacityMult`；09 另乘 `F_headless`。编组指挥部营被歼灭后，玩家可指定任一模板 `role == Hq` 的营为新指挥部营（立即生效，但该营 `reorganizingUntil = now + RetargetStructuralMs`）。

### 4.11 请求链路径 `GetRequestChain(squadId, fireUnitOwner)`

03 用它计算请求经过的层级（03 §4.x）。
```csharp
OrgLevel[] GetRequestChain(SquadId requester, NodeOwner fireOwner) {
    // fireOwner：拥有火力单位的节点（OrgUnitId 或 FormationId）
    var up = AncestorsByCurrentChain(requester);  // 班 → 排 → 连 → 营 → currentFormation → currentParent → …
    int k = up.IndexOf(LowestCommonAncestor(up, AncestorsByCurrentChain(fireOwner)));
    if (k < 0) return Array.Empty<OrgLevel>();   // 不在同一指挥链：03 视为不可申请
    return up.Take(k + 1).Select(n => n.level).ToArray();   // 包含两端；班自身为 Squad
}
bool IsAttachedHop(SquadId requester, NodeOwner fireOwner)
    // 请求者所在营 currentFormation ≠ organicFormation，且火力单位属于 currentFormation 一侧 → true（03 加 AttachedExtraHopS）
```
- 临时编组不在链上（无指挥部，O-06）。
- 火力单位就在请求者自己的班/排里 → 返回长度 1 或 2 的数组（03 视为“建制内即时响应”）。

### 4.12 编组操作

| 操作 | 前置条件 | 效果 | 时机 |
|---|---|---|---|
| 组建建制编组 `CreateOrganicFormation(echelon, hqBn, members)` | `hqBn` 的模板 `role == Hq` 且不是别的编组的指挥部；成员 echelon 低于新编组；不在战斗中 | 新 `Formation`（Organic）；成员 `organicParent/organicFormation` 改为它（等同“永久调动”，见下） | 立即（和平时期）；战时按 09 命令延迟 |
| 组建临时编组 `CreateAdHoc(members)` | 成员同国；每个营/编组最多属于一个临时编组；临时编组不可嵌套 | 只记录成员；**不改变任何建制或当前关系**，无任何机制加成或惩罚（总纲 §2.2 🟡） | 立即 |
| 解散临时编组 | — | 删除记录 | 立即 |
| 配属 `Attach(unit, target)` | `target` 为 Organic 且 `target.echelon > unit 的层级`；同国 | `current* = target`；型号继承、练度归属、分配优先级仍按建制（O-07）；请求链 +1 跳（03）；目标编组负荷当量 × `AttachedLoadWeight` | 走 09 命令延迟（`F_attach`） |
| 解除配属 `Detach(unit)` | 已配属 | `current* = organic*` | 走 09 命令延迟 |
| 永久调动 `Reassign(unit, newOrganic)` | 不在战斗中 | `organic* = current* = newOrganic`；调用 02 `OnSkillHolderChanged(bn, oldHolder, newHolder)` | 和平时期立即；战时按 09 命令延迟 |
| 撤编营 `Disband(bn)` | 不在战斗中 | 装备全部退回库存；人员交 02 `ReleaseToPool`（职业兵进训练池，义务兵/动员兵退为预备役）；营删除 | 立即 |
| 合并营 | 见 07（重组） | — | — |

### 4.13 按国家风格自动生成排和班（总纲 §9.11(1)）

#### 4.13.1 风格数据格式 `data/styles/<style>.yaml`

```yaml
styles:
  - id: sov_legacy                     # 苏式（继承苏军；阶段 1 亚、阿默认风格）
    name: 苏式（苏军遗产）
    prefix: sov                        # 生成模板 id 的风格段
    archetypes:
      mech_inf_coy:                    # 连类型（CompanyArchetype，snake_case 自由命名）
        branch: mech_infantry
        carrier_category: ifv          # 玩家可改为 apc（换一张 archetype 也可）
        platoons: 3
        squads_per_platoon: 3
        platoon_hq: {personnel: {officer: 1}, slots: {}}           # 排长乘第一个班的车
        platoon_extra: []              # 排属附加班（如火力班）：[{squad: <内联班定义>, count: n}]
        company_hq:
          personnel: {officer: 2, political_officer: 0, nco_senior: 1, signaler: 1, medic: 1, vehicle_gunner: 1, vehicle_driver: 1}
          slots: {ifv: 1, radio_handheld: 1}
        company_extra:
          - squad:
              name: 连机枪/榴弹组
              personnel: {mg_gunner: 2, assistant_gunner: 2}
              slots: {gpmg: 2}
            count: 1
        squad:                         # 线列班生成规则
          vehicle: {ifv: 1}            # 每班车辆；类别必须 = carrier_category
          crew:                        # 车组（永远保留，不受截断）
            - {specialty: vehicle_gunner}
            - {specialty: vehicle_driver}
          dismounts:                   # 下车人员，按优先级排序（越靠前越先保留）
            - {specialty: squad_leader,       slots: {rifle: 1}}
            - {specialty: mg_gunner,          slots: {gpmg: 1}}
            - {specialty: at_gunner,          slots: {reusable_launcher: 1}}
            - {specialty: automatic_rifleman, slots: {lmg: 1}}
            - {specialty: assistant_gunner,   slots: {rifle: 1}}
            - {specialty: rifleman,           slots: {rifle: 1}}
            - {specialty: marksman,           slots: {dmr: 1}}
            - {specialty: rifleman,           slots: {rifle: 1}}
          max_dismounts: 7             # 风格的标准下车人数（还会受车辆载员限制）
          unassigned: {disposable_launcher: 2}
    confidence: estimated
    notes: 示意规则；最终数值由 14 依据史料核实，并经试验场（V-04）调优。
```

#### 4.13.2 输入参数
```csharp
public sealed record GenerateParams(
    StyleHandle style, string archetype,
    ModelHandle carrierModel,      // 可为 0：用风格默认（不看载员）
    int platoons = 0,              // 0 = 用风格值
    int squadsPerPlatoon = 0,
    int maxDismounts = 0);         // 0 = 用风格值
```

#### 4.13.3 生成算法
```csharp
GeneratedSet Generate(CountryId country, GenerateParams p) {
    var a = styles[p.style].archetypes[p.archetype];
    int dismountCap = p.maxDismounts > 0 ? p.maxDismounts : a.squad.maxDismounts;
    if (p.carrierModel.value != 0) {
        var m = models[p.carrierModel];
        if (m.capacity >= 0) {
            // 车载座位 = 乘员 + 载员；车组人数 = crew 列表长度；squad_leader 计入下车人员
            int seatsForDismounts = m.capacity + Math.Max(0, m.crew - a.squad.crew.Count);
            dismountCap = Math.Min(dismountCap, seatsForDismounts);
        }
    }
    dismountCap = Math.Max(dismountCap, 1);
    var dismounts = a.squad.dismounts.Take(dismountCap);            // 按优先级截断
    var squadT = NewSquadTemplate(personnel: a.squad.crew ∪ dismounts, slots: a.squad.vehicle ∪ Σ dismounts.slots,
                                  unassigned: a.squad.unassigned, branch: a.branch);
    var plt = NewUnitTemplate(OrgLevel.Platoon, children: [squadT × (p.squadsPerPlatoon or a.squadsPerPlatoon),
                                                         plt_hq × 1, platoon_extra...]);
    var coy = NewUnitTemplate(OrgLevel.Company, children: [plt × (p.platoons or a.platoons), coy_hq × 1, company_extra...]);
    return new GeneratedSet(coy, plt, squadT, ...);
}
```
- 生成模板 id：`<国家小写ISO3>_gen_<style.prefix>_<archetype>_<层级后缀>_<h8>`，`h8` = 规范参数串的 FNV-1a 64 位哈希的低 32 位小写十六进制（8 位）。规范参数串 = `style|archetype|carrierModelId|platoons|squadsPerPlatoon|maxDismounts`（未指定写 `0`）。**禁止用 `string.GetHashCode()`**（00 §6.1）。同参数再次生成得到同 id（复用已有模板，不重复创建）。
- 生成的每个模板写入 `generator: {style, archetype, params}`、`isPreset = false`、`style = style.id`。
- 截断时出 Info：“受 BMP-2 载员限制，下车人数 8 → 7，去掉了 `rifleman`（第 8 优先级）”。

#### 4.13.4 生成模板与手工编辑
- 玩家改了参数（如换车型）→ 重新生成新 id 的模板，并按 §4.5.1 把引用改指向新模板（默认“本国全部引用”）。
- 玩家**手动编辑**某个生成模板 → `generator` 置空，此后不再自动重生成（界面标“已手动修改”）。
- 🟡 O-14：“预设接近最优”的保证方式 = 每个风格的每个 archetype 都要在试验场（03 ProvingGround）对参考对手跑 V-04，生成结果与手工调优模板的胜率差 ≤ `StyleOptimalityTolerance`（见 §9）。

### 4.14 编制编辑器自动检查（总纲 §9.11(3)）

运行时机：编辑器每次修改后对“被修改模板 + 全部祖先模板”运行；实例检查（W06、W41、W91）每 60 分钟或界面打开时运行。所有检查都是**纯函数**，阶段 0 必须可以在没有地图的情况下跑。

#### 4.14.0 检查代码表

| 代码 | 名称 | 严重度 | 作用对象 |
|---|---|---|---|
| `E01_cycle` | 循环引用 | Error | 模板 |
| `E02_level_order` | 子模板层级不低于父模板 | Error | 模板 |
| `E03_missing_ref` | 引用不存在的模板/类别/专业/型号 | Error | 模板 |
| `E04_no_hq` | 建制编组模板没有 `role: hq` 的营 | Error | 旅以上模板 |
| `E05_multi_hq` | 多个 `role: hq` 的营 | Warning | 旅以上模板 |
| `W06_unbound` | 有类别解析不到型号（§4.6 第 5 级） | Warning（实例）/ Info（模板） | 营 |
| `W10_overweight` | 超重 | Warning（车载班降为 Info） | 班模板 |
| `W11_load` | 人均负重偏高（03 计算） | Info | 班模板 |
| `W20_role_dup` | 职能重复 | Info | 班模板、排 |
| `W30_cap_gap` | 能力缺口 | 按规则表 | 连、营、旅 |
| `W40_vehicle_capacity` | 乘车不匹配 | Warning（排内能消化降为 Info） | 班、排 |
| `W41_crew_short` | 人数少于车辆/武器乘员需求 | Warning | 班 |
| `W50_command_overload` | 指挥过载 | `r > 1` Warning；`0.9 < r ≤ 1` Info | 排以上 |
| `W60_range_beyond_tile` | 射程越格兵器编入战斗旅（只能参加交界边战斗，不能跨地块打击，总纲 §9.3 🟡） | Info | 旅模板 |
| `W70_aggregate` | 含聚合数据，部分数字按默认 | Info | 任意 |
| `W80_expected_mismatch` | 合计与 `expected_*` 不符（数据作者用，玩家界面不显示） | Info | 任意 |
| `W90_diversity` | 同一维护组织内某类别型号组过多 | Info | 编组（实例） |
| `W91_substitute` | 营内有替代装备 | Info | 营（实例） |

#### 4.14.1 超重 `W10_overweight`
- 只检查 `isPortable == true` 的类别槽位。缺省可携行类别：`rifle, smg, shotgun, dmr, lmg, gpmg, sniper_rifle, anti_materiel_rifle, underbarrel_gl, sniper_gl, agl, disposable_launcher, reusable_launcher, thermobaric_launcher, atgm_portable, atgm_heavy, manpads, mortar_light, mortar_medium, radio_handheld, tactical_terminal, uav_micro, uav_hand_launched, fpv_drone, body_armor`。
- 武器系统质量 `M = 03.GetSystemMassKg(model)`（武器 + 一个默认基数的弹药质量）。03 未就绪时用 `model.massKg`，并在消息里注明“未含弹药”。型号 = 用于检查的“代表型号”：实例检查用营的绑定；模板检查用模板链上最近的 `default_bindings`，再无则用本国 `countryDefaults`，再无则跳过该槽并出 `W06`（Info）。
- 武器层级 `weaponEchelon`：模板写了用写的；否则：班模板在其**父排模板**中出现 ≥ 2 次 → `Squad`；恰好 1 次 → `Platoon`；父模板是连或更高 → 不检查。只编辑班模板（还没被引用）时按 `Squad`。
- 判定：`Squad` 档 `M > OverweightSquadKg`；`Platoon` 档 `M > OverweightPlatoonKg` → 报告 `{massKg: M, limitKg: …}`。
- 班里有 `isCarrier` 类别的车辆 → 降为 Info（“只在下车作战时受影响”）。

#### 4.14.2 人均负重 `W11_load`
`avgLoadKg = 03.ComputeDismountLoadKg(squadTemplate, bindings)`（03 定义负重分配）；`avgLoadKg > ApproachLoadLimitKg` → Info。

#### 4.14.3 职能重复 `W20_role_dup`
- 范围 1：同一个班模板内；范围 2：同一个排模板内所有 `weaponEchelon == Platoon` 的班合在一起。（不同层级之间不比——“放在哪一级”本身就是请求链取舍。）
- 只比 `isSupportWeapon == true` 的类别。职能集合 `roles(c)`：03 武器数据就绪后 = `{ (targetClass, depthBand) | 03.Effectiveness(model, targetClass, depthBand) ≥ RoleCoverThreshold }`；否则用下面的回退表。
- 判定：两类别 A ≠ B 都在范围内，`roles(A) ⊆ roles(B)` → Info：“A 的职能被 B 覆盖，边际价值低（A 质量 x kg，占 n 人）”。A、B 职能完全相同时只报一次（报句柄大者被覆盖）。

回退职能表（目标类别缩写：`pe` 暴露人员、`pc` 有掩体人员、`pb` 建筑内人员、`pr` 反斜面人员、`la` 轻装甲、`ha` 重装甲、`fo` 工事、`he` 直升机、`ua` 无人机；纵深带：`c` 0–300 m、`m` 300 m–1 km、`f` 1–4 km）：

| 类别 | roles | 类别 | roles |
|---|---|---|---|
| `disposable_launcher` | la_c, pb_c | `hmg` | pe_m, pe_f, la_c, la_m, he_m |
| `reusable_launcher` | la_c, ha_c, pb_c, fo_c, pc_c | `anti_materiel_rifle` | la_m, pe_f |
| `thermobaric_launcher` | pb_c, pb_m, fo_c, pc_c | `mortar_light` | pe_m, pc_m, pr_m |
| `atgm_portable` | ha_c, ha_m, ha_f, la_m, la_f, fo_m | `mortar_medium` | pe_m, pe_f, pc_m, pc_f, pr_m, pr_f |
| `atgm_heavy` | ha_m, ha_f, la_m, la_f, fo_m, fo_f | `mortar_heavy` / `mortar_vehicle` / `sp_mortar_howitzer` | pe_m, pe_f, pc_m, pc_f, pr_m, pr_f, fo_f |
| `agl` | pe_c, pe_m, pc_c, pc_m | `manpads` | he_m, he_f, ua_m, ua_f |
| `underbarrel_gl` | pe_c, pc_c | `aa_mg` | he_c, he_m, ua_c |
| `sniper_gl` | pe_m, pc_m | `loitering_munition` / `fpv_drone` | la_f, ha_f, pc_f, fo_f |

（`rifle, smg, shotgun, dmr, lmg, gpmg, sniper_rifle` 的 `support_weapon = false`，不参与。）

> 例：苏式 BMP 班同时有 `disposable_launcher` 和 `reusable_launcher` → `{la_c, pb_c} ⊆ {la_c, ha_c, pb_c, fo_c, pc_c}` → Info “一次性火箭筒的职能被 RPG 覆盖”。这对应总纲例子“火箭筒和无后坐力炮职能重叠”；是 Info 而不是 Warning，因为“多带几发”本身有价值（由 03 的闲置统计告诉玩家值不值）。

#### 4.14.4 能力缺口 `W30_cap_gap`
- 能力提供：03 武器数据就绪后，类别 c 提供能力 k ⇔ 该类别代表型号对相应目标类别的效能 ≥ `CapabilityThreshold`（`AntiHeavyArmor`↔`ha_*`，`AntiLightArmor`↔`la_*`，`AntiFortification`↔`fo_*` 或 `pb_*`，`AntiAirLow`↔`he_*` 或 `ua_*`）；`IndirectHighAngle`↔`03.FireMode == HighAngleIndirect`；其余按下表。03 未就绪时全部用回退表。
- 统计范围：“X 以下” = X 子树中所有班的槽位与人员（含 `slots_unassigned`，不含 `attached`）。

回退能力表：

| 能力 | 由这些类别提供 | 或由这些专业提供 |
|---|---|---|
| `AntiHeavyArmor` | mbt, assault_gun, atgm_portable, atgm_heavy, atgm_vehicle, loitering_munition | — |
| `AntiLightArmor` | 上一行全部 + ifv, recon_ifv, reusable_launcher, disposable_launcher, hmg, anti_materiel_rifle, fpv_drone | — |
| `AntiFortification` | mbt, assault_gun, thermobaric_launcher, reusable_launcher, mortar_*, sp_mortar_howitzer, howitzer_*, atgm_heavy | — |
| `IndirectHighAngle` | mortar_*, sp_mortar_howitzer, howitzer_*, mrl_* | — |
| `AntiAirLow` | manpads, spaag, sam_short, sam_vehicle_manpads, aa_mg, aa_gun_towed, c_ram | `manpads_gunner` |
| `Recon` | recon_ifv, eo_recon_suite, radar_battlefield, uav_* | `scout` |
| `Comms` | radio_handheld, tactical_terminal, armored_command_vehicle | `signaler` |
| `Medical` | armored_ambulance | `medic` |
| `Breaching` | engineer_vehicle, mine_clearing_vehicle | `engineer` |
| `Transport` | truck_medium, truck_heavy, semi_tractor | `driver`, `supply` |

规则表（`branch` 是**被检查节点**的兵种）：

| 层级 | 兵种 | 必需能力 → 严重度 |
|---|---|---|
| 连 | MechInfantry / MotorInfantry / LightInfantry | AntiLightArmor → Warning；AntiHeavyArmor → Info；Comms → Warning |
| 连 | Armor | Comms → Warning |
| 营 | MechInfantry / MotorInfantry / LightInfantry / Armor / CombinedArms | AntiHeavyArmor → Warning；IndirectHighAngle → Warning；Medical → Warning；AntiAirLow → Info；Recon → Info；Breaching → Info |
| 营 | Artillery / FireSupport | Recon → Warning（无观察手段）；Transport → Info |
| 旅（建制） | CombinedArms / 任意机动兵种 | IndirectHighAngle、AntiAirLow、Recon、Breaching、Medical、Transport → Warning |

消息带数字：“第 2 连以下没有任何对付轻装甲的手段（AntiLightArmor：0 件；最近的提供者：营反坦克排）”。

#### 4.14.5 乘车不匹配 `W40_vehicle_capacity` 与乘员不足 `W41_crew_short`
```text
seats(model) = model.crew + model.capacity      （capacity 未知 → 跳过此车并出 W70）
班：persons = Σ personnel；carriers = 班中 isCarrier 类别的槽位（按代表型号）
    若 carriers 为空 → 不检查（徒步班，或由上级卡车运输）
    seatsSq = Σ_carriers seats × 槽位数 + Σ_非carrier车辆(mbt 等) crew × 槽位数
    persons > seatsSq → 候选 W40：{persons, seats: seatsSq}
排：personsPlt = 排内全部班人数；seatsPlt = 排内全部班 seatsSq 之和（徒步班 seats = 0）
    personsPlt ≤ seatsPlt → 该排内的班级 W40 降为 Info（“排内可以调剂座位”）
    personsPlt > seatsPlt 且排内至少有一个 carrier → 排级 W40 Warning
W41：班 crewNeeded = Σ（有 crew 字段的车辆/武器型号）crew × 槽位数；persons < crewNeeded → Warning
```
默认 carrier 类别：`ifv, apc, recon_ifv, amphibious_assault_vehicle, light_armored_vehicle, mrap, utility_vehicle, atv, truck_medium, truck_heavy`。

> 例（总纲原例）：班 9 人，步战车 `crew 3 + capacity 4 = 7` 座 → `W40`：“班 9 人，可乘 7 人”。排内其他班也满员 → 排级 Warning。

#### 4.14.6 指挥过载 `W50_command_overload`
模板检查时按“模板满编、默认通信、`G_hq = TemplateCheckHqSkill`”算 §4.10；实例检查用实时值。

#### 4.14.7 射程越格 `W60_range_beyond_tile`
旅模板（`level == Brigade`，非 `Artillery` 兵种的编组）子树里有型号 `03.GetMaxRangeM(model) > CrossTileRangeThresholdM` → Info：“该兵器在旅里只能参加交界边战斗，不能使用跨地块打击命令；想用跨地块打击请编成独立火力营/火力旅”（总纲 §9.3）。

### 4.15 型号多样性的编制侧代价（总纲 §6）

不设专门惩罚数值，只算出三个机制需要的数量（✅ §6）。

#### 4.15.1 维护工具组
- 维护组织 = 技能/维修的承载单位：营的最近**建制旅级**编组；没有旅级上级的营自成一个维护组织（与 02 的练度归属 G-07 一致）。
- 维护组 `g(model) = model.maintenanceGroup ?? model.family`（同谱系共用工具组，所以“统一系列”天然便宜）。
```text
items(org, g)      = 维护组织 org 内各班持有的、status ≠ Unserviceable、model 属于 g 的件数（不含库存）
toolsetsNeeded     = ceil( items / ItemsPerToolset[category] )        （items = 0 → 0）
toolsetsHeld       = ToolsetState[(org, g)]（组件，见下）
coverage(org, g)   = toolsetsNeeded == 0 ? 1 : min(1, toolsetsHeld / toolsetsNeeded)
```
- `ToolsetState { MaintenanceOrgKey org; string group; int held; }`：缺省**自动采购**（预设接近最优）：每当 `toolsetsNeeded > held`，向 11 发 `RequestToolsetPurchase(org, g, Δ)`，单价 `ToolsetCostFactor × max(该组在 org 内各型号单价)`（11 单价）；到货时间按 11 的国内交付规则。玩家可关闭自动采购（省钱，代价见下）。
- 效果（给 07）：`RepairThroughputMult(org, g) = NoToolsetRepairFactor + (1 − NoToolsetRepairFactor) × coverage`。
- 年维护费（给 11）：`held × 工具组单价 × ToolsetUpkeepPerYear`。

#### 4.15.2 备件品种线
- 每个在役型号（本国有 ≥ 1 件）就是一条备件线；备件库存（`PartsStock`）由 06 存储、07 消耗。本文件给出**储备目标**（给 06/11 作为默认 `StockTarget`）：
```text
fleet(m)        = 本国型号 m 的件数（含库存）
partsTarget(m)  = max( PartsMinLotUnits, fleet(m) × 07.PartsPerItemPerYear(m) × PartsTargetYears )
```
`PartsMinLotUnits` 是与机队规模无关的下限 → 小机队的型号单位成本更高，这就是“型号越多越贵”在备件上的自然体现。

#### 4.15.3 多样性面板（F8）
每个维护组织一行：维护组数、每组件数、工具组 需要/持有、备件线数、年维护费；`W90_diversity`：同一维护组织内同一类别的维护组数 > `DiversityInfoGroupsPerCategory` → Info。

### 4.16 装填模板（通用机制；阶段 3 用于垂直发射单元）🟡 O-15

总纲 §5.2：玩家可创建若干装填模板，游戏按舰型提供默认模板，每艘舰选用一个；换模板、补弹要回港。这里定义与舰艇无关的通用结构，任何“有若干装填单元的宿主”都可复用（阶段 3 的 VLS；以后可能用于模块化火箭炮的弹箱组合）。

#### 4.16.1 数据格式
```yaml
# 宿主类型声明它有哪些装填单元（阶段 3 由海军规格在舰级数据里写）
host_classes:
  - id: example_destroyer_class
    containers: {mk41_strike: 64, mk41_tactical: 32}     # 单元类型 → 单元数
# 弹药型号声明能装进哪种单元、每单元几枚（EquipmentModel 的 munition Profile 子键）
#   container_compat: [{kind: mk41_tactical, per_cell: 4}]
loadout_templates:
  - id: example_destroyer_aaw
    host_class: example_destroyer_class
    is_default: true
    entries:
      - {munition: sm2_example, container: mk41_strike, cells: 48}
      - {munition: essm_example, container: mk41_tactical, cells: 8, per_cell: 4}
```
（示例 id 均为虚构占位。）

#### 4.16.2 运行时与校验
```csharp
public sealed class LoadoutTemplate {
    public LoadoutTemplateHandle handle; public string id; public string hostClass; public bool isDefault;
    public LoadoutEntry[] entries;   // (ModelHandle munition, string container, int cells, int perCell)
}
// 校验（编辑时）：
//  L1 每种 container：Σ cells ≤ host.containers[container]                     → Error
//  L2 munition 的 container_compat 含该 container，且 perCell ≤ compat.per_cell  → Error
//  L3 每个宿主类型恰好一个 is_default                                           → Warning
//  L4 总枚数 = Σ cells × perCell；按 munition 汇总显示（透明）
// 需求汇总：Σ_宿主实例 template 枚数 → 给 06 作为“按枚”储备目标的默认值（总纲 §5.2）
```
- 宿主实例选择模板：`LoadoutSelectionState { hostEntityId; LoadoutTemplateHandle selected; LoadoutTemplateHandle pending; }`，`pending` 在宿主到港时生效（到港判定与补弹由阶段 3 海军规格定义）。

### 4.17 纳卡 MVP：模板系统如何表达双方编制

模板系统不需要任何特例就能表达下列结构；**具体编制数字由 14 依据史料填写**（这里只给结构，不臆造数值）。

| 真实结构 | 表达方式 |
|---|---|
| 苏式**摩步团**（亚、阿均有继承；营 + 团属坦克营/炮兵营/防空营 + 大量团直属连：侦察、工兵、通信、维修、卫生、物资保障、防化排、反坦克炮兵连） | `level: brigade` + `echelon_label: regiment`（O-01）；营级子模板正常实例化；团直属的连/排**直接引用** → 自动装进“直属队”合成营（§4.4.3）；团部 = `role: hq` 的营 |
| 苏式/阿塞拜疆式**摩步旅**（3–4 个摩步营 + 坦克营 + 炮兵营/火箭炮营 + 反坦克营 + 防空营 + 旅直属连） | `level: brigade`；同上 |
| **军**（亚美尼亚 1–5 军、阿塞拜疆 1–5 军团、纳希切万独立合成集团军） | `level: corps`（`echelon_label` 可写 `army_corps` / `combined_arms_army`）；军直属营（炮兵、防空、工兵）作为 battalion 子节点；军部 = `role: hq` 的营 |
| **纳卡“防卫军”**（防区 → 团/营，大量固守阵地的营） | 归属见 G-13（14 决定）。结构上：防区 = `level: division` 或 `corps` + `echelon_label: defence_region`；团 = `level: brigade` + `echelon_label: regiment`；固守营就是普通营模板（车辆少 → 09 的机动慢，工事由 04/09 处理） |
| **简编 / 骨干（кадрированные）部队**、预备役团 | 同样的模板；营的 `tier = Reduced / Cadre`（§4.9，人员在编比例见 02） |
| 独立营（直属军或国家：特种营、侦察营、巡飞弹/无人机分队、战术导弹营） | 营模板，`organicFormationId` 指向军编组或为 0（直属国家）；练度归属按 G-07 自成一体 |
| 2020 年前后新增的无人机/巡飞弹单位 | 用新增类别 `loitering_munition`、`uav_*` 的班模板（M2）；大型无人机（TB2 等）是空军 `Flight`（08），不进陆军模板 |
| 自动生成默认风格 | 亚、阿均用 `sov_legacy`；阿塞拜疆 2020 的土耳其式突击部队可用 `aze` 微调风格（阶段 1 可选） |

---

## 5. 常数表

全部放在 `data/tuning/01_org.yaml`（G-15），键名为 snake_case 版本。

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `LevelGapWeight[1/2/≥3]` | 1.0 / 0.6 / 0.35 | — | 各 ±50% | 估算：跨级引用的小单位（如连直属的车组）比同级下级好管；`confidence: estimated` |
| `AttachedLoadWeight` | 1.5 | — | 1.0–2.0 | 总纲 §2.2 🟡“配属后指挥负荷上升”；估算 |
| `DiversityWeight` | 0.5 | — | 0–1.0 | 估算：全同兵种 D=1，5 种均分 D=1.4；V-03 校准 |
| `BaseCapacity[Platoon/Company/Battalion/Brigade/Division/Corps]` | 5 / 6 / 7 / 10 / 8 / 8 | 当量 | ±30% | 估算：使常见真实编制（美、解放军、苏式）在默认通信和练度下 `r ≈ 0.6–1.0`；V-03 校准 |
| `RefHqStaff[Platoon…Corps]` | 2 / 6 / 20 / 80 / 250 / 500 | 人 | ±50% | 估算：典型排部、连部、营部、旅部、师部、军部人数量级 |
| `StaffFactorMin` / `StaffFactorMax` | 0.5 / 1.4 | — | 0.3–0.7 / 1.2–1.8 | 平衡：大指挥部有收益但递减（平方根） |
| `CommsFactorTable[None/Handheld/Vehicle/Digital]` | 0.6 / 0.9 / 1.0 / 1.25 | — | 各 ±0.15 | 估算；让“指挥通信装备成为有价值的采购”（总纲 §11.1.1） |
| `HeadlessShare` | 0.25 | — | 0.1–0.5 | 估算 |
| `HeadlessCapacityMult` | 0.3 | — | 0.1–0.5 | 估算；保证 capacity 永远 > 0 |
| `RetargetStructuralMs` | 86 400 000（24 h） | ms | 6–72 h | 估算：营级改编的组织时间 |
| `ReorganizingDelayMult` | 1.5 | — | 1.0–2.0 | 平衡 |
| `ReorganizingCoordinationMult` | 0.8 | — | 0.6–1.0 | 平衡 |
| `TierEquipmentTarget[Active/Reduced/Cadre]` | 1.0 / 1.0 / 1.0 | — | Cadre 0.5–1.0 | O-10 |
| `CadreUpkeepMult` | 0.35 | — | 0.2–0.6 | 估算：封存装备维护费约为在用的 1/3 |
| `ActivationReducedMs` | 86 400 000（24 h） | ms | 12–72 h | 估算：短期封存启封 |
| `ActivationCadreMs` | 345 600 000（96 h） | ms | 48–240 h | 估算：长期封存启封（除油、充电、检测） |
| `OverweightSquadKg` | 15 | kg | 12–20 | 总纲 §9.1、§9.11(3)（“班用武器加一个基数不超过 15kg”） |
| `OverweightPlatoonKg` | 30 | kg | 25–40 | 总纲 §9.11(3) |
| `ApproachLoadLimitKg` | 33 | kg | 25–40 | 估算：常见“接近行军负重 ≤ 体重 45%”× 75 kg；`confidence: estimated` |
| `RoleCoverThreshold` | 0.3 | 03 效能归一化值 | 0.1–0.5 | 估算；03 就绪后由 V1 校准 |
| `CapabilityThreshold` | 0.3 | 同上 | 0.1–0.5 | 同上 |
| `CrossTileRangeThresholdM` | 60 000 | m | 50 000–80 000 | 总纲 §9.3：旅属兵器 ≤ 约 40 km，70 km 以上为跨地块兵器 |
| `TemplateCheckHqSkill` | 0.5 | — | 0.3–0.7 | 模板检查用的假定指挥部练度 |
| `ItemsPerToolset[group]` | armor 30、vehicle 60、artillery 18、fire_support 36、air_defense 12、anti_armor 200、small_arms 2000、sensor 6、uav 9、c4i 200 | 件/套 | ±50% | 估算：约一个营的同类装备共用一套维修/检测设备 |
| `ToolsetCostFactor` | 0.5 | × 单价 | 0.2–1.0 | 估算；`confidence: estimated` |
| `ToolsetUpkeepPerYear` | 0.1 | 1/年 | 0.05–0.2 | 估算 |
| `NoToolsetRepairFactor` | 0.35 | — | 0.1–0.6 | 平衡：没有专用工具也能修，但慢很多（总纲 §6 第 2 条） |
| `PartsMinLotUnits` | 20 | 07 的备件单位 | 5–50 | 平衡：使小机队型号的备件成本偏高（总纲 §6） |
| `PartsTargetYears` | 1.0 | 年 | 0.5–3 | 估算 |
| `DiversityInfoGroupsPerCategory` | 2 | 组 | 1–4 | 平衡 |
| `DefaultAllocationPriority` | 1000 | — | — | 约定 |
| `StyleOptimalityTolerance` | 0.05 | 胜率 | 0.02–0.10 | 总纲 §9.11(1)“预设接近最优” |

---

## 6. 与其他系统的接口

### 6.1 本系统提供（调用方 → 函数）

| 函数 / 数据 | 调用方 | 时机 |
|---|---|---|
| `TemplateTotals GetTotals(TemplateHandle)`；`UnitTemplate/SquadTemplate Get(...)` | 02、03、06、13 | 按需（缓存） |
| `ResolvedBinding ResolveModel(OrgUnitId bn, CategoryHandle c)` | 03、05、06、07、11 | 按需 |
| 编制树遍历：`SquadsOf(OrgUnitId)`、`BattalionsOf(FormationId, bool current)`、`ItemsInFormation(FormationId)`、`ItemsOf(SquadId)` | 03、04、05、06、07、09 | 按需 |
| `Branch GetBattalionKind(OrgUnitId)`（= 营模板 branch / 推导值） | 05（R-20 类型情报）、12、13 | 按需 |
| `CommandState Get(OrgUnitId)`、`FormationCommandState Get(FormationId)`：`loadEq`（= CommandLoad）、`capacity`（= CommandCapacity）、`quality`（= `GetCommandQuality`）、`isHeadless`、`coordinationFactor` | 03（commandFactor）、09（F_hq、F_load、F_headless） | 每 60 分钟更新；读取随时 |
| `OrgLevel[] GetRequestChain(SquadId, NodeOwner)`、`bool IsAttachedHop(...)` | 03 | 片段创建时 |
| 营的 `organicFormationId / currentFormationId`、编组 `kind / hqBattalionId / echelon` | 03、06、09 | 按需 |
| `ForceRequirementRow[] GetForceRequirement(CountryId)` | 11（采购面板、年初）、13 | 脏时每 60 分钟 |
| `PersonnelRequirement(OrgUnitId bn) → SortedDictionary<SpecialtyHandle,int>`（满编） | 02 | 结构变化时 |
| `AllocationResult AllocateEquipment(CountryId, IEnumerable<OrgUnitId> scope)` | 07（战时补充）、11（交付后）、玩家 | `Calendar` 每 60 分钟（由调用方触发）；玩家命令在 `OrderIntake` |
| `MaintenanceOrgKey GetMaintenanceOrg(OrgUnitId bn)`（= 02 的练度归属规则） | 02、07 | 按需 |
| `double RepairThroughputMult(MaintenanceOrgKey, string group)` | 07 | 每 60 分钟 |
| `int PartsTarget(ModelHandle)` | 06、11 | 每天 |
| `CheckResult[] RunChecks(TemplateHandle, scope)`、`ImpactReport BuildImpact(edit)` | 13（编辑器） | 编辑时 |
| `EquipmentModel.massKg`、核心字段 | 06、03 | 加载后只读 |
| `LoadoutTemplate` 及按枚需求汇总 | 06（阶段 3） | 每天 |
| 事件 `OnCrewModelChange(SquadId, CategoryHandle, ModelHandle from, ModelHandle to)` | → 02 | 装备替换/改型发生时立即 |
| 事件 `OnEquipmentAssigned(SquadId, EquipmentItemId)`、`OnBattalionCreated/Removed(OrgUnitId)`、`OnStructureChanged(OrgUnitId)` | → 02、03（缓存失效）、05、06、09 | 立即 |

### 6.2 本系统使用

| 来源 | 数据 / 函数 | 用途 |
|---|---|---|
| 02 | `PresentCount(SquadId)`、`GetSkill(...)` 的 general、`TierPersonnelFill(tier, specialty)`、`TrainedPoolAvailable(country, specialty)`、`Similarity(m1, m2)`、`OnSkillHolderChanged` | 指挥能力、传导提示、替代顺序、调动 |
| 03 | `GetSystemMassKg(model)`、`ComputeDismountLoadKg(...)`、`Effectiveness(model, targetClass, depthBand)`、`GetMaxRangeM(model)`、`FireMode` | 编辑器检查（03 未就绪时用回退表） |
| 06 | `NodeId`、`NearestDepot(tile)`、节点间路程 | 发放/退回库存 |
| 07 | `UnassignedPool`、`ReorganizeWithinBattalion(bn)`、`PartsPerItemPerYear(model)`、`ReorgPolicy` | 对齐、备件目标、填充方式 |
| 09 | `IsFrontline(bn)`、`OnBattalionLeftBattle(bn)`、配属/调动命令的延迟与生效 | 分配策略、延后对齐 |
| 11 | `GetUnitCostMusd(model)`、`EquipmentConditionState`、交付/退役/升级对 `EquipmentItem` 的增删改、`RequestToolsetPurchase` 的执行 | 成本显示、选件顺序、工具组 |
| 14 | 国家默认绑定、开局编制树（用 §4.4 实例化）、玩家国家默认风格 | 开局 |
| 15 | 存档：所有运行时实体、玩家模板、ID 分配器 | — |

### 6.3 调用时机小结（与 00 §5.2 一致）
- `OrderIntake`（20）：玩家的编辑确认、分配、编组操作（配属/调动经 09 延迟后在 20 生效）。
- `Calendar` 时（30）：指挥状态全量重算 → 需求表（若脏）→ 被 11、07 调用的分配。同一刻顺序：11 交付 → 02 训练/学校 → 07 补充（调用 01 分配）。
- 其余函数为同步查询，无固定阶段。

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 上级模板 `children` 为空 | 编辑器允许（草稿），出 Info；**不能实例化**（实例化时 Error，拒绝） |
| `count = 0` 或负数 | 加载 Error；编辑器不允许输入 |
| 模板循环 / 子层级 ≥ 父层级 | Error E01/E02，拒绝保存 |
| 实例化时子模板缺失 | Error E03，整棵编组拒绝实例化（开发版）；模组版跳过该子节点并记日志 |
| Even 分配中某营 `target = 0` | 排除出参与者（避免除零） |
| 全部营都满编（D = 0） | 不分配，直接返回 |
| `A = 0` | 不分配 |
| 型号绑定为 0（未指定） | 只参加替代轮；需求表行“未指定型号” |
| 绑定型号的类别与槽位类别不符 | 设定时拒绝（UI 只列同类别型号）；数据里出现时加载 Warning 并忽略该绑定 |
| 营的全部班都没人 | 营仍存在（由 07 决定是否撤编）；指挥负荷照算（子节点仍在），`isHeadless` 多半为真 |
| 指挥能力趋近 0 | 不会为 0：最小值 `5 × 0.6 × 0.75 × 0.5 × 0.3 ≈ 0.34` |
| 负荷为 0（没有下级） | `r = 0`，`coordinationFactor = 1` |
| 对齐时被删的班里有 `InTransit` 装备 | 装备 `holder` 改为 0 并进入待编池，`status` 保持 `InTransit`，到达后在待编池里 |
| 指挥部营被配属 | 禁止（Error）：指挥部营只能随编组整体配属 |
| 跨国配属 / 跨国临时编组 | 阶段 1 禁止；同盟配属阶段 2+ |
| 同一刻多个调用方都要分配同一型号库存 | 按 §6.3 顺序串行执行，先到先得 |
| 战斗中的营收到模板对齐 | 延后到离开战斗（O-05） |
| 一个营同时是两个临时编组的成员 | 禁止；加入新的临时编组前自动退出旧的（UI 提示） |
| 编组模板被编辑、删除了某个营 | 已有营标记“编外”，不自动解散（§4.5.4） |
| 风格表里 `max_dismounts` 大于车辆可载 | 以车辆为准截断并出 Info（§4.13.3） |
| 风格 dismounts 列表短于 `max_dismounts` | 用整个列表，不补人 |
| 型号 `capacity` 未知（−1） | 乘车检查跳过该车并出 W70；自动生成不按载员截断 |
| `expected_personnel` 回填 | 只影响显示与预算；人员需求按专业时多出的计入 `unspecified` |
| 装填模板引用不兼容弹药 | Error L2，不能保存 |

---

## 8. 测试用例

> 数据引用现有 `data/templates/pla_army_brigade.yaml`，可直接用真实文件做单元测试。

**T1 模板展开（`pla_mech_plt`）**
- 输入：`ComputeTotals(pla_mech_plt)`。
- 期望：`personnelTotal = 36`；专业：squad_leader 3、vehicle_gunner 3、vehicle_driver 3、team_leader 3、at_gunner 4、assistant_gunner 6、automatic_rifleman 6、marksman 3、mg_gunner 1、rifleman 2、officer 1、signaler 1（合计 36）；槽位：ifv 4、rifle 6、lmg 6、reusable_launcher 4、dmr 3、underbarrel_gl 3、disposable_launcher 6、radio_handheld 3、uav_micro 3、gpmg 1、agl 1；`slots_unassigned`：disposable_launcher 12；`isComplete = true`。与 `expected_personnel: 36`、`expected_equipment: {ifv: 4}` 一致。

**T2 跨级引用合计（`pla_tank_coy`）**
- 输入：`ComputeTotals(pla_tank_coy)`。
- 期望：`3 × 4 × 3 + 2 × 3 + 7 = 49` 人，`mbt = 14`，与原文一致。

**T3 型号继承优先级**
- 输入：营模板 `default_bindings: {mbt: ztz99a}`；其建制旅 `defaultBindings[mbt] = ztz96a`；营无覆盖。
- 期望：`ResolveModel = (ztz96a, Formation, 旅id)`。再设营覆盖 `mbt: ztz99` → `(ztz99, BattalionOverride)`。把该营配属给另一个默认 `mbt: m1a2_sepv2` 的旅 → 结果不变（建制链）。删除覆盖和旅默认 → `(ztz99a, BattalionTemplate)`。

**T4 平均分配（注水 + 最大余数）**
- 输入：同型号库存 A = 8；营 a/b/c（id 1/2/3）：target = [10, 10, 20]，held = [8, 2, 6]。
- 计算：比值 0.8/0.2/0.3 → 顺序 b, c, a；k=0：`(8+2)/10 = 1.0 > 0.3`；k=1：`ρ = (8+8)/30 = 0.5333 ≤ 0.8`。连续解 b = 5.333−2 = 3.333，c = 10.667−6 = 4.667，a = 0。取整 3 + 4 = 7，剩 1 → 小数部分最大的 c（0.667）+1。
- 期望：x = [a 0, b 3, c 5]。（A = 10 时期望 [0, 4, 6]，正好整除。）

**T5 优先整编**
- 输入：同 T4，A = 10，优先列表 [c, a, b]。
- 期望：c 缺 14 → 拿走全部 10；a、b 为 0。

**T6 替代装备与换装**
- 输入：营绑定 `mbt = t72b3`，target 31，持有 31 辆 `t72b`（替代）；库存到货 10 辆 `t72b3`。
- 期望（第 1 轮）：发 10 辆 `t72b3`，替换下 10 辆 `t72b` 退回库存（按相似度最低优先，相同则 item id 升序）；营 exact = 10，subst = 21；库存 `t72b` +10；`OnCrewModelChange` 触发 10 次（t72b → t72b3）。第 2 轮：营 `deficitAny = 0`，不再发替代。

**T7 指挥负荷与能力（`pla_heavy_cab`，模板检查）**
- 直接下级：2 坦克连、2 机步连、火力连、保障连（营部连 role hq 排除），gap 均为 1 → `N_eq = 6`。测试夹具给火力连写 `branch: fire_support`、保障连写 `branch: logistics`（M4 可选字段），以隔离公式。兵种份额：Armor 2/6、MechInfantry 2/6、FireSupport 1/6、Logistics 1/6 → `Σp² = (4+4+1+1)/36 = 0.2778`，`D = 1 + 0.5 × 0.7222 = 1.3611`，`loadEq = 8.1667`。（不写 branch 时按 §4.3 推导：火力连 = `AntiTank`（反坦克排 31 人份额最大），保障连为另一兵种 → 结果相同。）
- 指挥部：`pla_bn_hq`（聚合、无槽位）→ `Vehicle`（并出 W70），`hqHeadcount = 40` → `StaffFactor = clamp(√(40/20)=1.414, 0.5, 1.4) = 1.4`；`G_hq = 0.5` → `SkillFactor = 1.0`；`capacity = 7 × 1.0 × 1.0 × 1.4 = 9.8`。
- 期望：`r = 0.8333`，`orderDelayMultiplier = 1`，`coordinationFactor = 1`，`quality = (1.0 − 0.45)/1.1125 = 0.4944`；无 W50。

**T8 连级负荷（`pla_tank_coy`）**
- `N_eq = 3 × 1.0 + 2 × 0.6 = 4.2`，D = 1（全是 Armor），`loadEq = 4.2`。连部 `pla_tank_coy_hq`：7 人、有 `apc` → `Vehicle`；`StaffFactor = √(7/6) = 1.0801`；`capacity = 6 × 1.0 × 1.0 × 1.0801 = 6.4807`。
- 期望：`r = 0.6481`。

**T9 乘车不匹配**
- 输入：班 9 人，`ifv` 代表型号 `crew 3, capacity 4`；排 = 3 个此班 + 2 人排部（无车）。
- 期望：班级 W40 `{persons: 9, seats: 7}`；排 `personsPlt = 29 > seatsPlt = 21` → 排级 W40 Warning，班级 W40 保持 Warning（排内不能消化）。若把 `capacity` 改为 7（seats 10）：班级无问题；排 29 ≤ 30 → 无 W40。

**T10 超重**
- 输入：班模板含 `atgm_portable × 1`，代表型号质量 22 kg（03 未就绪，用 `massKg`）；该班在父排中出现 3 次。
- 期望：`weaponEchelon = Squad`，22 > 15 → W10 Warning `{massKg: 22, limitKg: 15}`，消息注明“未含弹药”。班里有 `ifv` → 降为 Info。若该班在父排中只出现 1 次 → `Platoon` 档 22 ≤ 30 → 无 W10。

**T11 自动生成（`sov_legacy / mech_inf_coy`）**
- 输入：`carrierModel` = 某步战车型号 `crew 3, capacity 7`；其余默认。
- 计算：`seatsForDismounts = 7 + max(0, 3 − 2) = 8`；`max_dismounts = 7` → 下车 7 人（squad_leader、mg_gunner、at_gunner、automatic_rifleman、assistant_gunner、rifleman、marksman）；班 = 2 车组 + 7 = 9 人。
- 期望：班 9 人，槽位 `{ifv 1, rifle 3, gpmg 1, reusable_launcher 1, lmg 1, dmr 1}`、`slots_unassigned {disposable_launcher 2}`；排 = 3 × 9 + 1 = 28 人；连 = 3 × 28 + 7（连部）+ 4（机枪组）= 95 人，`ifv = 3 × 3 + 1 = 10`。
- 换成 `crew 3, capacity 5` 的车：`seatsForDismounts = 6` → 去掉 `marksman`，班 8 人，并出 Info。同参数生成两次 → 模板 id 相同，匹配正则 `^[a-z]{3}_gen_sov_mech_inf_coy_(sq|plt|coy)_[0-9a-f]{8}$`。

**T12 职能重复与能力缺口**
- 输入 A：`pla_mech_inf_squad`（有 disposable_launcher 和 reusable_launcher）。期望：W20 Info，被覆盖者 = `disposable_launcher`。
- 输入 B：一个摩步连，子树只有 `rifle, lmg, radio_handheld`。期望：W30 `AntiLightArmor` Warning（0 件）、`AntiHeavyArmor` Info；无 Comms 缺口。

**T13 实例对齐**
- 输入：营模板 3 个连 → 改为 2 个连（删掉第 3 个 children 副本）。营内 `/x_coy#2` 子树有 30 人、10 件装备。
- 期望：`/x_coy#2` 子树删除，30 人与 10 件进 07 待编池；`/x_coy#0`、`/x_coy#1` 的节点 ID 不变；`reorganizingUntil = now + 86 400 000`；若该营在 `EdgeBattle` 中，则什么都不改，直到 `OnBattalionLeftBattle`。

**T14 直属队合成营**
- 输入：旅模板 children = [营 A × 3, 连 R × 1, 连 E × 1, 营 HQ(role hq) × 1]。
- 期望：建 1 个 Organic 编组，4 个普通营 + 1 个指挥部营 + 1 个 `isSyntheticDirect` 营（含 R、E 两个连，pathKey `/direct/R#0`、`/direct/E#0`）；`hqBattalionId` = HQ 营；直接下级 `N_eq = 3 + 1（直属营）= 4`（HQ 营排除）。

---

## 9. 验证建议（Python）

建议扩展 `tools/validate_data.py`，并新增 `tools/org_checks.py`（纯 Python，复用同一套 YAML，作为 C# 实现的参考答案）：

| 编号 | 验证 | 方法 | 通过标准 |
|---|---|---|---|
| V-01 | C# 与 Python 合计一致 | 对 data/templates 全部模板导出 `ComputeTotals` JSON，与 `totals()` 结果逐字段比对 | 100% 一致 |
| V-02 | 预设库“零警告” | 对全部预设模板运行 §4.14 的检查（用回退表） | 0 Error；Warning 只允许出现在白名单（原文自身的出入，需在模板 `notes` 中写明原因） |
| V-03 | 指挥负荷校准 | 计算所有营、旅、师预设模板的 `r`；画分布 | 美、解放军、苏式真实编制 `r ∈ [0.6, 1.05]`；超出的逐个解释或调 `BaseCapacity`/`DiversityWeight` |
| V-04 | 风格“接近最优” | 对每个风格的每个 archetype：自动生成连 vs 手工调优连，在 03 试验场标准地形上各跑 200 场（固定种子） | 胜率差 ≤ `StyleOptimalityTolerance` |
| V-05 | 分配算法性质 | 用 Python 参考实现随机生成 10 000 组输入（固定种子），检查：总量守恒、不超缺口、Even 的 max–min 公平（任意两营满编比差 ≤ 1/min(t)）、PriorityFill 前缀满编 | 全部通过；C# 对同一组输入输出相同 |
| V-06 | 确定性 | 同一编组模板实例化两次（新世界），比较全部 ID 与 pathKey；生成模板 id 与 Python FNV-1a 参考值比对 | 完全相同 |
| V-07 | MVP 可表达性 | 14 写好亚、阿 2010/2020 模板后：合计人数与 `expected_personnel` 误差 ≤ 10%；全部检查无 Error；营兵种推导与史料类型一致 | 通过 |
| V-08 | 多样性代价量级 | 对亚、阿开局装备清单算工具组与备件目标 | 多样性成本占年装备维护费的比例落在 5–20%（估算区间，供平衡参考） |

---

## 10. 待确认决策

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| O-01 | 苏式“团”等层级怎么表示 | `level: brigade` + 显示用 `echelon_label: regiment` | 不改 `OrgLevel` 枚举和校验脚本；团与旅在本游戏中作用相同 | 给 `OrgLevel` 追加 `Regiment = 8`（排序上与旅同级），所有比较改用 rank 表 |
| O-02 | 子模板层级必须严格低于父模板 | 是（新增校验） | 防止“营包含营”的歧义；现有数据满足 | 允许同级引用（如营包含营作为“营群”） |
| O-03 | 编组模板直接引用连/排/班如何落地 | 全部装进一个“直属队”合成营 | 营是最小控制单位；不让指挥部营因直属连受损而失能 | 并入指挥部营；或每个直属连各自成为一个营级地图单位 |
| O-04 | 预设模板可否直接修改 | 写时复制，默认改本国全部引用 | 预设库要保持干净，多国共用 | 允许直接改（影响所有国家） |
| O-05 | 模板改动对实例的落地 | 战斗中延后；结构性改动整编 24 h | 防止临战“无代价”大改；避免和 03/04 同时写一个营 | 立即生效、无整编时间 |
| O-06 | 临时编组规则 | 每个单位最多属于一个；不可嵌套；不在请求链上 | 总纲“纯操作便利、无机制效果”的最简实现 | 允许多重归属（标签式） |
| O-07 | 配属是否改变型号继承、练度归属、分配优先级 | 都不改，全部按建制 | 配属是临时的；避免装备/练度反复迁移 | 配属超过 N 天后转为永久调动 |
| O-08 | 跨类别替代 | 不允许 | 类别就是“同类”的定义 | 加 `substitutable_categories` 表，低优先级跨类别替代 |
| O-09 | 库存中的整件装备是否建实例 | 建 `EquipmentItem`（holder = 0），与 11 的交付/升级/退役设计一致 | 保留单件状态（二手品相、升级中）；阶段 1 数量级只有几万件 | 按（节点, 型号）计数，发放时才建实例（省内存，但丢掉单件状态） |
| O-10 | 简编/骨干营装备满编目标 | 三档都 1.0（缺的是人）；维护费按倍率降低 | 符合苏式简编/骨干部队的做法，亚、阿都继承 | 骨干营只配 50%，其余在中央仓库 |
| O-11 | 检查用的类别属性放在哪 | categories.yaml 可选字段 + 本文件默认表 | 模组可改；不写也能跑 | 全部写死在代码 |
| O-12 | 新增类别 | `loitering_munition`、`fpv_drone`、`body_armor`、`tbm_launcher` | 纳卡必需（与 03 C-18 一致） | 巡飞弹并入 `uav_*` |
| O-13 | 09 同时用指挥质量 q 和负荷比 r | 采用（q 管基础延迟，r 只在过载时起作用） | 好部班“下令快 + 管得多”两种收益都可见 | capacity 只由人数决定，通信/练度只进 q |
| O-14 | “预设接近最优”如何保证 | 每个风格 archetype 过 V-04（胜率差 ≤ 5%） | 把总纲原则变成可测试的门槛 | 只靠人工审 |
| O-15 | 装填模板归属 | 通用结构由 01 定义（与编制模板同一编辑器体系）；阶段 3 海军规格定义行为（回港、补弹） | 总纲 §5.2 说“和旅编制一样”；00 目前把 `VlsLoadoutTemplate` 暂挂 11 | 维持 11 占位，阶段 3 再定 |
| O-16 | 指挥负荷公式细节 | 下级当量按级差加权；多样性用 `1 + 0.5 × (1 − Σp²)`；能力含指挥部人数因子（平方根） | 符合“数量 × 多样性”；大指挥部是可见的取舍（人多、费钱、能管更多） | 多样性 = 兵种数；能力不含人数 |
| O-17 | 分配策略的作用范围 | 每国一个策略 + 优先列表；四轮顺序（正型号先于替代、常规先于不占编制） | 简单透明，接近“国防部长”视角 | 按编组分别设策略 |
| O-18 | 维护工具组 | 维护组织 = 建制旅（与 G-07 同）；按维护组（默认 = family）计；默认自动采购 | 让“统一系列”自然省钱；预设接近最优 | 按营计；不自动采购 |
| O-19 | 检查阈值 | 15 kg / 30 kg（总纲）；人均负重 33 kg；射程越格 60 km | 来自总纲与常见条令量级 | 由试验场校准后修改 |
| O-20 | 建制编组必须有指挥部营；指挥部营不能单独配属 | 是 | 总纲“建制编组有指挥部单位” | 允许无指挥部的建制编组（指挥能力取最小值） |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 |
|---|---|---|
| 兵种 | `Branch` | 模板/营的兵种分类（装甲、机步、炮兵……），用于指挥负荷多样性、能力缺口规则、自动生成、05 的类型情报。 |
| 显示层级名 | `echelonLabel`（数据 `echelon_label`） | 编组的显示名称（团、防区、集团军等），不影响机制（O-01）。 |
| 武器层级 | `weaponEchelon`（数据 `weapon_echelon`） | 班模板的武器属于班用/排用/连用，决定超重阈值和职能重复比较范围。 |
| 直属队合成营 | `isSyntheticDirect`（`OrgUnit` 字段） | 编组模板直接引用的连/排/班被装进的营级单位（O-03）。 |
| 路径键 | `pathKey` | 节点在营内的稳定路径（模板 id + 序号），用于模板对齐与存档定位。 |
| 型号来源 | `BindingSource` | 某营某类别型号的来源：营覆盖/编组继承/营模板/国家默认。 |
| 全军需求行 | `ForceRequirementRow` | `ForceRequirement` 的一行：(类别, 型号) 的满编需求、平时目标、持有、库存。 |
| 国家编制设置 | `CountryOrgSettings` | 每国的分配策略、优先列表、营内填充方式、国家默认型号、默认风格。 |
| 营内填充方式 | `ReorgFillMode` | `Consolidate` / `KeepStructure`，与 07 的 `ReorgPolicy` 对应。 |
| 库存索引 | `DepotIndex` | (国家, 型号) → 未发放装备实例集合。 |
| 指挥状态 | `CommandState` / `FormationCommandState` | 指挥负荷当量、指挥能力、比值、延迟倍率、协同系数、指挥质量、失能标志。 |
| 通信档 | `CommsTier` | 指挥部通信水平：无/手持/车载/数字化。 |
| 指挥质量 | `quality`（`GetCommandQuality`） | [0,1]，由通信档和指挥部练度归一化，供 09 使用。 |
| 指挥部失能 | `isHeadless` | 指挥部在位人数低于门槛或指挥部营被歼灭。 |
| 能力类别 | `CapabilityKind` | 能力缺口检查的能力（反重装甲、反轻装甲、高抛曲射、低空防空……）。 |
| 检查结果 | `CheckResult`（代码如 `W40_vehicle_capacity`） | 编辑器自动检查的一条结果，含严重度和数字。 |
| 传导报告 | `ImpactReport` | 模板修改对上级模板与全军需求、训练、采购的影响清单。 |
| 编制风格 / 连类型 | `OrgStyle` / `archetype` | 自动生成排班的规则表（`data/styles/`）。 |
| 生成参数 | `GenerateParams` | 自动生成的输入（风格、连类型、车型、排数、下车人数）。 |
| 维护组 | `maintenanceGroup` | 共用维护工具组的型号集合，缺省 = `family`。 |
| 维护组织 | `MaintenanceOrgKey` | 维护和练度的承载单位：建制旅，或自成一体的独立营。 |
| 工具组 | `ToolsetState` | 某维护组织对某维护组持有的维护/检测工具组套数。 |
| 装填模板（通用） | `LoadoutTemplate` / `host_classes` | 宿主装填单元的装填方案；阶段 3 的 `VlsLoadoutTemplate` 是其特例（O-15）。 |
