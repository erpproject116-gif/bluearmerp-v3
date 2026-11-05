import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { KanbanBoard, type KanbanColumn } from "../../shared/KanbanBoard";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";

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
  created_at?: string;
  updated_at?: string;
  has_signature?: boolean;
  file_count?: number;
};
type Segment = { id: number; kind: "industry" | "workplace"; name: string };

type StageDef = { id: string; label: string; color: string; icon: string };

const STAGES: StageDef[] = [
  { id: "pooling", label: "New", color: "#2563EB", icon: "✉" },
  { id: "initial_interview", label: "For interview", color: "#7C3AED", icon: "🗣" },
  { id: "exam", label: "For exam", color: "#9333EA", icon: "📝" },
  { id: "final_interview", label: "For final interview", color: "#C026D3", icon: "🎯" },
  { id: "onboarding", label: "Onboarding", color: "#0F766E", icon: "📋" },
  { id: "hired", label: "Hired", color: "#15803D", icon: "✅" },
  { id: "rejected", label: "Rejected", color: "#B91C1C", icon: "✖" },
  { id: "terminated", label: "Terminated", color: "#9F1239", icon: "⛔" },
  { id: "resigned", label: "Resigned", color: "#64748B", icon: "↩" },
];

function stageOf(status: string): StageDef {
  return STAGES.find((s) => s.id === status) ?? { id: status, label: status.replaceAll("_", " "), color: "#64748B", icon: "•" };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
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
  const [menuFor, setMenuFor] = createSignal<number | null>(null);
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
        (row.workplace || "").toLowerCase().includes(q) ||
        (row.job_posting_title || "").toLowerCase().includes(q) ||
        (row.cellphone || "").toLowerCase().includes(q)
      );
    });
  });

  const columns = createMemo<KanbanColumn<Application>[]>(() =>
    STAGES.map((stage) => ({
      id: stage.id,
      label: stage.label,
      color: stage.color,
      icon: stage.icon,
      items: filteredApps().filter((row) => row.status === stage.id),
    })),
  );

  const move = async (row: Application, _from: string, to: string) => {
    setMenuFor(null);
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

  const card = (row: Application) => {
    const stage = stageOf(row.status);
    const age = daysSince(row.updated_at || row.created_at);
    const files = row.file_count ?? 0;
    const sub = [row.position_desired, row.job_posting_title || row.industry].filter(Boolean).join(" · ");
    return (
      <article
        class="hr-kb-card"
        classList={{ sel: selected() === row.id }}
        style={{ "--c": stage.color }}
        tabindex={0}
        aria-label={`${row.full_name}, ${stage.label}`}
        onClick={() => setSelected(row.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") window.location.assign(`/app/hr/applicants/${row.id}`);
          if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            setMenuFor(menuFor() === row.id ? null : row.id);
          }
        }}
      >
        <div class="hr-kb-ch">
          <span class="hr-kb-av" aria-hidden="true">
            {initials(row.full_name)}
          </span>
          <div class="hr-kb-nm">
            <b>{row.full_name}</b>
            <div class="xs muted text-xs text-text-secondary">{sub || "No position"}</div>
          </div>
          <details
            class="hr-menu relative"
            open={menuFor() === row.id}
            onToggle={(e) => setMenuFor(e.currentTarget.open ? row.id : null)}
          >
            <summary
              class="hr-btn hr-btn-sm hr-btn-ghost hr-kb-more"
              aria-label={`Move ${row.full_name}`}
              onClick={(e) => e.stopPropagation()}
            >
              ⋯
            </summary>
            <div class="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-stroke bg-surface p-1 shadow-lg">
              <A class="menu-item block px-2 py-1.5 text-sm" href={`/app/hr/applicants/${row.id}`} onClick={(e) => e.stopPropagation()}>
                Open record
              </A>
              <For each={STAGES.filter((s) => s.id !== row.status)}>
                {(s) => (
                  <button
                    type="button"
                    class="menu-item block w-full px-2 py-1.5 text-left text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void move(row, row.status, s.id);
                    }}
                  >
                    <span class="hr-kb-stage-pill" style={{ "--c": s.color }}>
                      {s.icon} {s.label}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </details>
        </div>
        <div class="hr-kb-meta">
          <Show when={row.workplace}>
            <span class="hr-kb-chip">{row.workplace}</span>
          </Show>
          <Show when={row.industry && !row.job_posting_title}>
            <span class="hr-kb-chip">{row.industry}</span>
          </Show>
          <Show when={age !== null}>
            <span class="hr-kb-age" classList={{ "hr-kb-age-late": (age ?? 0) >= 14, "hr-kb-age-ok": (age ?? 0) < 7 }} title="Days since last update">
              ⏱ {age}d
            </span>
          </Show>
        </div>
        <div class="hr-kb-ft">
          <span>
            <Show when={files > 0} fallback="No files">
              {files} file{files === 1 ? "" : "s"}
            </Show>
          </span>
          <Show when={row.cellphone}>
            <span>{row.cellphone}</span>
          </Show>
        </div>
        <div class="hr-kb-flags">
          <Show when={row.has_signature}>
            <span class="hr-kb-flag hr-kb-flag-sig">Signature on file</span>
          </Show>
          <Show when={files === 0}>
            <span class="hr-kb-flag hr-kb-flag-missing">No files yet</span>
          </Show>
        </div>
      </article>
    );
  };

  return (
    <HrLayout>
      <HrPageHead
        title="Applicants"
        subtitle="Submissions from the public application form, as a pipeline board. Drag cards between stages, or press M on a focused card."
        actions={
          <div class="hr-actions">
            <A class="hr-btn" href="/app/hr/applicants/settings">
              Form settings
            </A>
            <A class="hr-btn" href="/app/hr/hire-onboarding">
              Hire onboarding
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
            <Show when={mode() === "board"}>
              <div class="hr-seg" role="group" aria-label="Board orientation">
                <button type="button" classList={{ on: axis() === "horizontal" }} onClick={() => chooseAxis("horizontal")}>
                  ⇆ Horizontal
                </button>
                <button type="button" classList={{ on: axis() === "vertical" }} onClick={() => chooseAxis("vertical")}>
                  ⇅ Vertical
                </button>
              </div>
            </Show>
            <ViewModeToggle value={mode()} onChange={setMode} storageKey="hr-applicants" />
          </div>
        }
      />

      <div class="hr-kb-tools" role="toolbar" aria-label="Board tools">
        <input
          class={`${inputClass} hr-kb-q`}
          type="search"
          placeholder="Search name, position, email…"
          aria-label="Search"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <select class={inputClass} aria-label="Industry" value={industry()} onChange={(e) => setIndustry(e.currentTarget.value)}>
          <option value="">All industry</option>
          <For each={(segments() ?? []).filter((s) => s.kind === "industry")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
        </select>
        <select class={inputClass} aria-label="Workplace" value={workplace()} onChange={(e) => setWorkplace(e.currentTarget.value)}>
          <option value="">All workplace</option>
          <For each={(segments() ?? []).filter((s) => s.kind === "workplace")}>{(s) => <option value={s.id}>{s.name}</option>}</For>
        </select>
        <select class={inputClass} aria-label="Stage" value={statusFilter()} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
          <option value="">All stages</option>
          <For each={STAGES}>{(s) => <option value={s.id}>{s.label}</option>}</For>
        </select>
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
                    <div class="hr-avatar" style={{ background: stageOf(row.status).color }} aria-hidden="true">
                      {initials(row.full_name)}
                    </div>
                    <b>{row.full_name}</b>
                  </A>
                ),
                exportValue: (row) => row.full_name,
              },
              {
                key: "status",
                header: "Stage",
                render: (row) => {
                  const s = stageOf(row.status);
                  return (
                    <span class="hr-kb-stage-pill" style={{ "--c": s.color }}>
                      {s.icon} {s.label}
                    </span>
                  );
                },
                exportValue: (row) => stageOf(row.status).label,
              },
              {
                key: "position_desired",
                header: "Position · opening",
                render: (row) => [row.position_desired, row.job_posting_title].filter(Boolean).join(" · ") || "—",
                exportValue: (row) => [row.position_desired, row.job_posting_title].filter(Boolean).join(" · "),
              },
              { key: "industry", header: "Industry" },
              { key: "workplace", header: "Workplace" },
              {
                key: "created_at",
                header: "Age",
                render: (row) => {
                  const age = daysSince(row.updated_at || row.created_at);
                  return age === null ? "—" : `${age}d`;
                },
                exportValue: (row) => String(daysSince(row.updated_at || row.created_at) ?? ""),
              },
              {
                key: "file_count",
                header: "Files",
                render: (row) => row.file_count ?? 0,
                exportValue: (row) => row.file_count ?? 0,
              },
              {
                key: "has_signature",
                header: "Signature",
                render: (row) => (row.has_signature ? "Yes" : "—"),
                exportValue: (row) => (row.has_signature ? "yes" : ""),
              },
              { key: "email", header: "Email" },
              { key: "cellphone", header: "Cellphone" },
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
                      <For each={STAGES.filter((s) => s.id !== row.status)}>
                        {(s) => (
                          <button type="button" class="menu-item" onClick={() => void move(row, row.status, s.id)}>
                            Move → {s.label}
                          </button>
                        )}
                      </For>
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
          const stage = () => stageOf(row()?.status || "");
          return (
            <section class="mt-4 rounded-xl border border-stroke bg-surface p-4" style={{ "border-top": `4px solid ${stage().color}` }}>
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <div class="hr-who">
                  <div class="hr-kb-av" style={{ background: stage().color }} aria-hidden="true">
                    {initials(row()?.full_name || "?")}
                  </div>
                  <h2 class="font-medium">{row()?.full_name}</h2>
                </div>
                <span class="hr-kb-stage-pill" style={{ "--c": stage().color }}>
                  {stage().icon} {stage().label}
                </span>
                <A href={`/app/hr/applicants/${id()}`} class="ml-auto text-sm text-brand-700">
                  Full applicant flow →
                </A>
                <button type="button" class="hr-btn hr-btn-sm" onClick={() => setSelected(null)}>
                  Close
                </button>
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
