import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import {
  addTicketComment,
  patchTicket,
  useInvalidateSupportTickets,
  useSupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "../../shared/useSupportTickets";
import {
  canPreviewSupportTicketAttachment,
  downloadSupportTicketAttachment,
  formatTicketFileSize,
  getSupportTicketAttachmentObjectUrl,
  listSupportTicketAttachments,
  previewSupportTicketAttachment,
  uploadSupportTicketAttachment,
  type SupportTicketAttachment,
} from "../../shared/supportTicketAttachments";
import { useToast } from "../../shared/toast";
import { canManageAllSupportTickets, useAuth } from "../../shared/auth-context";
import { SupportLayout } from "./SupportLayout";
import { fetchRepairOrders, fetchSupportUsers, fetchWarrantyAssets } from "./supportLookups";
import { LoadingText } from "../../shared/LoadingText";
import { RichTextEditor, type PasteImageResult } from "../comms/RichTextEditor";

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function isEmptyHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  const text = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text.length === 0;
}

function looksLikeHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

/** Drop ephemeral blob/data URLs; keep data-ticket-attachment-id for reload. */
function persistableCommentHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const wrap = doc.getElementById("root");
  if (!wrap) return html;
  wrap.querySelectorAll("img[data-ticket-attachment-id]").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      img.setAttribute("src", "");
    }
  });
  return wrap.innerHTML;
}

