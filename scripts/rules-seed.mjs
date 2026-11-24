#!/usr/bin/env node
/**
 * 灌入「取证整机厂版（脱敏默认模板）」并设为 ACTIVE。
 *
 * 来源：用户提供的两份公司体系文件里抽出的「规矩」，全部抽象成通用值，
 * 不含公司名、真实型号、人员、客户代码、单号格式。
 *   - 大改 / 小改两类（对应文件里的分类口径）
 *   - 三级基线：功能 / 分配 / 产品
 *   - 分类及理由文件化、全部更改需符合性验证、独立监督、冻结只读、记录永久留存
 *
 * 用法：
 *   node scripts/rules-seed.mjs            # 连 .env.local 里的云端 Turso 库
 *   node scripts/rules-seed.mjs --local   # 连本地 .data/cm-lite.db
 *   node scripts/rules-seed.mjs --blank   # 清空配置，回到「空白」状态
 *
 * 幂等：重复执行只会覆盖同一套档案，不会产生多份；不动任何业务数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const forceLocal = process.argv.includes('--local');
const blank = process.argv.includes('--blank');

const envPath = path.join(root, '.env.local');
if (!forceLocal && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = forceLocal
  ? 'file:./.data/cm-lite.db'
  : process.env.TURSO_DATABASE_URL?.trim() || 'file:./.data/cm-lite.db';
const authToken = forceLocal ? undefined : process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
if (url.startsWith('file:')) {
  const dir = path.dirname(url.slice('file:'.length));
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
}

const db = createClient({ url, authToken });
console.log(`目标库：${url.startsWith('file:') ? url : url.replace(/^libsql:\/\//, 'libsql://')}`);
console.log(`模式：${blank ? '清空回空白' : '灌入脱敏默认模板并启用'}`);

// 配置层 4 张表（幂等，只增不改）
const DDL = [
  `CREATE TABLE IF NOT EXISTS rule_profiles (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     tenant_id INTEGER NOT NULL REFERENCES tenants(id),
     name TEXT NOT NULL DEFAULT '我的规矩',
     status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE')),
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS profile_settings (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
     section TEXT NOT NULL, field_key TEXT NOT NULL, field_label TEXT NOT NULL,
     field_value TEXT NOT NULL DEFAULT '', UNIQUE (profile_id, field_key))`,
  `CREATE TABLE IF NOT EXISTS profile_steps (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
     class_code TEXT NOT NULL, step_no INTEGER NOT NULL,
     step_name TEXT NOT NULL DEFAULT '', role_code TEXT NOT NULL DEFAULT '',
     UNIQUE (profile_id, class_code, step_no))`,
  `CREATE TABLE IF NOT EXISTS profile_conditions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
     code TEXT NOT NULL, label TEXT NOT NULL, expression TEXT NOT NULL DEFAULT '',
     enabled INTEGER NOT NULL DEFAULT 0, UNIQUE (profile_id, code))`,
];
for (const ddl of DDL) await db.execute(ddl);

const tenant = await db.execute('SELECT id FROM tenants ORDER BY id LIMIT 1');
const tenantId = Number(tenant.rows[0]?.id ?? 1);

if (blank) {
  await db.execute({ sql: `UPDATE rule_profiles SET status = 'DRAFT' WHERE tenant_id = ?`, args: [tenantId] });
  await db.execute({ sql: `DELETE FROM profile_settings WHERE profile_id IN (SELECT id FROM rule_profiles WHERE tenant_id = ?)`, args: [tenantId] });
  await db.execute({ sql: `DELETE FROM profile_steps WHERE profile_id IN (SELECT id FROM rule_profiles WHERE tenant_id = ?)`, args: [tenantId] });
  await db.execute({ sql: `DELETE FROM rule_profiles WHERE tenant_id = ?`, args: [tenantId] });
  const n = await db.execute('SELECT count(*) AS n FROM rule_profiles');
  console.log('已回到空白，配置档案数：', n.rows[0].n);
  process.exit(0);
}

const PROFILE_NAME = '取证整机厂版（脱敏默认模板）';
const NOTE = '按两份体系文件抽象出的通用规矩：大改/小改、三级基线、分类及理由文件化、符合性验证、独立监督、冻结只读、记录永久留存。全部为虚构脱敏值，不含任何公司信息。';

// 第一层：19 个格子。section 与 lib/rule-config.ts 的 SECTIONS 一一对应。
const SETTINGS = [
  ['IDENT', 'model_code', '机型代号', 'EX40'],
  ['IDENT', 'pn_prefix', '件号固定前缀', ''],
  ['IDENT', 'pn_segments', '件号分几段', '3'],
  ['IDENT', 'pn_sep', '段与段之间用什么符号', '-'],
  ['IDENT', 'pn_seq_width', '流水号几位', '3'],
  ['IDENT', 'rev_format', '版本怎么写', 'V1.0'],
  ['IDENT', 'three_f_new_pn', '3F 变化强制换新件号', '是'],
  ['CHANGE', 'class_codes', '更改类别代号', '大改,小改'],
  ['CHANGE', 'class_labels', '类别中文名', '大改,小改'],
  ['CHANGE', 'roles', '签署角色', '设计工程师,研发经理,适航经理,符合性核查工程师,小改批准签署人,独立监督负责人,责任经理,生产放行人员,技术分管'],
  ['CHANGE', 'sod_enabled', '禁止同一个人又拟制又批准', '是'],
  ['CHANGE', 'verify_required', '关闭前必须勾验证通过', '是'],
  ['CHANGE', 'class_reason_required', '改级必须填理由', '是'],
  ['BASELINE', 'baseline_kinds', '基线类型', '功能基线,分配基线,产品基线'],
  ['BASELINE', 'frozen_no_edit', '冻结后禁止直接改版本', '是'],
  ['IMPACT', 'impact_items', '影响项清单', '互换性,接口影响,件号变更,在制品,库存,已交付品,工艺工装检验,成本与进度,客户供应商通知,图纸与物料清单,技术出版物,符合性验证'],
  ['IMPACT', 'wip_requires_action', '在制品有则必填处理意见', '是'],
  ['EVIDENCE', 'evidence_title', '证据包封面标题', '构型状态与更改证据包'],
  ['EVIDENCE', 'evidence_items', '材料清单', '构型清单,基线快照,更改清单,审批记录,验证结果,偏离记录,纪实时间线,符合性矩阵'],
];

// 第一层：每个类别的审批步骤。role_code 写业务岗位名，运行时映射到系统账号。
// 大改 6 步：拟制→设计审核→分类签署→符合性核查→独立监督→批准
// 小改 3 步：拟制→小改批准签署→独立监督
const STEPS = [
  ['大改', 1, '拟制', '设计工程师'],
  ['大改', 2, '设计审核', '研发经理'],
  ['大改', 3, '更改分类签署', '适航经理'],
  ['大改', 4, '符合性核查', '符合性核查工程师'],
  ['大改', 5, '独立监督审核', '独立监督负责人'],
  ['大改', 6, '批准', '责任经理'],
  ['小改', 1, '拟制', '设计工程师'],
  ['小改', 2, '小改批准签署', '小改批准签署人'],
  ['小改', 3, '独立监督审核', '独立监督负责人'],
];

// 同一租户只保留一套 ACTIVE
await db.execute({
  sql: `UPDATE rule_profiles SET status = 'DRAFT' WHERE tenant_id = ? AND status = 'ACTIVE'`,
  args: [tenantId],
});

let p = await db.execute({
  sql: `SELECT id FROM rule_profiles WHERE tenant_id = ? AND name = ? ORDER BY id DESC LIMIT 1`,
  args: [tenantId, PROFILE_NAME],
});
let profileId = Number(p.rows[0]?.id ?? 0);
if (!profileId) {
  const ins = await db.execute({
    sql: `INSERT INTO rule_profiles (tenant_id, name, status, note) VALUES (?, ?, 'DRAFT', ?)`,
    args: [tenantId, PROFILE_NAME, NOTE],
  });
  profileId = Number(ins.lastInsertRowid ?? 0);
}
if (!profileId) throw new Error('无法创建配置档案');

await db.execute({
  sql: `UPDATE rule_profiles SET status = 'DRAFT', note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
  args: [NOTE, profileId],
});
await db.execute({ sql: `DELETE FROM profile_settings WHERE profile_id = ?`, args: [profileId] });
await db.execute({ sql: `DELETE FROM profile_steps WHERE profile_id = ?`, args: [profileId] });
await db.execute({ sql: `DELETE FROM profile_conditions WHERE profile_id = ?`, args: [profileId] });

for (const [section, key, label, value] of SETTINGS) {
  await db.execute({
    sql: `INSERT INTO profile_settings (profile_id, section, field_key, field_label, field_value) VALUES (?, ?, ?, ?, ?)`,
    args: [profileId, section, key, label, value],
  });
}
for (const [cls, no, name, role] of STEPS) {
  await db.execute({
    sql: `INSERT INTO profile_steps (profile_id, class_code, step_no, step_name, role_code) VALUES (?, ?, ?, ?, ?)`,
    args: [profileId, cls, no, name, role],
  });
}

await db.execute({
  sql: `UPDATE rule_profiles SET status = 'ACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
  args: [profileId],
});

// 写一条启用留痕（只追加事件台账）
await db.execute({
  sql: `INSERT INTO events (tenant_id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
  args: [tenantId, '系统', 'RULE_CONFIG_ACTIVATE', 'rule_profile', String(profileId), `启用「${PROFILE_NAME}」：大改/小改两类、三级基线、证据包 8 份`],
});

const check = await db.execute({
  sql: `SELECT p.id, p.name, p.status,
          (SELECT count(*) FROM profile_settings s WHERE s.profile_id = p.id) AS settings,
          (SELECT count(*) FROM profile_steps t WHERE t.profile_id = p.id) AS steps
        FROM rule_profiles p WHERE p.tenant_id = ? AND p.status = 'ACTIVE'`,
  args: [tenantId],
});
console.log('生效档案：', JSON.stringify(check.rows[0]));
console.log(`字段 ${SETTINGS.length} 个 · 审批步骤 ${STEPS.length} 条 · 材料清单 8 份`);
console.log('完成：主流程现在会读这套规矩（件号 / 类别 / 审批链 / 影响项 / 基线 / 证据包 / 拦截开关）。');
