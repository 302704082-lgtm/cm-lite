import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type InValue } from '@libsql/client';

// ------------------------------------------------------------
// 唯一数据出口：本地 file: 模式，或云端 Turso（环境变量优先）
// ------------------------------------------------------------
const rawUrl = process.env.TURSO_DATABASE_URL?.trim();
const url = rawUrl && rawUrl.length > 0 ? rawUrl : 'file:./.data/cm-lite.db';
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

// file: 模式要保证目录存在，否则 libsql 打不开库
if (url.startsWith('file:')) {
  const rel = url.slice('file:'.length);
  const dir = path.dirname(rel);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
}

const globalForDb = globalThis as unknown as { __cmClient?: Client };

function create(): Client {
  const client = createClient({ url, authToken });
  // libsql 默认不强制外键（SQLite 方言）。不在连接上打开，schema 里
  // 全部 REFERENCES 与级联行为会静默失效，而且不报错。
  void client.execute('PRAGMA foreign_keys = ON').catch(() => {
    // 远端 HTTP 模式下 PRAGMA 不跨请求生效，属预期；引用完整性由应用层保证
  });
  return client;
}

export const db: Client = globalForDb.__cmClient ?? create();
globalForDb.__cmClient = db;

export const isRemote = !url.startsWith('file:');

/** 查多行 */
export async function q<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  const rs = await db.execute({ sql, args });
  return rs.rows as unknown as T[];
}

/** 查单行 */
export async function q1<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T | null> {
  const rows = await q<T>(sql, args);
  return rows.length > 0 ? rows[0] : null;
}

/** 写操作，返回受影响行数 */
export async function exec(sql: string, args: InValue[] = []): Promise<number> {
  const rs = await db.execute({ sql, args });
  return rs.rowsAffected;
}

/** 写操作，返回新行 id */
export async function insert(sql: string, args: InValue[] = []): Promise<number> {
  const rs = await db.execute({ sql, args });
  return Number(rs.lastInsertRowid ?? 0);
}
