from __future__ import annotations

import sqlite3
from pathlib import Path

from .schema import EQUIPMENT_DDL, TOE_DDL

ROOT = Path(__file__).resolve().parent.parent
DB_DIR = ROOT / "db"
DATA = ROOT / "data"


def connect(path: Path | str) -> sqlite3.Connection:
    con = sqlite3.connect(str(path))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def create(path: Path | str, ddl: str) -> sqlite3.Connection:
    """新建空库（已存在则先删除；库是由源数据确定性构建出来的产物）。"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        p.unlink()
    con = connect(p)
    con.executescript(ddl)
    return con


def create_equipment(path=None) -> sqlite3.Connection:
    return create(path or DB_DIR / "equipment.sqlite", EQUIPMENT_DDL)


def create_toe(path=None) -> sqlite3.Connection:
    return create(path or DB_DIR / "toe.sqlite", TOE_DDL)
