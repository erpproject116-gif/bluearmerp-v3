import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { CMS_ENTITY } from "../../shared/entityTypes";
import { useCmsMedia, useCmsMutations, useCmsPage } from "../../shared/useCms";
import { uploadCmsMedia } from "../../shared/cmsMedia";
import { insertCmsMediaToken } from "./CmsMarkdown";
import { CmsBodyEditor } from "./CmsBodyEditor";
import { formatFileSize } from "../../shared/attachments";
import type { CmsArticlePaste } from "./cmsMarkdownCodec";
import { cmsArticlePath, cmsTopicOrDefault, DEFAULT_CMS_TOPIC } from "./cmsPermalink";

export default function CmsPageEditorPage() {
  const params = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "cms.pages_write", "write");
  const id = () => {
    const n = Number(params.id);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const doc = useCmsPage(id);
  const media = useCmsMedia(() => ({ page: 1, pageSize: 50 }));
  const mutations = useCmsMutations();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(CMS_ENTITY.page);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const [title, setTitle] = createSignal("");
  const [topic, setTopic] = createSignal(DEFAULT_CMS_TOPIC);
  const [slug, setSlug] = createSignal("");
  const [body, setBody] = createSignal("");
  const [seoTitle, setSeoTitle] = createSignal("");
  const [seoDesc, setSeoDesc] = createSignal("");
  const [featuredId, setFeaturedId] = createSignal<number | null>(null);
  const [uploading, setUploading] = createSignal(false);

  createEffect(() => {
    const d = doc.data;
    if (!d) return;
    setTitle(d.title);
    setTopic(cmsTopicOrDefault(d.topic));
    setSlug(d.slug);
    setBody(d.body ?? "");
    setSeoTitle(d.seo_title ?? "");
    setSeoDesc(d.seo_description ?? "");
    setFeaturedId(d.featured_media_id ?? null);
    loadCustom(d.custom_values ?? {});
  });

  const permalink = () => cmsArticlePath(topic(), slug());

  const save = async () => {
    const pageId = id();
    if (pageId == null) return false;
    const err =
      requireFields({ title: title(), slug: slug() }, buildRequiredChecks(fields()).filter((c) => c.key === "title" || c.key === "slug")) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (err) {
      toast.warning(err);
      return false;
    }
    try {
      await mutations.patchPage.mutateAsync({
        id: pageId,
        body: {
          title: title().trim(),
          topic: topic().trim() || DEFAULT_CMS_TOPIC,
          slug: slug().trim(),
          body: body(),
          seo_title: seoTitle().trim() || null,
          seo_description: seoDesc().trim() || null,
          featured_media_id: featuredId(),
          leave_redirect: true,
          custom_values: customValues(),
        },
      });
      toast.success("Saved.");
      return true;
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Save failed.");
      return false;
    }
  };

  const publish = async () => {
    const pageId = id();
    if (pageId == null) return;
    if (!body().trim()) {
      toast.warning("Write or paste the article body, then Save and Publish. The published page was showing only the title because the body was empty.");
      return;
    }
    const ok = await save();
    if (!ok) return;
    try {
      await mutations.publishPage.mutateAsync(pageId);
      toast.success("Published.");
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Publish failed.");
    }
  };

  const insertMedia = async (file: File) => {
    setUploading(true);
    const res = await uploadCmsMedia(file, file.name);
    setUploading(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Upload failed.");
      return;
    }
    setBody((b) => insertCmsMediaToken(b, res.data!.id, res.data!.alt_text || res.data!.file_name));
    if (featuredId() == null) setFeaturedId(res.data.id);
    toast.success("Image inserted.");
    void media.refetch();
  };

  const applyPastedArticle = (meta: CmsArticlePaste) => {
    if (meta.title) setTitle(meta.title);
    if (meta.topic) setTopic(meta.topic);
    if (meta.slug) setSlug(meta.slug);
    if (meta.seoTitle) setSeoTitle(meta.seoTitle);
    if (meta.seoDescription) setSeoDesc(meta.seoDescription);
  };

  return (
    <div>
      <A href="/app/cms" class="text-sm text-brand-600 hover:underline">← Pages</A>
      <Show when={doc.isError}>
        <p class="mt-3 text-sm text-red-600">{(doc.error as Error)?.message}</p>
      </Show>
      <Show when={doc.data}>
        {(d) => (
          <div class="mt-3 space-y-3">
            <p class="text-sm text-text-secondary">
              Status: {d().status}
              <Show when={slug() && d().status === "published"}>
                {" "}
                ·{" "}
                <a
                  class="text-brand-600 hover:underline"
                  href={permalink()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open published (new tab)
                </a>
              </Show>
            </p>
            <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 font-mono text-xs text-text-secondary">
              Permalink: <span class="text-text-primary">{permalink()}</span>
            </p>
            <ModalField settings={byKey} fieldKey="title" fallbackLabel="Title" fallbackRequired>
              {(m) => (
                <input class={`${inputClass} text-lg font-semibold`} value={title()} disabled={m.disabled || !canWrite()} onInput={(e) => setTitle(e.currentTarget.value)} />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="topic" fallbackLabel="Topic cluster">
              {(m) => (
                <input
                  class={inputClass}
                  placeholder={DEFAULT_CMS_TOPIC}
                  value={topic()}
                  disabled={m.disabled || !canWrite()}
                  onInput={(e) => setTopic(e.currentTarget.value)}
                />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="slug" fallbackLabel="Slug" fallbackRequired>
              {(m) => (
                <input class={inputClass} value={slug()} disabled={m.disabled || !canWrite()} onInput={(e) => setSlug(e.currentTarget.value)} />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="seo_title" fallbackLabel="SEO title">
              {(m) => (
                <input class={inputClass} placeholder="Browser tab title (optional)" value={seoTitle()} disabled={m.disabled || !canWrite()} onInput={(e) => setSeoTitle(e.currentTarget.value)} />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="seo_description" fallbackLabel="SEO description">
              {(m) => (
                <textarea class={inputClass} rows={2} maxlength={320} value={seoDesc()} disabled={m.disabled || !canWrite()} onInput={(e) => setSeoDesc(e.currentTarget.value)} />
              )}
            </ModalField>
            <div class="flex flex-wrap items-end gap-3">
              <div class="min-w-[14rem] flex-1">
                <ModalField settings={byKey} fieldKey="featured_media_id" fallbackLabel="Featured image">
                  {(m) => (
                    <select
                      class={inputClass}
                      disabled={m.disabled || !canWrite()}
                      value={featuredId() ?? ""}
                      onChange={(e) => setFeaturedId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
                    >
                      <option value="">None</option>
                      <For each={media.data?.rows ?? []}>
                        {(row) => (
                          <option value={row.id}>{row.file_name}</option>
                        )}
                      </For>
                    </select>
                  )}
                </ModalField>
              </div>
              <Show when={canWrite()}>
                <div class="shrink-0">
                  <span class="mb-1 block text-sm font-medium" style={{ color: "var(--color-label, var(--color-text-primary))" }}>
                    Insert image
                  </span>
                  <label
                    class={`inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-stroke bg-white px-3 text-sm font-medium text-text-primary shadow-sm hover:bg-slate-50 ${uploading() ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <svg class="h-4 w-4 shrink-0 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    {uploading() ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      class="sr-only"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                      disabled={uploading()}
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (f) void insertMedia(f);
                      }}
                    />
                  </label>
                </div>
              </Show>
            </div>
            <p class="text-xs text-text-secondary">PNG, JPEG, GIF, WebP, or PDF. Max 25 MB. Upload inserts into the body and the featured-image list.</p>
            <ModalField settings={byKey} fieldKey="body" fallbackLabel="Body">
              {() => (
                <CmsBodyEditor
                  markdown={body()}
                  onMarkdown={setBody}
                  onPasteArticle={applyPastedArticle}
                  disabled={!canWrite()}
                />
              )}
            </ModalField>
            <Show when={canWrite()}>
              <CustomFieldsSection entityType={CMS_ENTITY.page} values={customValues} onChange={setCustom} />
              <div class="flex flex-wrap gap-2">
                <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" disabled={mutations.patchPage.isPending} onClick={() => void save()}>
                  Save
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
                  disabled={mutations.publishPage.isPending || mutations.patchPage.isPending}
                  onClick={() => void publish()}
                >
                  Publish
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm"
                  disabled={mutations.archivePage.isPending}
                  onClick={() => void mutations.archivePage.mutateAsync(d().id).then(() => { toast.success("Archived."); nav("/app/cms"); }).catch((e) => toast.warning(e instanceof Error ? e.message : "Archive failed."))}
                >
                  Archive
                </button>
              </div>
            </Show>
            <Show when={canWrite() && media.data?.rows?.length}>
              <p class="text-xs text-text-secondary">
                Recent files: <For each={(media.data?.rows ?? []).slice(0, 6)}>{(row) => <span>{row.file_name} ({formatFileSize(row.size_bytes)}) · </span>}</For>
              </p>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
