# Charter — OSS social sidecars alongside BluearmERP

**Status:** Accepted (study only)  
**Date:** 2026-10-31  
**Scope:** Decision-ready analysis. No forks, no Bluearm code, no deploys, no config changes in this task.

## Goals

1. Evaluate open-source (and fair-code) social tools as **sidecars** next to BluearmERP—not as merged ERP modules.
2. Re-verify capabilities from **primary sources** (current READMEs / docs / GitHub metadata). Mark Confirmed vs Unknown.
3. Document mechanisms that matter for ops: scheduling, approvals, workers, API/webhooks, agent/MCP, tenancy, licenses.
4. Produce a signed **adopt / defer / later thin deep-link** decision with honest blockers.
5. Start a parallel checklist for Meta, LinkedIn, TikTok, and X developer approval (status may remain Unknown until owner consoles are checked).

## Non-goals

- Forking or vendoring Postiz, Chatwoot, elizaOS, Mixpost, OpenBSP, or others into `bluearmerp-v3`.
- Implementing a Bluearm “Social” module, migrations, deploys, or env/config changes.
- Modifying Bluearm Comms (`/app/comms`), PayMongo/billing, manufacturing, sell/buy frozen docs, platform customers, or unrelated modules.
- Browser/cookie automation against real brand accounts (LocoAgent, OpenTwins, MiloAgent, linkedincli, auto-commenter, etc.).
- Claiming a unified public **comments/mentions** inbox (OSS gap remains unless new primary evidence appears).
- Treating prior chat star counts, RAM guesses, or feature lists as proven without re-check.

## Tenancy question (open)

| Option | Meaning | Implication |
|--------|---------|-------------|
| **Ops-only** | One Bluearm-operated sidecar for company/brand channels | Simpler AGPL/fair-code posture; single set of developer apps; dual-UI acceptable |
| **Per-tenant** | Sidecar(s) offered to ERP tenants / agencies | Multi-tenant product surface; AGPL network-copy obligations; n8n SUL may require Enterprise if tenants edit workflows; much higher ops and legal load |

**Decision gate:** Product owner must choose ops-only vs per-tenant **before** any production sidecar adoption. Until then, default study posture is **ops-only sandbox**.

## Relationship to Bluearm Comms

Bluearm already has Team Chat / Inbox / Sent Documents under Comms. That is **internal team + Gmail-style messaging**, not social network scheduling or public engagement. This study does not extend or replace Comms.

## Acceptance (step 1)

- [x] Charter exists under `docs/evaluations/social-oss-sidecar-adoption/`.
- [x] No application code touched for this step.
