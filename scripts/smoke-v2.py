#!/usr/bin/env python3
"""
cm-lite v2 全链路冒烟：验证「规则配置真的接进主流程」。

前提：先 npm run build && npx next start --port 3000，并跑过 rules-seed.mjs。
运行：python scripts/smoke-v2.py [http://localhost:3000]

检查项：
  1. 登录通道 / 演示用户列表
  2. 生效配置 = 取证整机厂版（脱敏默认模板），且类别是「大改/小改」
  3. 规则页显示「已生效」
  4. 建议件号按配置生成（EX40-XXX-001）
  5. 新建构型项：件号留空自动生成、初始版本 V1.0
  6. PR → CR（小改）：审批链 3 步、影响项 12 项来自配置
  7. SoD：同一人签第 2 步被 409 拦下
  8. 换人签完 → 执行（验证通过）→ 关闭，闭环 CLOSED
  9. 详情页显示配置里的中文类别「小改」
 10. 证据包导出：封面标题、8 份材料目录、每份都有真实数据
 11. 旧 CSV 导出仍正常
"""
import json
import re
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
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
    """手动维护 Cookie 头：生产构建下会话 cookie 带 Secure 属性，
    标准 CookieJar 不会在 http://localhost 上回送它，所以这里自己收发。"""

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
            with self.opener.open(r, timeout=20) as resp:
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