function screenshotFileName(file: File): string {
  const mime = file.type || "image/png";
  const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
  if (file.name && file.name !== "image.png" && file.name !== "image.jpg") return file.name;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `screenshot-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

function TicketCommentHtml(props: { ticketId: number; html: string }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const objectUrls: string[] = [];

  const revokeAll = () => {
    for (const u of objectUrls) URL.revokeObjectURL(u);
    objectUrls.length = 0;
  };

  createEffect(() => {
    const el = root();
    const html = props.html;
    const ticketId = props.ticketId;
    if (!el) return;
    revokeAll();
    el.innerHTML = html;
    const imgs = [...el.querySelectorAll<HTMLImageElement>("img[data-ticket-attachment-id]")];
    void Promise.all(
      imgs.map(async (img) => {
        const aid = Number(img.getAttribute("data-ticket-attachment-id"));
        if (!aid) return;
        const url = await getSupportTicketAttachmentObjectUrl(ticketId, {
          id: aid,
          mime_type: "image/*",
        });
        if (!url) return;
        objectUrls.push(url);
        img.src = url;
      }),
    );
  });

  onCleanup(revokeAll);

  return <div ref={setRoot} class="ticket-comment-body mt-1 text-sm text-text-primary" />;
}

export default function TicketDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateSupportTickets();
  const ticketId = () => Number(params.id) || null;
  const ticket = useSupportTicket(ticketId);

  const [comment, setComment] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [pastingImage, setPastingImage] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [editSubject, setEditSubject] = createSignal("");
  const [editDescription, setEditDescription] = createSignal("");
  const [warrantyLabel, setWarrantyLabel] = createSignal("");
  const [assigneeLabel, setAssigneeLabel] = createSignal("");
  const [repairOrderLabel, setRepairOrderLabel] = createSignal("");
  const [attachments, setAttachments] = createSignal<SupportTicketAttachment[]>([]);
  const [uploading, setUploading] = createSignal(false);

  const canManage = () => canManageAllSupportTickets(auth.me);
  const canInteract = () => {
    const me = auth.me;
    const t = ticket.data;
    if (!me || !t) return false;
    if (canManage()) return true;
    return t.created_by_user_id != null && t.created_by_user_id === me.user.id;
  };
  const canEditDetails = () => canInteract();

  const attachmentBytesUsed = () => attachments().reduce((sum, a) => sum + (a.size_bytes || 0), 0);

  const loadAttachments = async (id: number) => {
    const res = await listSupportTicketAttachments(id);
    if (res.success && res.data) setAttachments(res.data);
  };

  createEffect(() => {
    const id = ticketId();
    if (id) void loadAttachments(id);
  });

  const startEdit = () => {
    const t = ticket.data;
    if (!t) return;
    setEditSubject(t.subject);
    setEditDescription(t.description ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    const id = ticketId();
    if (!id) return;
    const subject = editSubject().trim();
    if (!subject) {
      toast.warning("Subject is required.");
      return;
    }
    setSaving(true);
    const res = await patchTicket(id, {
      subject,
      description: editDescription().trim() || null,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Update failed.");
      return;
    }
    setEditing(false);
    await invalidate(res.data);
    toast.success("Ticket details saved.");
  };

  const updateField = async (patch: Parameters<typeof patchTicket>[1]) => {
    const id = ticketId();
    if (!id) return;
    setSaving(true);
    const res = await patchTicket(id, patch);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Update failed.");
      return;
    }
    await invalidate(res.data);
  };

  const postComment = async () => {
    const id = ticketId();
    const html = comment();
    if (!id || isEmptyHtml(html)) return;
    setSaving(true);
    const res = await addTicketComment(id, persistableCommentHtml(html.trim()));
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add comment.");
      return;
    }
    setComment("");
    await invalidate(res.data);
  };

  const handlePasteImage = async (file: File): Promise<PasteImageResult | null> => {
    const id = ticketId();
    if (!id) return null;
    const remaining = MAX_ATTACHMENT_BYTES - attachmentBytesUsed();
    if (file.size > remaining) {
      toast.warning(
        remaining <= 0
          ? "Ticket already has 25 MB of attachments."
          : `Screenshot is too large. ${formatTicketFileSize(remaining)} remaining under the 25 MB limit.`,
      );
      return null;
    }
    const named =
      file.name && file.name !== "image.png" && file.name !== "image.jpg"
        ? file
        : new File([file], screenshotFileName(file), { type: file.type || "image/png" });
    setPastingImage(true);
    const res = await uploadSupportTicketAttachment(id, named);
    setPastingImage(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not attach screenshot.");
      return null;
    }
    await loadAttachments(id);
    const src = URL.createObjectURL(file);
    return {
      src,
      alt: res.data.file_name,
      attrs: { "data-ticket-attachment-id": String(res.data.id) },
    };
  };

  return (
    <SupportLayout>
      <div class="mb-4">
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => navigate("/app/support/tickets")}>
          ← Back to tickets
        </button>
      </div>

      <Show when={ticket.isFetching && !ticket.data} fallback={null}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>

      <Show when={ticket.data}>
        {(t) => (
          <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div class="rounded-xl border border-stroke bg-white p-6">
              <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{t().ticket_no}</p>
                  <Show
                    when={editing()}
                    fallback={<h1 class="text-xl font-semibold text-text-primary">{t().subject}</h1>}
                  >
                    <Field label="Subject">
                      <input
                        class={inputClass}
                        value={editSubject()}
                        disabled={saving()}
                        onInput={(e) => setEditSubject(e.currentTarget.value)}
                      />
                    </Field>
                  </Show>
                  <p class="mt-1 text-sm text-text-secondary">
                    <Show when={t().partner_name} fallback={<span>No customer linked</span>}>
                      {t().partner_name}
                    </Show>
                    {" · "}opened {t().ticket_date}
                    <Show when={t().created_by_name}> by {t().created_by_name}</Show>
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Show when={canEditDetails() && !editing()}>
                    <button
                      type="button"
                      class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
                      onClick={startEdit}
                    >
                      Edit
                    </button>
                  </Show>
                  <Show when={editing()}>
                    <button
                      type="button"
                      class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
                      disabled={saving()}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      disabled={saving()}
                      onClick={() => void saveEdit()}
                    >
                      Save
                    </button>
                  </Show>
                  <Show when={t().warranty_asset_id}>
                    <A
                      href={`/app/after-sales/warranty?q=${encodeURIComponent(t().ticket_no)}`}
                      class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      View warranty coverage
                    </A>
                  </Show>
                </div>
              </div>

              <Show when={editing()}>
                <div class="mb-6">
                  <Field label="Description">
                    <textarea
                      class={inputClass}
                      rows={5}
                      value={editDescription()}
                      disabled={saving()}
                      onInput={(e) => setEditDescription(e.currentTarget.value)}
                    />
                  </Field>
                </div>
              </Show>
              <Show when={!editing() && t().description}>
                <div class="mb-6 rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap">{t().description}</div>
              </Show>
              <Show when={!editing() && !t().description}>
                <p class="mb-6 text-sm text-text-secondary">No description.</p>
              </Show>

              <Show when={t().repair_order_id}>
                <p class="mb-4 text-sm">
                  <span class="text-text-secondary">Repair order:</span>{" "}
                  <A href="/app/after-sales/repair-orders" class="text-brand-600 hover:underline">
                    #{t().repair_order_id}
                  </A>
                </p>
              </Show>

              <div class="mb-6">
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-sm font-semibold uppercase tracking-wide text-text-secondary">Attachments</h2>
                  <span class="text-xs text-text-secondary">
                    {formatTicketFileSize(attachmentBytesUsed())} / 25 MB
                  </span>
                </div>
                <p class="mb-2 text-xs text-text-secondary">
                  Images, documents, and short videos. Combined size must stay under 25 MB.
                </p>
                <Show when={canInteract()}>
                  <label class="inline-block cursor-pointer rounded border border-stroke bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
                    {uploading() ? "Uploading…" : "Upload file"}
                    <input
                      type="file"
                      class="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                      disabled={uploading()}
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        const id = ticketId();
                        if (!file || !id) return;
                        setUploading(true);
                        void uploadSupportTicketAttachment(id, file).then((res) => {
                          setUploading(false);
                          if (!res.success) {
                            toast.warning(res.message ?? "Upload failed.");
                            return;
                          }
                          void loadAttachments(id);
                        });
                      }}
                    />
                  </label>
                </Show>
                <Show when={attachments().length > 0} fallback={<p class="mt-2 text-sm text-text-secondary">No attachments yet.</p>}>
                  <ul class="mt-3 space-y-1 text-sm">
                    <For each={attachments()}>
                      {(a) => (
                        <li class="flex flex-wrap items-center justify-between gap-2 rounded border border-stroke/60 px-3 py-2">
                          <span class="text-text-primary">
                            {a.file_name}{" "}
                            <span class="text-xs text-text-secondary">({formatTicketFileSize(a.size_bytes)})</span>
                          </span>
                          <span class="flex items-center gap-3">
                            <Show when={canPreviewSupportTicketAttachment(a)}>
                              <button
                                type="button"
                                class="text-xs font-medium text-brand-600 hover:underline"
                                onClick={() =>
                                  void previewSupportTicketAttachment(ticketId()!, a).then((ok) => {
                                    if (!ok) toast.warning("Could not open the file. It may have been removed from storage.");
                                  })
                                }
                              >
                                Preview
                              </button>
                            </Show>
                            <button
                              type="button"
                              class="text-xs font-medium text-brand-600 hover:underline"
                              onClick={() =>
                                void downloadSupportTicketAttachment(ticketId()!, a).then((ok) => {
                                  if (!ok) toast.warning("Download failed. The file may have been removed from storage.");
                                })
                              }
                            >
                              Download
                            </button>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>

              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Comments</h2>
              <div class="space-y-3">
                <For each={t().comments ?? []}>
                  {(c) => (
                    <div class="rounded-lg border border-stroke p-3">
                      <p class="text-xs text-text-secondary">
                        {c.author_name} · {c.created_at}
                      </p>
                      <Show
                        when={looksLikeHtml(c.body)}
                        fallback={<p class="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>}
                      >
                        <TicketCommentHtml ticketId={ticketId()!} html={c.body} />
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={(t().comments ?? []).length === 0}>
                  <p class="text-sm text-text-secondary">No comments yet.</p>
                </Show>
              </div>
              <style>{`
                .ticket-comment-body p { margin: 0 0 0.75em; }
                .ticket-comment-body ul, .ticket-comment-body ol { margin: 0 0 0.75em; padding-left: 1.25rem; }
                .ticket-comment-body li { margin: 0.15em 0; }
                .ticket-comment-body p:last-child { margin-bottom: 0; }
                .ticket-comment-body a { color: var(--color-brand-600, #2563eb); text-decoration: underline; }
                .ticket-comment-body img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; display: block; }
              `}</style>

              <Show when={canInteract()}>
                <div class="mt-4">
                  <RichTextEditor
                    value={comment()}
                    onChange={setComment}
                    onPasteImage={handlePasteImage}
                    placeholder="Add a comment… (paste a screenshot to attach)"
                    minHeightClass="min-h-[100px]"
                  />
                  <Show when={pastingImage()}>
                    <p class="mt-1 text-xs text-text-secondary">Uploading screenshot…</p>
                  </Show>
                  <button
                    type="button"
                    class="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={saving() || pastingImage() || isEmptyHtml(comment())}
                    onClick={() => void postComment()}
                  >
                    Post comment
                  </button>
                </div>
              </Show>
            </div>

            <aside class="space-y-4 rounded-xl border border-stroke bg-white p-4">
              <Field label="Status">
                <select
                  class={inputClass}
                  value={t().status}
                  disabled={!canManage() || saving()}
                  onChange={(e) => void updateField({ status: e.currentTarget.value as TicketStatus })}
                >
                  <For each={STATUS_OPTIONS}>
                    {(s) => (
                      <option value={s} selected={s === t().status}>
                        {s.replace("_", " ")}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <Field label="Priority">
                <select
                  class={inputClass}
                  value={t().priority}
                  disabled={!canManage() || saving()}
                  onChange={(e) => void updateField({ priority: e.currentTarget.value as TicketPriority })}
                >
                  <For each={PRIORITY_OPTIONS}>
                    {(p) => (
                      <option value={p} selected={p === t().priority}>
                        {p}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <Field label="Category">
                <input
                  class={inputClass}
                  value={t().category}
                  disabled={!canManage() || saving()}
                  onChange={(e) => void updateField({ category: e.currentTarget.value })}
                />
              </Field>
              <Show when={canManage()}>
                <LookupCombo
                  label="Warranty asset"
                  value={() => warrantyLabel() || (t().warranty_asset_id ? "Linked asset" : "")}
                  selectedId={() => t().warranty_asset_id ?? null}
                  onInput={setWarrantyLabel}
                  onSelect={(o) => {
                    setWarrantyLabel(o.label);
                    void updateField({ warranty_asset_id: o.id });
                  }}
                  onClear={() => {
                    setWarrantyLabel("");
                    void updateField({ warranty_asset_id: null });
                  }}
                  fetchOptions={(q) => fetchWarrantyAssets(q, t().partner_id ?? null)}
                />
              </Show>
              <Show when={canManage()}>
                <LookupCombo
                  label="Assigned to"
                  value={() => assigneeLabel() || t().assigned_name || ""}
                  selectedId={() => t().assigned_user_id ?? null}
                  onInput={setAssigneeLabel}
                  onSelect={(o) => {
                    setAssigneeLabel(o.label);
                    void updateField({ assigned_user_id: o.id });
                  }}
                  onClear={() => {
                    setAssigneeLabel("");
                    void updateField({ assigned_user_id: null });
                  }}
                  fetchOptions={fetchSupportUsers}
                />
              </Show>
              <Show when={canManage()}>
                <LookupCombo
                  label="Repair order"
                  value={() => repairOrderLabel() || (t().repair_order_id ? `RO #${t().repair_order_id}` : "")}
                  selectedId={() => t().repair_order_id ?? null}
                  onInput={setRepairOrderLabel}
                  onSelect={(o) => {
                    setRepairOrderLabel(o.label);
                    void updateField({ repair_order_id: o.id });
                  }}
                  onClear={() => {
                    setRepairOrderLabel("");
                    void updateField({ repair_order_id: null });
                  }}
                  fetchOptions={(q) => fetchRepairOrders(q, t().partner_id ?? null)}
                />
              </Show>
              <div class="text-sm text-text-secondary">
                <Show when={!canManage() && t().assigned_name}>
                  <p>
                    <span class="font-medium text-text-primary">Assigned:</span> {t().assigned_name}
                  </p>
                </Show>
                <Show when={t().resolved_at}>
                  <p class="mt-2">
                    <span class="font-medium text-text-primary">Resolved:</span> {t().resolved_at}
                  </p>
                </Show>
              </div>
            </aside>
          </div>
        )}
      </Show>
    </SupportLayout>
  );
}
