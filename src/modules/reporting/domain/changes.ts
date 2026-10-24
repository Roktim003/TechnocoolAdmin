/**
 * One-line "before → after" summary of an audit row's snapshots, for the audit-log report.
 * Keys the viewer may not see (cost / profit / margin fields) are left out entirely.
 */

const MAX_PARTS = 6;
const MAX_VALUE = 60;

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE - 1)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  const s = JSON.stringify(v);
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}…` : s;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Removes hidden keys at any depth. */
function scrub(v: unknown, hidden: Set<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => scrub(x, hidden));
  if (!isObject(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !hidden.has(k)).map(([k, x]) => [k, scrub(x, hidden)]));
}

export function summarizeChanges(before: unknown, after: unknown, hidden: Set<string>): string {
  const b = scrub(before, hidden);
  const a = scrub(after, hidden);
  const parts: string[] = [];
  if (isObject(b) && isObject(a)) {
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (JSON.stringify(b[k]) === JSON.stringify(a[k])) continue;
      parts.push(`${k}: ${show(b[k])} → ${show(a[k])}`);
    }
  } else if (isObject(a)) {
    for (const [k, v] of Object.entries(a)) parts.push(`${k}: ${show(v)}`);
  } else if (isObject(b)) {
    for (const [k, v] of Object.entries(b)) parts.push(`${k}: ${show(v)} → —`);
  } else if (a !== null && a !== undefined) {
    parts.push(show(a));
  }
  if (!parts.length) return "—";
  return parts.length > MAX_PARTS ? `${parts.slice(0, MAX_PARTS).join("; ")}; +${parts.length - MAX_PARTS} more` : parts.join("; ");
}
