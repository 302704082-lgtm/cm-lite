import { insert } from './db';

/** 纪实写入：只 INSERT，永不 UPDATE/DELETE（数据库触发器二次兜底） */
export async function logEvent(
  tenantId: number,
  actor: string,
  action: string,
  targetType: string,
  targetId: string | number,
  detail?: string,
): Promise<void> {
  await insert(
    `INSERT INTO events (tenant_id, actor, action, target_type, target_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, actor, action, targetType, String(targetId), detail ?? null],
  );
}
