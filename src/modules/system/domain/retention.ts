/**
 * Backup retention: 14 daily, 8 weekly, 12 monthly (configurable), applied the same way to the
 * local backup folder and the off-site bucket. Pure: works on names and dates only.
 *
 * Kept: the newest backup of each of the last `daily` days that have one, the newest of each of
 * the last `weekly` ISO weeks, and the newest of each of the last `monthly` months. Periods are
 * counted in Asia/Dhaka time. Everything else may be deleted. Backups are never deleted while
 * they are the only one.
 */

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface BackupItem {
  name: string;
  at: Date;
}

const DHAKA_OFFSET_MS = 6 * 3600_000;

function dhaka(d: Date): Date {
  return new Date(d.getTime() + DHAKA_OFFSET_MS);
}

export function dayKey(d: Date): string {
  return dhaka(d).toISOString().slice(0, 10);
}

export function monthKey(d: Date): string {
  return dhaka(d).toISOString().slice(0, 7);
}

/** ISO week, e.g. 2026-W43 (Monday-based; the week belongs to the year of its Thursday). */
export function weekKey(d: Date): string {
  const local = dhaka(d);
  const t = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Names to keep; the rest can be deleted. */
export function backupsToKeep(items: BackupItem[], policy: RetentionPolicy): Set<string> {
  const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const pick = (keyOf: (d: Date) => string, count: number) => {
    const seen = new Set<string>();
    for (const item of sorted) {
      if (seen.size >= count) break;
      const k = keyOf(item.at);
      if (seen.has(k)) continue;
      seen.add(k);
      keep.add(item.name);
    }
  };
  pick(dayKey, policy.daily);
  pick(weekKey, policy.weekly);
  pick(monthKey, policy.monthly);
  if (sorted[0]) keep.add(sorted[0].name);
  return keep;
}

/** stockbook-20261025-020000-scheduled.dump.enc → the time it was taken (Asia/Dhaka in the name). */
export const BACKUP_NAME = /^stockbook-(\d{8})-(\d{6})-[a-z-]+\.dump(\.enc)?$/;

export function backupTime(name: string): Date | null {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  const [, ymd, hms] = m as unknown as [string, string, string];
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}+06:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function backupName(at: Date, trigger: string, encrypted: boolean): string {
  const t = dhaka(at).toISOString();
  const stamp = `${t.slice(0, 4)}${t.slice(5, 7)}${t.slice(8, 10)}-${t.slice(11, 13)}${t.slice(14, 16)}${t.slice(17, 19)}`;
  return `stockbook-${stamp}-${trigger.toLowerCase().replace(/_/g, "-")}.dump${encrypted ? ".enc" : ""}`;
}
