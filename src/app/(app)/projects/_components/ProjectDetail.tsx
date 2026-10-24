"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { newKey } from "../../stock/_components/types";
import { ActivityTab, CostsTab, DocumentsTab, MaterialTab, MovementsTab } from "./ProjectTabs";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TAG, type ProjectDto, type ProjectsCaps } from "./types";
import styles from "./projects.module.css";

type TabKey = "material" | "movements" | "costs" | "documents" | "activity";
const TABS: TabKey[] = ["material", "movements", "costs", "documents", "activity"];

export function ProjectDetail({ caps, initial, saved, initialTab }: { caps: ProjectsCaps; initial: ProjectDto; saved: boolean; initialTab: string | null }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [tab, setTab] = useState<TabKey>(TABS.includes(initialTab as TabKey) ? (initialTab as TabKey) : "material");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; title?: string; message: string } | null>(saved ? { kind: "success", message: "Project saved." } : null);
  const [costCount, setCostCount] = useState<number | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [toStatus, setToStatus] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const keyRef = useRef(newKey());

  useEffect(() => {
    if (saved) {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      window.history.replaceState(null, "", url);
    }
  }, [saved]);

  /** Re-reads the project (tiles) after a cost is added / voided. */
  const refresh = useCallback(async () => {
    try {
      setP((await api<{ data: ProjectDto }>(`/projects/${initial.id}`)).data);
    } catch {
      /* keep the old figures */
    }
  }, [initial.id]);

  const change = (k: TabKey) => {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    window.history.replaceState(null, "", url);
  };

  const transitions = p.actions.transitions;
  const chosen = transitions.find((t) => t.toStatus === toStatus);

  async function changeStatus() {
    setBusy("status");
    setFieldErrors({});
    try {
      const r = await api<{ data: ProjectDto }>(`/projects/${p.id}/status`, { method: "POST", body: { toStatus, ...(reason.trim() ? { reason: reason.trim() } : {}) }, headers: { "Idempotency-Key": keyRef.current } });
      setP(r.data);
      setStatusOpen(false);
      setReason("");
      setNotice({ kind: "success", message: `Status changed to ${PROJECT_STATUS_LABEL[r.data.status].toLowerCase()}.` });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setFieldErrors(err.fieldErrors());
      else {
        setStatusOpen(false);
        setNotice({ kind: "error", title: "Status not changed", message: errorMessage(err) });
      }
    } finally {
      keyRef.current = newKey();
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy("pdf");
    try {
      const job = (await api<{ data: { jobId: string } }>(`/projects/${p.id}/documents`, { method: "POST" })).data;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const s = (await api<{ data: { status: string; downloadUrl: string | null; failedReason: string | null } }>(`/documents/${job.jobId}`)).data;
        if (s.status === "completed" && s.downloadUrl) {
          window.open(s.downloadUrl, "_blank", "noopener");
          return;
        }
        if (s.status === "failed") throw new Error(s.failedReason ?? "The PDF couldn't be created.");
      }
      throw new Error("The PDF is taking too long. Try again in a minute.");
    } catch (err) {
      setNotice({ kind: "error", title: "Couldn't create the cost statement", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const s = p.summary;
  const used = s.costUsedPercent ? Number(s.costUsedPercent) : null;
  const engineer = p.siteEngineer?.name ?? p.siteEngineerName;
  const stockLink = (type: string) => `/stock?tab=new&type=${type}&project=${p.id}${p.defaultWarehouse ? `&warehouse=${p.defaultWarehouse.id}` : ""}`;

  return (
    <>
      <Link href="/projects" className={styles.back}>
        ← All projects
      </Link>

      <div className={styles.headerTile}>
        <div className={styles.headerTop}>
          <div>
            <div className={styles.cardTop} style={{ justifyContent: "flex-start" }}>
              <span className={styles.code}>{p.code}</span>
              <Tag kind={PROJECT_STATUS_TAG[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Tag>
              {p.isActive ? null : <Tag kind="gray">Inactive</Tag>}
            </div>
            <h1 className={styles.title}>{p.name}</h1>
            <div className={styles.meta}>
              {p.clientName ?? "—"}
              {p.siteAddress ? ` · ${p.siteAddress}` : ""}
            </div>
          </div>
          <div className={styles.actions}>
            {p.actions.issueMaterial ? (
              <Link href={stockLink("ISSUE_TO_PROJECT")}>
                <Button>Issue material</Button>
              </Link>
            ) : null}
            {p.actions.returnMaterial ? (
              <Link href={stockLink("RETURN_FROM_SITE")}>
                <Button kind="secondary">Return from site</Button>
              </Link>
            ) : null}
            {transitions.length ? (
              <Button
                kind="secondary"
                onClick={() => {
                  setToStatus(transitions[0]!.toStatus);
                  setReason("");
                  setFieldErrors({});
                  setStatusOpen(true);
                }}
              >
                Change status
              </Button>
            ) : null}
            {p.actions.edit ? (
              <Link href={`/projects/${p.id}/edit`}>
                <Button kind="secondary">Edit project</Button>
              </Link>
            ) : null}
            {p.actions.costStatement ? (
              <Button kind="secondary" onClick={pdf} disabled={busy === "pdf"}>
                {busy === "pdf" ? "Preparing PDF…" : "Cost statement PDF"}
              </Button>
            ) : null}
          </div>
        </div>
        <dl className={styles.info}>
          <Info label="Client contact">{p.clientContactPerson}</Info>
          <Info label="Phone">{p.clientPhone}</Info>
          <Info label="Project type">{p.projectTypeLabel}</Info>
          <Info label="Site engineer">{engineer}</Info>
          <Info label="Supplying warehouse">{p.defaultWarehouse?.name}</Info>
          <Info label="Start → expected end">{p.startDate || p.expectedEndDate ? `${p.startDate ?? "—"} → ${p.expectedEndDate ?? "—"}` : null}</Info>
          {p.actualEndDate ? <Info label="Completed on">{p.actualEndDate}</Info> : null}
          {p.status === "CLOSED" ? <Info label="Closed">{`${p.closedBy?.name ?? ""} · ${p.closeReason ?? ""}`}</Info> : null}
        </dl>
      </div>

      <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        {notice ? (
          <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        {!p.actions.issueMaterial && caps.canIssue ? (
          <Notification kind="info">
            {p.status === "PLANNING" || p.status === "RUNNING"
              ? "This project is inactive, so material can't be issued to it."
              : `Material can't be issued to a project that is ${PROJECT_STATUS_LABEL[p.status].toLowerCase()}. ${p.status === "CLOSED" ? "Returns from site aren't accepted either." : "Returns from site are still allowed until it is Closed."}`}
          </Notification>
        ) : null}
      </div>

      {caps.seeCost && s.totalCost !== undefined ? (
        <div className={styles.tiles}>
          <Tile label="Material cost" value={s.netMaterialCost} />
          <Tile label="Labour" value={s.labourCost} />
          <Tile label="Transport" value={s.transportCost} />
          <Tile label="Other" value={s.otherCost} />
          <Tile label="Total cost" value={s.totalCost} total />
          {s.contractValue !== undefined ? (
            <>
              <Tile label="Contract value" value={s.contractValue} />
              <div className={styles.tile}>
                <div className={styles.figLabel}>Margin</div>
                <div className={`${styles.tileValue} ${s.margin?.startsWith("-") ? styles.negative : ""}`}>{s.margin === null || s.margin === undefined ? "—" : formatMoney(s.margin)}</div>
                <div className={styles.meta}>{s.marginPercent ? `${s.marginPercent}% of contract` : "No contract value"}</div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {used !== null ? (
        <div className={styles.usage} aria-label="Cost used versus contract value">
          <div className={styles.usageHead}>
            <span>Cost used vs contract</span>
            <strong>{s.costUsedPercent}%</strong>
          </div>
          <div className={styles.track}>
            <div className={`${styles.fill} ${used >= 100 ? styles.fillOver : used >= 90 ? styles.fillWarn : ""}`} style={{ width: `${Math.min(100, Math.max(0, used))}%` }} />
          </div>
        </div>
      ) : null}

      <Tabs
        label="Project sections"
        selected={tab}
        onChange={change}
        items={[
          { key: "material", label: "Material used" },
          { key: "movements", label: "Issue / return history" },
          { key: "costs", label: `Labour, transport & other${costCount !== null ? ` (${costCount})` : ""}` },
          { key: "documents", label: "Documents" },
          { key: "activity", label: "Activity" },
        ]}
      />
      <div style={{ marginTop: "var(--space-5)" }}>
        {tab === "material" ? <MaterialTab project={p} caps={caps} issueLink={p.actions.issueMaterial ? stockLink("ISSUE_TO_PROJECT") : null} /> : null}
        {tab === "movements" ? <MovementsTab project={p} caps={caps} /> : null}
        <div hidden={tab !== "costs"}>
          <CostsTab project={p} caps={caps} onCount={setCostCount} onChanged={refresh} />
        </div>
        {tab === "documents" ? <DocumentsTab project={p} caps={caps} /> : null}
        {tab === "activity" ? <ActivityTab project={p} /> : null}
      </div>

      <Modal open={statusOpen} title="Change status" label={`${p.code} · now ${PROJECT_STATUS_LABEL[p.status].toLowerCase()}`} primaryText="Change status" submitting={busy === "status"} onClose={() => setStatusOpen(false)} onSubmit={() => void changeStatus()}>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <SelectField label="New status" value={toStatus} onChange={(e) => setToStatus(e.target.value)} error={fieldErrors.toStatus}>
            {transitions.map((t) => (
              <option key={t.toStatus} value={t.toStatus}>
                {t.label} → {PROJECT_STATUS_LABEL[t.toStatus]}
              </option>
            ))}
          </SelectField>
          {toStatus === "COMPLETED" && p.status === "RUNNING" ? <p className={styles.meta}>Sets the completion date to today. Material can&apos;t be issued to a completed project; returns are still accepted.</p> : null}
          {toStatus === "CLOSED" ? <p className={styles.meta}>Closing is refused while stock entries for this project are pending or a transfer hasn&apos;t been received. A closed project can&apos;t take returns or costs.</p> : null}
          <TextAreaField label={chosen?.reasonRequired ? "Reason *" : "Reason (optional)"} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors.reason} />
        </div>
      </Modal>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function Tile({ label, value, total }: { label: string; value: string | null | undefined; total?: boolean }) {
  return (
    <div className={`${styles.tile} ${total ? styles.tileTotal : ""}`}>
      <div className={styles.figLabel}>{label}</div>
      <div className={styles.tileValue}>{value === null || value === undefined ? "—" : formatMoney(value)}</div>
    </div>
  );
}
