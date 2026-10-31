# Activepieces spike — go/no-go (Step 4)

**Date:** 2026-10-31  
**Decision:** **CONDITIONAL GO**

## Criteria scored

| Criterion | Result | Notes |
|-----------|--------|-------|
| License for Bluearm-operated multi-tenant product | **Pass (CE MIT)** | Core MIT; `packages/ee` embed UI is commercial — do not use EE folders without license (`Observed` activepieces.com/docs/about/license) |
| True iframe embed builder | **Hold** | Embedding docs require Enterprise (`Observed` Configure Embedding) — Phase 2 after sales |
| Hosting without per-tenant VPS | **Pass** | One Activepieces instance on Bluearm ECS (or AP Cloud EE later); tenants never get Docker |
| Tenant isolation | **Pass (Phase 1)** | Phase 1: Bluearm owns flow templates; tenant_id in every webhook payload; writebacks use JWT of integration user or tenant-scoped action API + idempotency |
| SSO | **Partial** | Phase 1: deep-link to operator URL + Bluearm session gate on CRM Workflows page; Phase 2: AP JWT provision when EE licensed |
| Cost | **Unknown exact $** | CE self-host = infra only; EE embed = sales quote — **blocker for Phase 2 only** |
| n8n alternative | **Rejected for Path B create UX** | External customers editing flows needs n8n Enterprise under Sustainable Use License (`Observed` public license comparisons this session) |

## Go / no-go

| Phase | Verdict | Ship when |
|-------|---------|-----------|
| Phase 1 | **GO** | AEL-2 smoke (Step 2) green; AP instance URL set in `VITE_WORKFLOWS_ENGINE_URL`; recipes R1–R3 imported as templates; inbound action API deployed |
| Phase 2 iframe embed | **NO-GO until EE license** | Do not claim in-app canvas parity |

## If smoke (Step 2) fails

Do not point production CRM Workflows at a live engine. Keep page in “setup / BYO outbound” mode.

## Path A fallback claim

If Phase 1 hosting is abandoned: drop “Bluearm create/do” marketing; keep BYO outbound + lite rules only.
