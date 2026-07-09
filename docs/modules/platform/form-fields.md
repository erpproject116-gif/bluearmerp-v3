# Custom and form field settings

Tenant-scoped labels, visibility, required rules, and custom fields on transaction and master-data forms.

## User-facing behavior

| Capability | Where |
|------------|--------|
| Standard field settings | Each document list → **Settings** (gear) → form fields page |
| Custom fields on forms | **Custom fields** section on supported modals/pages |
| Inline add custom field | **+ Add custom field** on the form (store admin / owner only) |

Supported inline-add surfaces use `CustomFieldsSection` in the web app (quotation, repair order, items, partners, locations, projects, departments). Selling/buying document modals use form-field validation via `useFormFieldSettings`.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET/PATCH /api/v1/form-field-settings?entity_type=` | Standard + custom field layout per entity |
| `GET/POST /api/v1/custom-fields` | Custom field definitions |
| `DELETE /api/v1/custom-fields/{id}` | Soft-disable a custom field |

Entity types are registered in `api/internal/platform/formfields/registry.go`.

## Web source

| File | Role |
|------|------|
| `web/src/shared/useFormFieldSettings.ts` | Query cache, `can_manage`, active custom fields |
| `web/src/shared/CustomFieldsSection.tsx` | Renders custom field inputs |
| `web/src/shared/InlineCustomFieldAdder.tsx` | Inline create without leaving the form |
| `web/src/shared/EntityFormSettingsPage.tsx` | Full settings page (gear icon) |

## In-app documentation

- Guide: **Getting started** → Knowledge base → `form-field-settings`, `inline-custom-fields`
- Sections: `documentationSections.ts` (admin area references form settings)

## Migrations

- `004_custom_fields.sql` — definitions + values
- `005_form_field_settings.sql` — standard field overrides per tenant

## Manual test

1. As store admin, open New Quotation → **+ Add custom field** → add a required text field.
2. Save quotation without filling it — validation warns by label.
3. Open Sales → Settings → confirm the same field appears in the list.
4. On PO / RFQ / supplier invoice modals, confirm tax type and currency validation respects form settings (required IDs must be non-zero).
