import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "../../shared/Modal";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import {
  importMigMapped,
  listMigImportProfiles,
  MIG_ENTITY_FIELDS,
  MIG_REQUIRED,
  upsertMigImportProfile,
  type MigImportProfile,
  type MigImportSeed,
  type MigKind,
} from "../../shared/migrationCsvImport";

type Props = {
  open: boolean;
  kind: MigKind;
  title: string;
  onClose: () => void;
  onImported: () => void;
  /** Optional Copilot attachment seed: prefills the file and column map for review. */
  seed?: MigImportSeed | null;
};

function parseHeaders(text: string): string[] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return first.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

export function MigrationMappedImportModal(props: Props) {
  const toast = useToast();
  const fields = () => MIG_ENTITY_FIELDS[props.kind];
  const required = () => MIG_REQUIRED[props.kind];
  const [file, setFile] = createSignal<File | null>(null);
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [map, setMap] = createSignal<Record<string, string>>({});
  const [profiles, setProfiles] = createSignal<MigImportProfile[]>([]);
  const [profileName, setProfileName] = createSignal("");
  const [selectedProfileId, setSelectedProfileId] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [seedNote, setSeedNote] = createSignal("");

  createEffect(() => {
    if (!props.open) return;
    setFile(null);
    setHeaders([]);
    setMap({});
    setProfileName("");
    setSelectedProfileId(null);
    setSeedNote("");
    void listMigImportProfiles(props.kind).then((res) => {
      if (res.success && res.data) setProfiles(res.data);
    });
    const seed = props.seed;
    if (seed && seed.kind === props.kind && seed.csv_text?.trim()) {
      void applySeed(seed);
    }
  });

  const applySeed = async (seed: MigImportSeed) => {
    const f = new File([seed.csv_text ?? ""], seed.file_name || "copilot-import.csv", { type: "text/csv" });
    await onPickFile(f);
    if (seed.column_map) {
      const hdrs = new Set(parseHeaders(seed.csv_text ?? ""));
      const valid: Record<string, string> = {};
      for (const [field, header] of Object.entries(seed.column_map)) {
        if (fields().includes(field) && hdrs.has(header)) valid[field] = header;
      }
      setMap((prev) => ({ ...prev, ...valid }));
    }
    setSeedNote(
      seed.truncated
        ? "Prefilled from your Copilot attachment, but the extracted text was truncated — pick the original file above before importing."
        : "Prefilled from your Copilot attachment. Review the mapping, then Import.",
    );
    if (seed.truncated) setFile(null);
  };

  const onPickFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const hdrs = parseHeaders(text);
    setHeaders(hdrs);
    const next: Record<string, string> = {};
    for (const field of fields()) {
      const hit = hdrs.find((h) => h.toLowerCase() === field.toLowerCase());
      if (hit) next[field] = hit;
    }
    setMap(next);
  };

  const applyProfile = (id: number) => {
    setSelectedProfileId(id);
    const p = profiles().find((x) => x.id === id);
    if (p) {
      setMap({ ...p.column_map });
      setProfileName(p.name);
    }
  };

  const run = async () => {
    const f = file();
    if (!f) {
      toast.warning("Choose a CSV file first.");
      return;
    }
    const columnMap = map();
    for (const req of required()) {
      if (!columnMap[req]) {
        toast.warning(`Map required field: ${req}`);
        return;
      }
    }
    setBusy(true);
    try {
      const name = profileName().trim();
      if (name) {
        await upsertMigImportProfile({ kind: props.kind, name, column_map: columnMap });
      }
      const res = await importMigMapped(props.kind, f, {
        profileId: selectedProfileId(),
        columnMap,
      });
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
          Upload a CSV from another system, map columns to Bluearm fields, optionally save a mapping profile, then import.
        </p>
        <Show when={seedNote()}>
          <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{seedNote()}</p>
        </Show>
        <Field label="CSV file">
          <input
            type="file"
            accept=".csv,text/csv"
            class={inputClass}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void onPickFile(f);
            }}
          />
        </Field>
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
                <Field label={`${field}${required().includes(field) ? " *" : ""}`}>
                  <select
                    class={inputClass}
                    value={map()[field] ?? ""}
                    onChange={(e) => setMap((prev) => ({ ...prev, [field]: e.currentTarget.value }))}
                  >
                    <option value="">— skip —</option>
                    <For each={headers()}>{(h) => <option value={h}>{h}</option>}</For>
                  </select>
                </Field>
              )}
            </For>
          </div>
          <Field label="Save mapping as profile (optional)">
            <input class={inputClass} value={profileName()} onInput={(e) => setProfileName(e.currentTarget.value)} placeholder="e.g. QuickBooks items" />
          </Field>
        </Show>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Cancel
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
