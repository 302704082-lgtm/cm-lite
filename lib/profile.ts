import { q, q1 } from './db';
import {
  CLASS_CHAINS,
  IMPACT_ITEMS,
  ROLE_NAMES,
  type ChainStep,
  type ChangeClass,
  type ImpactKey,
  type RoleCode,
} from './constants';

// ============================================================
// 生效规则引擎
// 把「规则配置」档案翻译成主流程能直接用的规则对象。
// 设计原则：
//  1) 没有 ACTIVE 档案时，完全回退到内置默认（lib/constants.ts），
//     保证线上已有数据与演示主线一点不变。
//  2) 数据库已有的 CHECK 约束不改动（changes.class_result 只允许
//     I/II/III，baselines.kind 只允许 4 值）。配置里的自定义类别/基线
//     名称通过「槽位映射」落库，显示时再翻译回配置里的中文名。
//  3) 配置里的角色是业务岗位名，落库前映射到系统已有账号角色码，
//     这样签署校验（SoD + 角色匹配）继续有效。
// ============================================================

export interface RuleClass {
  code: string; // 配置里填的类别代号（用户可见）
  label: string; // 配置里填的中文名
  slot: ChangeClass; // 落库用的内部槽位
}

export interface RuleImpact {
  key: string;
  label: string;
}

export interface RuleIdent {
  model_code: string;
  pn_prefix: string;
  pn_segments: number;
  pn_sep: string;
  pn_seq_width: number;
  rev_format: string;
}

export interface EffectiveRules {
  enabled: boolean;
  profileId: number | null;
  name: string;
  classes: RuleClass[];
  chains: Record<string, ChainStep[]>; // key = 配置类别代号，role_code 已映射成系统账号角色码
  chainRoleLabels: Record<string, string[]>; // 配置里原样填的岗位名，用于界面显示
  impacts: RuleImpact[];
  evidence: string[];
  evidenceTitle: string;
  baselines: { label: string; slot: string }[];
  roles: string[];
  roleCodes: Record<string, RoleCode>; // 岗位名 → 系统账号角色码
  ident: RuleIdent;
  switches: {
    sod: boolean;
    verify: boolean;
    classReason: boolean;
    threeFNewPn: boolean;
    frozenNoEdit: boolean;
    wipAction: boolean;
  };
}

const SLOTS: ChangeClass[] = ['I', 'II', 'III'];
const BASELINE_SLOTS = ['REQUIREMENT', 'DESIGN', 'CERTIFICATION', 'OTHER'];

