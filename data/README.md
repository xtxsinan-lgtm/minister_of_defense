# 数据目录（编制 + 装备参数）

来源：作者知乎长文《中美军力结构性对比与量化分析》（2025-08，含 2026-06 注）。
本目录把文中的**编制**和**武器参数**整理成游戏可直接读取的 YAML，结构对齐 [设计文档 v0.1](../docs/design_doc_v0.1.md) 第 3、8 节。

## 目录结构

```text
data/
  schema/
    categories.yaml       装备类别（班模板槽位只引用类别，见设计文档 3.1）
    specialties.yaml      人员专业（练度、训练学校产能按专业计，见 4.3）
    rating_scales.yaml    文中的防护 / 火力 / 火控 / 机械化 / 信息化档位
  equipment/              装备型号 EquipmentModel
    ground_vehicles.yaml  坦克、步战车、装输、轻型战术车、卡车
    infantry_weapons.yaml 枪械、榴弹发射器、火箭筒、单兵反坦克/防空导弹
    fire_support.yaml     迫击炮、身管火炮、火箭炮、反坦克导弹车、炮兵雷达
    air_defense.yaml      高炮、弹炮合一、防空导弹
    uav.yaml              各级无人机
    helicopters.yaml      直升机、倾转旋翼机
    air_munitions.yaml    空空弹、空地弹、反辐射弹、反舰弹、制导炸弹、布撒器
    ground_munitions.yaml 地面弹药（枪弹、炮弹、迫弹、火箭弹、反坦克导弹弹体、战术弹道导弹弹体；DC-206）
    nk_models.yaml        纳卡战区专有型号（亚、阿及供应国的平台、发射单元、巡飞弹、TB2 弹药；来源键见文件头）
  templates/              编制模板（班 → 排 → 连 → 营 → 旅）
    us_army_*.yaml / usmc.yaml / us_sof.yaml
    pla_army_*.yaml / pla_other.yaml
    arm_sov_legacy.yaml / aze_sov_legacy.yaml   亚美尼亚 / 阿塞拜疆苏式编制（含战术导弹营、巡飞弹连/营）
  orbat/                  全军数量级数据（多少个旅、营、舰载直升机等）；arm/aze 只有数字，不引用模板
  scenarios/              剧本（14 负责；校验脚本只检查其中的型号/模板/类别引用）
tools/validate_data.py    引用完整性 + 人数汇总校验
```

> 原 `data/equipment_pending/`、`data/templates_pending/`（等待 01 M2 新类别的型号与模板）已在 M2 落地后并入
> `nk_models.yaml` 与 `arm_sov_legacy.yaml` / `aze_sov_legacy.yaml`，两个目录已删除。纳卡专有型号统一放在 `nk_models.yaml`
> （不按类别拆进 uav.yaml / fire_support.yaml，因为这些文件的 `confidence: stated` 指知乎原文，来源约定不同）。

## 约定

### 通用字段
- `id`：全局唯一的 snake_case 字符串。装备 id 用型号（`ztz99a`、`m1a2_sepv2`），模板 id 前缀国家/军种（`us_abct_…`、`pla_heavy_…`）。
- `name`：原文中的叫法；`name_en` 可选。
- `confidence`：`stated`（原文明确给出，默认，可省略）/ `estimated`（原文写“估计”“猜测”“推测”）/ `uncertain`（原文自相矛盾或说法不一）。
- `notes`：原文里有参考价值但不好结构化的说明，尽量保留原话要点。
- 原文没给的数值**不填**（不臆造）。服役年份 `service_year`、单价 `cost_musd` 原文大多没给，后续再补。

### 单位
字段名带单位后缀：`_km`、`_m`、`_kg`、`_t`、`_kph`、`_mach`、`_mm`、`_min`、`_rpm`（发/分钟）、`_musd`（百万美元）。区间写成 `[min, max]`。

### 装备型号 EquipmentModel（对应设计文档 §8）
```yaml
- id: ztz99a
  name: ZTZ-99A
  category: mbt            # → schema/categories.yaml
  family: ztz99            # 型号相似度系数可按 family 推导（设计文档 4.2）
  origin: CHN              # ISO 3166 alpha-3
  crew: 3
  specs: { ... }           # 自由键值，单位见上
  ratings:                 # → schema/rating_scales.yaml 中的档位 id
    protection: mbt_99a
    firepower: fp_99a
    fire_control: fc_auto_track
  munitions: [...]         # 可用弹种（引用 air_munitions / ground_munitions / nk_models 里的弹药 id）
```

### 弹药与发射单元（DC-205 ①、DC-206 ①）
- 弹药也是 `EquipmentModel`，类别属于 `group: air_munition` 或 `group: ground_munition`（见 categories.yaml），按**发/枚**计库存（06 Ammunition）。
  弹药型号带 `munition:` 键（03 `MunitionProfile`；空中扩展写在 `munition.air`，08 §3.2.2）。
