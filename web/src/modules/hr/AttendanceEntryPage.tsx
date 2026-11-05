import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import {
  downloadDtrImportTemplate,
  importDtrCsv,
} from "../../shared/hrCsvImport";
import { HrMappedImportModal } from "./HrMappedImportModal";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import {
  EntityModal,
  Field,
  inputClass,
  toolbarControlClass,
} from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import { employeeLookupLabel, fetchEmployeeOptions } from "../../shared/useHr";
import { HrLayout } from "./HrLayout";
import {
  HrBadge,
  HrEmpty,
  HrPageHead,
  HrTcard,
  type HrBadgeTone,
} from "./HrUi";
import type { DTR } from "./attendanceShared";

function statusTone(status: string): HrBadgeTone {
  switch (status) {
    case "present":
      return "success";
    case "absent":
    case "awol":
      return "danger";
    case "holiday":
      return "brand";
    case "leave":
      return "info";
    case "rest":
      return "neutral";
    default:
      return "warning";
  }
}

function statusLabel(status: string): string {
  if (!status) return "—";
  if (status === "awol") return "AWOL";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export default function AttendanceEntryPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [dtrOpen, setDtrOpen] = createSignal(false);
  const [dtrSaving, setDtrSaving] = createSignal(false);
  const [dtrEmp, setDtrEmp] = createSignal<number | null>(null);
  const [dtrEmpLabel, setDtrEmpLabel] = createSignal("");
  const [dtrDate, setDtrDate] = createSignal(
    new Date().toISOString().slice(0, 10),
  );
  const [dtrStatus, setDtrStatus] = createSignal("present");
  const [dtrHours, setDtrHours] = createSignal("8");
  const [dtrOt, setDtrOt] = createSignal("0");
  const [dtrNightDiff, setDtrNightDiff] = createSignal("0");
  const [dtrReason, setDtrReason] = createSignal("");
  const [dtrRemarks, setDtrRemarks] = createSignal("");
  const [selectedDtrId, setSelectedDtrId] = createSignal<number | null>(null);
  const [importingDtr, setImportingDtr] = createSignal(false);
  const [mappedImportOpen, setMappedImportOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [colsOpen, setColsOpen] = createSignal(false);
  const [colVis, setColVis] = createSignal({
    date: true,
    employee: true,
    status: true,
    hours: true,
    ot: true,
    night: true,
    holiday: true,
    reason: true,
    remarks: true,
  });

  const toggleCol = (key: keyof ReturnType<typeof colVis>) => {
    setColVis({ ...colVis(), [key]: !colVis()[key] });
  };

  const dtr = createQuery(() => ({
    queryKey: ["hr-dtr"],
    queryFn: async () => {
      const res = await apiFetch<DTR[]>("/api/v1/hr/dtr?page=1&pageSize=100");
      if (!res.success) throw new Error(res.message ?? "Failed to load DTR");
      return res.data ?? [];
    },
  }));

  const filtered = createMemo(() => {
    const qq = search().trim().toLowerCase();
    const st = statusFilter();
    const f = from();
    const t = to();
    return (dtr.data ?? []).filter((row) => {
      if (st && row.status !== st) return false;
      const wd = (row.work_date || "").slice(0, 10);
      if (f && wd < f) return false;
      if (t && wd > t) return false;
      if (!qq) return true;
      return (
        (row.employee_name || "").toLowerCase().includes(qq) ||
        (row.employee_no || "").toLowerCase().includes(qq) ||
        (row.absence_reason || "").toLowerCase().includes(qq)
      );
    });
  });

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
    setDtrEmpLabel(
      employeeLookupLabel(row.employee_no ?? "", row.employee_name ?? ""),
    );
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
        toast.warning(
          `Imported ${created} row(s); ${failed} failed.${detail ? ` ${detail}` : ""}`,
        );
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

  const deleteSelected = () => {
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
  };

  const c = () => colVis();

  return (
    <HrLayout>
      <HrPageHead
        title="DTR entry"
        subtitle="Manual rows and imports share this table. Holidays tag automatically."
        actions={
          <div class="hr-actions">
            <details class="hr-menu relative">
              <summary class="hr-btn">Import ▾</summary>
              <div class="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-stroke bg-surface p-1 shadow-md">
                <button
                  type="button"
                  class="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    void downloadDtrImportTemplate().catch(() =>
                      toast.error("Could not download template."),
                    )
                  }
                >
                  DTR template
                </button>
                <label class="block w-full cursor-pointer rounded px-3 py-1.5 text-left text-sm hover:bg-slate-50">
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
                  class="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => setMappedImportOpen(true)}
                >
                  Import with mapping…
                </button>
              </div>
            </details>
            <button
              type="button"
              class="hr-btn"
              onClick={() => toast.info("Export uses the filtered table.")}
            >
              Export
            </button>
            <button
              type="button"
              class="hr-btn hr-btn-primary"
              onClick={openNewDtr}
            >
              + New entry
            </button>
          </div>
        }
      />

      <HrTcard
        toolbar={
          <>
            <input
              class={`${toolbarControlClass} grow`}
              placeholder="Search employee…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <input
              type="date"
              class={toolbarControlClass}
              aria-label="From"
              value={from()}
              onInput={(e) => setFrom(e.currentTarget.value)}
            />
            <input
              type="date"
              class={toolbarControlClass}
              aria-label="To"
              value={to()}
              onInput={(e) => setTo(e.currentTarget.value)}
            />
            <select
              class={toolbarControlClass}
              aria-label="Status"
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
            >
              <option value="">Status: All</option>
              <For
                each={["present", "absent", "awol", "holiday", "leave", "rest"]}
              >
                {(s) => <option value={s}>{statusLabel(s)}</option>}
              </For>
            </select>
            <div class="relative">
              <button
                type="button"
                class="hr-btn hr-btn-ghost hr-btn-sm"
                aria-expanded={colsOpen()}
                aria-haspopup="true"
                onClick={() => setColsOpen(!colsOpen())}
              >
                Columns
              </button>
              <Show when={colsOpen()}>
                <div
                  class="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-stroke bg-surface p-1 shadow-md"
                  role="menu"
                >
                  <For
                    each={
                      [
                        ["date", "Date"],
                        ["employee", "Employee"],
                        ["status", "Status"],
                        ["hours", "Hours"],
                        ["ot", "OT"],
                        ["night", "Night diff"],
                        ["holiday", "Holiday"],
                        ["reason", "Reason"],
                        ["remarks", "Remarks"],
                      ] as const
                    }
                  >
                    {([key, label]) => (
                      <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={c()[key]}
                          onChange={() => toggleCol(key)}
                        />
                        {label}
                      </label>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <Show
            when={filtered().length > 0}
            fallback={
              <HrEmpty
                title={dtr.isFetching ? "Loading…" : "No matches"}
                hint="Try a different search or clear the filters."
              />
            }
          >
            <table class="hr-tbl">
              <thead>
                <tr>
                  <Show when={c().date}>
                    <th>Date</th>
                  </Show>
                  <Show when={c().employee}>
                    <th>Employee</th>
                  </Show>
                  <Show when={c().status}>
                    <th>Status</th>
                  </Show>
                  <Show when={c().hours}>
                    <th class="num">Hours</th>
                  </Show>
                  <Show when={c().ot}>
                    <th class="num">OT</th>
                  </Show>
                  <Show when={c().night}>
                    <th class="num">Night diff</th>
                  </Show>
                  <Show when={c().holiday}>
                    <th>Holiday</th>
                  </Show>
                  <Show when={c().reason}>
                    <th>Reason</th>
                  </Show>
                  <Show when={c().remarks}>
                    <th>Remarks</th>
                  </Show>
                  <th>
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={filtered()}>
                  {(row) => (
                    <tr
                      classList={{
                        "bg-brand-50/40": selectedDtrId() === row.id,
                      }}
                      onClick={() => setSelectedDtrId(row.id)}
                    >
                      <Show when={c().date}>
                        <td>{(row.work_date || "").slice(0, 10)}</td>
                      </Show>
                      <Show when={c().employee}>
                        <td>
                          {row.employee_no} — {row.employee_name}
                        </td>
                      </Show>
                      <Show when={c().status}>
                        <td>
                          <HrBadge tone={statusTone(row.status)}>
                            {statusLabel(row.status)}
                          </HrBadge>
                        </td>
                      </Show>
                      <Show when={c().hours}>
                        <td class="num">{row.hours_worked}</td>
                      </Show>
                      <Show when={c().ot}>
                        <td class="num">{row.ot_hours}</td>
                      </Show>
                      <Show when={c().night}>
                        <td class="num">{row.night_diff_hours}</td>
                      </Show>
                      <Show when={c().holiday}>
                        <td>
                          {row.holiday_name ? `${row.holiday_name}` : "—"}
                        </td>
                      </Show>
                      <Show when={c().reason}>
                        <td>{row.absence_reason || "—"}</td>
                      </Show>
                      <Show when={c().remarks}>
                        <td>{row.absence_remarks || "—"}</td>
                      </Show>
                      <td>
                        <details class="hr-menu hr-rowmenu">
                          <summary
                            class="hr-rowmenu-btn"
                            aria-label="Row actions"
                          >
                            ⋯
                          </summary>
                          <div>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => openDtrRow(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              class="menu-item danger"
                              onClick={() => {
                                setSelectedDtrId(row.id);
                                deleteSelected();
                              }}
                            >
                              Delete…
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
        <div class="flex items-center justify-between gap-2 px-1 py-2 text-xs text-text-secondary">
          <span>
            Showing {filtered().length} of {(dtr.data ?? []).length}
          </span>
          <Show when={selectedDtrId()}>
            <button
              type="button"
              class="hr-btn hr-btn-sm"
              onClick={deleteSelected}
            >
              Delete selected
            </button>
          </Show>
        </div>
      </HrTcard>

      <EntityModal
        open={dtrOpen()}
        title={selectedDtrId() ? "Edit DTR" : "New DTR entry"}
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
          <input
            type="date"
            class={inputClass}
            value={dtrDate()}
            onInput={(e) => setDtrDate(e.currentTarget.value)}
          />
        </Field>
        <Field label="Status">
          <select
            class={inputClass}
            value={dtrStatus()}
            onChange={(e) => setDtrStatus(e.currentTarget.value)}
          >
            <For
              each={["present", "absent", "leave", "rest", "awol", "holiday"]}
            >
              {(s) => <option value={s}>{statusLabel(s)}</option>}
            </For>
          </select>
        </Field>
        <Field label="Hours">
          <input
            class={inputClass}
            value={dtrHours()}
            onInput={(e) => setDtrHours(e.currentTarget.value)}
          />
        </Field>
        <Field label="OT hours">
          <input
            class={inputClass}
            value={dtrOt()}
            onInput={(e) => setDtrOt(e.currentTarget.value)}
          />
        </Field>
        <Field label="Night diff hours">
          <input
            class={inputClass}
            value={dtrNightDiff()}
            onInput={(e) => setDtrNightDiff(e.currentTarget.value)}
          />
        </Field>
        <Field label="Reason">
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
