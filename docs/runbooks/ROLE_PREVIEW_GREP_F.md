# Epic F — `IsTenantOwner` / `IsPlatformSuperadmin` classification (role preview)

Effective flags are set **false** during preview in `applyRolePreviewOverlay`. No module file exceptions were required.

| Class | Examples | Notes |
|-------|----------|--------|
| (a) Covered by overlay | `branchiso`, `datascope`, `switch` branch list, `billing`, `branding`, entitlement middleware | Read effective flags; false under preview |
| (b) Lifecycle / Real* | `role_preview.go` start/end/extend | Uses real identity before overlay or `Real*` |
| (c) Out of scope / blocked by read-only | `transfer_ownership`, demodata, COA replace writes | Mutating HTTP → `ERR_ROLE_PREVIEW_READ_ONLY` |
| Auth internals | `loadTenantUser` scan, `attachPlatformIdentity` | Run before overlay |

**Exceptions outside allowlist:** 0
