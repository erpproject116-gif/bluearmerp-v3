# Mgmt, GW, Data Center — breadth pass 1

**Audit status:** pass 1 — live crawl Jul 7 2026  
**Bluearm target:** HR/payroll, groupware, data import — mostly out of scope today

---

## Mgmt module

| Attribute | Value |
|-----------|-------|
| **Default prgId** | `C000131` |
| **Default screen** | Payroll Book (Manage Payroll subtree) |

### L0 tabs (header)

Setup · **Payroll** · HR · Day Laborer Payroll · Time Mgmt · e-Employment Contract

### Payroll → left sub-menu (partial)

Register Employee · Earnings · Deductions · Earnings/Deductions Groups · Department · Project · Approval Line for Print (Manage) · **Manage Payroll** · Payroll Book · Search Payroll by Employee · Payroll Status · Confirm Work Status

### Payroll Book — list

| Column | Notes |
|--------|-------|
| Payroll Period | |
| Payroll Frequency | |
| Payroll Book Name | |
| Payment Date | |
| Preliminary Work | |
| New Payroll | |
| Payroll Book | |
| Print Slip | |
| Employee No. | |

**Toolbar:** Search (F3), Option, Help, **New (F2)**, ECOUNT Web Uploader

**Empty state:** `No data has been registered.`

### Bluearm target

Future `/app/hr/payroll` — not in Bluearm ERP scope today.

---

## GW (Groupware) module

| Attribute | Value |
|-----------|-------|
| **Default prgId** | `C000007` |
| **Default screen** | e-Approval (blocked) |

### L0 tabs (header)

Share · **e-Approval** · Work · CRM · Project · Public Mail

### e-Approval — tenant state

**Not licensed:** *e-Approval does not have Task Authorization. To use the service, please contact your Company Master ID. (Not in Use GW)*

Sub-menu visible: Compose Draft · Track Request · All Submissions · Basic Information · Create Template · Approval Settings

### Bluearm target

Internal e-approval exists on sales (migration 128) — GW module is separate ECount product.

---

## Data Center module

| Attribute | Value |
|-----------|-------|
| **Default prgId** | `C001401` |
| **Default screen** | Register Collected Data |

### Left sub-menu

**Collect Data** · Register Collected Data · Collected Data · Collect Sales Slip · Collect Quotation · Collect Purchase Order

### Register Collected Data — list

| Column | Notes |
|--------|-------|
| Data Code | |
| Data Name | e.g. Sales Slip, 견적서, 발주서 |
| Progress Status | Registration complete. |
| Condition | |
| Connected Work | Collect Sales Slip / Quotation / PO |

**Toolbar:** Search (F3), Option, Help, New (F2), Delete Selected

Tenant has **3 registered collectors** (Sales Slip, Quotation, Purchase Order).

### Bluearm target

`/app/data-center` or import wizards — aligns with item/PO Excel import backlog.

## Tab pill checklist

- [x] Mgmt Payroll Book list structure
- [x] GW e-Approval license gate
- [x] Data Center collector list (3 rows)
- [ ] HR, Time Mgmt, CRM subtrees
- [ ] Data Center New (F2) collector setup form
