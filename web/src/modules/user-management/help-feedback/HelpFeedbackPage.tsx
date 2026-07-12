import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { useAuth, hasPermission } from "../../../shared/auth-context";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import {
  listHelpFeedbackAdmin,
  summarizeHelpFeedback,
  type HelpFeedbackAdminRow,
  type HelpFeedbackSummaryRow,
} from "../../help-assistant/helpApi";

type Tab = "summary" | "recent";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function HelpFeedbackPage() {
  const auth = useAuth();
  const toast = useToast();
  const canRead = () => hasPermission(auth.me, "user_management.users", "read");

  const [tab, setTab] = createSignal<Tab>("summary");
  const [loading, setLoading] = createSignal(true);
  const [summary, setSummary] = createSignal<HelpFeedbackSummaryRow[]>([]);
  const [recent, setRecent] = createSignal<HelpFeedbackAdminRow[]>([]);
  const [days, setDays] = createSignal(30);

  const load = async () => {
    if (!canRead()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [sumRes, listRes] = await Promise.all([
      summarizeHelpFeedback({ days: days() }),
      listHelpFeedbackAdmin({ vote: "down", limit: 50 }),
    ]);
    setLoading(false);

    if (sumRes.success && sumRes.data) {
      setSummary(sumRes.data);
    } else {
      toast.error(sumRes.message ?? "Could not load feedback summary.");
      setSummary([]);
    }

    if (listRes.success && listRes.data) {
      setRecent(listRes.data);
    } else {
      toast.error(listRes.message ?? "Could not load recent feedback.");
      setRecent([]);
    }
  };

  createEffect(() => {
    void auth.me;
    void days();
    void load();
  });

  return (
    <div class="max-w-5xl space-y-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Help feedback</h1>
        <p class="mt-1 text-sm text-slate-600">
          Review thumbs-down Help Assistant votes to find weak articles and queries that need better coverage.
        </p>
      </div>

      <Show
        when={canRead()}
        fallback={
          <p class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You need <code class="text-xs">user_management.users</code> read access to view help feedback.
          </p>
        }
      >
        <div class="flex flex-wrap items-center gap-3">
          <nav class="flex gap-2">
            <button
              type="button"
              class={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab() === "summary"
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => setTab("summary")}
            >
              Summary
            </button>
            <button
              type="button"
              class={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab() === "recent"
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => setTab("recent")}
            >
              Recent votes
            </button>
          </nav>

          <Show when={tab() === "summary"}>
            <label class="flex items-center gap-2 text-sm text-slate-700">
              Last
              <select
                class="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                value={String(days())}
                onChange={(e) => setDays(Number(e.currentTarget.value) || 30)}
              >
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
          </Show>

          <button
            type="button"
            class="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            disabled={loading()}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        <Show when={loading()} fallback={null}>
          <p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>
        </Show>

        <Show when={!loading() && tab() === "summary"}>
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th class="px-3 py-2 font-medium">Query</th>
                  <th class="px-3 py-2 font-medium">Article</th>
                  <th class="px-3 py-2 font-medium text-right">Down</th>
                  <th class="px-3 py-2 font-medium text-right">Up</th>
                  <th class="px-3 py-2 font-medium">Last</th>
                  <th class="px-3 py-2 font-medium">Sample path</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={summary().length > 0}
                  fallback={
                    <tr>
                      <td class="px-3 py-4 text-slate-500" colspan={6}>
                        No down-voted query/article pairs in this window.
                      </td>
                    </tr>
                  }
                >
                  <For each={summary()}>
                    {(row) => (
                      <tr class="border-t border-slate-100">
                        <td class="px-3 py-2 text-slate-900">{row.query || "—"}</td>
                        <td class="px-3 py-2">
                          <Show
                            when={row.article_id}
                            fallback={<span class="text-slate-400">—</span>}
                          >
                            <A
                              href={`/app/documentation/kb/${row.article_id}`}
                              class="font-medium text-brand-600 hover:underline"
                            >
                              {row.article_id}
                            </A>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-right font-semibold text-red-700">{row.down_votes}</td>
                        <td class="px-3 py-2 text-right text-slate-600">{row.up_votes}</td>
                        <td class="px-3 py-2 text-slate-600 whitespace-nowrap">{formatWhen(row.last_at)}</td>
                        <td class="px-3 py-2 font-mono text-xs text-slate-500">
                          {row.sample_pathname || "—"}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </Show>

        <Show when={!loading() && tab() === "recent"}>
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th class="px-3 py-2 font-medium">When</th>
                  <th class="px-3 py-2 font-medium">Vote</th>
                  <th class="px-3 py-2 font-medium">Query</th>
                  <th class="px-3 py-2 font-medium">Article</th>
                  <th class="px-3 py-2 font-medium">User</th>
                  <th class="px-3 py-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={recent().length > 0}
                  fallback={
                    <tr>
                      <td class="px-3 py-4 text-slate-500" colspan={6}>
                        No recent down votes.
                      </td>
                    </tr>
                  }
                >
                  <For each={recent()}>
                    {(row) => (
                      <tr class="border-t border-slate-100">
                        <td class="px-3 py-2 whitespace-nowrap text-slate-600">
                          {formatWhen(row.created_at)}
                        </td>
                        <td class="px-3 py-2">
                          <span
                            class={
                              row.vote === "down"
                                ? "font-medium text-red-700"
                                : "font-medium text-emerald-700"
                            }
                          >
                            {row.vote}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-slate-900">{row.query || "—"}</td>
                        <td class="px-3 py-2">
                          <Show
                            when={row.article_id}
                            fallback={<span class="text-slate-400">—</span>}
                          >
                            <A
                              href={`/app/documentation/kb/${row.article_id}`}
                              class="font-medium text-brand-600 hover:underline"
                            >
                              {row.article_id}
                            </A>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-slate-600">{row.user_name || "—"}</td>
                        <td class="px-3 py-2 font-mono text-xs text-slate-500">{row.pathname || "—"}</td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}
