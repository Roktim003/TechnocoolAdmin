-- Module 7: operations (backup runs, restore tests, integrity checks), EmailStatus NOT_SENT_SMTP_MISSING
-- (expand step: SKIPPED stays valid for one release), and database-level immutability triggers.

-- CreateEnum
CREATE TYPE "OpsTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'PRE_MIGRATION');

-- CreateEnum
CREATE TYPE "OpsRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'NOT_SENT_SMTP_MISSING';

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" UUID NOT NULL,
    "trigger" "OpsTrigger" NOT NULL,
    "status" "OpsRunStatus" NOT NULL DEFAULT 'RUNNING',
    "fileName" TEXT,
    "sizeBytes" BIGINT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "offsite" BOOLEAN NOT NULL DEFAULT false,
    "offsiteError" TEXT,
    "error" TEXT,
    "details" JSONB,
    "requestedById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreTestRun" (
    "id" UUID NOT NULL,
    "trigger" "OpsTrigger" NOT NULL,
    "status" "OpsRunStatus" NOT NULL DEFAULT 'RUNNING',
    "backupFile" TEXT,
    "details" JSONB,
    "error" TEXT,
    "requestedById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RestoreTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityCheckRun" (
    "id" UUID NOT NULL,
    "trigger" "OpsTrigger" NOT NULL,
    "status" "OpsRunStatus" NOT NULL DEFAULT 'RUNNING',
    "passed" BOOLEAN,
    "checks" JSONB,
    "error" TEXT,
    "requestedById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrityCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RestoreTestRun_startedAt_idx" ON "RestoreTestRun"("startedAt");

-- CreateIndex
CREATE INDEX "IntegrityCheckRun_startedAt_idx" ON "IntegrityCheckRun"("startedAt");


-- ── Immutability ──────────────────────────────────────────────────────────────
-- The ledger and the audit trail are append-only. These triggers refuse UPDATE and DELETE
-- whatever the client (the app, psql, a script). TRUNCATE (tests, restores) is not affected.
-- StockMovement and SerialMovement are already protected since Module 2 (stock_movement_append_only).

CREATE OR REPLACE FUNCTION stockbook_refuse_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockBook: % rows are immutable (% refused)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'Post a reversal or a new entry instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION stockbook_refuse_change();

-- Lines of a posted entry (POSTED, and the posted states REVERSED / RECEIVED) can't change.
-- Draft and pending lines stay editable; posting fills in costs before the status changes.
CREATE OR REPLACE FUNCTION stockbook_refuse_posted_line_change() RETURNS trigger AS $$
DECLARE
  entry_status text;
BEGIN
  SELECT status::text INTO entry_status FROM "StockEntry" WHERE id = OLD."entryId";
  IF entry_status IN ('POSTED', 'REVERSED', 'RECEIVED') THEN
    RAISE EXCEPTION 'StockBook: lines of a % entry are immutable (% refused)', entry_status, TG_OP
      USING ERRCODE = 'restrict_violation', HINT = 'Post a reversal or a new entry instead.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockEntryLine_posted_immutable"
  BEFORE UPDATE OR DELETE ON "StockEntryLine"
  FOR EACH ROW EXECUTE FUNCTION stockbook_refuse_posted_line_change();
