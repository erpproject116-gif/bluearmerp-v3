import { createResource, createSignal, For } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Problem = {
  id: number;
  case_no: string;
  employee_name: string;
  category: string;
  priority: string;
  status: string;
  next_action: string;
  target_date: string;
  late: boolean;
  description: string;
};

const CATEGORIES = ["attendance", "performance", "workplace_conflict", "payroll", "employee_complaint", "sick_leave", "client_complaint", "transfer", "safety", "other"];
const STATUSES = ["new", "assigned", "under_review", "awaiting_response", "action_required", "resolved", "closed"];

export default function WorkplaceProblemsPage() {
  const toast = useToast();
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [category, setCategory] = createSignal("attendance");
  const [priority, setPriority] = createSignal("medium");
  const [description, setDescription] = createSignal("");
  const [nextAction, setNextAction] = createSignal("");
  const [target, setTarget] = createSignal("");
  const [isPrivate, setIsPrivate] = createSignal(false);
  const [owner, setOwner] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [open, setOpen] = createSignal(false);

  const [problems, { refetch }] = createResource(async () => (await apiFetch<Problem[]>("/api/v1/hr/workplace-problems")).data ?? []);

  const create = async () => {
    if (!empId()) return toast.warning("Choose an employee.");
    const res = await apiFetch("/api/v1/hr/workplace-problems", {
      method: "POST",
      body: JSON.stringify({
        employee_id: empId(),
        category: category(),
        priority: priority(),
        description: description(),
        next_action: nextAction(),
        target_date: target(),
        is_private: isPrivate(),
        owner_user_id: Number(owner()) || 0,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save.");
    const created = res.data as { id?: number } | undefined;
    if (file() && created?.id) {
      const data = new FormData();
      data.set("file", file()!);
      const token = await getAccessToken();
      await fetch(`${apiBase}/api/v1/hr/workplace-problems/${created.id}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: data,
      });
    }
    toast.success("Workplace problem saved.");
    setOpen(false);
    setDescription("");
    void refetch();
  };

  const update = async (row: Problem, status: string) => {
    const res = await apiFetch(`/api/v1/hr/workplace-problems/${row.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!res.success) return toast.warning(res.message ?? "Could not update.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Workplace problems</h1>
      <button type="button" class="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setOpen(true)}>New problem</button>
      <div class={open() ? "mb-4 grid gap-2 rounded-xl border border-stroke bg-surface p-4" : "hidden"}>
        <LookupCombo label="Employee" value={empLabel} selectedId={empId} onInput={setEmpLabel} onSelect={(o) => { setEmpId(o.id); setEmpLabel(o.label); }} onClear={() => { setEmpId(null); setEmpLabel(""); }} fetchOptions={(q) => fetchEmployeeOptions(q)} placeholder="Search employees…" />
        <Field label="Category"><select class={inputClass} value={category()} onChange={(e) => setCategory(e.currentTarget.value)}><For each={CATEGORIES}>{(c) => <option value={c}>{c}</option>}</For></select></Field>
        <Field label="Priority"><select class={inputClass} value={priority()} onChange={(e) => setPriority(e.currentTarget.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
        <Field label="Description"><textarea class={inputClass} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} /></Field>
        <Field label="Next step"><input class={inputClass} value={nextAction()} onInput={(e) => setNextAction(e.currentTarget.value)} /></Field>
        <Field label="Target date"><input type="date" class={inputClass} value={target()} onInput={(e) => setTarget(e.currentTarget.value)} /></Field>
        <Field label="Owner user id"><input class={inputClass} value={owner()} onInput={(e) => setOwner(e.currentTarget.value)} /></Field>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrivate()} onChange={(e) => setIsPrivate(e.currentTarget.checked)} />Private</label>
        <Field label="File"><input class={inputClass} type="file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} /></Field>
        <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void create()}>Save</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "case_no", header: "Case" },
          { key: "employee_name", header: "Employee" },
          { key: "category", header: "Category" },
          { key: "priority", header: "Priority" },
          { key: "status", header: "Status" },
          { key: "next_action", header: "Next step" },
          { key: "target_date", header: "Target date" },
          { key: "late", header: "Late", render: (row) => row.late ? "Late" : "" },
        ]}
        rows={problems() ?? []}
        loading={problems.loading}
        selectedId={null}
        onSelect={() => {}}
        onEdit={(row) => void update(row, row.status === "closed" ? "under_review" : "closed")}
        onNew={() => setOpen(true)}
        newLabel="New problem"
        codeKey="case_no"
        nameKey="employee_name"
      />
      <div class="mt-3 flex flex-wrap gap-2">
        <For each={STATUSES}>
          {(status) => <span class="text-xs text-text-secondary">{status}</span>}
        </For>
      </div>
    </HrLayout>
  );
}
