import { For, Show, createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { handleSaveResult } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { RichTextEditor } from "./RichTextEditor";

const MAX_ATTACH_BYTES = 25 * 1024 * 1024;

export type SendEmailModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  sendUrl: string;
  defaultTo?: string;
  defaultCc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** Document PDF is always attached server-side; this is only for extra files. */
  onSent?: () => void;
};

type PendingFile = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  data_base64: string;
};

type EmailSignature = {
  signature_html?: string;
  include_by_default?: boolean;
};

function splitAddrs(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function isEmptyHtml(html: string): boolean {
  const text = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text.length === 0;
}

export function SendEmailModal(props: SendEmailModalProps) {
  const toast = useToast();
  const [toAddrs, setToAddrs] = createSignal("");
  const [ccAddrs, setCcAddrs] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [bodyHtml, setBodyHtml] = createSignal("");
  const [includeSig, setIncludeSig] = createSignal(true);
  const [files, setFiles] = createSignal<PendingFile[]>([]);
  const [saving, setSaving] = createSignal(false);
  let fileInput!: HTMLInputElement;

  const [sig] = createResource(
    () => props.open,
    async (open) => {
      if (!open) return null;
      const res = await apiFetch<EmailSignature>("/api/v1/comms/email-signature", {}, { silent: true });
      if (!res.success) return { signature_html: "", include_by_default: true };
      return res.data ?? { signature_html: "", include_by_default: true };
    },
  );

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setToAddrs(props.defaultTo ?? "");
        setCcAddrs(props.defaultCc ?? "");
        setSubject(props.defaultSubject ?? "");
        const def = props.defaultBody?.trim() ?? "";
        setBodyHtml(def ? (def.includes("<") ? def : `<p>${def.replace(/\n/g, "<br>")}</p>`) : "");
        setFiles([]);
      },
    ),
  );

  createEffect(() => {
    if (!props.open) return;
    const s = sig();
    if (!s) return;
    setIncludeSig(s.include_by_default !== false);
  });

  const attachTotal = () => files().reduce((sum, f) => sum + f.size, 0);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files()];
    let total = attachTotal();
    for (const file of Array.from(list)) {
      if (total + file.size > MAX_ATTACH_BYTES) {
        toast.warning(`Attachments cannot exceed ${formatBytes(MAX_ATTACH_BYTES)} combined (document PDF counts on the server).`);
        break;
      }
      try {
        const data_base64 = await readFileAsBase64(file);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size,
          data_base64,
        });
        total += file.size;
      } catch {
        toast.warning(`Could not read ${file.name}.`);
      }
    }
    setFiles(next);
    if (fileInput) fileInput.value = "";
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const send = async () => {
    const to = splitAddrs(toAddrs());
    if (to.length === 0) {
      toast.warning("At least one recipient email is required.");
      return;
    }
    const html = bodyHtml().trim();
    setSaving(true);
    const res = await apiFetch<unknown>(
      props.sendUrl,
      {
        method: "POST",
        body: JSON.stringify({
          to_addrs: to,
          cc_addrs: splitAddrs(ccAddrs()),
          subject: subject().trim(),
          body_html: isEmptyHtml(html) ? "" : html,
          body_text: "",
          include_signature: includeSig(),
          attachments: files().map((f) => ({
            filename: f.filename,
            content_type: f.content_type,
            data_base64: f.data_base64,
          })),
        }),
      },
      { silent: true },
    );
    setSaving(false);
    if (!handleSaveResult(res, toast, "Email sent.")) return;
    props.onSent?.();
    props.onClose();
  };

  return (
    <EntityModal
      open={props.open}
      title={props.title ?? "Send by email"}
      onClose={props.onClose}
      onSave={() => void send()}
      saving={saving()}
      singleColumn
      stacked
      saveLabel="Send"
    >
      <Field label="To *" span="full">
        <input
          class={inputClass}
          value={toAddrs()}
          placeholder="email@example.com, other@example.com"
          onInput={(e) => setToAddrs(e.currentTarget.value)}
        />
      </Field>
      <Field label="Cc" span="full">
        <input
          class={inputClass}
          value={ccAddrs()}
          placeholder="Optional"
          onInput={(e) => setCcAddrs(e.currentTarget.value)}
        />
      </Field>
      <Field label="Subject" span="full">
        <input
          class={inputClass}
          value={subject()}
          placeholder="Leave blank to use template"
          onInput={(e) => setSubject(e.currentTarget.value)}
        />
      </Field>
      <div class="col-span-full space-y-1">
        <span class="mb-1 block text-sm font-medium" style={{ color: "var(--color-label, var(--color-text-primary))" }}>
          Message
        </span>
        <RichTextEditor
          value={bodyHtml()}
          onChange={setBodyHtml}
          placeholder="Write your message… (leave blank to use template)"
          minHeightClass="min-h-[160px]"
        />
      </div>

      <div class="col-span-full space-y-2">
        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            class="rounded border-stroke"
            checked={includeSig()}
            onChange={(e) => setIncludeSig(e.currentTarget.checked)}
          />
          Include my email signature
          <Show when={sig()?.signature_html}>
            <a href="/app/comms/settings" class="text-brand-600 hover:underline">
              Edit signature
            </a>
          </Show>
          <Show when={!sig()?.signature_html}>
            <a href="/app/comms/settings" class="text-brand-600 hover:underline">
              Add signature
            </a>
          </Show>
        </label>

        <div class="rounded-lg border border-dashed border-stroke bg-slate-50/80 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-text-primary">Attachments</p>
              <p class="text-xs text-text-secondary">
                Document PDF is attached automatically. Extra files: {formatBytes(attachTotal())} / {formatBytes(MAX_ATTACH_BYTES)}
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
              onClick={() => fileInput?.click()}
            >
              Attach files
            </button>
            <input
              ref={fileInput}
              type="file"
              class="hidden"
              multiple
              onChange={(e) => void addFiles(e.currentTarget.files)}
            />
          </div>
          <Show when={files().length > 0}>
            <ul class="mt-2 space-y-1">
              <For each={files()}>
                {(f) => (
                  <li class="flex items-center justify-between gap-2 rounded border border-stroke bg-white px-2 py-1.5 text-sm">
                    <span class="truncate">
                      {f.filename}{" "}
                      <span class="text-text-secondary">({formatBytes(f.size)})</span>
                    </span>
                    <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeFile(f.id)}>
                      Remove
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </EntityModal>
  );
}
