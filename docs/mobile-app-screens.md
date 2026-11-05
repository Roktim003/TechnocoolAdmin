# StockBook Mobile — screen list for design

StockBook is inventory management for an HVAC contractor in Bangladesh (2 warehouses; LG, Daikin and Dunham-Bush air conditioners, pipes and accessories). The mobile app uses the same backend (`/api/v1`) as the website. It is built for people on their feet: store staff in the warehouse, managers approving on the go, and accounts checking costs.

Use this document to generate the screen designs. Each screen has an ID (e.g. `S-05`) so designs and code can refer to it.

---

## 1. Users and what they need on mobile

| Role | Who | Main mobile jobs | Sees prices / costs? |
|---|---|---|---|
| **Store Manager** | Warehouse staff | Receive goods, issue to projects, transfers, counts, scan serials, photograph documents | **Never** (no cost, price, value or margin anywhere) |
| **Manager** | Operations manager | Approve stock entries, follow projects, add labour / transport costs | Costs yes, margins no, overheads no |
| **Accounts** | Accountant | Approve entries, add import documents and landed cost, overheads, reports | Costs, profit; overheads yes; margins no |
| **Admin** | Owner | Everything | Everything |

Each user only sees the warehouses assigned to them (A, B or both) and only the menus their role allows. **Every screen that shows money needs a "no cost" variant** where those fields are simply absent (not blank, not "hidden").

**Stays on the website only** (no mobile screens): users & roles editor, catalog Excel import / export, opening-stock import, inventory and purchasing settings, scheduled report emails, purchase order creation and amendment, inventory settings.

---

## 2. Design system (match the website)

- **Style:** clean, calm, data-dense but readable, warm neutral background. Carbon-like: flat surfaces, thin borders, no heavy shadows, no gradients.
- **Font:** Geist (UI), Geist Mono for codes and document numbers (e.g. `GRN-I-2627-0001`, `PRJ-001`, serials, product codes).
- **Colours:**
  - Background `#FBFAF8` · surface `#FFFFFF` · surface-2 `#F6F5F2` · surface-3 `#EEEDE9` · border `#E9E7E2`
  - Text `#1D1C1A` · secondary `#57544E` · placeholder `#6B6760`
  - Primary / accent `#4B5BD6` (buttons, links, focus, active tab) · on-accent `#FFFFFF`
  - Green `#25754B` (posted, done, in stock) · Amber `#8F5E0E` / warning `#C88A14` (pending, low stock) · Red `#B23C30` (rejected, errors, negative margin) · Blue `#3570C4` (info, transfers) · Violet `#7652C2` (overheads)
  - Tags use a soft tint of their colour as background with the strong colour as text.
- **Radius:** 6 px for cards, inputs and buttons; fully round for tags / pills and the FAB.
- **Spacing:** 4 · 8 · 12 · 16 · 24 · 32 px. Screen padding 16 px.
- **Inputs:** filled field (surface-2) with a bottom border, label above, helper / error text below.
- **Money:** BDT with the taka sign, Indian grouping: `৳ 12,50,000.00`. Quantities up to 3 decimals, trailing zeros hidden (`10`, `2.5`). Dates `05 Nov 2026`, times in Asia/Dhaka.
- **Status tags** (pill): Draft gray · Pending amber · Posted green · Rejected red · Cancelled gray · Reversed violet · Dispatched blue · Received green.
- **Touch:** targets ≥ 44 px; primary action as a full-width bottom button; destructive actions need a confirm sheet with a reason field where the app requires one.
- **Light theme first.** A dark theme is optional.

### Reusable components to design once
App bar (title, back, actions) · bottom tab bar · search bar with filter button · filter bottom sheet · list row / card · KPI tile · status tag · checklist pill ("BL · Done") · amount row (label left, value right) · stepper (− qty +) · product picker (search + scan) · scanner overlay · photo / file uploader with progress bar · file thumbnail card (image or PDF icon) · timeline (who, what, when) · reason sheet (text area + confirm) · empty state · loading skeleton · error banner · warning notification · offline banner · success toast.

---

## 3. Navigation

