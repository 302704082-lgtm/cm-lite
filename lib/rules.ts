import { ApiError } from './api';
import {
  CLASS_CHAINS,
  IMPACT_ITEMS,
  type ChangeClass,
  type ChainStep,
  type ImpactKey,
  type ImpactValue,
} from './constants';

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
  abca: boolean; // 判据 A：触及功能/分配基线限值
  abcb: boolean; // 判据 B：设计冻结后更改且影响质量
  abcc: boolean; // 判据 C：对互换性/手册/成本进度/适航有重大影响
  class_result: ChangeClass;
  class_reason: string | null;
  impact: Partial<Record<ImpactKey, ImpactValue>>;
  wip_action: string | null;
}

/** 屏 2 判据 → 建议类别（3F 只是预判，终判依据屏 2） */
export function recommendClass(abc: { a: boolean; b: boolean; c: boolean }): ChangeClass {
  return abc.a || abc.b || abc.c ? 'I' : 'II';
}

export function any3F(v: { fit: boolean; form: boolean; fn: boolean }): boolean {
  return v.fit || v.form || v.fn;
}

export function chainFor(cls: ChangeClass): ChainStep[] {
  return CLASS_CHAINS[cls];
}

/**
 * 向导提交前的全部服务端校验（§6 R4/R5/R6/R9 + 屏 3 改级规则）
 * 违反一律抛 ApiError，前端的禁用态只是体验优化。
 */
export function validateWizard(
  input: WizardInput,
  ci: { criticality: string } | null,
): void {
  if (!input.model) throw new ApiError(400, '请选择机型');
  if (!input.title.trim()) throw new ApiError(400, '变更标题不能为空');
  if (!input.ci_pn) throw new ApiError(400, '请选择变更对象（构型项）');

  // R6：影响分析 9 项逐项必选
  const missing = IMPACT_ITEMS.filter((it) => {
    const v = input.impact[it.key];
    return v !== 'YES' && v !== 'NO' && v !== 'TBD';
  });
  if (missing.length > 0) {
    throw new ApiError(400, `影响分析未填完：${missing.map((m) => m.label).join('、')}`);
  }

  // R5：在制品=有 → 必须写明处理意见
  if (input.impact.wip === 'YES' && !(input.wip_action ?? '').trim()) {
    throw new ApiError(400, '影响分析中「在制品」为「有」，必须填写在制品处理意见');
  }

  // R9：关键件/重要件只能走 I 类
  const critical = ci?.criticality === 'KEY' || ci?.criticality === 'IMPORTANT';
  if (critical && input.class_result !== 'I') {
    throw new ApiError(409, '关键件/重要件变更必须走 I 类评审，不可降级');
  }

  // 屏 3：选 III 类时 A/B/C 必须全部未命中
  if (input.class_result === 'III' && (input.abca || input.abcb || input.abcc)) {
    throw new ApiError(409, 'I 类判据已命中，不允许定为 III 类');
  }

  // R4：3F 任一命中 → 大改，禁止原地升版，必须给新件号
  if (any3F({ fit: input.f_fit, form: input.f_form, fn: input.f_function })) {
    if (!(input.new_pn ?? '').trim()) {
      throw new ApiError(400, '3F 任一命中即判为大改，必须填写新件号（新件号将新建构型项，原件号作废）');
    }
    if (input.new_pn === input.ci_pn) {
      throw new ApiError(400, '新件号不能与原件号相同');
    }
  }

  // 改级必须留理由
  const recommended = recommendClass({ a: input.abca, b: input.abcb, c: input.abcc });
  if (input.class_result !== recommended && !(input.class_reason ?? '').trim()) {
    throw new ApiError(400, `类别与判据建议（${recommended} 类）不一致，必须填写改级理由`);
  }

  if (input.class_result !== 'I' && !input.to_rev && !(input.new_pn ?? '').trim()) {
    throw new ApiError(400, '原地升版必须填写目标版本号');
  }
}

export function normalizeImpact(
  impact: Partial<Record<ImpactKey, ImpactValue>>,
): Record<ImpactKey, ImpactValue> {
  const out = {} as Record<ImpactKey, ImpactValue>;
  for (const it of IMPACT_ITEMS) out[it.key] = (impact[it.key] ?? 'NO') as ImpactValue;
  return out;
}
