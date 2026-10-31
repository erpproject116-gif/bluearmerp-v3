# Signed decision — social OSS sidecars

**Date:** 2026-10-31  
**Decision owner (product):** pending countersignature — analysis signed by study author as **recommendation**  
**Bluearm implementation:** **None** (explicitly out of scope)

---

## Verdict

### **DEFER production sidecar adoption**

Do **not** adopt Postiz/Chatwoot/OpenBSP as production brand infrastructure for BluearmERP tenants or company go-live **until blockers below clear**.

### Allowed now (study / ops)

| Action | Allowed? |
|--------|----------|
| Keep using this docs pack; re-verify sources | Yes |
| Postiz **Cloud trial** (ops-only) with official OAuth | Yes, if owner wants hands-on — **outside** Bluearm repo |
| Isolated self-host sandbox on non-prod VM after developer apps exist | Yes, separate from Bluearm deploys |
| Thin deep-link design in Bluearm | **Later only** — requires separate implementation task after this brief |
| Fork/vendor into `bluearmerp-v3` | **No** |
| Build Bluearm Social module | **No** unless product owner opens a new task |

### Preferred stack **if** later adopt (ops-only)

1. **Postiz** — scheduling, API, MCP, Temporal workers  
2. **Chatwoot** — support/DM desk (CE first; Enterprise only if paid features required)  
3. **OpenBSP** — optional Meta WA/IG messaging depth  
4. **Mixpost Lite** — MIT fallback if AGPL hosting rejected  
5. Glue: dual-UI + webhooks; n8n only if fair-code OK  

### Explicit non-claims

- No unified public comments/mentions inbox  
- No production use of cookie/browser agents  
- goloom / experimental &lt;1k★ tools are **not** core  

---

## Blockers that force DEFER

| ID | Blocker | Status |
|----|---------|--------|
| B1 | Tenancy: ops-only vs per-tenant undecided | **Open** |
| B2 | Network developer app approvals (Meta, LinkedIn, TikTok, X) | **Unknown** — checklist started, consoles not verified |
| B3 | Live sandbox post not executed (credential/deploy boundary) | **Open** |
| B4 | Legal OK for AGPL (Postiz) and fair-code (n8n) under intended tenancy | **Unknown** — needs owner/counsel |
| B5 | Comments/mentions product need vs OSS gap | **Acknowledged gap** — do not adopt expecting inbox parity with Buffer/Sprout-class |

---

## Signature

| Role | Name | Decision | Date |
|------|------|----------|------|
| Study author (Agent) | Cursor study pass | **Recommend: DEFER production; allow ops trial outside ERP** | 2026-10-31 |
| Product owner | ________________ | ☐ Agree DEFER ☐ Override ADOPT (ops-only) ☐ Override other: ___ | __________ |

---

## Acceptance (step 7)

- [x] Signed decision recorded (study recommendation)  
- [x] No Bluearm implementation  
