/** Public article chrome — not stored in cms_pages.body. */

export const CMS_FACEBOOK_PAGE = "https://www.facebook.com/BluearmERPGlobal/";
export const CMS_FACEBOOK_PAGE_HOST = "facebook.com/BluearmERPGlobal";
export const CMS_SITE_NAME_DEFAULT = "Bluearm";
export const CMS_DEFAULT_LANG = "tl";

export const CMS_FACEBOOK_FOOTER_PLAIN =
  "Like and follow our page https://www.facebook.com/BluearmERPGlobal/ and share our contents.";

export const CMS_TOPIC_ALLOWLIST = [
  "blog",
  "bodega-at-stock",
  "benta-at-koleksyon",
  "quotation-at-follow-up",
  "pagbili-at-supplier",
  "serial-at-warranty",
  "vat-at-resibo",
  "books-at-pagsara",
  "after-sales",
  "tindahan-pos",
  "withholding-at-2307",
] as const;

const FACEBOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`;

export function facebookShareUrl(canonicalUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}`;
}

export function articleFooterHtml(canonicalUrl: string): string {
  const share = facebookShareUrl(canonicalUrl);
  return `<footer class="cms-follow" aria-label="Follow Bluearm on Facebook">
  <p>
    <a class="cms-follow-page" href="${CMS_FACEBOOK_PAGE}" rel="noopener noreferrer" target="_blank">${FACEBOOK_SVG}<span>Like and follow our page</span></a>
    <a class="cms-follow-url" href="${CMS_FACEBOOK_PAGE}" rel="noopener noreferrer" target="_blank">${CMS_FACEBOOK_PAGE}</a>
    and
    <a class="cms-follow-share" href="${share}" rel="noopener noreferrer" target="_blank">share our contents</a>.
  </p>
</footer>`;
}

export function articleFooterMarkdown(): string {
  return CMS_FACEBOOK_FOOTER_PLAIN;
}

export function bodyHasFacebookChrome(body: string): boolean {
  return (body || "").toLowerCase().includes(CMS_FACEBOOK_PAGE_HOST.toLowerCase());
}
