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

type Props = {
  scope: AttachmentScope;
  /** The document id. When absent, the document is not saved yet. */
  docId?: number;
  label?: string;
  /** Hint shown when the document is not yet saved. */
  emptyUnsavedHint?: string;
  /** When true, shows required styling and messaging. */
  required?: boolean;
  /** Called whenever the attachment list is loaded or changes. */
  onCountChange?: (count: number) => void;
};

/**
 * Reusable attachments panel: lists files, allows upload once the document is
 * saved, and downloads files with auth. Used across the selling/buying flows so
 * attachments can travel with a document to its downstream documents.
 */
export function AttachmentsField(props: Props) {
  const toast = useToast();
  const [items, setItems] = createSignal<Attachment[]>([]);
  const [uploading, setUploading] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const notifyCount = (count: number) => {
    props.onCountChange?.(count);
  };

  const load = async () => {
    const id = props.docId;
    if (!id) {
      setItems([]);
      notifyCount(0);
      return;
    }
    const res = await listAttachments(props.scope, id);
    const list = res.success && res.data ? res.data : [];
    setItems(list);
    notifyCount(list.length);
  };

  // Reload whenever the target document id changes (modal reused across records).
  createEffect(() => {
    void props.docId;
    void load();
  });

  const onPick = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    const id = props.docId;
    if (!file || !id) return;
    setUploading(true);
    void uploadAttachment(props.scope, id, file).then((res) => {
      setUploading(false);
      if (!res.success) {
        toast.warning(res.message ?? "Upload failed.");
        return;
      }
      toast.success("File uploaded.");
      void load();
    });
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

  const showRequiredWarning = () =>
    Boolean(props.required && props.docId && items().length === 0);

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
        <Show when={props.docId}>
          <label class="cursor-pointer rounded border border-stroke bg-white px-3 py-1 text-sm hover:bg-slate-50">
            {uploading() ? "Uploading…" : "Upload file"}
            <input type="file" class="hidden" disabled={uploading()} onChange={onPick} />
          </label>
        </Show>
      </div>
      <Show
        when={props.docId}
        fallback={
          <p class="text-sm text-text-secondary">
            {props.emptyUnsavedHint ??
              (props.required
                ? "Save as Unconfirmed first, then upload at least one file before confirming."
                : "Save first to attach files (max 25 MB each).")}
          </p>
        }
      >
        <Show when={items().length > 0} fallback={<p class="text-sm text-text-secondary">No attachments yet.</p>}>
          <ul class="space-y-1 text-sm">
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
        <Show when={showRequiredWarning()}>
          <p class="mt-2 text-sm text-amber-800">Upload at least one file before confirming this document.</p>
        </Show>
      </Show>
    </div>
  );
}
