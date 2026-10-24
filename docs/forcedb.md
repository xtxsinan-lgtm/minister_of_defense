# forcedb —— 军力量化数据库与引擎

把《2025 中美军事实力对比分析》的量化方法做成代码，并把支撑它的数据沉淀成两个可累积、可校验、可自动更新的数据库，
最终目标是**随时间追加观测值，实时量化中美军力，并可推广到全球任意国家**。

```
data/（可审阅、可 diff 的源数据）                       forcedb/（代码）                       db/（构建产物）
├─ equipment/ templates/ orbat/ schema/   本仓库既有 YAML ─┐
├─ forcedb/equipment/*.yaml               空/海/导弹/防空/投送装备 ─┤  build   ┌─ equipment.sqlite  装备库
├─ forcedb/inventory_seed.csv            库存                      ├────────▶ │
├─ forcedb/toe/brigade_classes.csv        旅级战力等级              │          └─ toe.sqlite        陆军编制库
├─ forcedb/models/*.yaml                  量化模型参数预设          │
└─ forcedb/observations/*.csv             爬虫追加的观测（带日期）──┘  replay
                                                                            quant.Engine ──▶ 中美军力对比表
```

**原则：数据库是源数据的确定性产物。** `python3 -m forcedb build` 随时可以从零重建；爬虫抓到的数据同时追加到
`data/forcedb/observations/*.csv`（进版本管理），`build` 会回放它们，所以重建不会丢数据。

## 快速开始

```bash
pip3 install pyyaml                 # 构建、引擎、爬虫只需要它；pytest 用于测试
python3 -m forcedb build            # 重建 db/equipment.sqlite 与 db/toe.sqlite
python3 -m forcedb score            # 复现文章：中国 418.8 / 美国 522.2 = 80.2%
python3 -m forcedb score --mode recompute --deviations   # 用公式重算，并列出和文章快照偏差大的条目
python3 -m forcedb rollup us_abct   # 任意编制模板的人数与装备汇总
python3 -m forcedb demand           # 编制内装备需求（编制库 × 旅级单位数）
python3 -m forcedb coverage         # 各国各类别的数据覆盖率与缺口清单
python3 -m forcedb crawl            # 列出爬取连接器；crawl <名字> [--apply]
python3 -m forcedb crosscheck       # 不同来源之间库存数量的差异
python3 -m forcedb macro            # 全球军费/兵力排名（来自世界银行连接器）
python3 -m forcedb world            # 俄日韩朝伊土英法德希波以 十二国估算（中/低/高）
python3 -m forcedb score --carrier-model airwing   # 航母改用作者的空中联队复合模型
python3 -m pytest -q                # 57 个测试
```

## 两个库

### equipment.sqlite —— 装备库（全域）

| 表 | 内容 |
|---|---|
| `country` | 164 个国家/地区（ISO3、中英文名、区域），推广到全球的骨架 |
| `source` | 来源注册表：表格、仓库 YAML、文章、爬虫；带 `reliability`（high/medium/low） |
| `domain` / `category` | 域（陆/空/防空/海/导弹/弹药/太空）与类别。陆军类别沿用仓库 `schema/categories.yaml`，空/海/导弹/太空类别见 `data/forcedb/categories_ext.yaml` |
| `equipment` | 装备型号（现 762 个：陆军 302、航空 184、防空 86、海上 63、导弹 13、弹药 114）。`raw_json` 保留原始记录，字段不丢 |
| `spec` | 规格键值（EAV，约 4800 条）。键名带单位后缀（`_km`、`_kg`…，同仓库 `data/README.md`）；`article.*` 是文章/表格里已算好的结果（快照） |
| `rating` / `rating_level` | 防护/火力/火控/机械化/信息化等档位（文章 1.5.2） |
| `inventory` | 库存：(国家, 军种, 装备, 口径 kind, role, as_of, 来源)。**同一键允许多个日期和多个来源 = 时间序列** |
| `v_inventory_latest` | 取值视图：每个 (国家,装备,口径,role) 先选来源可靠度最高者（同级取最新），再取它每个军种的最新一行 |
| `country_indicator` | 国家宏观指标（军费、占 GDP、兵力），逐年累积；现含世界银行 2015–2025 年 160 个国家的 5741 条数据 |
| `score` | 引擎输出缓存（按装备/模型版本/指标） |
| `crawl_run` / `crawl_staging` | 爬取日志；无法匹配到库内装备的条目（不会自动建装备，等人工/规则确认） |

