"""forcedb —— 军力量化数据库。

两个 SQLite 库：
  db/equipment.sqlite  装备库（全域：陆/空/海/导弹/防空/太空；库存、规格、来源、评分）
  db/toe.sqlite        陆军编制库（模板 → 层级 → 人员/装备槽位；全军数量级 orbat）
源数据（可审阅、可 diff）在 data/ 下：YAML（沿用本仓库 schema）与 data/forcedb/ 下的 CSV/YAML。
"""
__version__ = "0.1.0"