**Bottom tab bar (5 tabs, shown by role):**
1. **Home** (dashboard)
2. **Stock** (entries, levels, counts)
3. **Scan** (big centre button: barcode / serial scanner)
4. **Approvals** (pending verification; badge with count) — Store Managers see **Projects** or **Counts** here instead
5. **More** (projects, purchases, warehouse costs, reports, serials, customers, notifications, profile)

A notification bell with an unread badge sits in the Home app bar. A floating **+** button on Home and Stock opens "New entry".

---

## 4. Screens

### A. Start

**S-01 Splash** — logo "StockBook", company name, loading indicator.

**S-02 Login**
- Username, password (show / hide), "Sign in" button.
- Error states: wrong password; account locked after 5 attempts ("Ask an Admin to set a new password"); account disabled.
- Note under the form: "Forgot your password? Ask your Admin." (there is no self-service reset).
- After sign-in: the warehouse(s) and role are shown briefly, then Home.

### B. Home

**S-03 Home / Dashboard** (content depends on role)
- Greeting, date, warehouse chips (A / B / All).
- **Quick actions** row: Receive goods · Issue to project · Transfer · Stock count · Scan.
- **KPI tiles** (2 per row; each opens a list or report):
  - Stock value (cost only) · Low stock items · Waiting for my approval · Transfers to receive · Open POs · Overdue POs · Running projects
  - Overheads only: Overheads this month · Not yet charged to projects
- **Charts** (simple, scrollable): stock value by brand (quantity for no-cost users), stock in vs out last 30 days, top issued products this month, project cost vs contract (margin users only).
- **Lists:** my pending approvals (top 5), transfers to receive, low stock top 5, my recent entries, recent activity.
- Store Manager variant: no money anywhere; tiles are counts and quantities.

**S-04 Notifications inbox**
- List grouped by Today / Earlier: icon by type (approval needed, rejected, low stock, transfer to receive, PO overdue, project cost alert 90% / 100%), title, short text, time, unread dot.
- Tap opens the linked screen. "Mark all as read".

**S-05 Notification settings** — per type: in-app on/off, email on/off.

### C. Scan

**S-06 Scanner**
- Full-screen camera with a framing box, torch toggle, manual entry field ("Type code, barcode or serial").
- Recognises product barcodes, product codes and serial numbers.
- Result sheet slides up:
  - Product: photo, code, name, brand, stock per warehouse, buttons "View product", "Add to entry".
  - Serial: serial, product, status (In stock / Issued / Sold / …), current location, buttons "View history".
  - Not found: "No product or serial matches", retry.
- Also used inside forms in "add lines" and "scan serials" mode (multi-scan with a running list and a "Done (12)" button).

### D. Products & stock levels

**S-07 Product list**
- Search (name, code, barcode), filter sheet: brand (LG / Daikin / Dunham-Bush), category (Split AC, Cassette AC, Ducted AC, VRF / VRV, Chiller, FCU, AHU, Accessories, Piping, Electrical, Controls), status (Active / Discontinued), "in stock only".
- Rows: thumbnail, code (mono), name, brand · category, total available, small "Low" tag if below minimum, unit.

**S-08 Product detail**
- Photo gallery (swipe), code, name, brand, category, unit, barcode, serial-tracked tag, Discontinued tag.
- **Stock card:** per warehouse good / damaged / reserved / available / in transit; minimum level.
- Selling price (everyone with catalog access); purchase / average cost and stock value (cost users only).
- **Ledger** (recent movements): date, entry number, type, in / out quantity, balance after (and cost for cost users). "See all" opens a full list.
- Actions: "Issue", "Transfer", "Count" shortcuts.

**S-09 Stock levels** — list of products with good / damaged / reserved / available per warehouse; filters: warehouse, brand, category, below minimum; stock value column for cost users.

**S-10 Low stock** — products below minimum: available vs minimum, short by, suggested order quantity; select several and "Create PO" (opens the web for full PO editing, or a simple draft PO confirm sheet for purchasing users).

### E. Stock in / out (entries)

Entry types and their badges:
| Type | Code | Direction |
|---|---|---|
| GRN · Imported | `GRN-I` | In |
| GRN · Local | `GRN-L` | In |
| Return from site | `RTN` | In |
| Issue to project | `ISS` | Out |
| Sale / delivery | `SAL` | Out |
| Return to supplier | `RTS` | Out |
| Damage / loss write-off | `DMG` | Out |
| Transfer | `TRF` | Move |
| Reversal / adjustment (system) | `REV` / `ADJ` | — |

