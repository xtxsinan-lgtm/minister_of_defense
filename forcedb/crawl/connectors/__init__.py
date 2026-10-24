"""连接器注册表。新增数据源：写一个 Connector 子类，在 REGISTRY 里登记即可。"""
from .worldbank import WorldBankMilitary
from .wikipedia import WikipediaInventory, PROFILES

REGISTRY = {
    WorldBankMilitary.name: WorldBankMilitary,
    **{f"wikipedia:{p['id']}": (lambda p=p: WikipediaInventory(p)) for p in PROFILES},
}
