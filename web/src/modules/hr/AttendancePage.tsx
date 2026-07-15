import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useEmployees } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";

type Holiday = {
  id: number;
  holiday_date: string;
  name: string;
  holiday_type: string;
  pay_multiplier: number;
};

type Cutoff = {
  id: number;
  label: string;
  cutoff_start: string;
  cutoff_end: string;
  pay_date?: string | null;
  status: string;
};

type DTR = {
  id: number;
  employee_id: number;
  employee_no?: string;
  employee_name?: string;
  work_date: string;
  status: string;
  hours_worked: number;
  ot_hours: number;
  night_diff_hours: number;
  holiday_name?: string;
  holiday_type?: string;
};

export default function AttendancePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const emps = useEmployees(() => ({ page: 1, pageSize: 200 }));

  const [holDate, setHolDate] = createSignal("");
  const [holName, setHolName] = createSignal("");
  const [holType, setHolType] = createSignal("regular");
  const [cutoffStart, setCutoffStart] = createSignal("");
  const [cutoffEnd, setCutoffEnd] = createSignal("");
  const [cutoffLabel, setCutoffLabel] = createSignal("");
  const [dtrEmp, setDtrEmp] = createSignal<number | null>(null);
  const [dtrDate, setDtrDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [dtrStatus, setDtrStatus] = createSignal("present");
  const [dtrHours, setDtrHours] = createSignal("8");
  const [dtrOt, setDtrOt] = createSignal("0");
  const [selectedDtrId, setSelectedDtrId] = createSignal<number | null>(null);

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

  const dtr = createQuery(() => ({
    queryKey: ["hr-dtr"],
    queryFn: async () => {
      const res = await apiFetch<DTR[]>("/api/v1/hr/dtr?page=1&pageSize=100");
      if (!res.success) throw new Error(res.message ?? "Failed to load DTR");
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

  const dtrDraft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrAttendance,
    draftKey: "dtr",
    getPayload: () => ({
      dtr_emp: dtrEmp(),
      dtr_date: dtrDate(),
      dtr_status: dtrStatus(),
      dtr_hours: dtrHours(),
      dtr_ot: dtrOt(),
    }),
    onApply: (payload) => {
      setDtrEmp(payload.dtr_emp);
      setDtrDate(payload.dtr_date);
      setDtrStatus(payload.dtr_status);
      setDtrHours(payload.dtr_hours);
      setDtrOt(payload.dtr_ot);
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

  const saveDtr = async () => {
    if (!dtrEmp()) {
      toast.warning("Select an employee.");
      return;
    }
    const res = await apiFetch("/api/v1/hr/dtr", {
      method: "POST",
      body: JSON.stringify({
        employee_id: dtrEmp(),
        work_date: dtrDate(),
        status: dtrStatus(),
        source: "manual",
        hours_worked: Number(dtrHours()) || 0,
        ot_hours: Number(dtrOt()) || 0,
        night_diff_hours: 0,
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save DTR.");
      return;
    }
    toast.success(res.data && (res.data as { holiday_name?: string }).holiday_name
      ? `Saved (holiday: ${(res.data as { holiday_name: string }).holiday_name}).`
      : "DTR saved.");
    await dtrDraft.clearOnSave();
    void qc.invalidateQueries({ queryKey: ["hr-dtr"] });
  };

  return (
    <HrLayout>
      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-medium">Holiday calendar ({year})</h2>
          <p class="mb-3 text-sm text-text-secondary">
            Regular / special holidays drive DTR auto-tagging and future holiday premium multipliers on payroll.
          </p>
          <holidayDraft.DraftBanner />
          <div class="mb-3 grid gap-3 sm:grid-cols-3">
            <Field label="Date"><input type="date" class={inputClass} value={holDate()} onInput={(e) => setHolDate(e.currentTarget.value)} /></Field>
            <Field label="Holiday name"><input class={inputClass} value={holName()} onInput={(e) => setHolName(e.currentTarget.value)} /></Field>
            <Field label="Holiday type"><select class={inputClass} value={holType()} onChange={(e) => setHolType(e.currentTarget.value)}>
              <option value="regular">Regular (×2)</option>
              <option value="special_non_working">Special non-working</option>
              <option value="special_working">Special working</option>
            </select></Field>
          </div>
          <button type="button" class="mb-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => void addHoliday()}>
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
            <Field label="Start date"><input type="date" class={inputClass} value={cutoffStart()} onInput={(e) => setCutoffStart(e.currentTarget.value)} /></Field>
            <Field label="End date"><input type="date" class={inputClass} value={cutoffEnd()} onInput={(e) => setCutoffEnd(e.currentTarget.value)} /></Field>
            <Field label="Label (optional)"><input class={inputClass} value={cutoffLabel()} onInput={(e) => setCutoffLabel(e.currentTarget.value)} /></Field>
          </div>
          <button type="button" class="mb-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => void addCutoff()}>
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

      <section class="mt-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-2 text-lg font-medium">DTR entry (manual)</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Punch/import sources can fill the same table later. If the date is a holiday, status auto-tags to holiday.
        </p>
        <dtrDraft.DraftBanner />
        <div class="mb-3 grid gap-3 sm:grid-cols-6">
          <div class="sm:col-span-2">
            <Field label="Employee">
              <select
                class={inputClass}
                value={dtrEmp() ?? ""}
                onChange={(e) => setDtrEmp(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              >
                <option value="">Employee…</option>
                <For each={emps.data?.rows ?? []}>
                  {(e) => (
                    <option value={e.id}>
                      {e.employee_no} — {e.full_name}
                    </option>
                  )}
                </For>
              </select>
            </Field>
          </div>
          <Field label="Work date"><input type="date" class={inputClass} value={dtrDate()} onInput={(e) => setDtrDate(e.currentTarget.value)} /></Field>
          <Field label="Status"><select class={inputClass} value={dtrStatus()} onChange={(e) => setDtrStatus(e.currentTarget.value)}>
            <For each={["present", "absent", "leave", "rest", "awol", "holiday"]}>{(s) => <option value={s}>{s}</option>}</For>
          </select></Field>
          <Field label="Hours"><input class={inputClass} value={dtrHours()} onInput={(e) => setDtrHours(e.currentTarget.value)} /></Field>
          <Field label="OT hours"><input class={inputClass} value={dtrOt()} onInput={(e) => setDtrOt(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => void saveDtr()}>
          Save DTR
        </button>
        <SpreadsheetGrid
          columns={[
            { key: "work_date", header: "Date" },
            { key: "employee_name", header: "Employee", render: (row) => <span>{row.employee_no} — {row.employee_name}</span> },
            { key: "status", header: "Status" },
            { key: "hours_worked", header: "Hours", render: (row) => <span class="tabular-nums">{row.hours_worked}</span> },
            { key: "ot_hours", header: "OT", render: (row) => <span class="tabular-nums">{row.ot_hours}</span> },
            { key: "holiday_name", header: "Holiday", render: (row) => <span>{row.holiday_name ? `${row.holiday_name} (${row.holiday_type})` : "—"}</span> },
          ]}
          rows={dtr.data ?? []}
          loading={dtr.isFetching}
          selectedId={selectedDtrId()}
          onSelect={setSelectedDtrId}
          onEdit={() => {}}
          onNew={() => {}}
          showNew={false}
          codeKey="work_date"
          nameKey="employee_name"
          page={1}
          pageSize={100}
          total={(dtr.data ?? []).length}
        />
      </section>
    </HrLayout>
  );
}
