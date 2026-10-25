/** WORKER_QUEUES: "*" = all, "!name" excludes, a plain name includes ("*,!backups", "backups", "email,reports"). */
export function selectQueues(spec: string, all: string[]): string[] {
  const parts = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const include = parts.filter((p) => !p.startsWith("!"));
  const exclude = new Set(parts.filter((p) => p.startsWith("!")).map((p) => p.slice(1)));
  const base = include.includes("*") || include.length === 0 ? all : include.filter((q) => all.includes(q));
  return base.filter((q) => !exclude.has(q));
}
