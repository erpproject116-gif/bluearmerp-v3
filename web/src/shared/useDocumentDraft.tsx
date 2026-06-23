import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { apiFetch } from "./api";

type DraftEnvelope<T> = {
  draft: {
    draft_key: string;
    payload: T;
    saved_at: string;
  } | null;
};

function formatSavedTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export type UseDocumentDraftOptions<T> = {
  entityType: string;
  draftKey: string;
  getPayload: () => T;
  onApply: (payload: T) => void;
  debounceMs?: number;
  enabled?: () => boolean;
};

export function useDocumentDraft<T>(options: UseDocumentDraftOptions<T>) {
  const debounceMs = () => options.debounceMs ?? 1500;
  const [savedAt, setSavedAt] = createSignal<string | null>(null);
  const [pendingPayload, setPendingPayload] = createSignal<T | null>(null);
  const [showBanner, setShowBanner] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [autosavePaused, setAutosavePaused] = createSignal(true);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSerialized = "";

  const draftPath = () =>
    `/api/v1/drafts/${encodeURIComponent(options.entityType)}?draft_key=${encodeURIComponent(options.draftKey)}`;

  const deleteDraft = async () => {
    await apiFetch(draftPath(), { method: "DELETE" }, { silent: true });
    setSavedAt(null);
    setPendingPayload(null);
    setShowBanner(false);
    lastSerialized = JSON.stringify(options.getPayload());
  };

  const saveDraft = async (payload: T) => {
    if (options.enabled && !options.enabled()) return;
    const res = await apiFetch<{ saved_at: string }>(`/api/v1/drafts/${encodeURIComponent(options.entityType)}`, {
      method: "PUT",
      body: JSON.stringify({ draft_key: options.draftKey, payload }),
    }, { silent: true });
    if (res.success && res.data?.saved_at) {
      setSavedAt(res.data.saved_at);
    }
  };

  onMount(async () => {
    const res = await apiFetch<DraftEnvelope<T>>(draftPath());
    setLoading(false);
    const draft = res.data?.draft;
    if (draft?.payload != null) {
      setPendingPayload(() => draft.payload);
      setSavedAt(draft.saved_at);
      setShowBanner(true);
    }
    lastSerialized = JSON.stringify(options.getPayload());
    setAutosavePaused(false);
  });

  createEffect(() => {
    if (autosavePaused() || loading()) return;
    if (options.enabled && !options.enabled()) return;

    const payload = options.getPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerialized) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastSerialized = serialized;
      void saveDraft(payload);
    }, debounceMs());
  });

  onCleanup(() => clearTimeout(debounceTimer));

  const applyDraft = () => {
    const payload = pendingPayload();
    if (payload == null) return;
    setAutosavePaused(true);
    options.onApply(payload);
    setShowBanner(false);
    setPendingPayload(null);
    lastSerialized = JSON.stringify(payload);
    setAutosavePaused(false);
  };

  const clearOnSave = async () => {
    setAutosavePaused(true);
    await deleteDraft();
    setAutosavePaused(false);
  };

  const DraftBanner = (): JSX.Element => (
    <Show when={showBanner() && savedAt()}>
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span>Temporarily saved at {formatSavedTime(savedAt()!)}.</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            onClick={applyDraft}
          >
            Apply
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            onClick={() => void deleteDraft()}
          >
            Delete
          </button>
        </div>
      </div>
    </Show>
  );

  return {
    DraftBanner,
    clearOnSave,
    deleteDraft,
    applyDraft,
    loading,
    savedAt,
    hasDraft: () => showBanner(),
  };
}
