#!/usr/bin/env node
/**
 * cm-lite 数据库初始化
 *   本地：npm run db:init
 *   云端：TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:init
 *   重建：npm run db:init -- --reset   （删表后重建，仅用于演示环境）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const url = process.env.TURSO_DATABASE_URL?.trim() || 'file:./.data/cm-lite.db';
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
const reset = process.argv.includes('--reset');

if (url.startsWith('file:')) {
  const dir = path.dirname(url.slice('file:'.length));
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
}

const db = createClient({ url, authToken });

/** 按分号切 SQL，但要放过触发器 BEGIN...END 内部的语句边界 */
function splitSql(text) {
  const out = [];
  let cur = '';
  let inStr = false;
  let block = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!inStr && text.startsWith('--', i)) {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (ch === "'") {
      inStr = !inStr;
      cur += ch;
      i += 1;
      continue;
    }
    if (!inStr) {
      const m = /^(BEGIN|END)\b/i.exec(text.slice(i));
      if (m) {
        const word = m[1].toUpperCase();
        if (word === 'BEGIN') block += 1;
        else if (block > 0) block -= 1;
        cur += m[0];
        i += m[0].length;
        continue;
      }
      if (ch === ';' && block === 0) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
        i += 1;
        continue;
      }
    }
    cur += ch;
    i += 1;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function runFile(rel) {
  const sql = fs.readFileSync(path.join(root, rel), 'utf8');
  const stmts = splitSql(sql);
  for (const s of stmts) {
    try {
      await db.execute(s);
    } catch (e) {
      // 触发器已存在等幂等场景忽略
      const msg = String(e?.message ?? e);
      if (!/already exists/i.test(msg)) throw new Error(`${rel} 执行失败：${msg}\n${s.slice(0, 120)}`);
    }
  }
  return stmts.length;
}

const TABLES = [
  'unit_fittings',
  'units',
  'deviations',
  'change_approvals',
  'changes',
  'baseline_items',
  'baselines',
  'docs',
  'cis',
  'users',
  'events',
  'tenants',
];

async function resetAll() {
  for (const t of TABLES) {
    await db.execute(`DROP TABLE IF EXISTS ${t}`);
  }
  for (const trg of [
    'events_no_update',
    'events_no_delete',
    'baseline_items_frozen_no_update',
    'baseline_items_frozen_no_delete',
    'change_approvals_signed_immutable',
    'change_approvals_no_delete',
  ]) {
    await db.execute(`DROP TRIGGER IF EXISTS ${trg}`);
  }
  console.log('· 已清空全部表与触发器');
}

// ------------------------------------------------------------
// 种子数据（机型 EX-01、人名全部虚构）
// ------------------------------------------------------------
const T = (s) => s; // 语义标记：时间统一 UTC ISO8601（带 Z）

const USERS = [
  ['张设计', 'DESIGN_ENG'],
  ['李构型', 'CM_ENGINEER'],
  ['王质量', 'QUALITY_ENG'],
  ['陈适航', 'AIRWORTHINESS'],
  ['周分管', 'TECH_DIRECTOR'],
  ['赵主任', 'CCB_CHAIR'],
  ['吴生产', 'PRODUCTION'],
  ['马总监', 'DEPT_DIRECTOR'],
];

