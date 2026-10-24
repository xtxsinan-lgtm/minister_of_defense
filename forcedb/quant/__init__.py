"""量化引擎：把装备/编制数据库里的参数折算成可比的“战力”，再聚合成中美军力对比。

两种模式（forcedb.quant.engine.Engine(mode=...)）：
  snapshot  使用作者文章/表格里已经算好的单位战力（article.* 键），按当前库存数量缩放。
            与文章结果一致；库存数量变了，结果随之变。
  recompute 用物理参数按公式重算（本包 formulas.py），并给出与快照的偏差，
            用来发现“公式 vs 手工调整”的出入。
"""
from .engine import Engine  # noqa: F401
