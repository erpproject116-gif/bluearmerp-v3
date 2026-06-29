# In-app documentation (Help & guides)

End-user help lives in the web app at `/app/documentation`, not in this folder’s developer READMEs.

## Source of truth

| What | Where |
|------|--------|
| User-facing copy | `web/src/modules/documentation/documentationSections.ts` |
| Page layout | `web/src/modules/documentation/DocumentationPage.tsx`, `DocumentationLayout.tsx` |
| Sidebar entry | `web/src/shell/modules.ts` (`id: documentation`) |
| Account menu link | `web/src/shell/UserAccountMenu.tsx` |

No API, migration, or permission row is required. Help & guides is visible to every signed-in user.

## When you add or change a feature

1. Update routes in `web/src/App.tsx` and labels in `web/src/shell/modules.ts`.
2. Add or edit a section in `documentationSections.ts` (or extend an existing one).
3. Set `primaryHref` to a real app path that exists in `App.tsx`.
4. Re-read the copy aloud—if it sounds like a developer doc, rewrite it.

## Tone checklist

- Write for a store owner or office staff, not engineers.
- Use **click**, **open**, **fill in**, **save**—not API paths, table names, or permission codes.
- Name screens exactly as they appear in the sidebar and header tabs.
- Use short sentences and numbered steps for workflows.
- For admin-only screens, say: “Ask your administrator” or “User Management can grant access.”
- Do **not** paste from `docs/modules/*/README.md` into in-app copy; those files are for operators and developers.

## Section index

| `sectionId` | Topic |
|-------------|--------|
| `getting-started` | Sidebar and header tabs |
| `dashboard` | Business Dashboard |
| `inventory` | Partners, items, stock |
| `serial-lot` | Serial/lot purchase-to-sale flow |
| `quotation` | Quotes |
| `tax-setup` | Tax types and currencies |
| `sales-order` | Orders and release |
| `sales` | Sales invoices |
| `collective-invoicing` | Combined invoices |
| `purchase-request` | PR → PO → goods receipt |
| `finance` | Official receipts and A/R |
| `crm` | CRM dashboard and follow-ups |
| `after-sales` | Repair orders |
| `admin` | Users, logs, branding |

## Verification

```bash
cd web && npm run build
```

Manual: sidebar scrolls on short viewports; account menu dropdown (Help, Branding, Sign out); `/app/documentation` and section URLs; each “Open this area” link loads a real screen.
