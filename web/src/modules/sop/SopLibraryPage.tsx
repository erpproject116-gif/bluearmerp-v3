import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { useSopDashboard, useSopDocuments, useSopMutations } from "../../shared/useSop";

export default function SopLibraryPage() {
  const [page, setPage] = createSignal(1);
  const [status, setStatus] = createSignal("");
  const [title, setTitle] = createSignal("");
  const list = useSopDocuments(() => ({
    page: page(),
    pageSize: 25,
    status: status() || undefined,
  }));
  const mutations = useSopMutations();

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">SOP library</h1>
          <p class="text-sm text-text-secondary">Standard operating procedures for your workspace.</p>
        </div>
        <A href="/app/sop/dashboard" class="text-sm font-medium text-brand-600 hover:underline">
          SOP dashboard
        </A>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <select
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          value={status()}
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <input
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          placeholder="New SOP title"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!title().trim() || mutations.create.isPending}
          onClick={async () => {
            const t = title().trim();
            if (!t) return;
            await mutations.create.mutateAsync({ title: t, category: "general", body: "" });
            setTitle("");
          }}
        >
          Create
        </button>
      </div>

      <Show when={list.isError}>
        <p class="mb-3 text-sm text-red-600">{(list.error as Error)?.message}</p>
      </Show>

      <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-stroke text-left text-text-secondary">
              <th class="px-3 py-2 font-medium">Title</th>
              <th class="px-3 py-2 font-medium">Category</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium">Version</th>
              <th class="px-3 py-2 font-medium">Reviewed</th>
              <th class="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <For each={list.data?.rows ?? []}>
              {(row) => (
                <tr class="border-b border-stroke last:border-0">
                  <td class="px-3 py-2">
                    <A href={`/app/sop/documents/${row.id}`} class="font-medium text-brand-600 hover:underline">
                      {row.title}
                    </A>
                    <Show when={row.stale}>
                      <span class="ml-2 text-xs text-amber-700">Stale</span>
                    </Show>
                  </td>
                  <td class="px-3 py-2 capitalize">{row.category}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">v{row.version}</td>
                  <td class="px-3 py-2">{row.reviewed_at ?? "—"}</td>
                  <td class="px-3 py-2 text-right">
                    <Show when={row.status !== "published"}>
                      <button
                        type="button"
                        class="text-sm text-brand-600 hover:underline disabled:opacity-50"
                        disabled={mutations.publish.isPending}
                        onClick={() => void mutations.publish.mutateAsync(row.id)}
                      >
                        Publish
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!list.isFetching && (list.data?.rows.length ?? 0) === 0}>
          <p class="p-4 text-sm text-text-secondary">No SOP documents yet.</p>
        </Show>
      </div>
    </div>
  );
}
