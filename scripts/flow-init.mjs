#!/usr/bin/env node
/**
 * 建「受控表单 + 流程定义」4 张表，并灌入一套脱敏默认模板。
 *
 * 设计原则（严格遵守）：
 *  - 只新增表，不改现有 13 张业务表；不动任何已有业务数据。
 *  - 所有字段 / 检查项 / 签字位 / 流程步骤都是配置值，页面可改。
 *  - 全部为虚构脱敏值：不出现公司名、真实型号、客户代码、单号格式、原表单版式。
 *  - 口径为「飞行器取证」（大改/小改、符合性验证、基线发布检查），
 *    只借鉴车规文件里「每步一张受控表单 + 检查单 + 会签」的骨架，
 *    不引入 5M1E / PPAP / 初物卡 / SQE / 客户批准等汽车行业专有内容。
 *
 * 用法：
 *   node scripts/flow-init.mjs            # 连 .env.local 里的云端 Turso 库
 *   node scripts/flow-init.mjs --local    # 连本地 .data/cm-lite.db
 *   node scripts/flow-init.mjs --blank    # 清空（回到无表单闸门状态）
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
console.log(`模式：${blank ? '清空表单层' : '建表并灌入脱敏默认模板'}`);

// 整份 DDL 一次执行（libsql 原生支持多语句），避免按分号切分导致顺序错乱
const DDL = fs.readFileSync(path.join(root, 'sql', 'flow_schema.sql'), 'utf8');
await db.executeMultiple(DDL);

const tenant = await db.execute('SELECT id FROM tenants ORDER BY id LIMIT 1');
const tenantId = Number(tenant.rows[0]?.id ?? 1);

if (blank) {
  for (const table of ['form_signoffs', 'form_instances', 'form_templates', 'flow_definitions']) {
    await db.execute({ sql: `DELETE FROM ${table} WHERE tenant_id = ?`, args: [tenantId] }).catch(async () => {
      if (table === 'form_signoffs') await db.execute('DELETE FROM form_signoffs');
    });
  }
  console.log('已清空调表单层（闸门自动失效，回退到旧行为）');
  process.exit(0);
}

// ------------------------------------------------------------
// 表单模板：一张单子长什么样
// ------------------------------------------------------------
const J = (v) => JSON.stringify(v);
const F = (key, label, kind = 'text', required = false, placeholder = '') => ({ key, label, kind, required, placeholder });
const C = (key, label) => ({ key, label });
const S = (step_no, step_name, role_label) => ({ step_no, step_name, role_label });

const TEMPLATES = [
  {
    code: 'BASELINE_RELEASE',
    name: '基线发布申请单',
    scene: 'BASELINE_RELEASE',
    requires_items: 1,
    note: '冻结前必须提交：列出要冻结的全部构型项及版本、逐项做发布检查、三级签署。',
    fields: [
      F('baseline_name', '基线名称', 'text', true),
      F('baseline_id', '基线标识 / 编号', 'text', true),
      F('baseline_ver', '基线版本', 'text', true),
      F('baseline_type', '基线类型', 'select', true, '', ['功能基线', '分配基线', '产品基线']),
      F('apply_date', '申请日期', 'date', false),
      F('scope', '适用范围说明', 'textarea', false),
    ],
    checks: [
      C('c1', '构型清单是否包含本阶段全部需要冻结的构型项'),
      C('c2', '构型项信息是否正确（标识、状态、名称、版本）'),
      C('c3', '本阶段各项活动是否均已完成'),
      C('c4', '问题报告是否已关闭，或已标注开口 / 偏离许可状态'),
      C('c5', '相关文件版本与构型项版本是否一致'),
    ],
    signoffs: [
      S(1, '申请', '设计工程师'),
      S(2, '审核', '独立监督负责人'),
      S(3, '批准', '责任经理'),
    ],
  },
  {
    code: 'CHANGE_REQUEST',
    name: '变更申请与可行性评审单',
    scene: 'CHANGE_REQUEST',
    requires_items: 0,
    note: '新建变更单之前必须先提交并批准本单：变更原因、变更方案、可行性评审结论。',
    fields: [
      F('model', '机型 / 项目', 'text', true),
      F('ci_pn', '变更对象（构型项）', 'text', true),
      F('title', '变更标题', 'text', true),
      F('reason', '变更原因', 'textarea', true),
      F('plan', '变更方案（变更前后对比）', 'textarea', true),
      F('proposed_class', '拟变更类别', 'select', true, '', ['大改', '小改']),
      F('review_conclusion', '可行性评审结论', 'textarea', true),
      F('verify_need', '是否需要符合性验证', 'select', false, '', ['需要', '不需要（说明理由）']),
    ],
    checks: [
      C('r1', '变更原因与变更方案已明确，不存在空白项'),
      C('r2', '已组织可行性评审并形成结论'),
      C('r3', '影响范围（接口、在制品、已交付品）已初步识别'),
      C('r4', '符合性验证要求已明确'),
      C('r5', '不适用的检查项已标注，未留空白'),
    ],
    signoffs: [
      S(1, '提出申请', '设计工程师'),
      S(2, '可行性评审', '适航经理'),
      S(3, '批准立项', '责任经理'),
    ],
  },
  {
    code: 'CHANGE_REVIEW',
    name: '变更可行性评审表',
    scene: 'CHANGE_REVIEW',
    requires_items: 0,
    note: '逐项评估影响并由各专业岗位会签；阶段二挂到变更流程第 2 步。',
    fields: [
      F('change_code', '关联变更单号', 'text', true),
      F('meeting', '评审方式 / 会议', 'text', false),
      F('conclusion', '评审结论', 'textarea', true),
      F('risk', '风险评估', 'textarea', false),
    ],
    checks: [
      C('v1', '技术可行性已评估'),
      C('v2', '对关联构型项 / 接口的影响已评估'),
      C('v3', '对在制品、库存、已交付品的影响已评估'),
      C('v4', '验证内容与评价标准已明确'),
      C('v5', '各会签岗位意见已收集'),
    ],
    signoffs: [
      S(1, '构型核查', '符合性核查工程师'),
      S(2, '适航审查', '适航经理'),
      S(3, '独立监督', '独立监督负责人'),
    ],
  },
  {
    code: 'VERIFICATION',
    name: '验证计划与结果确认表',
    scene: 'VERIFICATION',
    requires_items: 0,
    note: '验证项逐条列出计划与结果，全部满足才算验证通过。',
    fields: [
      F('change_code', '关联变更单号', 'text', true),
      F('plan', '验证计划', 'textarea', true),
      F('result', '验证结果', 'textarea', true),
      F('conclusion', '验证结论', 'select', true, '', ['验证合格', '验证不合格']),
    ],
    checks: [
      C('t1', '验证内容与评价标准已列出'),
      C('t2', '验证记录 / 报告已归档'),
      C('t3', '验证结论已由责任人确认'),
    ],
    signoffs: [
      S(1, '验证实施', '设计工程师'),
      S(2, '结果确认', '符合性核查工程师'),
      S(3, '独立监督', '独立监督负责人'),
    ],
  },
  {
    code: 'CHANGE_NOTICE',
    name: '变更通知单',
    scene: 'CHANGE_NOTICE',
    requires_items: 0,
    note: '变更批准并验证通过后发布，明确生效范围与接收岗位。',
    fields: [
      F('change_code', '关联变更单号', 'text', true),
      F('before', '变更前状态', 'textarea', true),
      F('after', '变更后状态', 'textarea', true),
      F('effective', '生效方式 / 时点', 'text', true),
      F('receivers', '通知接收岗位', 'textarea', false),
    ],
    checks: [
      C('n1', '变更前 / 变更后内容已写明'),
      C('n2', '受影响文件与构型项清单已同步更新'),
      C('n3', '相关岗位已完成通知'),
    ],
    signoffs: [
      S(1, '编制通知', '设计工程师'),
      S(2, '发布批准', '责任经理'),
    ],
  },
  {
    code: 'DEVIATION',
    name: '偏离 / 让步申请单',
    scene: 'DEVIATION',
    requires_items: 0,
    note: '偏离与让步独立走流程：先申请并批准，才允许生效。',
    fields: [
      F('ci_pn', '涉及构型项', 'text', true),
      F('kind', '类型', 'select', true, '', ['偏离', '让步']),
      F('reason', '申请原因', 'textarea', true),
      F('scope', '适用范围 / 数量', 'text', true),
      F('expire', '有效期至', 'date', true),
      F('measure', '补偿措施', 'textarea', false),
    ],
    checks: [
      C('d1', '偏离 / 让步不影响适航符合性，或已有补偿措施'),
      C('d2', '适用范围、数量、期限明确'),
      C('d3', '必要时已通知相关岗位'),
    ],
    signoffs: [
      S(1, '提出申请', '设计工程师'),
      S(2, '适航审查', '适航经理'),
      S(3, '批准', '责任经理'),
    ],
  },
];

// ------------------------------------------------------------
// 流程定义：某场景走几步、每步挂哪张表、谁签、是不是闸门
// ------------------------------------------------------------
const FLOWS = [
  // 基线冻结
  ['BASELINE_FLOW', 1, '提交基线发布申请', 'BASELINE_RELEASE', '设计工程师', 1, '申请单三级签署齐备前不允许冻结'],
  ['BASELINE_FLOW', 2, '基线冻结', '', '责任经理', 0, '冻结后条目只读'],
  // 变更主流程（阶段二逐步接入）
  ['CHANGE_FLOW', 1, '变更申请', 'CHANGE_REQUEST', '设计工程师', 1, '阶段一闸门：未批准不得建立变更单'],
  ['CHANGE_FLOW', 2, '可行性评审', 'CHANGE_REVIEW', '适航经理', 0, '输出评审表'],
  ['CHANGE_FLOW', 3, '验证确认', 'VERIFICATION', '符合性核查工程师', 0, '输出验证结果确认单'],
  ['CHANGE_FLOW', 4, '变更通知', 'CHANGE_NOTICE', '设计工程师', 0, '发布后生效'],
  // 偏离 / 让步
  ['DEVIATION_FLOW', 1, '偏离 / 让步申请', 'DEVIATION', '设计工程师', 1, '批准前不得生效'],
  ['DEVIATION_FLOW', 2, '登记生效', '', '责任经理', 0, '写入偏离台账'],
];

// 幂等：按 code 覆盖这套默认模板，不动用户后来自己加的其他模板
for (const t of TEMPLATES) {
  const exists = await db.execute({
    sql: `SELECT id FROM form_templates WHERE tenant_id = ? AND code = ?`,
    args: [tenantId, t.code],
  });
  if (exists.rows.length) {
    await db.execute({
      sql: `UPDATE form_templates SET name=?, scene=?, fields_json=?, checklist_json=?, signoff_json=?,
              requires_items=?, status='ACTIVE', note=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
            WHERE tenant_id=? AND code=?`,
      args: [t.name, t.scene, J(t.fields), J(t.checks), J(t.signoffs), t.requires_items, t.note, tenantId, t.code],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO form_templates
              (tenant_id, code, name, scene, fields_json, checklist_json, signoff_json, requires_items, status, note)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [tenantId, t.code, t.name, t.scene, J(t.fields), J(t.checks), J(t.signoffs), t.requires_items, 'ACTIVE', t.note],
    });
  }
}

// flow_definitions 用 (tenant_id, scene, step_no) 幂等覆盖
await db.execute({ sql: `DELETE FROM flow_definitions WHERE tenant_id = ?`, args: [tenantId] });
for (const [scene, step_no, step_name, form_code, role_label, gate, note] of FLOWS) {
  await db.execute({
    sql: `INSERT INTO flow_definitions (tenant_id, scene, step_no, step_name, form_code, role_label, gate, enabled, note)
          VALUES (?,?,?,?,?,?,?,1,?)`,
    args: [tenantId, scene, step_no, step_name, form_code, role_label, gate, note],
  });
}

// 给现有构型项补一条「首版」履历（幂等：只在没有任何履历记录时补）
for (const c of (await db.execute('SELECT pn, rev, model FROM cis WHERE tenant_id = ?', [tenantId])).rows) {
  const exists = await db.execute({
    sql: `SELECT 1 FROM ci_revisions WHERE tenant_id = ? AND pn = ? LIMIT 1`,
    args: [tenantId, c.pn],
  });
  if (!exists.rows.length) {
    await db.execute({
      sql: `INSERT INTO ci_revisions (tenant_id, pn, rev, change_code, note, actor)
            VALUES (?,?,?,NULL,?, '系统初始化')`,
      args: [tenantId, c.pn, c.rev, '初始设计版本'],
    });
  }
}

const stat = await db.execute({
  sql: `SELECT (SELECT count(*) FROM form_templates WHERE tenant_id=?) AS templates,
               (SELECT count(*) FROM flow_definitions WHERE tenant_id=?) AS steps,
               (SELECT count(*) FROM ci_revisions WHERE tenant_id=?) AS revisions`,
  args: [tenantId, tenantId, tenantId],
});
console.log('表单模板：', stat.rows[0].templates, '张 · 流程步骤：', stat.rows[0].steps,
  '条 · 版本履历：', stat.rows[0].revisions, '条');
console.log('闸门：基线冻结 / 新建变更 / 偏离生效 已开启（有 ACTIVE 模板才生效，不影响已有数据）');
