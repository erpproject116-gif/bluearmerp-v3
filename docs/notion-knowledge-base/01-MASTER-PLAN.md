# Master plan — close every weak point in this knowledge pack

> **Purpose of this plan:** make the knowledge pack *reliable* for developers, superadmins, and the product owner — not a one-shot AI dump that goes stale.

**Status:** Active  
**Scope:** Whole product as listed in `web/src/shell/modules.ts` + platform gates (setup, process policies, approvals)  
**Non-goals:** Marketing copy, invented “best practices,” undocumented future features presented as shipped

---

## 1. What “done” means (acceptance criteria)

This pack is **done for a feature** only when all six boxes are filled from evidence:

1. **Purpose** — one plain sentence  
2. **Where in the app** — exact path from `modules.ts`  
3. **Happy path** — numbered steps a person can follow  
4. **Statuses** — real enum values from API/docs (or UNKNOWN)  
5. **Gates** — what blocks save / confirm / post / approve  
6. **Handoffs** — which other documents it creates, updates, or consumes  

Plus for owners/admins:

7. **Who can act** — role / permission / featureCode when known  
8. **Evidence** — file path(s)

If any box is missing → it goes in **`06-GAP-REGISTER.md`**, not silently omitted.

---

## 2. Weak points this plan closes

| Weak point | What goes wrong | How we close it |
|------------|-----------------|-----------------|
| **Nav drift** | Docs name screens that moved | Inventory is generated from `modules.ts` only |
| **Doc vs API lies** | README says gate is on; API no-ops | Explicit **Relaxed in API** rows in policies + gaps |
| **ADR vs code** | ADR says DR gate “future”; code enforces qty | Policies page cites both ADR and live validators |
| **Jargon walls** | PO/SI/GR unexplained for owners | Company journey uses plain words; glossary only at end of journey |
| **Partial modules** | POS/HR/Quality had no module README | Module playbooks cover every sidebar module |
| **Fake completeness** | AI invents status lists | UNKNOWN + gap register; no invented enums |
| **Stale pack** | One-time write | Maintenance rules + inventory sync checklist |
| **No proof chains** | Flows not testable | Golden demos S2–S12 linked as living proofs |
| **Audience mismatch** | Devs need paths; owners need decisions | Each playbook has **Owner view** + **Builder view** |
| **Orphan features** | Booking section not in help groups | Gap register tracks help/docs orphans |

---

## 3. Evidence hierarchy (strict)

Use sources in this order. Never skip to guesswork.

1. `web/src/shell/modules.ts` — what exists in the product UI  
2. API handlers / helpers / `processpolicy` — what the server actually allows  
3. ADR `docs/adr/0005-process-flows-and-policies.md` — intentional defaults  
4. `docs/modules/*/README.md` — module intent (verify against 2)  
5. In-app help: `documentationSections.ts`, KB articles — plain-language UX  
6. Golden demos: `docs/modules/demo-scenarios/README.md` + verify SQL  

If 2 contradicts 3 or 4 → document the contradiction; do not “average” them.

---

## 4. Delivery structure (this pack)

| Layer | File | Closes |
|-------|------|--------|
| A. Contract | `01-MASTER-PLAN.md` (this) | Process, acceptance, anti-fabrication |
| B. Catalog | `02-MASTER-INVENTORY.md` | Every module/feature/path/featureCode |
| C. Story | `03-COMPANY-JOURNEY.md` | Start → foundation → sell → buy → money → people |
| D. Interfaces | `04-CROSS-MODULE-HANDOFFS.md` | Document-to-document map |
| E. Controls | `05-PROCESS-POLICIES-AND-GATES.md` | All gates + relaxed validators |
| F. Honesty | `06-GAP-REGISTER.md` | Every UNKNOWN + doc/code conflict |
| G. Traceability | `07-SOURCE-INDEX.md` | Path index for audits |
| H. Depth | `modules/*.md` | Per-module playbooks |

