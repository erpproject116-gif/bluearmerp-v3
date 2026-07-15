import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { apiFetch } from "./api";

/**
 * useDocumentDraft — autosaves in-progress form input and recovers it after a refresh,
 * crash, or accidental navigation.
 *
 * Guidance for callers:
 * - Only `enabled: () => ...` while the modal/page form is actually active (open + editable).
 *   Autosave pauses and the draft is left untouched once disabled.
 * - Call `clearOnSave()` right after a successful save so the recovered draft does not
 *   resurface the next time the form is opened.
 * - For create flows, only pass `autoApply: () => true` (or similar) if the form's own
 *   "reset on open" effect will not immediately clobber the just-applied draft. Guard with an
 *   init flag, or prefer showing the Restore banner over a risky silent overwrite.
 * - `entityType` / `draftKey` accept a plain string OR a `() => string` accessor. Pass an
 *   accessor whenever the value depends on props/signals that can change while the component
 *   stays mounted (e.g. `draftKey: () => (editing() ? \`edit-${editing()!.id}\` : "new")`) so the
 *   hook reloads the right draft when switching between "new" and "edit-<id>".
 * - `version` is an extra optional key (number/string) that forces a reload even when
 *   entityType/draftKey resolve to the same value.
 * - `localOnly: true` skips the server drafts API entirely (localStorage mirror only) — useful
 *   for UI-only state that has no server-side draft endpoint or that is best-effort only. It
 *   still flushes on visibility change / beforeunload.
 */

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

function localStorageKey(entityType: string, draftKey: string): string {
  return `bluearm:doc-draft:${entityType}:${draftKey}`;
}

type LocalMirror<T> = { saved_at: string; payload: T };

