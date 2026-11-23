# 上线说明 · Turso + Vercel

> 目标：演示站点跑在 `cm.zylor.top`，数据库在云端，不买服务器。
> 本地跑通（`npm run db:init && npm run dev`）之后再做这一份。

---

## 0 区域选择（决定演示卡不卡）

| 项 | 选什么 | 为什么 |
|---|---|---|
| Vercel 函数区域 | **香港 `hkg1`** | 离用户近 |
| Turso 数据库位置 | **新加坡 `sin`** | 离函数近，少跨一次太平洋 |

**函数和数据库要互相靠近**，不是都靠近用户。

---

## 1 Turso 建库（网页版 5 步）

1. https://turso.tech 用 GitHub 登录
2. **Create Database** → Name `cm-lite` → Region `Singapore`
3. 详情页复制 **Database URL**：`libsql://cm-lite-xxx.turso.io`
4. **Create Token** → 权限 `Read & Write` → 生成后只显示一次，立刻复制
5. 记下两条：`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`

## 2 把库结构和种子推到云端

在项目目录执行（把两个值换成你的）：

```bash
TURSO_DATABASE_URL="libsql://cm-lite-xxx.turso.io" \
TURSO_AUTH_TOKEN="eyJhbGciOi..." \
npm run db:init
```

看到 `✓ 初始化完成` 且各表行数非零即可。脚本幂等，可重复跑；重建加 `-- --reset`。

可选加固（把 `sql/turso_hardening.sql` 整段粘到 Turso 控制台 SQL 里执行，幂等）。

## 3 推到 GitHub

```bash
git init
git add .
git commit -m "cm-lite demo"
git branch -M main
git remote add origin https://github.com/<你的用户名>/cm-lite.git
git push -u origin main
```

## 4 Vercel 导入 + 三条环境变量

**Add New → Project → Import**，Framework 自动识别 Next.js，Root Directory 保持仓库根。

Environment Variables（Production / Preview / Development 全勾）：

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://cm-lite-xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` |
| `JWT_SECRET` | ≥32 位随机字符串（换掉本地默认值，否则线上登录态不可信） |

点 **Deploy**，1–2 分钟出 `xxx.vercel.app`，先访问确认能开门面页。

## 5 绑 `cm.zylor.top`

Settings → Domains → 输入 `cm.zylor.top` → Add，按提示去域名商加记录：

| 类型 | 名称 | 值 |
|---|---|---|
| CNAME | `cm` | `cname.vercel-dns.com` |

等状态变 **Valid Configuration**（1–10 分钟，最长 24 小时），HTTPS 证书自动签发。

---

## 6 上线前 5 分钟自检

- [ ] `https://cm.zylor.top` 打得开，不是 Vercel 报错页
- [ ] 门面显示「已有 1 个租户空间」，进入演示空间能到 `/login`
- [ ] `demo / demo123` + `张设计 / 1234` 能登录
- [ ] 结构树 15 项 3 层，`EX01-PWR-001` 标「关键件」
- [ ] 变更列表有数据，`CR-2026-002` 停在第 5 步待签
- [ ] **改一条数据后刷新，数据是新的**（验证没被静态缓存）
- [ ] 张设计点第 5 步签署 → 409 并提示「已签署第 1 步」
- [ ] Turso 控制台执行 `UPDATE events SET action='x' WHERE id=1;` → 被触发器拒绝

## 7 出问题对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 构建报 `Cannot find module` | Root Directory 选错 | Settings → General 重设 |
| 页面 500，日志 `url is required` | 环境变量没生效 | 确认勾了 Production → Redeploy |
| 登录后立刻跳回登录页 | `JWT_SECRET` 为空 | 补齐后重新部署 |
| 页面能开但没数据 | 云端库是空的 | 重跑第 2 步的 `db:init` |
| 数据改了不刷新 | 页面缺 `force-dynamic` | 本项目所有读库页面与接口已全部加上 |
| 域名一直 Pending | DNS 没生效 | `nslookup cm.zylor.top` 看是否指向 Vercel |
| 中文乱码 | 响应头缺 charset | CSV 已带 BOM；页面由 Next 输出 utf-8 |

## 8 日常更新

```bash
git add .
git commit -m "update"
git push
```

Vercel 自动重新部署。

---

## 已知边界（不是 bug）

- Turso 远端走 HTTP 无长连接，`PRAGMA foreign_keys` 不跨请求生效：引用完整性由应用层保证，
  `events` 防篡改靠自带触发器（随语句执行，天然生效）。
- `doc.rev` 不随变更自动升版，文件版升暂走人工（规格书第 10 节）。
