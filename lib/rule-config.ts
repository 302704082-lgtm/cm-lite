// 第一层「表单配置」：字段清单 + 试跑逻辑
// 前后端共用。本文件只定义「有哪些格子」和「按填的值能不能跑」，
// 不预填任何业务值 —— 空白就是这里一行值都没有。

export type FieldKind = 'text' | 'number' | 'switch';

export interface FieldDef {
  key: string;
  label: string;
  hint: string;
  suggestion: string;
  placeholder: string;
  kind: FieldKind;
  required?: boolean;
}

export interface SectionDef {
  key: string;
  title: string;
  desc: string;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    key: 'IDENT',
    title: '一 · 件号怎么编',
    desc: '决定新建构型项时件号长什么样。全部虚构，不要填真实型号。',
    fields: [
      {
        key: 'model_code',
        label: '机型代号',
        hint: '虚构一个机型代号，会用在件号第一段',
        suggestion: 'EX40',
        placeholder: '例如 EX40',
        kind: 'text',
        required: true,
      },
      {
        key: 'pn_prefix',
        label: '件号固定前缀（可留空）',
        hint: '留空就用机型代号当第一段',
        suggestion: '（留空）',
        placeholder: '可留空',
        kind: 'text',
      },
      {
        key: 'pn_segments',
        label: '件号分几段',
        hint: '填数字。3 表示「机型 - 专业 - 流水」这种三段式',
        suggestion: '3',
        placeholder: '例如 3',
        kind: 'number',
        required: true,
      },
      {
        key: 'pn_sep',
        label: '段与段之间用什么符号',
        hint: '一般是一个短横线',
        suggestion: '-',
        placeholder: '例如 -',
        kind: 'text',
      },
      {
        key: 'pn_seq_width',
        label: '流水号几位',
        hint: '3 位就是 001、002；4 位就是 0001',
        suggestion: '3',
        placeholder: '例如 3',
        kind: 'number',
      },
      {
        key: 'rev_format',
        label: '版本怎么写',
        hint: '单字母 A/B/C，或点分 V1.0 / V1.1',
        suggestion: 'V1.0',
        placeholder: '例如 V1.0 或 A',
        kind: 'text',
        required: true,
      },
      {
        key: 'three_f_new_pn',
        label: '外形/配合/功能变了，是否强制换新件号',
        hint: '选「是」表示大改不能只升版本，必须换号',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
    ],
  },
  {
    key: 'CHANGE',
    title: '二 · 更改分几类、谁签',
    desc: '类别和审批步骤决定一条变更要走过哪些人。步骤在下面单独加行。',
    fields: [
      {
        key: 'class_codes',
        label: '更改类别代号（逗号隔开）',
        hint: '顺序要和下面的中文名一一对应',
        suggestion: 'I,II,III',
        placeholder: '例如 I,II,III',
        kind: 'text',
        required: true,
      },
      {
        key: 'class_labels',
        label: '类别中文名（逗号隔开）',
        hint: '跟上面的代号顺序一致',
        suggestion: '大改,中改,小改',
        placeholder: '例如 大改,中改,小改',
        kind: 'text',
        required: true,
      },
      {
        key: 'roles',
        label: '有哪些签署角色（逗号隔开）',
        hint: '步骤里选角色时从这个清单里挑',
        suggestion: '设计,构型,质量,适航,技术分管,CCB',
        placeholder: '例如 设计,构型,质量,适航',
        kind: 'text',
        required: true,
      },
      {
        key: 'sod_enabled',
        label: '禁止同一个人又拟制又批准',
        hint: '选「是」后，系统会拦住自己签自己批的情况',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
      {
        key: 'verify_required',
        label: '关闭前必须勾「验证通过」',
        hint: '选「是」后，没验证就不准关闭变更',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
      {
        key: 'class_reason_required',
        label: '类别与系统建议不一致时，必须填理由',
        hint: '防止随手把大改降级成小改',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
    ],
  },
  {
    key: 'BASELINE',
    title: '三 · 基线（给状态拍快照）',
    desc: '决定哪几个时点要把全部构型项锁住存档。',
    fields: [
      {
        key: 'baseline_kinds',
        label: '基线类型（逗号隔开）',
        hint: '取证场景常见：需求、设计、取证、生产',
        suggestion: '需求,设计,取证,生产',
        placeholder: '例如 需求,设计,取证,生产',
        kind: 'text',
      },
      {
        key: 'frozen_no_edit',
        label: '冻结后禁止直接改版本',
        hint: '选「是」后，改版本只能走变更流程',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
    ],
  },
  {
    key: 'IMPACT',
    title: '四 · 影响分析要问哪几项',
    desc: '提变更时逐项确认，漏一项就不让提交。',
    fields: [
      {
        key: 'impact_items',
        label: '影响项清单（逗号隔开）',
        hint: '每项都要回答「有 / 无 / 待定」',
        suggestion: '互换性,接口,件号,在制品,库存,已交付品,工艺工装,成本进度,通知',
        placeholder: '例如 互换性,接口,在制品',
        kind: 'text',
        required: true,
      },
      {
        key: 'wip_requires_action',
        label: '「在制品＝有」时必须写处理意见',
        hint: '防止漏掉生产线上的半成品怎么处置',
        suggestion: '是',
        placeholder: '是 / 否',
        kind: 'switch',
      },
    ],
  },
  {
    key: 'EVIDENCE',
    title: '五 · 要交哪些材料',
    desc: '决定「导出证据包」里出现哪几份东西，以及排列顺序。',
    fields: [
      {
        key: 'evidence_title',
        label: '证据包封面标题',
        hint: '导出材料的名字',
        suggestion: '构型状态与更改证据包',
        placeholder: '例如 构型状态与更改证据包',
        kind: 'text',
      },
      {
        key: 'evidence_items',
        label: '材料清单（逗号隔开）',
        hint: '顺序就是导出目录的顺序',
        suggestion: '构型清单,设计基线,更改清单,审批记录,验证结果,偏离记录,纪实时间线,符合性矩阵',
        placeholder: '例如 构型清单,更改清单,审批记录',
        kind: 'text',
        required: true,
      },
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

export interface ProfileStep {
  class_code: string;
  step_no: number;
  step_name: string;
  role_code: string;
}

export interface PreviewInput {
  values: Record<string, string>;
  steps: ProfileStep[];
}

export interface PreviewResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
  sample_pn: string | null;
  chains: { cls: string; label: string; steps: string[] }[];
  impact: string[];
  evidence: string[];
  summary: string;
}

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isYes(v: string | undefined): boolean {
  return (v ?? '').trim() === '是';
}

/** 按填好的第一层配置，真实跑一遍规则推演（沙盒，不写业务数据） */
export function preview(input: PreviewInput): PreviewResult {
  const v = input.values ?? {};
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const f of ALL_FIELDS) {
    if (f.required && !(v[f.key] ?? '').trim()) missing.push(f.label);
  }

  const classes = splitList(v.class_codes);
  const labels = splitList(v.class_labels);
  const roles = splitList(v.roles);
  const impact = splitList(v.impact_items);
  const evidence = splitList(v.evidence_items);

  if (classes.length === 0 && (v.class_codes ?? '').trim()) {
    warnings.push('类别代号没解析出来，请用逗号隔开');
  }
  if (classes.length !== labels.length) {
    warnings.push(`类别代号 ${classes.length} 个、中文名 ${labels.length} 个，数量对不上`);
  }
  if (roles.length === 0 && (v.roles ?? '').trim()) {
    warnings.push('角色清单没解析出来，请用逗号隔开');
  }

  // 件号示例
  const segN = Math.max(1, Math.min(6, Number(v.pn_segments) || 0));
  const sep = (v.pn_sep ?? '').trim() || '-';
  const width = Math.max(1, Math.min(8, Number(v.pn_seq_width) || 3));
  const first = (v.pn_prefix ?? '').trim() || (v.model_code ?? '').trim() || 'XXX';
  const seq = '1'.padStart(width, '0');
  const samplePn = missing.includes('机型代号') || missing.includes('件号分几段')
    ? null
    : [first, ...Array.from({ length: Math.max(0, segN - 2) }, () => 'FC'), seq].join(sep);

  // 各类别的审批链
  const chains = classes.map((cls, i) => {
    const label = labels[i] ?? cls;
    const rows = input.steps
      .filter((s) => s.class_code === cls)
      .sort((a, b) => a.step_no - b.step_no);
    return {
      cls,
      label,
      steps: rows.map((s) => `${s.step_no}. ${s.step_name || '（未命名步骤）'} → ${s.role_code || '（未选角色）'}`),
    };
  });

  for (const c of chains) {
    if (c.steps.length === 0) {
      missing.push(`「${c.label}」类别的审批步骤（至少 1 步）`);
    }
    for (const s of input.steps.filter((x) => x.class_code === c.cls)) {
      if (!s.step_name.trim()) warnings.push(`「${c.label}」第 ${s.step_no} 步没填名字`);
      if (roles.length > 0 && s.role_code.trim() && !roles.includes(s.role_code.trim())) {
        warnings.push(`「${c.label}」第 ${s.step_no} 步的角色「${s.role_code}」不在角色清单里`);
      }
    }
  }

  if (isYes(v.sod_enabled)) {
    for (const c of chains) {
      if (c.steps.length === 1) {
        warnings.push(`「${c.label}」只有 1 步，职责分离形同虚设（建议至少 2 步）`);
      }
    }
  }
  if (!isYes(v.verify_required)) warnings.push('未开启「验证通过才能关闭」，变更可能没验证就结案');
  if (!isYes(v.frozen_no_edit)) warnings.push('未开启「冻结后禁止直接改版本」，基线可被绕过');
  if (!isYes(v.three_f_new_pn)) warnings.push('未开启「大改强制换件号」，3F 变化可只升版本');
  if (impact.length === 0) warnings.push('影响项清单为空，提变更时不会逐项确认');
  if (evidence.length === 0) warnings.push('证据包材料清单为空，导出会是空的');

  const ok = missing.length === 0;
  const firstChain = chains.find((c) => c.steps.length > 0);
  const summary = ok
    ? `能跑通。按你填的规矩：新建件号示例 ${samplePn ?? '（未生成）'}；` +
      `${firstChain ? `一条「${firstChain.label}」会走 ${firstChain.steps.length} 步（${firstChain.steps.map((s) => s.split('. ')[1]?.split(' → ')[0]).join(' → ')}）；` : ''}` +
      `影响分析 ${impact.length} 项；证据包 ${evidence.length} 份。${warnings.length ? `另有 ${warnings.length} 条提醒。` : '没有提醒。'}`
    : `还跑不起来，差 ${missing.length} 个格子：${missing.join('、')}。补齐后再试跑。`;

  return {
    ok,
    missing,
    warnings,
    sample_pn: samplePn,
    chains,
    impact,
    evidence,
    summary,
  };
}
