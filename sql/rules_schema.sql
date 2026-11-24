-- ============================================================
-- cm-lite v2 · 规则配置层（只增不改，不影响现有 13 张业务表）
-- 可重复执行；不写入任何业务值 —— 空白就是这些表里没有行
-- ============================================================

-- 配置档案：一个租户可以有多套规矩（当前只有一套在用）
CREATE TABLE IF NOT EXISTS rule_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT '我的规矩',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 第一层：表单里每个格子的值
CREATE TABLE IF NOT EXISTS profile_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
  section TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_value TEXT NOT NULL DEFAULT '',
  UNIQUE (profile_id, field_key)
);

-- 第一层：某个更改类别要走哪几步、每步谁签
CREATE TABLE IF NOT EXISTS profile_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
  class_code TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  step_name TEXT NOT NULL DEFAULT '',
  role_code TEXT NOT NULL DEFAULT '',
  UNIQUE (profile_id, class_code, step_no)
);

-- 第二层占位：条件规则（本轮只建表、不开放填写，让你看得见它存在）
CREATE TABLE IF NOT EXISTS profile_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  expression TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  UNIQUE (profile_id, code)
);

CREATE INDEX IF NOT EXISTS idx_profile_settings ON profile_settings(profile_id, section);
CREATE INDEX IF NOT EXISTS idx_profile_steps ON profile_steps(profile_id, class_code, step_no);
