# cm-lite · 构型管理平台「毛坯房」演示版

按《毛坯房施工规格书 v4-demo》实现的多租户构型管理演示系统。
唯一主线：**变更控制 + 审批防线 + 证据留痕**。

> 所有企业名、人名、文号均为虚构，机型 `EX-01` 为虚构机型。

---

## 快速开始

```bash
npm install
npm run db:init      # 建表 + 建触发器 + 写入种子数据
npm run dev          # http://localhost:3000
```

首次登录：通道标识 `demo` / 通道密码 `demo123`，选用户后 PIN 统一 `1234`。

数据库默认落在 `file:./.data/cm-lite.db`。如果环境里存在 `TURSO_DATABASE_URL` /
`TURSO_AUTH_TOKEN`，则自动改连云端（见 `DEPLOY.md`）。

## 演示动线（与规格书第 2 节一致）

1. 门面 → 进入演示空间 → `demo / demo123` → 选「张设计」+ PIN `1234`
2. 构型项：结构树 15 项 3 层；新建 CI 时再填一次已有件号 → **409 拦截**并指出冲突项
3. 基线：新建 `D2`（一键快照当前全部受控项）→ 冻结
4. 变更：提 PR「飞控软件界面文案勘误」→ 转 CR → 向导三屏定 III 类 → 李构型签第 2 步 →
   执行确认（勾选验证通过）→ 关闭闭环
5. 变更：打开 `CR-2026-002`（I 类，已签 1–4 步）→ 以**张设计**点第 5 步签署 →
   **409 SoD 拦截**，提示「已签署第 1 步」
6. 换「陈适航」签第 5 步 → 周分管第 6 步 → 赵主任第 7 步 → 执行 → 关闭
7. 基线详情：`D1` 与 `D2` 对比 → 升版区（软件件 `V1.0 → V1.1`）+ 新增区（现场新建的 CI）
8. 纪实台账：事件时间线只读；导出《构型状态一览表》CSV
9. 总览：红线预警里出现「文实不符」（装机 V1.0 ≠ 最新冻结基线 V1.1）

## 角色与审批链

| 类别 | 步骤 |
|---|---|
| I 类 | 拟制 → 设计审核 → 质量会签 → 构型审核 → 适航影响评估 → 技术分管批准 → CCB 批准 |
| II 类 | 拟制 → 质量会签 → 构型审核 → 适航影响评估 → 技术分管批准 |
| III 类 | 拟制 → 构型审核并批准 |

签署判定顺序（服务端写死）：**步骤顺序 → 职责分离 SoD → 角色**。
面板对所有登录用户可见可点，越权一律由服务端拒绝。

## 8 条硬规则落点

| 规则 | 落点 |
|---|---|
| R1 件号唯一 | `app/api/cis/route.ts` → 409 + 冲突项详情 |
| R2 冻结基线不可改 | `app/api/cis/[pn]/route.ts`（带 `rev`/`status` 即 409）+ `sql/turso_hardening.sql` 基线条目触发器 |
| R3 变更必须闭环 | `lib/change-service.ts#closeChange`（CN 已执行且验证通过才可关闭） |
| R4 大改必换号 | `lib/rules.ts#validateWizard`（3F 命中 → `new_pn` 必填） |
| R5 在制品必答 | `lib/rules.ts`（impact.wip = 有 → `wip_action` 必填） |
| R6 影响分析 9 项 | `lib/constants.ts#IMPACT_ITEMS` + `validateWizard` |
| R7 纪实只追加 | `sql/schema.sql` 触发器 + 页面无编辑入口 |
| R8 偏离必有时效 | `app/api/deviations/route.ts`（数量上限 + 有效期必填）+ 列表标红 |
| R9 关键件不可降级 | `lib/rules.ts`（KEY/IMPORTANT 只能 I 类）+ 向导禁用 III 类 |

## 目录

```
app/                页面与 API 路由（App Router）
  api/auth/*        两层门禁：通道密码 → 用户 PIN
  api/cis/*         构型项新建（R1）与属性编辑（R2）
  api/baselines/*   快照、冻结
  api/changes/*     PR、转 CR、签署、执行、关闭
  api/deviations/*  偏离/让步
  api/export        导出 CSV
lib/
  db.ts             libsql 唯一数据出口（本地 file: / 云端 Turso）
  session.ts        jose JWT + httpOnly cookie（12 小时）
  rules.ts          变更定级与影响分析校验
  change-service.ts 审批链、SoD、落库闭环
  queries.ts        页面读取
sql/schema.sql      13 张表 + 事件触发器 + 索引
sql/turso_hardening.sql 生产加固（可在 Turso 控制台整段执行）
scripts/db-init.mjs 建表 + 种子
```

## 与规格书的差异（3 处，均已记录）

1. `changes` 表加了一列 `verified INTEGER DEFAULT 0`：R3 要求「执行人勾选验证通过」才能关闭，
   规格书表结构没有承载该状态的字段。
2. UI 未引入 shadcn/ui 组件包，改用 Tailwind 手写同类组件（表格/输入/徽标）。
   技术栈的 Tailwind 部分不变，减少一次组件下载依赖。
3. 导出实现为 CSV（带 BOM，Excel 直接可读），未做独立打印页；页面内表格可直接 Ctrl+P 打印。
