"""确定性构建两个库：python3 -m forcedb build"""
from __future__ import annotations

from . import db
from .crawl import store
from .ingest import seed, sheets, world, yaml_repo


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
    n_eq += sheets.ingest_extra_equipment(eq)
    sheets.ingest_spec_annotations(eq)
    n_inv = sheets.ingest_inventory(eq)
    n_obs = store.replay(eq)

    toe = db.create_toe(d / "toe.sqlite")
    yaml_repo.ingest_specialties(toe, specialties)
    yaml_repo.ingest_slot_categories(toe, cats)
    templates = yaml_repo.load_templates()
    n_t = yaml_repo.ingest_templates(toe, templates)
    yaml_repo.rollup(toe, templates)
    n_o = yaml_repo.ingest_orbat(toe)
    n_b = sheets.ingest_brigade_classes(toe)
    n_d = sheets.compute_toe_demand(toe)

    n_w = world.ingest_world(eq, toe)
    for con in (eq, toe):
        con.commit()
    if verbose:
        print(f"equipment.sqlite: 装备 {n_eq}，库存行 {n_inv}，回放观测 {n_obs}；toe.sqlite: 模板 {n_t}，orbat 条目 {n_o}，旅级单位 {n_b}，编制需求条目 {n_d}；国别估算 {n_w}")
    return eq, toe
