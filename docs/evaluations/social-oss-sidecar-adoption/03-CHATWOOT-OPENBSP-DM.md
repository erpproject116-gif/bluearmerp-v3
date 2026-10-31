# Chatwoot vs OpenBSP — DM / messaging comparison

**Evidence date:** 2026-10-31  

**Hard callout:** **DMs ≠ public comments.** Neither product closes the OSS gap for a unified public comments/mentions inbox across Instagram/Facebook/LinkedIn/TikTok/X feeds.

---

## Comparison table

| Dimension | Chatwoot | OpenBSP |
|-----------|----------|---------|
| Primary job | Omnichannel **customer support desk** (Intercom/Zendesk-class) | **WhatsApp + Instagram Business** messaging platform (BSP-style) |
| License | Community: **MIT**; `/enterprise` folder: **proprietary Enterprise License** | **Unlicense** (API + UI per GitHub) |
| Stars / freshness | **C** ~38.6k★; pushed 2026-10-31 | UI ~187★; API actively documented (IG/WA) |
| Channels (messaging) | Live chat, email, Facebook, Instagram, Twitter/X, WhatsApp, Telegram, Line, SMS, … (README) | WhatsApp Cloud API, Instagram (Instagram login), optional TikTok / Slack; unofficial WA Web exists (**reject for brand ToS**) |
| Multi-tenant | Accounts / inboxes / teams | **C** multi-org; Meta partner / solution-provider path documented |
| AI | **Captain** AI agent (docs/product); treat paid/enterprise packaging as **Unknown** for CE-only until owner confirms SKU | Built-in lightweight agents + external agent protocols; MCP/HTTP/SQL tools |
| Stack | Ruby on Rails + Vue; Postgres; Redis; Sidekiq | Deno Edge Functions + Supabase/Postgres |
| Self-host RAM | Docs: **4 GB** min (~10k conv/day); deploy marketing also cites **8 GB** min / 16 GB rec. | Depends on Supabase project size — **Unknown** exact single-VM floor |
| API / webhooks | Mature support-desk API | PostgREST + webhooks; n8n community nodes |
| Fit next to Postiz | Inbox for **inbound private messages / support** | Narrower but deep **Meta messaging** + agent DM automation |
| Fit next to Bluearm Comms | Overlaps “inbox” metaphor; still **external** sidecar — do not merge into `/app/comms` in this study | Same — keep separate |

### OSS vs paid (honest)

| Item | OSS / free self-host | Paid / gated |
|------|----------------------|--------------|
| Chatwoot CE features | MIT community edition | Enterprise features under proprietary license (SLA, advanced dashboards, etc.) |
| Chatwoot Captain / AI | Marketed heavily; **confirm** whether required capabilities stay in CE for your version — **Unknown** without SKU matrix for target release |
| OpenBSP self-host | Unlicense source | Hosted `web.openbsp.dev` available; Meta **App Review** still required for production messaging |
| Meta App Review | Required for production IG/WA messaging on both paths | Same — not “OSS bypasses Meta” |

---

## When to pick which (paper)

| Need | Prefer |
|------|--------|
| Broad support desk (email + widget + social DMs) | **Chatwoot** |
| WA + IG Business agent DM / BSP multi-tenant | **OpenBSP** (optional add-on) |
| Scheduling + calendar + MCP posting | **Postiz** (not these) |
| Public comment moderation inbox | **Neither** — gap remains |

## Sandbox status

No Chatwoot or OpenBSP instance was stood up in this task (no deploy; no Meta app credentials). Comparison is **docs-level**. Credential blocker same class as Postiz for live DM tests.

## Acceptance (step 4)

- [x] Comparison table  
- [x] DMs ≠ public comments called out  
