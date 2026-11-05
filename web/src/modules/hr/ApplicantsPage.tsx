import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { KanbanBoard, type KanbanColumn } from "../../shared/KanbanBoard";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Application = {
  id: number;
  full_name: string;
  status: string;
  position_desired: string;
  email: string;
  cellphone: string;
  industry: string;
  workplace: string;
  industry_id: number | null;
  workplace_type_id: number | null;
};
type Segment = { id: number; kind: "industry" | "workplace"; name: string };

const STATUSES = [
  ["pooling", "Pooling"],
  ["initial_interview", "Initial interview"],
  ["exam", "Exam"],
  ["final_interview", "Final interview"],
  ["onboarding", "Onboarding"],
  ["hired", "Hired"],
  ["rejected", "Rejected"],
  ["terminated", "Terminated"],
  ["resigned", "Resigned"],
] as const;

export default function ApplicantsPage() {
  const toast = useToast();
  const [mode, setMode] = createSignal<ViewMode>(loadViewMode("hr-applicants", "board"));
  const [industry, setIndustry] = createSignal("");
  const [workplace, setWorkplace] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [comment, setComment] = createSignal("");
  const [newKind, setNewKind] = createSignal<"industry" | "workplace">("industry");
  const [newName, setNewName] = createSignal("");

  const [segments, { refetch: refetchSegments }] = createResource(async () => (await apiFetch<Segment[]>("/api/v1/hr/applicant-segments")).data ?? []);
  const [applications, { refetch: refetchApplications }] = createResource(
    () => `${industry()}|${workplace()}`,
    async () => {
      const q = new URLSearchParams();
      if (industry()) q.set("industry_id", industry());
      if (workplace()) q.set("workplace_type_id", workplace());
      const res = await apiFetch<Application[]>(`/api/v1/hr/applications?${q}`);
      return res.data ?? [];
    },
  );

  const columns = createMemo<KanbanColumn<Application>[]>(() =>
    STATUSES.map(([id, label]) => ({ id, label, items: (applications() ?? []).filter((row) => row.status === id) })),
  );

  const move = async (row: Application, _from: string, to: string) => {
    const res = await apiFetch(`/api/v1/hr/applications/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: to }) });
    if (!res.success) return toast.warning(res.message ?? "Could not move the application.");
    void refetchApplications();
  };

  const saveSegments = async (row: Application, industryId: string, workplaceId: string) => {
    const res = await apiFetch(`/api/v1/hr/applications/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        industry_id: industryId ? Number(industryId) : row.industry_id,
        workplace_type_id: workplaceId ? Number(workplaceId) : row.workplace_type_id,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save.");
    void refetchApplications();
  };

  const addComment = async () => {
    const id = selected();
    if (!id) return;
    const data = new FormData();
    data.set("body", comment());
    const file = (document.getElementById("applicant-comment-file") as HTMLInputElement | null)?.files?.[0];
    if (file) data.set("file", file);
    const token = await getAccessToken();
    const res = await fetch(`${apiBase}/api/v1/hr/applications/${id}/comments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data,
    });
    if (!res.ok) return toast.warning("Could not save the comment.");
    setComment("");
    toast.success("Comment saved.");
  };

  const addSegment = async () => {
    const res = await apiFetch("/api/v1/hr/applicant-segments", {
      method: "POST",
      body: JSON.stringify({ kind: newKind(), name: newName().trim() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not add the name.");
    setNewName("");
    void refetchSegments();
  };

  const card = (row: Application) => (
    <div class="mb-2 rounded-lg border border-stroke bg-surface p-2 text-sm">
      <p class="font-medium">{row.full_name}</p>
      <p class="text-text-secondary">{row.position_desired || "No position"}</p>
      <p class="text-text-secondary">{row.industry || "No industry"} · {row.workplace || "No workplace"}</p>
      <A href={`/app/hr/applicants/${row.id}`} class="mt-1 mr-2 text-xs text-brand-700">Open record</A>
      <button type="button" class="mt-1 text-xs text-brand-700" onClick={() => setSelected(row.id)}>Comment</button>
    </div>
  );

  return (
    <HrLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold">Applicants</h1>
          <p class="mt-1 text-sm text-text-secondary">Submissions from the public application form.</p>
        </div>
        <ViewModeToggle value={mode()} onChange={setMode} storageKey="hr-applicants" />
      </div>
      <div class="mb-4 grid gap-2 sm:grid-cols-2">
        <Field label="Industry">
          <select class={inputClass} value={industry()} onChange={(e) => setIndustry(e.currentTarget.value)}>
            <option value="">All</option>
            <For each={(segments() ?? []).filter((s) => s.kind === "industry")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </Field>
        <Field label="Workplace">
          <select class={inputClass} value={workplace()} onChange={(e) => setWorkplace(e.currentTarget.value)}>
            <option value="">All</option>
            <For each={(segments() ?? []).filter((s) => s.kind === "workplace")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </Field>
      </div>
      <div class="mb-4 flex flex-wrap gap-2">
        <select class={inputClass} value={newKind()} onChange={(e) => setNewKind(e.currentTarget.value as "industry" | "workplace")}>
          <option value="industry">Industry</option>
          <option value="workplace">Workplace</option>
        </select>
        <input class={inputClass} placeholder="List name" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} />
        <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm" onClick={() => void addSegment()}>Add to list</button>
      </div>
      <Show when={mode() === "board"} fallback={
        <SpreadsheetGrid
          columns={[
            { key: "full_name", header: "Name", render: (row) => <A href={`/app/hr/applicants/${row.id}`}>{row.full_name}</A> },
            { key: "position_desired", header: "Position desired" },
            { key: "status", header: "Status", render: (row) => STATUSES.find(([id]) => id === row.status)?.[1] ?? row.status },
            { key: "industry", header: "Industry" },
            { key: "workplace", header: "Workplace" },
            { key: "email", header: "Email" },
            { key: "cellphone", header: "Cellphone No." },
          ]}
          rows={applications() ?? []}
          loading={applications.loading}
          selectedId={selected()}
          onSelect={setSelected}
          onEdit={(row) => setSelected(row.id)}
          onNew={() => {}}
          showNew={false}
          codeKey="full_name"
          nameKey="position_desired"
          settingsHref="/app/hr/applicants/settings"
        />
      }>
        <KanbanBoard columns={columns()} getCardId={(row) => row.id} onDrop={(row, from, to) => void move(row, from, to)} renderCard={card} loading={applications.loading} />
      </Show>
      <Show when={selected()}>
        {(id) => {
          const row = () => (applications() ?? []).find((item) => item.id === id());
          return (
            <section class="mt-4 rounded-xl border border-stroke bg-surface p-4">
              <h2 class="mb-2 font-medium">{row()?.full_name}</h2>
              <div class="grid gap-2 sm:grid-cols-2">
                <Field label="Industry">
                  <select class={inputClass} value={row()?.industry_id ?? ""} onChange={(e) => row() && void saveSegments(row()!, e.currentTarget.value, "")}>
                    <option value="">None</option>
                    <For each={(segments() ?? []).filter((s) => s.kind === "industry")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
                  </select>
                </Field>
                <Field label="Workplace">
                  <select class={inputClass} value={row()?.workplace_type_id ?? ""} onChange={(e) => row() && void saveSegments(row()!, "", e.currentTarget.value)}>
                    <option value="">None</option>
                    <For each={(segments() ?? []).filter((s) => s.kind === "workplace")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
                  </select>
                </Field>
              </div>
              <Field label="Comment">
                <textarea class={inputClass} value={comment()} onInput={(e) => setComment(e.currentTarget.value)} />
              </Field>
              <input id="applicant-comment-file" class={`${inputClass} mt-2`} type="file" />
              <button type="button" class="mt-2 rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void addComment()}>Save comment</button>
            </section>
          );
        }}
      </Show>
    </HrLayout>
  );
}
