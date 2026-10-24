"""两个库的 DDL。所有来源、置信度、时间戳都是一等公民：数据库的用途是随时间追加观测值，
而不是只存一份静态快照（见 docs/forcedb.md）。"""

EQUIPMENT_DDL = """
PRAGMA foreign_keys = ON;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE country (
  iso3 TEXT PRIMARY KEY, name_zh TEXT, name_en TEXT, region TEXT
);

-- 每条数据都要能追到来源：表格、仓库 YAML、网页、爬虫、人工
CREATE TABLE source (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('spreadsheet','yaml','article','web','crawler','manual')),
  title TEXT, url TEXT, retrieved_at TEXT,
  reliability TEXT CHECK (reliability IN ('high','medium','low') OR reliability IS NULL),
  notes TEXT
);

CREATE TABLE domain (id TEXT PRIMARY KEY, name_zh TEXT NOT NULL);

CREATE TABLE category (
  id TEXT PRIMARY KEY, name_zh TEXT NOT NULL, grp TEXT,
  domain TEXT NOT NULL REFERENCES domain(id)
);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL, name_en TEXT,
  category TEXT NOT NULL REFERENCES category(id),
  domain TEXT NOT NULL REFERENCES domain(id),
  family TEXT,
  origin TEXT REFERENCES country(iso3),
  generation TEXT,
  status TEXT,
  intro_year INTEGER,
  crew INTEGER,
  confidence TEXT CHECK (confidence IN ('stated','estimated','uncertain') OR confidence IS NULL),
  source_id TEXT REFERENCES source(id),
  notes TEXT,
  raw_json TEXT            -- 导入时的完整原始记录，字段不丢
);
CREATE INDEX ix_equipment_category ON equipment(category);
CREATE INDEX ix_equipment_domain ON equipment(domain);

-- 规格：键值（EAV）。键名带单位后缀的约定沿用仓库 data/README（_km、_kg、_mach ...）
CREATE TABLE spec (
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  num REAL, text TEXT, unit TEXT,
  confidence TEXT, source_id TEXT REFERENCES source(id),
  PRIMARY KEY (equipment_id, key)
);
CREATE INDEX ix_spec_key ON spec(key);

CREATE TABLE rating (
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL, level_id TEXT NOT NULL,
  PRIMARY KEY (equipment_id, dimension)
);

CREATE TABLE rating_level (
  id TEXT PRIMARY KEY, scale TEXT NOT NULL, idx INTEGER NOT NULL,
  step_multiplier REAL, description TEXT
);

-- 库存：同一 (国家, 军种, 装备, 口径) 允许多个 as_of —— 这就是时间序列
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL REFERENCES country(iso3),
  service TEXT NOT NULL DEFAULT 'all',        -- army/navy/airforce/marines/rocket/space/all
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  kind TEXT NOT NULL DEFAULT 'active'
       CHECK (kind IN ('active','reserve','storage','on_order','production_per_year','in_toe','total')),
  role TEXT NOT NULL DEFAULT 'all',            -- 同一装备参与不同量化口径时的数量，如 air_superiority / ground_attack
  quantity REAL NOT NULL,
  as_of TEXT NOT NULL,                         -- ISO 日期
  source_id TEXT REFERENCES source(id),
  confidence TEXT CHECK (confidence IN ('stated','estimated','uncertain') OR confidence IS NULL),
  notes TEXT,
  UNIQUE (country, service, equipment_id, kind, role, as_of, source_id)
);
CREATE INDEX ix_inventory_country ON inventory(country, equipment_id);

-- 量化引擎输出缓存：每个 (装备, 模型版本, 指标) 一条
CREATE TABLE score (
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  model TEXT NOT NULL, metric TEXT NOT NULL,
  value REAL NOT NULL, computed_at TEXT,
  PRIMARY KEY (equipment_id, model, metric)
);

-- 爬虫运行日志
CREATE TABLE crawl_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connector TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT CHECK (status IN ('ok','partial','failed','dry_run')),
  rows_seen INTEGER, rows_changed INTEGER, message TEXT
);

-- 最新库存视图：每个 (国家,军种,装备,口径) 取 as_of 最新的一条
CREATE VIEW v_inventory_latest AS
SELECT i.* FROM inventory i
WHERE i.as_of = (SELECT MAX(j.as_of) FROM inventory j
                 WHERE j.country=i.country AND j.service=i.service
                   AND j.equipment_id=i.equipment_id AND j.kind=i.kind AND j.role=i.role);
"""

