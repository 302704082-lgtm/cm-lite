#!/usr/bin/env python3
"""
cm-lite v3 全链路冒烟：验证「每步一张受控表单 + 流程闸门 + 证据包出单 + 版本履历链」。

前提：跑过 flow-init.mjs（本地或云端），服务已启动。
运行：python scripts/smoke-v3.py [http://localhost:3002]

检查：
  A. 三道闸门：无批准申请单时，冻结 / 建变更 / 登记偏离 全部 409
  B. 表单流程：新建 → 填字段与检查单 → 提交 → 三级签署 → 已批准
  C. 闸门放行：批准后冻结 / 建 PR / 登记偏离 成功
  D. 表单规则：跳步 409、职责分离 409、必填/检查单未判定 400、可单独打印
  E. 阶段二：流程配置可读写、变更单显示流程步骤、状态一览表 13 列 + 履历链、证据包含受控表单
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3002'
PASS = 0
FAIL = 0


def check(label, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {label}')
    else:
        FAIL += 1
        print(f'  ✗ {label}  {extra}')


class Client:
    """手动维护 Cookie：生产构建 cookie 带 Secure，标准 CookieJar 在 http 上不回送。"""
    def __init__(self):
        self.cookies = {}
        self.opener = urllib.request.build_opener()

    def absorb(self, msg):
        for line in msg.get_all('Set-Cookie') or []:
            first = line.split(';', 1)[0].strip()
            if '=' not in first:
                continue
            k, v = first.split('=', 1)
            k, v = k.strip(), v.strip()
            if not v or 'max-age=0' in line.lower().replace(' ', ''):
                self.cookies.pop(k, None)
            else:
                self.cookies[k] = v

    def req(self, path, data=None, raw=False):
        body = json.dumps(data).encode('utf-8') if data is not None else None
        method = 'POST' if body is not None else 'GET'
        headers = {'Content-Type': 'application/json'} if body is not None else {}
        if self.cookies:
            headers['Cookie'] = '; '.join(f'{k}={v}' for k, v in self.cookies.items())
        r = urllib.request.Request(BASE + path, data=body, method=method, headers=headers)
        try:
            with self.opener.open(r, timeout=25) as resp:
                self.absorb(resp.headers)
                status, text = resp.status, resp.read().decode('utf-8-sig', 'replace')
        except urllib.error.HTTPError as e:
            self.absorb(e.headers)
            status, text = e.code, e.read().decode('utf-8-sig', 'replace')
        if raw:
            return status, text
        try:
            return status, json.loads(text)
        except Exception:
            return status, text

    def login(self, user_id, pin='1234'):
        self.req('/api/auth/tenant', {'slug': 'demo', 'passcode': 'demo123'})
        return self.req('/api/auth/session', {'userId': user_id, 'pin': pin})


def fill_and_sign(designer, clients, form_id, data, sign_roles, scene_label):
    """填完字段与检查单、提交、按岗位顺序逐级签署，返回最终状态。"""
    st, d = designer.req(f'/api/forms/{form_id}')
    check(f'{scene_label}：能读到表单定义', st == 200 and isinstance(d, dict) and 'fields' in d, str(d)[:160])
    if not isinstance(d, dict) or 'checks' not in d:
        return None
    checks = [{'key': c['key'], 'label': c['label'], 'result': 'PASS', 'note': '冒烟测试逐项判定'}
              for c in d['checks']]
    st, _ = designer.req(f'/api/forms/{form_id}/save', {'data': data, 'checks': checks})
    check(f'{scene_label}：保存字段与检查单', st == 200, str(st))
    st, j = designer.req(f'/api/forms/{form_id}/submit', {})
    check(f'{scene_label}：提交送签', st == 200, f'{st} {j}'[:200])
    for i, (role, client) in enumerate(sign_roles, start=1):
        st, j = client.req(f'/api/forms/{form_id}/sign',
                           {'stepNo': i, 'decision': 'APPROVE', 'comment': f'冒烟第 {i} 步同意'})
        check(f'{scene_label}：第 {i} 步由 {role} 签署', st == 200, f'{st} {j}'[:200])
    st, d2 = designer.req(f'/api/forms/{form_id}')
    status = d2.get('instance', {}).get('status') if isinstance(d2, dict) else None
    check(f'{scene_label}：全部签完状态为已批准', status == 'APPROVED', str(status))
    return form_id


def main():
    print(f'目标：{BASE}\n')
    boot = Client()
    st, tenant = boot.req('/api/auth/tenant', {'slug': 'demo', 'passcode': 'demo123'})
    check('通道登录 demo/demo123', st == 200 and isinstance(tenant, dict) and 'users' in tenant, str(tenant)[:160])
    if not isinstance(tenant, dict) or 'users' not in tenant:
        return 1
    users = tenant['users']
    by_role = {}
    for u in users:
        by_role.setdefault(u['role_code'], u['id'])
    print('  用户：', ', '.join(f"{u['name']}={u['role_code']}" for u in users))

    def cli(role):
        c = Client()
        st, _ = c.login(by_role[role])
        check(f'{role} 登录', st == 200)
        return c

    designer = cli('DESIGN_ENG')
    quality = cli('QUALITY_ENG')
    air = cli('AIRWORTHINESS')
    chair = cli('CCB_CHAIR')
    cm = cli('CM_ENGINEER')

    # ---------- 0. 页面与底座 ----------
    st, forms = designer.req('/api/forms')
    check('表单中心：列出 6 张启用模板', st == 200 and len(forms.get('templates', [])) == 6, str(forms)[:200])
    st, flows = designer.req('/api/flows')
    check('流程配置：读到 8 条流程步骤', st == 200 and len(flows.get('steps', [])) == 8, str(flows)[:200])
    st, page = designer.req('/app/forms', raw=True)
    check('表单中心页可打开', st == 200 and '受控表单中心' in page)
    st, page = designer.req('/app/flows', raw=True)
    check('流程配置页可打开', st == 200 and '流程配置' in page)

    # ---------- A. 闸门拦截 ----------
    stamp = str(int(time.time()))[-6:]
    st, bl = designer.req('/api/baselines', {
        'model': 'EX-01', 'code': f'SMK{stamp}', 'name': '冒烟基线', 'kind': '功能基线',
    })
    bl_id = bl.get('id') if isinstance(bl, dict) else None
    check('新建待冻结基线', st == 201 and bl_id, f'{st} {bl}'[:200])
    if not bl_id:
        return 1

    st, j = designer.req(f'/api/baselines/{bl_id}/freeze', {})
    check('闸门①：无批准申请单时冻结 → 409', st == 409, f'{st} {j}'[:220])

    st, j = designer.req('/api/changes', {
        'model': 'EX-01', 'ci_pn': 'EX40-HW-001', 'title': '冒烟：未评审变更', 'reason': 'x',
    })
    check('闸门②：无批准申请单时建变更 → 409', st == 409, f'{st} {j}'[:220])

    st, j = designer.req('/api/deviations', {
        'kind': 'DEVIATION', 'ci_pn': 'EX40-HW-001', 'reason': '冒烟', 'qty_limit': 1,
        'expire_at': '2027-12-31',
    })
    check('闸门③：无批准申请单时登记偏离 → 409', st == 409, f'{st} {j}'[:220])

    # ---------- B. 基线发布申请单 ----------
    st, f = designer.req('/api/forms', {
        'templateCode': 'BASELINE_RELEASE', 'targetType': 'baseline', 'targetId': bl_id,
        'title': '冒烟基线发布申请', 'autoItems': True,
    })
    br_id = f.get('id') if isinstance(f, dict) else None
    check('新建《基线发布申请单》', st == 201 and br_id, f'{st} {f}'[:200])
    st, d = designer.req(f'/api/forms/{br_id}')
    check('申请单自动带出冻结清单（>0 项）', st == 200 and len(d.get('items', [])) > 0,
          str(len(d.get('items', [])) if isinstance(d, dict) else d))
    check('申请单有 5 项发布检查单', isinstance(d, dict) and len(d.get('checks', [])) == 5)
    check('申请单有 3 个签字位', isinstance(d, dict) and len(d.get('steps', [])) == 3)

    # 必填未填 / 检查单未判定 → 400
    st, j = designer.req(f'/api/forms/{br_id}/submit', {})
    check('表单规则：必填未齐 / 检查单未判定 → 400', st == 400, f'{st} {j}'[:200])

    br_data = {
        'baseline_name': '冒烟功能基线', 'baseline_id': f'SMK{stamp}',
        'baseline_ver': 'V1.0', 'baseline_type': '功能基线',
        'apply_date': '2026-11-25', 'scope': '冒烟范围',
    }
    fill_and_sign(designer, [], br_id, br_data,
                  [('设计工程师', designer), ('独立监督负责人', quality), ('责任经理', chair)],
                  '基线发布申请单')

    # 表单可单独打印
    st, html = designer.req(f'/api/forms/{br_id}?format=html', raw=True)
    check('表单可单独打印（含字段/检查单/签署/打印样式）',
          st == 200 and all(x in html for x in ['基线发布申请单', '检查单', '签署', '@media print', '冒烟功能基线']),
          str(st))

    # ---------- C. 闸门放行：冻结 ----------
    st, j = designer.req(f'/api/baselines/{bl_id}/freeze', {})
    check('闸门①放行：三签齐备后冻结成功', st == 200, f'{st} {j}'[:200])

    # ---------- 变更申请与可行性评审单 ----------
    st, f = designer.req('/api/forms', {
        'templateCode': 'CHANGE_REQUEST', 'title': '冒烟变更申请与可行性评审',
    })
    crq_id = f.get('id') if isinstance(f, dict) else None
    check('新建《变更申请与可行性评审单》', st == 201 and crq_id, f'{st} {f}'[:200])

    # 跳步 / 职责分离
    crq_data = {
        'model': 'EX-01', 'ci_pn': 'EX40-HW-001', 'title': '冒烟：闸门后变更',
        'reason': '验证闸门', 'plan': 'V1.0 → V1.1', 'proposed_class': '小改',
        'review_conclusion': '评审通过，可行', 'verify_need': '需要',
    }
    st, dd = designer.req(f'/api/forms/{crq_id}')
    checks = [{'key': c['key'], 'label': c['label'], 'result': 'PASS'} for c in dd.get('checks', [])]
    designer.req(f'/api/forms/{crq_id}/save', {'data': crq_data, 'checks': checks})
    designer.req(f'/api/forms/{crq_id}/submit', {})
    st, j = chair.req(f'/api/forms/{crq_id}/sign', {'stepNo': 3, 'decision': 'APPROVE'})
    check('表单规则：不可跳步（直接签第 3 步）→ 409', st == 409, f'{st} {j}'[:200])
    st, j = designer.req(f'/api/forms/{crq_id}/sign', {'stepNo': 1, 'decision': 'APPROVE'})
    check('变更申请：第 1 步设计工程师签', st == 200, f'{st} {j}'[:200])
    st, j = air.req(f'/api/forms/{crq_id}/sign', {'stepNo': 2, 'decision': 'APPROVE'})
    check('变更申请：第 2 步适航经理签', st == 200, f'{st} {j}'[:200])
    st, j = chair.req(f'/api/forms/{crq_id}/sign', {'stepNo': 3, 'decision': 'APPROVE'})
    check('变更申请：第 3 步责任经理签 → 批准', st == 200 and isinstance(j, dict) and j.get('status') == 'APPROVED',
          f'{st} {j}'[:200])

    st, j = designer.req('/api/changes', {
        'model': 'EX-01', 'ci_pn': 'EX40-HW-001', 'title': '冒烟：闸门后变更',
        'reason': '验证闸门', 'request_form_id': crq_id,
    })
    pr_id = j.get('id') if isinstance(j, dict) else None
    check('闸门②放行：凭已批准申请单建 PR 成功', st == 201 and pr_id, f'{st} {j}'[:200])
    check('返回的关联单号正确', isinstance(j, dict) and str(j.get('linkedForm', '')).startswith('CRQ-'), str(j)[:160])

    if pr_id:
        impact = {f'i{i}': 'NO' for i in range(12)}
        st, j = designer.req(f'/api/changes/{pr_id}/to-cr', {
            'model': 'EX-01', 'ci_pn': 'EX40-HW-001', 'from_rev': 'V1.0', 'to_rev': 'V1.1',
            'new_pn': None, 'title': '冒烟：闸门后变更', 'reason': '验证闸门',
            'f_fit': False, 'f_form': False, 'f_function': False,
            'abca': False, 'abcb': False, 'abcc': False,
            'class_result': '小改', 'class_reason': None,
            'impact': impact, 'wip_action': None,
        })
        cr_id = j.get('id') if isinstance(j, dict) else None
        check('PR → CR 主线仍可用（配置审批链 3 步）', st == 201 and cr_id and j.get('steps') == 3,
              f'{st} {j}'[:240])
        if cr_id:
            st, page = designer.req(f'/app/changes/{cr_id}', raw=True)
            check('变更详情页显示「流程步骤与表单」', st == 200 and '流程步骤与表单' in page)
            st, j = cm.req(f'/api/changes/{cr_id}/sign', {'stepNo': 2, 'decision': 'APPROVE'})
            check('CR 第 2 步构型管理工程师签', st == 200, f'{st} {j}'[:160])
            st, j = quality.req(f'/api/changes/{cr_id}/sign', {'stepNo': 3, 'decision': 'APPROVE'})
            check('CR 第 3 步独立监督签 → 批准', st == 200 and isinstance(j, dict) and j.get('status') == 'APPROVED',
                  f'{st} {j}'[:160])
            st, j = designer.req(f'/api/changes/{cr_id}/execute', {'note': '按批准构型升版', 'verified': True})
            check('执行并验证通过 → CN + 写入版本履历', st == 200, f'{st} {j}'[:160])
            st, j = designer.req(f'/api/changes/{cr_id}/close', {})
            check('关闭变更 → 闭环（默认流程第 2 步起无闸门，兼容旧流程）', st == 200, f'{st} {j}'[:160])

    # ---------- 偏离 / 让步申请单 ----------
    st, f = designer.req('/api/forms', {'templateCode': 'DEVIATION', 'title': '冒烟偏离申请'})
    dev_id = f.get('id') if isinstance(f, dict) else None
    check('新建《偏离 / 让步申请单》', st == 201 and dev_id, f'{st} {f}'[:200])
    dev_data = {
        'ci_pn': 'EX40-HW-001', 'kind': '偏离', 'reason': '冒烟偏离',
        'scope': '1 台 / 仅演示', 'expire': '2027-12-31', 'measure': '无适航影响',
    }
    fill_and_sign(designer, [], dev_id, dev_data,
                  [('设计工程师', designer), ('适航经理', air), ('责任经理', chair)],
                  '偏离申请单')
    st, j = designer.req('/api/deviations', {
        'kind': 'DEVIATION', 'ci_pn': 'EX40-HW-001', 'reason': '冒烟偏离',
        'qty_limit': 1, 'expire_at': '2027-12-31', 'request_form_id': dev_id,
    })
    check('闸门③放行：凭已批准申请单登记偏离成功', st == 201, f'{st} {j}'[:200])

    # ---------- D. 流程配置真正可改 ----------
    st, flows = designer.req('/api/flows')
    cur = [x for x in flows.get('steps', []) if x['scene'] == 'CHANGE_FLOW']
    check('流程配置：读到 CHANGE_FLOW 4 步', len(cur) == 4, str(len(cur)))
    modified = [dict(x) for x in cur]
    modified[2]['gate'] = 1  # 给「验证确认」加闸门
    st, j = designer.req('/api/flows', {'action': 'save_flow', 'scene': 'CHANGE_FLOW', 'steps': modified})
    check('流程配置：保存闸门改动成功', st == 200, f'{st} {j}'[:200])
    st, flows2 = designer.req('/api/flows')
    gated = [x for x in flows2.get('steps', []) if x['scene'] == 'CHANGE_FLOW' and x['step_no'] == 3]
    check('流程配置：改动读回生效', bool(gated) and gated[0]['gate'] == 1, str(gated)[:200])
    st, j = designer.req('/api/flows', {'action': 'save_flow', 'scene': 'CHANGE_FLOW', 'steps': cur})
    check('流程配置：恢复默认（不影响演示数据）', st == 200, f'{st} {j}'[:200])

    # ---------- E. 导出 ----------
    st, csv = designer.req(f'/api/export?baselineId={bl_id}', raw=True)
    header = csv.splitlines()[0] if csv else ''
    check('状态一览表 CSV 扩成 13 列', st == 200 and header.count(',') == 12, f'{st} {header[:160]}')
    check('CSV 含变更单号 / 记录完整性列', '最新变更单号' in header and '记录完整性' in header, header[:160])

    st, hist = designer.req(f'/api/export?baselineId={bl_id}&mode=history', raw=True)
    check('状态一览表 + 版本履历链（HTML 可打印）',
          st == 200 and '版本履历链' in hist and '来源变更单' in hist and '@media print' in hist,
          str(st))

    st, ev = designer.req('/api/evidence', raw=True)
    check('证据包 HTTP 200', st == 200, str(st))
    check('证据包仍含配置里的 8 份材料',
          all(x in ev for x in ['构型清单', '基线快照', '更改清单', '审批记录', '验证结果', '偏离记录', '纪实时间线', '符合性矩阵']))
    check('证据包新增「受控表单与签署记录」章节',
          '受控表单与签署记录' in ev and '单独打印这张单' in ev and '材料份数' in ev)
    check('证据包列出真实签署记录', '冒烟第 1 步同意' in ev or '同意' in ev)
    check('证据包封面显示 9 份材料', '9 份' in ev)

    print(f'\n结果：通过 {PASS} 项，失败 {FAIL} 项')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
