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
- 库存的存储与运输 → 06（本文件只定义“成品装备库存”的计数结构，见 O-09）。

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
    public ModelHandle model;
    public CategoryHandle slotCategory;     // 占用的槽位类别（= model.category，替代时也相同）
    public bool isUnassignedSlot;           // 占的是 slots_unassigned
    public SquadId holder;                  // 0 = 不在部队（在途或待编池，07 定义待编池）
    public EquipmentItemStatus status;
    public double usageHours;               // 累计使用小时（02 训练、03/04 作战、07 故障都会累加）
}

// 成品装备库存（未发放到部队的整件装备），按 (节点, 型号) 计数，不建实例（O-09）
public sealed class EquipmentDepotStock {
    public SortedDictionary<(NodeId node, ModelHandle model), int> count;  // NodeId 由 06 定义
    // 阶段 0 没有地图：所有库存记在 NodeId(0)“国家池”。
}
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
    public double orderDelayMultiplier;       // ≥ 1，给 09
    public double coordinationFactor;         // [CoordinationFloor, 1]，给 03
    public CommsTier comms; public int hqHeadcount; public double hqSkill;
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
| M2 | `data/schema/categories.yaml` | 新增类别：`loitering_munition`（巡飞弹发射单元，纳卡必需）、`tbm_launcher`（战术弹道导弹发射车：飞毛腿、圆点、伊斯坎德尔）、`atgm_team_vehicle`（不新增，复用 `atgm_vehicle`） | 否 |
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
| 6 | 有 `atgm_vehicle`、`atgm_heavy`、`assault_gun` 槽位，且无 `rifle` | `AntiTank` |
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
// 库存：EquipmentDepotStock 按型号汇总到 (model.category, model) 行
```

- 人员需求按专业同样汇总，输出给 02：`PersonnelRequirement[(bn, specialty)] = totals.personnelBySpecialty[s]`（满编），02 再乘在编比例。
- 刷新时机：模板/绑定/战备等级/编组变更时标记脏；在 `Calendar` 阶段（每 60 分钟）若脏则重算；界面打开时立即重算。

### 4.8 装备分配 `AllocateEquipment(country, scope)`

✅ 平均分配、优先整编、替代装备（总纲 §3.3）；一线优先来自 §9.12(5)。本算法是**纯函数式的分配计划 + 执行**，被以下调用者使用：
- 11：新装备交付入库后（每 60 分钟 `Calendar` 阶段，若当小时有交付）；
- 07：战时补充（`Calendar` 每 60 分钟）；
- 玩家：在全军装备面板点“应用分配”（立即，进入 `OrderIntake` 阶段处理）。

`scope` = 参与的营集合（缺省 = 本国全部营）。发放的装备从库存扣除，创建 `EquipmentItem`，状态 `InTransit`（06 决定到达时间；阶段 0 直接 `Active`）。

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
