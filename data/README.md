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
  templates/              编制模板（班 → 排 → 连 → 营 → 旅）
    us_army_*.yaml / usmc.yaml / us_sof.yaml
    pla_army_*.yaml / pla_other.yaml
  orbat/                  全军数量级数据（多少个旅、营、舰载直升机等）
tools/validate_data.py    引用完整性 + 人数汇总校验
```

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
  munitions: [...]         # 可用弹种（引用 air_munitions 等里的 id）
```

### 班模板 SquadTemplate
只有班模板直接带人员和装备槽位；槽位**只写类别**，不写型号（设计文档 3.1）。
```yaml
- id: pla_heavy_mech_inf_squad
  level: squad
  personnel: [{specialty: squad_leader, count: 1}, ...]
  slots:     [{category: ifv, count: 1}, ...]
  slots_unassigned: [...]  # 原文所说“不占编制”的武器（随车携带，随取随用）
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
- 只是某基准模板的小改动时，用 `variant_of` + `diff` 文字说明，再给出完整 children（游戏读取时不依赖 diff）。

## 尚未收录
- 原文中以图片形式给出的表格（排/连/营/旅级武器数量表、战力表、运输机/两栖舰表、战斗机参数表）不在文本里，未收录。
- 原文末尾（空中力量后半部分、海上力量、太空力量、阅兵后讨论）在提供给我的文本里被截断，未收录。
- 文中的战力评分公式和系数属于“分析方法”而非数据，只把评级档位放进了 `rating_scales.yaml`。
