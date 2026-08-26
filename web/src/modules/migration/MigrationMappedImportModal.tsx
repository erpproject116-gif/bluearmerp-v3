import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "../../shared/Modal";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import {
  downloadMigImportTemplate,
  importMigMapped,
  listMigImportProfiles,
  MIG_ENTITY_FIELDS,
  MIG_NEEDS_ITEM,
  MIG_NEEDS_JOB_DEFAULTS,
  MIG_REQUIRED,
  parseCsvHeaders,
  previewMigMapped,
  spreadsheetToCsvFile,
  upsertMigImportProfile,
  type MigImportProfile,
  type MigImportResult,
  type MigImportSeed,
  type MigKind,
} from "../../shared/migrationCsvImport";
import { useActiveCurrencies, useActiveTaxTypes, fetchLocationOptions } from "../../shared/useDocumentLookups";
import type { LookupOption } from "../../shared/LookupCombo";

type Props = {
  open: boolean;
  kind: MigKind;
  title: string;
  onClose: () => void;
  onImported: () => void;
  seed?: MigImportSeed | null;
};

export function MigrationMappedImportModal(props: Props) {
  const toast = useToast();
  const fields = () => MIG_ENTITY_FIELDS[props.kind];
  const required = () => MIG_REQUIRED[props.kind];
  const needsJob = () => MIG_NEEDS_JOB_DEFAULTS[props.kind];
  const taxTypes = useActiveTaxTypes(() => props.open && needsJob());
  const currencies = useActiveCurrencies(() => props.open && needsJob());
  const [locations, setLocations] = createSignal<LookupOption[]>([]);
  const [file, setFile] = createSignal<File | null>(null);
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [map, setMap] = createSignal<Record<string, string>>({});
  const [profiles, setProfiles] = createSignal<MigImportProfile[]>([]);
  const [profileName, setProfileName] = createSignal("");
  const [selectedProfileId, setSelectedProfileId] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [seedNote, setSeedNote] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [preview, setPreview] = createSignal<MigImportResult | null>(null);

  createEffect(() => {
    if (!props.open) return;
    setFile(null);
    setHeaders([]);
    setMap({});
    setProfileName("");
    setSelectedProfileId(null);
    setSeedNote("");
    setPreview(null);
    setTaxTypeId(null);
    setCurrencyId(null);
    setLocationId(null);
    void listMigImportProfiles(props.kind).then((res) => {
      if (res.success && res.data) setProfiles(res.data);
    });
    if (needsJob()) {
      void fetchLocationOptions("").then(setLocations);
    }
    const seed = props.seed;
    if (seed && seed.kind === props.kind && seed.csv_text?.trim()) {
      void applySeed(seed);
    }
  });

  const applySeed = async (seed: MigImportSeed) => {
    const f = new File([seed.csv_text ?? ""], seed.file_name || "copilot-import.csv", { type: "text/csv" });
    await onPickFile(f);
    if (seed.column_map) {
      const hdrs = new Set(parseCsvHeaders(seed.csv_text ?? ""));
      const valid: Record<string, string> = {};
      for (const [field, header] of Object.entries(seed.column_map)) {
        if (fields().includes(field) && hdrs.has(header)) valid[field] = header;
      }
      setMap((prev) => ({ ...prev, ...valid }));
    }
    setSeedNote(
      seed.truncated
        ? "Prefilled from your Baiko attachment, but the extracted text was truncated — pick the original CSV or Excel file above before importing."
        : "Prefilled from your Baiko attachment. Review the mapping, Preview, then Import.",
    );
    if (seed.truncated) setFile(null);
  };

  const onPickFile = async (f: File) => {
    try {
      const csv = await spreadsheetToCsvFile(f);
      setFile(csv);
      const text = await csv.text();
      const hdrs = parseCsvHeaders(text);
      setHeaders(hdrs);
      const next: Record<string, string> = {};
      for (const field of fields()) {
        const hit = hdrs.find((h) => h.toLowerCase() === field.toLowerCase());
        if (hit) next[field] = hit;
      }
      setMap(next);
      setPreview(null);
    } catch (err) {
      toast.warning(err instanceof Error ? err.message : "Could not read spreadsheet.");
    }
  };

  const applyProfile = (id: number) => {
    setSelectedProfileId(id);
    const p = profiles().find((x) => x.id === id);
    if (p) {
      setMap({ ...p.column_map });
      setProfileName(p.name);
    }
  };

  const jobOpts = () => ({
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    location_id: locationId(),
  });

  const validateMaps = () => {
    const f = file();
    if (!f) {
      toast.warning("Choose a CSV or Excel file first.");
      return null;
    }
    const columnMap = map();
    for (const req of required()) {
      if (!columnMap[req]) {
        toast.warning(`Map required field: ${req}`);
        return null;
      }
    }
    if (MIG_NEEDS_ITEM[props.kind] && !columnMap.item_code && !columnMap.item) {
      toast.warning("Map item_code or item.");
      return null;
    }
    if (needsJob()) {
      if (!taxTypeId() || !currencyId() || !locationId()) {
        toast.warning("Choose tax type, currency, and warehouse for this import.");
        return null;
      }
    }
    return { file: f, columnMap };
  };

  const runPreview = async () => {
    const ready = validateMaps();
    if (!ready) return;
    setBusy(true);
    try {
      const res = await previewMigMapped(props.kind, ready.file, { columnMap: ready.columnMap, job: jobOpts() });
      if (!res.success || !res.data) {
        toast.warning(res.message ?? "Preview failed.");
        return;
      }
      setPreview(res.data);
      if (res.data.failed > 0) {
        toast.warning(`${res.data.failed} row(s) would fail. Fix the file or mapping before Import.`);
      } else {
        toast.success(`Preview: ${res.data.created} would be created${res.data.updated ? `, ${res.data.updated} updated` : ""}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    const ready = validateMaps();
    if (!ready) return;
    setBusy(true);
    try {
      const name = profileName().trim();
      if (name) {
        await upsertMigImportProfile({ kind: props.kind, name, column_map: ready.columnMap });
      }
      const res = await importMigMapped(props.kind, ready.file, { columnMap: ready.columnMap, job: jobOpts() });
      if (!res.success || !res.data) {
        toast.warning(res.message ?? "Import failed.");
        return;
      }
      const d = res.data;
      toast.success(`Import done: ${d.created} created${d.updated ? `, ${d.updated} updated` : ""}, ${d.failed} failed.`);
      if (d.row_errors?.length) {
        toast.warning(d.row_errors.slice(0, 3).map((e) => `Row ${e.row}: ${e.message}`).join(" · "));
      }
      props.onImported();
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose} wide>
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">
          Download the template and fill it, or upload a CSV/Excel export from another system and map columns. Preview
          writes nothing. Replace the EXAMPLE row before Import. Dates must be YYYY-MM-DD. Amounts use a dot, no thousands
          separators. For open documents, <strong>item_code</strong>, <strong>item</strong>, and <strong>quantity</strong> are
          optional — blank cells are skipped; unmatched codes import as free-text lines (qty defaults to 1). Serial-tracked
          items are skipped on unpaid sales/purchases. Open invoices also need tax type, currency, and warehouse below.
        </p>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
          onClick={() => void downloadMigImportTemplate(props.kind).catch(() => toast.error("Could not download template."))}
        >
          Download template
        </button>
        <Show when={seedNote()}>
          <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{seedNote()}</p>
        </Show>
        <Field label="CSV or Excel file">
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            class={inputClass}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void onPickFile(f);
            }}
          />
        </Field>
        <Show when={needsJob()}>
          <div class="grid gap-3 md:grid-cols-3">
            <Field label="Tax type *">
              <select
                class={inputClass}
                value={taxTypeId() ?? ""}
                onChange={(e) => setTaxTypeId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              >
                <option value="">—</option>
                <For each={taxTypes.data ?? []}>{(t) => <option value={t.id}>{t.name}</option>}</For>
              </select>
            </Field>
            <Field label="Currency *">
              <select
                class={inputClass}
                value={currencyId() ?? ""}
                onChange={(e) => setCurrencyId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              >
                <option value="">—</option>
                <For each={currencies.data ?? []}>{(c) => <option value={c.id}>{c.currency_code}</option>}</For>
              </select>
            </Field>
            <Field label="Warehouse *">
              <select
                class={inputClass}
                value={locationId() ?? ""}
                onChange={(e) => setLocationId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              >
                <option value="">—</option>
                <For each={locations()}>{(l) => <option value={l.id}>{l.label}</option>}</For>
              </select>
            </Field>
          </div>
        </Show>
        <Show when={profiles().length > 0}>
          <Field label="Saved profile">
            <select
              class={inputClass}
              value={selectedProfileId() ?? ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v) applyProfile(Number(v));
                else setSelectedProfileId(null);
              }}
            >
              <option value="">None</option>
              <For each={profiles()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
            </select>
          </Field>
        </Show>
        <Show when={headers().length > 0}>
          <div class="grid gap-3 md:grid-cols-2">
            <For each={fields()}>
              {(field) => (
                <Field label={`${field}${required().includes(field) || (MIG_NEEDS_ITEM[props.kind] && (field === "item_code" || field === "item")) ? " *" : ""}`}>
                  <select
                    class={inputClass}
                    value={map()[field] ?? ""}
                    onChange={(e) => {
                      setMap((prev) => ({ ...prev, [field]: e.currentTarget.value }));
                      setPreview(null);
                    }}
                  >
                    <option value="">— skip —</option>
                    <For each={headers()}>{(h) => <option value={h}>{h}</option>}</For>
                  </select>
                </Field>
              )}
            </For>
          </div>
          <Field label="Save mapping as profile (optional)">
            <input class={inputClass} value={profileName()} onInput={(e) => setProfileName(e.currentTarget.value)} placeholder="e.g. Utak sales" />
          </Field>
        </Show>
        <Show when={preview()}>
          {(p) => (
            <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-text-secondary">
              Preview: {p().created} would be created{p().updated ? `, ${p().updated} updated` : ""}, {p().failed} failed.
              <Show when={p().row_errors?.length}>
                <span class="mt-1 block text-xs">
                  {p()
                    .row_errors!.slice(0, 8)
                    .map((e) => `Row ${e.row}: ${e.message}`)
                    .join(" · ")}
                </span>
              </Show>
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy() || !file()}
            onClick={() => void runPreview()}
          >
            {busy() ? "Working…" : "Preview"}
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy() || !file()}
            onClick={() => void run()}
          >
            {busy() ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
