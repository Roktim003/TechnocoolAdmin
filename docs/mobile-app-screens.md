# StockBook Mobile — screen-by-screen design spec

StockBook is inventory management for an HVAC contractor in Bangladesh: 2 warehouses (A and B), LG, Daikin and Dunham-Bush air conditioners, copper pipe and accessories. The mobile app uses the same backend (`/api/v1`) as the website. It is for people on their feet: store staff in the warehouse, managers approving on the go, and accounts checking costs.

Every screen has an ID (`S-01` … `S-39`) so designs and code can refer to it. Each screen lists its **purpose**, **who can open it**, **where it opens from**, the **layout from top to bottom**, **fields**, **actions**, **role variants**, **states** and **sample data** for the mockup.

---

## 1. Users

| Role | Who | Main mobile jobs | Money they see |
|---|---|---|---|
| **Store Manager** | Warehouse staff | Receive goods, issue to projects, transfers, counts, scan serials, photograph documents | **None** — no cost, price, value or margin anywhere |
| **Manager** | Operations manager | Approve stock entries, follow projects, add labour / transport costs | Costs yes · margins no · overheads no |
| **Accounts** | Accountant | Approve entries, add import documents and landed cost, overheads, reports | Costs, profit, overheads · margins no |
| **Admin** | Owner | Everything | Everything |

- Users only see their own warehouses (A, B or both) and only the menus their role allows.
- **A field the user may not see is left out of the design, not blanked or masked.** Screens with money need a "no cost" variant.
- **Web only (no mobile screens):** users & roles editor, catalog Excel import / export, opening-stock import, inventory / purchasing settings, scheduled report emails, creating and amending purchase orders.

---

## 2. Design system (same as the website)

| Token | Value |
|---|---|
| Background | `#FBFAF8` |
| Surface (cards, sheets) | `#FFFFFF` |
| Surface-2 (fields, hover) | `#F6F5F2` |
| Surface-3 (selected) | `#EEEDE9` |
| Border | `#E9E7E2` |
| Text / secondary / placeholder | `#1D1C1A` / `#57544E` / `#6B6760` |
| Primary (buttons, links, active tab) | `#4B5BD6`, text on it `#FFFFFF` |
| Green — posted, done, in stock | `#25754B` |
| Amber — pending, low stock (warning `#C88A14`) | `#8F5E0E` |
| Red — rejected, errors, negative | `#B23C30` |
| Blue — info, transfers | `#3570C4` |
| Violet — overheads, reversed | `#7652C2` |

- **Font:** Geist for UI; **Geist Mono** for codes and numbers (`GRN-I-2627-0001`, `PRJ-001`, `LG-S4-Q18KL3AA`, serials).
- **Type scale:** screen title 20/28 semibold · section title 16/24 semibold · body 14/20 · caption 12/16 · KPI number 24/32 semibold.
- **Radius** 6 px (cards, inputs, buttons); pills and FAB fully round. **Spacing** 4 · 8 · 12 · 16 · 24 · 32; screen padding 16.
- **Style:** flat, calm, thin borders, no heavy shadows or gradients (Carbon-like).
- **Inputs:** filled field (surface-2) with a bottom border; label above; helper / error text below in red.
- **Tags:** soft tint background + strong colour text. Entry status: Draft gray · Pending amber · Posted green · Rejected red · Cancelled gray · Reversed violet · Dispatched blue · Received green.
- **Money:** `৳ 12,50,000.00` (Indian grouping). **Quantities:** up to 3 decimals, trailing zeros hidden. **Dates:** `05 Nov 2026`; times Asia/Dhaka.
- **Touch:** targets ≥ 44 px; primary action = full-width button pinned to the bottom; destructive actions open a confirm sheet (with a reason where required).

**Components to design once:** app bar · bottom tab bar · FAB · search bar + filter button · filter bottom sheet · list card · KPI tile · status tag · checklist pill · amount row · quantity stepper · product picker · scanner overlay · file uploader with progress · file thumbnail / PDF card · timeline · reason sheet · empty state · skeleton · error banner · warning box · offline banner · toast · segmented control · chip filter row.

---

## 3. Navigation

- **Bottom tab bar:** Home · Stock · **Scan** (raised centre button) · Approvals (badge) · More.
  - Store Manager: the 4th tab is **Counts** instead of Approvals.
- **App bar on Home:** company name, warehouse switcher chip, bell with unread badge.
- **FAB "+" on Home and Stock:** opens *New entry — choose type* (S-12).
- **Back** in the app bar on every screen below the tabs; bottom sheets close by swipe-down or ✕.

---

## 4. Screens

### A. Start

#### S-01 Splash
- **Purpose:** brand moment while the session is checked.
- **Layout:** centred StockBook logo mark and wordmark on the background colour; small spinner below; version at the bottom (caption, secondary).
- **Behaviour:** valid session → Home (S-03); otherwise → Login (S-02). Max ~1 s.

