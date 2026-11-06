import { A } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { useAuth } from "../../shared/auth-context";
import { HR_ENTITY } from "../../shared/entityTypes";
import { useToast } from "../../shared/toast";
import { HrNotice, HrTcard } from "./HrUi";

type PublicLinks = {
  company_code: string;
  public_careers_slug: string;
  apply_path: string;
  careers_path: string;
};

export default function ApplicantsSettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const code = () => (auth.me?.tenant?.company_code ?? "").trim();
  const [slugDraft, setSlugDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const [links, { refetch }] = createResource(async () => {
    const res = await apiFetch<PublicLinks>("/api/v1/hr/public-links");
    if (!res.ok || !res.data) throw new Error(res.message ?? "Could not load public links.");
    setSlugDraft(res.data.public_careers_slug ?? "");
    return res.data;
  });

  const publicSegment = () => {
    const slug = (links()?.public_careers_slug || slugDraft()).trim();
    return slug || code() || "company-name";
  };

  const saveSlug = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<PublicLinks>("/api/v1/hr/public-links", {
        method: "PUT",
        body: JSON.stringify({ public_careers_slug: slugDraft().trim() }),
      });
      if (!res.ok || !res.data) {
        toast.error(res.message ?? "Could not save public URL.");
        return;
      }
      setSlugDraft(res.data.public_careers_slug ?? "");
      toast.success(res.message ?? "Public URL saved.");
      void refetch();
      void auth.refresh({ background: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-4">
      <HrTcard>
        <div class="space-y-3 p-4">
          <div>
            <h2 class="text-sm font-semibold text-text-primary">Public careers &amp; apply URL</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Set a short public path used by both{" "}
              <code class="text-xs">/careers/…</code> and <code class="text-xs">/apply/…</code>. Your
              company code (<code class="text-xs">{code() || "—"}</code>) still works if you leave this
              blank.
            </p>
          </div>
          <label class="block max-w-md">
            <span class="mb-1 block text-sm font-medium text-text-primary">Custom path</span>
            <div class="flex flex-wrap items-stretch gap-2">
              <span class="inline-flex items-center rounded-lg border border-stroke bg-panel px-2 text-xs text-text-secondary">
                /apply/
              </span>
              <input
                class="erp-input min-w-[12rem] flex-1 rounded-lg border px-3 py-2 text-sm"
                placeholder="jf-hardware"
                value={slugDraft()}
                onInput={(e) => setSlugDraft(e.currentTarget.value)}
                disabled={links.loading || saving()}
                spellcheck={false}
                autocomplete="off"
              />
              <button
                type="button"
                class="hr-btn hr-btn-primary"
                disabled={links.loading || saving()}
                onClick={() => void saveSlug()}
              >
                {saving() ? "Saving…" : "Save"}
              </button>
            </div>
            <p class="mt-1 text-xs text-text-secondary">
              Lowercase letters, numbers, and hyphens only · 2–80 characters.
            </p>
          </label>
          <Show when={links.error}>
            <p class="text-sm text-red-600">{(links.error as Error).message}</p>
          </Show>
          <div class="flex flex-wrap gap-3 text-sm">
            <A
              class="font-medium text-brand-700 hover:underline"
              href={`/apply/${encodeURIComponent(publicSegment())}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open /apply/{publicSegment()} ↗
            </A>
            <A
              class="font-medium text-brand-700 hover:underline"
              href={`/careers/${encodeURIComponent(publicSegment())}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open /careers/{publicSegment()} ↗
            </A>
            <Show when={code() && publicSegment() !== code()}>
              <A
                class="text-text-secondary hover:underline"
                href={`/apply/${encodeURIComponent(code())}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Legacy /apply/{code()} ↗
              </A>
            </Show>
          </div>
        </div>
      </HrTcard>

      <HrNotice>
        Visible labels, required flags, and custom fields below drive the public application form.
      </HrNotice>
      <EntityFormSettingsPage
        entityType={HR_ENTITY.application}
        featureLabel="Applicants"
        listHref="/app/hr/applicants"
      />
    </div>
  );
}