// pn, name, type, parent, rev, status, criticality, owner, basis
const CIS = [
  ['EX-01', '演示无人机整机', 'SYSTEM', null, 'A', 'CONTROLLED', 'NORMAL', '张设计', '型号研制总要求'],
  ['EX01-FC', '飞控分系统', 'EQUIPMENT', 'EX-01', 'A', 'CONTROLLED', 'NORMAL', '张设计', '分系统研制任务书'],
  ['EX01-FC-001', '飞控计算机', 'HARDWARE', 'EX01-FC', 'B', 'CONTROLLED', 'IMPORTANT', '张设计', 'FC-HW-SPEC'],
  ['EX01-FC-002', '飞控软件', 'SOFTWARE', 'EX01-FC', 'V1.1', 'CONTROLLED', 'NORMAL', '张设计', 'FC-SW-SPEC'],
  ['EX01-FC-003', '惯性测量单元', 'HARDWARE', 'EX01-FC', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'IMU-SPEC'],
  ['EX01-PWR', '动力分系统', 'EQUIPMENT', 'EX-01', 'A', 'CONTROLLED', 'NORMAL', '张设计', '分系统研制任务书'],
  ['EX01-PWR-001', '驱动电机', 'HARDWARE', 'EX01-PWR', 'A', 'CONTROLLED', 'KEY', '张设计', 'MOTOR-SPEC-01'],
  ['EX01-PWR-002', '电机控制器', 'HARDWARE', 'EX01-PWR', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'ESC-SPEC'],
  ['EX01-PWR-003', '动力电池包', 'HARDWARE', 'EX01-PWR', 'A', 'CONTROLLED', 'IMPORTANT', '张设计', 'BAT-SPEC'],
  ['EX01-PWR-004', '电源管理软件', 'SOFTWARE', 'EX01-PWR', 'V1.0', 'CONTROLLED', 'NORMAL', '张设计', 'PWR-SW-SPEC'],
  ['EX01-STR', '结构分系统', 'EQUIPMENT', 'EX-01', 'A', 'CONTROLLED', 'NORMAL', '张设计', '分系统研制任务书'],
  ['EX01-STR-001', '主机身框架', 'HARDWARE', 'EX01-STR', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'STR-DWG-001'],
  ['EX01-STR-002', '起落架组件', 'HARDWARE', 'EX01-STR', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'STR-DWG-002'],
  ['EX01-STR-003', '蒙皮组件', 'HARDWARE', 'EX01-STR', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'STR-DWG-003'],
  ['EX01-STR-004', '结构强度分析报告', 'DOC', 'EX01-STR', 'A', 'CONTROLLED', 'NORMAL', '张设计', 'STR-REP-001'],
];

// ci_pn, doc_no, title, rev
const DOCS = [
  ['EX-01', 'EX01-TC-DOC-001', '整机技术条件', 'B'],
  ['EX01-FC', 'EX01-FC-DOC-001', '飞控分系统设计说明', 'B'],
  ['EX01-FC-002', 'EX01-FC-DOC-002', '飞控软件需求规格说明', 'V1.1'],
  ['EX01-PWR', 'EX01-PWR-DOC-001', '动力分系统设计说明', 'A'],
  ['EX01-PWR-001', 'EX01-PWR-DOC-002', '驱动电机技术条件', 'A'],
  ['EX01-STR', 'EX01-STR-DOC-001', '结构分系统设计说明', 'A'],
  ['EX01-STR-004', 'EX01-STR-DOC-002', '结构强度分析报告', 'A'],
];