#### S-02 Login
- **Purpose:** sign in.
- **Layout:**
  1. Logo + "StockBook" title, subtitle "Inventory management" (or your company name).
  2. **Username** field.
  3. **Password** field with show / hide eye icon.
  4. **Sign in** button (full width, primary).
  5. Caption: "Forgot your password? Ask your Admin." (no self-service reset).
- **Fields:** username (text, required, lower-case, no spaces) · password (required, min 8).
- **States:**
  - Wrong username or password → red banner "Wrong username or password."
  - Locked after 5 failed attempts → "This account is locked. Ask an Admin to set a new password."
  - Disabled account → "This account is disabled."
  - Too many attempts → "Too many attempts. Try again in a few minutes."
  - Loading → button shows a spinner, fields disabled.
- **After sign-in:** a short toast "Signed in as Rahim · Store Manager · Warehouse A", then Home. The first time, ask for notification permission and register the phone for push (`POST /push-devices`; again on every app start).
- **Sample:** username `rahim.store`.

---

### B. Home

#### S-03 Home / Dashboard
- **Purpose:** what needs my attention today, and quick ways to start work.
- **Who:** everyone with Dashboard access; content depends on role.
- **Layout:**
  1. **App bar:** "Good morning, Rahim", date `Thu, 05 Nov 2026`; warehouse chip (A · B · All); bell icon with badge.
  2. **Quick actions** (horizontal row of round icon buttons with labels): Receive goods · Issue to project · Transfer · Stock count · Scan. Only the ones the user may do.
  3. **Attention banner** (only when needed, amber): "3 transfers waiting for you to receive" → S-11 *To receive*.
  4. **KPI tiles** (2 per row, tap → list or report):
     - Stock value `৳ 3,48,62,000` (cost users)
     - Low stock `14 items`
     - Waiting for my approval `6`
     - Transfers to receive `3`
     - Open POs `9` · Overdue POs `2` (red)
     - Running projects `7`
     - Overhead users: Overheads this month `৳ 12,40,000` · Not yet charged to projects `৳ 3,10,000`
  5. **Charts** (cards, swipeable carousel):
     - Stock value by brand (bar) — *Stock quantity by brand* for no-cost users
     - Stock in vs out, last 30 days (line)
     - Top 10 issued products this month (horizontal bars)
     - Project cost vs contract (stacked) — margin users only
     - Each chart has a "View as table" link.
  6. **My pending approvals** (top 5 cards + "See all").
  7. **Low stock** (top 5: product, available / minimum, short by).
  8. **My recent entries** (5) and **Recent activity** (10: "Karim approved GRN-L-2627-0042 · 10 min ago").
- **Role variants:**
  - Store Manager: no money anywhere. KPIs are Low stock, Transfers to receive, My drafts, My rejected entries. Charts show quantities.
  - Manager: no margin chart and no overhead tiles.
- **States:** skeleton tiles while loading; widget-level error "Couldn't load — Retry"; pull to refresh.

#### S-04 Notifications inbox
- **Purpose:** everything that happened that concerns me.
- **Opened from:** bell icon; push notification.
- **Layout:**
  1. App bar "Notifications", action "Mark all as read".
  2. Filter chips: All · Unread.
  3. List grouped **Today / Yesterday / Earlier**. Each row: type icon in a tinted circle · title (semibold when unread) · one-line body · time · unread dot.
- **Types and icons:**
  - Entry waiting for verification (clipboard, amber)
  - Your entry was approved (check, green) · rejected (x, red)
  - Transfer on its way (truck, blue) · received short (alert, amber)
  - Stock count waiting for approval · recount requested · count approved
  - Product below minimum (alert, amber)
  - PO waiting for approval · approved · rejected · goods received · fully received
  - Project cost near the contract value 90% / 100% (gauge, red)
  - Your project changed status
  - Scheduled report failed
- **Actions:** tap → linked screen (entry, count, PO, project) and marks it read. Tapping a push notification does the same (it carries the notification id and the link).
- **States:** empty → "No notifications yet."
- **Sample:** "GRN-I-2627-0003 is waiting for you to verify — submitted by Rahim, Warehouse A · 12 min ago".

#### S-05 Notification settings
- **Layout:** list of the types above; each row: label, one-line description, two switches **Push** and **Email** (in-app is always on; caption at the top says so). Daily digests (low-stock digest, overdue POs) have Email only.
- **Actions:** switches save immediately (toast "Saved").

---

### C. Scan

