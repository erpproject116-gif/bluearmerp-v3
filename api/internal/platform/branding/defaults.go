package branding

// DefaultSettingsJSON is the baseline branding document merged with tenant overrides.
const DefaultSettingsJSON = `{
  "colors": {
    "primary": "#3c50e0",
    "primary_hover": "#3641c9",
    "secondary": "#64748b",
    "accent": "#0ea5e9",
    "heading": "#1c2434",
    "label": "#475569",
    "text": "#1c2434",
    "text_secondary": "#64748b",
    "background": "#f1f5f9",
    "surface": "#ffffff",
    "stroke": "#e2e8f0"
  },
  "stages": {
    "unconfirmed": { "bg": "#fef3c7", "text": "#92400e" },
    "in_progress": { "bg": "#dbeafe", "text": "#1e40af" },
    "completed": { "bg": "#dcfce7", "text": "#166534" },
    "received": { "bg": "#e0e7ff", "text": "#3730a3" },
    "finished": { "bg": "#dcfce7", "text": "#166534" },
    "partial": { "bg": "#ffedd5", "text": "#9a3412" }
  },
  "labels": {},
  "placeholders": {},
  "receipt": {
    "company_name": "",
    "address": "",
    "phone": "",
    "email": "",
    "tax_id": "",
    "header_text": "",
    "footer_text": "",
    "logo_asset_id": null
  }
}`
