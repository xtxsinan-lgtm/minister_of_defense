from __future__ import annotations

import datetime as dt
import re
import sys

from .. import db
from ..db import DB_DIR
from .base import Context
from .connectors import REGISTRY
from .connectors.wikipedia import norm
from .http import Http
from .store import apply_observations


def build_context(eq, today: str) -> Context:
    ctx = Context(today=today)
    ctx.countries = {r[0] for r in eq.execute("SELECT iso3 FROM country")}
    idx = {}
    for r in eq.execute("SELECT id, name_zh, name_en FROM equipment"):
        for k in (r["id"], r["name_zh"], r["name_en"]):
            if k:
                n = norm(k)
                if n and n not in idx:
                    idx[n] = r["id"]
                elif n and idx.get(n) != r["id"]:
                    idx[n] = None       # 歧义：不参与匹配
    ctx.equipment_index = {k: v for k, v in idx.items() if v}
    return ctx


def run_connector(eq, connector, http=None, apply=False, today=None):
    today = today or dt.date.today().isoformat()
    http = http or Http()
    started = dt.datetime.now().isoformat(timespec="seconds")
    ctx = build_context(eq, today)
    raw = connector.fetch(http)
    obs = list(connector.parse(raw, ctx))
    stats = apply_observations(eq, obs, connector=connector.name, source_id=connector.source_id,
                               observed_at=today, apply=apply)
    eq.execute("INSERT INTO crawl_run (connector,started_at,finished_at,status,rows_seen,rows_changed,message)"
               " VALUES (?,?,?,?,?,?,?)",
               (connector.name, started, dt.datetime.now().isoformat(timespec="seconds"),
                "ok" if apply else "dry_run", len(obs), stats["new"] + stats["changed"], str(stats)))
    eq.commit()
    return stats


def main(args) -> int:
    d = DB_DIR if not args.db_dir else __import__("pathlib").Path(args.db_dir)
    if not args.connector:
        for name in sorted(REGISTRY):
            c = REGISTRY[name]()
            print(f"{name:<24}{c.description}")
        return 0
    if args.connector not in REGISTRY:
        print("未知连接器：", args.connector, "；可用：", ", ".join(sorted(REGISTRY)))
        return 1
    eq = db.connect(d / "equipment.sqlite")
    c = REGISTRY[args.connector]()
    stats = run_connector(eq, c, apply=args.apply)
    print(("已写库并追加观测文件：" if args.apply else "dry-run（未写入）：") + str(stats))
    return 0