#### S-06 Scanner
- **Purpose:** find a product or serial by barcode / code, or add items to an entry fast.
- **Who:** everyone with stock access. **Opened from:** centre tab; "Scan" buttons inside forms.
- **Layout:**
  1. Full-screen camera with a rounded framing box and a moving scan line.
  2. Top bar: ✕ close · title (*Scan* / *Scan products* / *Scan serials for LG-S4-Q18KL3AA*) · torch toggle.
  3. Bottom: text field "Type code, barcode or serial" with a search button.
  4. In multi-scan mode: a counter chip "Scanned 8 / 12" and a list peek of the last items, plus a **Done** button.
- **Result sheet** (slides up after a single scan):
  - **Product:** photo, code (mono), name, brand · category, available per warehouse (A 12 · B 4), buttons **View product** and **Add to entry**.
  - **Serial:** serial (mono), product, status tag (In stock / Reserved / In transit / Issued / Sold / Returned to supplier / Written off / Damaged), location ("Warehouse A" / "Site: PRJ-001" / "Customer: Green Tower"), button **View history**.
  - **Not found:** "No product or serial matches `ABC123`." Buttons Retry · Search products.
- **Feedback:** short vibration + green flash on success; red flash and "Already scanned" for duplicates; "This serial isn't in Warehouse A" when it can't be used.
- **States:** camera permission denied → explanation with "Open settings" and manual entry.

---

### D. Products & stock

#### S-07 Product list
- **Purpose:** look up any product and its stock.
- **Layout:**
  1. App bar "Products", scan icon.
  2. Search bar ("Name, code or barcode") + filter button with a count badge.
  3. Brand chips row: All · LG · Daikin · Dunham-Bush.
  4. List cards: thumbnail (or package icon) · code (mono, caption) · name (2 lines max) · "Daikin · VRF / VRV" · right side: available quantity + unit (`12 pcs`), small amber **Low** tag when below minimum, gray **Discontinued** tag.
- **Filter sheet:** category (Split AC, Cassette AC, Ducted AC, VRF / VRV, Chiller, Fan coil unit, AHU, Accessories, Piping, Electrical, Controls) · status (Active / Discontinued) · In stock only · Serial-tracked only · warehouse.
- **States:** empty search → "No products match 'xyz'."; infinite scroll with a loading row.

#### S-08 Product detail
- **Layout:**
  1. Photo gallery (swipe, dots; tap to full screen). Placeholder icon when no photo.
  2. Code (mono) · name (title) · tags: brand, category, unit, **Serial tracked**, **Discontinued**.
  3. **Stock card** (table): rows Warehouse A / Warehouse B / Total; columns Good · Damaged · Reserved · Available · In transit. Minimum level line underneath ("Minimum 10 · short by 3" in amber when low).
  4. **Prices:** Selling price `৳ 78,000.00` (catalog users) · Average cost `৳ 61,240.5000` and stock value (cost users only).
  5. Details: barcode, model number, country of origin, default supplier, warranty notes.
  6. **Recent movements** (10): date · entry number (mono, link) · type badge · warehouse · `+10` green / `−4` red · balance after · cost (cost users). "See all" → full ledger list with date filter.
  7. In transit: transfers on the way (number, from → to, quantity).
- **Actions** (bottom bar): Issue · Transfer · Add to count — only where allowed.
- **Role variants:** Store Manager sees no price or cost rows and no cost column.
- **Sample:** `LG-S4-Q18KL3AA` "LG Dual Inverter split AC 1.5 Ton", A: 18 good / 1 damaged / 4 reserved → 14 available.

#### S-09 Stock levels
- **Purpose:** one list of what we hold.
- **Layout:** search + filters (warehouse, brand, category, condition, **Below minimum**, **In stock only**); cards: code · name · per-warehouse chips "A 14 · B 4" · damaged / reserved / in transit small text · total available (bold) · stock value (cost users). Sort: code, name, total.
- **Footer:** total stock value of the filter (cost users).

#### S-10 Low stock
- **Purpose:** what to reorder.
- **Layout:**
  1. Filters: warehouse, brand, category.
  2. Cards: product · available / minimum · **short by** (amber, bold) · suggested order quantity · default supplier.
  3. Selection checkboxes; bottom bar "Create PO (3)" for purchasing users.
- **Actions:** Create PO → confirm sheet listing the products grouped by supplier → "Create draft PO" → opens the PO (S-25) in Draft, with a note "Finish on the website".
- **States:** empty → green check icon + "Nothing below minimum."

---

### E. Stock in / out

Entry types used across these screens:

| Type | Number | Direction | Icon colour |
|---|---|---|---|
| GRN · Imported | `GRN-I-2627-0001` | In | green |
| GRN · Local | `GRN-L-…` | In | green |
| Return from site | `RTN-…` | In | green |
| Opening stock (FULL only) | `OPN-…` | In | green |
| Issue to project | `ISS-…` | Out | red |
| Sale / delivery | `SAL-…` | Out | red |
| Return to supplier | `RTS-…` | Out | red |
| Damage / loss write-off | `DMG-…` | Out | red |
| Transfer | `TRF-…` | Move | blue |
| Reversal / Adjustment (system) | `REV-…` / `ADJ-…` | — | violet / gray |

