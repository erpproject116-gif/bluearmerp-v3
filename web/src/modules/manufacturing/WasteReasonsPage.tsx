import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { mfgSuccess, mfgWarn } from "../production/mfgToast";

type WasteReason = {
  id: number;
  code: string;
  name: string;
  is_abnormal: boolean;
  is_active: boolean;
};

export default function WasteReasonsPage() {
  const [rows, setRows] = createSignal<WasteReason[]>([]);
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [abnormal, setAbnormal] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const load = async () => {
    const res = await apiFetch<WasteReason[]>("/api/v1/manufacturing/waste-reasons", undefined, { silent: true });
    if (res.success) setRows(res.data ?? []);
  };

  onMount(() => void load());

  const handleCreate = async () => {
    if (!code().trim() || !name().trim()) {
      mfgWarn(null, "Code and name are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch(
      "/api/v1/manufacturing/waste-reasons",
      {
        method: "POST",
        body: JSON.stringify({
          code: code().trim(),
          name: name().trim(),
          is_abnormal: abnormal(),
          is_active: true,
        }),
      },
      { silent: true },
    );
    setSaving(false);
    if (!res.success) {
      mfgWarn(res.message, "Could not save waste reason.");
      return;
    }
    mfgSuccess("Waste reason saved.");
    setCode("");
    setName("");
    setAbnormal(false);
    await load();
  };

  const toggleActive = async (row: WasteReason) => {
    const res = await apiFetch(
      `/api/v1/manufacturing/waste-reasons/${row.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          code: row.code,
          name: row.name,
          is_abnormal: row.is_abnormal,
          is_active: !row.is_active,
        }),
      },
      { silent: true },
    );
    if (!res.success) {
      mfgWarn(res.message, "Could not update.");
      return;
    }
    await load();
  };

  return (
    <div class="mx-auto max-w-3xl space-y-4">
      <div>
        <p class="text-xs text-text-secondary">
          <A href="/app/production/setup" class="hover:underline">
            Production setup
          </A>{" "}
          / Waste reasons
        </p>
        <h1 class="mt-1 text-xl font-semibold">Waste reasons</h1>
        <p class="text-sm text-text-secondary">Used on Cutting Post Production. Mark abnormal reasons that require selection.</p>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-4 space-y-3">
        <h2 class="text-sm font-semibold">Add reason</h2>
        <div class="grid gap-3 md:grid-cols-2">
          <Field label="Code">
            <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
          </Field>
          <Field label="Name">
            <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          </Field>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={abnormal()} onChange={(e) => setAbnormal(e.currentTarget.checked)} />
          Abnormal waste (requires reason when posting)
        </label>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving()}
          onClick={() => void handleCreate()}
        >
          Save reason
        </button>
      </section>

      <section class="rounded-xl border border-stroke bg-white overflow-hidden">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs text-text-secondary">
            <tr>
              <th class="px-3 py-2">Code</th>
              <th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Abnormal</th>
              <th class="px-3 py-2">Active</th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <Show when={rows().length === 0}>
              <tr>
                <td colSpan={5} class="px-3 py-6 text-center text-text-secondary">
                  No reasons yet.
                </td>
              </tr>
            </Show>
            <For each={rows()}>
              {(r) => (
                <tr class="border-t border-stroke/80">
                  <td class="px-3 py-2 font-medium">{r.code}</td>
                  <td class="px-3 py-2">{r.name}</td>
                  <td class="px-3 py-2">{r.is_abnormal ? "Yes" : "No"}</td>
                  <td class="px-3 py-2">{r.is_active ? "Yes" : "No"}</td>
                  <td class="px-3 py-2 text-right">
                    <button type="button" class="text-xs font-medium text-brand-700 hover:underline" onClick={() => void toggleActive(r)}>
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
    </div>
  );
}
