import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "../../shared/Modal";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import {
  importDtrMapped,
  importEmployeesMapped,
  listHrImportProfiles,
  upsertHrImportProfile,
  type HrImportProfile,
} from "../../shared/hrCsvImport";

const EMPLOYEE_FIELDS = [
  "employee_no",
  "full_name",
  "department",
  "job_title",
  "hire_date",
  "status",
  "base_salary",
  "email",
  "tin",
  "sss_no",
  "philhealth_no",
  "pagibig_no",
  "tax_status",
] as const;

const DTR_FIELDS = ["employee_no", "work_date", "status", "hours_worked", "ot_hours", "night_diff_hours"] as const;

type Kind = "employees" | "dtr";

type Props = {
  open: boolean;
  kind: Kind;
  onClose: () => void;
  onImported: () => void;
};

function parseHeaders(text: string): string[] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return first.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

/** Map a non-canonical CSV to Bluearm columns, optionally save as a profile. */
export function HrMappedImportModal(props: Props) {
  const toast = useToast();
  const fields = () => (props.kind === "employees" ? [...EMPLOYEE_FIELDS] : [...DTR_FIELDS]);
  const [file, setFile] = createSignal<File | null>(null);
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [map, setMap] = createSignal<Record<string, string>>({});
  const [profiles, setProfiles] = createSignal<HrImportProfile[]>([]);
  const [profileName, setProfileName] = createSignal("");
  const [selectedProfileId, setSelectedProfileId] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setFile(null);
    setHeaders([]);
    setMap({});
    setProfileName("");
    setSelectedProfileId(null);
    void listHrImportProfiles(props.kind).then((res) => {
      if (res.ok && res.data) setProfiles(res.data);
    });
  });

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
    if (!columnMap.full_name && props.kind === "employees") {
      toast.warning("Map at least full_name.");
      return;
    }
    if (!columnMap.employee_no && props.kind === "dtr") {
      toast.warning("Map at least employee_no.");
      return;
    }
    setBusy(true);
    try {
      if (profileName().trim()) {
        await upsertHrImportProfile(props.kind, profileName().trim(), columnMap);
      }
      const result =
        props.kind === "employees"
          ? await importEmployeesMapped(f, {
              profileId: selectedProfileId() ?? undefined,
              columnMap,
            })
          : await importDtrMapped(f, {
              profileId: selectedProfileId() ?? undefined,
              columnMap,
            });
      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Import failed.");
        return;
      }
      const { created, updated = 0, failed, row_errors: rowErrors } = result.data;
      if (failed > 0) {
        const detail =
          rowErrors
            ?.slice(0, 4)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join(" · ") ?? "";
        toast.warning(`Imported ${created}, updated ${updated}; ${failed} failed.${detail ? ` ${detail}` : ""}`);
      } else {
        toast.success(`Imported ${created}, updated ${updated}.`);
      }
      if (created > 0 || updated > 0) {
        props.onImported();
        props.onClose();
      }
    } catch {
      toast.error("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={props.open}
      title={props.kind === "employees" ? "Import employees with mapping" : "Import DTR with mapping"}
      onClose={props.onClose}
      stacked
    >
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">
          Upload any CSV, match your column headers to Bluearm fields, optionally save the map, then import.
        </p>
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
                const id = Number(e.currentTarget.value);
                if (id) applyProfile(id);
              }}
            >
              <option value="">None</option>
              <For each={profiles()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
            </select>
          </Field>
        </Show>
        <Show when={headers().length > 0}>
          <div class="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-stroke p-3">
            <For each={fields()}>
              {(field) => (
                <div class="grid grid-cols-2 items-center gap-2 text-sm">
                  <span class="font-medium text-text-primary">{field}</span>
                  <select
                    class={inputClass}
                    value={map()[field] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, [field]: e.currentTarget.value }))}
                  >
                    <option value="">— skip —</option>
                    <For each={headers()}>{(h) => <option value={h}>{h}</option>}</For>
                  </select>
                </div>
              )}
            </For>
          </div>
          <Field label="Save map as profile (optional)">
            <input
              class={inputClass}
              value={profileName()}
              placeholder="e.g. Biometrics export"
              onInput={(e) => setProfileName(e.currentTarget.value)}
            />
          </Field>
        </Show>
      </div>
      <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={busy() || !file()}
          onClick={() => void run()}
        >
          {busy() ? "Importing…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}
