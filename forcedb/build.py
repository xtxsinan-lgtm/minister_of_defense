"""确定性构建两个库：python3 -m forcedb build"""
from __future__ import annotations

from . import db
from .ingest import seed, yaml_repo


def build(db_dir=None, verbose=True):
    d = db_dir or db.DB_DIR
    cats, specialties, scales = yaml_repo.load_schema()

    eq = db.create_equipment(d / "equipment.sqlite")
    seed.seed_domains(eq)
    seed.seed_countries(eq)
    seed.seed_sources(eq)
    seed.seed_categories(eq, cats)
    yaml_repo.ingest_rating_levels(eq, scales)
    n_eq = yaml_repo.ingest_equipment(eq)

    toe = db.create_toe(d / "toe.sqlite")
    yaml_repo.ingest_specialties(toe, specialties)
    yaml_repo.ingest_slot_categories(toe, cats)
    templates = yaml_repo.load_templates()
    n_t = yaml_repo.ingest_templates(toe, templates)
    yaml_repo.rollup(toe, templates)
    n_o = yaml_repo.ingest_orbat(toe)

    for con in (eq, toe):
        con.commit()
    if verbose:
        print(f"equipment.sqlite: 装备 {n_eq}；toe.sqlite: 模板 {n_t}，orbat 条目 {n_o}")
    return eq, toe
