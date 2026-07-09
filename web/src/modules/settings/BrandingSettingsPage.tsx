import { createEffect, createSignal, For, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useAuth, canManageBranding } from "../../shared/auth-context";
import { useBranding } from "../../shared/branding/BrandingProvider";
import {
  DEFAULT_BRANDING,
  LABEL_PRESETS,
  PLACEHOLDER_PRESETS,
  STAGE_KEYS,
} from "../../shared/branding/defaults";
import { UI_COPY_GROUPS } from "../../shared/branding/uiCopyCatalog";
import type { BrandingColors, BrandingReceipt, BrandingSettings } from "../../shared/branding/types";
import { StageBadge } from "../../shared/branding/StageBadge";
import { progressStatusLabel } from "../../shared/branding/progressStatus";
import { BrandingLogoImage } from "../../shared/branding/BrandingLogoImage";
import { useToast } from "../../shared/toast";

const COLOR_FIELDS: { key: keyof BrandingColors; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "primary_hover", label: "Primary hover" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "heading", label: "Headings" },
  { key: "label", label: "Labels" },
  { key: "text", label: "Body text" },
  { key: "text_secondary", label: "Secondary text" },
  { key: "background", label: "Page background" },
  { key: "surface", label: "Surface / cards" },
  { key: "stroke", label: "Borders" },
];

const RECEIPT_FIELDS: { key: keyof BrandingReceipt; label: string; multiline?: boolean }[] = [
  { key: "company_name", label: "Company name" },
  { key: "address", label: "Address", multiline: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "tax_id", label: "Tax ID (TIN) — used on BIR 2307 payor" },
  { key: "header_text", label: "Extra header text", multiline: true },
  { key: "footer_text", label: "Receipt footer", multiline: true },
];

const MAX_LOGO_MB = 2;

