# Postiz sandbox study — mechanisms

**Evidence date:** 2026-10-31  
**Sources:** https://github.com/gitroomhq/postiz-app README · https://docs.postiz.com · https://github.com/gitroomhq/postiz-agent

## Sandbox outcome

| Check | Result |
|-------|--------|
| Live sandbox scheduled post | **Blocked** — no Postiz instance credentials, no self-host deploy in this task, no Meta/LinkedIn/TikTok/X developer apps connected |
| Documented credential blocker | **Yes** (below) |

### Credential / environment blocker

To complete a real sandbox post you need **all** of:

1. Either Postiz Cloud account **or** self-host (Docker + Postgres + Redis + **Temporal** since v2.12.0).
2. Per-network **developer apps** + OAuth approval for self-host (Cloud uses pre-approved apps — Confirmed in Postiz Cloud vs OSS table).
3. Connected channel integrations + API key (Settings → Developers) for API/MCP tests.

This study task forbids Bluearm deploys/config and real cookie bots; owner consoles were not accessed. **Stop branch:** no fabricated “we posted.”

---

## Scheduling & publishing (Confirmed)

- UI composer: draft, schedule, post now, repeats (docs: Scheduling and publishing).
- Public API `POST /public/v1/posts` with `type`: `schedule` | `now`; `change-status` moves between `draft` and `schedule`.
- Workers: **Temporal** orchestrates publishing workflows (required service; compose bundles Temporal UI :8080 / gRPC :7233).
- Rate limit note: create-post endpoint ~90/hour self-host default (`API_LIMIT`); batch posts per request.

## Approvals (Confirmed)

- Preview share links for client sign-off; recipients comment without a Postiz account.
- **No hard “approved” state** that blocks publish — human moves draft → scheduled.
- Preview URLs are unlisted, not password-protected.

Implication for agents: treat MCP/API `schedule` / `now` as **privileged**; gate externally (human approve) even if Postiz will accept the call.

## API / webhooks / MCP / CLI (Confirmed)

| Surface | Notes |
|---------|-------|
| Public API | Integrations, posts, uploads, analytics, clipping; Bearer API key or OAuth `pos_` |
| Webhooks | Fire on publish; self-host unrestricted; Cloud Standard+ |
| MCP | 13 tools incl. `schedulePostTool`; self-host at `/mcp`; **no comment tools** |
| postiz-agent | CLI/skill for Claude/OpenClaw/etc. (`npx skills add gitroomhq/postiz-agent`); stars **559** |
| n8n | Official custom node referenced in README |

## Stack & ops (Confirmed)

- Next.js + NestJS + Prisma + PostgreSQL + Redis + Temporal + Resend.
- Hardware (docs): **2 GB / 2 vCPU** light single-user floor; **8 GB / 4 vCPU** recommended ≤20 users; build from source OOMs on 2 GB.
- Outbound HTTPS to each social provider required.

## AGPL-3.0 implications (Confirmed license; legal = counsel)

| Topic | Practical note |
|-------|----------------|
| Self-host modified Postiz | AGPL network interaction → offer corresponding source to users of that modified service |
| Unmodified Docker image ops-only | Still AGPL; compliance hygiene: keep source availability story clear |
| SaaS to **tenants** | Higher risk: modified multi-tenant hosting often needs legal review / commercial license path (Postiz Cloud exists) |
| Mixing into Bluearm repo | **Out of scope / rejected** — sidecar only, never vendor into ERP |

**Unknown without counsel:** whether ops-only unmodified container + separate hostname satisfies company policy.

## Mechanism sketch (paper)

```
Agent/MCP/CLI/n8n ──► Public API (draft preferred)
                         │
                         ▼
                   Postiz DB + Temporal
                         │
            human preview / dual-UI approve
                         │
                         ▼
              schedule / publish workers
                         │
                         ▼
              Provider OAuth APIs ──► networks
                         │
                         ▼
                   Webhook → Bluearm/ops log (optional)
```

## Acceptance (step 3)

- [x] Notes written  
- [x] Sandbox post **or** credential blocker documented → **blocker**  
