import { A, Navigate, useLocation, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { canManageWorkspaceSetup } from "../../shared/resolveAppEntryPath";
import { useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { resolveGettingStarted } from "../../shared/setupProgress";
import { useSetupReadiness } from "../../shared/usePlatform";
import { DayJobsPanel } from "../../shared/DayJobsPanel";
import { DashboardLayout } from "./DashboardLayout";
import { HomeCustomizePanel } from "./HomeCustomizePanel";
import { HomeExtraWidget } from "./HomeExtraWidgets";
import { HomeFinanceOverview } from "./HomeFinanceOverview";
import { HomeOnboarding } from "./HomeOnboarding";
import { HomeProductUpdates } from "./HomeProductUpdates";
import { HomeShortcuts } from "./HomeShortcuts";
import { DEFAULT_HOME_WIDGETS, normalizeHomeWidgets, type HomeWidgetId } from "./homeWidgets";
import { HOME_ONBOARDING_HREF, resolveHomeTab } from "./homeTabs";
import { useHomeLayout, useSaveHomeLayout } from "./useHomeLayout";

/** Home: Dashboard · Onboarding · Recent updates (product releases). */
export default function DashboardPage() {
  const [params] = useSearchParams();
  const loc = useLocation();
  const tab = () => params.tab;
  const homeTab = () => resolveHomeTab(loc.pathname);
  const auth = useAuth();
  const setup = useSetupReadiness();
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

  const gettingStarted = () => resolveGettingStarted(setup.data);
  const showSetupNudge = () =>
    homeTab() === "dashboard" &&
    canManageWorkspaceSetup(auth.me) &&
    gettingStarted().visible;

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
    selected().filter((id) => id !== "finance" && id !== "day_jobs" && id !== "shortcuts");

  return (
    <DashboardLayout>
      <Show when={tab() === "intel"}>
        <Navigate href="/app/reports#reports-bi" />
      </Show>
      <Show when={tab() === "mypage"}>
        <Navigate href={HOME_ONBOARDING_HREF} />
      </Show>
      <Show when={tab() !== "intel" && tab() !== "mypage"}>
        <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold text-text-primary">{hello()}</h2>
            <p class="text-sm text-text-secondary">{company()}</p>
          </div>
          <Show when={homeTab() === "dashboard"}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-slate-50"
              onClick={openCustomize}
            >
              Customize
            </button>
          </Show>
        </div>

        <Show when={showSetupNudge()}>
          <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-sm">
            <p class="text-text-primary">
              Setup is {gettingStarted().percent}% complete
              <Show when={gettingStarted().next}>
                {" "}
                · Next: {gettingStarted().next!.label}
              </Show>
            </p>
            <A
              href={HOME_ONBOARDING_HREF}
              class="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Open onboarding
            </A>
          </div>
        </Show>

        <Show when={homeTab() === "dashboard"}>
          <div class="space-y-6">
            <Show when={selected().includes("finance")}>
              <HomeFinanceOverview hideIntro />
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
        </Show>

        <Show when={homeTab() === "onboarding"}>
          <HomeOnboarding />
        </Show>

        <Show when={homeTab() === "recent-updates"}>
          <HomeProductUpdates />
        </Show>

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
