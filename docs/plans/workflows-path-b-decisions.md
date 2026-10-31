# Path B — product decisions (Step 0)

**Status:** Recorded 2026-10-31  
**Program:** Bluearm Workflows create / do / integrate  
**Supersedes for this program only:** freeze line “Rules engine … no second engine” (see waive below).

## Decisions

| Topic | Choice | Rationale (evidence) |
|-------|--------|----------------------|
| Second engine | **Waive** — allow **exactly one** Bluearm-operated glue engine | Path B is the only path that delivers Bluearm create/do/integrate; freeze previously deferred glue until B-HOOK (`Observed` `unified-2026-10-31-freeze-and-gaps.md`); B-HOOK cleared |
| Engine XOR | **Activepieces** (not n8n) | MIT CE for self-host; documented embed/provisioning path; n8n Sustainable Use License restricts letting external customers build/edit flows without Enterprise (`Observed` vendor license docs / public comparisons this session) |
| Marketing layer (gap 12) | **Defer** (B-MARKETING-IN = false) | Freeze keeps Listmonk/Formbricks deferred until B-POINT; product has not marked gap 12 In → Step 8 skipped |
| Twenty / GHL / second CRM | **Skip** (unchanged) | Freeze Skip list; Bluearm remains SoR |
| Per-tenant Docker/VPS | **Forbidden** for paying tenants | Single Bluearm-operated Activepieces instance (or vendor SaaS Bluearm operates) |
| Baiko / Qwen | **Assist only** — draft recipes; human publish; no `EmitERPEvent` → LLM | Freeze Baiko Approve locks |
| Lite rules | Keep `wm_automation_rules` + CRM alert rules | Not a canvas substitute |

## Waive text (B-ENGINE-WAIVE)

> Product amends the 2026-10-31 freeze: Bluearm may host or embed **one** workflow engine (**Activepieces**). `wm_automation_rules` remains the lite in-app tier. This is not Make/n8n/Activepieces **parity** and not a GHL clone.

## Claims allowed in UI/docs

- “CRM Workflows” / “Bluearm Workflows”
- “Lite in-app rules” vs “Workflows engine” vs “BYO outbound webhooks”

## Claims forbidden

- Make / Zapier / n8n / Activepieces / GHL parity
- “Agentic automation” for unattended Qwen on ERP events
