"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { WarehouseDto } from "../../stock/_components/types";
import { PROJECT_TYPE_LABEL, PROJECT_TYPES, type ProjectDto, type ProjectsCaps } from "./types";
import styles from "../../stock/_components/stock.module.css";

type Form = Record<string, string>;

const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

function formOf(p: ProjectDto | null, defaultWarehouseId: string): Form {
  return {
    name: p?.name ?? "",
    clientName: p?.clientName ?? "",
    clientContactPerson: p?.clientContactPerson ?? "",
    clientPhone: p?.clientPhone ?? "",
    clientEmail: p?.clientEmail ?? "",
    siteAddress: p?.siteAddress ?? "",
    projectType: p?.projectType ?? "OTHER",
    startDate: p?.startDate ?? "",
    expectedEndDate: p?.expectedEndDate ?? "",
    engineerMode: p?.siteEngineer ? "user" : p?.siteEngineerName ? "name" : "user",
    siteEngineerUserId: p?.siteEngineer?.id ?? "",
    siteEngineerName: p?.siteEngineer ? "" : (p?.siteEngineerName ?? ""),
    defaultWarehouseId: p ? (p.defaultWarehouse?.id ?? "") : defaultWarehouseId,
    status: "PLANNING",
    contractValue: p?.contractValue ?? "",
    notes: p?.notes ?? "",
  };
}

/** New / edit project. The code is assigned by the server; the contract value only for FULL + seeMargin. */
export function ProjectForm({ caps, warehouses, project, nextCode }: { caps: ProjectsCaps; warehouses: WarehouseDto[]; project?: ProjectDto; nextCode?: string }) {
  const router = useRouter();
  const active = warehouses.filter((w) => w.isActive || w.id === project?.defaultWarehouse?.id);
  const [f, setF] = useState<Form>(() => formOf(project ?? null, active[0]?.id ?? ""));
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canContract = caps.canFull && caps.seeMargin && (!project || project.actions.editContractValue);

  useEffect(() => {
    api<{ data: { id: string; name: string }[] }>("/projects/site-engineers").then((r) => setUsers(r.data)).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const body: Record<string, unknown> = {
      name: f.name?.trim(),
      clientName: f.clientName?.trim(),
      clientContactPerson: nul(f.clientContactPerson),
      clientPhone: nul(f.clientPhone),
      clientEmail: nul(f.clientEmail),
      siteAddress: nul(f.siteAddress),
      projectType: f.projectType,
      startDate: f.startDate || null,
      expectedEndDate: f.expectedEndDate || null,
      siteEngineerUserId: f.engineerMode === "user" ? f.siteEngineerUserId || null : null,
      siteEngineerName: f.engineerMode === "name" ? nul(f.siteEngineerName) : null,
      defaultWarehouseId: f.defaultWarehouseId || null,
      notes: nul(f.notes),
      ...(canContract ? { contractValue: (f.contractValue ?? "").trim() || null } : {}),
      ...(project ? {} : { status: f.status }),
    };
    try {
      const r = project
        ? await api<{ data: ProjectDto }>(`/projects/${project.id}`, { method: "PATCH", body })
        : await api<{ data: ProjectDto }>("/projects", { method: "POST", body });
      router.push(`/projects/${r.data.id}?saved=1`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.stack}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {formError ? (
        <Notification kind="error" title="Couldn't save the project" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}

      <section className={styles.section} aria-labelledby="p-main">
        <div className={styles.sectionHead}>
          <h2 id="p-main" className={styles.sectionTitle}>
            Project
          </h2>
          <span className={styles.muted}>
            Code: <span className={styles.mono}>{project?.code ?? nextCode ?? "assigned on save"}</span>
          </span>
        </div>
        <div className={styles.grid}>
          <TextField label="Project name *" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required fieldClassName={styles.full} />
          <SelectField label="Project type" value={f.projectType} onChange={(e) => set("projectType", e.target.value)} error={errors.projectType}>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
          {project ? null : (
            <SelectField label="Starting status" value={f.status} onChange={(e) => set("status", e.target.value)} error={errors.status} helper="Material can be issued to planning and running projects.">
              <option value="PLANNING">Planning</option>
              <option value="RUNNING">Running</option>
            </SelectField>
          )}
          <TextField label="Start date" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} error={errors.startDate} />
          <TextField label="Expected completion" type="date" min={f.startDate || undefined} value={f.expectedEndDate} onChange={(e) => set("expectedEndDate", e.target.value)} error={errors.expectedEndDate} />
          <SelectField label="Supplying warehouse" value={f.defaultWarehouseId} onChange={(e) => set("defaultWarehouseId", e.target.value)} error={errors.defaultWarehouseId} helper="Default warehouse for issues.">
            <option value="">None</option>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          {canContract ? (
            <TextField label="Contract value (৳)" inputMode="decimal" value={f.contractValue} onChange={(e) => set("contractValue", e.target.value)} error={errors.contractValue} helper="Visible only to roles that can see margins. Changes are audit-logged." />
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="p-client">
        <h2 id="p-client" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Client &amp; site
        </h2>
        <div className={styles.grid}>
          <TextField label="Client *" value={f.clientName} onChange={(e) => set("clientName", e.target.value)} error={errors.clientName} required />
          <TextField label="Client contact" value={f.clientContactPerson} onChange={(e) => set("clientContactPerson", e.target.value)} error={errors.clientContactPerson} />
          <TextField label="Phone" value={f.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} error={errors.clientPhone} />
          <TextField label="Email" type="email" value={f.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} error={errors.clientEmail} />
          <TextAreaField label="Site address" rows={2} value={f.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} error={errors.siteAddress} fieldClassName={styles.full} />
          <SelectField label="Site engineer" value={f.engineerMode} onChange={(e) => set("engineerMode", e.target.value)}>
            <option value="user">Pick a user</option>
            <option value="name">Type a name</option>
          </SelectField>
          {f.engineerMode === "user" ? (
            <SelectField label="Engineer (user)" value={f.siteEngineerUserId} onChange={(e) => set("siteEngineerUserId", e.target.value)} error={errors.siteEngineerUserId} helper="Notified when the project's status changes.">
              <option value="">None</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {project?.siteEngineer && !users.some((u) => u.id === project.siteEngineer!.id) ? <option value={project.siteEngineer.id}>{project.siteEngineer.name}</option> : null}
            </SelectField>
          ) : (
            <TextField label="Engineer (name)" value={f.siteEngineerName} onChange={(e) => set("siteEngineerName", e.target.value)} error={errors.siteEngineerName} helper="Someone outside StockBook." />
          )}
          <TextAreaField label="Notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} error={errors.notes} fieldClassName={styles.full} />
        </div>
      </section>

      <div className={styles.footer}>
        <span className={styles.muted}>{project ? `Editing ${project.code}` : "New project"}</span>
        <div className={styles.footerActions}>
          <Button kind="ghost" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </Button>
        </div>
      </div>
    </form>
  );
}
