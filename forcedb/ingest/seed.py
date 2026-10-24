"""字典表种子：国家、域、来源、类别扩展。"""
from __future__ import annotations

import csv

from ..db import DATA
from .common import load_yaml

FORCEDB_DATA = DATA / "forcedb"

DOMAINS = [
    ("land", "陆上装备"), ("air", "航空装备"), ("air_defense", "防空装备"), ("sea", "海上装备"),
    ("missile", "导弹/火箭军"), ("munition", "弹药"), ("space", "太空装备"),
]

# 仓库 categories.yaml 的 group → 域
GROUP_DOMAIN = {
    "small_arms": "land", "anti_armor": "land", "fire_support": "land", "artillery": "land", "armor": "land",
    "vehicle": "land", "sensor": "land", "c4i": "land", "personal_equipment": "land", "deception": "land",
    "uav": "air", "aircraft": "air", "air_defense": "air_defense",
    "air_munition": "munition", "ground_munition": "munition",
}


def seed_countries(con):
    path = FORCEDB_DATA / "countries.csv"
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            con.execute("INSERT OR REPLACE INTO country VALUES (?,?,?,?)",
                        (r["iso3"], r["name_zh"], r["name_en"], r["region"]))


def seed_domains(con):
    con.executemany("INSERT INTO domain VALUES (?,?)", DOMAINS)


def seed_sources(con):
    for r in load_yaml(FORCEDB_DATA / "sources.yaml")["sources"]:
        con.execute("INSERT OR REPLACE INTO source VALUES (?,?,?,?,?,?,?)",
                    (r["id"], r["kind"], r.get("title"), r.get("url"), r.get("retrieved_at"),
                     r.get("reliability"), r.get("notes")))


def seed_categories(con, repo_categories: list):
    """仓库既有类别 + data/forcedb/categories_ext.yaml 的空/海/导弹/太空扩展类别。"""
    for c in repo_categories:
        con.execute("INSERT INTO category VALUES (?,?,?,?)",
                    (c["id"], c["name"], c.get("group"), GROUP_DOMAIN.get(c.get("group"), "land")))
    ext = FORCEDB_DATA / "categories_ext.yaml"
    if ext.exists():
        for c in load_yaml(ext)["categories"]:
            con.execute("INSERT INTO category VALUES (?,?,?,?)", (c["id"], c["name"], c.get("group"), c["domain"]))