**S-11 Entries list**
- Segments: All · Pending verification · My entries · To receive.
- Search (number, PO, invoice, BL, CI, B/E, container number); filter sheet: type, status, warehouse, project, customer, supplier, date range.
- Card: number (or draft ref), type badge, status tag, date, warehouse (→ destination for transfers), party (supplier / customer / project), item count + total quantity, total (cost users), import-document checklist pills on imported GRNs, paper-clip with file count.

**S-12 New entry — choose type** — a grid of the types above with icon, name and one-line meaning ("Goods arrived from abroad", "Material to a site", …). Types the user can't create are hidden.

**S-13 New entry — form** (one screen with sections, or 3 steps: Details → Products → Review)
- **Details** (fields depend on type):
  - Always: warehouse, date (today; can't be future).
  - GRN: supplier, purchase order (optional, "Receive against PO" pre-fills products and remaining quantities), supplier invoice no., LC no.; imported: currency + exchange rate (cost users only).
  - Issue / Return from site: project (Planning / Running only for issues), site address, received by, vehicle.
  - Sale: customer, phone, address, discount, VAT %.
  - Return to supplier: supplier, original GRN.
  - Write-off: reason (required).
  - Transfer: destination warehouse.
  - Notes.
- **Products:** "Add product" (search or scan), each line: product, quantity stepper, available-stock hint ("Available 12"), condition (Good / Damaged, where allowed), unit price (only where it applies and the user can see it), serial numbers ("Scan serials 3 / 5", required for serial-tracked items), origin (GRN Imported), remove.
- **Landed cost** (GRN Imported, cost users): charges list — customs duty %, AIT, import VAT, freight, insurance, C&F, other — % of goods or BDT amount, "include in cost" switch.
- **Live summary** (sticky at bottom or Review step): items, quantities, totals (cost users), next document number, warnings (not enough stock, below cost, serial count, stock count in progress, duplicate BL / CI / B/E).
- Buttons: "Save draft" · "Submit for verification" (or "Post" for FULL users).

**S-14 Import documents** (GRN · Imported; inside the form and on the entry detail)
- Header: "Import documents", help text "Enter each document's details and upload its file (PDF, JPG or PNG). Required before posting: Commercial Invoice and Bill of Entry."
- Checklist pills: BL · CO · PL · CI · B/E — green "Done" (number + file), gray "Missing", red outline when required and missing.
- One expandable card per document:
  - **BL — Bill of Lading:** BL no., BL date, shipping line, vessel / voyage, port of loading, port of discharge, container numbers (chips).
  - **CO — Certificate of Origin:** CO no., issue date, country of origin, issuing authority.
  - **PL — Packing List:** PL no., date, packages, gross weight kg, net weight kg.
  - **CI — Commercial Invoice:** CI no., CI date, currency, invoice value (cost users only), Incoterm (EXW / FOB / CFR / CIF / Other). "Required" tag.
  - **B/E — Bill of Entry:** B/E no., B/E date, customs station (Chattogram Custom House, Benapole, Dhaka ICD, Mongla, …). "Required" tag.
  - Upload area: **Take photo** (camera, primary on mobile) · Choose file. Per-file progress bar. Thumbnails / PDF cards with view and remove. "No file uploaded yet." Errors: wrong type, over 10 MB, more than 10 files.
- Warning box: what's still needed before posting, plus warnings (CI currency ≠ GRN currency, CI value off by > 1%, net weight > gross, B/E date before BL date, document number used on another GRN → link).

**S-15 Entry detail**
- Header: number, type badge, status tag, date, warehouse(s), party, PO link; BL no. and B/E no. for imported GRNs.
- Lines: product, quantity, condition, serials (expand), origin; prices / costs for cost users.
- Totals (cost users): goods, charges, VAT, grand total; profit for sales (profit users).
- Sections: Import documents (S-14, read-only unless allowed) · Attachments (challans, photos) · Timeline (created, submitted, approved / rejected with reason, posted, dispatched, received, reversed) · Related entries (returns, reversal, shortage write-off).
- Action bar (by permission and status): Edit · Submit · Post · **Approve & post** · Reject (reason) · Cancel · Reverse (reason) · Receive (transfer) · Print / share PDF (GRN, challan, invoice, notes).
- Disabled states with a short reason, e.g. "Approve disabled: Commercial Invoice and Bill of Entry missing", "You can't approve your own entry".

**S-16 Receive transfer** — dispatched lines with sent quantity and a "received" stepper; serial check-list for tracked items; note; shortage warning ("2 short → booked as damaged with a write-off for verification"); "Confirm receipt".

**S-17 Reason sheet** (shared) — title ("Reject entry", "Reverse entry", "Void cost", …), required text area (min 3 characters), confirm button in the right colour (red for destructive).

### F. Approvals

**S-18 Approvals inbox** (APPROVE users)
- Everything waiting for me: stock entries, stock counts, purchase orders, transfers — grouped by type with counts.
- Card: number, type, created by, warehouse, items, value (cost users), waiting for N days, document checklist pills for imported GRNs.
- Swipe or buttons: Open · Approve · Reject. Approve is blocked (with the reason) when import documents are missing.

### G. Stock counts

**S-19 Count list** — counts by status (Draft, Counting, Submitted, Approved, Cancelled), warehouse, scope, progress (counted / total lines).

**S-20 Counting screen**
- Header: count number, warehouse, blind-count badge (system quantity hidden).
- Filter chips: All · Not counted yet · Recount · Done. Search / scan to jump to a product.
- Line: product, location hint, unit, counted quantity stepper or number pad, "Not counted = 0" option, note; tracked items: "Scan serials (found 8)".
- System quantity and variance only for approvers in non-blind counts.
- Bottom: "Submit count" (option: mark uncounted as zero).

**S-21 Count review** (approver) — variances per line (gain / loss, value for cost users), "Request recount" on selected lines, "Approve" (posts adjustments).

### H. Serial numbers

**S-22 Serial search** — search by full or partial serial, scan button, filters status / product / warehouse.

**S-23 Serial detail** — serial, product, status tag, current location (warehouse / project site / customer / supplier), B/E no. and origin it came in on, history timeline (each entry with from → to status and location).

### I. Purchases

**S-24 Purchase orders** — list by status (Draft, Pending, Approved, Sent, Partly received, Received, Closed, Cancelled), overdue tag; card: PO number, supplier, type (Imported / Local), expected date, received %, total (cost users).

**S-25 PO detail** — supplier, terms, lines with ordered / received / pending, GRNs received against it, timeline; actions by permission: Approve, Reject, Mark sent, **Receive goods** (opens S-13 pre-filled), share PDF.

### J. Projects

**S-26 Project list**
- Status chips with counts (Planning, Running, On hold, Completed, Closed).
- Card: code (mono), name, client, status, start date, site engineer; cost figure: **Full cost · incl. overheads** (overhead users) or Total cost (others); progress bar of cost used vs contract (margin users).

**S-27 Project detail**
- Header: code, name, client, status tag, site, supplying warehouse, site engineer, dates.
- **Tiles:**
  - Everyone with costs: Material · Labour · Transport · Other · Total / Direct cost
  - Overhead users add: Store charge · Holding cost · Established cost · Overheads · **Full cost** (blue border)
  - Margin users: Contract value · Margin (on full cost for overhead users, with "Direct margin ৳…" in small text) · cost-used bar (90% / 100% markers)
- Tabs: **Material** · **Other costs & overheads** · **Movements** · **Files** · **Activity**.
- Actions: Issue material · Return from site · Add cost · Change status (with reason where needed) · Cost statement PDF.

**S-28 Material tab** — per product: issued, returned, net used, net cost (cost users), serials still at site.

**S-29 Costs tab ("Other costs & overheads")**
- List: date, category tag (Labour blue, Transport green, Other gray, overheads purple), description, payee, amount, receipt count; overhead rows show period and basis note.
- Row actions: Edit (overheads only), History, Void (reason).
- Subtotals per category at the bottom.

**S-30 Add / edit cost sheet**
- Category (Labour / Transport / Other; Store charge / Holding cost / Established cost only for overhead users), date, description, amount, payee, reference, receipt photo.
- Overheads add: period from / to (months), basis note, reason (required when the project is Closed, or on edit).
- Non-blocking warnings: "Above ৳ 10,00,000", "Overheads above 30% of direct cost".

**S-31 Cost history sheet** — timeline: Created / Edited (old → new amount and changed fields) / Voided, who, when, reason.

### K. Warehouse costs (overheads; Admin and Accounts)

**S-32 Warehouse cost entries**
- Filters: month range, warehouse / Company, category, include voided.
- Card: month, warehouse or "Company", category tag (Store charge blue, Holding green, Established purple), description, payee, amount, receipts, created by; voided cards struck through with the reason.
- Total for the filter at the top. "+ Add cost".

**S-33 Add / edit warehouse cost** — scope (Warehouse / Company), warehouse, category (options follow the scope), month picker (no later than next month), amount, description, payee, reference, **receipt photo / file**, reason on edit.

**S-34 Monthly summary** — month range; bar chart of total overhead per month; per month: each warehouse (store charge, holding, total, average stock value, holding % of stock value), company established cost, month total; "Export Excel".

### L. Reports (users with Reports access)

**S-35 Reports catalog** — grouped list (Stock, Purchases, Projects, Sales & losses, Control) with the report name and a one-line description. 17 reports, including Stock summary, Stock movement, Stock aging, Low stock, Serial lookup, Open POs, Purchases by supplier, Price history, Import shipments, Project cost summary, Material by project, Sales, Damage & loss, Pending verification, Audit log, Warehouse holding cost, Overheads spent vs charged.

**S-36 Report viewer**
- Filter sheet (date range presets: this month, last month, last 30 days, custom; warehouse; brand; …).
- KPI / totals strip, chart (if any), then rows as cards on mobile (key columns visible, tap for all columns) with a "table view" toggle for landscape.
- Columns the role can't see are absent.
- "Export" → Excel or PDF → shows progress, then open / share the file.

### M. Customers & suppliers

**S-37 Customers / suppliers** — searchable list; detail with contact person, phone (tap to call), email, address; supplier: type (Local / Foreign), currency, brands, recent POs.

### N. More / profile

**S-38 More menu** — grid / list of the sections the role can open (Projects, Purchases, Warehouse costs, Reports, Serials, Customers, Low stock, Stock counts), then Notifications, Settings, Help.

**S-39 Profile & settings** — name, username, role, warehouses, permission summary; notification settings (S-05); theme; language (English / বাংলা, optional); app version; **Sign out**.

---

## 5. States every list / form needs
- **Loading:** skeleton cards.
- **Empty:** illustration-free, one line and an action ("No pending approvals. You're all caught up.").
- **Error:** banner with "Try again"; validation errors under each field.
- **No permission:** "You don't have access to this." with a back button.
- **Offline:** top banner "You're offline. Changes can't be saved." (posting needs the server; drafts can be kept on the device).
- **Business-rule errors** shown in plain words: not enough stock, entry date in the future, count in progress for this product, import documents missing, project closed.

## 6. Key flows to prototype
1. **Store Manager receives an imported shipment:** Home → Receive goods → GRN · Imported → pick PO → check quantities → scan serials → Import documents: fill BL and PL, take photos → Submit.
2. **Accounts completes and approves it:** notification → Approvals → open entry → add CI and B/E with photos → set landed-cost charges and customs rate → Approve & post.
3. **Issue material to a site:** Scan product → Add to entry → Issue to project → choose project → quantity → Submit → Manager approves.
4. **Monthly stock count:** Stock → Counts → Start → scan and count → Submit → approver reviews variances → Approve.
5. **Accounts month-end overheads:** More → Warehouse costs → Add cost (rent, Warehouse A, photo of bill) → Monthly summary → Projects → project → Add cost → Store charge.

## 7. Tips for generating the designs
- Generate each screen at **390 × 844** (iPhone 14/15) in a light phone frame; design the Store Manager (no cost) and Admin (all costs) variants for S-03, S-08, S-13, S-15 and S-27.
- Keep it consistent: same app bar, bottom tab bar, card style, tag colours and spacing on every screen.
- Use realistic data: products like "LG Dual Inverter split AC 1.5 Ton" (code `LG-S4-Q18KL3AA`), "Daikin VRV round-flow cassette 7.1 kW", "Copper pipe 1/2 in"; suppliers "Daikin Airconditioning (Thailand)", "LG Electronics Bangladesh"; project "PRJ-001 Gulshan Office VRF"; amounts in ৳ with Indian grouping.
