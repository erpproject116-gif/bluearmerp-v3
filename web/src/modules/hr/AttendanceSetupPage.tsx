import { A } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import type { Cutoff, Holiday } from "./attendanceShared";

export default function AttendanceSetupPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const year = new Date().getFullYear();

  const [holDate, setHolDate] = createSignal("");
  const [holName, setHolName] = createSignal("");
  const [holType, setHolType] = createSignal("regular");
  const [cutoffStart, setCutoffStart] = createSignal("");
  const [cutoffEnd, setCutoffEnd] = createSignal("");
  const [cutoffLabel, setCutoffLabel] = createSignal("");

  const holidays = createQuery(() => ({
    queryKey: ["hr-holidays", year],
    queryFn: async () => {
      const res = await apiFetch<Holiday[]>(`/api/v1/hr/holidays?year=${year}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load holidays");
      return res.data ?? [];
    },
  }));

  const cutoffs = createQuery(() => ({
    queryKey: ["hr-cutoffs"],
    queryFn: async () => {
      const res = await apiFetch<Cutoff[]>("/api/v1/hr/cutoffs");
      if (!res.success) throw new Error(res.message ?? "Failed to load cut-offs");
      return res.data ?? [];
    },
  }));

  const holidayDraft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrAttendance,
    draftKey: "holiday",
    getPayload: () => ({ hol_date: holDate(), hol_name: holName(), hol_type: holType() }),
    onApply: (payload) => {
      setHolDate(payload.hol_date);
      setHolName(payload.hol_name);
      setHolType(payload.hol_type);
    },
    enabled: () => true,
    localOnly: true,
    autoApply: () => true,
  });

  const addHoliday = async () => {
    const res = await apiFetch("/api/v1/hr/holidays", {
      method: "POST",
      body: JSON.stringify({
        holiday_date: holDate(),
        name: holName().trim(),
        holiday_type: holType(),
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to add holiday.");
      return;
    }
    toast.success("Holiday saved.");
    setHolName("");
    await holidayDraft.clearOnSave();
    void qc.invalidateQueries({ queryKey: ["hr-holidays"] });
  };

  const addCutoff = async () => {
    const res = await apiFetch("/api/v1/hr/cutoffs", {
      method: "POST",
      body: JSON.stringify({
        label: cutoffLabel().trim() || undefined,
        cutoff_start: cutoffStart(),
        cutoff_end: cutoffEnd(),
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create cut-off.");
      return;
    }
    toast.success("Cut-off saved.");
    void qc.invalidateQueries({ queryKey: ["hr-cutoffs"] });
  };

  return (
    <HrLayout>
      <div class="mb-4">
        <A href="/app/hr/attendance" class="text-sm text-brand-700 hover:underline">
          ← Attendance
        </A>
        <h1 class="mt-1 text-2xl font-semibold">Attendance setup</h1>
        <p class="mt-1 text-sm text-text-secondary">Holidays and pay cut-offs used by DTR and payroll.</p>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-medium">Holiday calendar ({year})</h2>
          <p class="mb-3 text-sm text-text-secondary">
            Regular / special holidays drive DTR holiday premiums. Mark days as absent/awol to auto-deduct unpaid
            absence (daily rate) on the next payroll run.
          </p>
          <holidayDraft.DraftBanner />
          <div class="mb-3 grid gap-3 sm:grid-cols-3">
            <Field label="Date">
              <input type="date" class={inputClass} value={holDate()} onInput={(e) => setHolDate(e.currentTarget.value)} />
            </Field>
            <Field label="Holiday name">
              <input class={inputClass} value={holName()} onInput={(e) => setHolName(e.currentTarget.value)} />
            </Field>
            <Field label="Holiday type">
              <select class={inputClass} value={holType()} onChange={(e) => setHolType(e.currentTarget.value)}>
                <option value="regular">Regular (×2)</option>
                <option value="special_non_working">Special non-working</option>
                <option value="special_working">Special working</option>
              </select>
            </Field>
          </div>
          <button
            type="button"
            class="mb-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => void addHoliday()}
          >
            Add holiday
          </button>
          <ul class="max-h-56 space-y-1 overflow-auto text-sm">
            <For each={holidays.data ?? []} fallback={<li class="text-text-secondary">No holidays yet.</li>}>
              {(h) => (
                <li class="flex justify-between border-b border-slate-100 py-1">
                  <span>
                    {h.holiday_date} — {h.name}
                  </span>
                  <span class="text-text-secondary">
                    {h.holiday_type} ×{h.pay_multiplier}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-medium">Pay cut-offs</h2>
          <p class="mb-3 text-sm text-text-secondary">Defines the attendance window that should feed the next payroll run.</p>
          <div class="mb-3 grid gap-3 sm:grid-cols-3">
            <Field label="Start date">
              <input
                type="date"
                class={inputClass}
                value={cutoffStart()}
                onInput={(e) => setCutoffStart(e.currentTarget.value)}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                class={inputClass}
                value={cutoffEnd()}
                onInput={(e) => setCutoffEnd(e.currentTarget.value)}
              />
            </Field>
            <Field label="Label (optional)">
              <input
                class={inputClass}
                value={cutoffLabel()}
                onInput={(e) => setCutoffLabel(e.currentTarget.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            class="mb-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => void addCutoff()}
          >
            Add cut-off
          </button>
          <ul class="max-h-56 space-y-1 overflow-auto text-sm">
            <For each={cutoffs.data ?? []} fallback={<li class="text-text-secondary">No cut-offs yet.</li>}>
              {(c) => (
                <li class="flex justify-between border-b border-slate-100 py-1">
                  <span>{c.label}</span>
                  <span class="text-text-secondary">
                    {c.cutoff_start} → {c.cutoff_end} ({c.status})
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>
    </HrLayout>
  );
}