---

## 5. Work method (repeatable, no bluff)

### Phase 0 — Lock the catalog
- Diff `modules.ts` → update inventory table  
- List `featureCode` flags and which tabs they hide  

### Phase 1 — Lock the spine (commercial + money)
- Selling: Quotation → Sales Order → Release (± Delivery) → Sales invoice → Collective → Official Receipt  
- Buying: Purchase Request → (± RFQ) → Purchase Order → Goods Receipt → Supplier Invoice → Payment Voucher  
- Prove with golden scenarios S2, S3, S4, S8, S9, S10  

### Phase 2 — Lock foundation & control plane
- Setup wizard / readiness gate  
- User Management, Process Policies, Module & Features  
- Dashboard red flags  

### Phase 3 — Lock stock depth
- Masters, movements, serial/lot, WMS, BOM/WO, after-sales repair  

### Phase 4 — Lock supporting product areas
- CRM, Operations, POS, Finance ledger/AR-AP/tax, HR, Quality, Support, Booking, CMS, SOP, OKR, Comms, Reports, Data Center, Activity Logs, Help  

### Phase 5 — Close gaps deliberately
- For each UNKNOWN: either (a) code-trace and fill, or (b) leave in gap register with owner + next action  
- Never fill UNKNOWN with plausible guesses  

---

## 6. Audience lenses

### Product owner
- Read: Journey → Handoffs → Process policies → Gap register (for risk)  
- Decision questions this pack answers: What can we skip? What must be on for compliance? What is still soft?

### Superadmin
- Read: Inventory → Policies → User Management playbook → Setup journey  
- Action questions: Which modules to enable? Which policies for this tenant? Who approves?

### Developer
- Read: Source index → Module playbook Builder view → Gap register  
- Build questions: Where is the validator? Which enum? Which permission string?

---

## 7. Anti-fabrication rules (non-negotiable)

1. Do not invent status values.  
2. Do not invent permission codes.  
3. Do not claim a gate works if the validator is a no-op — label **Relaxed in API**.  
4. Do not describe roadmap items as live (see help `roadmap` section).  
5. Do not merge ADR language with live code without noting differences.  
6. Prefer “blocks confirm” over “implements workflow orchestration.”  

---

## 8. Proof that the spine works (living tests)

| Proof ID | Chain | Why it matters |
|----------|-------|----------------|
| S2 | Serial PR → PO → GR → SO → SI | Serial continuity |
| S3 | Lot PR → PO → GR → direct SI | Lot + skip SO |
| S4 | Direct SI | Skip-friendly sell |
| S8 | AP partial pay on GR | Money side |
| S9 | SO → DR → SI | Split/reserve path |
| S10 | PR approval → PO | Approval gate |
| S11 | Operations hub | Non-posting work |
| S12 | Comms sent docs | Email trail |

**Observed:** `docs/modules/demo-scenarios/README.md`, `scripts/verify-demo-full-chain.sql`

Until verify SQL passes on a tenant, do not claim that chain is “proven in this environment.”

---

## 9. Refresh cadence

| Trigger | Action |
|---------|--------|
| PR changes `modules.ts` | Update inventory |
| PR changes `processpolicy` | Update policies + gaps |
| New golden scenario | Update journey + demos table |
| Help article rewrite | Optional sync of Owner view wording |
| Quarterly | Re-scan gap register; close or re-own items |

---

## 10. Immediate deliverables in this pack (completed in-repo)

- [x] Import guide  
- [x] This master plan  
- [x] Full inventory from `modules.ts`  
- [x] Company journey + handoffs + policies  
- [x] Gap register + source index  
- [x] Module playbooks for every sidebar module  

**Still open by design (tracked in gap register):** deep permission matrices, some status machines (NCR beyond open/closed, OR header lifecycle detail, Mapping Center JSON schema). Those are explicit debts — not pretended complete.