function split(v: string | undefined): string[] {
  return (v ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function yes(v: string | undefined, fallback: boolean): boolean {
  const s = (v ?? '').trim();
  if (s === '是') return true;
  if (s === '否') return false;
  return fallback;
}

function num(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** 岗位名 → 系统账号角色码。精确匹配优先，其次关键词，最后兜底 CCB。 */
const ROLE_ALIASES: { re: RegExp; code: RoleCode }[] = [
  { re: /责任经理|总经理|CCB|构型管理委员会|局方|批准委员会/, code: 'CCB_CHAIR' },
  { re: /技术分管|总工|技术总监/, code: 'TECH_DIRECTOR' },
  { re: /研发经理|设计负责人|部门总监|设计审核|部门负责人/, code: 'DEPT_DIRECTOR' },
  { re: /独立监督|质量经理|质量代表|审核员|质量部/, code: 'QUALITY_ENG' },
  { re: /适航|变更分类签署|小改批准|审定|局方接口/, code: 'AIRWORTHINESS' },
  { re: /符合性核查|CVE|核查工程师|独立核查/, code: 'CM_ENGINEER' },
  { re: /生产|放行|制造|工艺/, code: 'PRODUCTION' },
  { re: /构型|配置管理/, code: 'CM_ENGINEER' },
  { re: /设计|拟制|研发|工程师/, code: 'DESIGN_ENG' },
  { re: /质量/, code: 'QUALITY_ENG' },
];

/** 业务岗位名 → 系统账号角色码（精确表，优先于关键词）。
 *  同一条审批链里的两个不同岗位若映射到同一个码，会因 SoD 死锁，
 *  故这里保证常用岗位各自对应不同的系统账号。 */
const EXACT_ROLE: Record<string, RoleCode> = {
  设计工程师: 'DESIGN_ENG',
  设计: 'DESIGN_ENG',
  拟制: 'DESIGN_ENG',
  研发经理: 'DEPT_DIRECTOR',
  设计负责人: 'DEPT_DIRECTOR',
  适航经理: 'AIRWORTHINESS',
  变更分类签署人: 'AIRWORTHINESS',
  符合性核查工程师: 'CM_ENGINEER',
  小改批准签署人: 'CM_ENGINEER',
  独立监督负责人: 'QUALITY_ENG',
  质量经理: 'QUALITY_ENG',
  责任经理: 'CCB_CHAIR',
  生产放行人员: 'PRODUCTION',
  技术分管: 'TECH_DIRECTOR',
};

export function resolveRoleCode(name: string): RoleCode {
  const key = name.trim();
  const exactTable = EXACT_ROLE[key];
  if (exactTable) return exactTable;
  const exact = (Object.keys(ROLE_NAMES) as RoleCode[]).find((k) => ROLE_NAMES[k] === key);
  if (exact) return exact;
  for (const a of ROLE_ALIASES) if (a.re.test(key)) return a.code;
  return 'CCB_CHAIR';
}

/** 给前端组件用的规则摘要（纯数据，可序列化，不含数据库句柄） */
export interface PublicRules {
  enabled: boolean;
  name: string;
  classes: { code: string; label: string }[];
  impacts: { key: string; label: string }[];
  chainLengths: Record<string, number>;
  chainRoles: Record<string, string[]>;
  ident: RuleIdent;
  baselines: { label: string; slot: string }[];
  evidence: string[];
  evidenceTitle: string;
  switches: EffectiveRules['switches'];
}

export function toPublicRules(rules: EffectiveRules): PublicRules {
  const chainLengths: Record<string, number> = {};
  const chainRoles: Record<string, string[]> = {};
  for (const c of rules.classes) {
    const chain = rules.chains[c.code] ?? [];
    chainLengths[c.code] = chain.length;
    const labels = rules.chainRoleLabels[c.code] ?? [];
    chainRoles[c.code] = labels.length
      ? labels
      : chain.map((s) => ROLE_NAMES[s.role_code as RoleCode] ?? s.role_code);
  }
  return {
    enabled: rules.enabled,
    name: rules.name,
    classes: rules.classes.map((c) => ({ code: c.code, label: c.label })),
    impacts: rules.impacts.map((i) => ({ key: i.key, label: i.label })),
    chainLengths,
    chainRoles,
    ident: rules.ident,
    baselines: rules.baselines,
    evidence: rules.evidence,
    evidenceTitle: rules.evidenceTitle,
    switches: rules.switches,
  };
}

/** 类别代号 → 落库槽位；找不到时按序号兜底 */
export function classToSlot(rules: EffectiveRules, code: string): ChangeClass {
  const hit = rules.classes.find((c) => c.code === code.trim());
  if (hit) return hit.slot;
  // 兼容旧数据/调用方直接传内部槽位
  if (SLOTS.includes(code as ChangeClass)) return code as ChangeClass;
  return rules.classes[0]?.slot ?? 'I';
}

/** 落库槽位 → 配置里的中文名 */
export function slotToLabel(rules: EffectiveRules, slot: string | null): string {
  if (!slot) return '—';
  const hit = rules.classes.find((c) => c.slot === slot);
  return hit ? hit.label : slot;
}

/** 基线中文名 → 落库槽位 */
export function baselineToSlot(rules: EffectiveRules, label: string): string {
  const hit = rules.baselines.find((b) => b.label === label.trim());
  if (hit) return hit.slot;
  if (BASELINE_SLOTS.includes(label)) return label;
  return rules.baselines[0]?.slot ?? 'DESIGN';
}

export function baselineSlotToLabel(rules: EffectiveRules, slot: string): string {
  return rules.baselines.find((b) => b.slot === slot)?.label ?? slot;
}

/** 件号生成：机型/前缀 + 专业段 + 流水 */
export function buildPn(rules: EffectiveRules, type: string, seq: number): string {
  const id = rules.ident;
  const first = id.pn_prefix.trim() || id.model_code.trim() || 'XXX';
  const sep = id.pn_sep || '-';
  const width = id.pn_seq_width;
  const seqStr = String(seq).padStart(width, '0');
  const typeSeg: Record<string, string> = {
    SYSTEM: 'SYS',
    EQUIPMENT: 'EQP',
    HARDWARE: 'HW',
    SOFTWARE: 'SW',
    DOC: 'DOC',
  };
  const middle = typeSeg[type] ?? 'CI';
  const segs = id.pn_segments;
  if (segs <= 2) return [first, seqStr].join(sep);
  if (segs === 3) return [first, middle, seqStr].join(sep);
  return [first, middle, ...Array.from({ length: segs - 3 }, () => '00'), seqStr].join(sep);
}

/** 内置默认：与 lib/constants.ts 完全一致，enabled=false */
export function defaultRules(): EffectiveRules {
  const classes: RuleClass[] = [
    { code: 'I', label: 'I 类', slot: 'I' },
    { code: 'II', label: 'II 类', slot: 'II' },
    { code: 'III', label: 'III 类', slot: 'III' },
  ];
  const chains: Record<string, ChainStep[]> = {};
  for (const c of classes) chains[c.code] = CLASS_CHAINS[c.slot];
  const impacts: RuleImpact[] = IMPACT_ITEMS.map((i) => ({ key: i.key, label: i.label }));
  return {
    enabled: false,
    profileId: null,
    name: '内置默认规则',
    classes,
    chains,
    chainRoleLabels: Object.fromEntries(
      classes.map((c) => [c.code, CLASS_CHAINS[c.slot].map((s) => ROLE_NAMES[s.role_code])]),
    ),
    impacts,
    evidence: [
      '构型清单', '设计基线', '更改清单', '审批记录', '验证结果',
      '偏离记录', '纪实时间线', '符合性矩阵',
    ],
    evidenceTitle: '构型状态与更改证据包',
    baselines: [
      { label: '需求基线', slot: 'REQUIREMENT' },
      { label: '设计基线', slot: 'DESIGN' },
      { label: '取证基线', slot: 'CERTIFICATION' },
      { label: '其他', slot: 'OTHER' },
    ],
    roles: Object.values(ROLE_NAMES),
    roleCodes: Object.fromEntries(
      (Object.keys(ROLE_NAMES) as RoleCode[]).map((k) => [ROLE_NAMES[k], k]),
    ) as Record<string, RoleCode>,
    ident: {
      model_code: 'EX-01',
      pn_prefix: '',
      pn_segments: 3,
      pn_sep: '-',
      pn_seq_width: 3,
      rev_format: 'A',
    },
    switches: {
      sod: true,
      verify: true,
      classReason: true,
      threeFNewPn: true,
      frozenNoEdit: true,
      wipAction: true,
    },
  };
}

/** 读取当前生效配置（ACTIVE 优先；没有则回退内置默认） */
export async function getEffectiveRules(tenantId: number): Promise<EffectiveRules> {
  const p = await q1<{ id: number; name: string; status: string }>(
    `SELECT id, name, status FROM rule_profiles
     WHERE tenant_id = ? AND status = 'ACTIVE'
     ORDER BY id DESC LIMIT 1`,
    [tenantId],
  );
  if (!p) return defaultRules();

  const settings = await q<{ field_key: string; field_value: string }>(
    'SELECT field_key, field_value FROM profile_settings WHERE profile_id = ?',
    [p.id],
  );
  const rows = await q<{ class_code: string; step_no: number; step_name: string; role_code: string }>(
    'SELECT class_code, step_no, step_name, role_code FROM profile_steps WHERE profile_id = ? ORDER BY class_code, step_no',
    [p.id],
  );
  const v: Record<string, string> = {};
  for (const s of settings) v[s.field_key] = String(s.field_value ?? '');

  const base = defaultRules();
  const codes = split(v.class_codes);
  const labels = split(v.class_labels);
  const classes: RuleClass[] = codes.map((code, i) => ({
    code,
    label: labels[i] ?? code,
    slot: SLOTS[i] ?? 'III',
  }));
  if (classes.length === 0) classes.push(...base.classes);

  const roles = split(v.roles);
  const roleList = roles.length ? roles : base.roles;
  const roleCodes: Record<string, RoleCode> = {};
  for (const r of roleList) roleCodes[r] = resolveRoleCode(r);

  const chains: Record<string, ChainStep[]> = {};
  const chainRoleLabels: Record<string, string[]> = {};
  for (const c of classes) {
    const rawSteps = rows
      .filter((r) => r.class_code === c.code)
      .sort((a, b) => Number(a.step_no) - Number(b.step_no));
    chainRoleLabels[c.code] = rawSteps.map((r) => String(r.role_code ?? '')).filter(Boolean);
    const steps = rawSteps
      .map((r) => ({
        step_no: Number(r.step_no),
        step_name: String(r.step_name ?? ''),
        role_code: roleCodes[String(r.role_code ?? '')] ?? resolveRoleCode(String(r.role_code ?? '')),
      }))
      .filter((s) => s.step_no >= 1 && s.step_name);
    chains[c.code] = steps.length ? steps : (base.chains[c.slot] ?? []);
  }

  const impacts = split(v.impact_items).map((label, i) => ({ key: `i${i}`, label }));
  const baselineLabels = split(v.baseline_kinds);

  return {
    enabled: true,
    profileId: p.id,
    name: String(p.name ?? '我的规矩'),
    classes,
    chains,
    chainRoleLabels,
    impacts: impacts.length ? impacts : base.impacts,
    evidence: split(v.evidence_items).length ? split(v.evidence_items) : base.evidence,
    evidenceTitle: v.evidence_title?.trim() || base.evidenceTitle,
    baselines: baselineLabels.length
      ? baselineLabels.map((label, i) => ({ label, slot: BASELINE_SLOTS[i] ?? 'OTHER' }))
      : base.baselines,
    roles: roleList,
    roleCodes,
    ident: {
      model_code: v.model_code?.trim() || base.ident.model_code,
      pn_prefix: v.pn_prefix?.trim() ?? '',
      pn_segments: num(v.pn_segments, 3, 2, 6),
      pn_sep: v.pn_sep?.trim() || '-',
      pn_seq_width: num(v.pn_seq_width, 3, 1, 8),
      rev_format: v.rev_format?.trim() || base.ident.rev_format,
    },
    switches: {
      sod: yes(v.sod_enabled, true),
      verify: yes(v.verify_required, true),
      classReason: yes(v.class_reason_required, true),
      threeFNewPn: yes(v.three_f_new_pn, true),
      frozenNoEdit: yes(v.frozen_no_edit, true),
      wipAction: yes(v.wip_requires_action, true),
    },
  };
}

/** 影响项 key → 中文名（配置态下 key 为 i0/i1…，默认态为原 9 项 key） */
export function impactLabel(rules: EffectiveRules, key: string): string {
  return rules.impacts.find((i) => i.key === key)?.label ?? key;
}

/** 影响项是否包含「在制品」语义（R5 条件判定） */
export function wipKey(rules: EffectiveRules): string | null {
  return rules.impacts.find((i) => /在制品|WIP/i.test(i.label))?.key ?? null;
}

export type { ImpactKey };
