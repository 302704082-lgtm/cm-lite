import { ApiError } from './api';
import {
  CLASS_CHAINS,
  type ChainStep,
  type ChangeClass,
  type ImpactValue,
} from './constants';
import {
  classToSlot,
  defaultRules,
  wipKey,
  type EffectiveRules,
} from './profile';

export interface WizardInput {
  model: string;
  ci_pn: string | null;
  from_rev: string | null;
  to_rev: string | null;
  new_pn: string | null;
  title: string;
  reason: string | null;
  f_fit: boolean;
  f_form: boolean;
  f_function: boolean;
  abca: boolean;
  abcb: boolean;
  abcc: boolean;
  class_result: string; // 配置态为自定义类别代号，默认态为 I/II/III
  class_reason: string | null;
  impact: Record<string, ImpactValue>;
  wip_action: string | null;
}

/** 判据 → 建议类别（配置态：命中判据取第一档，否则取第二档） */
export function recommendClass(
  abc: { a: boolean; b: boolean; c: boolean },
  rules: EffectiveRules = defaultRules(),
): string {
  const strict = rules.classes[0]?.code ?? 'I';
  const normal = rules.classes[1]?.code ?? strict;
  return abc.a || abc.b || abc.c ? strict : normal;
}

export function any3F(v: { fit: boolean; form: boolean; fn: boolean }): boolean {
  return v.fit || v.form || v.fn;
}

/** 按配置取审批链；找不到时回退内置链 */
export function chainFor(cls: string, rules: EffectiveRules = defaultRules()): ChainStep[] {
  const hit = rules.chains[cls];
  if (hit && hit.length) return hit;
  const slot = classToSlot(rules, cls) as ChangeClass;
  return CLASS_CHAINS[slot] ?? [];
}

/**
 * 向导提交前的全部服务端校验。
 * 规则项（影响项清单、3F 换号、改级理由、在制品处理）全部来自生效配置。
 */
export function validateWizard(
  input: WizardInput,
  ci: { criticality: string } | null,
  rules: EffectiveRules = defaultRules(),
): void {
  if (!input.model) throw new ApiError(400, '请选择机型');
  if (!input.title.trim()) throw new ApiError(400, '变更标题不能为空');
  if (!input.ci_pn) throw new ApiError(400, '请选择变更对象（构型项）');

  // 类别必须属于当前生效配置
  const cls = rules.classes.find((c) => c.code === input.class_result);
  if (!cls) {
    throw new ApiError(400, `未知更改类别「${input.class_result}」，当前可用：${rules.classes.map((c) => c.label).join('、')}`);
  }

  // 影响分析：按配置清单逐项必选
  const missing = rules.impacts.filter((it) => {
    const v = input.impact[it.key];
    return v !== 'YES' && v !== 'NO' && v !== 'TBD';
  });
  if (missing.length > 0) {
    throw new ApiError(400, `影响分析未填完：${missing.map((m) => m.label).join('、')}`);
  }

  // 在制品＝有 → 必须写明处理意见（配置开关）
  const wk = wipKey(rules);
  if (rules.switches.wipAction && wk && input.impact[wk] === 'YES' && !(input.wip_action ?? '').trim()) {
    throw new ApiError(400, '影响分析中「在制品」为「有」，必须填写在制品处理意见');
  }

  // 关键件/重要件只能走最严类别
  const critical = ci?.criticality === 'KEY' || ci?.criticality === 'IMPORTANT';
  const strictCode = rules.classes[0]?.code;
  if (critical && cls.code !== strictCode) {
    throw new ApiError(409, `关键件/重要件变更必须走「${rules.classes[0]?.label ?? '最严类别'}」评审，不可降级`);
  }

  // 最宽松类别要求判据全部未命中
  if (cls.code === rules.classes[rules.classes.length - 1]?.code && (input.abca || input.abcb || input.abcc)) {
    throw new ApiError(409, '严格判据已命中，不允许定为最宽松类别');
  }

  // 3F 任一命中 → 大改，禁止原地升版，必须给新件号（配置开关）
  if (rules.switches.threeFNewPn && any3F({ fit: input.f_fit, form: input.f_form, fn: input.f_function })) {
    if (!(input.new_pn ?? '').trim()) {
      throw new ApiError(400, '3F 任一命中即判为大改，必须填写新件号（新件号将新建构型项，原件号作废）');
    }
    if (input.new_pn === input.ci_pn) {
      throw new ApiError(400, '新件号不能与原件号相同');
    }
  }

  // 改级必须留理由（配置开关）
  const recommended = recommendClass({ a: input.abca, b: input.abcb, c: input.abcc }, rules);
  if (rules.switches.classReason && input.class_result !== recommended && !(input.class_reason ?? '').trim()) {
    throw new ApiError(400, `类别与判据建议（${recommended}）不一致，必须填写改级理由`);
  }

  // 非最严类别且原地升版 → 必须给目标版本号
  if (cls.code !== strictCode && !input.to_rev && !(input.new_pn ?? '').trim()) {
    throw new ApiError(400, '原地升版必须填写目标版本号');
  }
}

export function normalizeImpact(
  impact: Record<string, ImpactValue>,
  rules: EffectiveRules = defaultRules(),
): Record<string, ImpactValue> {
  const out: Record<string, ImpactValue> = {};
  for (const it of rules.impacts) out[it.key] = impact[it.key] ?? 'NO';
  return out;
}
