import { For, Show, createEffect, createSignal } from "solid-js";
import { useToast } from "./toast";
import {
  type Attachment,
  type AttachmentScope,
  downloadAttachment,
  formatFileSize,
  listAttachments,
  uploadAttachment,
} from "./attachments";

type PendingFile = {
  key: string;
  file: File;
};

type Props = {
  scope: AttachmentScope;
  /** The document id. When absent, picked files are held until save. */
  docId?: number;
  /** When false, staged files are cleared (pass the parent modal open flag). */
  formOpen?: boolean;
  label?: string;
  /** Hint shown when there are no files yet on an unsaved document. */
  emptyUnsavedHint?: string;
  /** When true, shows required styling and messaging. */
  required?: boolean;
  /** Called whenever uploaded or pending attachment count changes. */
  onCountChange?: (count: number) => void;
};

/**
 * Reusable attachments panel: lists files, allows upload before or after save,
 * and downloads files with auth. Files picked on a new document upload when the
 * record is saved and receives an id.
 */
export function AttachmentsField(props: Props) {
  const toast = useToast();
  const [items, setItems] = createSignal<Attachment[]>([]);
  const [pending, setPending] = createSignal<PendingFile[]>([]);
  const [uploading, setUploading] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [loadError, setLoadError] = createSignal<string | null>(null);

  const totalCount = () => items().length + pending().length;

  const notifyCount = () => {
    props.onCountChange?.(totalCount());
  };

  const load = async () => {
    const id = props.docId;
    if (!id) {
      setItems([]);
      setLoadError(null);
      notifyCount();
      return;
    }
    const res = await listAttachments(props.scope, id);
    if (!res.success) {
      setItems([]);
      setLoadError(res.message ?? "Could not load attachments.");
      notifyCount();
      return;
    }
    setLoadError(null);
    const list = res.data ?? [];
    setItems(list);
    notifyCount();
  };

  const flushPendingUploads = async (docId: number): Promise<boolean> => {
    const queue = pending();
    if (!queue.length) return true;
    if (uploading()) return false;
    setUploading(true);
    let allOk = true;
    const remaining: PendingFile[] = [];
    for (const entry of queue) {
      const res = await uploadAttachment(props.scope, docId, entry.file);
      if (res.success) continue;
      allOk = false;
      remaining.push(entry);
      toast.warning(res.message ?? `Failed to upload ${entry.file.name}.`);
    }
    setPending(remaining);
    setUploading(false);
    await load();
    if (allOk && queue.length > 0) {
      toast.success(queue.length === 1 ? "File uploaded." : `${queue.length} files uploaded.`);
    }
    return allOk;
  };

  createEffect(() => {
    if (props.formOpen === false) {
      setPending([]);
      setItems([]);
      notifyCount();
    }
  });

  createEffect(() => {
    const id = props.docId;
    if (!id) {
      setItems([]);
      notifyCount();
      return;
    }
    void (async () => {
      await flushPendingUploads(id);
      await load();
    })();
  });

  const onPick = (e: Event & { currentTarget: HTMLInputElement }) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;

    const id = props.docId;
    if (!id) {
      const stamp = Date.now();
      setPending((prev) => [
        ...prev,
        ...files.map((file, i) => ({ key: `${file.name}-${file.size}-${stamp}-${i}`, file })),
      ]);
      notifyCount();
      return;
    }

    setUploading(true);
    void (async () => {
      let okCount = 0;
      for (const file of files) {
        const res = await uploadAttachment(props.scope, id, file);
        if (!res.success) {
          toast.warning(res.message ?? `Failed to upload ${file.name}.`);
          continue;
        }
        okCount += 1;
      }
      setUploading(false);
      if (okCount > 0) {
        toast.success(okCount === 1 ? "File uploaded." : `${okCount} files uploaded.`);
        void load();
      }
    })();
  };

  const removePending = (key: string) => {
    setPending((prev) => prev.filter((p) => p.key !== key));
    notifyCount();
  };

  const onDownload = (a: Attachment) => {
    const id = props.docId;
    if (!id) return;
    setBusyId(a.id);
    void downloadAttachment(props.scope, id, a).then((ok) => {
      setBusyId(null);
      if (!ok) toast.warning("Download failed.");
    });
  };

  const showRequiredWarning = () => Boolean(props.required && totalCount() === 0);

  const hasAnyFiles = () => totalCount() > 0;

  return (
    <div
      class={`rounded-lg border px-4 py-3 ${
        showRequiredWarning() ? "border-amber-400 bg-amber-50" : "border-stroke bg-slate-50"
      }`}
    >
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium text-text-primary">
          {props.label ?? "Attachments"}
          <Show when={props.required}>
            <span class="text-red-600"> *</span>
          </Show>
        </span>
        <label class="cursor-pointer rounded border border-stroke bg-white px-3 py-1 text-sm hover:bg-slate-50">
          {uploading() ? "Uploading…" : "Upload files"}
          <input type="file" multiple class="hidden" disabled={uploading()} onChange={onPick} />
        </label>
      </div>
      <Show
        when={hasAnyFiles()}
        fallback={
          <p class="text-sm text-text-secondary">
            {props.emptyUnsavedHint ??
              (props.required
                ? "Add at least one file (max 25 MB each). Files upload when you save the document."
                : "No attachments yet (max 25 MB each). Files upload when you save a new document.")}
          </p>
        }
      >
        <ul class="space-y-1 text-sm">
          <For each={pending()}>
            {(p) => (
              <li class="flex items-center justify-between gap-2">
                <span class="truncate text-text-primary" title={p.file.name}>
                  {p.file.name}
                  <span class="ml-1 text-text-secondary">(uploads on save)</span>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                  <span class="text-text-secondary">{formatFileSize(p.file.size)}</span>
                  <button
                    type="button"
                    class="text-text-secondary hover:text-red-600"
                    disabled={uploading()}
                    onClick={() => removePending(p.key)}
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </li>
            )}
          </For>
          <For each={items()}>
            {(a) => (
              <li class="flex items-center justify-between gap-2">
                <button
                  type="button"
                  class="truncate text-left text-primary hover:underline disabled:opacity-60"
                  disabled={busyId() === a.id}
                  onClick={() => onDownload(a)}
                  title={a.file_name}
                >
                  {busyId() === a.id ? "Downloading…" : a.file_name}
                </button>
                <span class="shrink-0 text-text-secondary">{formatFileSize(a.size_bytes)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={loadError()}>
        <p class="mt-2 text-sm text-amber-800">{loadError()}</p>
      </Show>
      <Show when={showRequiredWarning()}>
        <p class="mt-2 text-sm text-amber-800">Add at least one file before confirming this document.</p>
      </Show>
    </div>
  );
}
