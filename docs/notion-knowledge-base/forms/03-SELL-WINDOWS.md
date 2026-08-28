# Sell windows — Quote → Receipt (+ shipping)

Deep status/handoff narrative: `../13-DEEP-SELL-QUOTE-TO-RECEIPT.md`  
Header fields: `01-FORMFIELDS-REGISTRY.md` · Lines: `02-LINE-COLUMNS.md`

---

## Quotation — `/app/quotation/quotations` · `quo_quotation`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | order_date, partner, location-out, tax, currency (+ optional PIC, validity, terms, notes, project, progress) |
| **Lines** | item, qty, prices/tax columns, planned serials |
| **Statuses** | progress: unconfirmed → in_progress → completed · voucher: none/partial/completed |
| **Gates** | Attachment policy may block progress when ON · Convert → SO updates voucher |
| **Stock** | None |

---

## Sales Order — `/app/sales-order/sales-orders` · `so_sales_order`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | order_date, partner, location-out, tax, currency (+ due/delivery, PIC, ref, notes, delivery remarks, terms, MOP, project) |
| **Lines** | item, qty, tax/price columns |
| **Statuses** | progress: unconfirmed / in_progress / completed · fulfillment: none/partial/completed |
| **Gates** | `sales_require_quotation` HARD when ON · credit limit when `sales_enforce_credit_limit` · SI-from-SO needs SO **completed** |
| **Stock** | On release / DR (mode-dependent), not on save |

---

## Pick / Release — `/app/sales-order/sales-orders/release`

| | |
|--|--|
| **Kind** | transaction · Form Settings **No** |
| **Fields** | SO lines + serial scan when tracked |
| **Gates** | Stock HARD · serial count HARD if tracked · `sales_require_so_approval` **advisory** · fork: `legacy_combined_so_release` |
| **Stock** | Combined: reserve/issue per mode · Split: release reserves |

---

## Delivery notes — `/app/sales-order/delivery-receipts`

| | |
|--|--|
| **Kind** | transaction · draft key `so_delivery_receipt` · Form Settings **No** |
| **Statuses** | draft → posted |
| **Gates** | Combined ≈ paperwork · Split: post lowers on-hand + reserved |
| **Header fields** | UNKNOWN exhaustive list — typically date, customer, SO link, lines |

---

## Shipping order — `/app/sales-order/shipping/orders`

| | |
|--|--|
| **Statuses** | draft \| confirmed \| shipped \| cancelled |
| **Fields** | UNKNOWN full form — Observed status enum (Pass 4) |
| **Gates** | Defaults draft; cancelled excluded from pickers |

---

## Delivery trip — `/app/sales-order/shipping/trips`

| | |
|--|--|
| **Statuses** | planned \| in_progress \| completed \| cancelled |
| **Fields** | UNKNOWN full form |

---

## Sales Invoice — `/app/sales/sales` · `sa_sales`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | order_date, partner, location, tax, currency (+ due, PIC, SI/DR no, terms, notes, project) |
| **Lines** | qty, tax, discount, serial/lot |
| **Sources** | SO / Quote / Shipping / direct (Load Slip) |
| **Statuses** | unconfirmed → Submit → e_approval → Approve → completed (reject → unconfirmed) · `invoicing_status` bool |
| **Gates** | Cannot PATCH straight to e_approval · SO completed HARD on SO path · qty ≤ released−inv or delivered−inv · `sales_require_so` / `sales_require_delivery_receipt` HARD when ON |
| **Stock** | SO-path: no stock deduct on SI (already released) · Direct/POS paths may deduct |

---

## Collective / Combined invoice — `/app/sales/collective-invoicing/list`

| | |
|--|--|
| **Statuses** | unconfirmed / e_approval / confirmed / cancelled |
| **Gates** | e_approval is **label only** (free PATCH) · confirm sets linked SI `invoicing_status=true` |
| **Fields** | Linked completed SIs — UNKNOWN full header |

---

## Sales returns — `/app/sales/sales-returns`

| | |
|--|--|
| **Statuses** | draft → submitted (doc) |
| **Fields / gates** | UNKNOWN — backlog to mine modals |

---

## Official Receipt (collection) — see `06-ACCOUNTING-WINDOWS.md`

Applies to SI outstanding; no stock.

---

## Selling hubs / reports (no transaction form)

`/app/selling`, commissions, receivable-status, discount-status, print-slips, AR-by-customer, SI receipt status, pre-invoicing, price-batch, retainer/recurring/credit-notes — **Kind:** hub/report/config. Field depth **UNKNOWN** unless noted in module playbook.