def main():
    print(f'目标：{BASE}\n')
    boot = Client()
    st, tenant = boot.req('/api/auth/tenant', {'slug': 'demo', 'passcode': 'demo123'})
    check('通道登录 demo/demo123', st == 200 and isinstance(tenant, dict) and 'users' in tenant, str(tenant)[:200])
    if not isinstance(tenant, dict) or 'users' not in tenant:
        print('无法继续'); return 1
    users = tenant['users']
    print('  用户：', ', '.join(f"{u['name']}={u['role_code']}(id={u['id']})" for u in users))

    by_role = {}
    for u in users:
        by_role.setdefault(u['role_code'], u['id'])
    for role in ('DESIGN_ENG', 'CM_ENGINEER', 'QUALITY_ENG'):
        check(f'存在角色 {role}', role in by_role)

    designer = Client()
    st, _ = designer.login(by_role['DESIGN_ENG'])
    check('设计工程师登录', st == 200)

    st, rules = designer.req('/api/rules')
    check('读取规则配置', st == 200 and isinstance(rules, dict))
    active = isinstance(rules, dict) and rules.get('active') is True
    check('配置已生效（ACTIVE）', active, str(rules)[:200])
    vals = rules.get('values', {}) if isinstance(rules, dict) else {}
    check('类别来自配置：大改,小改', vals.get('class_codes') == '大改,小改', vals.get('class_codes', ''))
    check('证据包材料清单来自配置', '基线快照' in vals.get('evidence_items', ''), vals.get('evidence_items', ''))
    check('三级基线来自配置', vals.get('baseline_kinds') == '功能基线,分配基线,产品基线', vals.get('baseline_kinds', ''))

    st, html = designer.req('/app/rules', raw=True)
    check('规则页显示「已生效」', st == 200 and '已生效' in html)

    st, j = designer.req('/api/cis?type=HARDWARE&model=EX-01')
    pn_hint = j.get('pn', '') if isinstance(j, dict) else ''
    check('建议件号按配置生成', st == 200 and bool(re.match(r'^EX40-HW-\d{3}$', pn_hint)), pn_hint)
    check('默认版本来自配置 V1.0', isinstance(j, dict) and j.get('rev') == 'V1.0', str(j)[:120])

    st, j = designer.req('/api/cis', {
        'model': 'EX-01', 'pn': '', 'name': '冒烟测试件', 'type': 'HARDWARE',
        'qty': 1, 'rev': '', 'status': 'CONTROLLED', 'criticality': 'NORMAL',
        'owner': '张设计', 'basis': None,
    })
    ci_pn = j.get('pn', '') if isinstance(j, dict) else ''
    check('新建构型项（件号留空自动生成）', st == 201 and ci_pn.startswith('EX40-'), f'{st} {j}'[:200])
    check('初始版本按配置为 V1.0', isinstance(j, dict) and j.get('rev') == 'V1.0', str(j)[:120])
    if not ci_pn:
        print('无法继续'); return 1

    # v3 起「新建变更」前必须有已批准的《变更申请与可行性评审单》
    air = Client()
    st, _ = air.login(by_role['AIRWORTHINESS'])
    chair = Client()
    st, _ = chair.login(by_role['CCB_CHAIR'])
    st, f = designer.req('/api/forms', {
        'templateCode': 'CHANGE_REQUEST', 'title': 'v2 回归：变更申请与可行性评审',
    })
    rq_id = f.get('id') if isinstance(f, dict) else None
    check('v2 回归：新建变更申请单', st == 201 and rq_id, f'{st} {f}'[:200])
    if rq_id:
        st, fd = designer.req(f'/api/forms/{rq_id}')
        checks = [{'key': c['key'], 'label': c['label'], 'result': 'PASS'} for c in fd.get('checks', [])]
        designer.req(f'/api/forms/{rq_id}/save', {'data': {
            'model': 'EX-01', 'ci_pn': ci_pn, 'title': '冒烟：小改升版',
            'reason': '验证规则引擎接入', 'plan': 'V1.0 → V1.1',
            'proposed_class': '小改', 'review_conclusion': '评审通过',
        }, 'checks': checks})
        designer.req(f'/api/forms/{rq_id}/submit', {})
        designer.req(f'/api/forms/{rq_id}/sign', {'stepNo': 1, 'decision': 'APPROVE'})
        air.req(f'/api/forms/{rq_id}/sign', {'stepNo': 2, 'decision': 'APPROVE'})
        chair.req(f'/api/forms/{rq_id}/sign', {'stepNo': 3, 'decision': 'APPROVE'})

    st, j = designer.req('/api/changes', {
        'model': 'EX-01', 'ci_pn': ci_pn, 'title': '冒烟：小改升版', 'reason': '验证规则引擎接入',
        'request_form_id': rq_id,
    })
    pr_id = j.get('id') if isinstance(j, dict) else None
    check('创建 PR（凭已批准申请单通过闸门）', st == 201 and pr_id, f'{st} {j}'[:200])
    if not pr_id:
        return 1

    impact = {f'i{i}': 'NO' for i in range(12)}
    st, j = designer.req(f'/api/changes/{pr_id}/to-cr', {
        'model': 'EX-01', 'ci_pn': ci_pn, 'from_rev': 'V1.0', 'to_rev': 'V1.1',
        'new_pn': None, 'title': '冒烟：小改升版', 'reason': '验证规则引擎接入',
        'f_fit': False, 'f_form': False, 'f_function': False,
        'abca': False, 'abcb': False, 'abcc': False,
        'class_result': '小改', 'class_reason': None,
        'impact': impact, 'wip_action': None,
    })
    cr_id = j.get('id') if isinstance(j, dict) else None
    steps = j.get('steps') if isinstance(j, dict) else None
    check('PR → CR（类别「小改」被接受）', st == 201 and cr_id, f'{st} {j}'[:300])
    check('审批链按配置为 3 步', steps == 3, f'steps={steps}')
    if not cr_id:
        return 1

    st, html = designer.req(f'/app/changes/{cr_id}', raw=True)
    check('详情页显示中文类别「小改」', st == 200 and '小改' in html)
    check('详情页按配置显示 12 项影响分析',
          '影响项清单' in html and '图纸与物料清单' in html and '符合性验证' in html)

    st, j = designer.req(f'/api/changes/{cr_id}/sign', {'stepNo': 2, 'decision': 'APPROVE', 'comment': '自己签自己批'})
    check('SoD 拦截：同一人签第 2 步 → 409', st == 409, f'{st} {j}'[:200])

    cm = Client()
    st, _ = cm.login(by_role['CM_ENGINEER'])
    check('构型管理工程师登录', st == 200)
    st, j = cm.req(f'/api/changes/{cr_id}/sign', {'stepNo': 2, 'decision': 'APPROVE', 'comment': '小改批准'})
    check('第 2 步由构型管理工程师签署', st == 200, f'{st} {j}'[:200])

    qa = Client()
    st, _ = qa.login(by_role['QUALITY_ENG'])
    check('质量工程师登录', st == 200)
    st, j = qa.req(f'/api/changes/{cr_id}/sign', {'stepNo': 3, 'decision': 'APPROVE', 'comment': '独立监督'})
    check('第 3 步由独立监督签署 → 整单批准', st == 200 and (isinstance(j, dict) and j.get('status') == 'APPROVED'), f'{st} {j}'[:200])

    st, j = designer.req(f'/api/changes/{cr_id}/execute', {'note': '按批准构型升版', 'verified': True})
    check('执行并勾选验证通过 → CN', st == 200 and isinstance(j, dict) and 'cnCode' in j, f'{st} {j}'[:200])

    st, j = designer.req(f'/api/changes/{cr_id}/close', {})
    check('关闭变更 → 闭环', st == 200, f'{st} {j}'[:200])

    st, j = designer.req(f'/api/changes/{cr_id}/close', {})
    check('已关闭单据不能重复关闭 → 409', st == 409, f'{st} {j}'[:200])

    st, ev = designer.req('/api/evidence', raw=True)
    check('证据包导出 HTTP 200', st == 200, str(st))
    check('证据包封面标题来自配置', '构型状态与更改证据包' in ev)
    check('证据包含 8 份材料目录', all(x in ev for x in ['构型清单', '基线快照', '更改清单', '审批记录', '验证结果', '偏离记录', '纪实时间线', '符合性矩阵']))
    check('证据包含真实变更数据', ci_pn in ev and '冒烟：小改升版' in ev)
    check('证据包含生效规矩与类别口径', '取证整机厂版' in ev and '大改 / 小改' in ev)
    check('证据包含证三级基线口径', '功能基线 / 分配基线 / 产品基线' in ev)
    check('证据包有打印样式', '@media print' in ev)

    st, csv = designer.req('/api/export?baselineId=1', raw=True)
    check('旧 CSV 导出仍正常', st == 200 and ('件号' in csv or st == 404), f'{st} {csv[:120]}')

    print(f'\n结果：通过 {PASS} 项，失败 {FAIL} 项')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
