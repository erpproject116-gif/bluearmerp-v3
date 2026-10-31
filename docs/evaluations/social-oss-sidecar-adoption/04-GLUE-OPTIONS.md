# Glue options (paper only) — n8n vs webhooks vs dual-UI

**Evidence date:** 2026-10-31  
**Rule:** Written pick depends on **tenancy** + **fair-code OK/No**. No Bluearm implementation.

---

## Options

| Option | How it works | Pros | Cons |
|--------|--------------|------|------|
| **A. Dual-UI** | Operators use Postiz (+ Chatwoot/OpenBSP) UIs; Bluearm unchanged | Zero ERP code; clear AGPL boundary | Context switching; no ERP deep links yet |
| **B. Webhooks only** | Postiz publish webhooks → logging / Slack / future Bluearm listener | Thin; no fair-code dependency | One-way; no schedule-from-ERP |
| **C. n8n / n8n-mcp** | Workflows call Postiz API / OpenBSP / Chatwoot | Flexible automation; Postiz has n8n node | **Sustainable Use License (fair-code)** |
| **D. Direct API/MCP from agents** | Cursor/Claude → Postiz MCP with human gate | Fast for ops content | Secrets + kill switch discipline; easy to over-publish |

---

## n8n license posture (Confirmed from n8n docs)

- Self-host Community: **Sustainable Use License** (fair-code), not OSI OSS.
- Allowed pattern (docs): internal business purposes; staff edit workflows.
- Needs commercial/Enterprise if: tenants/customers build or configure workflows (UI, API, MCP, or AI agent acting for them); white-label; hosting n8n as a product.
- **Ops-only Bluearm company use:** generally **OK under SUL** per n8n examples (still confirm with `license@n8n.io` if policy is strict).
- **Per-tenant “automations for each ERP customer”:** treat as **No** until Enterprise agreement — mark **Unknown/legal** until counsel + n8n confirm.

## AGPL (Postiz) interaction

- Glue must not **vendor** Postiz into Bluearm.
- Prefer network sidecar + API keys.
- Modified Postiz SaaS for tenants → legal review before any “adopt for multi-tenant” path.

---

## Written pick (conditional)

```
IF tenancy = ops-only AND fair-code OK = Yes:
  Pick = A (dual-UI) + B (webhooks for audit) + optional C (n8n internal)
  MCP/CLI agents allowed only under 05-AGENT-RULES.md

ELSE IF tenancy = ops-only AND fair-code OK = No:
  Pick = A + B only; no n8n
  Prefer Postiz Public API + webhooks; or Mixpost Lite if AGPL also rejected

ELSE IF tenancy = per-tenant:
  Pick = DEFER glue productization
  Do not expose n8n editor/MCP to tenants without Enterprise
  Prefer Postiz Cloud / commercial agreements OR thin deep-links later after legal
  OpenBSP multi-tenant messaging is a separate product decision

ELSE:
  Unknown → stop; do not implement
```

**Default for this brief (tenancy undecided):** treat as **ops-only dual-UI + webhooks**; **n8n optional only after fair-code OK = Yes**.

## Acceptance (step 5)

- [x] Written pick dependent on tenancy + fair-code OK/No  
- [x] License posture recorded  
