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

**If deploy fails on ECS with `403` / `Write access to repository not granted`:**

1. Token must reach the **private** repo `erpproject116-gif/bluearmerp-v3`
2. **Fine-grained PAT:** Resource owner = `erpproject116-gif` (or your user with org access) → Repository = `bluearmerp-v3` only → **Contents: Read-only**
3. **Classic PAT:** enable scope **`repo`** (full control of private repositories)
4. If the org uses **SAML SSO:** open the token in GitHub → **Configure SSO** → **Authorize** for `erpproject116-gif`
5. Regenerate the token if unsure → update GitHub secret `ECS_GIT_DEPLOY_TOKEN` → re-run workflow

The PAT is used only on ECS for `git fetch` (read-only). It is not the Actions `GITHUB_TOKEN`.

Manual deploy: **Actions → API ECS deploy → Run workflow**.

## Staging API

Staging is a second stack. It does not use the production ECS instance, the `bluearm-api` container, or the production Supabase database.

| Piece | Staging |
|--------|---------|
| ECS | A separate instance. Set repository variable `ECS_STAGING_INSTANCE_ID`. |
| Container | `bluearm-api-staging` on that instance, port 8080 |
| Database | A separate empty Supabase project. Put its pooler URI in the container env as `DATABASE_URL`. Set `MIGRATE_ON_START=true` so `api/migrations/` builds the schema on start. |
| Public URL | Repository variable `STAGING_API_PUBLIC_URL` (for example `https://api-staging.bluearmerp.com`) |
| Web | A future Vercel project whose `VITE_API_BASE_URL` is that staging API host |

Pushes to `staging` that touch `api/**` or `deploy/alibaba/**` run [`.github/workflows/api-ecs-staging-deploy.yml`](../../.github/workflows/api-ecs-staging-deploy.yml). The workflow fails closed when `ECS_STAGING_INSTANCE_ID` is empty, and it refuses the production instance. After deploy, `GET $STAGING_API_PUBLIC_URL/health/schema` must return `healthy: true`.

Create the Supabase project, ECS instance, DNS name, and Vercel project in those consoles. This repo does not create them. Do not restore a production database dump. Sample rows, if needed later, come from `scripts/seed-demo-*.sql`.

### RAM policy for GitHub deploy user

If the deploy job fails with `Forbidden.RAM` / `ecs:RunCommand` / `ImplicitDeny`, the AccessKey in GitHub secrets belongs to a RAM user **without** RunCommand rights — or you updated a **different** user than the one in GitHub secrets.

**Step 0 — find the exact RAM user GitHub uses**

1. Re-run the workflow and open the **Verify Alibaba RAM identity** step log.
2. Note the `UserId` / `Arn` printed there.
3. In RAM → **Users**, open **that** user (error logs may show e.g. `AuthPrincipalDisplayName: 214214188313890211` — that is the UID).

**Step 1 — attach permissions to that user (quick test)**

RAM → Users → *(user from step 0)* → **Add Permissions** → attach system policy **`AliyunECSFullAccess`**.

Re-run the workflow. If it passes, you can later replace with a tighter custom policy.

**Step 2 — if still `ResourceGroupLevelIdentityBasedPolicy` / `ImplicitDeny`**

The ECS instance lives in a **resource group** that blocks this RAM user.

1. Console → **Resource Management** → **Resource Groups**
2. Open the group that contains `bluearm-api` / `i-t4n5tdhzaktd0x6tc34w`
3. **Permission** (or **Authorize Resource Group**) → add the **same RAM user** from step 0
4. Grant a role that allows ECS management (or attach `AliyunECSFullAccess` at resource-group scope)

**Step 3 — tighter custom policy (after green deploy)**

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
      "Resource": "*"
    }
  ]
}
```

**Common mistakes**

- Policy attached to the wrong RAM user (Cursor/MCP may use a different key than GitHub)
- AccessKey in GitHub secrets is from an old/deleted key — create a new key on the correct user and update both secrets
- Resource group deny overrides user-level Allow

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