async function seed() {
  const existing = await db.execute('SELECT COUNT(*) AS n FROM tenants');
  if (Number(existing.rows[0].n) > 0) {
    console.log('· 已有数据，跳过播种（需要重建请加 --reset）');
    return;
  }

  const passHash = bcrypt.hashSync('demo123', 10);
  const pinHash = bcrypt.hashSync('1234', 10);

  // 租户
  const tenant = await db.execute({
    sql: `INSERT INTO tenants (slug, name, passcode_hash, allow_self_approval, created_at)
          VALUES (?, ?, ?, 0, ?)`,
    args: ['demo', '演示空间', passHash, T('2026-11-01T01:00:00Z')],
  });
  const tenantId = Number(tenant.lastInsertRowid);

  // 用户
  const userId = {};
  for (const [name, role] of USERS) {
    const r = await db.execute({
      sql: `INSERT INTO users (tenant_id, name, role_code, pin_hash, created_at) VALUES (?,?,?,?,?)`,
      args: [tenantId, name, role, pinHash, T('2026-11-01T01:05:00Z')],
    });
    userId[name] = Number(r.lastInsertRowid);
  }

  // 构型项
  for (const [pn, name, type, parent, rev, status, crit, owner, basis] of CIS) {
    await db.execute({
      sql: `INSERT INTO cis (tenant_id, model, pn, name, type, parent_pn, qty, rev, sn_controlled, status, criticality, owner, basis, note, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        tenantId, 'EX-01', pn, name, type, parent, 1, rev,
        type === 'HARDWARE' ? 1 : 0, status, crit, owner, basis,
        type === 'SOFTWARE' ? '软件件按版本号管理，硬件件按图纸版次管理' : null,
        T('2026-11-02T02:00:00Z'),
      ],
    });
  }

  // 文件
  for (const [ci, docNo, title, rev] of DOCS) {
    await db.execute({
      sql: `INSERT INTO docs (tenant_id, ci_pn, doc_no, title, rev, status, url, created_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [tenantId, ci, docNo, title, rev, 'CONTROLLED', null, T('2026-11-02T03:00:00Z')],
    });
  }

  // 基线 D1：已冻结；快照记录「当时」的版本 —— 飞控软件显式记 V1.0
  const bl = await db.execute({
    sql: `INSERT INTO baselines (tenant_id, model, code, name, kind, status, created_by, created_at, frozen_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'EX-01', 'D1', '设计基线 V1', 'DESIGN', 'FROZEN', '李构型',
      T('2026-11-05T02:00:00Z'), T('2026-11-05T06:00:00Z'),
    ],
  });
  const d1 = Number(bl.lastInsertRowid);

  const docMap = new Map(DOCS.map(([ci, docNo, , rev]) => [ci, { docNo, rev }]));
  for (const [pn, , , , rev] of CIS) {
    const snapshotRev = pn === 'EX01-FC-002' ? 'V1.0' : rev; // 变更① 升版前的历史版本
    const doc = docMap.get(pn);
    await db.execute({
      sql: `INSERT INTO baseline_items (baseline_id, ci_pn, ci_rev, doc_no, doc_rev) VALUES (?,?,?,?,?)`,
      args: [d1, pn, snapshotRev, doc?.docNo ?? null, doc?.rev ?? null],
    });
  }

  // ---------- 变更①：III 类，已闭环（PR → CR → CN → CLOSED） ----------
  const pr1 = await db.execute({
    sql: `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
            f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by, created_at, closed_at, verified)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'PR-2026-001', 'PR', null, 'EX-01', 'EX01-FC-002', 'V1.0', null, null,
      '飞控软件界面文案勘误', '地面站界面文字与实际开关位置不一致', 0, 0, 0,
      null, null, null, null, 'LINKED', '张设计', T('2026-11-06T01:00:00Z'), null, 0,
    ],
  });
  const pr1Id = Number(pr1.lastInsertRowid);

  const impact1 = JSON.stringify({
    interchange: 'NO', interface: 'NO', pn: 'NO', wip: 'NO', stock: 'NO',
    delivered: 'NO', process: 'NO', cost: 'NO', notify: 'NO',
  });
  const cr1 = await db.execute({
    sql: `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
            f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by, created_at, closed_at, verified)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'CR-2026-001', 'CR', pr1Id, 'EX-01', 'EX01-FC-002', 'V1.0', 'V1.1', null,
      '飞控软件界面文案勘误', '地面站界面文字与实际开关位置不一致', 0, 0, 0,
      'III', '勘误类，3F 与 I 类判据均未命中', impact1, null,
      'CLOSED', '张设计', T('2026-11-06T01:10:00Z'), T('2026-11-06T03:00:00Z'), 1,
    ],
  });
  const cr1Id = Number(cr1.lastInsertRowid);

  await db.execute({
    sql: `INSERT INTO change_approvals (change_id, step_no, step_name, role_code, signer_user_id, decision, comment, signed_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [cr1Id, 1, '拟制', 'DESIGN_ENG', userId['张设计'], 'APPROVE', '文案勘误，已核对界面', T('2026-11-06T01:10:00Z')],
  });
  await db.execute({
    sql: `INSERT INTO change_approvals (change_id, step_no, step_name, role_code, signer_user_id, decision, comment, signed_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [cr1Id, 2, '构型审核并批准', 'CM_ENGINEER', userId['李构型'], 'APPROVE', '版本升 V1.1，注意同步基线', T('2026-11-06T02:20:00Z')],
  });

  const cn1 = await db.execute({
    sql: `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
            f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by, created_at, closed_at, verified)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'CN-2026-001', 'CN', cr1Id, 'EX-01', 'EX01-FC-002', 'V1.0', 'V1.1', null,
      '执行：飞控软件界面文案勘误', '已按 CR-2026-001 升版并验证通过',
      0, 0, 0, null, null, null, null, 'EXECUTED', '李构型',
      T('2026-11-06T02:40:00Z'), null, 1,
    ],
  });
  void cn1;

  // ---------- 变更②：I 类，停在第 5 步（演示 SoD） ----------
  const pr2 = await db.execute({
    sql: `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
            f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by, created_at, closed_at, verified)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'PR-2026-002', 'PR', null, 'EX-01', 'EX01-PWR-001', 'A', null, null,
      '更换电机型号，功率提升 15%', '起飞重量增加，原电机推力余量不足', 1, 1, 1,
      null, null, null, null, 'LINKED', '张设计', T('2026-11-09T01:00:00Z'), null, 0,
    ],
  });
  const pr2Id = Number(pr2.lastInsertRowid);

  const impact2 = JSON.stringify({
    interchange: 'NO', interface: 'YES', pn: 'YES', wip: 'YES', stock: 'YES',
    delivered: 'NO', process: 'YES', cost: 'YES', notify: 'YES',
  });
  const cr2 = await db.execute({
    sql: `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
            f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by, created_at, closed_at, verified)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'CR-2026-002', 'CR', pr2Id, 'EX-01', 'EX01-PWR-001', 'A', null, 'EX01-PWR-001A',
      '更换电机型号，功率提升 15%', '起飞重量增加，原电机推力余量不足',
      1, 1, 1, 'I', '3F 全部命中，且涉及在制品与已发图纸，按 I 类评审',
      impact2, '在制品 3 台：拆解回用旧电机，机架接口按新电机重新钻孔', 'OPEN',
      '张设计', T('2026-11-09T01:20:00Z'), null, 0,
    ],
  });
  const cr2Id = Number(cr2.lastInsertRowid);

  const step2signed = [
    [1, '拟制', 'DESIGN_ENG', '张设计', '2026-11-09T01:20:00Z', '3F 全部命中，按大改处理'],
    [2, '设计审核', 'DEPT_DIRECTOR', '马总监', '2026-11-09T03:00:00Z', '接口与工装影响已确认'],
    [3, '质量会签', 'QUALITY_ENG', '王质量', '2026-11-09T05:30:00Z', '需补充新电机入厂检验要求'],
    [4, '构型审核', 'CM_ENGINEER', '李构型', '2026-11-10T01:00:00Z', '新件号 EX01-PWR-001A 已核对，未与现有件号冲突'],
  ];
  const chain2 = [
    [1, '拟制', 'DESIGN_ENG'],
    [2, '设计审核', 'DEPT_DIRECTOR'],
    [3, '质量会签', 'QUALITY_ENG'],
    [4, '构型审核', 'CM_ENGINEER'],
    [5, '适航影响评估', 'AIRWORTHINESS'],
    [6, '技术分管批准', 'TECH_DIRECTOR'],
    [7, 'CCB 批准', 'CCB_CHAIR'],
  ];
  for (const [stepNo, stepName, role] of chain2) {
    const signed = step2signed.find((s) => s[0] === stepNo);
    await db.execute({
      sql: `INSERT INTO change_approvals (change_id, step_no, step_name, role_code, signer_user_id, decision, comment, signed_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [
        cr2Id, stepNo, stepName, role,
        signed ? userId[signed[3]] : null,
        signed ? 'APPROVE' : null,
        signed ? signed[5] : null,
        signed ? signed[4] : null,
      ],
    });
  }

  // ---------- 偏离 / 让步 ----------
  await db.execute({
    sql: `INSERT INTO deviations (tenant_id, kind, ci_pn, unit_sn, reason, qty_limit, expire_at, status, created_by, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'DEVIATION', 'EX01-STR-002', 'EX-01-A02',
      '起落架缓冲行程比图纸小 2mm，不影响强度，限本批两件放行',
      2, T('2026-12-31T00:00:00Z'), 'ACTIVE', '王质量', T('2026-11-12T02:00:00Z'),
    ],
  });
  await db.execute({
    sql: `INSERT INTO deviations (tenant_id, kind, ci_pn, unit_sn, reason, qty_limit, expire_at, status, created_by, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tenantId, 'CONCESSION', 'EX01-FC-003', null,
      '惯性测量单元安装面平面度超差 0.05mm，让步接收',
      1, T('2026-11-01T00:00:00Z'), 'ACTIVE', '王质量', T('2026-10-20T02:00:00Z'),
    ],
  });

  // ---------- 实物台账（按 D1 版本装机） ----------
  const unitIds = {};
  for (const [sn, produced] of [
    ['EX-01-A01', '2026-11-07T02:00:00Z'],
    ['EX-01-A02', '2026-11-08T02:00:00Z'],
  ]) {
    const r = await db.execute({
      sql: `INSERT INTO units (tenant_id, model, sn, produced_at) VALUES (?,?,?,?)`,
      args: [tenantId, 'EX-01', sn, T(produced)],
    });
    unitIds[sn] = Number(r.lastInsertRowid);
  }
  const fittings = [
    ['EX-01-A01', 'EX01-FC-002', 'V1.0'],
    ['EX-01-A01', 'EX01-PWR-001', 'A'],
    ['EX-01-A01', 'EX01-PWR-004', 'V1.0'],
    ['EX-01-A01', 'EX01-STR-002', 'A'],
    ['EX-01-A02', 'EX01-FC-002', 'V1.0'],
    ['EX-01-A02', 'EX01-PWR-001', 'A'],
    ['EX-01-A02', 'EX01-PWR-004', 'V1.0'],
    ['EX-01-A02', 'EX01-STR-002', 'A'],
  ];
  for (const [sn, pn, rev] of fittings) {
    await db.execute({
      sql: `INSERT INTO unit_fittings (unit_id, ci_pn, ci_rev, remark) VALUES (?,?,?,?)`,
      args: [unitIds[sn], pn, rev, null],
    });
  }

  // ---------- 纪实（只 INSERT） ----------
  const events = [
    ['系统', 'SEED', 'tenant', 1, '演示空间初始化完成：15 项构型项、D1 基线、2 台实物', '2026-11-05T00:00:00Z'],
    ['李构型', 'BASELINE_CREATE', 'baseline', d1, 'D1 设计基线 V1：快照 15 项受控构型项', '2026-11-05T02:00:00Z'],
    ['李构型', 'BASELINE_FREEZE', 'baseline', d1, 'D1 冻结，此后该基线内构型项只能走变更流程', '2026-11-05T06:00:00Z'],
    ['张设计', 'PR_CREATE', 'change', pr1Id, 'PR-2026-001 飞控软件界面文案勘误', '2026-11-06T01:00:00Z'],
    ['张设计', 'CR_CREATE', 'change', cr1Id, 'CR-2026-001 定级 III 类（勘误），生成 2 步审批链', '2026-11-06T01:10:00Z'],
    ['张设计', 'SIGN', 'change', cr1Id, '第 1 步 拟制 同意', '2026-11-06T01:10:00Z'],
    ['李构型', 'SIGN', 'change', cr1Id, '第 2 步 构型审核并批准 同意', '2026-11-06T02:20:00Z'],
    ['李构型', 'CN_EXECUTE', 'change', cr1Id, 'CN-2026-001 执行：EX01-FC-002 版本 V1.0 → V1.1，验证通过', '2026-11-06T02:40:00Z'],
    ['李构型', 'CR_CLOSE', 'change', cr1Id, 'CR-2026-001 关闭闭环', '2026-11-06T03:00:00Z'],
    ['张设计', 'PR_CREATE', 'change', pr2Id, 'PR-2026-002 更换电机型号，功率提升 15%', '2026-11-09T01:00:00Z'],
    ['张设计', 'CR_CREATE', 'change', cr2Id, 'CR-2026-002 定级 I 类，生成 7 步审批链', '2026-11-09T01:20:00Z'],
    ['张设计', 'SIGN', 'change', cr2Id, '第 1 步 拟制 同意', '2026-11-09T01:20:00Z'],
    ['马总监', 'SIGN', 'change', cr2Id, '第 2 步 设计审核 同意', '2026-11-09T03:00:00Z'],
    ['王质量', 'SIGN', 'change', cr2Id, '第 3 步 质量会签 同意', '2026-11-09T05:30:00Z'],
    ['李构型', 'SIGN', 'change', cr2Id, '第 4 步 构型审核 同意', '2026-11-10T01:00:00Z'],
    ['王质量', 'DEVIATION_CREATE', 'deviation', 1, '起落架缓冲行程偏离单，限 2 件', '2026-11-12T02:00:00Z'],
  ];
  for (const [actor, action, type, tid, detail, ts] of events) {
    await db.execute({
      sql: `INSERT INTO events (tenant_id, actor, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)`,
      args: [tenantId, actor, action, type, String(tid), detail, T(ts)],
    });
  }

  console.log('· 种子写入完成');
}

async function main() {
  console.log(`→ 连接 ${url}`);
  await db.execute('PRAGMA foreign_keys = ON');
  if (reset) await resetAll();
  const a = await runFile('sql/schema.sql');
  const b = await runFile('sql/turso_hardening.sql');
  console.log(`· schema.sql ${a} 条语句；turso_hardening.sql ${b} 条语句`);
  await seed();

  const check = await db.execute(
    `SELECT 'cis' t, COUNT(*) n FROM cis
     UNION ALL SELECT 'baselines', COUNT(*) FROM baselines
     UNION ALL SELECT 'baseline_items', COUNT(*) FROM baseline_items
     UNION ALL SELECT 'changes', COUNT(*) FROM changes
     UNION ALL SELECT 'change_approvals', COUNT(*) FROM change_approvals
     UNION ALL SELECT 'events', COUNT(*) FROM events`,
  );
  for (const row of check.rows) console.log(`  ${row.t}: ${row.n}`);

  const trg = await db.execute(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'`);
  console.log(`  触发器: ${trg.rows[0].n} 条`);
  console.log('✓ 初始化完成');
}

main().catch((e) => {
  console.error('✗ 初始化失败：', e);
  process.exit(1);
});