function readLocalMirror<T>(entityType: string, draftKey: string): LocalMirror<T> | null {
  try {
    const raw = localStorage.getItem(localStorageKey(entityType, draftKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalMirror<T>;
    if (parsed?.payload == null || !parsed.saved_at) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalMirror<T>(entityType: string, draftKey: string, payload: T): string {
  const saved_at = new Date().toISOString();
  try {
    localStorage.setItem(localStorageKey(entityType, draftKey), JSON.stringify({ saved_at, payload }));
  } catch {
    /* quota / private mode — server draft still primary */
  }
  return saved_at;
}

function clearLocalMirror(entityType: string, draftKey: string) {
  try {
    localStorage.removeItem(localStorageKey(entityType, draftKey));
  } catch {
    /* ignore */
  }
}

/** Returns false for null/undefined, empty objects, and empty/arrays-only trivial payloads. */
export function isMeaningfulDraftPayload(payload: unknown): boolean {
  if (payload == null) return false;
  if (Array.isArray(payload)) return payload.some((v) => isMeaningfulDraftPayload(v));
  if (typeof payload === "string") return payload.trim().length > 0;
  if (typeof payload === "number") return payload !== 0;
  if (typeof payload === "boolean") return payload === true;
  if (typeof payload === "object") {
    return Object.values(payload as Record<string, unknown>).some((v) => isMeaningfulDraftPayload(v));
  }
  return Boolean(payload);
}

export type UseDocumentDraftOptions<T> = {
  entityType: string | (() => string);
  draftKey: string | (() => string);
  getPayload: () => T;
  onApply: (payload: T) => void;
  debounceMs?: number;
  enabled?: () => boolean;
  /** When true, auto-apply recovered draft once after load (create forms with empty state). */
  autoApply?: () => boolean;
  /** Skip the server drafts API entirely; localStorage mirror only. Still flushes on visibility/unload. */
  localOnly?: boolean;
  /** Extra key; bump (or vary) to force a reload even when entityType/draftKey resolve unchanged. */
  version?: number | string;
};

export function useDocumentDraft<T>(options: UseDocumentDraftOptions<T>) {
  const debounceMs = () => options.debounceMs ?? 800;
  const [savedAt, setSavedAt] = createSignal<string | null>(null);
  const [pendingPayload, setPendingPayload] = createSignal<T | null>(null);
  const [showBanner, setShowBanner] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [autosavePaused, setAutosavePaused] = createSignal(true);
  const [dirty, setDirty] = createSignal(false);

  const resolveEntityType = () =>
    typeof options.entityType === "function" ? options.entityType() : options.entityType;
  const resolveDraftKey = () =>
    typeof options.draftKey === "function" ? options.draftKey() : options.draftKey;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSerialized = "";
  let autoApplied = false;
  let lastKeySignature: string | null = null;
  // Primed synchronously (before any effect runs) so flushNow()/save handlers always have a
  // valid target, even if something triggers a flush before the key-change effect's first pass.
  let currentEntityType = resolveEntityType();
  let currentDraftKey = resolveDraftKey();

  const draftPath = (entityType: string, draftKey: string) =>
    `/api/v1/drafts/${encodeURIComponent(entityType)}?draft_key=${encodeURIComponent(draftKey)}`;

  const isEnabled = () => (options.enabled ? options.enabled() : true);

  const deleteDraft = async () => {
    const entityType = currentEntityType;
    const draftKey = currentDraftKey;
    if (!options.localOnly) {
      await apiFetch(draftPath(entityType, draftKey), { method: "DELETE" }, { silent: true });
    }
    clearLocalMirror(entityType, draftKey);
    setSavedAt(null);
    setPendingPayload(null);
    setShowBanner(false);
    setDirty(false);
    lastSerialized = JSON.stringify(options.getPayload());
  };

  const saveDraft = async (payload: T) => {
    if (!isEnabled()) return;
    const entityType = currentEntityType;
    const draftKey = currentDraftKey;
    const localAt = writeLocalMirror(entityType, draftKey, payload);
    setSavedAt(localAt);
    if (options.localOnly) {
      setDirty(false);
      return;
    }
    const res = await apiFetch<{ saved_at: string }>(
      `/api/v1/drafts/${encodeURIComponent(entityType)}`,
      {
        method: "PUT",
        body: JSON.stringify({ draft_key: draftKey, payload }),
      },
      { silent: true },
    );
    if (res.success && res.data?.saved_at) {
      setSavedAt(res.data.saved_at);
    }
    setDirty(false);
  };

  const flushNow = () => {
    if (!isEnabled() || autosavePaused() || loading()) return;
    const payload = options.getPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerialized) return;
    clearTimeout(debounceTimer);
    lastSerialized = serialized;
    void saveDraft(payload);
  };

  const loadForKey = async (entityType: string, draftKey: string) => {
    let recovered: { payload: T; saved_at: string } | null = null;
    if (!options.localOnly) {
      const res = await apiFetch<DraftEnvelope<T>>(draftPath(entityType, draftKey), undefined, { silent: true });
      if (res.data?.draft?.payload != null) {
        recovered = { payload: res.data.draft.payload, saved_at: res.data.draft.saved_at };
      }
    }
    if (!recovered) {
      const local = readLocalMirror<T>(entityType, draftKey);
      if (local) recovered = local;
    }

    setLoading(false);
    if (recovered) {
      setPendingPayload(() => recovered!.payload);
      setSavedAt(recovered.saved_at);
      const shouldAuto = options.autoApply?.() ?? false;
      if (shouldAuto && !autoApplied) {
        autoApplied = true;
        setAutosavePaused(true);
        options.onApply(recovered.payload);
        setShowBanner(false);
        setPendingPayload(null);
        lastSerialized = JSON.stringify(recovered.payload);
        setAutosavePaused(false);
      } else {
        setShowBanner(true);
      }
    } else {
      setShowBanner(false);
      setPendingPayload(null);
      setSavedAt(null);
    }
    lastSerialized = JSON.stringify(options.getPayload());
    setAutosavePaused(false);
  };

  createEffect(() => {
    const entityType = resolveEntityType();
    const draftKey = resolveDraftKey();
    const signature = `${entityType}::${draftKey}::${options.version ?? ""}`;
    if (signature === lastKeySignature) return;
    const isFirstLoad = lastKeySignature === null;
    lastKeySignature = signature;

    if (!isFirstLoad) {
      // Best-effort flush of the outgoing key's pending changes before switching context
      // (e.g. edit-5 -> edit-7). getPayload() still reflects the outgoing record here because
      // any "reset form on key change" effect in the caller has not run yet this flush.
      if (currentEntityType && currentDraftKey && !autosavePaused() && !loading()) {
        clearTimeout(debounceTimer);
        const payload = options.getPayload();
        const serialized = JSON.stringify(payload);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          void saveDraft(payload);
        }
      }
      autoApplied = false;
      setShowBanner(false);
      setPendingPayload(null);
      setDirty(false);
    }

    currentEntityType = entityType;
    currentDraftKey = draftKey;
    setLoading(true);
    setAutosavePaused(true);
    void loadForKey(entityType, draftKey);
  });

  createEffect(() => {
    if (autosavePaused() || loading()) return;
    if (!isEnabled()) return;

    const payload = options.getPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerialized) return;

    setDirty(true);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastSerialized = serialized;
      void saveDraft(payload);
    }, debounceMs());
  });

  createEffect(() => {
    if (!isEnabled()) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty() && !savedAt()) return;
      flushNow();
      e.preventDefault();
      e.returnValue = "";
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    onCleanup(() => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    });
  });

  onCleanup(() => {
    clearTimeout(debounceTimer);
    flushNow();
  });

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
        <span>Recovered unsaved work from {formatSavedTime(savedAt()!)}.</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            onClick={applyDraft}
          >
            Restore
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            onClick={() => void deleteDraft()}
          >
            Discard
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
    flushNow,
    loading,
    savedAt,
    dirty,
    hasDraft: () => showBanner(),
  };
}
