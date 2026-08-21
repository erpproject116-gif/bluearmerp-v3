# Alibaba Cloud deploy (Sprint 2 scaffold)

This runbook is a **placeholder** for moving the Go API from Render to Alibaba ECS/ACK. Sprint 1 (DashScope/Qwen) is complete; use this when provisioning compute.

## Target stack

| Component | Alibaba service |
|-----------|-----------------|
| Go API (Docker) | ECS or ACK + ACR |
| Static SPA | OSS + CDN |
| PostgreSQL | RDS PostgreSQL 15 |
| RFQ AI | DashScope (same env as today) |
| Attachments (Sprint 3) | OSS |

## API image

Build and push the existing Dockerfile:

```bash
cd api
docker build -t registry.<region>.aliyuncs.com/<namespace>/bluearm-api:latest .
docker push registry.<region>.aliyuncs.com/<namespace>/bluearm-api:latest
```

Health check: `GET /health/schema`

Entrypoint runs migrations when `MIGRATE_ON_START=true`.

## Environment template

Copy [deploy/alibaba/env.api.example](../../deploy/alibaba/env.api.example) to your ECS task or Secrets Manager.

## DNS and CORS

1. Point `api.yourdomain.com` → TLS terminator (Caddy/Nginx/SLB) → ECS `:8080`  
   Browsers and CSP (`connect-src 'self' https:`) require **HTTPS**; do not point Vercel at `http://IP:8080`.
2. DNS `A`/`CNAME` for `api.` lives at your domain provider (or Vercel Domains DNS) — not as a Vercel *app* host.
3. Set `CORS_ORIGIN=https://app.yourdomain.com` (comma-separate previews/localhost as needed).
4. On Vercel set `VITE_API_BASE_URL` and `CMS_API_BASE_URL` to `https://api.yourdomain.com` (no trailing slash) and **redeploy**.

## Rate limits and request load

Copy rate-limit and performance knobs from [deploy/alibaba/env.api.example](../../deploy/alibaba/env.api.example).

| Knob | Suggested (single ECS) |
|------|------------------------|
| `RATE_LIMIT_AUTHENTICATED_RPM` | `300` (default in code is `200`) |
| `RATE_LIMIT_EXPENSIVE_RPM` | `60` (AI / export / scan) |
| `GZIP_ENABLED` | `true` |

Limits are **in-process**. One API container is fine; multi-instance needs Redis/Tair later.

If the SPA still gets `429` on normal clicks, raise authenticated RPM slightly, then reduce client chatter (dashboard polls, window-focus refetches) — see web `queryClient` defaults and `useDashboard` intervals.

## Production Singapore inventory (API host)

| Resource | ID / value |
|----------|------------|
| Region | `ap-southeast-1` |
| ECS (running) | `i-t4n5tdhzaktd0x6tc34w` (`bluearm-api`) |
| EIP | `eip-t4nth2ipn104wccqi669j` → **`43.98.186.58`** (converted from ephemeral public IP; DNS-stable) |
| Security group | `sg-t4n6gcxum9xwo7v6rusj` (`bluearm-api-sg`) |
| VPC / vSwitch | `vpc-t4n51j3wbrz4o84lts46t` / `vsw-t4ncft96y19seunewda1d` |
| Public hostname | `https://api.bluearmerp.com` (Caddy → `127.0.0.1:8080`) |

A second ECS `i-t4nda83gxmgl1a184760` may still exist **Stopped (KeepCharging)** — release it in console to stop disk charges if unused.

## Security group (hardened)

Inbound on `bluearm-api-sg` (after hardening):

| Port | Source | Purpose |
|------|--------|---------|
| TCP 443 | `0.0.0.0/0` | HTTPS (Caddy) |
| TCP 80 | `0.0.0.0/0` | ACME + HTTP→HTTPS |
| TCP 22 | `100.104.0.0/16` | Alibaba Workbench only (not public internet) |
| ICMP | `0.0.0.0/0` | Ping |

**Removed:** public TCP **8080** (API is local-only behind Caddy).

Verify:

```bash
curl -sS https://api.bluearmerp.com/health   # OK
# http://43.98.186.58:8080/health            # should time out from internet
```

## DDoS / WAF plan (not auto-provisioned)

### Already included (free)

**Anti-DDoS Origin Basic** covers ECS/EIP public IPs (~500 Mbps–5 Gbps scrubbing depending on type). Above threshold → blackhole (all traffic dropped). See [Anti-DDoS Origin Basic](https://www.alibabacloud.com/help/en/ecs/user-guide/anti-ddos-origin-basic).

Enough for casual noise; **not** enough for large volumetric attacks.

### Recommended next (paid — require explicit approval)

**Option A — Alibaba WAF 3.0 (CNAME mode)** — best fit for `api.bluearmerp.com`

1. Create pay-as-you-go WAF 3.0 instance (`waf-openapi` `CreatePostpaidInstance`, region Outside Chinese Mainland).
2. Add domain `api.bluearmerp.com` (`CreateDomain`) with origin `43.98.186.58:443` (or private IP via back-to-origin if using VPC mode later).
3. Upload/reuse TLS cert on WAF **or** keep TLS on Caddy (depending on decryption mode).
4. Change DNS `api` from **A → EIP** to **CNAME → WAF CNAME**.
5. Tighten SG so **only WAF back-to-origin IPs** (or WAF → ECS) can hit 443 — optional follow-up.

APIs: `CreatePostpaidInstance`, `CreateDomain` (`waf-openapi` 2021-10-01). Docs: [Add a domain via CNAME](https://www.alibabacloud.com/help/en/waf/web-application-firewall-3-0/user-guide/add-a-domain-name-to-waf-in-cname-record-mode).

**Option B — Cloudflare proxy (grey→orange)** — often cheaper for startups

1. Move `api` DNS to Cloudflare (or NS for whole zone).
2. Proxy orange-cloud; SSL Full (strict) to origin Caddy.
3. Enable bot fight / rate limiting / WAF rules.
4. Optionally lock Alibaba SG 443 to Cloudflare IP ranges.

No Alibaba MCP for Cloudflare — console or add a Cloudflare MCP.

**Option C — Anti-DDoS Proxy / Origin Advanced** — when under sustained Gbps attacks; higher cost.

### Do not create WAF via automation without a cost quote

Pay-as-you-go WAF bills continuously. Agent should only call `CreatePostpaidInstance` after you reply with an explicit **approve WAF** (and preferred option A/B/C).

## Still on Supabase (interim)

During Sprint 2 you can keep Supabase Auth + move only the API host:

- `SUPABASE_URL`, `SUPABASE_JWT_SECRET` unchanged
- `DATABASE_URL` → Supabase pooler or RDS when ready

## Next (Sprint 3)

- OSS blob store for `data/*` attachments
- Tair Redis if running multiple API instances

See [dashscope-rfq-ai.md](./dashscope-rfq-ai.md) for Qwen configuration.
