# Module — POS, HR & Payroll

> **Deep dive (POS):** `18-DEEP-POS.md` (shifts, checkout, serial gates, permissions)

## POS

**Path:** `/app/pos` · Manage `/app/pos/manage` (`managersOnly`)  
**Purpose:** Retail terminal; checkout creates sales invoice and reduces stock.

### Happy path

1. Enable POS module (depends inventory + sales).  
2. Managers configure Manage.  
3. Open shift (location + opening cash).  
4. Sell / hold bills → Checkout.  
5. Serial lines: one serial per unit, in stock.  
6. Close shift (counted cash / variance).  
7. Optional auto-post SI + OR.

### Gates

- Foundation readiness blocks transactional POS.
- Module enabled; stock + catalog present.
- Manage requires `pos.manage`; terminal `pos.terminal`.

### Session statuses (G-18 closed)

**Observed:** migration `082_pos.sql` — `pos_sessions.status` check (`open`, `closed`); `sessions.go` open/close.

| Status | Meaning |
|--------|---------|
| `open` | Shift active; cart/checkout allowed; one open session per cashier |
| `closed` | Shift ended with `closing_cash`; no further cart activity |

There is **no** third status (e.g. suspended). Help “open shift / close shift” maps exactly to these two values.

### UNKNOWN (remaining)

Offline queue internals (roadmap / tip text).

### Evidence

Help/KB `pos-*`; `api/internal/modules/pos/sessions.go`; migration `082`. No `docs/modules/pos/README.md` (G-30).

---

## HR & Payroll (`hr`)

**Path:** `/app/hr/employees`  
**Purpose:** Hire → onboard → attend → leave → payroll → remit; ESS for linked employees.

### Features

Employees · Attendance/DTR · Leave · Absenteeism · Discipline · Hire onboarding · Evaluations · Learning · Pay items · Payroll · 13th/Final pay · Remittances · My HR (ESS)

Finance workspace also links Payroll and Remittances.

### Status flows (Observed — G-19)

| Area | Flow |
|------|------|
| Hire onboarding | cases → tasks `done` → case `completed` |
| Learning | assignments → `passed` / task `done` |
| Payslips | `draft` → `posted` (+ JE); period → `processed`; locked period blocks re-run |
| Employees for payroll | filtered `status = 'active'` (master also `inactive` / `terminated`) |
| **Leave requests** | `draft` \| `submitted` \| `approved` \| `rejected` \| `cancelled`. Approve/reject from `submitted`; cancel from draft/submitted. Permission `hr.leave`. |
| **Discipline cases** | `open` \| `awaiting_explanation` \| `under_review` \| `decided` \| `acknowledged` \| `closed` \| `cancelled`. Advance: under_review / decide / close / cancel. ESS ack → `acknowledged`. |
| **Absence alerts** | `open` \| `acknowledged` \| `escalated` \| `closed` |
| Attendance day | `present` \| `absent` \| `leave` \| `holiday` \| `rest` \| `awol` |

### Gates

- HR module + permissions (`hr.employees`; leave `hr.leave`).  
- Remittance packs labeled non-certified eFPS in help — not a BIR certification claim.

### Evidence

Help `hr` / KB; `hr/leave.go`, `discipline.go`, `absenteeism.go`; migration `193`. No `docs/modules/hr/README.md` (G-30 mitigated by pack).
