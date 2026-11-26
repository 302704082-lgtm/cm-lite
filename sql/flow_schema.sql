-- ============================================================
-- cm-lite v3 · 受控表单与流程层（只增不改，不碰现有 13 张业务表）
-- 可重复执行。所有模板/字段/签字位/流程步骤都是「配置值」，不写死在代码里。
-- 全部为虚构脱敏值，不含任何公司名、型号、客户代码、单号格式、表单版式。
-- ============================================================

-- 表单模板：一张受控单子长什么样（字段 / 检查项 / 签字位）
CREATE TABLE IF NOT EXISTS form_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,                 -- 场景代号，如 BASELINE_RELEASE
  name TEXT NOT NULL,                 -- 单据名称，如「基线发布申请单」
  scene TEXT NOT NULL,                -- 用途分组
  fields_json TEXT NOT NULL DEFAULT '[]',      -- [{key,label,kind,required,placeholder}]
  checklist_json TEXT NOT NULL DEFAULT '[]',   -- [{key,label}] 发布/评审检查项
  signoff_json TEXT NOT NULL DEFAULT '[]',     -- [{step_no,step_name,role_label}]
  requires_items INTEGER NOT NULL DEFAULT 0,   -- 是否需要「要冻结的文件清单」
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (tenant_id, code)
);

-- 表单实例：每次走流程真实生成的一张单（可单独打印 / 归档）
CREATE TABLE IF NOT EXISTS form_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  template_id INTEGER NOT NULL REFERENCES form_templates(id),
  code TEXT NOT NULL,                 -- 显示用单号（虚构格式，可配置）
  scene TEXT NOT NULL,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',   -- baseline / change / deviation / pending_change
  target_id INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}',       -- 字段填写值
  checklist_json TEXT NOT NULL DEFAULT '[]',  -- [{key,label,result,note}]
  items_json TEXT NOT NULL DEFAULT '[]',      -- 文件/构型项清单快照
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  submitted_at TEXT,
  closed_at TEXT,
  UNIQUE (tenant_id, code)
);

-- 签字记录：只追加，不修改（与 events 一致，保证可追溯）
CREATE TABLE IF NOT EXISTS form_signoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL REFERENCES form_instances(id),
  step_no INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  role_label TEXT NOT NULL,
  signer_user_id INTEGER REFERENCES users(id),
  signer_name TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  comment TEXT,
  signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (instance_id, step_no)
);

-- 流程定义：某场景一共走几步、每步挂哪张表、谁签、是不是闸门
CREATE TABLE IF NOT EXISTS flow_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  scene TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  form_code TEXT NOT NULL DEFAULT '',   -- 该步要出的表单模板代号，空=不出单
  role_label TEXT NOT NULL DEFAULT '',  -- 该步签署岗位
  gate INTEGER NOT NULL DEFAULT 0,      -- 1=此步通过前不许进入下一场景
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  UNIQUE (tenant_id, scene, step_no)
);

CREATE INDEX IF NOT EXISTS idx_form_instances_target ON form_instances(tenant_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_form_instances_scene ON form_instances(tenant_id, scene, status);
CREATE INDEX IF NOT EXISTS idx_form_signoffs_instance ON form_signoffs(instance_id, step_no);
CREATE INDEX IF NOT EXISTS idx_flow_definitions_scene ON flow_definitions(tenant_id, scene, step_no);

-- 构型项版本履历链：每一版对应哪张变更单（补齐状态一览表的「从首版到当前」）
-- 只追加，不改不删；首次灌入时给现有构型项补一条首版记录。
CREATE TABLE IF NOT EXISTS ci_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  pn TEXT NOT NULL,
  rev TEXT NOT NULL,
  change_code TEXT,                 -- 由哪张变更通知（CN）带来的这一版；首版为空
  class_result TEXT,               -- 该次变更的类别（内部槽位）
  note TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ci_revisions_pn ON ci_revisions(tenant_id, pn, id);