- **弹药类别不得出现在班模板 `slots` / `slots_unassigned` 里**（校验脚本报 ERROR）。槽位写的是发射/射击它的装备。
- 巡飞弹：型号（`harop` 等，类别 `loitering_munition`）就是弹药，一枚 = 一件；发射车/发射箱/弹射架是 `loitering_launcher` 类别的独立型号
  （`harop_launcher` 等），班模板槽位写 `loitering_launcher`。
- 战术弹道导弹同理：发射车 `tbm_launcher`（`scud_b` 等，按“部”），弹体 `tbm_missile`（`r17_scud_b` 等，按“枚”）。
- 发射单元/武器用顶层 `munitions: [弹药 id, ...]` 列出可用弹药（03 `WeaponProfile` 数据就绪后迁到 `weapon.munitions`）；校验脚本检查这些 id 存在。

### 班模板 SquadTemplate
只有班模板直接带人员和装备槽位；槽位**只写类别**，不写型号（设计文档 3.1）。
```yaml
- id: pla_heavy_mech_inf_squad
  level: squad
  personnel: {squad_leader: 1, vehicle_gunner: 1, ...}   # 专业 → 人数（等价于设计文档 §8 的 [{specialty, count}]）
  slots:     {ifv: 1, rifle: 2, ...}                     # 类别 → 数量
  slots_unassigned: {disposable_launcher: 4}             # 原文所说“不占编制”的武器（随车携带，随取随用）
```
排部、连部、营部以及直属侦察、通信、医疗等单位，也写成 `level: squad` 的特殊班模板（`role: hq` / `role: support`）。

### 上级模板 UnitTemplate
```yaml
- id: pla_heavy_mech_inf_platoon
  level: platoon           # platoon | company | battalion | brigade | division | corps
  children: [{template: pla_heavy_mech_inf_squad, count: 3}, ...]
  attached: [...]          # 战时加强（不在本级编制内）
  default_bindings: {mbt: ztz99a, ifv: zbd04a}   # 型号继承（设计文档 3.2），只在营/旅上写
  expected_personnel: 116  # 原文给出的总人数，校验脚本用来比对
```
- 旅部、师部做成 `role: hq` 的特殊营。
- 只是某基准模板的小改动时，写 `variant_of` 并在 `notes` 里说明差异，同时给出完整 children（读取时不依赖 variant_of）。
- `role: equipment_pool`：不占人员、只放排/连/旅共用装备的伪班（比如“每排 2 具标枪”“旅后勤营的卡车”）。
- `granularity: aggregate`：原文只给到这一级的职能或总数，内部没细分。**汇总人数时，如果子树里有聚合单位，就用该级的 `expected_personnel` 回填**，所以旅级总人数仍与原文一致。
- `us_*bct_residual_pool`：原文旅级车辆总数减去各营已建模的车辆，保证全旅采购需求与原文一致。
- `attached`：战时加强（医护兵、前观员、前线支援连），不计入本级总数，避免和提供方重复计算。
- `unit_ratings`：原文 1.5.2 的单位级档位（机械化、信息化、后勤、准备度）。
- **层级规则（01 §3.4.1，O-02 / DC-070）**：`children` 里的子模板 level 必须**严格低于**本模板（可以跨级，如旅直接引用连）。
  同级嵌套（如“加强营”里含一个完整营）时把外层上调一级，并用 `echelon_label` 写显示名（`battalion_landing_team`、`meb` 等）。
  `default_bindings` 只写在营及以上；`echelon_label` 只写在旅及以上。
- `subordinate_formations`（仅 `pla_theater_army` 使用）：记录高于 corps 的隶属关系，不计入合计；01 只有七级，见审查报告 D 的请求。

## 校验

```bash
pip3 install pyyaml
python3 tools/validate_data.py            # 引用完整性 + 与原文总数比对
python3 tools/validate_data.py --summary  # 额外列出各营/旅/师的人数和主要装备
```

检查项：id 格式与全局唯一（跨类别/专业/型号/模板，01 §4.1）；类别、专业、评级、型号、`upgrade_of`、`munitions` 引用存在；
子模板层级严格更低；`equipment_pool` 不带人员；绑定只在营以上；弹药类别不进槽位；`confidence` 取值；COVERAGE 清单（前缀 us_/pla_/usmc_/arm_/aze_）；
剧本 `data/scenarios/**` 的型号、模板、类别引用与 oob 层级（只报告，标 `ERROR[剧本]`）。

当前结果：0 个错误；剩余警告全部来自原文自身的数字出入（如 IBCT 营 581 人与各连人数加不拢、陆战队反坦克排分项 50 ≠ 总数 41），已在对应模板的 `notes` 中注明。

## 覆盖情况

[COVERAGE.md](COVERAGE.md) 逐节列出原文每个编制单位对应的模板 id 和拆分深度；校验脚本会检查清单里的 id 都存在。

## 尚未收录
- 原文中以图片形式给出的表格（排/连/营/旅级武器数量表、战力表、运输机/两栖舰表、战斗机参数表）不在文本里，未收录。
- 原文末尾（空中力量后半部分、海上力量、太空力量、阅兵后讨论）在提供给我的文本里被截断，未收录。
- 文中的战力评分公式和系数属于“分析方法”而非数据，只把评级档位放进了 `rating_scales.yaml`。
