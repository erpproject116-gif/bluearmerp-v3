# Inv. I → Reports → Production/Outsourcing subtree (pass 12)

**Audit date:** Jul 7 2026 (pass 12)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Production/Outsourcing  
**Bluearm target:** `/app/job-costing/reports` (proposed)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Notes |
|--------|-------|---------|-------|
| Job Order Status | `E040413` | MENUTREE_000531 | Details/Summary/by Line; delivery date range |
| Progress Status by J/O | `E040414` | MENUTREE_000532 | Four progress type radios |
| Goods Issued Status | `E040409` | MENUTREE_000533 | Mirror J/O status pattern |
| Goods Receipt Status | `E040410` | MENUTREE_000534 | + Payable No. + GR I/II/III filters |

**Catalog only (not opened pass 12):** Job Record Status `E040432` · Goods Receipt/Consumed Status I `E040415`

---

## Job Order Status (`E040413`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040413&menuSeq=MENUTREE_000531`

Line-level or summarized **job order** inquiry over a date range.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

**Details** (default) · Summary · **by Line** button

Comparison Period options (in All drawer): Do Not Use · Same Period Prev. Year/Month/Week/Day · Horizontal View · Display Ratio · Including Code

### Option panel sections

Date (default **This Month (~ Today)** Jul 2026) · **Job Order No.** · **Delivery Date** (range with ==/==== operators) · Location · Customer · Item (category sub-filters + e-Approval status All/e-Approval/Unconfirmed/Confirm) · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings · **View as Graph**

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Progress Status by J/O (`E040414`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040414&menuSeq=MENUTREE_000532`

**Progress dashboard** by job order — production vs goods issued vs standard usage vs job progress.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

**Production Progress Status** (default) · Goods Issued Progress Status · Std. vs. Act. Usage Status · Job Progress Status

### Option panel sections

**Base Date (Business Cycle)** (default This Month ~ Today Jul 2026) · Job Order No. · Location · Customer · Item (category sub-filters) · PIC · PIC for Customer/Vendor (e-Approval status filters) · Template · Display Apvl. Line · **View as Graph**

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Goods Issued Status (`E040409`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040409&menuSeq=MENUTREE_000533`

Mirror of transactional status reports (Sales/Purchase Status pattern) for **goods issued** documents.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

**Details** (default) · Summary · **by Line** · Comparison Period options (same family as J/O Status)

### Option panel sections

Date (This Month ~ Today) · **Goods Issued No.** · Location · Project · Item (category sub-filters) · PIC · Remark · e-Approval status filters · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings · View as Graph

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Goods Receipt Status (`E040410`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040410&menuSeq=MENUTREE_000534`

Production **goods receipt** inquiry — extends Goods Issued Status with payable linkage and GR type filters.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

**Details** (default) · Summary · **by Line** · Comparison Period options

### Option panel sections

Date (This Month ~ Today) · **Goods Receipt No** · Location · Project · Item · PIC · Remark · **Payable No.** · Transaction type All/General/Returns · **Goods Receipt type** All/Goods Receipt I/Goods Receipt II/Goods Receipt III · e-Approval status filters · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings · View as Graph

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| J/O Status Details/Summary/by Line | No job order analytics report |
| J/O progress quad-type dashboard | No production progress KPI screen |
| Goods Issued/Receipt status inquiries | GR/GI list exists; dimensional status reports missing |
| View as Graph on production reports | No chart toggle on job-costing reports |

## Tab pill checklist

- [x] E040413 — Default + Details/Summary/by Line type (pass 12)
- [x] E040414 — Default + four progress type radios (pass 12)
- [x] E040409 — Default + Details/Summary/by Line (pass 12)
- [x] E040410 — Default + Details/Summary/by Line + GR type filters (pass 12)
