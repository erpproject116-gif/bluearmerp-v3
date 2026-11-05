import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { KanbanBoard, type KanbanColumn } from "../../shared/KanbanBoard";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrPageHead, type HrBadgeTone } from "./HrUi";

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
  job_posting_id?: number | null;
  job_posting_title?: string;
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

function statusLabel(status: string) {
  return STATUSES.find(([id]) => id === status)?.[1] ?? status.replaceAll("_", " ");
}

function statusTone(status: string): HrBadgeTone {
  switch (status) {
    case "hired":
    case "onboarding":
      return "success";
    case "rejected":
    case "terminated":
      return "danger";
    case "resigned":
      return "neutral";
    case "exam":
    case "final_interview":
      return "warning";
    case "initial_interview":
      return "info";
    case "pooling":
    default:
      return "brand";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function ApplicantsPage() {
  const toast = useToast();
  const [mode, setMode] = createSignal<ViewMode>(loadViewMode("hr-applicants", "board"));
  const storedAxis = typeof localStorage === "undefined" ? null : localStorage.getItem("hr-applicants-board-axis");
  const [axis, setAxis] = createSignal<"horizontal" | "vertical">(storedAxis === "vertical" ? "vertical" : "horizontal");
  const [collapsed, setCollapsed] = createSignal<string[]>([]);
  const [statusFilter, setStatusFilter] = createSignal("");
  const [search, setSearch] = createSignal("");
  const chooseAxis = (next: "horizontal" | "vertical") => {
    setAxis(next);
    if (typeof localStorage !== "undefined") localStorage.setItem("hr-applicants-board-axis", next);
  };
  const toggleColumn = (id: string) => {
    setCollapsed((cur) => (cur.includes(id) ? cur.filter((item) => item !== id) : [...cur, id]));
  };
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

  const filteredApps = createMemo(() => {
    const q = search().trim().toLowerCase();
    const st = statusFilter();
    return (applications() ?? []).filter((row) => {
      if (st && row.status !== st) return false;
      if (!q) return true;
      return (
        row.full_name.toLowerCase().includes(q) ||
        (row.position_desired || "").toLowerCase().includes(q) ||
        (row.email || "").toLowerCase().includes(q) ||
        (row.industry || "").toLowerCase().includes(q) ||
        (row.workplace || "").toLowerCase().includes(q)
      );
    });
  });

  const columns = createMemo<KanbanColumn<Application>[]>(() =>
    STATUSES.map(([id, label]) => ({ id, label, items: filteredApps().filter((row) => row.status === id) })),
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
    if (!newName().trim()) return toast.warning("Enter a list name.");
    const res = await apiFetch("/api/v1/hr/applicant-segments", {
      method: "POST",
      body: JSON.stringify({ kind: newKind(), name: newName().trim() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not add the name.");
    setNewName("");
    void refetchSegments();
    toast.success("List item added.");
  };

  const card = (row: Application) => (
    <div class="hr-kb-card mb-2 rounded-lg border border-stroke bg-surface p-2 text-sm">
      <div class="hr-who mb-1">
        <div class="hr-avatar" aria-hidden="true">{initials(row.full_name)}</div>
        <b class="truncate">{row.full_name}</b>
      </div>
      <p class="text-text-secondary">{row.position_desired || "No position"}</p>
      <Show when={row.job_posting_title}>
        <p class="text-xs text-brand-700">Opening: {row.job_posting_title}</p>
      </Show>
      <p class="text-xs text-text-secondary">{row.industry || "No industry"} · {row.workplace || "No workplace"}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1">
        <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>
        <span class="hr-muted">
          Docs
        </span>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <A href={`/app/hr/applicants/${row.id}`} class="text-xs font-semibold text-brand-700">
          Open record
        </A>
        <button type="button" class="text-xs font-semibold text-brand-700" onClick={() => setSelected(row.id)}>
          Comment
        </button>
      </div>
    </div>
  );

  return (
    <HrLayout>
      <HrPageHead
        title="Applicants"
        subtitle="Submissions from the public application form, as a pipeline board. Drag cards between stages."
        actions={
          <div class="hr-actions">
            <A class="hr-btn" href="/app/hr/applicants/settings">
              Open application form ↗
            </A>
            <A class="hr-btn" href="/app/hr/hire-onboarding">
              Onboarding ↗
            </A>
            <A class="hr-btn" href="/app/hr/workforce">
              Employee board ↗
            </A>
            <details class="hr-menu">
              <summary class="hr-btn">Manage lists ▾</summary>
              <div class="p-2">
                <p class="mb-2 text-xs text-text-secondary">Add industry or workplace names used on applications.</p>
                <select class={`${inputClass} mb-2`} value={newKind()} onChange={(e) => setNewKind(e.currentTarget.value as "industry" | "workplace")}>
                  <option value="industry">Industry</option>
                  <option value="workplace">Workplace</option>
                </select>
                <input class={`${inputClass} mb-2`} placeholder="List name" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} />
                <button type="button" class="hr-btn hr-btn-primary hr-btn-sm w-full" onClick={() => void addSegment()}>
                  Add to list
                </button>
              </div>
            </details>
            <A class="hr-btn" href="/app/hr/applicants/settings">
              Form settings
            </A>
            <Show when={mode() === "board"}>
              <div class="hr-seg" role="group" aria-label="Board orientation">
                <button type="button" classList={{ on: axis() === "horizontal" }} onClick={() => chooseAxis("horizontal")}>
                  Columns
                </button>
                <button type="button" classList={{ on: axis() === "vertical" }} onClick={() => chooseAxis("vertical")}>
                  Rows
                </button>
              </div>
            </Show>
            <ViewModeToggle value={mode()} onChange={setMode} storageKey="hr-applicants" />
          </div>
        }
      />

      <p class="hr-muted mb-3">
        SLA / aging targets per stage and rejection notice email are not wired yet.
      </p>

      <div class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stroke bg-surface p-2">
        <input
          class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
          placeholder="Search name, position, email…"
          aria-label="Search"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <Field label="Industry">
          <select class={inputClass} value={industry()} onChange={(e) => setIndustry(e.currentTarget.value)}>
            <option value="">Industry: All</option>
            <For each={(segments() ?? []).filter((s) => s.kind === "industry")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </Field>
        <Field label="Workplace">
          <select class={inputClass} value={workplace()} onChange={(e) => setWorkplace(e.currentTarget.value)}>
            <option value="">Workplace: All</option>
            <For each={(segments() ?? []).filter((s) => s.kind === "workplace")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </Field>
      </div>

      <div class="hr-chiprow mb-3" role="group" aria-label="Status filter">
        <button type="button" classList={{ on: statusFilter() === "" }} onClick={() => setStatusFilter("")}>
          All
        </button>
        <For each={[...STATUSES]}>
          {([id, label]) => (
            <button type="button" classList={{ on: statusFilter() === id }} onClick={() => setStatusFilter(id)}>
              {label}
            </button>
          )}
        </For>
      </div>

      <Show
        when={mode() === "board"}
        fallback={
          <SpreadsheetGrid
            columns={[
              {
                key: "full_name",
                header: "Name",
                render: (row) => (
                  <A href={`/app/hr/applicants/${row.id}`} class="hr-who">
                    <div class="hr-avatar" aria-hidden="true">{initials(row.full_name)}</div>
                    <b>{row.full_name}</b>
                  </A>
                ),
                exportValue: (row) => row.full_name,
              },
              { key: "position_desired", header: "Position desired" },
              {
                key: "job_posting_title",
                header: "Opening",
                render: (row) => row.job_posting_title || "—",
                exportValue: (row) => row.job_posting_title || "",
              },
              {
                key: "status",
                header: "Status",
                render: (row) => <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>,
                exportValue: (row) => statusLabel(row.status),
              },
              { key: "industry", header: "Industry" },
              { key: "workplace", header: "Workplace" },
              { key: "email", header: "Email" },
              { key: "cellphone", header: "Cellphone No." },
              {
                key: "actions",
                header: "Actions",
                sortable: false,
                hideable: false,
                render: (row) => (
                  <details class="hr-menu hr-rowmenu">
                    <summary class="hr-rowmenu-btn" aria-label="Row actions">
                      ⋯
                    </summary>
                    <div>
                      <A class="menu-item" href={`/app/hr/applicants/${row.id}`}>
                        Open record
                      </A>
                      <button type="button" class="menu-item" onClick={() => setSelected(row.id)}>
                        Comment
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        onClick={() => toast.warning("Reject dialog extras need backend remarks workflow.")}
                      >
                        Reject
                      </button>
                    </div>
                  </details>
                ),
              },
            ]}
            rows={filteredApps()}
            loading={applications.loading}
            selectedId={selected()}
            onSelect={setSelected}
            onEdit={(row) => setSelected(row.id)}
            onNew={() => {}}
            showNew={false}
            hideExport
            codeKey="full_name"
            nameKey="position_desired"
            settingsHref="/app/hr/applicants/settings"
          />
        }
      >
        <KanbanBoard
          columns={columns()}
          getCardId={(row) => row.id}
          onDrop={(row, from, to) => void move(row, from, to)}
          renderCard={card}
          loading={applications.loading}
          orientation={axis()}
          collapsedIds={collapsed()}
          onToggleColumn={toggleColumn}
        />
      </Show>

      <Show when={selected()}>
        {(id) => {
          const row = () => (applications() ?? []).find((item) => item.id === id());
          return (
            <section class="mt-4 rounded-xl border border-stroke bg-surface p-4">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <div class="hr-who">
                  <div class="hr-avatar" aria-hidden="true">{initials(row()?.full_name || "?")}</div>
                  <h2 class="font-medium">{row()?.full_name}</h2>
                </div>
                <Show when={row()}>
                  <HrBadge tone={statusTone(row()!.status)}>{statusLabel(row()!.status)}</HrBadge>
                </Show>
                <A href={`/app/hr/applicants/${id()}`} class="ml-auto text-sm text-brand-700">
                  Full applicant flow →
                </A>
              </div>
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
              <button type="button" class="hr-btn hr-btn-primary mt-2" onClick={() => void addComment()}>
                Save comment
              </button>
            </section>
          );
        }}
      </Show>
    </HrLayout>
  );
}