### toe.sqlite —— 陆军编制库

| 表 | 内容 |
|---|---|
| `unit_template` | 1128 个编制模板（班→排→连→营→旅→师→军），含国家/军种/层级/角色/原文总人数；`raw_json` 保留完整记录 |
| `template_child` | 上下级（`child` 子单位 / `attached` 战时加强 / `subordinate` 隶属） |
| `template_personnel` / `template_slot` / `template_binding` / `template_rating` / `template_expected_equipment` | 班的人员专业、装备槽位（只写类别）、型号绑定、单位级评级、原文装备总数 |
| `rollup_personnel` / `rollup_equipment` | 递归汇总（构建时物化）。口径与 `tools/validate_data.py` 一致：只沿 `children`，含聚合单位时用原文总数回填 |
| `orbat_entry` | 全军数量级数据（点分路径 → 数值/文本，带 as_of 与来源），可追加新观测 |
| `brigade_class` | **量化用**：旅/团级“战力等级”（数量、基础火力规模、装备/机械化/信息化/后勤/准备度乘数、文章快照）与编制模板的映射 |
| `toe_demand` / `toe_demand_class` | **两库之间的桥**：Σ（旅级单位数 × 该模板每旅装备汇总），即“按编制应有多少”。例：16 个 ABCT × 87 = 1392 辆 M1 |
| `formation` | 现实中具体番号（暂空，留给后续爬取/填充） |

编制模板里的槽位只引用**装备类别**，具体型号靠 `template_binding`（营及以上的默认绑定）解析到装备库——这是仓库原有的设计，数据库保持不变。

## 量化方法如何落到代码

文章的三层结构：军种层靠美军各军种预算比例锚定；军种内部不同类型靠采购/运营成本横向折算；同类型战力按技术指标考核。
代码里对应 `forcedb/quant/formulas.py`（叶子公式，每个函数注明了对应的表格 sheet 和列）与 `forcedb/quant/engine.py`（聚合，对应“总计”sheet）。

| 域 | 基本单位 | 叶子公式（`formulas.py`） | 状态 |
|---|---|---|---|
| 陆军旅 | 美军一个 IBCT（LBCT）的战力 | `heavy_equipment_equivalents`（重装备折算满编班）、`brigade_power` = 基础火力规模 × 装备 × 机械化 × 信息化 × 后勤 × 准备度；`equipment_multiplier` = 分项档位几何平均 | `brigade_power` 已用于 recompute；其余公式已实现并有测试，但基础火力规模与各乘数目前取表格值（尚未由编制库/型号评级自动推导，见局限） |
| 炮兵/火箭军 | M109A6 炮 | `rocket_force_power`，炮兵按“每门战力 × 数量”，折算为战斗旅 | 快照 + 部分重算 |
| 防空 | 战斗旅等效 | 炮/导弹战力 = 射程、射高、速度、制导、展开时间等系数 | 快照（战力估算 `article.battery_power` 在库中） |
| 直升机 | UH-60 / AH-64 | `transport_helicopter_power`、`attack_helicopter_power`；预备役按 0.5 / 1/3 加权 | 快照 + 库存缩放 |
| 战斗机 | F/A-18E/F | `fighter_air_power`、`fighter_ground_power`（探测距离、射程、被探测距离、推重比、挂载、半径、速度） | 重算已移植并与表格对照 |
| 轰炸机/预警机/加油机/无人机/特种机 | 等效 F/A-18 | `bomber_ground_power`、`awacs_composite`+`awacs_to_fa18`、`tanker_composite`、`uav_composite` | 公式已移植；引擎在 snapshot 下用文章值 |
| 水面舰艇 | 垂发单元 VLS | `ship_firepower_vls`（武器 × 折算系数）+ `radar_vls` | 重算已移植（±3%） |
| 潜艇 | 垂发单元 | `submarine_power`；`detection_range_by_noise` | 重算与表格一致（1.000） |
| 航母/两栖舰 | 垂发单元（按出动架次 × 成本折算系数） | `carrier_vls_equivalent` | 快照 |
| 投送 | 24 小时投送吨数 | `transport_throughput_24h` | 快照 + 库存缩放 |
| 太空 | 按美军空军战力与预算比 | `engine.py` | 已实现 |

### 两种运行模式

* `snapshot`（默认）：使用文章/表格里已经算好的单位战力（`article.*`），按**当前库存数量**缩放——改了库存，结果跟着变。
  与表格“总计”一致：中国 418.8、美国 522.2、比值 80.21%。
