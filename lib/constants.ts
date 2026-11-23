// 角色、审批链、影响分析项 —— 全部为服务端与前端共用的常量
// 任何改动都必须同步 sql 种子与审批链生成逻辑

export type RoleCode =
  | 'DESIGN_ENG'
  | 'CM_ENGINEER'
  | 'QUALITY_ENG'
  | 'AIRWORTHINESS'
  | 'PRODUCTION'
  | 'DEPT_DIRECTOR'
  | 'TECH_DIRECTOR'
  | 'CCB_CHAIR';

export const ROLE_NAMES: Record<RoleCode, string> = {
  DESIGN_ENG: '设计工程师',
  CM_ENGINEER: '构型管理工程师',
  QUALITY_ENG: '质量工程师',
  AIRWORTHINESS: '适航管理',
  PRODUCTION: '生产',
  DEPT_DIRECTOR: '部门总监',
  TECH_DIRECTOR: '技术分管',
  CCB_CHAIR: '构型管理委员会主任',
};

export type ChangeClass = 'I' | 'II' | 'III';

export interface ChainStep {
  step_no: number;
  step_name: string;
  role_code: RoleCode;
}

// 默认审批链（§5.2）：II 类不设部门总监与 CCB；III 类两步
export const CLASS_CHAINS: Record<ChangeClass, ChainStep[]> = {
  I: [
    { step_no: 1, step_name: '拟制', role_code: 'DESIGN_ENG' },
    { step_no: 2, step_name: '设计审核', role_code: 'DEPT_DIRECTOR' },
    { step_no: 3, step_name: '质量会签', role_code: 'QUALITY_ENG' },
    { step_no: 4, step_name: '构型审核', role_code: 'CM_ENGINEER' },
    { step_no: 5, step_name: '适航影响评估', role_code: 'AIRWORTHINESS' },
    { step_no: 6, step_name: '技术分管批准', role_code: 'TECH_DIRECTOR' },
    { step_no: 7, step_name: 'CCB 批准', role_code: 'CCB_CHAIR' },
  ],
  II: [
    { step_no: 1, step_name: '拟制', role_code: 'DESIGN_ENG' },
    { step_no: 2, step_name: '质量会签', role_code: 'QUALITY_ENG' },
    { step_no: 3, step_name: '构型审核', role_code: 'CM_ENGINEER' },
    { step_no: 4, step_name: '适航影响评估', role_code: 'AIRWORTHINESS' },
    { step_no: 5, step_name: '技术分管批准', role_code: 'TECH_DIRECTOR' },
  ],
  III: [
    { step_no: 1, step_name: '拟制', role_code: 'DESIGN_ENG' },
    { step_no: 2, step_name: '构型审核并批准', role_code: 'CM_ENGINEER' },
  ],
};

// 影响分析 9 项（R6）：每项三选一，缺一不可提交
export const IMPACT_ITEMS = [
  { key: 'interchange', label: '互换性' },
  { key: 'interface', label: '接口影响' },
  { key: 'pn', label: '件号变更' },
  { key: 'wip', label: '在制品' },
  { key: 'stock', label: '库存' },
  { key: 'delivered', label: '已交付品' },
  { key: 'process', label: '工艺工装检验' },
  { key: 'cost', label: '成本与进度' },
  { key: 'notify', label: '客户供应商通知' },
] as const;

export type ImpactKey = (typeof IMPACT_ITEMS)[number]['key'];
export type ImpactValue = 'YES' | 'NO' | 'TBD';

export const IMPACT_VALUES: { value: ImpactValue; label: string }[] = [
  { value: 'YES', label: '有' },
  { value: 'NO', label: '无' },
  { value: 'TBD', label: '待定' },
];

export const CI_TYPES = ['SYSTEM', 'EQUIPMENT', 'HARDWARE', 'SOFTWARE', 'DOC'] as const;
export type CiType = (typeof CI_TYPES)[number];

export const CI_TYPE_NAMES: Record<CiType, string> = {
  SYSTEM: '整机',
  EQUIPMENT: '分系统',
  HARDWARE: '硬件件',
  SOFTWARE: '软件件',
  DOC: '文件件',
};

export const CI_STATUS_NAMES: Record<string, string> = {
  DRAFT: '草稿',
  CONTROLLED: '受控',
  FROZEN: '冻结',
  VOID: '作废',
};

export const CRITICALITY_NAMES: Record<string, string> = {
  NORMAL: '一般件',
  KEY: '关键件',
  IMPORTANT: '重要件',
};

export const CHANGE_KIND_NAMES: Record<string, string> = {
  PR: '变更申请',
  CR: '变更单',
  CN: '变更通知',
};

export const CHANGE_STATUS_NAMES: Record<string, string> = {
  OPEN: '进行中',
  LINKED: '已转 CR',
  APPROVED: '已批准待执行',
  EXECUTED: '已执行',
  CLOSED: '已关闭',
  REJECTED: '已驳回',
};

export const BASELINE_KIND_NAMES: Record<string, string> = {
  REQUIREMENT: '需求基线',
  DESIGN: '设计基线',
  CERTIFICATION: '取证基线',
  OTHER: '其他',
};

export const DEVIATION_KIND_NAMES: Record<string, string> = {
  DEVIATION: '偏离',
  CONCESSION: '让步',
};

export const DEMO_TENANT_SLUG = 'demo';
