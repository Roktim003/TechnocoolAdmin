"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Notification } from "@/components/ui/Notification";
import { api, download, errorMessage, upload } from "@/lib/api-client";
import type { ImportJobDto } from "./types";
import styles from "./catalog.module.css";

type Result = NonNullable<ImportJobDto["result"]>;
type RowError = Result["errors"][number];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uploads the file in the given mode and polls the background job until it finishes. */
async function runJob(file: File, mode: "validate" | "commit"): Promise<ImportJobDto> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("mode", mode);
  const { jobId } = (await upload<{ data: { jobId: string } }>("/products/import", fd)).data;
  for (let i = 0; i < 600; i++) {
    const job = (await api<{ data: ImportJobDto }>(`/products/import/${jobId}`)).data;
    if (job.status === "completed" || job.status === "failed") return job;
    await sleep(i < 10 ? 300 : 1000);
  }
  throw new Error("The import is taking too long. Check back on the catalog page later.");
}

function Num({ n }: { n: number }) {
  return (
    <span className={styles.num} aria-hidden="true">
      {n}
    </span>
  );
}

export function ImportWizard({ seeCost }: { seeCost: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "validating" | "validated" | "committing" | "done">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getTemplate() {
    try {
      await download("/products/import/template", {}, "product-import-template.xlsx");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function validate(f: File) {
    setFile(f);
    setResult(null);
    setError(null);
    setPhase("validating");
    try {
      const job = await runJob(f, "validate");
      if (job.status === "failed") throw new Error(job.failedReason ?? "Validation failed.");
      setResult(job.result);
      setPhase("validated");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("idle");
    }
  }

  async function commit() {
    if (!file) return;
    setError(null);
    setPhase("committing");
    try {
      const job = await runJob(file, "commit");
      if (job.status === "failed") throw new Error(job.failedReason ?? "Import failed.");
      setResult(job.result);
      setPhase(job.result?.committed ? "done" : "validated");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("validated");
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setPhase("idle");
  }

  const columns: Column<RowError>[] = [
    { key: "row", header: "Row", render: (e) => (e.row > 0 ? e.row : "—") },
    { key: "field", header: "Field", render: (e) => <span className={styles.nowrap}>{e.field}</span> },
    { key: "message", header: "Error", render: (e) => e.message },
  ];

  const ready = phase === "validated" && result && result.errors.length === 0 && result.validRows > 0;

  return (
    <div className={styles.steps}>
      {error ? (
        <Notification kind="error" title="Import problem" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}

      <section className={styles.section}>
        <div className={styles.stepHeader}>
          <Num n={1} />
          <h2 className={styles.sectionTitle}>Download the template</h2>
        </div>
        <p className={styles.sectionHelp}>
          Fill in one product per row. The Lists sheet shows the valid brands, categories and units; columns marked * are required.
          {seeCost ? "" : " Your role can’t see purchase cost, so the template has no cost column (cost starts at 0)."}
        </p>
        <Button kind="secondary" onClick={getTemplate}>
          Download template
        </Button>
      </section>

      <section className={styles.section}>
        <div className={styles.stepHeader}>
          <Num n={2} />
          <h2 className={styles.sectionTitle}>Upload and check</h2>
        </div>
        <p className={styles.sectionHelp}>We check every row first. Nothing is saved in this step.</p>
        <div className={styles.stepBody}>
          <Button onClick={() => inputRef.current?.click()} disabled={phase === "validating" || phase === "committing"}>
            {file ? "Choose another file" : "Choose .xlsx file"}
          </Button>
          {file ? <span className={styles.fileName}>{file.name}</span> : null}
          {phase === "validating" ? <span>Checking rows…</span> : null}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void validate(f);
            }}
          />
        </div>
      </section>

      {result && phase !== "done" ? (
        <section className={styles.section}>
          <div className={styles.stepHeader}>
            <Num n={3} />
            <h2 className={styles.sectionTitle}>Review</h2>
          </div>
          <div className={styles.summary}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{result.totalRows}</span>
              <span className={styles.statLabel}>Rows in file</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{result.validRows}</span>
              <span className={styles.statLabel}>Valid rows</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{result.errors.length}</span>
              <span className={styles.statLabel}>Errors</span>
            </div>
          </div>
          {result.errors.length ? (
            <>
              <Notification kind="error" title="Fix these rows in Excel and upload the file again">
                Nothing will be imported while any row has an error.
              </Notification>
              <DataTable caption="Validation errors" columns={columns} rows={result.errors} rowKey={(e) => `${e.row}-${e.field}-${e.message}`} />
            </>
          ) : (
            <Notification kind="success" title="All rows are valid">
              {result.validRows} product{result.validRows === 1 ? "" : "s"} will be created in one go.
            </Notification>
          )}
          <div className={styles.stepBody}>
            {ready ? (
              <Button onClick={commit} disabled={phase !== "validated"}>
                Import {result.validRows} product{result.validRows === 1 ? "" : "s"}
              </Button>
            ) : null}
            {phase === "committing" ? <span>Importing…</span> : null}
          </div>
        </section>
      ) : null}

      {phase === "done" && result ? (
        <section className={styles.section}>
          <Notification kind="success" title="Import complete">
            {result.createdCount} product{result.createdCount === 1 ? " was" : "s were"} added to the catalog.
          </Notification>
          <div className={styles.stepBody}>
            <Link href="/catalog" className={styles.primaryLink}>
              Go to the catalog
            </Link>
            <Button kind="ghost" onClick={reset}>
              Import another file
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
