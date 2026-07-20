import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Cycle = { id: number; name: string; period_start: string; period_end: string; status: string };
type Review = {
  id: number; employee_no?: string; employee_name?: string; status: string;
  self_comments: string; manager_comments: string; overall_score?: number | null;
};

export default function PerformancePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [cycleId, setCycleId] = createSignal<number | null>(null);
  const [editId, setEditId] = createSignal<number | null>(null);
  const [score, setScore] = createSignal("");
  const [comments, setComments] = createSignal("");

  const cycles = createQuery(() => ({
    queryKey: ["hr-review-cycles"],
    queryFn: async () => (await apiFetch<Cycle[]>("/api/v1/hr/performance/cycles")).data ?? [],
  }));
  const reviews = createQuery(() => ({
    queryKey: ["hr-reviews", cycleId()],
    enabled: !!cycleId(),
    queryFn: async () => (await apiFetch<Review[]>(`/api/v1/hr/performance/reviews?cycle_id=${cycleId()}`)).data ?? [],
  }));

  const createCycle = async () => {
    if (!name().trim() || !start() || !end()) return toast.warning("Name and period required.");
    const res = await apiFetch<Cycle>("/api/v1/hr/performance/cycles", {
      method: "POST",
      body: JSON.stringify({ name: name().trim(), period_start: start(), period_end: end(), cycle_kind: "annual" }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Cycle created.");
    setCycleId(res.data?.id ?? null);
    void qc.invalidateQueries({ queryKey: ["hr-review-cycles"] });
  };

  const assign = async () => {
    const id = cycleId();
    if (!id) return;
    const res = await apiFetch(`/api/v1/hr/performance/cycles/${id}/assign`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Reviews assigned.");
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  const saveManager = async () => {
    const id = editId();
    if (!id) return;
    const res = await apiFetch(`/api/v1/hr/performance/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        manager_comments: comments(),
        overall_score: Number(score()) || null,
        status: "manager_done",
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Saved.");
    setEditId(null);
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Evaluations</h1>
      <p class="mb-6 text-sm text-text-secondary">Review cycles, manager scoring, acknowledgment, and 201 store.</p>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">New cycle</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></Field>
          <Field label="Start"><input type="date" class={inputClass} value={start()} onInput={(e) => setStart(e.currentTarget.value)} /></Field>
          <Field label="End"><input type="date" class={inputClass} value={end()} onInput={(e) => setEnd(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void createCycle()}>Create cycle</button>
      </section>

      <section class="mb-4 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Cycles</h2>
        <div class="flex flex-wrap gap-2">
          <For each={cycles.data ?? []}>
            {(c) => (
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                classList={{ "border-brand-500 bg-brand-50": cycleId() === c.id }}
                onClick={() => setCycleId(c.id)}
              >
                {c.name} ({c.status})
              </button>
            )}
          </For>
        </div>
        <Show when={cycleId()}>
          <button type="button" class="mt-3 rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => void assign()}>
            Assign to all active employees
          </button>
        </Show>
      </section>

      <Show when={cycleId()}>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-lg font-medium">Reviews</h2>
          <For each={reviews.data ?? []} fallback={<p class="text-sm text-text-secondary">No reviews — assign first.</p>}>
            {(r) => (
              <div class="mb-4 border-b border-slate-100 pb-3 text-sm">
                <p class="font-medium">{r.employee_no} — {r.employee_name} · {r.status}</p>
                <p class="text-text-secondary">Self: {r.self_comments || "—"}</p>
                <p class="text-text-secondary">Manager: {r.manager_comments || "—"} · score {r.overall_score ?? "—"}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => {
                      setEditId(r.id);
                      setScore(String(r.overall_score ?? ""));
                      setComments(r.manager_comments || "");
                    }}
                  >
                    Edit manager review
                  </button>
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => void apiFetch(`/api/v1/hr/performance/reviews/${r.id}/store-201`, { method: "POST", body: "{}" }).then((res) => {
                      if (!res.success) toast.warning(res.message ?? "Failed.");
                      else toast.success("Stored in 201.");
                    })}
                  >
                    Store 201
                  </button>
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => void apiFetch(`/api/v1/hr/performance/reviews/${r.id}/acknowledge`, { method: "POST", body: "{}" }).then(() => {
                      void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
                    })}
                  >
                    Acknowledge
                  </button>
                </div>
                <Show when={editId() === r.id}>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Score"><input class={inputClass} value={score()} onInput={(e) => setScore(e.currentTarget.value)} /></Field>
                    <Field label="Comments"><input class={inputClass} value={comments()} onInput={(e) => setComments(e.currentTarget.value)} /></Field>
                    <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-xs text-white" onClick={() => void saveManager()}>Save</button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </section>
      </Show>
    </HrLayout>
  );
}