* `recompute`：用物理参数按公式重算，并输出重算 vs 快照的偏差（`--deviations`）。偏差大的条目基本是文章里**人工调整过**的
  （例如苏-35、歼-10B 的制空战力，或某些旅级单位的每旅战力）。重算总比值约 81%，这个差距本身就是信息。

### 与文章发表数字的差异（诚实说明）

* 文章正文写“80%”，表格“总计”给 418.83 / 522.18 = **80.21%**；本引擎复现的是**表格**。正文里 418.9 / 521.5 / 80.33% 是更早版本（太空军战力 21.5）。
* 表格里有三处**硬编码的“总计”与逐行加总对不上**（运输舰中国合计 1894.6 vs 逐行 1631.0；预警机美国空军合计 375 vs 逐行 289；空军防空 75.85 vs 76.11）。
  为复现文章，snapshot 模式默认把差额加回（`article_compat`，每一条都写在 `data/forcedb/models/article_2025_08.yaml` 并在运行结果的备注里列出）；
  `--no-compat` 则按库里逐行自洽口径计算，中国比值为 80.34%。建议回表格里把这几处硬编码改成公式。
* 战斗机对地战力的“1000km 半径挂载量”在“分层级火力”表里没有这一列，库里的 `payload_1000km_kg` 是按文章结果**反推**的（`confidence` 以注释标明 estimated）。
* 近程防空/反潜/鱼雷的火力折算系数在“分层级火力”快照里被冲掉了，取自带实时公式的工作簿（0.25）。
* 本地存档的文章只有全文的前三分之一，第六章“折算标准”的文字没有读到，方法以表格公式为准。

## 你其他工作里的“更好的模型”（评估与整合情况）

读了另外两个工作簿（「航母战斗机」「军事规划」）和相关回答/文章，按“能否替代文章里的同类折算”逐项评估：

| 模型 | 出处 | 比文章里的折算好在哪 | 整合情况 |
|---|---|---|---|
| **航母空中联队复合模型** | 「航母战斗机」!航母战力；回答《舰载机用重型机好还是用中型机好》《076 与出云》《英国为什么不选 F-35C》 | 文章用“日最大出动架次 × 成本换算系数”。新模型把航母拆成索敌 CAP、反索敌 CAP、截击、空战、反舰饱和、对地支援 6 项（含隐身 8 项），考虑起飞点、回收数、机库/甲板面积、副油箱航程、CAP 阵位数/距离、编波等待——这正是你文章里说“峰值出动架次不是关键指标”的量化版。覆盖尼米兹、福特、福建、山东、黄蜂、004、076、美国级 LHA-8，以及英、法、印（2 艘）、意（2 艘）、日、西的航母/准航母 | **已整合**：`carrier_airwing.csv` + 8 型共 10 艘外国航母入库；`--carrier-model airwing` 切换。交叉验证：与文章原口径相比 福特 +2%、黄蜂 +1%、福建 +7%、山东 +13%，总比值 80.21% → 80.33%，说明两种独立方法互相印证 |
| **物理航程模型（布雷盖）** | 「航母战斗机」!性能计算；文章《全球四/五代机作战半径、载荷和推重比精算对比》 | 文章里的作战半径来自各国口径不一的公开数据；新模型用 空重/内油/载荷 + 升阻比 + 热效率 反推可比的作战半径与“给定半径下的载荷”，并能处理弹射/滑跃起飞重量差异 | **公式已移植并用 F-22 算例验证**（`breguet_radius_km`、`payload_for_radius_kg`）。逐机型的空重/内油/升阻比输入在「飞机参数2」里还没有批量导入；导入后可以取代库中按文章结果反推的 `payload_1000km_kg` |
| **导弹外形反推** | 「军事规划」!导弹 | 公开资料缺战斗部/重量时，由长度、直径估体积，重量 ∝ 体积、战斗部 ∝ 体积^0.6，给出可比的弹药威力 | 公式已移植并验证（`missile_*`），尚未接入弹药库存（弹药类别目前没有库存数据） |
| 垂发尺寸物理建模 | 「军事规划」!垂发（含红旗-9/标准-6/ESSM 的最大直径、长度、射程估算） | 为“舰艇火力 = 垂发单元”提供几何依据：同样一个坑能装多大的弹 | 未整合（解释性，不改变现有折算系数） |
| 2040 力量结构规划 | 「军事规划」!军事资产规划 / 2040 中美对比 | 按军种预算、单价规划未来装备数量，可用作情景推演 | 未整合；`inventory.kind='on_order'` 与 `as_of` 可以直接承载规划值，后续做“情景”模式 |
| 武器层级、反坦克分级 | 「中美军力对比」!武器层级、反坦克 | 按班/排/连/营/旅/集团军…各级配属哪类武器 | 已体现在编制库（模板槽位）里，未单独建表 |