Numbers are given on submit or post (`2627` = fiscal year Jul 2026 – Jun 2027); drafts show a draft reference (`DRAFT-7K2QPM`).

#### S-11 Entries list
- **Layout:**
  1. App bar "Stock in / out", search icon, filter icon.
  2. Segmented control: **All · Pending · Mine · To receive** (badge counts).
  3. Search ("Number, PO, invoice, BL, CI, B/E or container no.").
  4. Cards:
     - Line 1: entry number (mono) · type badge · status tag on the right.
     - Line 2: date · warehouse (→ destination for transfers) · party (supplier / customer / project code).
     - Line 3: `4 items · 36 pcs` · total amount (cost users).
     - Imported GRNs: checklist pills `BL ✓ CO – PL ✓ CI – B/E –` and a paper-clip count.
     - Rejected: red one-line reason.
- **Filter sheet:** type (multi), status, warehouse, project, customer, supplier, product, date range, created by me.
- **Actions:** tap card → S-15; FAB → S-12.
- **States:** empty Pending → "Nothing waiting."; empty To receive → "No transfers on the way."

#### S-12 New entry — choose type
- **Layout:** title "What are you recording?"; groups **In**, **Out**, **Move**; each tile: icon, name, one line:
  - GRN · Imported — "Goods arrived from abroad"
  - GRN · Local — "Goods bought in Bangladesh"
  - Return from site — "Material back from a project"
  - Issue to project — "Material sent to a site"
  - Sale / delivery — "Goods sold to a customer"
  - Return to supplier — "Goods sent back to a supplier"
  - Damage / loss — "Write off broken or lost stock"
  - Transfer — "Move stock between warehouses"
- Types the user can't create are hidden. Opening stock is not offered on mobile.

#### S-13 New / edit entry form
- **Purpose:** record one stock movement.
- **Structure:** 3 steps with a progress header — **1 Details · 2 Products · 3 Review**. Draft saves at any step.
- **Step 1 — Details** (fields depend on type):

| Field | Types | Type of field | Required | Notes |
|---|---|---|---|---|
| Warehouse | all | select (my warehouses) | yes | "From" for transfers |
| Destination warehouse | Transfer | select | yes | must differ |
| Entry date | all | date | yes | today by default; not in the future |
| Supplier | GRN, Return to supplier | searchable select | yes | |
| Purchase order | GRN | searchable select | no | "Receive against PO" fills products, prices and remaining quantities |
| Supplier invoice no. | GRN | text | no | |
| LC no. | GRN Imported | text | no | |
| Currency · Exchange rate | GRN Imported | select · number | yes | rate only for cost users; from the PO when linked |
| Project | Issue, Return from site | searchable select | yes | issues: Planning / Running projects only |
| Original issue / GRN | Return from site / to supplier | select | no | limits quantities to what can still be returned |
| Customer · phone · address | Sale | select · text | yes · no · no | |
| Site address · received by · vehicle | Issue | text | no | |
| Discount · VAT % | Sale | money · % | no | VAT default 15 % |
| Reason | Write-off | text area | yes | |
| Notes | all | text area | no | |

- **Step 2 — Products:**
  - **Add product** button (search sheet with recent items) and **Scan** button.
  - Line card: thumbnail · code · name · **quantity stepper** with unit · hint "Available 14 in A" (red if not enough) · condition switch Good / Damaged (returns, write-offs, returns to supplier) · unit price (GRN, Sale; cost users / sales) · **Serials** button "Scan serials 3 / 5" (serial-tracked items; turns green when complete) · **Origin** (GRN Imported; prefilled, editable) · remove (trash) icon.
  - **Landed cost** section (GRN Imported, cost users): list of charges — Customs duty · AIT · Import VAT · Freight · Insurance · C&F · Other — each with "% of goods" or "BDT amount", value, "Include in cost" switch; add / remove charge.
  - **Import documents** section (GRN Imported) → S-14.
- **Step 3 — Review:**
  - Summary card: type, warehouse(s), party, date, next number ("Will be GRN-I-2627-0004").
  - Lines list (compact).
  - Totals (cost users): goods, charges in cost, charges not in cost, VAT, grand total; sale: subtotal, discount, VAT, total, profit (profit users).
  - **Warnings box** (amber): not enough stock · priced below cost · serial count doesn't match · a stock count is in progress for these products · import documents still needed.
  - Posting mode line: "This will be sent for verification" or "This will be posted now" (FULL users).
