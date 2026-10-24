"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { formatQty, newKey, type StockCaps } from "../../_components/types";
import { COUNT_STATUS_LABEL, COUNT_STATUS_TAG, SCOPE_LABEL, type CountDto, type CountLineDto, type VarianceDto } from "./count-types";
import styles from "./count.module.css";
import base from "../../_components/stock.module.css";

type Filter = "all" | "todo" | "recount" | "done";
const norm = (s: string) => s.trim().toUpperCase();
const trimQty = (v: string | null) => (v === null ? "" : v.includes(".") ? v.replace(/\.?0+$/, "") : v);

export function CountWork({ caps, initial }: { caps: StockCaps; initial: CountDto }) {
  const [c, setC] = useState(initial);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "warning" | "info"; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [scan, setScan] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [variance, setVariance] = useState<VarianceDto | null>(null);
  const [recountIds, setRecountIds] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const keyed = async <T,>(path: string, body?: unknown) => (await api<{ data: T }>(path, { method: "POST", body: body ?? {}, headers: { "Idempotency-Key": newKey() } })).data;

  const loadVariance = useCallback(async () => {
    if (!["SUBMITTED", "APPROVED"].includes(c.status)) return setVariance(null);
    try {
      setVariance((await api<{ data: VarianceDto }>(`/stock-counts/${c.id}/variance`)).data);
    } catch {
      setVariance(null);
    }
  }, [c.id, c.status]);

  useEffect(() => {
    void loadVariance();
  }, [loadVariance]);

  async function act(action: "start" | "submit" | "approve" | "cancel" | "request-recount", body?: unknown, message?: string) {
    setBusy(action);
    try {
      const next = await keyed<CountDto>(`/stock-counts/${c.id}/${action}`, body);
      setC(next);
      setNotice(message ? { kind: "success", message } : null);
      setRecountIds([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
      setConfirmSubmit(false);
    }
  }

  async function sheet() {
    setBusy("sheet");
    try {
      const job = (await api<{ data: { jobId: string } }>(`/stock-counts/${c.id}/sheet`)).data;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const s = (await api<{ data: { status: string; downloadUrl: string | null; failedReason: string | null } }>(`/documents/${job.jobId}`)).data;
        if (s.status === "completed" && s.downloadUrl) return void window.open(s.downloadUrl, "_blank", "noopener");
        if (s.status === "failed") throw new Error(s.failedReason ?? "The PDF couldn't be created.");
      }
      throw new Error("The PDF is taking too long. Try again in a minute.");
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const saveLine = useCallback(
    async (line: CountLineDto, body: Record<string, unknown>) => {
      const next = (await api<{ data: CountDto }>(`/stock-counts/${c.id}/lines/${line.id}`, { method: "PUT", body })).data;
      setC(next);
      return next;
    },
    [c.id],
  );

  // Scan: a product code or barcode opens that line; anything else is a serial for the open tracked line.
  function onScan(raw: string) {
    const text = norm(raw);
    if (!text) return;
    const match = c.lines.find((l) => l.product.code === text || (l.product.barcode && norm(l.product.barcode) === text));
    if (match) {
      setActive(match.id);
      setFilter("all");
      setScan("");
      requestAnimationFrame(() => document.getElementById(`line-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    const open = c.lines.find((l) => l.id === active);
    if (open?.product.trackSerial) {
      window.dispatchEvent(new CustomEvent("count-serial", { detail: { lineId: open.id, serial: text } }));
      setScan("");
      return;
    }
    setNotice({ kind: "warning", message: `${text} isn't in this count. Scan a product code or barcode, or open a serial-tracked line first.` });
  }

  const shown = useMemo(
    () =>
      c.lines.filter((l) => {
        const done = l.countedQty !== null || l.notCounted;
        return filter === "all" || (filter === "todo" && !done) || (filter === "done" && done) || (filter === "recount" && l.recountRequested);
      }),
    [c.lines, filter],
  );

  const pct = c.progress.total ? Math.round((c.progress.counted / c.progress.total) * 100) : 0;
  const counting = c.status === "COUNTING" && c.actions.count;

  return (
    <div className={base.stack}>
      <div className={base.breadcrumb}>
        <Link href="/stock/counts">Stock counts</Link> / {c.number}
      </div>
      <div className={base.detailHeader}>
        <div>
          <h1 className={base.detailTitle}>
            <span className={base.mono} style={{ fontSize: "inherit" }}>
              {c.number}
            </span>
            <Tag kind={COUNT_STATUS_TAG[c.status]}>{COUNT_STATUS_LABEL[c.status]}</Tag>
            {c.blindCount ? <Tag kind="gray">Blind</Tag> : null}
          </h1>
          <p className={base.detailSub}>
            {c.warehouse.name} · {SCOPE_LABEL[c.scope] ?? c.scope} · {c.progress.total} lines · by {c.createdBy.name}
            {c.startedAt ? ` · started ${formatDateTime(c.startedAt)}` : ""}
          </p>
        </div>
        <div className={base.detailActions}>
          {c.actions.start ? (
            <Button onClick={() => act("start", undefined, "Counting started. These products are frozen in this warehouse until the count is approved or cancelled.")} disabled={!!busy}>
              {busy === "start" ? "Starting…" : "Start counting"}
            </Button>
          ) : null}
          {c.actions.printSheet ? (
            <Button kind="secondary" onClick={sheet} disabled={!!busy}>
              {busy === "sheet" ? "Preparing…" : "Print count sheet"}
            </Button>
          ) : null}
          {c.actions.cancel ? (
            <Button kind="ghost" onClick={() => window.confirm("Cancel this count? Nothing in stock changes and the products are released.") && act("cancel", undefined, "Count cancelled.")} disabled={!!busy}>
              Cancel count
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}
      {c.notes ? <p className={base.muted}>{c.notes}</p> : null}

      {c.status === "DRAFT" ? (
        <section className={base.section}>
          <p>
            Starting takes a snapshot of the system quantities{c.blindCount ? " (hidden from counters)" : ""} and freezes these {c.progress.total} products in {c.warehouse.name}: entries touching them are refused until the count is approved or cancelled. Plan it for a quiet time.
          </p>
        </section>
      ) : null}

      {c.status === "COUNTING" || (c.status === "SUBMITTED" && !c.actions.approve) || c.status === "CANCELLED" ? (
        <>
          {counting ? (
            <div className={styles.sticky}>
              <label htmlFor="scan" className="visually-hidden">
                Scan or type a barcode or product code
              </label>
              <input
                id="scan"
                ref={scanRef}
                className={styles.scan}
                placeholder="Scan barcode or type code…"
                value={scan}
                autoComplete="off"
                autoCapitalize="characters"
                enterKeyHint="go"
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onScan(scan);
                  }
                }}
              />
              <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={c.progress.total} aria-valuenow={c.progress.counted} aria-label="Lines counted">
                <div className={styles.progressBar} style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.progressText}>
                <span>
                  {c.progress.counted} of {c.progress.total} counted
                </span>
                {c.progress.recount ? <span className={base.negative}>{c.progress.recount} to recount</span> : null}
              </div>
              <div className={styles.filters} role="group" aria-label="Filter lines">
                {(
                  [
                    ["all", "All"],
                    ["todo", "Not counted yet"],
                    ["recount", "Recount"],
                    ["done", "Counted"],
                  ] as [Filter, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={filter === k} className={`${styles.filter} ${filter === k ? styles.filterOn : ""}`} onClick={() => setFilter(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ul className={styles.lines}>
            {shown.map((l) => (
              <LineCard key={l.id} line={l} editable={counting} showSystem={c.systemVisible} active={active === l.id} onOpen={() => setActive(l.id)} onSave={saveLine} onError={(m) => setNotice({ kind: "error", message: m })} />
            ))}
            {!shown.length ? <li className={base.muted}>No lines here.</li> : null}
          </ul>

          {counting && c.actions.submit ? (
            <div className={styles.bottomBar}>
              <span className={base.muted}>
                {c.progress.total - c.progress.counted} line(s) not counted yet
              </span>
              <Button onClick={() => (c.progress.counted < c.progress.total ? setConfirmSubmit(true) : act("submit", undefined, "Submitted for approval."))} disabled={!!busy || c.progress.recount > 0}>
                {busy === "submit" ? "Submitting…" : "Submit for approval"}
              </Button>
            </div>
          ) : null}
          {c.status === "SUBMITTED" ? <Notification kind="info">Waiting for an approver for {c.warehouse.name}. Submitted by {c.submittedBy?.name}.</Notification> : null}
        </>
      ) : null}

      {(c.status === "SUBMITTED" && c.actions.approve) || c.status === "APPROVED" ? (
        <Review
          c={c}
          caps={caps}
          variance={variance}
          recountIds={recountIds}
          setRecountIds={setRecountIds}
          busy={busy}
          onApprove={() => act("approve", undefined, "Approved. Differences were posted as a stock adjustment and the products are released.")}
          onRecount={() => act("request-recount", { lineIds: recountIds }, "Sent back for a recount of the chosen lines.")}
        />
      ) : null}

      <Modal
        open={confirmSubmit}
        title="Submit with uncounted lines?"
        primaryText="Submit — uncounted = 0"
        primaryKind="danger"
        submitting={busy === "submit"}
        onClose={() => setConfirmSubmit(false)}
        onSubmit={(e) => {
          e.preventDefault();
          void act("submit", { markUncountedAsZero: true }, "Submitted for approval.");
        }}
      >
        <p>
          {c.progress.total - c.progress.counted} line(s) have no count. They will be recorded as <strong>not counted = 0</strong>, which means a loss for anything the system has in stock.
        </p>
      </Modal>
    </div>
  );
}

function LineCard({
  line,
  editable,
  showSystem,
  active,
  onOpen,
  onSave,
  onError,
}: {
  line: CountLineDto;
  editable: boolean;
  showSystem: boolean;
  active: boolean;
  onOpen: () => void;
  onSave: (l: CountLineDto, body: Record<string, unknown>) => Promise<unknown>;
  onError: (m: string) => void;
}) {
  const [qty, setQty] = useState(trimQty(line.countedQty));
  const [serials, setSerials] = useState<string[]>(line.serials.filter((s) => s.result !== "MISSING").map((s) => s.serial));
  const [serialText, setSerialText] = useState("");
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const qtyRef = useRef<HTMLInputElement>(null);
  const done = line.countedQty !== null || line.notCounted;

  useEffect(() => {
    setQty(trimQty(line.countedQty));
    setSerials(line.serials.filter((s) => s.result !== "MISSING").map((s) => s.serial));
  }, [line.countedQty, line.serials]);

  useEffect(() => {
    if (active && !line.product.trackSerial) qtyRef.current?.focus();
  }, [active, line.product.trackSerial]);

  // Serials scanned in the top field while this line is open.
  useEffect(() => {
    const on = (e: Event) => {
      const { lineId, serial } = (e as CustomEvent<{ lineId: string; serial: string }>).detail;
      if (lineId !== line.id) return;
      setSerials((xs) => (xs.includes(serial) ? xs : [...xs, serial]));
      setState("dirty");
    };
    window.addEventListener("count-serial", on);
    return () => window.removeEventListener("count-serial", on);
  }, [line.id]);

  async function save(body?: Record<string, unknown>) {
    setState("saving");
    try {
      await onSave(line, body ?? (line.product.trackSerial ? { serials } : { countedQty: qty === "" ? null : qty }));
      setState("saved");
    } catch (err) {
      setState("dirty");
      onError(err instanceof ApiError ? err.message : errorMessage(err));
    }
  }

  const step = (delta: number) => {
    const n = Math.max(0, Math.round(((Number(qty) || 0) + delta) * 1000) / 1000);
    setQty(String(n));
    setState("dirty");
  };

  const cls = `${styles.line} ${line.recountRequested ? styles.lineRecount : done ? styles.lineCounted : ""} ${active ? styles.lineActive : ""}`;
  const missing = line.serials.filter((s) => s.result === "MISSING");

  return (
    <li id={`line-${line.id}`} className={cls} onClick={onOpen}>
      <div className={styles.lineHead}>
        <div>
          <div className={styles.lineName}>{line.product.name}</div>
          <div className={styles.meta}>
            <span className={base.mono}>{line.product.code}</span>
            {line.product.model ? ` · ${line.product.model}` : ""} · {line.product.unitCode}
            {line.condition === "DAMAGED" ? " · damaged" : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {line.recountRequested ? <Tag kind="red">Recount</Tag> : done ? <Tag kind="green">Counted</Tag> : null}
          {showSystem && line.systemQty !== undefined ? <div className={styles.meta}>System {formatQty(line.systemQty)}</div> : null}
        </div>
      </div>

      {line.product.trackSerial ? (
        <>
          {editable ? (
            <div className={styles.serialInput}>
              <input
                className={styles.qty}
                style={{ fontSize: 16, textAlign: "left" }}
                placeholder="Scan or type a serial…"
                aria-label={`Serial number for ${line.product.code}`}
                value={serialText}
                autoCapitalize="characters"
                onChange={(e) => setSerialText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && serialText.trim()) {
                    e.preventDefault();
                    const s = norm(serialText);
                    setSerials((xs) => (xs.includes(s) ? xs : [...xs, s]));
                    setSerialText("");
                    setState("dirty");
                  }
                }}
              />
            </div>
          ) : null}
          <div className={styles.serialList}>
            {serials.map((s) => {
              const r = line.serials.find((x) => x.serial === s)?.result;
              return (
                <span key={s} className={`${styles.serial} ${r === "FOUND" ? styles.serialFound : r === "UNEXPECTED" ? styles.serialUnexpected : ""}`} title={r === "UNEXPECTED" ? "Not expected here" : undefined}>
                  {s}
                  {editable ? (
                    <button type="button" aria-label={`Remove ${s}`} onClick={() => (setSerials((xs) => xs.filter((x) => x !== s)), setState("dirty"))}>
                      ✕
                    </button>
                  ) : null}
                </span>
              );
            })}
            {showSystem
              ? missing.map((s) => (
                  <span key={s.serial} className={`${styles.serial} ${styles.serialMissing}`} title="Expected but not found">
                    {s.serial}
                  </span>
                ))
              : null}
          </div>
          <div className={styles.meta}>Found: {serials.length}</div>
        </>
      ) : editable ? (
        <div className={styles.qtyRow}>
          <button type="button" className={styles.step} aria-label="One less" onClick={() => step(-1)}>
            −
          </button>
          <input
            ref={qtyRef}
            className={styles.qty}
            inputMode="decimal"
            aria-label={`Counted quantity of ${line.product.code}`}
            value={qty}
            placeholder="—"
            onChange={(e) => (setQty(e.target.value), setState("dirty"))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
            onBlur={() => state === "dirty" && qty !== "" && void save()}
          />
          <button type="button" className={styles.step} aria-label="One more" onClick={() => step(1)}>
            +
          </button>
        </div>
      ) : (
        <div className={styles.meta}>Counted: {line.notCounted ? "not counted (0)" : formatQty(line.countedQty)}</div>
      )}

      {editable ? (
        <div className={styles.saveRow}>
          <span className={styles.status}>
            {state === "saving" ? "Saving…" : state === "dirty" ? "Not saved" : line.countedBy ? `Counted by ${line.countedBy.name}${line.notCounted ? " — marked not counted (0)" : ""}` : "Not counted yet"}
          </span>
          <span style={{ display: "flex", gap: "var(--space-2)" }}>
            {!done ? (
              <Button kind="ghost" size="sm" onClick={() => save({ notCounted: true })}>
                Not counted = 0
              </Button>
            ) : null}
            <Button size="sm" kind={state === "dirty" ? "primary" : "secondary"} onClick={() => save()} disabled={state === "saving" || (!line.product.trackSerial && qty === "")}>
              Save
            </Button>
          </span>
        </div>
      ) : line.countedBy ? (
        <div className={styles.status}>Counted by {line.countedBy.name}</div>
      ) : null}
    </li>
  );
}

function Review({
  c,
  caps,
  variance,
  recountIds,
  setRecountIds,
  busy,
  onApprove,
  onRecount,
}: {
  c: CountDto;
  caps: StockCaps;
  variance: VarianceDto | null;
  recountIds: string[];
  setRecountIds: (ids: string[]) => void;
  busy: string | null;
  onApprove: () => void;
  onRecount: () => void;
}) {
  const reviewing = c.status === "SUBMITTED";
  const t = variance?.totals;
  return (
    <section className={base.section}>
      <div className={base.sectionHead}>
        <div>
          <h2 className={base.sectionTitle}>{reviewing ? "Review differences" : "Result"}</h2>
          <p className={base.sectionHelp}>
            {reviewing ? `Submitted by ${c.submittedBy?.name ?? "—"} ${formatDateTime(c.submittedAt)}. Largest value difference first.` : `Approved by ${c.approvedBy?.name ?? "—"} ${formatDateTime(c.approvedAt)}.`}
            {c.adjustmentEntry ? (
              <>
                {" "}
                Adjustment:{" "}
                <Link href={`/stock/${c.adjustmentEntry.id}`} className={base.mono}>
                  {c.adjustmentEntry.number}
                </Link>
              </>
            ) : !reviewing ? " No differences — no adjustment was needed." : ""}
          </p>
        </div>
      </div>
      {t ? (
        <div className={base.cards} style={{ marginBottom: "var(--space-5)" }}>
          <div className={base.card} style={{ background: "var(--color-background)" }}>
            <div className={base.cardLabel}>Lines with a difference</div>
            <div className={base.cardValue}>{t.linesWithVariance}</div>
          </div>
          <div className={base.card} style={{ background: "var(--color-background)" }}>
            <div className={base.cardLabel}>Found extra (qty)</div>
            <div className={`${base.cardValue} ${base.positive}`}>+{formatQty(t.gainQty)}</div>
            {caps.seeCost && t.gainValue ? <div className={base.muted}>{formatMoney(t.gainValue)}</div> : null}
          </div>
          <div className={base.card} style={{ background: "var(--color-background)" }}>
            <div className={base.cardLabel}>Missing (qty)</div>
            <div className={`${base.cardValue} ${base.negative}`}>−{formatQty(t.lossQty)}</div>
            {caps.seeCost && t.lossValue ? <div className={base.muted}>{formatMoney(t.lossValue)}</div> : null}
          </div>
          {caps.seeCost && t.netValue ? (
            <div className={base.card} style={{ background: "var(--color-background)" }}>
              <div className={base.cardLabel}>Net value</div>
              <div className={`${base.cardValue} ${t.netValue.startsWith("-") ? base.negative : base.positive}`}>{formatMoney(t.netValue)}</div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={base.linesWrap}>
        <table className={styles.reviewTable}>
          <thead>
            <tr>
              {reviewing ? <th>Recount</th> : null}
              <th>Product</th>
              <th className={styles.right}>System</th>
              <th className={styles.right}>Counted</th>
              <th className={styles.right}>Variance</th>
              {caps.seeCost ? <th className={styles.right}>Value</th> : null}
              <th className={styles.hideSm}>Serials</th>
            </tr>
          </thead>
          <tbody>
            {variance?.lines.map((l) => (
              <tr key={l.lineId}>
                {reviewing ? (
                  <td>
                    <Checkbox label={<span className="visually-hidden">Recount {l.product.code}</span>} checked={recountIds.includes(l.lineId)} onChange={(e) => setRecountIds(e.target.checked ? [...recountIds, l.lineId] : recountIds.filter((x) => x !== l.lineId))} />
                  </td>
                ) : null}
                <td>
                  <div>{l.product.name}</div>
                  <div className={base.muted}>
                    <span className={base.mono}>{l.product.code}</span>
                    {l.condition === "DAMAGED" ? " · damaged" : ""}
                    {l.countedBy ? ` · ${l.countedBy.name}` : ""}
                    {l.notCounted ? " · not counted" : ""}
                  </div>
                </td>
                <td className={styles.right}>{formatQty(l.systemQty)}</td>
                <td className={styles.right}>{formatQty(l.countedQty)}</td>
                <td className={`${styles.right} ${l.variance?.startsWith("-") ? base.negative : base.positive}`}>
                  {l.variance && !l.variance.startsWith("-") && l.variance !== "0.000" ? "+" : ""}
                  {formatQty(l.variance)}
                </td>
                {caps.seeCost ? <td className={styles.right}>{formatMoney(l.varianceValue)}</td> : null}
                <td className={styles.hideSm}>
                  {l.missingSerials.length ? <div className={base.negative}>Missing: {l.missingSerials.join(", ")}</div> : null}
                  {l.unexpectedSerials.length ? <div style={{ color: "var(--color-purple-tag-text)" }}>Unexpected: {l.unexpectedSerials.join(", ")}</div> : null}
                </td>
              </tr>
            ))}
            {variance && !variance.lines.length ? (
              <tr>
                <td colSpan={7} className={base.muted}>
                  Everything matches the system quantities.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {reviewing ? (
        <div className={styles.bottomBar}>
          <span className={base.muted}>{recountIds.length ? `${recountIds.length} line(s) chosen for recount` : "Tick lines to send them back for a recount."}</span>
          <span style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <Button kind="secondary" onClick={onRecount} disabled={!!busy || !recountIds.length}>
              {busy === "request-recount" ? "Sending…" : "Request recount"}
            </Button>
            <Button onClick={() => window.confirm("Approve and post the differences as a stock adjustment?") && onApprove()} disabled={!!busy || recountIds.length > 0}>
              {busy === "approve" ? "Posting…" : "Approve & post adjustment"}
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
}
