# Inv. I → Reports → Communication Center & Proof Center (pass 14)

**Audit date:** Jul 7 2026 (pass 14)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Communication Center / Proof Center  
**Bluearm target:** `/app/reports/communication` (proposed)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Notes |
|--------|-------|---------|-------|
| Message Log | `E010851` | MENUTREE_001613 | Opens **Msg.** inbox (not a grid report) |
| Sent Doc. History | `E010858` | MENUTREE_002595 | Email/SMS send log with Resend |
| Proof Center | `E040730` | MENUTREE_002886 | Voucher proof attachments (receipts / e-Sign) |

**Navigation:** All three open with `menuType=MENUTREE_000004` (Inv. I) using site-map `menuSeq` values. `prgId` values are shared with Acct. I catalog entries.

---

## Message Log (`E010851`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E010851&menuSeq=MENUTREE_001613`

Site Map label **Message Log**; live workspace title is **Msg.** — the ERP internal messaging inbox, not a printable inquiry report.

### L2 status pills (list filter)

| Pill | Notes |
|------|-------|
| **All** | All messages (default) |
| **Unconfirmed** | Unread / pending |
| **Confirm** | Read / confirmed |
| **Storage Box (SB)** | Archived to storage box |
| **Sent Msg** | Outbox view |

### Option panel (Default)

Send Date (Simple Search — Recent 30 Days default Jun–Jul 2026) · **From** · **To** (default John Ranel in tenant) · **Customer** · **Content**

### Toolbar

Search (F3) · Option · **New (F2)** · Confirm · Store · **AI Summary** · Delete Selected

### Bluearm note

Map to an internal messaging / notification center, not a financial report.

---

## Sent Doc. History (`E010858`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E010858&menuSeq=MENUTREE_002595`

Audit log of **emails and other outbound document sends** (slips, statements, etc.) with delivery status.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation

**by Line** (default button) · Channel **All** (default) / **Email** · Extended drawer: SMS · LMS · Kakaotalk

### Option panel sections

**Send Date** (This Month ~ Today Jul 2026) · **Voucher Date** (Use toggle) · Sent Doc. · Sender · Sender Email/No. · Recipient Name · Customer (Include Sub-groups) · PIC for Customer/Vendor · Employee · User · Recipient Email/No. · Email Subject/Contents · Remark · **Sent Status** — All / Stand by / Succeeded / Failed / Exclude Resent (first three checked by default) · Receive Status · Template

### Toolbar

Search (F8) · date shortcuts · Reset · **Resend** · Excel

---

## Proof Center (`E040730`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040730&menuSeq=MENUTREE_002886`

Central registry of **proof documents** attached to vouchers — scanned receipts and e-signatures.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**Voucher Date** (Jun–Aug 2026 default range in tenant) · **Date of Proof** (Use toggle) · **Menu** (doc origin filter) · **User** · **Proof Method** — All / **Attach Receipts** / **e-Sign** (all checked by default) · Template

### Toolbar

Search (F8) · date shortcuts · Reset · **Download** · **Delete Selected** · Excel

### Layout note

Left context shows Inv. I module tabs (Setup · Sales · … · Reports) while Proof Center is open under Reports category.

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Msg. inbox with SB / Sent Msg pills | No internal ERP messaging |
| Sent Doc. History + Resend | Email send log partial; no SMS/Kakao |
| Proof Center receipt/e-Sign registry | No voucher proof attachment hub |
| AI Summary on messages | No message summarization |

## Tab pill checklist

- [x] E010851 — All/Unconfirmed/Confirm/SB/Sent Msg status pills (pass 14)
- [x] E010858 — Default + by Line + All/Email channel (pass 14)
- [x] E040730 — Default + Proof Method Attach Receipts/e-Sign (pass 14)
