import { createSignal, For, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import {
  createBudgetLine,
  createJobCostProject,
  createTimesheet,
  useBudgetLines,
  useBudgetVsActual,
  useInvalidateJobCosting,
  useJobCostProjects,
  useJobCostTimesheets,
  type JobCostProject,
} from "../../shared/useJobCosting";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { uiLabel } from "../../shared/branding/uiLabel";

import { formatMoney } from "../../shared/money";

const BUDGET_CATEGORIES = ["labor", "materials", "overhead", "other"];

export default function JobCostingPage() {
  const auth = useAuth();
  const canCreateProject = () => hasPermission(auth.me, "job_costing.projects_new", "write");
  const canBudget = () => hasPermission(auth.me, "job_costing.budget", "write");
  const canTimesheet = () => hasPermission(auth.me, "job_costing.timesheets", "write");
  const { page, setPage, q, setQ, pageSize, setPageSize } = useListState("project_name");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [activeProjectId, setActiveProjectId] = createSignal<number | null>(null);
  const [projectModalOpen, setProjectModalOpen] = createSignal(false);
  const [budgetModalOpen, setBudgetModalOpen] = createSignal(false);
  const [timesheetModalOpen, setTimesheetModalOpen] = createSignal(false);
  const [projectCode, setProjectCode] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [budgetCategory, setBudgetCategory] = createSignal("labor");
  const [budgetDescription, setBudgetDescription] = createSignal("");
  const [budgetAmount, setBudgetAmount] = createSignal("");
  const [tsHours, setTsHours] = createSignal("");
  const [tsRate, setTsRate] = createSignal("");
  const [tsWorker, setTsWorker] = createSignal("");
  const [tsDate, setTsDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateJobCosting();

  const list = useJobCostProjects(() => ({ page: page(), pageSize: pageSize(), q: q() || undefined }));
  const budget = useBudgetLines(activeProjectId);
  const bva = useBudgetVsActual(activeProjectId);
  const timesheets = useJobCostTimesheets(() => ({
    page: 1,
    pageSize: 10,
    project_id: activeProjectId() ?? undefined,
  }));

  const selectProject = (row: JobCostProject) => {
    setActiveProjectId(row.id);
    setSelectedId(row.id);
  };

  const openNewProject = () => {
    setProjectCode("");
    setProjectName("");
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (!projectCode().trim() || !projectName().trim()) {
      toast.warning("Project code and name are required.");
      return;
    }
    setSaving(true);
    const res = await createJobCostProject({
      project_code: projectCode().trim(),
      project_name: projectName().trim(),
      status: "active",
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create project.");
      return;
    }
    setProjectModalOpen(false);
    invalidate();
    if (res.data?.id) setActiveProjectId(res.data.id);
    toast.success("Project created.");
  };

  const saveBudgetLine = async () => {
    const pid = activeProjectId();
    if (!pid) {
      toast.warning("Select a project first.");
      return;
    }
    const amount = Number(budgetAmount());
    if (!Number.isFinite(amount) || amount < 0) {
      toast.warning("Enter a valid budget amount.");
      return;
    }
    setSaving(true);
    const res = await createBudgetLine(pid, {
      category: budgetCategory(),
      description: budgetDescription().trim(),
      budget_amount: amount,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save budget line.");
      return;
    }
    setBudgetModalOpen(false);
    setBudgetDescription("");
    setBudgetAmount("");
    invalidate();
    toast.success("Budget line added.");
  };

  const saveTimesheet = async () => {
    const pid = activeProjectId();
    if (!pid) {
      toast.warning("Select a project first.");
      return;
    }
    const hours = Number(tsHours());
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.warning("Hours must be greater than zero.");
      return;
    }
    setSaving(true);
    const res = await createTimesheet({
      project_id: pid,
      worker_name: tsWorker().trim(),
      work_date: tsDate(),
      hours,
      hourly_rate: Number(tsRate()) || 0,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save timesheet.");
      return;
    }
    setTimesheetModalOpen(false);
    setTsHours("");
    setTsRate("");
    setTsWorker("");
    invalidate();
    toast.success("Timesheet entry saved.");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "project_code", header: "Code", clickable: true },
          { key: "project_name", header: "Job Cost Project" },
          { key: "partner_name", header: "Customer" },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={selectProject}
        onNew={openNewProject}
        showNew={canCreateProject()}
        codeKey="project_code"
        nameKey="project_name"
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search job cost projects…"
      />

      <Show when={activeProjectId()}>
        <section class="mt-8 space-y-6">
          <div class="rounded border border-stroke bg-surface p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-text-primary">Budget vs actual</h2>
              <Show when={canBudget()}>
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 text-sm"
                  onClick={() => setBudgetModalOpen(true)}
                >
                  + Budget line
                </button>
              </Show>
            </div>
            <Show when={bva.data} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
              {(data) => (
                <div>
                  <div class="mb-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span class="text-text-secondary">Budget</span>
                      <p class="font-medium">{formatMoney(data().total_budget)}</p>
                    </div>
                    <div>
                      <span class="text-text-secondary">Actual (timesheets)</span>
                      <p class="font-medium">{formatMoney(data().total_actual)}</p>
                    </div>
                    <div>
                      <span class="text-text-secondary">Variance</span>
                      <p class="font-medium">{formatMoney(data().variance)}</p>
                    </div>
                  </div>
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-stroke text-left text-text-secondary">
                        <th class="py-1 pr-2">Category</th>
                        <th class="py-1 pr-2">Budget</th>
                        <th class="py-1 pr-2">Actual</th>
                        <th class="py-1">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={data().by_category}>
                        {(row) => (
                          <tr class="border-b border-stroke/50">
                            <td class="py-1 pr-2 capitalize">{row.category}</td>
                            <td class="py-1 pr-2">{formatMoney(row.budget)}</td>
                            <td class="py-1 pr-2">{formatMoney(row.actual)}</td>
                            <td class="py-1">{formatMoney(row.variance)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </Show>
          </div>

          <div class="rounded border border-stroke bg-surface p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-text-primary">Budget lines</h2>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-stroke text-left text-text-secondary">
                  <th class="py-1 pr-2">#</th>
                  <th class="py-1 pr-2">Category</th>
                  <th class="py-1 pr-2">Description</th>
                  <th class="py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                <For each={budget.data ?? []}>
                  {(ln) => (
                    <tr class="border-b border-stroke/50">
                      <td class="py-1 pr-2">{ln.line_no}</td>
                      <td class="py-1 pr-2 capitalize">{ln.category}</td>
                      <td class="py-1 pr-2">{ln.description}</td>
                      <td class="py-1">{formatMoney(ln.budget_amount)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="rounded border border-stroke bg-surface p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-text-primary">Timesheets</h2>
              <Show when={canTimesheet()}>
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 text-sm"
                  onClick={() => setTimesheetModalOpen(true)}
                >
                  + Timesheet entry
                </button>
              </Show>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-stroke text-left text-text-secondary">
                  <th class="py-1 pr-2">Date</th>
                  <th class="py-1 pr-2">Worker</th>
                  <th class="py-1 pr-2">Hours</th>
                  <th class="py-1 pr-2">Rate</th>
                  <th class="py-1">Cost</th>
                </tr>
              </thead>
              <tbody>
                <For each={timesheets.data?.rows ?? []}>
                  {(ts) => (
                    <tr class="border-b border-stroke/50">
                      <td class="py-1 pr-2">{ts.work_date}</td>
                      <td class="py-1 pr-2">{ts.worker_name}</td>
                      <td class="py-1 pr-2">{ts.hours}</td>
                      <td class="py-1 pr-2">{formatMoney(ts.hourly_rate)}</td>
                      <td class="py-1">{formatMoney(ts.cost_amount)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

      <EntityModal
        open={projectModalOpen()}
        title="New job cost project"
        saving={saving()}
        onClose={() => setProjectModalOpen(false)}
        onSave={() => void saveProject()}
      >
        <Field label="Project code">
          <input class={inputClass} value={projectCode()} onInput={(e) => setProjectCode(e.currentTarget.value)} />
        </Field>
        <Field label="Project name">
          <input class={inputClass} value={projectName()} onInput={(e) => setProjectName(e.currentTarget.value)} />
        </Field>
      </EntityModal>

      <EntityModal
        open={budgetModalOpen()}
        title="Add budget line"
        saving={saving()}
        onClose={() => setBudgetModalOpen(false)}
        onSave={() => void saveBudgetLine()}
      >
        <Field label="Category">
          <select class={inputClass} value={budgetCategory()} onChange={(e) => setBudgetCategory(e.currentTarget.value)}>
            <For each={BUDGET_CATEGORIES}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </Field>
        <Field label="Description">
          <input class={inputClass} value={budgetDescription()} onInput={(e) => setBudgetDescription(e.currentTarget.value)} />
        </Field>
        <Field label="Budget amount">
          <input class={inputClass} type="number" step="0.01" value={budgetAmount()} onInput={(e) => setBudgetAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>

      <EntityModal
        open={timesheetModalOpen()}
        title="Timesheet entry"
        saving={saving()}
        onClose={() => setTimesheetModalOpen(false)}
        onSave={() => void saveTimesheet()}
      >
        <Field label="Work date">
          <input class={inputClass} type="date" value={tsDate()} onInput={(e) => setTsDate(e.currentTarget.value)} />
        </Field>
        <Field label="Worker name">
          <input class={inputClass} value={tsWorker()} onInput={(e) => setTsWorker(e.currentTarget.value)} />
        </Field>
        <Field label="Hours">
          <input class={inputClass} type="number" step="0.25" value={tsHours()} onInput={(e) => setTsHours(e.currentTarget.value)} />
        </Field>
        <Field label="Hourly rate">
          <input class={inputClass} type="number" step="0.01" value={tsRate()} onInput={(e) => setTsRate(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </div>
  );
}