export default function BrandingSettingsPage() {
  const auth = useAuth();
  const branding = useBranding();
  const toast = useToast();
  const [draft, setDraft] = createSignal<BrandingSettings>(DEFAULT_BRANDING);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const syncDraft = () => {
    setDraft(branding.settings());
    setDirty(false);
  };

  createEffect(() => {
    branding.settings();
    if (!dirty()) syncDraft();
  });

  const patchColors = (key: keyof BrandingColors, value: string) => {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
    setDirty(true);
  };

  const patchStage = (key: string, field: "bg" | "text", value: string) => {
    setDraft((d) => ({
      ...d,
      stages: { ...d.stages, [key]: { ...d.stages[key], [field]: value } },
    }));
    setDirty(true);
  };

  const patchReceipt = (key: keyof BrandingReceipt, value: string) => {
    setDraft((d) => ({ ...d, receipt: { ...d.receipt, [key]: value } }));
    setDirty(true);
  };

  const patchLabel = (key: string, value: string) => {
    setDraft((d) => ({ ...d, labels: { ...d.labels, [key]: value } }));
    setDirty(true);
  };

  const patchPlaceholder = (key: string, value: string) => {
    setDraft((d) => ({ ...d, placeholders: { ...d.placeholders, [key]: value } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const ok = await branding.save(draft());
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const onLogoFile = async (file: File) => {
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      toast.error(`Logo must be ${MAX_LOGO_MB} MB or smaller.`);
      return;
    }
    const ok = await branding.uploadLogo(file);
    if (ok) syncDraft();
  };

  if (!canManageBranding(auth.me)) {
    return <Navigate href="/app" />;
  }

  return (
    <div class="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <h1 class="text-2xl font-semibold text-text-primary">Branding &amp; appearance</h1>
        <p class="mt-1 text-sm text-text-secondary">
          Customize colors, logo, labels, and stage badges for the whole app — sidebar, headers, grids, modals, and print/receipt layouts. Saved settings apply for all users in this tenant.
        </p>
      </header>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-medium text-text-primary">Color palette</h2>
          <button
            type="button"
            class="text-sm text-brand-600 hover:underline"
            onClick={() => {
              setDraft((d) => ({ ...d, colors: { ...DEFAULT_BRANDING.colors } }));
              setDirty(true);
            }}
          >
            Reset colors
          </button>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <For each={COLOR_FIELDS}>
            {(f) => (
              <Field label={f.label}>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    class="h-9 w-12 cursor-pointer rounded border border-stroke"
                    value={draft().colors[f.key]}
                    onInput={(e) => patchColors(f.key, e.currentTarget.value)}
                  />
                  <input
                    type="text"
                    class={inputClass}
                    value={draft().colors[f.key]}
                    onInput={(e) => patchColors(f.key, e.currentTarget.value)}
                  />
                </div>
              </Field>
            )}
          </For>
        </div>
      </section>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <h2 class="text-lg font-medium text-text-primary">Stage / progress colors</h2>
        <p class="mt-1 text-sm text-text-secondary">Background and text for workflow stage badges.</p>
        <div class="mt-4 space-y-3">
          <For each={STAGE_KEYS}>
            {(key) => (
              <div class="flex flex-wrap items-center gap-3 rounded-lg border border-stroke p-3">
                <StageBadge status={key} label={progressStatusLabel(key)} />
                <Field label="Background">
                  <input
                    type="color"
                    class="h-9 w-12 rounded border border-stroke"
                    value={draft().stages[key]?.bg ?? "#f1f5f9"}
                    onInput={(e) => patchStage(key, "bg", e.currentTarget.value)}
                  />
                </Field>
                <Field label="Text">
                  <input
                    type="color"
                    class="h-9 w-12 rounded border border-stroke"
                    value={draft().stages[key]?.text ?? "#1c2434"}
                    onInput={(e) => patchStage(key, "text", e.currentTarget.value)}
                  />
                </Field>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <h2 class="text-lg font-medium text-text-primary">Company logo &amp; print header</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Logo and company details appear in the app sidebar and on printed reports. Report templates can override these per report.
        </p>
        <div class="mt-4 flex flex-wrap items-start gap-4">
          <BrandingLogoImage />
          <label class="cursor-pointer rounded-lg border border-stroke px-3 py-2 text-sm hover:erp-panel">
            Upload logo (max {MAX_LOGO_MB} MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              class="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void onLogoFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <For each={RECEIPT_FIELDS}>
            {(f) => (
              <div class={f.multiline ? "sm:col-span-2" : ""}>
              <Field label={f.label}>
                <Show
                  when={f.multiline}
                  fallback={
                    <input
                      type="text"
                      class={inputClass}
                      value={String(draft().receipt[f.key] ?? "")}
                      onInput={(e) => patchReceipt(f.key, e.currentTarget.value)}
                    />
                  }
                >
                  <textarea
                    class={`${inputClass} min-h-[4rem]`}
                    value={String(draft().receipt[f.key] ?? "")}
                    onInput={(e) => patchReceipt(f.key, e.currentTarget.value)}
                  />
                </Show>
              </Field>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <h2 class="text-lg font-medium text-text-primary">App &amp; progress labels</h2>
        <p class="mt-1 text-sm text-text-secondary">Sidebar, sign-out, and workflow stage badge text.</p>
        <div class="mt-4 space-y-3">
          <For each={LABEL_PRESETS}>
            {(p) => (
              <Field label={`${p.label} (${p.key})`}>
                <input
                  type="text"
                  class={inputClass}
                  placeholder={p.fallback}
                  value={draft().labels[p.key] ?? ""}
                  onInput={(e) => patchLabel(p.key, e.currentTarget.value)}
                />
              </Field>
            )}
          </For>
        </div>
      </section>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <h2 class="text-lg font-medium text-text-primary">Screen copy</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Section headings, buttons, empty states, and filter labels across selling, purchasing, lists, and reports.
        </p>
        <div class="mt-6 space-y-8">
          <For each={UI_COPY_GROUPS}>
            {(group) => (
              <div>
                <h3 class="text-sm font-semibold text-text-primary">{group.title}</h3>
                <Show when={group.description}>
                  <p class="mt-0.5 text-xs text-text-secondary">{group.description}</p>
                </Show>
                <div class="mt-3 space-y-3">
                  <For each={group.entries}>
                    {(p) => (
                      <Field label={`${p.label} (${p.key})`}>
                        <input
                          type="text"
                          class={inputClass}
                          placeholder={p.fallback}
                          value={draft().labels[p.key] ?? ""}
                          onInput={(e) => patchLabel(p.key, e.currentTarget.value)}
                        />
                      </Field>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="erp-surface rounded-xl border border-stroke p-5 shadow-sm">
        <h2 class="text-lg font-medium text-text-primary">Custom placeholders</h2>
        <div class="mt-4 space-y-3">
          <For each={PLACEHOLDER_PRESETS}>
            {(p) => (
              <Field label={`${p.label} (${p.key})`}>
                <input
                  type="text"
                  class={inputClass}
                  placeholder={p.fallback}
                  value={draft().placeholders[p.key] ?? ""}
                  onInput={(e) => patchPlaceholder(p.key, e.currentTarget.value)}
                />
              </Field>
            )}
          </For>
        </div>
      </section>

      <div class="flex gap-3 pb-8">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!dirty() || saving()}
          onClick={() => void save()}
        >
          {saving() ? "Saving…" : "Save branding"}
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm"
          disabled={!dirty()}
          onClick={syncDraft}
        >
          Discard changes
        </button>
      </div>
    </div>
  );
}
