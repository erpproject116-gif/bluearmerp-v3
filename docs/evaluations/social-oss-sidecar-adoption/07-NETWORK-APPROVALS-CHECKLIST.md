# Network developer approval checklist (parallel track)

**Evidence date:** 2026-10-31  
**Rule:** Status is **Unknown** until an owner checks the live developer console. Do not invent “Approved.”

Self-host Postiz/Chatwoot/OpenBSP all require **your** apps. Postiz Cloud uses pre-approved apps (Confirmed in Postiz docs) — still useful to track company apps for Chatwoot/OpenBSP/self-host.

---

## Checklist

| Network | Developer portal | App created? | OAuth / products configured? | App Review / production access? | Scopes needed (typical) | Status | Owner | Notes |
|---------|------------------|--------------|------------------------------|----------------------------------|-------------------------|--------|-------|-------|
| **Meta** (Facebook Pages, Instagram, WhatsApp) | developers.facebook.com | Unknown | Unknown | Unknown | pages_manage_posts, instagram_content_publish, whatsapp_business_messaging, … | **Unknown** | | Required for IG/WA DMs (Chatwoot/OpenBSP) and Meta posting (Postiz self-host) |
| **LinkedIn** | linkedin.com/developers | Unknown | Unknown | Unknown | w_member_social / organization share | **Unknown** | | Company page posting often needs org products |
| **TikTok** | developers.tiktok.com | Unknown | Unknown | Unknown | video.publish / content posting | **Unknown** | | Postiz docs note weeks for approval |
| **X (Twitter)** | developer.x.com | Unknown | Unknown | Unknown | tweet.read/write, media | **Unknown** | | Paid API tiers **Unknown** for current pricing — verify externally |

### Optional / secondary

| Network | Status | Notes |
|---------|--------|-------|
| YouTube (Google Cloud) | Unknown | Postiz supports; separate Google project |
| Bluesky | Unknown | App password model (goloom/Postiz) — lighter than classic App Review |
| Mastodon | Unknown | Per-instance OAuth app |
| Reddit | Unknown | Script/web app; rate limits |
| Pinterest / Threads / etc. | Unknown | Only if brand uses them |

---

## How to update this file

1. Owner logs into each portal.  
2. Change Status to: `Not started` | `Draft app` | `In review` | `Approved prod` | `Blocked: <reason>`.  
3. Record date and App ID (non-secret). **Never paste client secrets here.**

## Acceptance (step 8)

- [x] Checklist exists with statuses  
- [x] Statuses honestly **Unknown** until consoles checked  