- **Bottom buttons:** **Save draft** (secondary) · **Submit for verification** or **Post** (primary). Post disabled with a reason when import documents are missing.
- **Role variants:** Store Manager never sees prices, rates, landed cost or totals; GRN lines show quantity only.
- **States:** field errors inline; server rule errors in a red banner at the top; unsaved-changes dialog on back.
- **Sample:** GRN · Imported, Warehouse A, Daikin Airconditioning (Thailand), PO-2627-0005, `DK-FXFQ63AVM` × 6, USD @ 122.50.

#### S-14 Import documents (GRN · Imported)
- **Purpose:** record the five shipment documents and their files.
- **Opened from:** S-13 step 2 and S-15 (section or full screen).
- **Layout:**
  1. Title "Import documents"; help text "Enter each document's details and upload its file (PDF, JPG or PNG). Required before posting: Commercial Invoice and Bill of Entry."
  2. **Checklist pills** (horizontal): `BL · Done` (green), `CO · Missing` (gray), `CI · Missing` (gray with red outline = required).
  3. Five **expandable document cards**. Header: name + code, "Required" red tag (CI, B/E), status pill, file count. Body:
     - **BL — Bill of Lading:** BL no. · BL date · shipping line · vessel / voyage · port of loading · port of discharge · container numbers (chip input: type + enter, × to remove)
     - **CO — Certificate of Origin:** CO no. · issue date · country of origin · issuing authority
     - **PL — Packing List:** PL no. · date · number of packages · gross weight (kg) · net weight (kg)
     - **CI — Commercial Invoice:** CI no. · CI date · currency · invoice value (cost users only) · Incoterm (EXW / FOB / CFR / CIF / Other)
     - **B/E — Bill of Entry:** B/E no. · B/E date · customs station (suggestions: Chattogram Custom House, Benapole, Dhaka ICD, Mongla)
     - **Upload area:** dashed box with upload icon, buttons **Take photo** (primary on phones) and **Choose file**; each file uploading shows name + progress bar; finished files show thumbnail (images) or PDF card, size, ✓, view, remove.
     - Empty: "No file uploaded yet."
  4. **Warning box:** "Needed before posting: Commercial Invoice — number and file; Bill of Entry — file." Plus other warnings: CI currency differs from the GRN · CI value differs by more than 1 % · net weight above gross · B/E date before BL date · "BL no. MAEU-240915377 is also on GRN-I-2627-0001" (link).
- **Upload errors** (red under the box): "Only PDF, JPG or PNG", "File is over 10 MB", "Up to 10 files per document".
- **Permissions:** editable by the creator (Draft / Pending / Rejected), a verifier (Pending), Admin (any time). Otherwise read-only with View / Download only.
- **Before the entry is saved:** the upload area says "Uploading saves this entry as a draft first."

#### S-15 Entry detail
- **Layout:**
  1. App bar: entry number (mono), overflow menu (Share PDF, Copy number).
  2. **Header card:** type badge · status tag · date · warehouse (→ destination) · party · PO link · created by · for imported GRNs **BL no.** and **B/E no.**
  3. **Rejected banner** (red) with the reason and who rejected; **Below-cost confirmed** note when relevant.
  4. **Lines:** product, quantity + unit, condition tag, serials (expand chips), origin; unit price / cost and amount (cost users); transfers: sent vs received.
  5. **Totals** (cost users).
  6. **Landed cost** charges (imported GRNs, cost users).
  7. **Import documents** (S-14, compact: pills + cards with file gallery).
  8. **Attachments** (challans, photos): grid of thumbnails + "Add".
  9. **Timeline:** Created · Submitted · Approved / Rejected (reason) · Posted · Dispatched · Received · Cancelled · Reversed (reason) — who and when.
  10. **Related:** returns against it, reversal, shortage write-off, original issue / GRN.
- **Action bar** (only what applies): Edit · Submit · Post · **Approve & post** · Reject · Cancel · Reverse · Receive · Set landed cost (verifier with cost) · Print (GRN / challan / invoice / note → PDF share sheet).
- **Disabled reasons** shown under the button: "Commercial Invoice and Bill of Entry missing" · "You can't approve your own entry" · "Not your warehouse".
- **Role variants:** Store Manager: no prices, totals, landed cost or CI value.

#### S-16 Receive transfer
- **Purpose:** confirm what arrived at the destination warehouse.
- **Layout:** header (TRF number, from → to, dispatched by / when); line cards: product · sent `10` · **received** stepper (default = sent) · serial checklist for tracked items (tick or scan the ones that arrived); notes field.
- **Shortage box** (amber, when received < sent): "2 pcs short of LG-S4-Q18KL3AA → booked as damaged with a write-off for verification."
- **Button:** **Confirm receipt**.

#### S-17 Reason sheet (shared)
- **Used for:** reject entry, reverse entry, cancel, void cost, remove a file from a posted entry, project status changes, edit on a closed project.
- **Layout:** title ("Reject GRN-L-2627-0042?"), one line of impact ("The reserved stock is released and Rahim can edit and resubmit."), **Reason** text area (required, min 3 characters, counter), buttons **Cancel** and **Reject** (red for destructive, primary otherwise).

