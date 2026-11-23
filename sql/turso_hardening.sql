-- ============================================================
-- Turso / SQLite 加固脚本（v4 表名对齐版）
-- 用途：在已建好的库上补「防篡改」，不依赖应用代码
-- 执行：Turso 控制台 → 选库 → SQL 控制台，整段粘贴
-- 幂等：全部 IF NOT EXISTS，可重复执行
-- ============================================================

PRAGMA foreign_keys = ON;   -- 仅对当前这条连接有效；应用层每个连接都要执行

-- ------------------------------------------------------------
-- 1. 纪实表只可追加（R7）
--    沙龙演示点：改一条 events，数据库直接拒绝
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only: update forbidden'); END;

CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only: delete forbidden'); END;

-- ------------------------------------------------------------
-- 2. 已冻结基线的条目不可改不可删（R2）
--    baseline_items 是快照，只允许 INSERT；冻结后连条目本身都不能动
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS baseline_items_frozen_no_update
BEFORE UPDATE ON baseline_items
FOR EACH ROW
WHEN (SELECT status FROM baselines WHERE id = OLD.baseline_id) = 'FROZEN'
BEGIN
  SELECT RAISE(ABORT, 'BASELINE_FROZEN: frozen baseline items are read-only');
END;

CREATE TRIGGER IF NOT EXISTS baseline_items_frozen_no_delete
BEFORE DELETE ON baseline_items
FOR EACH ROW
WHEN (SELECT status FROM baselines WHERE id = OLD.baseline_id) = 'FROZEN'
BEGIN
  SELECT RAISE(ABORT, 'BASELINE_FROZEN: frozen baseline items are read-only');
END;

-- ------------------------------------------------------------
-- 3. 已签署的审批步骤不可改签署人/结论
--    签署后只允许补充 comment（流程内的正常字段）
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS change_approvals_signed_immutable
BEFORE UPDATE ON change_approvals
FOR EACH ROW
WHEN OLD.signed_at IS NOT NULL
  AND (OLD.signer_user_id <> NEW.signer_user_id
       OR OLD.decision <> NEW.decision
       OR OLD.step_no <> NEW.step_no)
BEGIN
  SELECT RAISE(ABORT, 'APPROVAL_IMMUTABLE: signed approval cannot be altered');
END;

CREATE TRIGGER IF NOT EXISTS change_approvals_no_delete
BEFORE DELETE ON change_approvals
BEGIN SELECT RAISE(ABORT, 'APPROVAL_IMMUTABLE: signed approval cannot be deleted'); END;

-- ------------------------------------------------------------
-- 4. 故意不做的两条（写在这里防止后人踩坑）
--    · cis.rev / cis.status 的 R2 约束不做成数据库触发器：
--      「变更落库」这条合法路径本身就要写这两个字段，触发器无法区分
--      是流程写入还是绕过写入。因此 R2 在应用层强制（PATCH 接口拒绝
--      任何带 rev/status 的请求 → 409）。
--    · 外键：Turso 远端走 HTTP 无长连接，PRAGMA 不跨请求生效，
--      引用完整性由应用层保证；events 防篡改不依赖外键，天然生效。
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5. 索引（与 schema 一致，重复执行无害）
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cis_tree ON cis(tenant_id, model, parent_pn);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(tenant_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_approvals_change ON change_approvals(change_id, step_no);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(tenant_id, target_type, target_id);

-- ------------------------------------------------------------
-- 6. 执行后自检
-- ------------------------------------------------------------
-- ① 应看到 6 条触发器
-- SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;
-- ② 应报错 APPEND_ONLY（events are append-only）
-- UPDATE events SET action='tampered' WHERE id=(SELECT MIN(id) FROM events);
-- ③ 应报错 APPEND_ONLY
-- DELETE FROM events WHERE id=(SELECT MIN(id) FROM events);
-- ④ 应返回 1
-- PRAGMA foreign_keys;
