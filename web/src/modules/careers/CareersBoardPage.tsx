import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase } from "../../shared/api";
import { HrBadge, HrEmpty, HrNotice, HrPlanned } from "../hr/HrUi";
import "./careers-surface.css";
import "../hr/hr-surface.css";

type Opening = {
  id: number;
  title: string;
  site_name: string;
  headcount: number;
};

const SAVED_KEY = "careers-saved-jobs";

function loadSaved(): number[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

export default function CareersBoardPage() {
  const params = useParams();
  const navigate = useNavigate();
  const code = () => params.code ?? "";
  const jobId = () => {
    const raw = params.jobId;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const [q, setQ] = createSignal("");
  const [savedOnly, setSavedOnly] = createSignal(false);
  const [saved, setSaved] = createSignal(loadSaved());

  const [openings] = createResource(
    () => code(),
    async (c) => {
      if (!c) return [] as Opening[];
      const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(c)}/openings`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Company not found.");
      return (body.data ?? []) as Opening[];
    },
  );

  const filtered = createMemo(() => {
    const qq = q().trim().toLowerCase();
    const sav = new Set(saved());
    return (openings() ?? []).filter((row) => {
      if (savedOnly() && !sav.has(row.id)) return false;
      if (!qq) return true;
      return (
        row.title.toLowerCase().includes(qq) ||
        (row.site_name || "").toLowerCase().includes(qq)
      );
    });
  });

  const selected = createMemo(() => {
    const id = jobId();
    if (!id) return null;
    return (openings() ?? []).find((o) => o.id === id) ?? null;
  });

  const toggleSave = (id: number) => {
    const next = saved().includes(id) ? saved().filter((x) => x !== id) : [...saved(), id];
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  return (
    <div class="careers-surface hr-surface">
      <header class="ap-top">
        <div
          class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          B
        </div>
        <div>
          <b>Careers</b>
          <div class="text-xs text-text-secondary hide-sm">Public job board · powered by BluearmERP</div>
        </div>
        <span class="grow" />
        <nav class="flex flex-wrap gap-3 text-sm" aria-label="Careers">
          <A href={`/careers/${encodeURIComponent(code())}`}>Openings</A>
          <A href={`/apply/${encodeURIComponent(code())}#track`} class="text-text-secondary">
            Track <HrPlanned />
          </A>
          <A href={`/apply/${encodeURIComponent(code())}`} class="text-text-secondary">
            Apply
          </A>
        </nav>
      </header>

      <main class="ap-wrap">
        <Show when={openings.error}>
          <p class="text-sm text-red-600">{(openings.error as Error).message}</p>
        </Show>

        <Show when={!jobId()}>
          <section class="jobhero">
            <h1 style={{ margin: 0, "font-size": "24px" }}>Find a job</h1>
            <p class="mt-1 text-sm" style={{ opacity: 0.9 }}>
              Apply online. Applying is free. Client names are hidden on public posts.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <input
                class="input grow rounded-lg border-0 px-3 py-2 text-sm"
                style={{ flex: 1, "min-width": "180px" }}
                placeholder="Search job title…"
                aria-label="Search jobs"
                value={q()}
                onInput={(e) => setQ(e.currentTarget.value)}
              />
            </div>
          </section>

          <div class="jobs">
            <aside class="job-card" aria-label="Filters">
              <h3 class="mt-0 text-base font-semibold">Filter</h3>
              <label class="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={savedOnly()} onChange={(e) => setSavedOnly(e.currentTarget.checked)} />
                Saved on this device
              </label>
              <p class="mt-3 text-xs text-text-secondary">
                Industry / location filters need richer posting fields. <HrPlanned />
              </p>
              <hr class="my-3 border-stroke" />
              <A class="text-sm" href={`/apply/${encodeURIComponent(code())}`}>
                Continue application →
              </A>
            </aside>

            <div>
              <p class="mb-2 text-sm text-text-secondary">
                {openings.loading ? "Loading…" : `${filtered().length} opening${filtered().length === 1 ? "" : "s"}`}
              </p>
              <Show
                when={filtered().length > 0}
                fallback={
                  <HrEmpty
                    title={openings.loading ? "Loading…" : "No openings"}
                    hint="Try clearing filters, or check back later."
                  />
                }
              >
                <div class="grid gap-3">
                  <For each={filtered()}>
                    {(row) => (
                      <article class="job-card">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h2 class="m-0 text-lg font-semibold">{row.title}</h2>
                            <p class="mt-1 text-sm text-text-secondary">
                              {row.site_name} · {row.headcount} {row.headcount === 1 ? "slot" : "slots"}
                            </p>
                          </div>
                          <HrBadge tone="success">Open</HrBadge>
                        </div>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="hr-btn hr-btn-primary hr-btn-sm"
                            onClick={() => navigate(`/careers/${encodeURIComponent(code())}/${row.id}`)}
                          >
                            View
                          </button>
                          <A
                            class="hr-btn hr-btn-sm"
                            href={`/apply/${encodeURIComponent(code())}?job=${row.id}`}
                          >
                            Apply
                          </A>
                          <button type="button" class="hr-btn hr-btn-sm" onClick={() => toggleSave(row.id)}>
                            {saved().includes(row.id) ? "Unsave" : "Save"}
                          </button>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={jobId()}>
          <A href={`/careers/${encodeURIComponent(code())}`} class="text-sm text-brand-700 hover:underline">
            ← All openings
          </A>
          <Show
            when={selected()}
            fallback={
              <Show when={!openings.loading} fallback={<p class="mt-4 text-sm text-text-secondary">Loading…</p>}>
                <HrEmpty title="Opening not found" hint="It may have closed. Browse other openings." />
              </Show>
            }
          >
            {(row) => (
              <section class="job-card mt-3">
                <h1 class="m-0 text-2xl font-semibold">{row().title}</h1>
                <p class="mt-1 text-sm text-text-secondary">
                  {row().site_name} · {row().headcount} {row().headcount === 1 ? "slot" : "slots"}
                </p>
                <HrNotice>
                  Pay rate, schedule, and requirements need richer posting fields. <HrPlanned />
                </HrNotice>
                <div class="mt-4 flex flex-wrap gap-2">
                  <A class="hr-btn hr-btn-primary" href={`/apply/${encodeURIComponent(code())}?job=${row().id}`}>
                    Apply now
                  </A>
                  <button type="button" class="hr-btn" onClick={() => toggleSave(row().id)}>
                    {saved().includes(row().id) ? "Unsave" : "Save on this device"}
                  </button>
                </div>
              </section>
            )}
          </Show>
        </Show>
      </main>
    </div>
  );
}