---

### F. Approvals

#### S-18 Approvals inbox
- **Who:** inventory APPROVE users (Accounts, Manager, Admin).
- **Layout:**
  1. Segmented: **Stock entries · Counts · Purchase orders** with counts.
  2. Cards: number · type · created by · warehouse · items · value (cost users) · "waiting 2 days" (amber after 2 days) · checklist pills for imported GRNs · "Below cost" tag for sales.
  3. Each card: **Open**, and quick **Approve** / **Reject** buttons.
- **Rules shown in UI:** Approve disabled with reason when import documents are missing or it's your own entry; Reject opens S-17.
- **States:** empty → "You're all caught up."

---

### G. Stock counts

#### S-19 Count list
- **Layout:** segmented **Active · Done**; cards: count number (`CNT-2627-0003`) · warehouse · scope (All products / Brand LG / Category Piping / Selected products) · status tag (Draft, Counting, Submitted, Approved, Cancelled) · **progress bar** "86 / 120 counted" · blind-count badge · started by / date.
- **Actions:** **New count** (warehouse, scope, blind count switch, notes) → S-20.

#### S-20 Counting screen
- **Layout:**
  1. App bar: count number, warehouse; overflow: Print count sheet.
  2. Progress bar + chips: All · **Not counted yet** · Recount · Done.
  3. Search / scan to jump to a product.
  4. Line cards: product code + name · unit · **counted quantity** (big number input with stepper) · "Not counted = 0" checkbox · note; serial-tracked: "Scan serials — found 8" (list of found serials); recount lines highlighted amber with the approver's note.
  5. System quantity and variance are **not shown** in blind counts; in normal counts only approvers see them.
- **Bottom:** **Submit count** → sheet with "Mark 4 uncounted lines as zero?" switch.

#### S-21 Count review (approver)
- **Layout:** summary (lines, with variance, gain value, loss value, net — values for cost users); filter **Only variances**; line cards: product · system · counted · variance `+2` green / `−3` red · value; checkboxes.
- **Actions:** **Request recount** (selected lines + note) · **Approve** (posts the adjustments; confirm sheet showing net value).

---

### H. Serial numbers

#### S-22 Serial search
- **Layout:** search ("Serial or part of it") + scan button; filters status, product, warehouse; result cards: serial (mono) · product · status tag · location.

#### S-23 Serial detail
- **Layout:**
  1. Serial (mono, large) · product (link) · status tag.
  2. **Current location** card: warehouse / project site / customer / supplier.
  3. **Came in on:** GRN number (link), date, **B/E no.**, **country of origin**.
  4. **History timeline:** each step — date · entry number · status from → to · warehouse / site.

---

### I. Purchases

#### S-24 Purchase orders
- **Who:** purchasing VIEW and above (not Store Manager).
- **Layout:** status chips — Draft · Waiting approval · Rejected · Approved · Sent · Partly received · Fully received · Closed · Cancelled; search (PO number, supplier, quote ref); cards: PO number (`PO-2627-0005`) · supplier · Imported / Local tag · expected date (red **Overdue** tag when past) · received progress `4 / 6` · total (cost users).

#### S-25 PO detail
- **Layout:**
  1. Header: number, status, supplier, type, currency + rate, deliver to warehouse, expected delivery, quote ref.
  2. Lines: product · ordered · received · pending (on GRNs waiting for approval) · remaining · unit price (cost users).
  3. Totals (cost users): subtotal, discount, VAT, total, total in BDT.
  4. **GRNs received** against it (cards linking to S-15).
  5. Terms (collapsible), attachments, timeline (submitted, approved / rejected with reason, sent, amended, received, closed).
- **Actions** (by permission / status): Approve · Reject · Mark sent · **Receive goods** (opens S-13 prefilled) · Share PDF.

---

### J. Projects

#### S-26 Project list
- **Layout:**
  1. Status chips with counts: Planning · Running · On hold · Completed · Closed.
  2. Search (code, name, client); filter: type, warehouse, site engineer, start date.
  3. Cards: code (mono) · name · client · status tag · type · site engineer · start → expected end; cost line:
     - overhead users: **Full cost** `৳ 31,25,000` with caption "incl. overheads"
     - others with cost: **Total cost**
     - margin users: progress bar "cost used 62 % of contract" (amber ≥ 90 %, red ≥ 100 %).
- **Role variants:** Store Manager usually has no Projects menu.

