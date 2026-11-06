"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import type { WarehouseDto } from "../../stock/_components/types";
import { PROJECT_TYPE_LABEL, PROJECT_TYPES, type ProjectDto, type ProjectsCaps } from "./types";
import styles from "../../stock/_components/stock.module.css";

type Form = Record<string, string>;

const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

const LABELS: Record<string, string> = {
  name: "Project name",
  contractValue: "Contract value",
  expectedEndDate: "Expected completion",
  clientName: "Client",
  clientContactPerson: "Client contact",
  clientPhone: "Phone",
  clientEmail: "Email",
  siteAddress: "Site address",
  siteEngineerName: "Engineer (name)",
  notes: "Notes",
};

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
  const [attempt, setAttempt] = useState(false);
  const canContract = caps.canFull && caps.seeMargin && (!project || project.actions.editContractValue);

  useEffect(() => {
    api<{ data: { id: string; name: string }[] }>("/projects/site-engineers").then((r) => setUsers(r.data)).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Browser-side checks (same rules as the server); every problem is shown at once.
  const problems = collect(
    ["name", rules.required(f.name, "the project name") ?? rules.maxLength(f.name, 150)],
    ["contractValue", canContract ? rules.money(f.contractValue) : undefined],
    ["expectedEndDate", rules.notBefore(f.expectedEndDate, f.startDate, "Expected completion can't be before the start date.")],
    ["clientName", rules.required(f.clientName, "the client's name") ?? rules.maxLength(f.clientName, 150)],
    ["clientContactPerson", rules.maxLength(f.clientContactPerson, 100)],
    ["clientPhone", rules.phone(f.clientPhone)],
    ["clientEmail", rules.email(f.clientEmail)],
    ["siteAddress", rules.maxLength(f.siteAddress, 300)],
    ["siteEngineerName", f.engineerMode === "name" ? rules.maxLength(f.siteEngineerName, 100) : undefined],
    ["notes", rules.maxLength(f.notes, 2000)],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once that field is edited.
  useEffect(() => setErrors({}), [f]);

  async function save() {
    setAttempt(true);
    setFormError(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setSaving(true);
    setErrors({});
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
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems();
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
      {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}

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
          <TextField label="Project name *" value={f.name} onChange={(e) => set("name", e.target.value)} error={shownErrors.name} required fieldClassName={styles.full} />
          <SelectField label="Project type" value={f.projectType} onChange={(e) => set("projectType", e.target.value)} error={shownErrors.projectType}>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
          {project ? null : (
            <SelectField label="Starting status" value={f.status} onChange={(e) => set("status", e.target.value)} error={shownErrors.status} helper="Material can be issued to planning and running projects.">
              <option value="PLANNING">Planning</option>
              <option value="RUNNING">Running</option>
            </SelectField>
          )}
          <TextField label="Start date" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} error={shownErrors.startDate} />
          <TextField label="Expected completion" type="date" min={f.startDate || undefined} value={f.expectedEndDate} onChange={(e) => set("expectedEndDate", e.target.value)} error={shownErrors.expectedEndDate} />
          <SelectField searchable label="Supplying warehouse" value={f.defaultWarehouseId} onChange={(e) => set("defaultWarehouseId", e.target.value)} error={shownErrors.defaultWarehouseId} helper="Default warehouse for issues.">
            <option value="">None</option>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          {canContract ? (
            <TextField label="Contract value (৳)" kind="money" value={f.contractValue} onChange={(e) => set("contractValue", e.target.value)} error={shownErrors.contractValue} helper="Visible only to roles that can see margins. Changes are audit-logged." />
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="p-client">
        <h2 id="p-client" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Client &amp; site
        </h2>
        <div className={styles.grid}>
          <TextField label="Client *" value={f.clientName} onChange={(e) => set("clientName", e.target.value)} error={shownErrors.clientName} required />
          <TextField label="Client contact" value={f.clientContactPerson} onChange={(e) => set("clientContactPerson", e.target.value)} error={shownErrors.clientContactPerson} />
          <TextField label="Phone" kind="phone" placeholder="e.g. 01711-000000" value={f.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} error={shownErrors.clientPhone} />
          <TextField label="Email" type="email" placeholder="name@company.com" value={f.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} error={shownErrors.clientEmail} />
          <TextAreaField label="Site address" rows={2} value={f.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} error={shownErrors.siteAddress} fieldClassName={styles.full} />
          <SelectField label="Site engineer" value={f.engineerMode} onChange={(e) => set("engineerMode", e.target.value)}>
            <option value="user">Pick a user</option>
            <option value="name">Type a name</option>
          </SelectField>
          {f.engineerMode === "user" ? (
            <SelectField searchable label="Engineer (user)" value={f.siteEngineerUserId} onChange={(e) => set("siteEngineerUserId", e.target.value)} error={shownErrors.siteEngineerUserId} helper="Notified when the project's status changes.">
              <option value="">None</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {project?.siteEngineer && !users.some((u) => u.id === project.siteEngineer!.id) ? <option value={project.siteEngineer.id}>{project.siteEngineer.name}</option> : null}
            </SelectField>
          ) : (
            <TextField label="Engineer (name)" value={f.siteEngineerName} onChange={(e) => set("siteEngineerName", e.target.value)} error={shownErrors.siteEngineerName} helper="Someone outside TechnoCool Inventory." />
          )}
          <TextAreaField label="Notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} error={shownErrors.notes} fieldClassName={styles.full} />
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
