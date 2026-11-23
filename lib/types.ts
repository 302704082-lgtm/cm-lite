export interface Ci {
  id: number;
  model: string;
  pn: string;
  name: string;
  type: string;
  parent_pn: string | null;
  qty: number;
  rev: string;
  sn_controlled: number;
  status: string;
  criticality: string;
  owner: string;
  basis: string | null;
  note: string | null;
  created_at: string;
}

export interface Doc {
  id: number;
  ci_pn: string;
  doc_no: string;
  title: string;
  rev: string;
  status: string;
  url: string | null;
}

export interface Baseline {
  id: number;
  model: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  created_by: string;
  created_at: string;
  frozen_at: string | null;
  item_count?: number;
}

export interface BaselineItem {
  id: number;
  baseline_id: number;
  ci_pn: string;
  ci_rev: string;
  doc_no: string | null;
  doc_rev: string | null;
  ci_name?: string | null;
  ci_status?: string | null;
}

export interface Change {
  id: number;
  code: string;
  kind: string;
  parent_id: number | null;
  model: string;
  ci_pn: string | null;
  from_rev: string | null;
  to_rev: string | null;
  new_pn: string | null;
  title: string;
  reason: string | null;
  f_fit: number;
  f_form: number;
  f_function: number;
  class_result: string | null;
  class_reason: string | null;
  impact_json: string | null;
  wip_action: string | null;
  status: string;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  verified: number;
}

export interface Approval {
  id: number;
  change_id: number;
  step_no: number;
  step_name: string;
  role_code: string;
  signer_user_id: number | null;
  decision: string | null;
  comment: string | null;
  signed_at: string | null;
  signer_name?: string | null;
}

export interface Deviation {
  id: number;
  kind: string;
  ci_pn: string;
  unit_sn: string | null;
  reason: string;
  qty_limit: number;
  expire_at: string;
  status: string;
  created_by: string;
  created_at: string;
}

export interface EventRow {
  id: number;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string | null;
  created_at: string;
}

export interface UnitRow {
  id: number;
  model: string;
  sn: string;
  produced_at: string | null;
}

export interface Fitting {
  unit_id: number;
  sn: string;
  ci_pn: string;
  ci_rev: string;
  remark: string | null;
}