结论：**文章里的几个折算已经被你后来的方法互相印证；差异最大的是山东舰（+13%）和若干人工调整过的战斗机/旅（recompute 报告里列出）。**
真正会改变结论的新信息主要在两处：隐身空联（`composite_stealth`，福建/004 的优势主要来自这里）和作战半径的物理一致化，这两块已经有数据/公式，等批量导入机型输入后可以切换为默认。

## 爬取框架

`forcedb/crawl/`：**连接器**（抓取 + 解析成归一化 `Observation`）→ **store**（与同一来源的历史比较，新增/变更/不变；
无法匹配的进暂存区；`--apply` 才写库并追加到 `data/forcedb/observations/*.csv`）→ 日志写入 `crawl_run`。

已有连接器：

| 名称 | 数据 | 可靠度 | 用途 |
|---|---|---|---|
| `worldbank` | 军费（美元、占 GDP、占政府支出）、武装力量人数，全球逐年 | high | 全球宏观底座、预算折算 |
| `wikipedia:us_aircraft` | “List of active United States military aircraft” 表格 | low | 交叉验证、发现新增（匹配不上的进 `crawl_staging`） |

新增数据源：写一个 `Connector` 子类（`fetch` + `parse`，输出 `Observation("inventory"|"indicator"|"staging", …)`），
在 `forcedb/crawl/connectors/__init__.py` 的 `REGISTRY` 里登记；在 `data/forcedb/sources.yaml` 里登记来源和可靠度。
`.github/workflows/forcedb-crawl.yml` 提供手动触发的定期刷新工作流（定时已注释，需要时打开）。

**多来源如何不打架**：`v_inventory_latest` 先按来源可靠度选“获胜来源”，所以 Wikipedia 即使日期更新也不会覆盖作者表格；
两者的出入用 `python3 -m forcedb crosscheck` 查看（目前 11 项差异 ≥15%，如 F-35A：表格 557 vs Wikipedia 302）。

## 推广到其他国家

已经用同一套方法估算了十二个国家：见 [十二国估算报告](forcedb_world_estimates.md) 与 [调研计划](forcedb_world_plan.md)。做法（“类比法”）：
数量取工作簿/公开清单，单位战力借库内已有装备类比并缩放，陆军按装备组成折算；每条记录带来源、置信度和类比理由，结果给出低/中/高区间。
新增国家只需在 `data/forcedb/countries/<ISO3>.yaml` 里写装备清单（格式见同目录已有文件与 `forcedb/ingest/world.py` 的文件头注释）。

通用步骤：

1. 在 `data/forcedb/countries.csv` 里已有 164 个国家/地区；新国家的装备写进 `data/forcedb/equipment/*.yaml`（同仓库 `models:` 格式），库存写进 CSV 或交给连接器。
2. `Engine(...).run(["CHN","USA","JPN"])` 对任意国家对工作；基准国默认美国（`--ref` 可换）。
3. 国家间制度差异放在预设里：例如 `service_structure`（中国陆战队并入海军，美国单列）、`projection.bonus_countries`（只有美国有海外基地加成）。
4. 没有装备数据的国家，先用 `macro`（军费/兵力）做粗估；`coverage` 会列出每个国家缺哪些类别。

## 已知局限（后续工作）

* 装备**数量**目前只覆盖文章涉及的中美航空、海军、导弹、防空、炮兵、直升机、投送；陆军枪械/车辆数量用 `toe_demand`（按编制）代替实际库存，`coverage` 能看到 110 余个类别（含弹药、卫星、战略核潜艇、洲际导弹）还没有库存。核力量按文章口径不计入。
* 防空营战力、投送周转量只做了快照 + 数量缩放；航母有两种口径（文章快照 / 空中联队模型），叶子公式（表格里的手工系数）还没有完全移植。
* 太空力量只做了按预算比的折算，没有卫星级别的装备建模。
* Wikipedia 连接器目前只配了美军航空；中国、海军、陆军清单页需要各自的 profile（`PROFILES`）和名称映射。
* 乘数档位（防护/火力/火控）目前以表格里的最终乘数入库；从装备型号的 `ratings` 自动推出旅乘数是下一步。
