import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { GridExportButtons } from "../../shared/gridExport";
import { useToast } from "../../shared/toast";
import { FinanceLayout } from "./FinanceLayout";
import { uiLabel } from "../../shared/branding/uiLabel";

type FiscalYear = {
  id: number;
  year_code: string;
  year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
};

type FiscalPeriod = {
  id: number;
  fiscal_year_id: number;
  period_code: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  year_code?: string;
};

type FiscalSettings = {
  accounts_block_backdated_post: boolean;
};

export default function FiscalYearsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [lockingId, setLockingId] = createSignal<number | null>(null);
  const [periodLockingId, setPeriodLockingId] = createSignal<number | null>(null);
  const [selectedYearId, setSelectedYearId] = createSignal<number | null>(null);
  const [generating, setGenerating] = createSignal(false);
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

  const periods = createQuery(() => ({
    queryKey: ["finance-fiscal-periods", selectedYearId()],
    enabled: selectedYearId() != null,
    queryFn: async () => {
      const id = selectedYearId();
      if (id == null) return [] as FiscalPeriod[];
      const res = await apiFetch<FiscalPeriod[]>(
        `/api/v1/finance/fiscal-periods?page=1&pageSize=24&sort=start_date&order=asc&fiscal_year_id=${id}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load fiscal periods");
      return res.data ?? [];
    },
  }));

  createEffect(() => {
    const rows = list.data ?? [];
    if (rows.length === 0) {
      setSelectedYearId(null);
      return;
    }
    const current = selectedYearId();
    if (current != null && rows.some((r) => r.id === current)) return;
    const preferred = rows.find((r) => r.is_active && !r.is_closed) ?? rows[0];
    setSelectedYearId(preferred.id);
  });

  const selectedYear = () => (list.data ?? []).find((y) => y.id === selectedYearId()) ?? null;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["finance-fiscal-years"] });
    void client.invalidateQueries({ queryKey: ["finance-fiscal-settings"] });
    void client.invalidateQueries({ queryKey: ["finance-fiscal-periods"] });
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
    if (res.data?.id) setSelectedYearId(res.data.id);
    refresh();
  };

  const setYearClosed = async (fy: FiscalYear, close: boolean) => {
    const action = close ? "close" : "reopen";
    const label = close ? "Close" : "Reopen";
    if (
      close &&
      !window.confirm(
        `Close fiscal year ${fy.year_code}? All months in ${fy.start_date}–${fy.end_date} will close and journal posting will be blocked until you reopen.`,
      )
    ) {
      return;
    }
    setLockingId(fy.id);
    const res = await apiFetch<{ id: number; is_closed: boolean }>(`/api/v1/finance/fiscal-years/${fy.id}/${action}`, {
      method: "POST",
    });
    setLockingId(null);
    if (!res.success) {
      toast.warning(res.message ?? `Failed to ${action} fiscal year.`);
      return;
    }
    toast.success(res.message ?? `${label}d fiscal year ${fy.year_code}.`);
    refresh();
  };

  const setPeriodClosed = async (fp: FiscalPeriod, close: boolean) => {
    const action = close ? "close" : "reopen";
    if (
      close &&
      !window.confirm(`Close period ${fp.period_code}? Posting into ${fp.start_date}–${fp.end_date} will be blocked.`)
    ) {
      return;
    }
    setPeriodLockingId(fp.id);
    const res = await apiFetch<{ id: number; is_closed: boolean }>(`/api/v1/finance/fiscal-periods/${fp.id}/${action}`, {
      method: "POST",
    });
    setPeriodLockingId(null);
    if (!res.success) {
      toast.warning(res.message ?? `Failed to ${action} period.`);
      return;
    }
    toast.success(res.message ?? `${close ? "Closed" : "Reopened"} ${fp.period_code}.`);
    void client.invalidateQueries({ queryKey: ["finance-fiscal-periods"] });
  };

  const generatePeriods = async () => {
    const fy = selectedYear();
    if (!fy) return;
    setGenerating(true);
    const res = await apiFetch<{ created: number }>(`/api/v1/finance/fiscal-years/${fy.id}/generate-periods`, {
      method: "POST",
    });
    setGenerating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to generate periods.");
      return;
    }
    toast.success(res.message ?? `Periods ready (${res.data?.created ?? 0} new).`);
    void client.invalidateQueries({ queryKey: ["finance-fiscal-periods"] });
  };

  return (
    <FinanceLayout>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-1 text-sm text-slate-600">
          <p>
            Backdated posting policy:{" "}
            <span class="font-medium">
              {settings.data?.accounts_block_backdated_post ? "Blocked" : "Allowed"}
            </span>
          </p>
          <p class="text-xs text-slate-500">
            Close a month to lock that period, or close the whole year. Closed years and months always block journal posting (including payroll and depreciation).
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <GridExportButtons
            title="Fiscal Years"
            filename="fiscal-years"
            columns={[
              { key: "year_code", header: "Code", value: (r) => String(r.year_code ?? "") },
              { key: "year_name", header: "Name", value: (r) => String(r.year_name ?? "") },
              { key: "start_date", header: "Start", value: (r) => String(r.start_date ?? "") },
              { key: "end_date", header: "End", value: (r) => String(r.end_date ?? "") },
              {
                key: "status",
                header: "Status",
                value: (r) => (r.is_closed ? "Closed" : r.is_active ? "Active" : "Inactive"),
              },
            ]}
            rows={() => (list.data ?? []) as unknown as Record<string, unknown>[]}
          />
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50" onClick={refresh}>
            Refresh
          </button>
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700" onClick={openCreate}>
            New fiscal year
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-stroke">
        <Show when={!list.isLoading} fallback={<p class="p-4 text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-3 py-2 text-left">Code</th>
                <th class="px-3 py-2 text-left">Name</th>
                <th class="px-3 py-2 text-left">Start</th>
                <th class="px-3 py-2 text-left">End</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={list.data ?? []}>
                {(fy) => (
                  <tr
                    class="border-t border-slate-100 cursor-pointer"
                    classList={{ "bg-brand-50/60": selectedYearId() === fy.id }}
                    onClick={() => setSelectedYearId(fy.id)}
                  >
                    <td class="px-3 py-2 font-medium">{fy.year_code}</td>
                    <td class="px-3 py-2">{fy.year_name}</td>
                    <td class="px-3 py-2">{fy.start_date}</td>
                    <td class="px-3 py-2">{fy.end_date}</td>
                    <td class="px-3 py-2">
                      {fy.is_closed ? "Closed" : fy.is_active ? "Active" : "Inactive"}
                    </td>
                    <td class="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Show
                        when={fy.is_closed}
                        fallback={
                          <button
                            type="button"
                            class="rounded border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                            disabled={lockingId() === fy.id}
                            onClick={() => void setYearClosed(fy, true)}
                          >
                            {lockingId() === fy.id ? "Closing…" : "Close year"}
                          </button>
                        }
                      >
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          disabled={lockingId() === fy.id}
                          onClick={() => void setYearClosed(fy, false)}
                        >
                          {lockingId() === fy.id ? "Reopening…" : "Reopen year"}
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <Show when={selectedYear()}>
        {(fy) => (
          <div class="mt-6 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold text-slate-800">Monthly periods — {fy().year_code}</h2>
                <p class="text-xs text-slate-500">Close finished months without locking the whole year.</p>
              </div>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={generating()}
                onClick={() => void generatePeriods()}
              >
                {generating() ? "Generating…" : "Generate missing months"}
              </button>
            </div>
            <div class="rounded-xl border border-stroke">
              <Show when={!periods.isLoading} fallback={<p class="p-4 text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
                <Show
                  when={(periods.data ?? []).length > 0}
                  fallback={<p class="p-4 text-sm text-slate-500">No months yet. Use Generate missing months.</p>}
                >
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50">
                      <tr>
                        <th class="px-3 py-2 text-left">Period</th>
                        <th class="px-3 py-2 text-left">Name</th>
                        <th class="px-3 py-2 text-left">Start</th>
                        <th class="px-3 py-2 text-left">End</th>
                        <th class="px-3 py-2 text-left">Status</th>
                        <th class="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={periods.data ?? []}>
                        {(fp) => (
                          <tr class="border-t border-slate-100">
                            <td class="px-3 py-2 font-medium">{fp.period_code}</td>
                            <td class="px-3 py-2">{fp.period_name}</td>
                            <td class="px-3 py-2">{fp.start_date}</td>
                            <td class="px-3 py-2">{fp.end_date}</td>
                            <td class="px-3 py-2">{fp.is_closed ? "Closed" : "Open"}</td>
                            <td class="px-3 py-2">
                              <Show
                                when={fp.is_closed}
                                fallback={
                                  <button
                                    type="button"
                                    class="rounded border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                    disabled={periodLockingId() === fp.id || fy().is_closed}
                                    onClick={() => void setPeriodClosed(fp, true)}
                                  >
                                    {periodLockingId() === fp.id ? "Closing…" : "Close month"}
                                  </button>
                                }
                              >
                                <button
                                  type="button"
                                  class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                                  disabled={periodLockingId() === fp.id || fy().is_closed}
                                  title={fy().is_closed ? "Reopen the fiscal year first" : undefined}
                                  onClick={() => void setPeriodClosed(fp, false)}
                                >
                                  {periodLockingId() === fp.id ? "Reopening…" : "Reopen month"}
                                </button>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </Show>
            </div>
          </div>
        )}
      </Show>

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
