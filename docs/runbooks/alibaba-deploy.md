# Alibaba Cloud deploy (production API)

The Go API runs on **Alibaba ECS** at `https://api.bluearmerp.com`. The SPA stays on Vercel; it calls ECS via `VITE_API_BASE_URL` and `CMS_API_BASE_URL`.

## CI/CD — GitHub Actions → ECS

Pushes to `main` that touch `api/**` trigger [`.github/workflows/api-ecs-deploy.yml`](../../.github/workflows/api-ecs-deploy.yml):

1. `go test` + `go build` on the runner
2. Alibaba ECS **RunCommand** on `i-t4n5tdhzaktd0x6tc34w` runs [`deploy/alibaba/deploy-api-on-ecs.sh`](../../deploy/alibaba/deploy-api-on-ecs.sh) (git pull + Docker rebuild)
3. Public `GET /health/schema` must return `healthy: true`

### GitHub repository secrets (required)

| Secret | Purpose |
|--------|---------|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | RAM user with `ecs:RunCommand` + `ecs:DescribeInvocationResults` on the API instance |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | Pair for the access key |
| `ECS_GIT_DEPLOY_TOKEN` | GitHub PAT with **read** access to `erpproject116-gif/bluearmerp-v3` (ECS `git fetch`) |

Create the PAT under GitHub → Settings → Developer settings → Fine-grained tokens (contents: read).

Manual deploy: **Actions → API ECS deploy → Run workflow**.

### RAM policy for GitHub deploy user

If the deploy job fails with `Forbidden.RAM` / `ecs:RunCommand` / `ImplicitDeny`, the AccessKey in GitHub secrets belongs to a RAM user **without** RunCommand rights.

1. [Alibaba Cloud Console](https://home.console.alibabacloud.com/) → **RAM** → **Users** → open the user tied to `ALIBABA_CLOUD_ACCESS_KEY_ID`
2. **Add Permissions** → **Create custom policy** → **Script configuration**
3. Paste this policy (region + instance scoped):

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RunCommand",
        "ecs:DescribeInvocationResults",
        "ecs:DescribeCloudAssistantStatus"
      ],
      "Resource": [
        "acs:ecs:ap-southeast-1:*:instance/i-t4n5tdhzaktd0x6tc34w",
        "acs:ecs:ap-southeast-1:*:command/*"
      ]
    }
  ]
}
```

4. Name it e.g. `github-ecs-deploy-runcommand` → create → attach to the RAM user
5. If you still get `ImplicitDeny` from a **resource group** policy, attach the same policy at the resource group that owns `bluearm-api`, or use a broader test policy with `"Resource": "*"` temporarily to confirm, then narrow scope

**Do not** use the root account AccessKey in GitHub. Use a dedicated RAM user.

After fixing RAM: **Actions → API ECS deploy → Re-run failed jobs** (no new commit required).

### One-time ECS prep

On the VM (`/root/bluearmerp-v3`):

```bash
git clone https://github.com/erpproject116-gif/bluearmerp-v3.git /root/bluearmerp-v3   # if missing
docker ps --filter name=bluearm-api    # container must exist with env already configured
```

First deploy preserves env via `docker inspect bluearm-api` → `/tmp/bluearm-api.env`. Set all API secrets on the container before enabling CI (see [env template](../../deploy/alibaba/env.api.example)).

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

## Background jobs (crontab on ECS — no extra Alibaba charge)

Use Linux `crontab` on the same `bluearm-api` VM (replaces any external cron scheduler):

| Schedule (UTC) | Endpoint | Purpose |
|----------------|----------|---------|
| Hourly | `POST /api/v1/platform/jobs/change-alert-digest` | Owner change email |
| Daily 10:00 | `POST /api/v1/platform/jobs/daily-ops-digest` | Daily ops email (~18:00 Manila) |
| Fri 10:00 | `POST /api/v1/platform/jobs/weekly-bi-digest` | Weekly BI email |
| 1st 01:00 | `POST /api/v1/platform/jobs/monthly-bi-digest` | Monthly BI email |
| Daily 10:30 | `POST /api/v1/crm/jobs/evaluate-alerts` | In-app notification bell |

Jobs call `http://127.0.0.1:8080` with `X-Change-Alert-Job-Secret` / `X-CRM-Job-Secret`. Secrets are read from the `bluearm-api` Docker env at runtime.

Template: [deploy/alibaba/ecs-crontab.example](../../deploy/alibaba/ecs-crontab.example)

**Verify:** `crontab -l | grep bluearm-cron` and `tail /var/log/bluearm-cron.log` on ECS.

**Requires on API container:** `CHANGE_ALERT_JOB_SECRET` and/or `CRM_JOB_SECRET` (digest accepts either; CRM needs `CRM_JOB_SECRET` or the helper falls back to `CHANGE_ALERT_JOB_SECRET`).
