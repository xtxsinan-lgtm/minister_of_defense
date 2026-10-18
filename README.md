# 战争部长 / Minister of Defense

一款以现代国防装备采购和部队编制为核心的硬核军事战略游戏（1990–2025）。

玩家扮演一个国家的国防部长，在固定的国防预算内采购装备、设计各级编制、扩建军工产能、组织联合演习，并在战争中检验自己的选择。

## 🌐 V8 交互式网页推演原型（在线试玩）

- **GitHub Pages 在线地址**：**[https://xtxsinan-lgtm.github.io/minister_of_defense/](https://xtxsinan-lgtm.github.io/minister_of_defense/)**
- **网页原型源码**：[`web/v8_playtest/`](web/v8_playtest/)（根目录同步部署）

## 📚 文档与规格体系

- [设计总纲 v0.1](docs/design_doc_v0.1.md)：核心设计原则与顶层索引。
- [系统详细规格 (`docs/spec/00`–`15`)](docs/spec/)：
  - [`00_glossary.md`](docs/spec/00_glossary.md) — 术语表、ID 命名规则、单位约定与跨文件契约
  - [`01_org_templates.md`](docs/spec/01_org_templates.md) — 编制模板、型号绑定与装备分配
  - [`02_personnel_training.md`](docs/spec/02_personnel_training.md) — 人员、练度、老兵传帮带 (`DC-001`) 与整备改革 (`DC-009`)
  - [`03_squad_combat.md`](docs/spec/03_squad_combat.md) — 班级交战模拟、携行重量拐点与压制模型
  - [`04_strip_layer.md`](docs/spec/04_strip_layer.md) — 条带层与五阶段推进 (`DC-023` 单一 `advanceKm`)
  - [`05_recon_exposure.md`](docs/spec/05_recon_exposure.md) — 侦察、暴露度与传感器融合
  - [`06_logistics.md`](docs/spec/06_logistics.md) — 后勤网络流、走廊切断与关键节点分析 (`KeyNodeReport`)
  - [`07_damage_repair.md`](docs/spec/07_damage_repair.md) — 损伤、野战抢修与补充
  - [`08_air_ops.md`](docs/spec/08_air_ops.md) — 空中作战、防空电磁静默 (`EMCON`) 与 SEAD/DEAD
  - [`09_time_orders.md`](docs/spec/09_time_orders.md) — 时间推进、命令延迟 (`DC-010`)、战斗触发与回放
  - [`10_map_data_pipeline.md`](docs/spec/10_map_data_pipeline.md) — H3 六角格、OSM、高程与地表覆盖离线管线
  - [`11_strategic_layer.md`](docs/spec/11_strategic_layer.md) — 预算、采购、产能、政治与事件
  - [`12_ai.md`](docs/spec/12_ai.md) — 战术 AI、作战层 AI 与国家战略 AI
  - [`13_ui.md`](docs/spec/13_ui.md) — 界面线框图、争议地名动态切换 (`DS-044`) 与兵牌切换 (`DS-027`)
  - [`14_scenario_nk.md`](docs/spec/14_scenario_nk.md) — 2010–2020 纳卡剧本设定、编制与停火条件
  - [`15_save_determinism.md`](docs/spec/15_save_determinism.md) — 存档、随机种子与跨平台确定性
- [一致性审查与 90 项核心决策记录 (`docs/review/`)](docs/review/)：
  - [`decision_cards.md`](docs/review/decision_cards.md) — 全部 90 张 A 类设计决策卡（含 9 项用户指定覆写）
  - [`consistency_report.md`](docs/review/consistency_report.md) — 跨系统公式、签名与数值契约一致性审查报告
- [数值验证报告 (`docs/validation/V1`–`V8`)](docs/validation/)：
  - [`report_v1_v5_v6.md`](docs/validation/report_v1_v5_v6.md) — V1 配属规律自然涌现、V5 无敌打法搜索、V6 性能基准
  - [`report_v2.md`](docs/validation/report_v2.md) — V2 2020 纳卡 44 天战争与 V2b 2016 四日战争复现校准
  - [`report_v3_v7.md`](docs/validation/report_v3_v7.md) — V3 纳卡后勤网络与拉钦走廊切断、V7 决策密度与命令延迟审计
  - [`report_v4.md`](docs/validation/report_v4.md) — V4 2010–2020 十年建军策略搜索与平衡性证明
  - [`report_v8_web_playtest.md`](docs/validation/report_v8_web_playtest.md) — V8 交互式网页推演原型验证报告
- [数据目录 (`data/`)](data/README.md)：中美编制与装备参数（YAML）及纳卡 MVP 剧本数据（`data/equipment/`、`data/templates/`、`data/scenarios/`）。