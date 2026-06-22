# ADR 0002: API contracts

## Status

Accepted

## Context

v2 established a consistent JSON envelope and list pagination params. v3 preserves compatibility for client portability.

## Decision

All API responses use:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": { "page": 1, "per_page": 50, "total": 100 },
  "errors": {},
  "code": "optional_error_code"
}
```

List endpoints accept: `page`, `pageSize` (max 100), `sort` (allow-list), `order`, `q`, `status`.

Mutations write to `audit_logs` with dotted `action_code` (e.g. `inventory.partner.create`).

## Consequences

- Solid client uses a single `apiFetch` helper.
- OpenAPI generation is deferred; envelope is stable for manual typing.
