import { Navigate, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { DayJobsPanel } from "../../shared/DayJobsPanel";
import { DashboardLayout } from "./DashboardLayout";
import { HomeCustomizePanel } from "./HomeCustomizePanel";
import { HomeExtraWidget } from "./HomeExtraWidgets";
import { HomeFinanceOverview } from "./HomeFinanceOverview";
import { HomeGettingStarted } from "./HomeGettingStarted";
import { HomeRecentActivity } from "./HomeRecentActivity";
import { HomeShortcuts } from "./HomeShortcuts";
import { DEFAULT_HOME_WIDGETS, normalizeHomeWidgets, type HomeWidgetId } from "./homeWidgets";
import { useHomeLayout, useSaveHomeLayout } from "./useHomeLayout";

/** Home: greeting + chosen widgets. Default is finance + day jobs + getting started. */
export default function DashboardPage() {
  const [params] = useSearchParams();
  const tab = () => params.tab;
  const auth = useAuth();
  const toast = useToast();
  const layout = useHomeLayout();
  const save = useSaveHomeLayout();
  const [customizeOpen, setCustomizeOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<HomeWidgetId[] | null>(null);

  const selected = createMemo(() => draft() ?? layout.data ?? DEFAULT_HOME_WIDGETS);
  const company = () => auth.me?.tenant.company_name ?? "your business";
  const hello = () => {
    const name = auth.me?.user?.full_name?.trim();
    return name ? `Hello, ${name}` : "Hello";
  };

  const openCustomize = () => {
    setDraft([...(layout.data ?? DEFAULT_HOME_WIDGETS)]);
    setCustomizeOpen(true);
  };

  const toggle = (id: HomeWidgetId) => {
    if (id === "finance") return;
    setDraft((prev) => {
      const cur = [...(prev ?? selected())];
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
      return normalizeHomeWidgets(cur);
    });
  };

  const move = (id: HomeWidgetId, dir: -1 | 1) => {
    setDraft((prev) => {
      const cur = [...(prev ?? selected())];
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 1 || j < 1 || j >= cur.length) return cur;
      const tmp = cur[i]!;
      cur[i] = cur[j]!;
      cur[j] = tmp;
      return cur;
    });
  };

  const persist = async () => {
    try {
      await save.mutateAsync(selected());
      toast.success("Home layout saved.");
      setCustomizeOpen(false);
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save Home layout.");
    }
  };

  const extras = () =>
    selected().filter(
      (id) =>
        id !== "finance" &&
        id !== "day_jobs" &&
        id !== "getting_started" &&
        id !== "shortcuts" &&
        id !== "recent_activity",
    );

  return (
    <DashboardLayout>
      <Show when={tab() === "intel"}>
        <Navigate href="/app/reports" />
      </Show>
      <Show when={tab() === "mypage"}>
        <Navigate href="/app/onboarding" />
      </Show>
      <Show when={tab() !== "intel" && tab() !== "mypage"}>
        <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold text-text-primary">{hello()}</h2>
            <p class="text-sm text-text-secondary">{company()}</p>
          </div>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-slate-50"
            onClick={openCustomize}
          >
            Customize
          </button>
        </div>

        <div class="space-y-6">
          <Show when={selected().includes("getting_started")}>
            <HomeGettingStarted />
          </Show>
          <Show when={selected().includes("finance")}>
            <HomeFinanceOverview hideIntro />
          </Show>
          <Show when={selected().includes("recent_activity")}>
            <HomeRecentActivity />
          </Show>
          <Show when={selected().includes("shortcuts")}>
            <HomeShortcuts />
          </Show>
          <Show when={extras().length > 0}>
            <div class="grid gap-4 lg:grid-cols-2">
              <For each={extras()}>{(id) => <HomeExtraWidget id={id} />}</For>
            </div>
          </Show>
          <Show when={selected().includes("day_jobs")}>
            <DayJobsPanel />
          </Show>
        </div>

        <HomeCustomizePanel
          open={customizeOpen()}
          selected={selected()}
          saving={save.isPending}
          onClose={() => {
            setCustomizeOpen(false);
            setDraft(null);
          }}
          onToggle={toggle}
          onMove={move}
          onReset={() => setDraft([...DEFAULT_HOME_WIDGETS])}
          onSave={() => void persist()}
        />
      </Show>
    </DashboardLayout>
  );
}
