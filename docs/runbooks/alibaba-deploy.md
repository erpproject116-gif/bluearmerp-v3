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

1. Point `api.yourdomain.com` → SLB/ALB → ECS `:8080`
2. Set `CORS_ORIGIN=https://app.yourdomain.com`
3. Rebuild frontend with `VITE_API_BASE_URL=https://api.yourdomain.com`

## Still on Supabase (interim)

During Sprint 2 you can keep Supabase Auth + move only the API host:

- `SUPABASE_URL`, `SUPABASE_JWT_SECRET` unchanged
- `DATABASE_URL` → Supabase pooler or RDS when ready

## Next (Sprint 3)

- OSS blob store for `data/*` attachments
- Tair Redis if running multiple API instances

See [dashscope-rfq-ai.md](./dashscope-rfq-ai.md) for Qwen configuration.