#### S-27 Project detail
- **Layout:**
  1. Header: code · name · status tag · client (call / email icons) · site address (map icon) · supplying warehouse · site engineer · dates.
  2. **Cost tiles** (2 per row):
     - Material · Labour · Transport · Other · **Direct cost** (or *Total cost*)
     - overhead users: Store charge · Holding cost · Established cost · Overheads · **Full cost** (blue border)
  3. **Contract & margin** card (margin users): contract value · margin (on full cost for overhead users) with "Direct margin ৳ 9,40,000 (18.8 %)" in small text · cost-used bar with 90 % and 100 % markers.
  4. Tabs: **Material · Other costs & overheads · Movements · Files · Activity**.
- **Actions:** Issue material · Return from site · Add cost · Change status (sheet listing allowed moves: Start, Put on hold, Resume, Mark completed, Reopen, Close — reasons where required) · Cost statement PDF (cost users).

#### S-28 Material tab
- **Layout:** product cards: code · name · issued · returned (incl. damaged) · **net used** · net cost (cost users) · "Serials at site: 4" (expand chips). Totals at the bottom (cost users).

#### S-29 Other costs & overheads tab
- **Layout:**
  1. Filter chips: All · Labour · Transport · Other · Overheads (overhead users) · Show voided.
  2. Cost cards: date · category tag (Labour blue, Transport green, Other gray, Store charge / Holding / Established purple) · description · payee · reference · amount · receipts count; overhead cards also show period (`Sep → Oct 2026`), basis note ("2 % of material issued") and "Edited by Nadia"; voided cards struck through with the reason.
  3. Row actions: **Edit** (overheads only) · **History** · **Void**.
  4. **Subtotals** card: Labour · Transport · Other · Direct total · Store charge · Holding · Established · Overheads total.
- **Button:** **Add cost** → S-30.

#### S-30 Add / edit cost (sheet)
- **Fields:**

| Field | Required | Notes |
|---|---|---|
| Category | yes | Labour · Transport · Other; overhead users also Store charge · Holding cost · Established cost |
| Date | yes | today by default |
| Description | yes | |
| Amount (৳) | yes | > 0 |
| Payee / vendor | no | |
| Reference no. | no | |
| Period from / to (months) | no | overheads only |
| Basis note | no | overheads only, e.g. "2 % of material issued" |
| Reason | on Closed projects and on edits | |
| Receipt photo / file | no | camera or file |

- **Warnings** (amber, not blocking): "Above ৳ 10,00,000 — check the amount" · "Overheads are above 30 % of this project's direct cost".
- **Buttons:** Cancel · **Save**.

#### S-31 Cost history (sheet)
- **Layout:** timeline: **Created** (amount, by, when) → **Edited** (`৳ 300.00 → ৳ 350.00`, other changed fields "Description: Security → Security and insurance", reason) → **Voided** (reason).

---

### K. Warehouse costs (overheads — Admin, Accounts)

#### S-32 Warehouse cost entries
- **Layout:**
  1. App bar "Warehouse costs", subtitle "Monthly store charge, holding cost and company overhead"; segmented **Entries · Monthly summary**.
  2. Filters: month range, Warehouse A / B / Company, category, include voided, search.
  3. **Total** card for the filter: `৳ 12,40,000.00`.
  4. Cards: month (`Nov 2026`) · warehouse or **Company** · category tag (Store charge blue, Holding green, Established purple) · description · payee · created by · amount · receipts (paper-clip count); voided: struck through + reason.
  5. Row actions: Edit · History · Void.
- **FAB:** **+ Add cost** → S-33.

#### S-33 Add / edit warehouse cost
- **Fields:** Scope (Warehouse / Company, segmented) · Warehouse (Warehouse scope only) · Category (Warehouse: Store charge / Holding cost; Company: Established cost) · Month (month picker, up to next month) · Amount · Description · Payee / vendor · Reference · **Receipt** (take photo / choose file) · Reason (on edit).
- **Warnings:** amount above ৳ 10,00,000.
- **Buttons:** Cancel · **Save**.

#### S-34 Monthly summary
- **Layout:**
  1. Month range picker (default last 6 months); **Export Excel** button.
  2. **Bar chart:** total overhead per month (stacked: store charge, holding, established).
  3. One card per month: Warehouse A (store charge · holding · total · average stock value · **holding % of stock value**) · Warehouse B (same) · Company established cost · **Month total**.
  4. Period total at the bottom.

---

### L. Reports

#### S-35 Reports catalog
- **Who:** Reports VIEW (Admin, Accounts by default).
- **Layout:** groups with report cards (name, one-line description, chevron):
  - **Stock:** Stock summary · Stock movement · Stock aging · Low stock · Serial number lookup · Warehouse holding cost
  - **Purchases:** Open POs & pending deliveries · Purchases by supplier · Price history · Import shipments
  - **Projects:** Project cost summary · Material by project · Overheads: spent vs charged to projects
  - **Sales & losses:** Sales report · Damage & loss
  - **Control:** Pending verification · Audit log
- Reports the user can't run are hidden.

