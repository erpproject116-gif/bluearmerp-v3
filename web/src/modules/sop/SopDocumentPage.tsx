import { A, useParams } from "@solidjs/router";
import { Show, createSignal, createEffect } from "solid-js";
import { useSopDocument, useSopMutations } from "../../shared/useSop";

export default function SopDocumentPage() {
  const params = useParams();
  const id = () => {
    const n = Number(params.id);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const doc = useSopDocument(id);
  const mutations = useSopMutations();
  const [body, setBody] = createSignal("");
  const [title, setTitle] = createSignal("");

  createEffect(() => {
    const d = doc.data;
    if (d) {
      setBody(d.body ?? "");
      setTitle(d.title);
    }
  });

  return (
    <div>
      <A href="/app/sop" class="text-sm text-brand-600 hover:underline">← Library</A>
      <Show when={doc.isError}>
        <p class="mt-3 text-sm text-red-600">{(doc.error as Error)?.message}</p>
      </Show>
      <Show when={doc.data}>
        {(d) => (
          <div class="mt-3 space-y-3">
            <input
              class="w-full rounded-lg border border-stroke px-3 py-2 text-lg font-semibold"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            <p class="text-sm text-text-secondary">
              Status: {d().status} · v{d().version}
              {d().stale ? " · Stale review" : ""}
            </p>
            <textarea
              class="min-h-[240px] w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={body()}
              onInput={(e) => setBody(e.currentTarget.value)}
            />
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm"
                disabled={mutations.patch.isPending}
                onClick={() =>
                  void mutations.patch.mutateAsync({
                    id: d().id,
                    body: { title: title(), body: body() },
                  })
                }
              >
                Save
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
                disabled={mutations.publish.isPending}
                onClick={() => void mutations.publish.mutateAsync(d().id)}
              >
                Publish
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
