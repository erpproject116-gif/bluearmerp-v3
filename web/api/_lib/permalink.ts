export const CMS_ARTICLES_PREFIX = "/articles";
export const DEFAULT_CMS_TOPIC = "blog";

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCmsSlug(raw: string): string {
  const s = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
  return s;
}

export function validCmsSlug(s: string): boolean {
  return s.length > 0 && s.length <= 120 && slugRe.test(s);
}

export function cmsTopicOrDefault(topic: string | null | undefined): string {
  const t = normalizeCmsSlug(topic || "");
  return validCmsSlug(t) ? t : DEFAULT_CMS_TOPIC;
}

export function cmsArticlePath(topic: string | null | undefined, slug: string | null | undefined): string {
  return `${CMS_ARTICLES_PREFIX}/${cmsTopicOrDefault(topic)}/${normalizeCmsSlug(slug || "") || "page"}`;
}

export function cmsTopicPath(topic: string | null | undefined): string {
  return `${CMS_ARTICLES_PREFIX}/${cmsTopicOrDefault(topic)}`;
}