#### S-36 Report viewer
- **Layout:**
  1. App bar: report name; **Filters** button (badge with count); **Export** button.
  2. Active filter chips (removable).
  3. **Totals strip** (scrollable KPI chips).
  4. **Chart** card (if the report has one) with "View as table".
  5. **Rows as cards:** 3–4 key columns visible, tap to expand all columns; links (entry, project, PO) open the matching screen. Landscape: real table with sticky first column.
  6. Pagination ("Load more").
- **Filter sheet:** date presets (Today, This month, Last month, Last 30 days, This fiscal year, Custom) · warehouse · brand · category · product · supplier · customer · project · status — depending on the report.
- **Export sheet:** Excel / PDF → progress → "Ready" → Open / Share. Note: "Files only include the columns you can see."
- **Role variants:** cost / profit / margin / overhead columns are absent for users without them.

---

### M. Customers & suppliers

#### S-37 Customers / suppliers
- **Layout:** segmented **Customers · Suppliers**; search; cards: name · contact person · phone; suppliers add code, Local / Foreign tag, currency, brands supplied.
- **Detail:** contact block with tap-to-call / email / map; supplier: payment terms, recent POs (links), price history (cost users); customer: recent sales.
- Read-only on mobile.

---

### N. More & profile

#### S-38 More menu
- **Layout:** grid of large tiles for sections the role can open — Projects · Purchases · Warehouse costs · Reports · Products · Stock levels · Low stock · Stock counts · Serial numbers · Customers & suppliers; then list rows: Notifications · Settings · Help · About.

#### S-39 Profile & settings
- **Layout:**
  1. Avatar (initials), name, username, role tag, warehouses chips.
  2. **My access:** compact list "Stock in / out — Create", "Projects — None", flags "Sees cost: No".
  3. Settings rows: Notifications (→ S-05) · Theme (Light / Dark / System) · Language (English / বাংলা, optional) · Scanner sound & vibration.
  4. About: app version, server, "Terms".
  5. **Sign out** (red text button) → confirm. Stops push to this phone first (`DELETE /push-devices/{id}`).

---

## 5. States every list and form needs
- **Loading:** skeleton cards (not spinners) for lists; button spinners for actions.
- **Empty:** one line + an action, no illustrations ("No pending approvals. You're all caught up.").
- **Error:** inline banner "Couldn't load. Try again."; field errors under each field in red.
- **No permission:** "You don't have access to this." + Back.
- **Offline:** top banner "You're offline. Changes can't be saved." Drafts can be kept on the device.
- **Business rules** in plain words: "Only 4 of LG-S4-Q18KL3AA available in Warehouse A", "The entry date can't be in the future", "A stock count is in progress for these products", "Import documents missing: Commercial Invoice, Bill of Entry", "Project PRJ-002 is closed".
- **Success:** toast ("Submitted for verification", "Posted GRN-L-2627-0042").

## 6. Key flows to prototype
1. **Store Manager receives an imported shipment:** Home → Receive goods → GRN · Imported → pick PO → check quantities → scan serials → Import documents: BL and PL with photos → Submit.
2. **Accounts completes and approves it:** notification → Approvals → open entry → add CI and B/E with photos → landed-cost charges and customs rate → Approve & post.
3. **Issue material to a site:** Scan → Add to entry → Issue to project → choose project → quantity → Submit → Manager approves from Approvals.
4. **Monthly stock count:** Counts → New count → scan and count → Submit → approver reviews variances → Approve.
5. **Month-end overheads:** More → Warehouse costs → Add cost (rent, Warehouse A, photo of bill) → Monthly summary → Projects → project → Add cost → Store charge.

## 7. Tips for generating the designs
- Frame size **390 × 844** (iPhone 14/15), light phone frame.
- Design two variants for S-03, S-08, S-13, S-15 and S-27: **Store Manager (no money)** and **Admin (everything)**.
- Keep one app bar, one tab bar, one card style and the same tag colours on every screen.
- Realistic data:
  - products: "LG Dual Inverter split AC 1.5 Ton" (`LG-S4-Q18KL3AA`), "LG Multi V ceiling cassette 2.0 Ton" (`LG-ARNU24GTRB4`), "Daikin VRV round-flow cassette 7.1 kW" (`DK-FXFQ63AVM`), "Copper pipe 1/2 in, soft drawn" (`PIPE-CU-12.7`)
  - suppliers: Daikin Airconditioning (Thailand), LG Electronics Bangladesh, Dunham-Bush (Malaysia), Nawabpur Pipe & Fittings
  - customer: Green Tower Developers Ltd.
  - projects: PRJ-001 Gulshan office VRF, Banani Retail Mall — split AC fit-out, Uttara Residence — ducted AC
  - people: Rahim (Store Manager), Karim (Manager), Nadia (Accounts)
  - amounts in ৳ with Indian grouping.
