# Go-live checklist

Work through the steps in order and tick each one. Where a step says **Owner**, the business owner (or someone they name) signs it off. Technical background: [deployment-notes.md](deployment-notes.md), [backup-restore.md](backup-restore.md), [security-review.md](security-review.md).

## A. Before the rehearsal (1–2 weeks ahead)

1. ☐ Server, domain, mail account and off-site backup storage are chosen and paid for.
2. ☐ `.env.prod` is filled in on the server (not in Git). Required values are set, and the secrets were generated fresh (not copied from a test).
3. ☐ These are also set, or the Owner has accepted, in writing, running without them for now:
   - `SMTP_*` (email);
   - `BACKUP_ENCRYPTION_KEY` and `BACKUP_S3_*` (off-site backup);
   - `SENTRY_DSN` (error tracking).
4. ☐ `BACKUP_ENCRYPTION_KEY` is stored in the Owner's password manager, away from the server. Without it the backups cannot be read.
5. ☐ HTTPS works on the domain. `APP_URL=https://…`, `COOKIE_SECURE=true`, and `TRUST_PROXY=true` (when behind a proxy).
6. ☐ The firewall allows only 80/443 and SSH. PostgreSQL, Redis and port 3000 cannot be reached from outside.
7. ☐ `docker compose … run --rm web check-env` prints "Configuration is valid". Everything it lists as "NOT SET YET" is expected.
8. ☐ The image tag that will go live has passed CI on `main`: tests, authorization matrix, audit, secret scan and smoke test.

## B. User acceptance test (UAT)

Use the rehearsal server with sample data (`SEED_SAMPLE_DATA=true`) or a copy of the opening-stock sheets. Each role signs in with its own test account and completes its list. Record problems in the table at the end. Nothing goes live with an open **blocker**.

The lists follow the four standard roles. If you changed a role's permissions, adjust its list.

**Admin**
1. ☐ Create a user for each role, with the right warehouses. Set a password, disable a user, and use **Log out all devices**.
2. ☐ Create a custom role and check that a user with it sees only what it allows.
3. ☐ Approve the Manager's purchase order, then email it (or see "not sent: email is not set up yet" in the email log). Close a PO.
4. ☐ **System health**: every tile is green or says "not set up yet" as expected. Then run **Back up now**, **Test restore** and **Check integrity now**; all three succeed.
5. ☐ **Background jobs**: no failed jobs. **Reports → Audit log** shows the actions above.

**Accounts**
1. ☐ Approve and reject entries submitted by Store Managers; the submitter is notified.
2. ☐ On a pending import GRN, enter the customs exchange rate and landed-cost charges, then approve it. The average cost changes as expected.
3. ☐ Costs and profit are visible on entries and reports. Margins are not.
4. ☐ Open the 14 reports, export one to Excel and one to PDF, and schedule one by email.
5. ☐ Read-only on purchase orders and projects: they can be opened, but not changed.

**Manager**
1. ☐ Create a supplier and a purchase order (also from **Low stock → Create PO**), then submit it for approval.
2. ☐ Create a project and record a project cost. After the Store Manager's issues and returns, the project cost statement matches.
3. ☐ Approve entries and the stock count variance.
4. ☐ The dashboard figures are plausible (Manager has no Reports menu).

**Store Manager** (one per warehouse)
1. ☐ Sees only their own warehouse (stock, entries, serials). Sees no costs anywhere, including on PDFs.
2. ☐ Receive a GRN against the approved PO (partly, then the rest), with serial numbers where the product is serial-tracked. The PO's received quantities are right.
3. ☐ Issue to a project and record a sale; both go for approval. Then transfer to the other warehouse; the other Store Manager receives it, including a shortage.
4. ☐ Stock count: start, count, submit.
5. ☐ Print a GRN, a delivery challan and a transfer challan.

| # | Role | Problem | Severity (blocker / major / minor) | Fixed in | Retested by |
|---|---|---|---|---|---|
| | | | | | |

