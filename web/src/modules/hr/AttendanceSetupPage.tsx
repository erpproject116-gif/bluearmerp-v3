import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { HrAttendanceTabs } from "./HrAttendanceTabs";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrPlanned, type HrBadgeTone } from "./HrUi";
import type { Cutoff, Holiday } from "./attendanceShared";

function holidayTone(type: string): HrBadgeTone {
  if (type === "regular") return "success";
  if (type.startsWith("special")) return "warning";
  return "neutral";
}

function holidayLabel(type: string): string {
  if (type === "regular") return "Regular";
  if (type === "special_non_working") return "Special non-working";
  if (type === "special_working") return "Special working";
  return type;
}

export default function AttendanceSetupPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const [holidayYear, setHolidayYear] = createSignal(String(year));

  const [holDate, setHolDate] = createSignal("");
  const [holName, setHolName] = createSignal("");
  const [holType, setHolType] = createSignal("regular");
  const [cutoffStart, setCutoffStart] = createSignal("");
  const [cutoffEnd, setCutoffEnd] = createSignal("");
  const [cutoffLabel, setCutoffLabel] = createSignal("");
  const [quincenaMonth, setQuincenaMonth] = createSignal(
    `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  );

  const holidays = createQuery(() => ({
    queryKey: ["hr-holidays", holidayYear()],
    queryFn: async () => {
      const res = await apiFetch<Holiday[]>(`/api/v1/hr/holidays?year=${holidayYear()}`);
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

  const missingQuincenaHint = createMemo(() => {
    const ym = quincenaMonth();
    const list = cutoffs.data ?? [];
    const has = list.some((c) => (c.cutoff_start || "").startsWith(ym) || (c.cutoff_end || "").startsWith(ym));
    if (has) return null;
    const [y, m] = ym.split("-");
    const name = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" });
    return `No pay cut-offs yet for ${name} ${y}.`;
  });

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

  const addQuincenas = async () => {
    const res = await apiFetch("/api/v1/hr/cutoffs/quincenas", {
      method: "POST",
      body: JSON.stringify({ month: quincenaMonth() }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create quincena cut-offs.");
      return;
    }
    toast.success("Two quincena cut-offs saved.");
    void qc.invalidateQueries({ queryKey: ["hr-cutoffs"] });
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Time &amp; leave › Attendance / DTR › Setup</div>
      <HrAttendanceTabs />
      <HrPageHead title="Attendance setup" subtitle="Holidays and pay cut-offs used by DTR and payroll." />

      <Show when={missingQuincenaHint()}>
        <HrNotice>
          ⚠ {missingQuincenaHint()}{" "}
          <a href="#cut" class="font-semibold underline">
            Add two quincenas
          </a>
        </HrNotice>
      </Show>

      <div class="mt-4 grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-medium">Holiday calendar · {holidayYear()}</h2>
          <div class="mb-3 max-w-[8rem]">
            <Field label="Year">
              <input class={inputClass} value={holidayYear()} onInput={(e) => setHolidayYear(e.currentTarget.value)} />
            </Field>
          </div>
          <holidayDraft.DraftBanner />
          <div class="mb-3 grid gap-3 grid-cols-1 min-[1024px]:grid-cols-3">
            <Field label="Date">
              <input type="date" class={inputClass} value={holDate()} onInput={(e) => setHolDate(e.currentTarget.value)} />
            </Field>
            <Field label="Holiday name">
              <input class={inputClass} value={holName()} onInput={(e) => setHolName(e.currentTarget.value)} />
            </Field>
            <Field label="Type">
              <select class={inputClass} value={holType()} onChange={(e) => setHolType(e.currentTarget.value)}>
                <option value="regular">Regular holiday</option>
                <option value="special_non_working">Special non-working</option>
                <option value="special_working">Special working</option>
              </select>
            </Field>
          </div>
          <button type="button" class="hr-btn hr-btn-primary mb-3" onClick={() => void addHoliday()}>
            Add holiday
          </button>
          <div class="hr-tbl-wrap max-h-64 overflow-auto">
            <Show
              when={(holidays.data ?? []).length > 0}
              fallback={<HrEmpty title={holidays.isFetching ? "Loading…" : "No holidays yet"} />}
            >
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={holidays.data ?? []}>
                    {(h) => (
                      <tr>
                        <td>{h.holiday_date}</td>
                        <td>{h.name}</td>
                        <td>
                          <HrBadge tone={holidayTone(h.holiday_type)}>
                            {holidayLabel(h.holiday_type)} ×{h.pay_multiplier}
                          </HrBadge>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
          <p class="mt-2 text-xs text-text-secondary">Confirm against the official proclamation each year.</p>
        </section>

        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-medium">Pay cut-offs</h2>
          <p class="mb-3 text-sm text-text-secondary">Defines the attendance window that should feed the next payroll run.</p>
          <div class="mb-3 grid gap-3 grid-cols-1 min-[1024px]:grid-cols-3">
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
          <button type="button" class="hr-btn mb-3" onClick={() => void addCutoff()}>
            Add cut-off
          </button>
          <div id="cut" class="mb-3 rounded-lg border border-stroke bg-slate-50 p-3">
            <div class="flex flex-wrap items-end gap-3">
              <Field label="Month">
                <input
                  type="month"
                  class={inputClass}
                  value={quincenaMonth()}
                  onInput={(e) => setQuincenaMonth(e.currentTarget.value)}
                />
              </Field>
              <button type="button" class="hr-btn" onClick={() => void addQuincenas()}>
                Add two quincenas
              </button>
            </div>
            <p class="mt-2 text-xs text-text-secondary">
              Creates the 1st–15th and 16th–end-of-month periods. Overlapping ranges are rejected.
            </p>
          </div>
          <div class="hr-tbl-wrap max-h-56 overflow-auto">
            <Show
              when={(cutoffs.data ?? []).length > 0}
              fallback={<HrEmpty title={cutoffs.isFetching ? "Loading…" : "No cut-offs yet"} />}
            >
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Label</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={cutoffs.data ?? []}>
                    {(c) => (
                      <tr>
                        <td>{c.cutoff_start}</td>
                        <td>{c.cutoff_end}</td>
                        <td>{c.label || "—"}</td>
                        <td>
                          <HrBadge tone={c.status === "open" ? "success" : "neutral"}>{c.status}</HrBadge>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </section>
      </div>

      <section class="mt-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-1 text-lg font-medium">
          Per-client cut-off calendar <HrPlanned />
        </h2>
        <p class="mb-3 text-sm text-text-secondary">
          Each client can have its own DTR submission due date per cut-off.
        </p>
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Cut-off</th>
                <th>DTR due</th>
                <th>Late after</th>
                <th>Who may override</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} class="text-text-secondary">
                  No per-client calendars yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <HrNotice>
          <b>Needs backend:</b> cut-off calendar per client.
        </HrNotice>
      </section>
    </HrLayout>
  );
}
