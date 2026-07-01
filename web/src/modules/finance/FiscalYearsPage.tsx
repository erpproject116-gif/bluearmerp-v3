import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { FinanceLayout } from "./FinanceLayout";

type FiscalYear = {
  id: number;
  year_code: string;
  year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
};

type FiscalSettings = {
  accounts_block_backdated_post: boolean;
};

export default function FiscalYearsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [form, setForm] = createSignal({
    year_code: "",
    year_name: "",
    start_date: "",
    end_date: "",
    is_active: true,
  });

  const list = createQuery(() => ({
    queryKey: ["finance-fiscal-years"],
    queryFn: async () => {
      const res = await apiFetch<FiscalYear[]>("/api/v1/finance/fiscal-years?page=1&pageSize=200&sort=start_date&order=desc");
      if (!res.success) throw new Error(res.message ?? "Failed to load fiscal years");
      return res.data ?? [];
    },
  }));

  const settings = createQuery(() => ({
    queryKey: ["finance-fiscal-settings"],
    queryFn: async () => {
      const res = await apiFetch<FiscalSettings>("/api/v1/finance/fiscal-settings");
      if (!res.success) throw new Error(res.message ?? "Failed to load fiscal settings");
      return res.data ?? { accounts_block_backdated_post: false };
    },
  }));

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["finance-fiscal-years"] });
    void client.invalidateQueries({ queryKey: ["finance-fiscal-settings"] });
  };

  const openCreate = () => {
    setForm({ year_code: "", year_name: "", start_date: "", end_date: "", is_active: true });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await apiFetch<FiscalYear>("/api/v1/finance/fiscal-years", {
      method: "POST",
      body: JSON.stringify(form()),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create fiscal year.");
      return;
    }
    setModalOpen(false);
    refresh();
  };

  return (
    <FinanceLayout>
      <div class="mb-3 flex items-center justify-between">
        <p class="text-sm text-slate-600">
          Backdated posting policy:{" "}
          <span class="font-medium">
            {settings.data?.accounts_block_backdated_post ? "Blocked" : "Allowed"}
          </span>
        </p>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50" onClick={refresh}>
            Refresh
          </button>
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700" onClick={openCreate}>
            New fiscal year
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-stroke">
        <Show when={!list.isLoading} fallback={<p class="p-4 text-sm text-slate-500">Loading…</p>}>
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-3 py-2 text-left">Code</th>
                <th class="px-3 py-2 text-left">Name</th>
                <th class="px-3 py-2 text-left">Start</th>
                <th class="px-3 py-2 text-left">End</th>
                <th class="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <For each={list.data ?? []}>
                {(fy) => (
                  <tr class="border-t border-slate-100">
                    <td class="px-3 py-2">{fy.year_code}</td>
                    <td class="px-3 py-2">{fy.year_name}</td>
                    <td class="px-3 py-2">{fy.start_date}</td>
                    <td class="px-3 py-2">{fy.end_date}</td>
                    <td class="px-3 py-2">
                      {fy.is_closed ? "Closed" : fy.is_active ? "Active" : "Inactive"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <EntityModal
        open={modalOpen()}
        title="New fiscal year"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Field label="Year code">
          <input class={inputClass} value={form().year_code} onInput={(e) => setForm((v) => ({ ...v, year_code: e.currentTarget.value }))} />
        </Field>
        <Field label="Year name">
          <input class={inputClass} value={form().year_name} onInput={(e) => setForm((v) => ({ ...v, year_name: e.currentTarget.value }))} />
        </Field>
        <Field label="Start date">
          <input class={inputClass} type="date" value={form().start_date} onInput={(e) => setForm((v) => ({ ...v, start_date: e.currentTarget.value }))} />
        </Field>
        <Field label="End date">
          <input class={inputClass} type="date" value={form().end_date} onInput={(e) => setForm((v) => ({ ...v, end_date: e.currentTarget.value }))} />
        </Field>
        <div class="flex items-center gap-2 pt-7 text-sm">
          <input
            type="checkbox"
            checked={form().is_active}
            onChange={(e) => setForm((v) => ({ ...v, is_active: e.currentTarget.checked }))}
          />
          Set active fiscal year
        </div>
      </EntityModal>
    </FinanceLayout>
  );
}
