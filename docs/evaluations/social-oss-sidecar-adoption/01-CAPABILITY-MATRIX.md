# Capability matrix — Confirmed vs Unknown

**Evidence date:** 2026-10-31  
**Rule:** Confirmed = observed this session from README/docs/GitHub API. Unknown = not re-verified; do not treat prior chat as proof.

Legend: **C** = Confirmed · **U** = Unknown · **N** = Not supported / rejected for stated reason

---

## Triage

| Tier | Project | Verdict |
|------|---------|---------|
| Primary | Postiz (+ postiz-agent CLI) | Keep — scheduling/API/MCP leader |
| Primary | Chatwoot | Keep — omnichannel DM/support desk |
| Primary (optional) | OpenBSP | Keep optional — WA + IG official-API DM platform |
| Secondary | Mixpost Lite | MIT fallback if AGPL hosting unacceptable |
| Secondary | goloom | Niche Mastodon/Bluesky/Friendica; **not** production core (<1k★) |
| Secondary | LangChain social-media-agent | Reference HITL pattern only |
| Secondary | ig-mcp / reddit-mcp-buddy | Official-API MCP helpers (narrow) |
| Secondary | n8n / n8n-mcp | Glue **only if** fair-code / SUL accepted for intended tenancy |
| Reject | Socioboard 5.0 | Reject for production brand use (per study brief) |
| Reject | Young &lt;1k experimental schedulers as **core** | Includes goloom as core; ok as niche experiment |
| Reject | Browser/cookie agents, MiloAgent | ToS/risk; no real-account automation in this study |
| Reject | Paid-host MCP wrappers billed as “OSS posting” | Not OSS posting |

---

## Primary / secondary snapshot

| Dimension | Postiz | Chatwoot | OpenBSP | Mixpost Lite | goloom | LangChain SMA |
|-----------|--------|----------|---------|--------------|--------|---------------|
| Stars (GitHub API / search) | **C** 40,247 (`gitroomhq/postiz-app`) | **C** 38,646 | **C** UI ~187 / API active (Unlicense) | **U** exact count (403 on API this session); product live | **C** 2 | **U** exact this session; repo exists |
| Last push freshness | **C** 2026-10-30 | **C** 2026-10-31 | **C** README current (IG/WA docs) | **C** Lite docs live | **C** updated ~2026-10 | **C** README present |
| License | **C** AGPL-3.0 | **C** CE MIT; `/enterprise` proprietary | **C** Unlicense (UI/API) | **C** MIT (Lite) | **C** MIT | **U** (check LICENSE before use) |
| Stack | **C** Next/Nest/Prisma/Postgres/Redis/**Temporal** | **C** Rails + Vue; PG + Redis | **C** Deno + Supabase/Postgres | **C** PHP/Laravel + Redis/Horizon | **C** Go single binary; SQLite default | **C** LangGraph / TS agent |
| Post / schedule | **C** Yes (UI + API + MCP) | **N** Not a scheduler | **N** Messaging, not broadcast scheduler | **C** Yes (Lite: FB Pages, X, Mastodon) | **C** Mastodon/Bluesky/Friendica | **C** Generate + schedule X/LinkedIn (Arcade/dev apps) |
| DM inbox | **N**/U as product focus (scheduler) | **C** Omnichannel (FB/IG/X/WA/Telegram/…) | **C** WA + IG Business messaging | **N** | **N** | **N** |
| Public comments / mentions inbox | **N** MCP FAQ: no get/reply comments | **U**/partial channel-dependent; **not** a unified public comments product claim | **N** for public feed comments as unified inbox (DM/messaging focus) | **N** | **N** | **N** |
| Approvals | **C** Preview links + comments; **no** hard “approved” gate | **C** Agent workflows / assignment (support) | **U** agent tooling; human UI exists | **U** team perms depth | **C** roles owner/editor/viewer | **C** HITL Agent Inbox approve/edit |
| API / webhooks | **C** Public API + webhooks (self-host unrestricted) | **C** API + webhooks (support desk) | **C** PostgREST + webhooks | **U** Lite API surface depth | **C** API-first + MCP | Graph/API for agent |
| Agent / MCP | **C** `/mcp`, CLI (`postiz-agent`), n8n node | Captain AI = product/enterprise path **U** for CE-only | **C** agent-ready; n8n nodes | **N**/U | **C** MCP at `/mcp` | Reference agent only |
| Tenancy | **C** orgs/customers/groups in product | **C** accounts/inboxes | **C** multi-tenant orgs | Workspaces (Pro stronger) | **C** team workspaces | Single-operator pattern |
| Self-host RAM (docs) | **C** floor 2 GB light; **rec. 8 GB**; Temporal required ≥ v2.12 | **C** docs: 4 GB min / deploy page also cites 8 GB min | Supabase-sized **U** exact VM size | Typical PHP stack **U** exact | Lightweight Go **U** exact | Dev machine |

### Comments row (explicit)

| Capability | Status |
|------------|--------|
| Unified public comments / mentions inbox across networks | **Unsupported** in evaluated OSS set for production claim |
| Postiz MCP comment read/reply | **Confirmed unsupported** — docs: “Can MCP read or reply to comments? Not today.” |
| Postiz “post comments” / plugs auto-comment | Collaboration / automation features — **not** a comments inbox |
| Chatwoot / OpenBSP | **DMs and messaging channels ≠ public comments inbox** |

---

## Reject list (enforced)

1. Socioboard 5.0 as production brand stack  
2. &lt;1k★ experimental schedulers as **core** (goloom niche-only)  
3. Browser/cookie agents on brand accounts  
4. MiloAgent and similar  
5. Paid-host MCP wrappers presented as “OSS posting”  
6. Claiming unified comments/mentions without new primary evidence  

---

## Acceptance (step 2)

- [x] Matrix complete with Confirmed vs Unknown  
- [x] Comments row = unsupported  
- [x] Reject list explicit  
