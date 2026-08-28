# Start here — Product owner guide

**Who this is for:** product owners and operators who need to understand **how Bluearm ERP actually works** — modules, flows, handoffs, and what can block a transaction — so you can compare it to **your real operations**.

**Who this is not for (first):** engineers digging into source paths. Those pages live under **Engineering reference**.

---

## Click these first (how-to)

| I need to… | Open |
|------------|------|
| **See the click order** (Quote→SO, Load Slip, sell/buy) | [Guided navigation](forms/11-GUIDED-NAVIGATION-SCENARIOS.md) |
| **Fix Save / Post / Approve** | [Submission errors](forms/12-FORM-SUBMISSION-ERRORS.md) |
| **What Load Slip copies + required files** | [Load Slip & attachments](forms/13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md) |
| **Fields by screen / module** | [Forms & fields catalog](17-FORMS-FIELDS-CATALOG.md) |
| **Ask what feels implemented wrong** | [PO interview questions](forms/14-PO-INTERVIEW-WRONG-IMPLEMENTATION.md) |

---

## How to use this space (15 minutes)

1. Open a **how-to** link above if you already know the question.
2. Read **Company journey** — the full path from sign-in → setup → sell → buy → money → ops.
3. Open **Master inventory** — every sidebar module and feature that exists.
4. Pick the area you care about under **Module playbooks** (Sell, Buy, Stock, Finance, etc.).
5. Use **Cross-module handoffs** when you need “what document creates the next document.”
6. Use **Process policies & gates** when you need “what is required vs optional / advisory.”

Then: sit with your ops checklist and mark **Match / Gap / Different wording** against each flow.

---

## Compare to your operation (worksheet)

For each major flow (example: Sales quotation → order → delivery → invoice → payment):

| Your question | Where to look in this KB |
|---------------|--------------------------|
| Do we have this document / screen? | Master inventory + module playbook |
| What fields are on the form? Required? | **Forms & fields catalog** → `forms/` pack |
| What order do I click? Load Slip? | **Guided navigation** → `forms/11-GUIDED-NAVIGATION-SCENARIOS.md` |
| Why did Save/Post fail? | **Form submission errors** → `forms/12-FORM-SUBMISSION-ERRORS.md` |
| What does Load Slip copy? Which file do I need? | **Load Slip carry-over & attachments** → `forms/13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md` |
| What statuses can it be in? | Module playbook + Forms window file (status tables) |
| What must happen before the next step? | Handoffs + Policies & gates |
| Can users skip a step? | Policies — **Enforced** vs **Advisory** / **Relaxed in API** |
| Who needs permission? | Engineering → Route permission matrix (optional) |

**Rule of trust:** if a page says **UNKNOWN** or **Relaxed in API**, do **not** promise that behavior to customers until engineering confirms.

---

## Evidence tags (plain language)

| Tag | Meaning for you |
|-----|-----------------|
| **Observed** | Confirmed in the live product logic |
| **Doc-backed** | Documented and checked against the product |
| **UNKNOWN** | Not verified — do not treat as product truth |
| **Relaxed in API** | A setting or policy exists, but the system may still allow skipping |

---

## Page map (product-first)

### Read first
- Company journey
- Master inventory
- Cross-module handoffs
- Process policies & gates
- Module playbooks (9 areas)

### Read when needed
- Gap register — honest unknowns and intentional soft spots
- Pass addenda — what we locked down recently (shipping statuses, help, etc.)

### Engineering reference (optional)
- Master plan (how this KB stays accurate)
- Source index
- Route → permission matrix
- Import / maintenance notes

---

## Suggested comparison workshop (1–2 hours with ops)

1. Walk **Sell chain** playbook against your sales SOP.
2. Walk **Buy chain** against purchasing + receiving.
3. Walk **Stock** against warehouse reality.
4. Walk **Finance** against AR/AP and cash.
5. Capture mismatches in a shared Notion table: *Module / Our step / Bluearm step / Match? / Decision*.

---

*Source pack in repo: `docs/notion-knowledge-base/`.*
