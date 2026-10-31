# Final adoption brief — OSS social sidecars vs BluearmERP

**Date:** 2026-10-31  
**Mode:** Study / decision only — **no** forks, **no** Bluearm code, migrations, deploys, or config changes  
**Pack:** `docs/evaluations/social-oss-sidecar-adoption/`

| Step | Doc | Acceptance |
|------|-----|------------|
| 1 Charter | [00-CHARTER.md](./00-CHARTER.md) | Pass |
| 2 Matrix | [01-CAPABILITY-MATRIX.md](./01-CAPABILITY-MATRIX.md) | Pass — comments unsupported |
| 3 Postiz | [02-POSTIZ-SANDBOX-NOTES.md](./02-POSTIZ-SANDBOX-NOTES.md) | Pass — credential blocker |
| 4 DM compare | [03-CHATWOOT-OPENBSP-DM.md](./03-CHATWOOT-OPENBSP-DM.md) | Pass — DMs ≠ comments |
| 5 Glue | [04-GLUE-OPTIONS.md](./04-GLUE-OPTIONS.md) | Pass — conditional pick |
| 6 Agents | [05-AGENT-RULES.md](./05-AGENT-RULES.md) | Pass |
| 7 Decision | [06-DECISION.md](./06-DECISION.md) | **DEFER production** |
| 8 Networks | [07-NETWORK-APPROVALS-CHECKLIST.md](./07-NETWORK-APPROVALS-CHECKLIST.md) | Pass — all Unknown |
| 9 Brief | this file | Pass |

---

## Executive verdict

**Defer production sidecar adoption.** Postiz is the strongest OSS scheduling + API/MCP candidate (AGPL, Temporal, ~40k★, fresh). Chatwoot is the primary DM/support desk; OpenBSP is optional Meta messaging depth. None of them deliver a unified public **comments/mentions** inbox. Bluearm should not build a Social module or deep-link UI until tenancy, network approvals, and license OK are decided—and then only via a **new** implementation task.

---

## What was re-verified (2026-10-31)

| Claim | Source | Result |
|-------|--------|--------|
| Postiz license AGPL-3.0 | GitHub API + README | Confirmed |
| Postiz stars ~40k | GitHub API `stargazers_count`: 40247 | Confirmed |
| Postiz RAM | docs.postiz.com system-requirements | Confirmed 2 GB floor / 8 GB recommended |
| Temporal required | Postiz system requirements | Confirmed since v2.12.0 |
| Postiz MCP cannot comment | docs MCP FAQ | Confirmed |
| Approvals = preview links, no hard gate | docs approvals | Confirmed |
| Chatwoot CE MIT + Enterprise proprietary | README + enterprise/LICENSE | Confirmed |
| Mixpost Lite MIT | LICENSE.md | Confirmed; Lite platforms limited vs Pro |
| goloom ~2★ MIT | GitHub search/README | Confirmed — not production core |
| OpenBSP Unlicense; WA+IG official API | README | Confirmed |
| n8n fair-code SUL | n8n docs | Confirmed |
| Live sandbox post | — | **Not done** — credential/deploy blocker |
| Network App Review statuses | — | **Unknown** |

---

## Capability summary

```
                    Post / schedule     DMs/support      Public comments inbox
Postiz              Strong              Weak/N/A         Unsupported (MCP)
Chatwoot            N/A                 Strong           Not unified comments
OpenBSP             N/A                 Strong Meta      Not unified comments
Mixpost Lite        Medium (few nets)   N/A              Unsupported
```

---

## Recommended path if product later says ADOPT (ops-only)

1. Sign legal OK for **AGPL** self-host **or** use **Postiz Cloud** (pre-approved apps).  
2. Complete Meta / LinkedIn / TikTok / X checklist for any self-host or Chatwoot/OpenBSP.  
3. Run isolated sandbox; prove one scheduled post + one webhook.  
4. Run dual-UI; optional n8n **only** if fair-code OK.  
5. Agents: draft/plan autonomous; publish/DM human-approved per [05-AGENT-RULES.md](./05-AGENT-RULES.md).  
6. Separate task: optional thin deep-links from Bluearm shell → sidecar URLs. **Still no fork.**

If AGPL unacceptable: evaluate **Mixpost Lite** (MIT) knowing Lite channel set is narrower (FB Pages, X, Mastodon per Mixpost pricing docs).

If **per-tenant** SaaS: stop and re-plan with counsel — AGPL + n8n SUL change the economics; prefer commercial clouds or Enterprise agreements.

---

## Blockers (honest list)

1. **Tenancy undecided** (ops-only vs per-tenant).  
2. **Developer approvals Unknown** for Meta, LinkedIn, TikTok, X.  
3. **No live sandbox post** in this study (credentials / no-deploy boundary).  
4. **License Unknown** for company policy (AGPL Postiz; fair-code n8n; Chatwoot Enterprise if AI/SLA needed).  
5. **Comments/mentions gap** — do not buy OSS expecting Sprout-class engagement inbox.  
6. **Captain / CE AI packaging** for Chatwoot not fully SKU-verified for target version → Unknown.  

---

## Stop rules honored

- Missing evidence → **Unknown**; branches stopped (sandbox post, network statuses, some secondary star counts via API 403).  
- Only docs under this evaluation folder written.  
- No Bluearm Social module.  
- Reject list enforced (cookie agents, Socioboard-as-core, &lt;1k★ as core, paid MCP-as-OSS).  

---

## Next action for product owner

1. Countersign [06-DECISION.md](./06-DECISION.md).  
2. Choose tenancy.  
3. Fill [07-NETWORK-APPROVALS-CHECKLIST.md](./07-NETWORK-APPROVALS-CHECKLIST.md) from real consoles.  
4. If still interested: open a **separate** “ops Postiz Cloud trial” or “sandbox VM” task — not an ERP feature build.

---

## Confidence

- **Confident:** Postiz/Chatwoot/Mixpost Lite/OpenBSP/n8n facts cited from docs/GitHub this session; comments MCP gap; DEFER recommendation given open blockers.  
- **Approximate / inferred:** Exact OpenBSP VM sizing; Chatwoot Captain CE vs paid packaging for a specific release; Mixpost Lite star count (API 403).  
- **Verify yourself:** Network App Review statuses; company AGPL/fair-code policy; whether comments inbox is a hard product requirement (if yes, expect commercial tooling, not this OSS set).  
