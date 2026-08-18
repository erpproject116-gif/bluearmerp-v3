import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal } from "solid-js";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
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
  const [slug, setSlug] = createSignal("");
  const [body, setBody] = createSignal("");
  const [seoTitle, setSeoTitle] = createSignal("");
  const [seoDesc, setSeoDesc] = createSignal("");
  const [featuredId, setFeaturedId] = createSignal<number | null>(null);

  createEffect(() => {
    const d = doc.data;
    if (!d) return;
    setTitle(d.title);
    setSlug(d.slug);
    setBody(d.body ?? "");
    setSeoTitle(d.seo_title ?? "");
    setSeoDesc(d.seo_description ?? "");
    setFeaturedId(d.featured_media_id ?? null);
    loadCustom(d.custom_values ?? {});
  });

  const save = async () => {
    const pageId = id();
    if (pageId == null) return;
    const err =
      requireFields({ title: title(), slug: slug() }, buildRequiredChecks(fields()).filter((c) => c.key === "title" || c.key === "slug")) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (err) {
      toast.warning(err);
      return;
    }
    try {
      await mutations.patchPage.mutateAsync({
        id: pageId,
        body: {
          title: title().trim(),
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
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const insertMedia = async (file: File) => {
    const res = await uploadCmsMedia(file, file.name);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Upload failed.");
      return;
    }
    setBody((b) => insertCmsMediaToken(b, res.data!.id, res.data!.alt_text || res.data!.file_name));
    toast.success("Image inserted.");
    void media.refetch();
  };

  const applyPastedArticle = (meta: CmsArticlePaste) => {
    if (meta.title) setTitle(meta.title);
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
              <Show when={d().status === "published"}>
                {" "}
                · <A class="text-brand-600 hover:underline" href={`/app/cms/p/${d().slug}`}>Open published</A>
              </Show>
            </p>
            <ModalField settings={byKey} fieldKey="title" fallbackLabel="Title" fallbackRequired>
              {(m) => (
                <input class={`${inputClass} text-lg font-semibold`} value={title()} disabled={m.disabled || !canWrite()} onInput={(e) => setTitle(e.currentTarget.value)} />
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
              <Field label="Insert image from file">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void insertMedia(f);
                  }}
                />
                <p class="mt-1 text-xs text-text-secondary">PNG, JPEG, GIF, WebP, or PDF. Max 25 MB. Shown as an image chip in Visual; stored as markdown.</p>
              </Field>
              <CustomFieldsSection entityType={CMS_ENTITY.page} values={customValues} onChange={setCustom} />
              <div class="flex flex-wrap gap-2">
                <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" disabled={mutations.patchPage.isPending} onClick={() => void save()}>
                  Save
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
                  disabled={mutations.publishPage.isPending}
                  onClick={() => void mutations.publishPage.mutateAsync(d().id).then(() => toast.success("Published.")).catch((e) => toast.warning(e instanceof Error ? e.message : "Publish failed."))}
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
