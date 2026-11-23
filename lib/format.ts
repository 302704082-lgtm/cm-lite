/** 时间一律 UTC 存储、按 +08:00 展示；无时区字符串按 UTC 解析，避免全站偏 8 小时 */
export function toCST(value?: string | null): string {
  if (!value) return '—';
  const raw = value.includes('T') ? value : value.replace(' ', 'T');
  const iso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  const shifted = new Date(d.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16).replace('T', ' ');
}

export function isExpired(expireAt?: string | null): boolean {
  if (!expireAt) return false;
  const raw = expireAt.includes('T') ? expireAt : expireAt.replace(' ', 'T');
  const iso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
