# Tenant isolation audit (interim safety net until Postgres RLS lands).
#
# Isolation in this codebase is application-level: every query against a tenant-scoped
# table must include a `tenant_id` predicate bound to the caller's TenantID. This script
# flags Go handler files that run SQL against `public.*` tables but never reference
# `tenant_id`, so a human can confirm each is either (a) querying a genuinely global
# table (module_registry, permission_registry, quo_tax_types, etc.) or (b) a real gap.
#
# Usage (from repo root):  pwsh bluearmerp-v3/scripts/audit-tenant-scope.ps1
# It is heuristic: absence of `tenant_id` is a prompt to review, not proof of a bug.

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "..\api\internal\modules"

# Tables that are intentionally global (no tenant_id column) — reviewed exceptions.
$globalTables = @(
  "module_registry", "module_dependencies", "permission_registry",
  "platform_users", "quo_tax_types"
)

$flagged = @()
Get-ChildItem -Path $root -Recurse -Filter *.go | ForEach-Object {
  $text = Get-Content -Raw $_.FullName
  $hasSql = $text -match "(?i)(from|join|update|delete\s+from|insert\s+into)\s+public\."
  if (-not $hasSql) { return }
  $hasTenant = $text -match "tenant_id"
  if (-not $hasTenant) {
    $flagged += [pscustomobject]@{ File = $_.FullName.Replace((Resolve-Path "$PSScriptRoot\..").Path, "") }
  }
}

if ($flagged.Count -eq 0) {
  Write-Host "OK: every handler file with public.* SQL references tenant_id." -ForegroundColor Green
} else {
  Write-Host "Review these files (public.* SQL with no tenant_id reference):" -ForegroundColor Yellow
  $flagged | ForEach-Object { Write-Host "  $($_.File)" }
  Write-Host "`nConfirm each only touches global tables: $($globalTables -join ', ')" -ForegroundColor DarkGray
}