TOE_DDL = """
PRAGMA foreign_keys = ON;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE specialty (id TEXT PRIMARY KEY, name_zh TEXT, grp TEXT, raw_json TEXT);

-- 装备类别只在编制槽位里被引用；类别定义的权威副本在 equipment.sqlite，这里保留 id 以便独立校验
CREATE TABLE slot_category (id TEXT PRIMARY KEY, name_zh TEXT, grp TEXT);

CREATE TABLE unit_template (
  id TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL, name_en TEXT,
  country TEXT NOT NULL,
  service TEXT,                -- army/marines/sof/... 由来源文件推断
  level TEXT NOT NULL CHECK (level IN ('squad','platoon','company','battalion','brigade','division','corps')),
  role TEXT,                   -- hq/support/equipment_pool/NULL
  echelon_label TEXT,
  granularity TEXT,            -- aggregate = 原文只给总数
  variant_of TEXT,
  expected_personnel INTEGER,
  confidence TEXT CHECK (confidence IN ('stated','estimated','uncertain') OR confidence IS NULL),
  source_file TEXT,
  notes TEXT,
  raw_json TEXT
);
CREATE INDEX ix_template_country_level ON unit_template(country, level);

CREATE TABLE template_child (
  parent TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  child TEXT NOT NULL REFERENCES unit_template(id),
  count INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('child','attached','subordinate')),
  ord INTEGER NOT NULL,
  PRIMARY KEY (parent, child, kind, ord)
);

CREATE TABLE template_personnel (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL REFERENCES specialty(id), count INTEGER NOT NULL,
  PRIMARY KEY (template, specialty)
);

CREATE TABLE template_slot (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  category TEXT NOT NULL, count INTEGER NOT NULL,
  assigned INTEGER NOT NULL DEFAULT 1,   -- 0 = 原文“不占编制”的随车携带武器
  PRIMARY KEY (template, category, assigned)
);

CREATE TABLE template_binding (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  category TEXT NOT NULL, equipment_id TEXT NOT NULL,     -- equipment_id 指向 equipment.sqlite
  PRIMARY KEY (template, category)
);

CREATE TABLE template_rating (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL, level_id TEXT NOT NULL,
  PRIMARY KEY (template, dimension)
);

CREATE TABLE template_expected_equipment (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  category_expr TEXT NOT NULL, count INTEGER NOT NULL,      -- category_expr 可为 'a+b'
  PRIMARY KEY (template, category_expr)
);

-- 递归汇总（构建时物化；只沿 child 边，不含 attached，与 tools/validate_data.py 一致）
CREATE TABLE rollup_personnel (
  template TEXT PRIMARY KEY REFERENCES unit_template(id) ON DELETE CASCADE,
  personnel INTEGER NOT NULL, complete INTEGER NOT NULL, from_fallback INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE rollup_equipment (
  template TEXT NOT NULL REFERENCES unit_template(id) ON DELETE CASCADE,
  category TEXT NOT NULL, count REAL NOT NULL,
  PRIMARY KEY (template, category)
);

-- 全军数量级（orbat）：多少个旅、多少台装备。每条都有 as_of 与来源，可追加新观测
CREATE TABLE orbat_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  path TEXT NOT NULL,          -- 点分路径，如 army.bct_counts.active_abct_tanks_in_toe
  num REAL, text TEXT,
  template_id TEXT REFERENCES unit_template(id),   -- 若该条目对应某编制模板（“N 个该类单位”）
  as_of TEXT, source_id TEXT, confidence TEXT, notes TEXT
);
CREATE INDEX ix_orbat_country ON orbat_entry(country, path);

-- 旅/团级“战力等级”：数量 × 每旅战力，每旅战力 = 基础火力规模 × 装备 × 机械化 × 信息化 × 后勤 × 准备度
-- （表格“乘数”）。snapshot_* 为文章结果快照，引擎 recompute 模式用乘数重算并与之对照。
CREATE TABLE brigade_class (
  id TEXT PRIMARY KEY, country TEXT NOT NULL, label TEXT NOT NULL,
  service TEXT NOT NULL,                 -- army/marines/airforce（决定计入哪个军种的地面力量）
  template_id TEXT REFERENCES unit_template(id),
  count REAL NOT NULL,
  base_fire_scale REAL, equip_mult REAL, mech_mult REAL, info_mult REAL, logistics_mult REAL, readiness_mult REAL,
  apply_logistics INTEGER NOT NULL DEFAULT 1,
  snapshot_power REAL, snapshot_total REAL,
  source_id TEXT, as_of TEXT, notes TEXT
);

-- 现实世界的某个具体单位（番号）及其采用的模板 —— 后续爬取/填充用，现在为空表
CREATE TABLE formation (
  id TEXT PRIMARY KEY, country TEXT NOT NULL, name_zh TEXT NOT NULL, name_en TEXT,
  template_id TEXT REFERENCES unit_template(id),
  parent_id TEXT REFERENCES formation(id),
  location TEXT, as_of TEXT, source_id TEXT, confidence TEXT, notes TEXT
);
"""