**UAT sign-off**

| Role | Name | Date | Signature |
|---|---|---|---|
| Admin | | | |
| Accounts | | | |
| Manager | | | |
| Store Manager — Warehouse A | | | |
| Store Manager — Warehouse B | | | |
| Owner | | | |

## C. Rehearsal (dress run, 2–5 days before)

Do the whole cut-over once on the real server, then throw the data away.

1. ☐ Start the stack (`up -d`) from an empty database. `migrate` finishes, and the smoke test passes.
2. ☐ Import the real opening stock sheets (Opening stock → Import). Fix every row error in the sheet, not in the app.
3. ☐ Store Managers count a sample of 20 products per warehouse. They match the imported figures.
4. ☐ The backup runs, the restore test passes, and the integrity check passes.
5. ☐ Rollback drill: point `STOCKBOOK_IMAGE` at the previous tag and start web and worker. They run. Switch back.
6. ☐ Restore drill: restore last night's backup into a scratch database with `scripts/restore.sh` and check the counts.
7. ☐ Write down how long the import and counts took; that is the cut-over window.
8. ☐ Reset: `down -v` (deletes the rehearsal data) and fix anything that went wrong. Use `SEED_SAMPLE_DATA=false` for the real start.

## D. Cut-over day

1. ☐ Stock movements on paper stop at the agreed time. Nothing moves in or out of the warehouses until step 6.
2. ☐ Start the stack on an empty database. Sign in as Admin, change the Admin password, and create the real users.
3. ☐ Import the opening stock per warehouse (final sheets, with counts as of the stop time). Then lock opening stock.
4. ☐ Spot-check 20 products per warehouse against the physical stock. The integrity check passes.
5. ☐ Enter the open purchase orders and the running projects.
6. ☐ Open for use. The Owner announces the start time, and all paper stock cards are retired from that moment.
7. ☐ Make a manual backup (**Back up now**) and check that it appears on System health (and off-site, if set).

## E. First week

| Day | Check | Who |
|---|---|---|
| Every morning | System health: backup from last night, integrity check passed, no failed jobs, worker heartbeat green | Admin |
| Every morning | Pending approvals cleared; transfers in transit received | Manager |
| Day 1–2 | Short floor visit: are entries made at the time goods move, not at the end of the day? | Owner / Manager |
| Day 3 | Cycle count of 30 fast-moving products per warehouse; variances explained | Store Managers |
| Day 5 | Stock summary and project cost reports reviewed with Accounts | Accounts / Owner |
| Day 7 | Review: problems found, user questions, settings to change (alerts, min stock levels); decide whether to keep the old paper records as backup any longer | All |

From day 8 the routine is in [user-guides/admin.md](user-guides/admin.md#daily-and-monthly-checks).

## F. Rollback plan

Decide **before** cut-over who may call a rollback (the Owner) and until when (end of day 2).

| Problem | Action |
|---|---|
| A bug in a new release (later releases) | Go back to the previous image tag ([deployment-notes.md → Rollback](deployment-notes.md#rollback)). Data stays. |
| Opening stock imported wrongly (before entries are made) | Reset the database and import again (the rehearsal procedure). |
| StockBook unusable on day 1–2 | Return to paper with the printed stock summary from the cut-over (print it at step D.6). Keep every entry made in StockBook, export the stock movement report, and re-enter the paper movements when StockBook is back. |
| Server lost | Set up a new server and restore the latest backup ([backup-restore.md](backup-restore.md#restoring-for-real)). Entries made after that backup must be re-entered from the paper copies of GRNs and challans. |

**Go-live sign-off**

| Step | Name | Date / time | Signature |
|---|---|---|---|
| A. Preparation complete | | | |
| B. UAT accepted | | | |
| C. Rehearsal passed | | | |
| D. Live | | | |
| E. First-week review | | | |
