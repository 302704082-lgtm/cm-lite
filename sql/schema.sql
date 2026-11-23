-- ============================================================
-- cm-lite · 构型管理平台 毛坯房演示版
-- 数据库结构（SQLite / Turso libsql 方言）
-- 依《毛坯房施工规格书 v4-demo》§4 逐字建表
-- 说明：本文件可重复执行（IF NOT EXISTS），不写入任何种子数据
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,
  allow_self_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  role_code TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS cis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  model TEXT NOT NULL,
  pn TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SYSTEM','EQUIPMENT','HARDWARE','SOFTWARE','DOC')),
  parent_pn TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  rev TEXT NOT NULL DEFAULT 'A',
  sn_controlled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONTROLLED','FROZEN','VOID')),
  criticality TEXT NOT NULL DEFAULT 'NORMAL' CHECK (criticality IN ('NORMAL','KEY','IMPORTANT')),
  owner TEXT NOT NULL,
  basis TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (tenant_id, pn)
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  ci_pn TEXT NOT NULL,
  doc_no TEXT NOT NULL,
  title TEXT NOT NULL,
  rev TEXT NOT NULL DEFAULT 'A',
  status TEXT NOT NULL DEFAULT 'CONTROLLED',
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (tenant_id, doc_no)
);

CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  model TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('REQUIREMENT','DESIGN','CERTIFICATION','OTHER')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FROZEN')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  frozen_at TEXT,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS baseline_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baseline_id INTEGER NOT NULL REFERENCES baselines(id),
  ci_pn TEXT NOT NULL,
  ci_rev TEXT NOT NULL,
  doc_no TEXT,
  doc_rev TEXT
);

CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PR','CR','CN')),
  parent_id INTEGER REFERENCES changes(id),
  model TEXT NOT NULL,
  ci_pn TEXT,
  from_rev TEXT,
  to_rev TEXT,
  new_pn TEXT,
  title TEXT NOT NULL,
  reason TEXT,
  f_fit INTEGER NOT NULL DEFAULT 0,
  f_form INTEGER NOT NULL DEFAULT 0,
  f_function INTEGER NOT NULL DEFAULT 0,
  class_result TEXT CHECK (class_result IN ('I','II','III')),
  class_reason TEXT,
  impact_json TEXT,
  wip_action TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','LINKED','APPROVED','EXECUTED','CLOSED','REJECTED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  closed_at TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS change_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id INTEGER NOT NULL REFERENCES changes(id),
  step_no INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  role_code TEXT NOT NULL,
  signer_user_id INTEGER REFERENCES users(id),
  decision TEXT CHECK (decision IN ('APPROVE','REJECT')),
  comment TEXT,
  signed_at TEXT,
  UNIQUE (change_id, step_no)
);

CREATE TABLE IF NOT EXISTS deviations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK (kind IN ('DEVIATION','CONCESSION')),
  ci_pn TEXT NOT NULL,
  unit_sn TEXT,
  reason TEXT NOT NULL,
  qty_limit INTEGER NOT NULL,
  expire_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','EXPIRED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  model TEXT NOT NULL,
  sn TEXT NOT NULL,
  produced_at TEXT,
  UNIQUE (tenant_id, model, sn)
);

CREATE TABLE IF NOT EXISTS unit_fittings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  ci_pn TEXT NOT NULL,
  ci_rev TEXT NOT NULL,
  remark TEXT,
  UNIQUE (unit_id, ci_pn)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 纪实表只可追加（R7）：数据库层直接掐死 UPDATE / DELETE
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;

CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;

CREATE INDEX IF NOT EXISTS idx_cis_tree ON cis(tenant_id, model, parent_pn);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(tenant_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_approvals_change ON change_approvals(change_id, step_no);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(tenant_id, target_type, target_id);
