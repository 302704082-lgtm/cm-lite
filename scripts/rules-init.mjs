#!/usr/bin/env node
/**
 * 只建「规则配置层」的 4 张表，不动任何业务数据
 *   本地：node scripts/rules-init.mjs
 *   云端：读 .env.local 里的 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 自动连
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const forceLocal = process.argv.includes('--local');
const envPath = path.join(root, '.env.local');
if (!forceLocal && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = forceLocal
  ? 'file:./.data/cm-lite.db'
  : process.env.TURSO_DATABASE_URL?.trim() || 'file:./.data/cm-lite.db';
const authToken = forceLocal ? undefined : process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

if (url.startsWith('file:')) {
  const dir = path.dirname(url.slice('file:'.length));
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
}

const sql = fs.readFileSync(path.join(root, 'sql', 'rules_schema.sql'), 'utf8');
const statements = sql
  .split(';')
  .map((s) =>
    s
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter(Boolean);

const db = createClient({ url, authToken });
console.log(`目标库：${url.startsWith('file:') ? url : url.replace(/^libsql:\/\//, 'libsql://')}`);
for (const st of statements) {
  await db.execute(st);
  const head = st.split('\n').find((l) => l.trim()) ?? '';
  console.log('  ✓', head.slice(0, 72));
}
const t = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'profile_%' OR name='rule_profiles' ORDER BY name",
);
console.log('配置层表：', t.rows.map((r) => r.name).join(', '));
const n = await db.execute('SELECT count(*) AS n FROM rule_profiles');
console.log('配置档案数：', n.rows[0].n, '（0 = 空白，等待你自己填）');
