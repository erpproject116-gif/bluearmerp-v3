import { A } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { downloadDtrImportTemplate, importDtrCsv } from "../../shared/hrCsvImport";
import { HrMappedImportModal } from "./HrMappedImportModal";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { EntityModal, Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import { employeeLookupLabel, fetchEmployeeOptions } from "../../shared/useHr";
import { HrLayout } from "./HrLayout";
import type { DTR } from "./attendanceShared";

export default function AttendanceEntryPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [dtrOpen, setDtrOpen] = createSignal(false);
  const [dtrSaving, setDtrSaving] = createSignal(false);
  const [dtrEmp, setDtrEmp] = createSignal<number | null>(null);
  const [dtrEmpLabel, setDtrEmpLabel] = createSignal("");
  const [dtrDate, setDtrDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [dtrStatus, setDtrStatus] = createSignal("present");
  const [dtrHours, setDtrHours] = createSignal("8");
  const [dtrOt, setDtrOt] = createSignal("0");
  const [dtrNightDiff, setDtrNightDiff] = createSignal("0");
  const [dtrReason, setDtrReason] = createSignal("");
  const [dtrRemarks, setDtrRemarks] = createSignal("");
  const [selectedDtrId, setSelectedDtrId] = createSignal<number | null>(null);
  const [importingDtr, setImportingDtr] = createSignal(false);
  const [mappedImportOpen, setMappedImportOpen] = createSignal(false);

  const dtr = createQuery(() => ({
    queryKey: ["hr-dtr"],
    queryFn: async () => {
      const res = await apiFetch<DTR[]>("/api/v1/hr/dtr?page=1&pageSize=100");
      if (!res.success) throw new Error(res.message ?? "Failed to load DTR");
      return res.data ?? [];
    },
  }));

  const dtrDraft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrAttendance,
    draftKey: "dtr",
    getPayload: () => ({
      dtr_emp: dtrEmp(),
      dtr_emp_label: dtrEmpLabel(),
      dtr_date: dtrDate(),
      dtr_status: dtrStatus(),
      dtr_hours: dtrHours(),
      dtr_ot: dtrOt(),
      dtr_night_diff: dtrNightDiff(),
      dtr_reason: dtrReason(),
      dtr_remarks: dtrRemarks(),
    }),
    onApply: (payload) => {
      setDtrEmp(payload.dtr_emp);
      setDtrEmpLabel(payload.dtr_emp_label ?? "");
      setDtrDate(payload.dtr_date);
      setDtrStatus(payload.dtr_status);
      setDtrHours(payload.dtr_hours);
      setDtrOt(payload.dtr_ot);
      setDtrNightDiff(payload.dtr_night_diff ?? "0");
      setDtrReason(payload.dtr_reason ?? "");
      setDtrRemarks(payload.dtr_remarks ?? "");
    },
    enabled: () => dtrOpen(),
    localOnly: true,
    autoApply: () => false,
    onDiscard: () => {
      if (!selectedDtrId()) blankDtr();
    },
  });

  const blankDtr = () => {
    setDtrEmp(null);
    setDtrEmpLabel("");
    setDtrDate(new Date().toISOString().slice(0, 10));
    setDtrStatus("present");
    setDtrHours("8");
    setDtrOt("0");
    setDtrNightDiff("0");
    setDtrReason("");
    setDtrRemarks("");
  };

  const openNewDtr = () => {
    setSelectedDtrId(null);
    blankDtr();
    setDtrOpen(true);
  };

  const openDtrRow = (row: DTR) => {
    setSelectedDtrId(row.id);
    setDtrEmp(row.employee_id);
    setDtrEmpLabel(employeeLookupLabel(row.employee_no ?? "", row.employee_name ?? ""));
    setDtrDate(row.work_date.slice(0, 10));
    setDtrStatus(row.status);
    setDtrHours(String(row.hours_worked));
    setDtrOt(String(row.ot_hours));
    setDtrNightDiff(String(row.night_diff_hours));
    setDtrReason(row.absence_reason ?? "");
    setDtrRemarks(row.absence_remarks ?? "");
    setDtrOpen(true);
  };

  const saveDtr = async () => {
    if (!dtrEmp()) {
      toast.warning("Select an employee.");
      return;
    }
    setDtrSaving(true);
    const res = await apiFetch("/api/v1/hr/dtr", {
      method: "POST",
      body: JSON.stringify({
        employee_id: dtrEmp(),
        work_date: dtrDate(),
        status: dtrStatus(),
        source: "manual",
        hours_worked: Number(dtrHours()) || 0,
        ot_hours: Number(dtrOt()) || 0,
        night_diff_hours: Number(dtrNightDiff()) || 0,
        absence_reason: dtrReason().trim() || undefined,
        absence_remarks: dtrRemarks().trim() || undefined,
      }),
    });
    setDtrSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save DTR.");
      return;
    }
    toast.success(
      res.data && (res.data as { holiday_name?: string }).holiday_name
        ? `Saved (holiday: ${(res.data as { holiday_name: string }).holiday_name}).`
        : "DTR saved.",
    );
    await dtrDraft.clearOnSave();
    setDtrOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-dtr"] });
    void qc.invalidateQueries({ queryKey: ["hr-dtr-month-overview"] });
    void qc.invalidateQueries({ queryKey: ["hr-dtr-employee-month"] });
  };

  const onImportDtr = async (file: File) => {
    setImportingDtr(true);
    try {
      const result = await importDtrCsv(file);
      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Import failed.");
        return;
      }
      const { created, failed, row_errors: rowErrors } = result.data;
      if (failed > 0) {
        const detail =
          rowErrors
            ?.slice(0, 6)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join(" · ") ?? "";
        toast.warning(`Imported ${created} row(s); ${failed} failed.${detail ? ` ${detail}` : ""}`);
      } else {
        toast.success(`Imported ${created} DTR row(s).`);
      }
      if (created > 0) {
        void qc.invalidateQueries({ queryKey: ["hr-dtr"] });
        void qc.invalidateQueries({ queryKey: ["hr-dtr-month-overview"] });
      }
    } catch {
      toast.error("Import failed.");
    } finally {
      setImportingDtr(false);
    }
  };

  return (
    <HrLayout>
      <div class="mb-4">
        <A href="/app/hr/attendance" class="text-sm text-brand-700 hover:underline">
          ← Attendance
        </A>
        <h1 class="mt-1 text-2xl font-semibold">DTR entry</h1>
        <p class="mt-1 text-sm text-text-secondary">
          Manual day rows and CSV import. Punch/import sources can fill the same table. If the date is a holiday,
          status auto-tags to holiday.
        </p>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="mb-2 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => void downloadDtrImportTemplate().catch(() => toast.error("Could not download template."))}
          >
            DTR template
          </button>
          <label class="cursor-pointer rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel">
            {importingDtr() ? "Importing…" : "Import DTR CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              disabled={importingDtr()}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void onImportDtr(f);
              }}
            />
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => setMappedImportOpen(true)}
          >
            Import with mapping…
          </button>
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
            disabled={!selectedDtrId()}
            onClick={() => {
              const id = selectedDtrId();
              if (!id) return;
              void apiFetch(`/api/v1/hr/dtr/${id}`, { method: "DELETE" }).then((res) => {
                if (!res.success) {
                  toast.warning(res.message ?? "Delete failed.");
                  return;
                }
                toast.success("DTR deleted.");
                setSelectedDtrId(null);
                void qc.invalidateQueries({ queryKey: ["hr-dtr"] });
                void qc.invalidateQueries({ queryKey: ["hr-dtr-month-overview"] });
              });
            }}
          >
            Delete selected
          </button>
        </div>
        <SpreadsheetGrid
          columns={[
            { key: "work_date", header: "Date" },
            {
              key: "employee_name",
              header: "Employee",
              render: (row) => (
                <span>
                  {row.employee_no} — {row.employee_name}
                </span>
              ),
            },
            { key: "status", header: "Status" },
            {
              key: "hours_worked",
              header: "Hours",
              render: (row) => <span class="tabular-nums">{row.hours_worked}</span>,
            },
            { key: "ot_hours", header: "OT", render: (row) => <span class="tabular-nums">{row.ot_hours}</span> },
            {
              key: "night_diff_hours",
              header: "Night diff",
              render: (row) => <span class="tabular-nums">{row.night_diff_hours}</span>,
            },
            {
              key: "holiday_name",
              header: "Holiday",
              render: (row) => (
                <span>{row.holiday_name ? `${row.holiday_name} (${row.holiday_type})` : "—"}</span>
              ),
            },
            {
              key: "absence_reason",
              header: "Reason",
              render: (row) => <span>{row.absence_reason || "—"}</span>,
            },
            {
              key: "absence_remarks",
              header: "Remarks",
              render: (row) => <span>{row.absence_remarks || "—"}</span>,
            },
          ]}
          rows={dtr.data ?? []}
          loading={dtr.isFetching}
          selectedId={selectedDtrId()}
          onSelect={setSelectedDtrId}
          onEdit={openDtrRow}
          onNew={openNewDtr}
          showNew={true}
          codeKey="work_date"
          nameKey="employee_name"
          page={1}
          pageSize={100}
          total={(dtr.data ?? []).length}
        />
      </section>
      <EntityModal
        open={dtrOpen()}
        title={selectedDtrId() ? "Edit DTR" : "New DTR"}
        onClose={() => setDtrOpen(false)}
        onSave={() => void saveDtr()}
        saving={dtrSaving()}
        saveLabel="Save DTR"
      >
        <dtrDraft.DraftBanner />
        <LookupCombo
          label="Employee"
          value={dtrEmpLabel}
          selectedId={dtrEmp}
          onInput={setDtrEmpLabel}
          onSelect={(o) => {
            setDtrEmp(o.id);
            setDtrEmpLabel(o.label);
          }}
          onClear={() => {
            setDtrEmp(null);
            setDtrEmpLabel("");
          }}
          fetchOptions={fetchEmployeeOptions}
          placeholder="Search employees…"
          required
        />
        <Field label="Work date">
          <input type="date" class={inputClass} value={dtrDate()} onInput={(e) => setDtrDate(e.currentTarget.value)} />
        </Field>
        <Field label="Status">
          <select class={inputClass} value={dtrStatus()} onChange={(e) => setDtrStatus(e.currentTarget.value)}>
            <For each={["present", "absent", "leave", "rest", "awol", "holiday"]}>
              {(s) => <option value={s}>{s}</option>}
            </For>
          </select>
        </Field>
        <Field label="Hours">
          <input class={inputClass} value={dtrHours()} onInput={(e) => setDtrHours(e.currentTarget.value)} />
        </Field>
        <Field label="OT hours">
          <input class={inputClass} value={dtrOt()} onInput={(e) => setDtrOt(e.currentTarget.value)} />
        </Field>
        <Field label="Night diff hours">
          <input class={inputClass} value={dtrNightDiff()} onInput={(e) => setDtrNightDiff(e.currentTarget.value)} />
        </Field>
        <Field label="Absence reason">
          <input
            class={inputClass}
            value={dtrReason()}
            onInput={(e) => setDtrReason(e.currentTarget.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Remarks">
          <input
            class={inputClass}
            value={dtrRemarks()}
            onInput={(e) => setDtrRemarks(e.currentTarget.value)}
            placeholder="Optional"
          />
        </Field>
      </EntityModal>
      <HrMappedImportModal
        open={mappedImportOpen()}
        kind="dtr"
        onClose={() => setMappedImportOpen(false)}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ["hr-dtr"] });
          void qc.invalidateQueries({ queryKey: ["hr-dtr-month-overview"] });
        }}
      />
    </HrLayout>
  );
}
